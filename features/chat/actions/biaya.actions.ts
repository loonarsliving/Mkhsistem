"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { BIAYA_FILE_MAX_BYTES, BIAYA_JENIS, BIAYA_KATEGORI, sniffBiayaFile } from "@/lib/connect/biaya";
import { logger } from "@/lib/logger";
import { requireSession } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

/**
 * Pengajuan Biaya Villa (0307). The request is written to the villa app's
 * villa_pengajuan_biaya by mkc_biaya_create under the caller's own session
 * (the RPC checks the 'manager' group role and every rule). Files go to the
 * villa's private bucket under chat/<own id>/ with the service role, after
 * their bytes are checked here; the RPC only accepts files in that folder.
 * Finance acts on the villa dashboard; its decisions come back to the chat
 * through the trigger in 0307.
 */

const BUCKET = "villa-pengajuan-biaya";
const uuid = z.string().uuid();
const text = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max);

const createSchema = z
  .object({
    kategori: z.enum(BIAYA_KATEGORI),
    kategoriNama: z.string().trim().max(80).optional(),
    jenis: z.enum(BIAYA_JENIS),
    periode: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pilih bulan biaya"),
    nominal: z.coerce.number().int("Nominal harus bilangan bulat").positive("Isi nominal").max(100_000_000, "Nominal terlalu besar"),
    keterangan: text(3, 1000, "Tulis keterangan (minimal 3 huruf)"),
    penerimaNama: text(1, 120, "Isi nama pemilik rekening"),
    penerimaBank: text(1, 60, "Isi nama bank"),
    penerimaRekening: text(1, 40, "Isi nomor rekening"),
  })
  .refine((v) => v.kategori !== "lain_lain" || (v.kategoriNama ?? "").length >= 3, { message: "Tulis nama biayanya", path: ["kategoriNama"] });

async function uploadFile(userId: string, value: FormDataEntryValue | null): Promise<{ path: string | null } | { error: string }> {
  if (!(value instanceof File) || value.size === 0) return { path: null };
  if (value.size > BIAYA_FILE_MAX_BYTES) return { error: "File terlalu besar (maks 5MB)" };
  const bytes = new Uint8Array(await value.arrayBuffer());
  const kind = sniffBiayaFile(bytes);
  if (!kind) return { error: "File harus foto (JPG/PNG/WebP) atau PDF" };
  const path = `chat/${userId}/${randomUUID()}.${kind.ext}`;
  const { error } = await createAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType: kind.contentType, upsert: false });
  if (error) return { error: `Gagal mengunggah file: ${error.message}` };
  return { path };
}

async function removeFiles(paths: (string | null)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  const { error } = await createAdminClient().storage.from(BUCKET).remove(list);
  if (error) logger.warn("pengajuan biaya: orphan file cleanup failed", { error: error.message });
}

export async function createBiayaAction(form: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = createSchema.safeParse({
    kategori: form.get("kategori"),
    kategoriNama: form.get("kategoriNama") ?? undefined,
    jenis: form.get("jenis"),
    periode: form.get("periode"),
    nominal: form.get("nominal"),
    keterangan: form.get("keterangan"),
    penerimaNama: form.get("penerimaNama"),
    penerimaBank: form.get("penerimaBank"),
    penerimaRekening: form.get("penerimaRekening"),
  });
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  const d = parsed.data;
  if (d.jenis === "reimburse" && !(form.get("buktiBayar") instanceof File && (form.get("buktiBayar") as File).size > 0)) {
    return actionError("Reimburse wajib melampirkan bukti bayar");
  }

  const nota = await uploadFile(session.userId, form.get("nota"));
  if ("error" in nota) return actionError(nota.error);
  const bayar = await uploadFile(session.userId, form.get("buktiBayar"));
  if ("error" in bayar) {
    await removeFiles([nota.path]);
    return actionError(bayar.error);
  }

  const { data, error } = await (await createClient()).rpc("mkc_biaya_create", {
    p_kategori: d.kategori,
    p_kategori_nama: d.kategori === "lain_lain" ? (d.kategoriNama ?? null) : null,
    p_jenis: d.jenis,
    p_periode: d.periode,
    p_nominal: d.nominal,
    p_keterangan: d.keterangan,
    p_penerima_nama: d.penerimaNama,
    p_penerima_bank: d.penerimaBank,
    p_penerima_rekening: d.penerimaRekening,
    p_nota_path: nota.path,
    p_bukti_bayar_path: bayar.path,
  });
  if (error || !data) {
    await removeFiles([nota.path, bayar.path]);
    return actionError((error?.message ?? "Gagal mengirim pengajuan").replace(/^.*?ERROR:\s*/i, ""));
  }
  return actionSuccess({ id: data });
}

const cancelSchema = z.object({ id: uuid, reason: text(3, 1000, "Tulis alasan pembatalan") });

export async function cancelBiayaAction(input: z.input<typeof cancelSchema>): Promise<ActionResult<null>> {
  await requireSession();
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  const { error } = await (await createClient()).rpc("mkc_biaya_cancel", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return actionError(error.message.replace(/^.*?ERROR:\s*/i, ""));
  return actionSuccess(null);
}

const fileSchema = z.object({ conversationId: uuid, id: uuid, file: z.enum(["nota", "bukti_bayar", "bukti_transfer"]) });

/** 10-minute link to one file of a request, for a member of the conversation that shows it. */
export async function biayaFileUrlAction(input: z.input<typeof fileSchema>): Promise<ActionResult<{ url: string }>> {
  const session = await requireSession();
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid");
  const admin = createAdminClient();
  const { data: path, error } = await admin.rpc("mkc_biaya_file_path", {
    p_user: session.userId,
    p_conversation_id: parsed.data.conversationId,
    p_id: parsed.data.id,
    p_file: parsed.data.file,
  });
  if (error) return actionError(error.message);
  if (!path) return actionError("File tidak ditemukan");
  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 600);
  if (signError || !signed) return actionError(signError?.message ?? "Gagal membuka file");
  return actionSuccess({ url: signed.signedUrl });
}
