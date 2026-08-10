import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { sendWhatsAppImage } from "../notifications/engine";

export type PhotoAutoForwardOutcome = "routed" | "no_rules" | "send_failed";

export interface PhotoAutoForwardResult {
  outcome: PhotoAutoForwardOutcome;
  notifiedCount: number;
  recipientNames: string[];
}

/**
 * Table-driven version of tryRouteConstructionPhotoReport -- forwards every
 * photo a given employee sends via WhatsApp to whatever recipients are
 * configured for them in photo_auto_forward_rules (0197), no "kirim ke ..."
 * instruction needed. A rule's recipient is either one specific employee or
 * every active holder of a role (e.g. every Super Admin).
 *
 * Built for Endy: his building-material purchase photos need to reach both
 * Vando (specific) and every Super Admin (role) immediately, since they're
 * his justification for ordering material. Generic by design so the same
 * mechanism covers future "auto-forward this person's photos" requests with
 * just an insert, no code change.
 */
export async function tryAutoForwardPhoto(
  employee: { id: string; full_name: string },
  imageUrl: string,
  caption: string | undefined,
): Promise<PhotoAutoForwardResult> {
  const supabase = createAdminClient();

  const { data: rules } = await supabase
    .from("photo_auto_forward_rules")
    .select("recipient_employee_id, recipient_role")
    .eq("sender_employee_id", employee.id);

  if (!rules || rules.length === 0) {
    return { outcome: "no_rules", notifiedCount: 0, recipientNames: [] };
  }

  const specificIds = rules.filter((r) => r.recipient_employee_id).map((r) => r.recipient_employee_id as string);
  const roles = rules.filter((r) => r.recipient_role).map((r) => r.recipient_role as string);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, phone, roles:role_id(key)")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .not("phone", "is", null);

  const recipients = (employees ?? []).filter((row) => {
    const roleKey = (row.roles as unknown as { key: string } | null)?.key ?? null;
    return specificIds.includes(row.id) || (roleKey && roles.includes(roleKey));
  });

  // Dedupe -- Endy's rules could in principle resolve the same person twice
  // (e.g. if a specific recipient also happens to hold the role).
  const seen = new Set<string>();
  const uniqueRecipients = recipients.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

  const reportCaption = `📸 Foto dari ${employee.full_name} — bukti pemesanan bahan bangunan${caption ? `\n\n💬 ${caption}` : ""}`;

  let notifiedCount = 0;
  const recipientNames: string[] = [];
  for (const recipient of uniqueRecipients) {
    const result = await sendWhatsAppImage(recipient.phone as string, imageUrl, reportCaption);
    if (result.success) {
      notifiedCount++;
      recipientNames.push(recipient.full_name);
    }
  }

  if (notifiedCount === 0) return { outcome: "send_failed", notifiedCount: 0, recipientNames: [] };

  // Receipt for sync_inbound (0198, mkh-properti's finance_expense_submitted
  // handler) to check "did this sender recently send a justification photo"
  // before asking them to fill in pekerjaan/blok on a bahan pengajuan.
  await supabase.from("photo_auto_forward_log").insert({ employee_id: employee.id });

  return { outcome: "routed", notifiedCount, recipientNames };
}
