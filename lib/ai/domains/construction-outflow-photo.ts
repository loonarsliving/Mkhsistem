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
 *
 * Real incident: the owner sent a Rp10,000,000 bukti transfer to "SYAIRIL
 * ASWAN" via Fasly's WhatsApp number, with no caption -- this still
 * defaulted to Fasly's own project (Kendari), and silently posted there,
 * even though it was actually a Loonars Coffee payment ("atas nama Papang"
 * -- Papang being a known Coffee party). His question: why doesn't the AI
 * check the recipient name? It genuinely can't help here -- "Syairil Aswan"
 * had never been paid by EITHER project before, so there was no name to
 * match against. The only real fix for "I'm paying for a different project
 * than my own branch" is the same one Vando already uses for Loonars
 * Coffee: name the project in the caption. ownerProjectOverride below reads
 * that caption the same way (matches an active project's branch name as a
 * whole word, case-insensitive) -- when present, it wins over the sender's
 * own branch; when absent, behaviour is unchanged from before.
 */
async function resolveOutflowProject(supabase: ReturnType<typeof createAdminClient>, branchId: string, caption: string | null | undefined): Promise<{ id: string; name: string; branchId: string } | null> {
  const trimmedCaption = (caption ?? "").trim();
  if (trimmedCaption) {
    const { data: activeProjects } = await supabase
      .from("construction_projects")
      .select("id, name, branch_id, branch:branch_id(name)")
      .eq("status", "active");
    for (const p of activeProjects ?? []) {
      const branchName = (p.branch as unknown as { name: string } | null)?.name;
      if (!branchName) continue;
      const words = branchName.split(/\s+/).filter((w) => w.length >= 4);
      if (words.length > 0 && words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(trimmedCaption))) {
        return { id: p.id as string, name: p.name as string, branchId: p.branch_id as string };
      }
    }
  }

  const { data: project } = await supabase
    .from("construction_projects")
    .select("id, name, branch_id")
    .eq("branch_id", branchId)
    .eq("status", "active")
    .maybeSingle();
  return project ? { id: project.id, name: project.name, branchId: project.branch_id } : null;
}

export async function tryRecordConstructionOutflowPhoto(
  employee: { id: string; full_name: string; branch_id: string | null; role_key: string | null },
  imageUrl: string,
  caption?: string | null,
): Promise<ConstructionOutflowPhotoOutcome> {
  if (employee.role_key !== "kepala_cabang" || !employee.branch_id) {
    return { outcome: "not_applicable" };
  }

  const supabase = createAdminClient();
  const project = await resolveOutflowProject(supabase, employee.branch_id, caption);
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
    branch_id: project.branchId,
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
