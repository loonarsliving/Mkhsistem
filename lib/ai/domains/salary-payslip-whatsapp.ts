import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { sendWhatsAppImage, sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import {
  buildPayslipAdminReply,
  buildPayslipCaption,
  describeRow,
  formatPeriode,
  matchSalaryTransfers,
  payslipNumber,
  rupiah,
  type SalaryCandidate,
} from "@/lib/salary/payslip-format";
import { renderPayslipImage } from "@/lib/salary/payslip-image";
import { createAdminClient } from "@/lib/supabase/admin";
import { stageWaOutboxBytes } from "@/lib/wa-media/outbox";

import { recognizeTransferList } from "./salary-transfer-list-recognition";

export type SalaryPayslipOutcome =
  /** Not Super Admin, no salary waiting, unreadable, or nothing in the photo is a salary -- caller falls through to the other bukti-transfer matchers. */
  | { outcome: "not_applicable" }
  | { outcome: "processed"; replyText: string; sentCount: number };

type Supa = ReturnType<typeof createAdminClient>;

type Joined<T> = T | T[] | null;
const one = <T,>(v: Joined<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type SubmissionRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  amount: number | string;
  status: "pending_transfer" | "transferred";
  bank_name: string | null;
  bank_account_number: string;
  bank_account_holder: string | null;
  period_month: number;
  period_year: number;
  employee: Joined<{ full_name: string; phone: string | null; role: Joined<{ name: string }> }>;
  branch: Joined<{ name: string }>;
};

/** Recently-paid window used to recognise the second, overlapping screenshot of the same batch instead of reporting it as unmatched. */
const RECENT_TRANSFER_DAYS = 7;

async function loadCandidates(supabase: Supa): Promise<SubmissionRow[]> {
  const select =
    "id, employee_id, branch_id, amount, status, bank_name, bank_account_number, bank_account_holder, period_month, period_year, employee:employee_id(full_name, phone, role:role_id(name)), branch:branch_id(name)";
  const since = new Date(Date.now() - RECENT_TRANSFER_DAYS * 86_400_000).toISOString();
  const [pending, recent] = await Promise.all([
    supabase.from("employee_salary_submissions").select(select).eq("status", "pending_transfer").order("created_at", { ascending: true }),
    supabase.from("employee_salary_submissions").select(select).eq("status", "transferred").gte("transferred_at", since),
  ]);
  return [...((pending.data ?? []) as unknown as SubmissionRow[]), ...((recent.data ?? []) as unknown as SubmissionRow[])];
}

async function kepalaCabangPhones(supabase: Supa, branchId: string): Promise<{ name: string; phone: string }[]> {
  const { data } = await supabase
    .from("employees")
    .select("full_name, phone, role:role_id(key)")
    .eq("branch_id", branchId)
    .not("phone", "is", null)
    .is("deleted_at", null)
    .eq("employment_status", "active");
  return (data ?? [])
    .filter((e) => one(e.role as Joined<{ key: string }>)?.key === "kepala_cabang" && e.phone)
    .map((e) => ({ name: e.full_name, phone: e.phone as string }));
}

/**
 * Owner's ask (2026-11-02): Super Admin sends the bank's bukti transfer
 * gaji -- one receipt or a whole bulk-payroll screenshot -- to the system
 * WhatsApp, and every employee on it automatically gets their own "Slip
 * Gaji" picture.
 *
 * Each transfer line is matched on exact account number AND amount against
 * employee_salary_submissions (lib/salary/payslip-format.ts), marked
 * transferred (same columns as mark_salary_transferred / the 0250 flow),
 * and the employee receives a rendered slip card -- never the bank
 * screenshot itself, which shows every colleague's salary. Kepala Cabang
 * gets a text summary of their branch's payments.
 */
export async function trySalaryPayslipFromTransferProof(sender: { id: string; roleKey: string | null }, imageUrl: string): Promise<SalaryPayslipOutcome> {
  if (sender.roleKey !== "super_admin") return { outcome: "not_applicable" };

  const supabase = createAdminClient();
  const submissions = await loadCandidates(supabase);
  if (!submissions.some((s) => s.status === "pending_transfer")) return { outcome: "not_applicable" };

  const image = await fetchImageAsBase64(imageUrl);
  if (!image || image.fetchError) return { outcome: "not_applicable" };

  let rows;
  try {
    const recognition = await recognizeTransferList({ imageBase64: image.data, imageMimeType: image.mimeType });
    if (!recognition.readable || recognition.rows.length === 0) return { outcome: "not_applicable" };
    rows = recognition.rows;
  } catch (err) {
    logger.warn("salary-payslip: recognition failed", { error: err instanceof Error ? err.message : String(err) });
    return { outcome: "not_applicable" };
  }

  const byId = new Map(submissions.map((s) => [s.id, s]));
  const candidates: SalaryCandidate[] = submissions.map((s) => ({
    id: s.id,
    status: s.status,
    amount: Number(s.amount),
    bankAccountNumber: s.bank_account_number,
    periodMonth: s.period_month,
    periodYear: s.period_year,
  }));
  const matches = matchSalaryTransfers(rows, candidates);
  if (!matches.some((m) => m.kind === "matched" || m.kind === "already_transferred")) {
    // Nothing here is a salary (e.g. a bahan/tukang transfer) -- let the other matchers have it.
    return { outcome: "not_applicable" };
  }

  const transferredAt = new Date();
  const sent: { name: string; amount: number; periode: string; delivered: boolean; error?: string | null; branchId: string }[] = [];
  const alreadyTransferred: string[] = [];
  const problems: string[] = [];

  for (const match of matches) {
    if (match.kind === "ambiguous") {
      problems.push(`${describeRow(match.row)} (cocok dengan lebih dari satu pengajuan gaji)`);
      continue;
    }
    if (match.kind === "unmatched") {
      problems.push(`${describeRow(match.row)} (tidak ada pengajuan gaji dengan rekening + nominal ini)`);
      continue;
    }
    const sub = byId.get(match.submissionId);
    if (!sub) continue;
    const employee = one(sub.employee);
    const name = employee?.full_name ?? match.row.namaPenerima ?? "-";
    if (match.kind === "already_transferred") {
      alreadyTransferred.push(name);
      continue;
    }

    const { data: claimed } = await supabase
      .from("employee_salary_submissions")
      .update({ status: "transferred", transferred_by: sender.id, transferred_at: transferredAt.toISOString() })
      .eq("id", sub.id)
      .eq("status", "pending_transfer")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      // Claimed in between by the "Sudah Ditransfer" button or a parallel webhook.
      alreadyTransferred.push(name);
      continue;
    }

    const amount = Number(sub.amount);
    const periode = formatPeriode(sub.period_month, sub.period_year);

    await supabase.from("mkc_notifications").insert({
      user_id: sub.employee_id,
      type: "system",
      category: "salary_transferred",
      title: `Gaji Anda Telah Ditransfer — ${periode}`,
      body: `✅ Gaji periode ${periode} sebesar ${rupiah(amount)} telah ditransfer. Slip gaji dikirim lewat WhatsApp.`,
      link: "/hr/salary",
      metadata: { salary_submission_id: sub.id, source: "whatsapp_payslip" },
    });

    let delivered = false;
    let error: string | null = null;
    if (!employee?.phone) {
      error = "nomor WA karyawan belum ada";
    } else {
      try {
        const png = await renderPayslipImage({
          slipNumber: payslipNumber(sub.id, sub.period_month, sub.period_year),
          periode,
          employeeName: name,
          jabatan: one(employee.role)?.name ?? null,
          cabang: one(sub.branch)?.name ?? null,
          amount,
          bankName: sub.bank_name ?? match.row.bank,
          bankAccountNumber: sub.bank_account_number,
          // The name the bank itself printed beats whatever was typed into the form.
          bankAccountHolder: match.row.namaPenerima ?? sub.bank_account_holder,
          transferredAt,
        });
        const url = await stageWaOutboxBytes(png, "png");
        const result = await sendWhatsAppImage(employee.phone, url, buildPayslipCaption({ employeeName: name, periode, amount }));
        delivered = result.success;
        error = result.success ? null : (result.error ?? "unknown error");
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
    if (!delivered) logger.warn("salary-payslip: slip not delivered", { submission_id: sub.id, error });
    sent.push({ name, amount, periode, delivered, error, branchId: sub.branch_id });
  }

  // Kepala Cabang: one text summary per branch (no screenshot -- it lists other branches' salaries too).
  const branches = [...new Set(sent.map((s) => s.branchId))];
  for (const branchId of branches) {
    const rowsForBranch = sent.filter((s) => s.branchId === branchId);
    const branchName = one(submissions.find((s) => s.branch_id === branchId)?.branch ?? null)?.name ?? "cabang";
    const text =
      `💸 Gaji ${branchName} sudah ditransfer oleh Super Admin:\n` +
      rowsForBranch.map((r) => `• ${r.name.trim()} — ${rupiah(r.amount)} (${r.periode})`).join("\n") +
      "\nSlip gaji sudah dikirim otomatis ke masing-masing karyawan.";
    for (const kc of await kepalaCabangPhones(supabase, branchId)) {
      await sendWhatsAppText(kc.phone, text);
    }
  }

  return {
    outcome: "processed",
    sentCount: sent.length,
    replyText: buildPayslipAdminReply({ sent, alreadyTransferred, problems }),
  };
}
