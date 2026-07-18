import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { askAI, generateAIText } from "../service";

type AdminClient = ReturnType<typeof createAdminClient>;

type QueryToolName = "lead_stats" | "ad_performance" | "branch_balance" | "pending_approvals" | "attendance_today" | "pending_leave" | "markom_checklist";

const QUERY_TOOL_CATALOG: { name: QueryToolName; description: string }[] = [
  { name: "lead_stats", description: "Statistik lead/prospek CRM 7 hari terakhir: jumlah baru, rincian per status" },
  { name: "ad_performance", description: "Performa campaign iklan Meta Ads yang sedang aktif: spend, klik, jumlah chat WA masuk, biaya per chat" },
  { name: "branch_balance", description: "Saldo kas per cabang (data finance, disinkron dari sistem keuangan)" },
  { name: "pending_approvals", description: "Jumlah pengajuan pengeluaran yang masih menunggu verifikasi Kepala Cabang" },
  { name: "attendance_today", description: "Status absensi karyawan hari ini: siapa yang sudah/belum check-in" },
  { name: "pending_leave", description: "Pengajuan cuti/izin karyawan yang masih menunggu persetujuan" },
  { name: "markom_checklist", description: "Jumlah tugas/checklist tim Markom yang masih belum selesai" },
];

interface DataQueryIntent {
  isDataQuestion: boolean;
  tools: QueryToolName[];
  branchName: string | null;
}

function parseIntentJson(text: string): DataQueryIntent {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as { isDataQuestion?: boolean; tools?: string[]; branchName?: string };
  return {
    isDataQuestion: parsed.isDataQuestion === true,
    tools: Array.isArray(parsed.tools) ? parsed.tools.filter((t): t is QueryToolName => QUERY_TOOL_CATALOG.some((c) => c.name === t)) : [],
    branchName: typeof parsed.branchName === "string" && parsed.branchName.trim() ? parsed.branchName.trim() : null,
  };
}

/**
 * One Gemini call decides whether a question needs real system data to
 * answer accurately (vs a general/opinion/how-to question the existing
 * domain prompts already handle fine) and which read-only query tool(s)
 * apply. Mirrors message-relay.ts's extractRelayIntent pattern: a small,
 * cheap classification call before doing any real work.
 */
async function extractDataQueryIntent(question: string): Promise<DataQueryIntent> {
  const catalogText = QUERY_TOOL_CATALOG.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const prompt = `Pertanyaan dari karyawan lewat WhatsApp: "${question}"

Data yang tersedia di sistem (masing-masing berupa "tool" terpisah):
${catalogText}

Tentukan apakah pertanyaan ini BUTUH data nyata dari sistem untuk dijawab akurat (bukan pertanyaan umum, opini, cara kerja, atau permintaan dibuatkan sesuatu). Kalau ya, sebutkan tool mana yang relevan (boleh lebih dari satu kalau pertanyaannya menggabungkan beberapa topik), dan apakah pertanyaan menyebut nama cabang tertentu (mis. "Jogja", "Kendari", "Makassar", "Jabodetabek") -- kalau tidak disebut, branchName null (berarti pakai cabang milik penanya sendiri kalau relevan, atau semua cabang untuk data yang tidak per-cabang).

Balas HANYA dengan JSON (tanpa markdown code fence): {"isDataQuestion": true/false, "tools": ["nama_tool", ...], "branchName": "nama cabang apa adanya atau null"}`;

  try {
    const response = await generateAIText({
      systemPrompt: "Kamu adalah pengklasifikasi intent pesan WhatsApp internal perusahaan. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
      userPrompt: prompt,
      maxOutputTokens: 512,
      maxAttempts: 1,
    });
    return parseIntentJson(response.text);
  } catch {
    return { isDataQuestion: false, tools: [], branchName: null };
  }
}

function formatIdr(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

async function runLeadStats(supabase: AdminClient, branchId: string | null): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let query = supabase.from("prospects").select("status").is("deleted_at", null).gte("created_at", sevenDaysAgo);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) return `(Gagal mengambil data lead: ${error.message})`;

  const byStatus = new Map<string, number>();
  for (const row of data ?? []) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
  const statusLines = [...byStatus.entries()].map(([status, count]) => `${status}: ${count}`).join(", ") || "tidak ada lead baru";

  return `[Lead/Prospek CRM] 7 hari terakhir${branchId ? " (cabang ini)" : " (semua cabang)"}: total ${data?.length ?? 0} lead baru. Rincian status: ${statusLines}.`;
}

async function runAdPerformance(supabase: AdminClient): Promise<string> {
  const { data, error } = await supabase.from("meta_ad_campaigns").select("name, spend_idr, clicks, conversations_started").eq("status", "active");
  if (error) return `(Gagal mengambil data iklan: ${error.message})`;
  if (!data || data.length === 0) return "[Performa Iklan] Tidak ada campaign iklan yang sedang aktif saat ini.";

  const lines = data.map((c) => {
    const spend = c.spend_idr ?? 0;
    const clicks = c.clicks ?? 0;
    const conversations = c.conversations_started ?? 0;
    const costPerConv = conversations > 0 ? formatIdr(spend / conversations) : "belum ada chat";
    return `${c.name}: spend ${formatIdr(spend)}, klik ${clicks}, chat WA masuk ${conversations}, biaya per chat ${costPerConv}`;
  });
  return `[Performa Iklan Aktif]\n${lines.join("\n")}`;
}

async function runBranchBalance(supabase: AdminClient, branchName: string | null): Promise<string> {
  let query = supabase.from("finance_branch_balances").select("branch_name, saldo, synced_at");
  if (branchName) query = query.ilike("branch_name", `%${branchName}%`);
  const { data, error } = await query;
  if (error) return `(Gagal mengambil data saldo cabang: ${error.message})`;
  if (!data || data.length === 0) return "[Saldo Cabang] Data tidak ditemukan.";

  const lines = data.map((b) => `${b.branch_name}: ${formatIdr(Number(b.saldo))} (update terakhir ${new Date(b.synced_at).toLocaleString("id-ID")})`);
  return `[Saldo Kas per Cabang]\n${lines.join("\n")}`;
}

async function runPendingApprovals(supabase: AdminClient): Promise<string> {
  const { count, error } = await supabase
    .from("mkc_notifications")
    .select("id", { count: "exact", head: true })
    .eq("category", "finance_expense_pending_verification")
    .eq("is_read", false);
  if (error) return `(Gagal mengambil data pengajuan pending: ${error.message})`;
  return `[Pengajuan Pending] Ada ${count ?? 0} pengajuan pengeluaran yang masih menunggu verifikasi Kepala Cabang.`;
}

async function runAttendanceToday(supabase: AdminClient, branchId: string | null): Promise<string> {
  let query = supabase.from("v_attendance_today").select("full_name, branch_id, check_in_time");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) return `(Gagal mengambil data absensi: ${error.message})`;
  if (!data) return "[Absensi Hari Ini] Data tidak tersedia.";

  const checkedIn = data.filter((r) => r.check_in_time).length;
  const notCheckedIn = data.filter((r) => !r.check_in_time).map((r) => r.full_name);
  const notCheckedInText = notCheckedIn.length > 0 ? ` Belum check-in: ${notCheckedIn.slice(0, 10).join(", ")}${notCheckedIn.length > 10 ? ", dan lainnya" : ""}.` : "";
  return `[Absensi Hari Ini]${branchId ? " (cabang ini)" : ""}: ${checkedIn}/${data.length} karyawan sudah check-in.${notCheckedInText}`;
}

async function runPendingLeave(supabase: AdminClient): Promise<string> {
  const { data, error } = await supabase.from("leave_requests").select("type, start_date, end_date").eq("status", "pending").is("deleted_at", null);
  if (error) return `(Gagal mengambil data cuti: ${error.message})`;
  if (!data || data.length === 0) return "[Cuti/Izin Pending] Tidak ada pengajuan yang menunggu persetujuan.";
  const lines = data.map((d) => `${d.type} (${d.start_date} s/d ${d.end_date})`);
  return `[Cuti/Izin Pending] Ada ${data.length} pengajuan menunggu: ${lines.join("; ")}.`;
}

async function runMarkomChecklist(supabase: AdminClient, branchId: string | null): Promise<string> {
  let query = supabase.from("kpi_tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).neq("status", "completed");
  if (branchId) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  if (error) return `(Gagal mengambil data checklist Markom: ${error.message})`;
  return `[Checklist Markom] Ada ${count ?? 0} tugas yang belum selesai${branchId ? " di cabang ini" : " (semua cabang)"}.`;
}

async function runTool(supabase: AdminClient, tool: QueryToolName, branchId: string | null, branchName: string | null): Promise<string> {
  switch (tool) {
    case "lead_stats":
      return runLeadStats(supabase, branchId);
    case "ad_performance":
      return runAdPerformance(supabase);
    case "branch_balance":
      return runBranchBalance(supabase, branchName);
    case "pending_approvals":
      return runPendingApprovals(supabase);
    case "attendance_today":
      return runAttendanceToday(supabase, branchId);
    case "pending_leave":
      return runPendingLeave(supabase);
    case "markom_checklist":
      return runMarkomChecklist(supabase, branchId);
  }
}

export interface DataAnswerResult {
  /** False if the question didn't need real data -- caller should fall through to the normal domain chat prompt. */
  applicable: boolean;
  answer: string;
}

/**
 * Grounds the WhatsApp AI's answer in real data instead of letting Gemini
 * guess or hallucinate numbers when asked something like "berapa lead
 * minggu ini" or "saldo cabang Jogja berapa". Runs BEFORE the general
 * keyword-routed domain chat (router.ts) -- if the question doesn't need
 * data, applicable is false and the caller proceeds as before.
 *
 * Two Gemini calls when a data question is detected: one to classify
 * intent + pick which read-only query tool(s) apply (extractDataQueryIntent),
 * one to turn the real query results into a natural-language answer
 * (askAI below) -- the same "extract intent, then act" shape already used
 * by message-relay.ts, just reading instead of writing.
 */
export async function tryAnswerWithData(question: string, employee: { id: string; name: string } | null): Promise<DataAnswerResult> {
  const intent = await extractDataQueryIntent(question);
  if (!intent.isDataQuestion || intent.tools.length === 0) {
    return { applicable: false, answer: "" };
  }

  const supabase = createAdminClient();

  let branchId: string | null = null;
  if (intent.branchName) {
    const { data: branchRow } = await supabase.from("branches").select("id").ilike("name", `%${intent.branchName}%`).maybeSingle();
    branchId = branchRow?.id ?? null;
  } else if (employee) {
    const { data: empRow } = await supabase.from("employees").select("branch_id").eq("id", employee.id).maybeSingle();
    branchId = empRow?.branch_id ?? null;
  }

  const results = await Promise.all(intent.tools.map((tool) => runTool(supabase, tool, branchId, intent.branchName)));
  const dataContext = results.join("\n\n");

  const answer = await askAI(
    "Anda adalah MK Connect AI. Jawab pertanyaan karyawan berikut HANYA berdasarkan DATA NYATA yang diberikan di bawah -- jangan mengarang angka atau detail di luar data ini. Kalau datanya menunjukkan hasil kosong/nol, katakan itu apa adanya. Jawab singkat, jelas, dalam Bahasa Indonesia.",
    `Pertanyaan: ${question}\n\nData dari sistem:\n${dataContext}`,
    { maxAttempts: 1 },
  );

  return { applicable: true, answer };
}
