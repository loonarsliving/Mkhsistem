import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import type { TablesInsert } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The complete set of things FRIDAY is allowed to ask MKH System to do.
 *
 * This file is the boundary between "a language model reasoned about the
 * company" and "the company did something". Everything on the analysis side
 * of that boundary is text; everything on this side is a real WhatsApp message
 * to a real Kepala Cabang or a real row in ai_job_queue. So the rules here are
 * narrow on purpose:
 *
 *   1. FRIDAY selects a key. It never supplies SQL, a phone number, an
 *      employee id, or a job type. Those are resolved here, from names, at
 *      execution time — a model that hallucinates a branch produces a failed
 *      lookup with a clear message, not a message sent to the wrong person.
 *   2. Nothing in this catalog launches an ad, spends budget, publishes
 *      content, or messages a customer. Every entry either notifies someone
 *      internal or queues an existing analysis/draft job that a human reads
 *      before it goes anywhere. The riskiest thing FRIDAY can cause is an
 *      internal WhatsApp message that turns out not to be urgent.
 *   3. Execution only ever happens from an approved friday_actions row
 *      (features/friday/actions), never directly from the analysis pipeline.
 *
 * Adding an entry means: add it here, add the key to the check constraint on
 * friday_actions.action_key in a new migration, and let
 * tests/unit/lib/friday-action-catalog.test.ts confirm the two agree.
 */

export type FridayRiskTier = "low" | "medium" | "high";

export interface FridayActionContext {
  /** The employee who approved the action. Actions that create something owned by a person attribute it to them, never to "the system". */
  approverId: string;
  approverName: string;
}

export interface FridayActionDefinition {
  key: string;
  riskTier: FridayRiskTier;
  /** Shown to the model in the prompt (see prompt.ts) and to the human approving in the UI. */
  description: string;
  payloadHint: string;
  /** Human-readable label for the console. */
  label: string;
  execute: (supabase: AdminClient, payload: Record<string, unknown>, ctx: FridayActionContext) => Promise<string>;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = readString(payload, key);
  if (!value) throw new Error(`Payload aksi tidak lengkap: "${key}" wajib diisi`);
  return value;
}

/**
 * Name -> id, tolerant of the model writing "Jogja" where the row says
 * "Yogyakarta"-style variations, but never guessing: an ambiguous or missing
 * match throws rather than picking the first row, because the cost of acting
 * on the wrong branch is higher than the cost of a rejected action.
 */
async function resolveBranch(supabase: AdminClient, name: string): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase.from("branches").select("id, name").ilike("name", `%${name}%`).is("deleted_at", null);
  if (error) throw new Error(`Gagal mencari cabang "${name}": ${error.message}`);
  if (!data || data.length === 0) throw new Error(`Cabang "${name}" tidak ditemukan di sistem`);
  if (data.length > 1) throw new Error(`Nama cabang "${name}" cocok dengan ${data.length} cabang — terlalu ambigu untuk dieksekusi`);
  return { id: data[0].id, name: data[0].name };
}

async function branchHeadPhones(supabase: AdminClient, branchId: string): Promise<string[]> {
  const { data } = await supabase
    .from("employees")
    .select("phone, roles!inner(key)")
    .eq("branch_id", branchId)
    .eq("roles.key", "kepala_cabang")
    .eq("employment_status", "active")
    .is("deleted_at", null);
  return (data ?? []).map((row) => row.phone).filter((phone): phone is string => Boolean(phone));
}

async function leadershipPhones(supabase: AdminClient): Promise<string[]> {
  const { data } = await supabase
    .from("employees")
    .select("phone, roles!inner(key)")
    .in("roles.key", ["super_admin", "direktur_utama", "direktur_operasional"])
    .eq("employment_status", "active")
    .is("deleted_at", null);
  return (data ?? []).map((row) => row.phone).filter((phone): phone is string => Boolean(phone));
}

/** Constrained to the ai_job_queue job_type union, so a typo here is a build error rather than a row rejected by the check constraint at runtime. */
type AiJobType = TablesInsert<"ai_job_queue">["job_type"];

async function enqueueJob(supabase: AdminClient, jobType: AiJobType, payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase
    .from("ai_job_queue")
    .insert({ job_type: jobType, payload: payload as never })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Gagal mengantrikan job ${jobType}: ${error?.message ?? "tidak diketahui"}`);
  return data.id;
}

/**
 * Every message FRIDAY sends is stamped, so nobody on the receiving end has to
 * work out whether a person or the system decided this — and so the person who
 * approved it is answerable for it by name.
 */
function stamp(message: string, ctx: FridayActionContext): string {
  return `🤖 FRIDAY — Executive Intelligence\n\n${message}\n\n_Disetujui oleh ${ctx.approverName} melalui MK Connect._`;
}

async function sendToAll(phones: string[], message: string, audience: string): Promise<string> {
  if (phones.length === 0) throw new Error(`Tidak ada nomor WhatsApp aktif untuk ${audience}`);
  const failures: string[] = [];
  for (const phone of phones) {
    const result = await sendWhatsAppText(phone, message);
    if (!result.success) failures.push(`${phone} (${result.error ?? "gagal"})`);
  }
  if (failures.length === phones.length) throw new Error(`Semua pengiriman gagal: ${failures.join("; ")}`);
  const sent = phones.length - failures.length;
  return failures.length > 0
    ? `Terkirim ke ${sent}/${phones.length} nomor. Gagal: ${failures.join("; ")}`
    : `Terkirim ke ${sent} nomor ${audience}`;
}

export const FRIDAY_ACTIONS: readonly FridayActionDefinition[] = [
  {
    key: "notify_leadership_whatsapp",
    label: "Kirim ringkasan ke jajaran direksi (WhatsApp)",
    riskTier: "medium",
    description:
      "Kirim pesan WhatsApp ke Super Admin, Direktur Utama, dan Direktur Operasional. Pakai hanya untuk temuan yang benar-benar butuh perhatian pimpinan hari itu.",
    payloadHint: '{"message": "isi pesan, maksimal ~600 karakter, langsung ke poin"}',
    execute: async (supabase, payload, ctx) => {
      const message = requireString(payload, "message");
      return sendToAll(await leadershipPhones(supabase), stamp(message, ctx), "jajaran direksi");
    },
  },
  {
    key: "notify_branch_head_whatsapp",
    label: "Kirim arahan ke Kepala Cabang (WhatsApp)",
    riskTier: "medium",
    description: "Kirim pesan WhatsApp ke Kepala Cabang aktif di satu cabang tertentu.",
    payloadHint: '{"branch_name": "nama cabang", "message": "isi pesan, langsung ke poin"}',
    execute: async (supabase, payload, ctx) => {
      const branch = await resolveBranch(supabase, requireString(payload, "branch_name"));
      const message = requireString(payload, "message");
      return sendToAll(await branchHeadPhones(supabase, branch.id), stamp(message, ctx), `Kepala Cabang ${branch.name}`);
    },
  },
  {
    key: "enqueue_cashflow_action_plan",
    label: "Jalankan Action Plan kas cabang",
    riskTier: "low",
    description:
      "Jalankan Cashflow Teaching Engine untuk satu cabang — menghasilkan rencana tindakan kas dan mengirimkannya ke Kepala Cabang cabang tersebut. Pakai saat saldo kas cabang tertekan.",
    payloadHint: '{"branch_name": "nama cabang"}',
    execute: async (supabase, payload) => {
      const branch = await resolveBranch(supabase, requireString(payload, "branch_name"));
      const jobId = await enqueueJob(supabase, "cashflow_action_plan", { branch_id: branch.id, branch_name: branch.name });
      return `Action Plan kas untuk cabang ${branch.name} diantrikan (job ${jobId})`;
    },
  },
  {
    key: "enqueue_sales_coaching",
    label: "Jalankan coaching untuk seorang sales",
    riskTier: "low",
    description:
      "Jalankan CRM Sales Coaching untuk satu orang sales — menganalisa prospek mangkrak dan aktivitas follow-up-nya, lalu mengirim coaching personal. Pakai saat seorang sales tertinggal jauh.",
    payloadHint: '{"sales_name": "nama lengkap sales seperti tertulis di sistem"}',
    execute: async (supabase, payload) => {
      const name = requireString(payload, "sales_name");
      const { data, error } = await supabase.from("v_employee_directory").select("id, full_name").ilike("full_name", `%${name}%`).is("deleted_at", null);
      if (error) throw new Error(`Gagal mencari sales "${name}": ${error.message}`);
      if (!data || data.length === 0) throw new Error(`Karyawan "${name}" tidak ditemukan`);
      if (data.length > 1) throw new Error(`Nama "${name}" cocok dengan ${data.length} karyawan — terlalu ambigu untuk dieksekusi`);
      const jobId = await enqueueJob(supabase, "crm_sales_coaching", { sales_id: data[0].id });
      return `Coaching untuk ${data[0].full_name} diantrikan (job ${jobId})`;
    },
  },
  {
    key: "enqueue_markom_checklist_draft",
    label: "Buatkan checklist tim Markom",
    riskTier: "low",
    description: "Minta AI menyusun checklist kerja tim Markom untuk satu cabang. Hasilnya masuk sebagai tugas di modul Markom untuk dikerjakan tim.",
    payloadHint: '{"branch_name": "nama cabang", "focus": "leasehold_sales" atau kosongkan untuk default}',
    execute: async (supabase, payload) => {
      const branch = await resolveBranch(supabase, requireString(payload, "branch_name"));
      const { data: division, error } = await supabase.from("divisions").select("id").ilike("name", "%markom%").is("deleted_at", null).limit(1).maybeSingle();
      if (error) throw new Error(`Gagal mencari divisi Markom: ${error.message}`);
      if (!division) throw new Error("Divisi Markom tidak ditemukan di sistem");
      const focus = readString(payload, "focus");
      const jobId = await enqueueJob(supabase, "markom_checklist_draft", {
        branch_id: branch.id,
        branch_name: branch.name,
        division_id: division.id,
        ...(focus ? { focus } : {}),
      });
      return `Checklist Markom untuk cabang ${branch.name} diantrikan (job ${jobId})`;
    },
  },
  {
    key: "enqueue_meta_ads_research",
    label: "Riset & draft materi iklan untuk satu project",
    riskTier: "medium",
    description:
      "Minta AI meriset dan menyusun DRAFT materi iklan Meta untuk satu project properti. Ini hanya menghasilkan draft untuk ditinjau — tidak meluncurkan iklan dan tidak mengeluarkan biaya.",
    payloadHint: '{"project_name": "nama project seperti tertulis di Project Master"}',
    execute: async (supabase, payload) => {
      const name = requireString(payload, "project_name");
      const { data, error } = await supabase.from("crm_projects").select("id, name").ilike("name", `%${name}%`).is("deleted_at", null);
      if (error) throw new Error(`Gagal mencari project "${name}": ${error.message}`);
      if (!data || data.length === 0) throw new Error(`Project "${name}" tidak ditemukan`);
      if (data.length > 1) throw new Error(`Nama project "${name}" cocok dengan ${data.length} project — terlalu ambigu untuk dieksekusi`);
      const jobId = await enqueueJob(supabase, "meta_ads_research", { project_id: data[0].id });
      return `Draft materi iklan untuk project ${data[0].name} diantrikan (job ${jobId})`;
    },
  },
  {
    key: "enqueue_content_performance_broadcast",
    label: "Kirim laporan performa konten ke tim Markom",
    riskTier: "low",
    description: "Jalankan broadcast laporan performa konten sosial media ke tim Markom.",
    payloadHint: "{} (tidak butuh parameter)",
    execute: async (supabase) => {
      const jobId = await enqueueJob(supabase, "markom_content_performance_broadcast", {});
      return `Broadcast performa konten diantrikan (job ${jobId})`;
    },
  },
  {
    key: "enqueue_occupancy_teaching",
    label: "Kirim briefing okupansi ke Kepala Cabang",
    riskTier: "low",
    description: "Jalankan Occupancy Teaching Engine untuk satu cabang — mengirim briefing okupansi properti ke Kepala Cabang cabang tersebut.",
    payloadHint: '{"branch_name": "nama cabang"}',
    execute: async (supabase, payload) => {
      const branch = await resolveBranch(supabase, requireString(payload, "branch_name"));
      const jobId = await enqueueJob(supabase, "occupancy_teaching_biweekly", { branch_id: branch.id, branch_name: branch.name });
      return `Briefing okupansi untuk cabang ${branch.name} diantrikan (job ${jobId})`;
    },
  },
  {
    key: "create_assistant_followup",
    label: "Catat sebagai tindak lanjut di daftar saya",
    riskTier: "low",
    description:
      "Catat satu item tindak lanjut ke daftar kejar milik orang yang menyetujui aksi ini. Pakai untuk tindakan yang harus dikerjakan manusia, bukan sistem — supaya tidak hilang.",
    payloadHint: '{"title": "apa yang harus dikejar", "notes": "konteks singkat (opsional)", "due_date": "YYYY-MM-DD (opsional)"}',
    execute: async (supabase, payload, ctx) => {
      const title = requireString(payload, "title");
      const dueDate = readString(payload, "due_date");
      const { error } = await supabase.from("assistant_followups").insert({
        owner_id: ctx.approverId,
        title,
        notes: readString(payload, "notes"),
        due_date: dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
      });
      if (error) throw new Error(`Gagal menyimpan tindak lanjut: ${error.message}`);
      return `Tindak lanjut "${title}" ditambahkan ke daftar ${ctx.approverName}`;
    },
  },
] as const;

const ACTION_BY_KEY = new Map(FRIDAY_ACTIONS.map((a) => [a.key, a]));

export function getFridayAction(key: string): FridayActionDefinition | null {
  return ACTION_BY_KEY.get(key) ?? null;
}

export function isKnownFridayAction(key: string): boolean {
  return ACTION_BY_KEY.has(key);
}

export const FRIDAY_ACTION_KEYS: readonly string[] = FRIDAY_ACTIONS.map((a) => a.key);
