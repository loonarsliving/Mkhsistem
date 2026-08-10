import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { sendWhatsAppImage, sendWhatsAppText } from "../notifications/engine";

const SUBMIT_TRIGGER = /^ajukan[:\s]/i;
const DECIDE_PATTERN = /^(setuju|tolak)\b\s*(ap-\d+)?\s*(.*)$/i;

export type ApprovalSubmitOutcome = "submitted" | "not_a_submission";
export interface ApprovalSubmitResult {
  outcome: ApprovalSubmitOutcome;
  code?: string;
}

/**
 * WhatsApp-only approval flow (0201). A Kepala Cabang sends "AJUKAN <apa
 * saja>" -- text and/or a photo (pricelist, invoice, anything) -- and every
 * Super Admin gets a WA message with a short code to approve/reject by
 * replying, no app needed on either side.
 */
export async function tryHandleApprovalSubmission(
  employee: { id: string; full_name: string; branch_id: string | null },
  text: string | undefined,
  imageUrl: string | undefined,
): Promise<ApprovalSubmitResult> {
  const source = (text ?? "").trim();
  if (!SUBMIT_TRIGGER.test(source)) {
    return { outcome: "not_a_submission" };
  }

  const requestText = source.replace(SUBMIT_TRIGGER, "").trim() || null;
  if (!requestText && !imageUrl) {
    return { outcome: "not_a_submission" };
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("approval_requests")
    .insert({
      requester_employee_id: employee.id,
      branch_id: employee.branch_id,
      request_text: requestText,
      image_url: imageUrl ?? null,
    })
    .select("code")
    .single();
  if (error || !row) {
    return { outcome: "not_a_submission" };
  }

  const { data: admins } = await supabase
    .from("employees")
    .select("phone, roles:role_id(key)")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .not("phone", "is", null);
  const superAdmins = (admins ?? []).filter((a) => (a.roles as unknown as { key: string } | null)?.key === "super_admin");

  const message = `📋 *Pengajuan Approval ${row.code}*\nDari: ${employee.full_name}${requestText ? `\n\n${requestText}` : ""}\n\nBalas *SETUJU ${row.code}* untuk menyetujui, atau *TOLAK ${row.code} <alasan>* untuk menolak.`;

  for (const admin of superAdmins) {
    if (imageUrl) {
      await sendWhatsAppImage(admin.phone as string, imageUrl, message);
    } else {
      await sendWhatsAppText(admin.phone as string, message);
    }
  }

  return { outcome: "submitted", code: row.code };
}

export type ApprovalDecideOutcome = "decided" | "not_found" | "already_decided" | "ambiguous" | "not_a_decision";
export interface ApprovalDecideResult {
  outcome: ApprovalDecideOutcome;
  code?: string;
  approved?: boolean;
}

/** Super Admin decides a pending request by replying "SETUJU"/"TOLAK", optionally with the code (required only when more than one request is pending). */
export async function tryHandleApprovalDecision(employee: { id: string; full_name: string }, text: string): Promise<ApprovalDecideResult> {
  const match = text.trim().match(DECIDE_PATTERN);
  if (!match) {
    return { outcome: "not_a_decision" };
  }

  const approved = match[1].toLowerCase() === "setuju";
  const explicitCode = match[2]?.toUpperCase();
  const note = match[3]?.trim() || null;

  const supabase = createAdminClient();

  let targetId: string;
  let code: string;
  if (explicitCode) {
    const { data: row } = await supabase.from("approval_requests").select("id, code, status").eq("code", explicitCode).maybeSingle();
    if (!row) return { outcome: "not_found" };
    if (row.status !== "pending") return { outcome: "already_decided", code: row.code };
    targetId = row.id;
    code = row.code;
  } else {
    const { data: pending } = await supabase
      .from("approval_requests")
      .select("id, code")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (!pending || pending.length === 0) return { outcome: "not_found" };
    if (pending.length > 1) return { outcome: "ambiguous" };
    targetId = pending[0].id;
    code = pending[0].code;
  }

  const { data: updated } = await supabase
    .from("approval_requests")
    .update({ status: approved ? "approved" : "rejected", decided_by: employee.id, decided_at: new Date().toISOString(), decision_note: note })
    .eq("id", targetId)
    .select("code, requester_employee_id")
    .single();
  if (!updated) return { outcome: "not_found" };

  const { data: requester } = await supabase.from("employees").select("phone").eq("id", updated.requester_employee_id).maybeSingle();
  if (requester?.phone) {
    const msg = approved
      ? `✅ Pengajuan ${code} Anda *disetujui* oleh ${employee.full_name}.${note ? `\nCatatan: ${note}` : ""}`
      : `❌ Pengajuan ${code} Anda *ditolak* oleh ${employee.full_name}.${note ? `\nAlasan: ${note}` : ""}`;
    await sendWhatsAppText(requester.phone, msg);
  }

  return { outcome: "decided", code, approved };
}
