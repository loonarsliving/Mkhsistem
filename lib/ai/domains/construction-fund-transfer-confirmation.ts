import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConstructionFundTransferOutcome =
  | { outcome: "not_super_admin" }
  | { outcome: "no_match" }
  | { outcome: "ambiguous"; candidates: string[] }
  | { outcome: "unreadable"; projectName: string }
  | {
      outcome: "recorded";
      projectName: string;
      branchName: string;
      amount: number;
      ai: TransferProofRecognition;
      recipients: { name: string; phone: string }[];
    };

/**
 * Owner's request: sending a fund-transfer proof photo captioned with a
 * branch/project name (or that branch's Kepala Cabang's name -- e.g.
 * "Fasly" for Kendari) tops up that project's "dana sudah ditransfer"
 * automatically, instead of using the (currently unused) manual dialog.
 * Deliberately caption-gated -- unlike tryConfirmTransferProofViaWhatsApp
 * (which FIFO-picks the oldest pending gaji-tukang/material expense with
 * no caption needed, and is the far more common case), this must NOT fire
 * on every Super Admin bukti-transfer photo, or it would hijack routine
 * expense-approval transfers. "no_match" means the caption didn't mention
 * any active project/branch/Kepala Cabang -- caller should fall through to
 * the regular expense-transfer flow.
 */
export async function tryRecordConstructionFundTransferViaWhatsApp(
  sender: { id: string; name: string; roleKey: string | null },
  imageUrl: string,
  caption: string | null | undefined,
): Promise<ConstructionFundTransferOutcome> {
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const captionLower = (caption ?? "").trim().toLowerCase();
  if (!captionLower) {
    return { outcome: "no_match" };
  }

  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("construction_projects")
    .select("id, name, branch_id, branch:branch_id(name, code)")
    .eq("status", "active");

  if (!projects || projects.length === 0) {
    return { outcome: "no_match" };
  }

  const matches: { id: string; projectName: string; branchId: string; branchName: string }[] = [];
  for (const p of projects) {
    const branch = p.branch as unknown as { name: string; code: string } | null;
    const branchName = branch?.name ?? "";
    const branchCode = branch?.code ?? "";

    const { data: kcRows } = await supabase
      .from("employees")
      .select("full_name, phone")
      .eq("branch_id", p.branch_id)
      .not("phone", "is", null)
      .is("deleted_at", null)
      .eq("employment_status", "active");
    const kcNameWords = (kcRows ?? []).flatMap((e) => e.full_name.split(/\s+/).filter((w) => w.length >= 3));

    const candidates = [p.name, branchName, branchCode, ...kcNameWords].filter(Boolean);
    const isMatch = candidates.some((c) => captionLower.includes(c.toLowerCase()));
    if (isMatch) {
      matches.push({ id: p.id, projectName: p.name, branchId: p.branch_id, branchName });
    }
  }

  if (matches.length === 0) {
    return { outcome: "no_match" };
  }
  if (matches.length > 1) {
    return { outcome: "ambiguous", candidates: matches.map((m) => `${m.projectName} (${m.branchName})`) };
  }
  const match = matches[0];

  const image = await fetchImageAsBase64(imageUrl);
  const ai: TransferProofRecognition =
    image && !image.fetchError
      ? await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
          (): TransferProofRecognition => ({ readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Analisa AI gagal." }),
        )
      : { readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Foto tidak bisa diunduh untuk dianalisa AI." };

  if (!ai.readable || ai.nominal === null) {
    return { outcome: "unreadable", projectName: match.projectName };
  }

  await supabase.from("construction_fund_transfers").insert({
    project_id: match.id,
    branch_id: match.branchId,
    amount: ai.nominal,
    transfer_date: new Date().toISOString().slice(0, 10),
    note: `Dari WhatsApp (dibaca AI)${ai.tanggal ? ` -- tanggal di foto: ${ai.tanggal}` : ""}`,
    created_by: sender.id,
  });

  const recipients: { name: string; phone: string }[] = [];
  const { data: branchKc } = await supabase
    .from("employees")
    .select("full_name, phone, role:role_id(key)")
    .eq("branch_id", match.branchId)
    .not("phone", "is", null)
    .is("deleted_at", null)
    .eq("employment_status", "active");
  for (const emp of branchKc ?? []) {
    if ((emp.role as unknown as { key: string } | null)?.key === "kepala_cabang" && emp.phone) {
      recipients.push({ name: emp.full_name, phone: emp.phone });
    }
  }

  return {
    outcome: "recorded",
    projectName: match.projectName,
    branchName: match.branchName,
    amount: ai.nominal,
    ai,
    recipients,
  };
}
