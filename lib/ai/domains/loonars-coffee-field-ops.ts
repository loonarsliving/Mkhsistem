import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { assessConstructionProgress, fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeConstructionCostRequest, type CostRequestRecognition } from "@/lib/ai/domains/loonars-coffee-recognition";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { isNominalMismatch } from "@/lib/ai/domains/transfer-proof-confirmation";
import type { Json, NotificationCategoryDb } from "@/types/database.types";

/**
 * Loonars Coffee (Yogyakarta) — Vando's WhatsApp-first field-ops interface.
 *
 * Reuses the existing Construction Management (cm_*) tables/engine end to
 * end — this file is an ADAPTER (WhatsApp text/photo -> structured write),
 * not a second implementation of RAB/budget/labor math. Every write here
 * mirrors exactly what construction_submit_cost_request /
 * construction_decide_cost_request / cm_submit_wbs_progress would do, done
 * as a direct admin-client insert instead of calling those RPCs, because
 * WhatsApp messages have no Supabase Auth session (auth.uid() would be
 * null) — same pattern every other WhatsApp domain module in this codebase
 * already uses (see contractor-fund-request.ts, construction-fund-transfer-
 * confirmation.ts). Authorization is therefore enforced here in code
 * (role/name checks below), same trust boundary as those existing flows.
 *
 * Deliberately does NOT let a request auto-approve, auto-pay, or let the
 * same person both submit and approve — see requireDifferentApprover below.
 */

const LNC_BRANCH_CODE = "LNC";

async function getLoonarsCoffeeProject(): Promise<{ id: string; branchId: string; name: string } | null> {
  const supabase = createAdminClient();
  const { data: branch } = await supabase.from("branches").select("id").eq("code", LNC_BRANCH_CODE).maybeSingle();
  if (!branch) return null;
  const { data: project } = await supabase
    .from("construction_projects")
    .select("id, branch_id, name")
    .eq("branch_id", branch.id)
    .eq("status", "active")
    .maybeSingle();
  if (!project) return null;
  return { id: project.id, branchId: project.branch_id, name: project.name };
}

/**
 * Who's allowed to submit field-ops for Loonars Coffee on Vando's behalf:
 * the branch's own Kepala Cabang (once/if Loonars Coffee gets a dedicated
 * one), OR any employee named Vando regardless of which branch his own
 * employee record is filed under (he's Kepala Cabang Yogyakarta already,
 * covering Loonars Living too — same name-match convention findVando() in
 * contractor-expense-report.ts already uses for his approver role there).
 */
async function isAuthorizedLoonarsCoffeeSubmitter(employee: { id: string; full_name: string; branch_id: string | null }, projectBranchId: string): Promise<boolean> {
  if (employee.branch_id === projectBranchId) return true;
  return /vando/i.test(employee.full_name);
}

/**
 * "Loonars" alone is ambiguous with Loonars Living (his own branch's
 * existing, unrelated villa-construction WhatsApp flows — nota photos,
 * block-coded progress, fund transfers). For anyone identified only by
 * name-match (i.e. not actually filed under Loonars Coffee's own branch),
 * require an explicit "coffee" mention before routing a TEXT message here,
 * so a message meant for his existing Loonars Living duties never gets
 * misrouted into a Loonars Coffee financial record. An employee actually
 * filed under the Loonars Coffee branch needs no such disambiguation.
 */
function mentionsLoonarsCoffee(text: string): boolean {
  return /coffee/i.test(text);
}

async function notifySuperAdmins(category: NotificationCategoryDb, title: string, body: string, metadata: Json) {
  const supabase = createAdminClient();
  const { data: admins } = await supabase
    .from("employees")
    .select("id, role:role_id(key)")
    .is("deleted_at", null)
    .eq("employment_status", "active");
  const superAdmins = (admins ?? []).filter((e) => (e.role as unknown as { key: string } | null)?.key === "super_admin");
  for (const admin of superAdmins) {
    await supabase.from("mkc_notifications").insert({
      user_id: admin.id,
      type: "system",
      category,
      title,
      body,
      link: "/construction-finance",
      metadata,
    });
  }
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

// ----------------------------------------------------------------------------
// 1. Cost requests — material purchase / contractor payment / other expense
// ----------------------------------------------------------------------------
export type LoonarsCoffeeCostRequestOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "no_active_project" }
  | { outcome: "not_authorized" }
  | { outcome: "needs_clarification"; ai: CostRequestRecognition }
  | { outcome: "submitted"; requestId: string; requestType: string; amount: number; description: string };

/**
 * "Belanja Loonars 5 sak semen 2 pickup pasir total 1.850.000" / "Bayar
 * kontraktor minggu 1 Rp7.500.000" / "Belanja baut 350rb" -- reads Vando's
 * free-text message, creates a construction_cost_requests row in status
 * 'submitted' (DRAFT->SUBMITTED per the owner's spec — the request is
 * already what a human reviews next, no separate Vando-side confirmation
 * turn), and notifies every Super Admin so one of them can approve via the
 * web dashboard or "SETUJUI <id>" on WhatsApp. Never auto-approves, never
 * posts an actual expense — that only happens after
 * tryHandleLoonarsCoffeeOwnerDecision confirms the transfer.
 */
export async function tryHandleLoonarsCoffeeCostRequest(
  employee: { id: string; full_name: string; branch_id: string | null },
  text: string,
): Promise<LoonarsCoffeeCostRequestOutcome> {
  const trimmed = text.trim();
  if (!trimmed) return { outcome: "not_applicable" };

  const project = await getLoonarsCoffeeProject();
  if (!project) return { outcome: "no_active_project" };

  if (!(await isAuthorizedLoonarsCoffeeSubmitter(employee, project.branchId))) {
    return { outcome: "not_applicable" };
  }
  if (employee.branch_id !== project.branchId && !mentionsLoonarsCoffee(trimmed)) {
    // Name-matched (Vando), not the dedicated branch, and no "coffee"
    // mention -- leave this to his existing Loonars Living flows.
    return { outcome: "not_applicable" };
  }

  const ai = await recognizeConstructionCostRequest(trimmed).catch(
    (): CostRequestRecognition => ({ isRequest: false, requestType: null, items: [], nominal: null, weekNumber: null, partyName: null, notes: "Analisa AI gagal." }),
  );

  if (!ai.isRequest || ai.nominal === null) {
    return { outcome: "not_applicable" };
  }
  if (!ai.requestType) {
    return { outcome: "needs_clarification", ai };
  }

  const description =
    ai.items.length > 0
      ? ai.items.map((it) => `${it.nama} (${formatRupiah(it.nilai)})`).join("; ")
      : trimmed.slice(0, 200);

  const supabase = createAdminClient();
  const waRequestId = `wa:${employee.id}:${Date.now()}`;
  const { data: inserted, error } = await supabase
    .from("construction_cost_requests")
    .insert({
      project_id: project.id,
      request_type: ai.requestType,
      description,
      items: ai.items.length > 0 ? (ai.items as unknown as Json) : null,
      amount: ai.nominal,
      party_name: ai.partyName,
      cost_code: ai.requestType === "contractor_payment" ? "LAB-001" : null,
      status: "submitted",
      requested_by: employee.id,
      requested_at: new Date().toISOString(),
      source: "whatsapp",
      wa_request_id: waRequestId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { outcome: "not_applicable" };
  }

  await notifySuperAdmins(
    "construction_cost_request_submitted",
    `Pengajuan Baru — ${project.name}`,
    `${description}\n💰 ${formatRupiah(ai.nominal)}${ai.weekNumber ? `\n📅 Minggu ${ai.weekNumber}` : ""}\n👤 Diajukan oleh: ${employee.full_name}\n\nBalas "SETUJUI ${inserted.id.slice(0, 8)}" atau buka dashboard Construction untuk memutuskan.`,
    { cost_request_id: inserted.id, project_id: project.id },
  );

  return { outcome: "submitted", requestId: inserted.id as string, requestType: ai.requestType, amount: ai.nominal, description };
}

// ----------------------------------------------------------------------------
// 2. Owner decisions via WhatsApp: "SETUJUI <id8>", "TOLAK <id8> <alasan>",
//    "SUDAH TRANSFER <id8>". id8 = first 8 chars of the request's UUID
//    (shown in the notification), resolved with a prefix match.
// ----------------------------------------------------------------------------
export type LoonarsCoffeeOwnerDecisionOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "not_authorized" }
  | { outcome: "not_found" }
  | { outcome: "self_approval_blocked" }
  | { outcome: "approved"; requestId: string; requesterId: string | null }
  | { outcome: "rejected"; requestId: string; requesterId: string | null; reason: string | null }
  | { outcome: "transferred_and_posted"; requestId: string; requesterId: string | null };

const APPROVE_PATTERN = /^setujui\s+([a-f0-9]{6,})/i;
const REJECT_PATTERN = /^tolak\s+([a-f0-9]{6,})(?:\s+(.*))?$/i;
const TRANSFERRED_PATTERN = /^sudah\s+transfer\s+([a-f0-9]{6,})/i;

/**
 * Real production bug this replaced: the first version filtered with
 * `.ilike("id", prefix + "%")`, but `id` is a uuid column and Postgres has
 * no uuid ILIKE text operator ("operator does not exist: uuid ~~*
 * unknown"). Every lookup therefore errored out server-side, came back
 * empty, and the owner got "Pengajuan tidak ditemukan atau sudah
 * diputuskan" for a request that was sitting there perfectly valid --
 * SETUJUI/TOLAK/SUDAH TRANSFER could never work at all. PostgREST can't
 * cast a column mid-filter, so the prefix match happens in code instead,
 * over a bounded recent window (one project's request volume is small, and
 * an owner only ever acts on a recent code).
 */
async function findCostRequestByPrefix(prefix: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("construction_cost_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const wanted = prefix.toLowerCase();
  const matches = (data ?? []).filter((row) => String(row.id).toLowerCase().startsWith(wanted));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Owner-side WhatsApp commands mirroring the web dashboard's approve/
 * reject/confirm-transfer buttons — same rules enforced here as the SQL
 * RPCs (construction_decide_cost_request / construction_confirm_cost_
 * request_transfer / construction_post_cost_request): a requester can
 * never approve their own request, APPROVED never silently becomes PAID,
 * and posting only happens after an explicit transfer confirmation.
 * "SUDAH TRANSFER" combines confirm+post in one WhatsApp step (the owner's
 * own transfer already happened by the time he types this) — the web
 * dashboard keeps them as two separate buttons for an audit trail either
 * way.
 */
export async function tryHandleLoonarsCoffeeOwnerDecision(owner: { id: string; full_name: string; roleKey: string | null }, text: string): Promise<LoonarsCoffeeOwnerDecisionOutcome> {
  if (owner.roleKey !== "super_admin" && owner.roleKey !== "direktur_operasional") {
    // Only check the not-a-command path for non-owners -- avoids
    // accidentally reporting "not_authorized" for every unrelated message.
    if (!APPROVE_PATTERN.test(text) && !REJECT_PATTERN.test(text) && !TRANSFERRED_PATTERN.test(text)) {
      return { outcome: "not_applicable" };
    }
    return { outcome: "not_authorized" };
  }

  const supabase = createAdminClient();
  const trimmed = text.trim();

  const approveMatch = trimmed.match(APPROVE_PATTERN);
  if (approveMatch) {
    const req = await findCostRequestByPrefix(approveMatch[1]);
    if (!req || req.status !== "submitted") return { outcome: "not_found" };
    if (req.requested_by === owner.id) return { outcome: "self_approval_blocked" };

    await supabase
      .from("construction_cost_requests")
      .update({ status: "approved", approved_by: owner.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", req.id);

    if (req.requested_by) {
      await supabase.from("mkc_notifications").insert({
        user_id: req.requested_by,
        type: "system",
        category: "construction_cost_request_decided",
        title: "Pengajuan Disetujui",
        body: `${req.description} — ${formatRupiah(Number(req.amount))} sudah disetujui. Uang akan ditransfer sesuai proses normal.`,
        link: "/construction-finance",
        metadata: { cost_request_id: req.id },
      });
    }
    return { outcome: "approved", requestId: req.id as string, requesterId: req.requested_by as string | null };
  }

  const rejectMatch = trimmed.match(REJECT_PATTERN);
  if (rejectMatch) {
    const req = await findCostRequestByPrefix(rejectMatch[1]);
    if (!req || req.status !== "submitted") return { outcome: "not_found" };
    const reason = rejectMatch[2]?.trim() || null;

    await supabase
      .from("construction_cost_requests")
      .update({ status: "rejected", approved_by: owner.id, approved_at: new Date().toISOString(), reject_reason: reason, updated_at: new Date().toISOString() })
      .eq("id", req.id);

    if (req.requested_by) {
      await supabase.from("mkc_notifications").insert({
        user_id: req.requested_by,
        type: "system",
        category: "construction_cost_request_decided",
        title: "Pengajuan Ditolak",
        body: `${req.description} — ${formatRupiah(Number(req.amount))} belum disetujui.${reason ? `\nCatatan: ${reason}` : ""}`,
        link: "/construction-finance",
        metadata: { cost_request_id: req.id },
      });
    }
    return { outcome: "rejected", requestId: req.id as string, requesterId: req.requested_by as string | null, reason };
  }

  const transferredMatch = trimmed.match(TRANSFERRED_PATTERN);
  if (transferredMatch) {
    const req = await findCostRequestByPrefix(transferredMatch[1]);
    if (!req || req.status !== "approved") return { outcome: "not_found" };

    const { data: project } = await supabase.from("construction_projects").select("branch_id").eq("id", req.project_id).maybeSingle();
    if (!project) return { outcome: "not_found" };

    if (req.request_type === "contractor_payment") {
      // Contractor payments still need the earned-value engine
      // (cm_generate_labor_payment/cm_approve_labor_payment) to actually
      // compute and post the amount -- WhatsApp only records that the
      // request reached "transferred"; a Super Admin finishes posting it
      // from the web dashboard (Kontraktor card), where the linked
      // cm_labor_payments row is selected.
      await supabase
        .from("construction_cost_requests")
        .update({ status: "transferred", transferred_at: new Date().toISOString(), transfer_confirmed_by: owner.id, updated_at: new Date().toISOString() })
        .eq("id", req.id);
    } else {
      const { data: expense } = await supabase
        .from("construction_expenses")
        .insert({
          project_id: req.project_id,
          branch_id: project.branch_id,
          expense_type: req.request_type === "material_purchase" ? "pembelian_material" : "pembelian_lain_lain",
          party_name: req.party_name ?? "Vando (WhatsApp)",
          description: req.description,
          amount: req.amount,
          payment_method: "utang",
          expense_date: new Date().toISOString().slice(0, 10),
          created_by: owner.id,
        })
        .select("id")
        .single();

      if (expense) {
        await supabase
          .from("construction_cost_requests")
          .update({ status: "posted", posted_expense_id: expense.id, transferred_at: new Date().toISOString(), transfer_confirmed_by: owner.id, updated_at: new Date().toISOString() })
          .eq("id", req.id);
      }
    }

    if (req.requested_by) {
      await supabase.from("mkc_notifications").insert({
        user_id: req.requested_by,
        type: "system",
        category: "construction_cost_request_decided",
        title: "Pembayaran Dicatat",
        body: `${req.description} — ${formatRupiah(Number(req.amount))} sudah ditransfer dan dicatat.`,
        link: "/construction-finance",
        metadata: { cost_request_id: req.id },
      });
    }
    return { outcome: "transferred_and_posted", requestId: req.id as string, requesterId: req.requested_by as string | null };
  }

  return { outcome: "not_applicable" };
}

// ----------------------------------------------------------------------------
// 3. Progress reports — "Progress minggu ini sudah 20 persen", or
//    "Pengecoran cakar ayam sudah 100%" (matches a WBS item by name).
//    Always lands as a PENDING cm_wbs_progress_log row — never moves
//    cm_project_wbs.progress_pct directly, same human-verification rule the
//    web form already enforces (cm_decide_wbs_progress).
// ----------------------------------------------------------------------------
export type LoonarsCoffeeProgressOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "no_active_project" }
  | { outcome: "recorded"; wbsName: string; progressPct: number };

const PROGRESS_PATTERN = /(\d{1,3})\s*(?:%|persen)/i;

export async function tryHandleLoonarsCoffeeProgressReport(
  employee: { id: string; full_name: string; branch_id: string | null },
  text: string,
): Promise<LoonarsCoffeeProgressOutcome> {
  const match = text.match(PROGRESS_PATTERN);
  if (!match) return { outcome: "not_applicable" };
  const pct = Math.min(100, Math.max(0, parseInt(match[1], 10)));

  const project = await getLoonarsCoffeeProject();
  if (!project) return { outcome: "no_active_project" };
  if (!(await isAuthorizedLoonarsCoffeeSubmitter(employee, project.branchId))) return { outcome: "not_applicable" };
  if (employee.branch_id !== project.branchId && !mentionsLoonarsCoffee(text)) return { outcome: "not_applicable" };

  const supabase = createAdminClient();
  const { data: wbsItems } = await supabase.from("cm_project_wbs").select("id, name, progress_pct").eq("project_id", project.id).is("unit_id", null);
  if (!wbsItems || wbsItems.length === 0) return { outcome: "not_applicable" };

  const lower = text.toLowerCase();
  const matched = wbsItems.find((w) => lower.includes(w.name.toLowerCase())) ?? [...wbsItems].sort((a, b) => a.progress_pct - b.progress_pct)[0];

  await supabase.from("cm_wbs_progress_log").insert({
    project_wbs_id: matched.id,
    progress_pct: pct,
    note: text.slice(0, 500),
    status: "submitted",
    submitted_by: employee.id,
  });

  await notifySuperAdmins(
    "construction_progress_report",
    `Progress Baru — ${project.name}`,
    `${matched.name}: ${pct}% (dilaporkan ${employee.full_name} via WhatsApp)\n\nMenunggu verifikasi di dashboard Construction.`,
    { project_id: project.id, project_wbs_id: matched.id },
  );

  return { outcome: "recorded", wbsName: matched.name, progressPct: pct };
}

// ----------------------------------------------------------------------------
// 4. Photo evidence — reuses the existing Gemini Vision assessor
//    (construction-progress-vision.ts), generalized (see projectLabel) to
//    Loonars Coffee. AI's stage/progress is a SUGGESTION only, landed as a
//    pending cm_wbs_progress_log row exactly like a text progress report —
//    never auto-approved (acceptance criteria #24).
// ----------------------------------------------------------------------------
export type LoonarsCoffeePhotoOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "no_active_project" }
  | { outcome: "unreadable" }
  | { outcome: "recorded"; wbsName: string; suggestedProgressPct: number; stage: string; concerns: string[] };

export async function tryHandleLoonarsCoffeePhotoEvidence(
  employee: { id: string; full_name: string; branch_id: string | null },
  imageUrl: string,
  caption: string | null | undefined,
): Promise<LoonarsCoffeePhotoOutcome> {
  const project = await getLoonarsCoffeeProject();
  if (!project) return { outcome: "no_active_project" };
  if (!(await isAuthorizedLoonarsCoffeeSubmitter(employee, project.branchId))) return { outcome: "not_applicable" };
  if (employee.branch_id !== project.branchId && !mentionsLoonarsCoffee(caption ?? "")) return { outcome: "not_applicable" };

  const image = await fetchImageAsBase64(imageUrl);
  if (!image || image.fetchError) return { outcome: "unreadable" };

  const zoneLabel = caption?.trim() || "lokasi Loonars Coffee";
  const ai = await assessConstructionProgress({
    blockCode: zoneLabel,
    caption: caption ?? undefined,
    imageBase64: image.data,
    imageMimeType: image.mimeType,
    projectLabel: "proyek Loonars Coffee (Yogyakarta)",
  }).catch(() => null);
  if (!ai) return { outcome: "unreadable" };

  const supabase = createAdminClient();
  const { data: wbsItems } = await supabase.from("cm_project_wbs").select("id, name, progress_pct").eq("project_id", project.id).is("unit_id", null);
  const stageLower = ai.stage.toLowerCase();
  const matched = (wbsItems ?? []).find((w) => w.name.toLowerCase().includes(stageLower) || stageLower.includes(w.name.toLowerCase()));

  if (matched) {
    await supabase.from("cm_wbs_progress_log").insert({
      project_wbs_id: matched.id,
      progress_pct: ai.progressPct,
      photo_url: imageUrl,
      note: `[AI Vision, perlu verifikasi] ${ai.notes}${caption ? ` — Keterangan: ${caption}` : ""}`,
      status: "submitted",
      submitted_by: employee.id,
    });
  }

  await notifySuperAdmins(
    "construction_progress_report",
    `Foto Evidence Baru — ${project.name}`,
    `📸 Tahap terdeteksi AI: ${ai.stage} (~${ai.progressPct}%)\n${ai.notes}${ai.concerns.length ? `\n⚠️ ${ai.concerns.join("; ")}` : ""}\n\nDikirim oleh: ${employee.full_name}${matched ? "\nMenunggu verifikasi di dashboard Construction." : "\n(Tidak cocok otomatis dengan item WBS manapun — cek manual.)"}`,
    { project_id: project.id, project_wbs_id: matched?.id ?? null },
  );

  return { outcome: "recorded", wbsName: matched?.name ?? "(belum cocok item WBS)", suggestedProgressPct: ai.progressPct, stage: ai.stage, concerns: ai.concerns };
}

// ----------------------------------------------------------------------------
// 5. Queries — "Berapa sisa RAB?", "Progress berapa?", "Berapa pembayaran
//    kontraktor?", "Berapa yang sudah dibelanjakan?" — answers computed
//    server-side from cm_boq_summary/cm_project_overall_progress/
//    cm_labor_contract_summary, never guessed by the model.
// ----------------------------------------------------------------------------
export type LoonarsCoffeeQueryOutcome = { outcome: "not_applicable" } | { outcome: "no_active_project" } | { outcome: "answered"; reply: string };

const QUERY_PATTERNS: { re: RegExp; kind: "rab" | "progress" | "kontraktor" | "belanja" }[] = [
  { re: /sisa\s+rab|rab\s+(loonars\s+coffee|coffee)/i, kind: "rab" },
  { re: /progress\b/i, kind: "progress" },
  { re: /pembayaran\s+kontraktor|bayar\s+kontraktor.*\?|kontraktor.*sisa/i, kind: "kontraktor" },
  { re: /sudah\s+dibelanjakan|sudah\s+keluar|pengeluaran\s+loonars\s+coffee/i, kind: "belanja" },
];

export async function tryAnswerLoonarsCoffeeQuery(employee: { id: string; full_name: string; branch_id: string | null }, text: string): Promise<LoonarsCoffeeQueryOutcome> {
  if (!/loonars\s+coffee|coffee/i.test(text)) {
    // Scope queries to messages that actually mention this project, so a
    // bare "progress berapa?" from an unrelated employee doesn't get
    // hijacked into a Loonars Coffee answer.
    return { outcome: "not_applicable" };
  }
  const match = QUERY_PATTERNS.find((p) => p.re.test(text));
  if (!match) return { outcome: "not_applicable" };

  const project = await getLoonarsCoffeeProject();
  if (!project) return { outcome: "no_active_project" };
  if (!(await isAuthorizedLoonarsCoffeeSubmitter(employee, project.branchId))) return { outcome: "not_applicable" };

  const supabase = createAdminClient();

  if (match.kind === "rab" || match.kind === "belanja") {
    const { data: summary } = await supabase.rpc("cm_boq_summary", { p_project_id: project.id });
    const totalBudget = (summary ?? []).reduce((sum: number, row: { total_budget: number }) => sum + Number(row.total_budget), 0);
    const { data: expenses } = await supabase.from("construction_expenses").select("amount").eq("project_id", project.id);
    const spent = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      outcome: "answered",
      reply: `LOONARS COFFEE\n\n💰 Total RAB: ${formatRupiah(totalBudget)}\n💸 Sudah dibelanjakan: ${formatRupiah(spent)}\n📊 Sisa: ${formatRupiah(Math.max(totalBudget - spent, 0))}`,
    };
  }

  if (match.kind === "progress") {
    const { data: progress } = await supabase.rpc("cm_project_overall_progress", { p_project_id: project.id });
    return { outcome: "answered", reply: `LOONARS COFFEE\n\n📈 Progress fisik: ${Number(progress ?? 0)}%` };
  }

  // kontraktor
  const { data: contract } = await supabase.from("cm_labor_contracts").select("id").eq("project_id", project.id).maybeSingle();
  if (!contract) return { outcome: "answered", reply: "Belum ada kontrak kontraktor untuk Loonars Coffee." };
  const { data: summaryRows } = await supabase.rpc("cm_labor_contract_summary", { p_contract_id: contract.id });
  const summary = summaryRows?.[0];
  if (!summary) return { outcome: "answered", reply: "Data pembayaran kontraktor belum tersedia." };
  return {
    outcome: "answered",
    reply: `LOONARS COFFEE — Kontraktor\n\n📄 Nilai kontrak: ${formatRupiah(Number(summary.contract_value))}\n✅ Sudah dibayar: ${formatRupiah(Number(summary.cumulative_paid))}\n⏳ Earned (belum dibayar): ${formatRupiah(Number(summary.payable))}`,
  };
}

// ----------------------------------------------------------------------------
// 6. Transfer proof photo — the owner transfers the money for an APPROVED
//    cost request and simply sends the bukti transfer photo, with no
//    "SUDAH TRANSFER <id>" text at all.
//
//    Real incident this fixes: the owner approved a Loonars Coffee request,
//    transferred the money, sent the proof photo, and got back "Nominal di
//    foto tidak cocok dengan pengajuan manapun" -- every existing photo
//    handler matches against a different table (finance_pending_transfers,
//    construction_expenses, employee_salary_submissions), and
//    construction_cost_requests populates none of them.
//
//    The owner's rule for this project: transferring the money IS the
//    approval, so the photo also decides a request still sitting in
//    'submitted' -- no "SETUJUI <kode>" needed first.
//
//    Deliberately narrow so the existing flows are never disturbed: it only
//    acts when an open (submitted or approved) Loonars Coffee request exists
//    whose amount is an exact match for the nominal read off the photo, and
//    only when EXACTLY ONE such request matches. Anything else returns
//    "not_applicable" and the caller falls through to the handlers that were
//    already there.
// ----------------------------------------------------------------------------
export type LoonarsCoffeeTransferPhotoOutcome =
  | { outcome: "not_applicable" }
  | {
      outcome: "posted";
      requestId: string;
      requestType: string;
      description: string;
      amount: number;
      projectName: string;
      partyName: string | null;
      approvedByThisTransfer: boolean;
      awaitingLaborPayment: boolean;
      ai: TransferProofRecognition;
      recipients: { name: string; phone: string }[];
    };

/**
 * Who the bukti transfer gets forwarded to: the person who asked for the
 * money (normally Vando), plus Vando himself as Kepala Cabang when the
 * requester was somebody else -- same "forward the proof to the field"
 * behaviour the salary and project-fund photo flows already have.
 */
async function loonarsCoffeeProofRecipients(requestedBy: string | null): Promise<{ name: string; phone: string }[]> {
  const supabase = createAdminClient();
  const recipients: { name: string; phone: string }[] = [];

  if (requestedBy) {
    const { data: requester } = await supabase.from("employees").select("full_name, phone").eq("id", requestedBy).maybeSingle();
    if (requester?.phone) recipients.push({ name: requester.full_name, phone: requester.phone });
  }

  const { data: vandoRows } = await supabase
    .from("employees")
    .select("full_name, phone")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .ilike("full_name", "%vando%");
  for (const v of vandoRows ?? []) {
    if (v.phone && !recipients.some((r) => r.phone === v.phone)) recipients.push({ name: v.full_name, phone: v.phone });
  }

  return recipients;
}

export async function tryConfirmLoonarsCoffeeTransferByPhoto(
  sender: { id: string; name: string; roleKey: string | null },
  imageUrl: string,
): Promise<LoonarsCoffeeTransferPhotoOutcome> {
  if (sender.roleKey !== "super_admin" && sender.roleKey !== "direktur_operasional") {
    return { outcome: "not_applicable" };
  }

  const project = await getLoonarsCoffeeProject();
  if (!project) return { outcome: "not_applicable" };

  const supabase = createAdminClient();
  // 'submitted' as well as 'approved': the owner's rule is that TRANSFERRING
  // THE MONEY *IS* THE APPROVAL for this project -- he should never have to
  // type "SETUJUI <kode>" first ("saya stujui dgan cara trf, tidak perlu
  // ketik stujui", 2026-09-12). A still-submitted request therefore gets
  // approved and paid in one step here, with approved_by set to him, so the
  // audit trail still records who decided it. The "SETUJUI <kode>" text
  // command stays available for deciding without (or before) transferring.
  const { data: awaitingMoney } = await supabase
    .from("construction_cost_requests")
    .select("*")
    .eq("project_id", project.id)
    .in("status", ["submitted", "approved"])
    .order("created_at", { ascending: true });

  if (!awaitingMoney || awaitingMoney.length === 0) {
    // Nothing waiting for money on this project -- never touch the photo.
    return { outcome: "not_applicable" };
  }

  const image = await fetchImageAsBase64(imageUrl);
  if (!image || image.fetchError) return { outcome: "not_applicable" };

  const ai = await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
    (): TransferProofRecognition => ({ readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Analisa AI gagal." }),
  );
  if (!ai.readable || ai.nominal === null) return { outcome: "not_applicable" };

  const candidates = awaitingMoney.filter(
    (row) =>
      !isNominalMismatch(Number(row.amount), ai.nominal) &&
      // A still-submitted request the owner raised HIMSELF is the one case
      // the transfer cannot double as the approval -- approving your own
      // request is blocked by design (and by the SQL RPC). Already-approved
      // ones are past that check, so they still go through.
      !(row.status === "submitted" && row.requested_by === sender.id),
  );
  if (candidates.length !== 1) {
    // Zero matches, or an ambiguous amount shared by several open requests
    // -- never guess which one the owner paid.
    return { outcome: "not_applicable" };
  }
  const req = candidates[0];
  const approvedByThisTransfer = req.status === "submitted";

  // Claim the row atomically first, so two photos arriving together can
  // never post the same request twice.
  const claimIso = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("construction_cost_requests")
    .update({
      status: "transferred",
      transferred_at: claimIso,
      transfer_confirmed_by: sender.id,
      // The transfer IS the approval when the request had not been decided
      // yet -- record him as the approver rather than leaving the row paid
      // but never approved by anyone.
      ...(approvedByThisTransfer ? { approved_by: sender.id, approved_at: claimIso } : {}),
      updated_at: claimIso,
    })
    .eq("id", req.id)
    .in("status", ["submitted", "approved"])
    .select("id");
  if (!claimed || claimed.length === 0) return { outcome: "not_applicable" };

  const { data: projectRow } = await supabase.from("construction_projects").select("branch_id, name").eq("id", req.project_id).maybeSingle();

  let awaitingLaborPayment = true;
  if (req.request_type !== "contractor_payment" && projectRow) {
    // Same posting rule as the "SUDAH TRANSFER <id>" text path: payment_method
    // stays 'utang' (the money came from the owner, not from the project's own
    // dana -- 'cash' would push the project's dana balance negative, see
    // repositories/construction-finance.repository.ts), but because there IS a
    // bukti transfer here, it is recorded as already settled, with the proof
    // photo kept on the expense row.
    const nowIso = new Date().toISOString();
    const { data: expense } = await supabase
      .from("construction_expenses")
      .insert({
        project_id: req.project_id,
        branch_id: projectRow.branch_id,
        expense_type: req.request_type === "material_purchase" ? "pembelian_material" : "pembelian_lain_lain",
        party_name: req.party_name ?? "Loonars Coffee (WhatsApp)",
        description: req.description,
        amount: req.amount,
        payment_method: "utang",
        is_settled: true,
        settled_at: nowIso,
        settled_by: sender.id,
        photo_url: imageUrl,
        expense_date: new Date().toISOString().slice(0, 10),
        created_by: sender.id,
      })
      .select("id")
      .single();

    if (expense) {
      // 'posted' is what fires trg_construction_cost_request_sync -> sync_log
      // -> mkh-properti's construction_project_financial_records + jurnal.
      await supabase
        .from("construction_cost_requests")
        .update({ status: "posted", posted_expense_id: expense.id, updated_at: new Date().toISOString() })
        .eq("id", req.id);
      awaitingLaborPayment = false;
    }
  }

  if (req.requested_by) {
    await supabase.from("mkc_notifications").insert({
      user_id: req.requested_by,
      type: "system",
      category: "construction_cost_request_decided",
      title: approvedByThisTransfer ? "Pengajuan Disetujui & Ditransfer" : "Pembayaran Sudah Ditransfer",
      body: `${req.description} — ${formatRupiah(Number(req.amount))} ${approvedByThisTransfer ? "disetujui dan langsung ditransfer" : "sudah ditransfer"}${ai.tanggal ? ` (${ai.tanggal})` : ""} dan dicatat. Bukti transfernya menyusul di chat ini.`,
      link: "/construction-finance",
      metadata: { cost_request_id: req.id, transfer_proof_url: imageUrl },
    });
  }

  const recipients = await loonarsCoffeeProofRecipients(req.requested_by as string | null);

  return {
    outcome: "posted",
    requestId: req.id as string,
    requestType: req.request_type as string,
    description: req.description as string,
    amount: Number(req.amount),
    projectName: projectRow?.name ?? project.name,
    partyName: (req.party_name as string | null) ?? null,
    approvedByThisTransfer,
    awaitingLaborPayment,
    ai,
    recipients,
  };
}
