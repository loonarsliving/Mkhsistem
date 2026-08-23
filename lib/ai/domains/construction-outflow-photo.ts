import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConstructionOutflowPhotoOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "not_a_transfer" }
  | { outcome: "insert_failed" }
  | { outcome: "recorded"; amount: number; partyName: string; projectName: string; ai: TransferProofRecognition };

/**
 * Owner's ask: when a Kepala Cabang with an active construction project
 * (Fasly/Kendari today) sends a bukti transfer photo -- proof he just paid
 * a toko/tukang himself out of pocket -- it should be logged straight away
 * as a construction_expenses outflow (same shape as the manual "Input
 * Pembelian Material" form he'd otherwise have to fill in the app), not
 * swept up by tryRouteConstructionPhotoReport's generic "forward every
 * photo as a progress update" behavior as if it were a site photo.
 * Deliberately checked BEFORE that generic forward -- the caller skips it
 * entirely on a "recorded" outcome.
 *
 * is_settled starts false, same as the manual form -- this only records
 * that Fasly paid something out; the owner still separately reimburses him
 * (or the store), which is what flips is_settled (see
 * construction-expense-settlement.ts).
 */
export async function tryRecordConstructionOutflowPhoto(
  employee: { id: string; full_name: string; branch_id: string | null; role_key: string | null },
  imageUrl: string,
): Promise<ConstructionOutflowPhotoOutcome> {
  if (employee.role_key !== "kepala_cabang" || !employee.branch_id) {
    return { outcome: "not_applicable" };
  }

  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("construction_projects")
    .select("id, name")
    .eq("branch_id", employee.branch_id)
    .eq("status", "active")
    .maybeSingle();
  if (!project) return { outcome: "not_applicable" };

  const image = await fetchImageAsBase64(imageUrl);
  const ai: TransferProofRecognition =
    image && !image.fetchError
      ? await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
          (): TransferProofRecognition => ({ readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Analisa AI gagal." }),
        )
      : { readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Foto tidak bisa diunduh untuk dianalisa AI." };

  if (!ai.readable || ai.nominal === null) {
    return { outcome: "not_a_transfer" };
  }
  const nominal = ai.nominal;

  const partyName = ai.rekeningTujuan?.trim() || "-";

  const { error } = await supabase.from("construction_expenses").insert({
    project_id: project.id,
    branch_id: employee.branch_id,
    expense_type: "material_tunai",
    party_name: partyName,
    description: `Dicatat otomatis dari foto bukti transfer WA${ai.tanggal ? ` -- tanggal di foto: ${ai.tanggal}` : ""}${ai.notes ? ` (${ai.notes})` : ""}`,
    amount: nominal,
    payment_method: "cash",
    expense_date: new Date().toISOString().slice(0, 10),
    photo_url: imageUrl,
    created_by: employee.id,
  });

  if (error) {
    return { outcome: "insert_failed" };
  }

  const { data: admins } = await supabase
    .from("employees")
    .select("id, roles:role_id(key)")
    .is("deleted_at", null)
    .eq("employment_status", "active");
  const superAdminIds = (admins ?? []).filter((row) => (row.roles as unknown as { key: string } | null)?.key === "super_admin").map((row) => row.id);
  if (superAdminIds.length > 0) {
    await supabase.from("mkc_notifications").insert(
      superAdminIds.map((adminId) => ({
        user_id: adminId,
        type: "system",
        category: "construction_expense_submitted",
        title: `Input Pembelian Material (Tunai, via WA) — ${project.name}`,
        body:
          `🧱 Toko/Penerima: ${partyName}` +
          `\n💰 Nominal (tunai): Rp ${nominal.toLocaleString("id-ID")}` +
          `\n📅 Tanggal: ${new Date().toLocaleDateString("id-ID")}` +
          `\n📝 Dibaca otomatis dari foto bukti transfer yang dikirim ${employee.full_name} via WhatsApp.`,
        link: "/construction-finance",
        metadata: { project_id: project.id, expense_type: "material_tunai" },
      })),
    );
  }

  return { outcome: "recorded", amount: ai.nominal, partyName, projectName: project.name, ai };
}
