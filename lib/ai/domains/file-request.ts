import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getFilemanagerDeliverLink,
  isFilemanagerConfigured,
  searchFilemanagerCatalog,
  storeFileInFilemanager,
  type FilemanagerFileCandidate,
} from "@/lib/filemanager/client";

import { generateAIText } from "../service";
import { sendWhatsAppDocument } from "../notifications/engine";

type AdminClient = ReturnType<typeof createAdminClient>;

function parseJson<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// "Kirim saya file X" -- text request flow, called from router.ts
// ============================================================================

interface FileRequestIntent {
  isFileRequest: boolean;
  searchTerms: string[];
}

/** One cheap Gemini call decides whether this message is asking for a company file and extracts search keywords. Mirrors data-queries.ts's extractDataQueryIntent. */
async function extractFileRequestIntent(question: string): Promise<FileRequestIntent> {
  const prompt = `Pesan dari karyawan lewat WhatsApp: "${question}"

Tentukan apakah ini PERMINTAAN UNTUK DIKIRIMKAN SEBUAH FILE/DOKUMEN PERUSAHAAN (mis. "kirim saya file kontrak PT ABC", "minta dokumen SOP HR dong", "ada file pricelist rumah kendari?"). Ini BUKAN permintaan file kalau cuma pertanyaan biasa atau topik lain.

Kalau ini permintaan file, sebutkan kata kunci pencarian relevan (nama file, topik, nama proyek/pihak, jenis dokumen) sebagai array kata/frasa pendek.

Balas HANYA dengan JSON (tanpa markdown code fence): {"isFileRequest": true/false, "searchTerms": ["kata kunci", ...]}`;

  try {
    const response = await generateAIText({
      systemPrompt: "Kamu adalah pengklasifikasi intent pesan WhatsApp internal perusahaan. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
      userPrompt: prompt,
      maxOutputTokens: 400,
      maxAttempts: 1,
    });
    return parseJson<FileRequestIntent>(response.text) ?? { isFileRequest: false, searchTerms: [] };
  } catch {
    return { isFileRequest: false, searchTerms: [] };
  }
}

export type FileRequestOutcome =
  | { outcome: "not_a_file_request" }
  | { outcome: "sent"; fileName: string }
  | { outcome: "send_failed"; fileName: string; error: string }
  | { outcome: "ambiguous"; candidates: FilemanagerFileCandidate[] }
  | { outcome: "no_match" }
  | { outcome: "not_configured" };

/**
 * Called from router.ts's routeAndAnswer, before the general keyword-routed
 * domain chat -- same placement as tryAnswerWithData. Unlike an earlier
 * design, this matches AND delivers in one pass: calls out to Filemanager
 * (the Mac Mini agent, over its Cloudflare Tunnel) to search, gets back a
 * short-lived download link for a single confident match, and sends it via
 * this app's own WhatsApp connector -- Filemanager never talks to WhatsApp
 * directly, it only ever answers calls FROM this app.
 */
export async function tryHandleFileRequest(question: string, senderWaNumber: string): Promise<FileRequestOutcome> {
  if (!isFilemanagerConfigured()) return { outcome: "not_configured" };

  const intent = await extractFileRequestIntent(question);
  if (!intent.isFileRequest) return { outcome: "not_a_file_request" };

  let candidates: FilemanagerFileCandidate[];
  try {
    candidates = await searchFilemanagerCatalog(intent.searchTerms.join(" "));
  } catch {
    return { outcome: "not_configured" };
  }

  if (candidates.length === 0) return { outcome: "no_match" };
  if (candidates.length > 1) return { outcome: "ambiguous", candidates };

  const match = candidates[0]!;
  try {
    const { url, filename } = await getFilemanagerDeliverLink(match.id);
    const sendResult = await sendWhatsAppDocument(senderWaNumber, url, filename);
    if (!sendResult.success) {
      return { outcome: "send_failed", fileName: match.displayName, error: sendResult.error ?? "unknown error" };
    }
    return { outcome: "sent", fileName: match.displayName };
  } catch (err) {
    return { outcome: "send_failed", fileName: match.displayName, error: err instanceof Error ? err.message : String(err) };
  }
}

export function formatFileRequestReply(result: FileRequestOutcome): string {
  switch (result.outcome) {
    case "sent":
      return `📁 File *${result.fileName}* sudah dikirim, cek chat ini ya.`;
    case "send_failed":
      return `⚠️ Ketemu file *${result.fileName}*, tapi gagal dikirim (${result.error}). Coba lagi sebentar.`;
    case "ambiguous":
      return `📁 Ada beberapa file yang cocok:\n${result.candidates.map((c, i) => `${i + 1}. ${c.displayName}${c.categoryName ? ` (${c.categoryName})` : ""}`).join("\n")}\n\nTolong sebutkan lebih spesifik nama filenya ya.`;
    case "no_match":
      return "📁 Maaf, tidak ada file yang cocok dengan permintaan itu di katalog. Coba sebutkan nama filenya lebih spesifik.";
    case "not_configured":
      return "⚠️ Fitur file manager belum aktif saat ini. Hubungi admin.";
    case "not_a_file_request":
      return "";
  }
}

// ============================================================================
// "Simpan sebagai ... kategori ..." -- WhatsApp file-save flow, called from
// webhook-handler.ts's image branch (Super Admin only, per migration 0245's
// files.wa_upload permission).
// ============================================================================

/** Cheap keyword pre-filter before ever calling Gemini or checking permissions -- avoids a wasted round trip on the vast majority of Super Admin photos (bukti transfer, nota, progress, etc.) that were never meant as a file-save command. */
export function looksLikeFileSaveCaption(caption: string | undefined): boolean {
  if (!caption) return false;
  return /\bsimpan\b/i.test(caption) && /\b(file|dokumen|kategori)\b/i.test(caption);
}

async function employeeHasPermission(supabase: AdminClient, employeeId: string, permissionKey: string): Promise<boolean> {
  const { data: employee } = await supabase.from("employees").select("role_id").eq("id", employeeId).maybeSingle();
  if (!employee?.role_id) return false;

  const { data } = await supabase
    .from("role_permissions")
    .select("permissions!inner(key)")
    .eq("role_id", employee.role_id)
    .eq("permissions.key", permissionKey)
    .maybeSingle();
  return Boolean(data);
}

interface FileSaveIntent {
  isSaveRequest: boolean;
  displayName: string | null;
  categoryPath: string[];
  description: string | null;
}

async function extractFileSaveIntent(caption: string): Promise<FileSaveIntent> {
  const prompt = `Keterangan foto/dokumen yang dikirim karyawan lewat WhatsApp ke sistem file manager perusahaan: "${caption}"

Ekstrak: nama file yang diinginkan (displayName, tulis ulang jelas, atau null kalau tidak disebut), kategori/folder tujuan sebagai breadcrumb dari umum ke spesifik (categoryPath, array nama folder, mis. ["Legal", "Kontrak"], array kosong kalau tidak disebut), dan deskripsi singkat tambahan kalau ada (description, atau null).

Balas HANYA dengan JSON (tanpa markdown code fence): {"isSaveRequest": true, "displayName": "... atau null", "categoryPath": ["...", ...], "description": "... atau null"}`;

  try {
    const response = await generateAIText({
      systemPrompt: "Kamu adalah pengekstrak intent untuk sistem file manager perusahaan. Balas HANYA dengan JSON sesuai instruksi.",
      userPrompt: prompt,
      maxOutputTokens: 400,
      maxAttempts: 1,
    });
    const parsed = parseJson<FileSaveIntent>(response.text);
    if (!parsed) return { isSaveRequest: false, displayName: null, categoryPath: [], description: null };
    return {
      isSaveRequest: true,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
      categoryPath: Array.isArray(parsed.categoryPath) ? parsed.categoryPath.filter((c): c is string => typeof c === "string" && c.trim().length > 0) : [],
      description: typeof parsed.description === "string" ? parsed.description : null,
    };
  } catch {
    return { isSaveRequest: false, displayName: null, categoryPath: [], description: null };
  }
}

export type FileSaveOutcome =
  | { outcome: "not_a_save_request" }
  | { outcome: "no_permission" }
  | { outcome: "saved"; displayName: string; categoryPath: string[] }
  | { outcome: "failed"; error: string }
  | { outcome: "not_configured" };

/**
 * Downloads the attachment WhatsApp already gave this app a URL for
 * (inbound.content.url, per the connector's normalizeIncomingMessage --
 * covers both images and documents, see whatsapp-connector.ts's comment),
 * and hands the bytes to Filemanager to store on the Mac Mini's disk.
 * Only ever called after looksLikeFileSaveCaption() and
 * imageRoleKey === "super_admin" have already gated entry (see
 * webhook-handler.ts) -- employeeHasPermission below is the real
 * authorization check, re-verified here independent of that caller.
 */
export async function tryHandleFileSaveViaWhatsApp(employeeId: string, caption: string, mediaUrl: string): Promise<FileSaveOutcome> {
  if (!isFilemanagerConfigured()) return { outcome: "not_configured" };

  const supabase = createAdminClient();
  const hasPermission = await employeeHasPermission(supabase, employeeId, "files.wa_upload");
  if (!hasPermission) return { outcome: "no_permission" };

  const intent = await extractFileSaveIntent(caption);
  if (!intent.isSaveRequest) return { outcome: "not_a_save_request" };

  try {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      return { outcome: "failed", error: `gagal mengunduh lampiran (HTTP ${mediaResponse.status})` };
    }
    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    const mimeType = mediaResponse.headers.get("content-type");
    const extensionFromMime = mimeType?.split("/")[1]?.split(";")[0];
    const filename = intent.displayName
      ? `${intent.displayName.trim()}${extensionFromMime ? `.${extensionFromMime}` : ""}`
      : `whatsapp-upload-${Date.now()}${extensionFromMime ? `.${extensionFromMime}` : ""}`;

    await storeFileInFilemanager({
      buffer,
      filename,
      mimeType,
      categoryPath: intent.categoryPath,
      displayName: intent.displayName ?? undefined,
      description: intent.description ?? undefined,
    });

    return { outcome: "saved", displayName: intent.displayName ?? filename, categoryPath: intent.categoryPath };
  } catch (err) {
    return { outcome: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export function formatFileSaveReply(result: FileSaveOutcome): string {
  switch (result.outcome) {
    case "saved":
      return `📁 File *${result.displayName}* tersimpan${result.categoryPath.length > 0 ? ` di kategori ${result.categoryPath.join(" / ")}` : ""}.`;
    case "no_permission":
      return "⚠️ Anda tidak punya izin menyimpan file ke file manager.";
    case "failed":
      return `⚠️ Gagal menyimpan file (${result.error}). Coba lagi sebentar.`;
    case "not_configured":
      return "⚠️ Fitur file manager belum aktif saat ini. Hubungi admin.";
    case "not_a_save_request":
      return "";
  }
}
