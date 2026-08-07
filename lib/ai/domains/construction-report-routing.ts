import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { sendWhatsAppImage } from "../notifications/engine";

export type ConstructionPhotoRouteOutcome = "routed" | "not_applicable" | "no_active_project" | "send_failed";

export interface ConstructionPhotoRouteResult {
  outcome: ConstructionPhotoRouteOutcome;
  notifiedCount: number;
}

/**
 * Auto-forwards every photo a Kepala Cabang with an active construction
 * project sends via WhatsApp straight to every Super Admin as a progress
 * update -- no "kirim ke ..." instruction needed, since this is the one
 * thing they're expected to report on a regular basis (owner's explicit
 * request: Kendari's build progress). Runs independently of, and in
 * addition to, the general-purpose relay-by-name in message-relay.ts.
 *
 * Kendari-only today in practice (only branch with a construction_projects
 * row, see 0193), but written generically off that table so it extends
 * automatically to any other branch that gets its own project later.
 */
export async function tryRouteConstructionPhotoReport(
  employee: { id: string; full_name: string; branch_id: string | null; role_key: string | null },
  imageUrl: string,
  caption: string | undefined,
): Promise<ConstructionPhotoRouteResult> {
  if (employee.role_key !== "kepala_cabang" || !employee.branch_id) {
    return { outcome: "not_applicable", notifiedCount: 0 };
  }

  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("construction_projects")
    .select("id, name")
    .eq("branch_id", employee.branch_id)
    .eq("status", "active")
    .maybeSingle();

  if (!project) return { outcome: "no_active_project", notifiedCount: 0 };

  const { data: admins } = await supabase
    .from("employees")
    .select("id, phone, roles:role_id(key)")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .not("phone", "is", null);

  const superAdmins = (admins ?? []).filter((row) => (row.roles as unknown as { key: string } | null)?.key === "super_admin");

  const reportCaption = `📸 Update Progress ${project.name} — dari ${employee.full_name}${caption ? `\n\n💬 ${caption}` : ""}`;

  let notifiedCount = 0;
  for (const admin of superAdmins) {
    const result = await sendWhatsAppImage(admin.phone as string, imageUrl, reportCaption);
    if (result.success) notifiedCount++;
  }

  if (notifiedCount === 0) return { outcome: "send_failed", notifiedCount: 0 };
  return { outcome: "routed", notifiedCount };
}
