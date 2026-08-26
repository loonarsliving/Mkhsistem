import { NextResponse } from "next/server";

import { sendWhatsAppDocument } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { requireFileAgentAuth } from "@/lib/security/file-agent-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELIVERY_BUCKET = "mkc-file-delivery-temp";
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Called by the Mac Mini agent once it has read the requested file's bytes
 * off local disk, for one specific `mkc_file_requests` row. This is where
 * the actual WhatsApp send happens -- deliberately NOT on the agent side,
 * because only this app holds the WhatsApp/Whacenter credentials (the agent
 * never sees them, keeping the Mac Mini's blast radius limited to "can read
 * files under STORAGE_ROOT and call this one endpoint").
 *
 * The connector (whatsapp-connector.ts) can only attach a file by handing
 * Whacenter a publicly fetchable URL -- the agent itself has no public URL
 * (home network, no port forwarding by design). So the bytes are staged in
 * a short-lived private Storage bucket just long enough to mint a signed
 * URL, then deleted immediately after the send attempt (success or
 * failure) -- see migration 0245's bucket comment for why this app never
 * keeps a durable copy.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireFileAgentAuth(request);
  if (unauthorized) return unauthorized;

  const { id: requestId } = await params;
  const supabase = createAdminClient();

  const { data: fileRequest, error: fetchError } = await supabase
    .from("mkc_file_requests")
    .select("id, status, wa_phone_number, matched_file_id, file:mkc_files!matched_file_id(original_filename, mime_type)")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !fileRequest) {
    return NextResponse.json({ status: "error", error: "request not found" }, { status: 404 });
  }
  if (fileRequest.status !== "matched") {
    return NextResponse.json({ status: "error", error: `request is not deliverable (status=${fileRequest.status})` }, { status: 409 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ status: "error", error: "expected multipart/form-data with a 'file' field" }, { status: 400 });
  }

  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return NextResponse.json({ status: "error", error: "missing 'file' field" }, { status: 400 });
  }

  const matchedFile = fileRequest.file as unknown as { original_filename: string; mime_type: string | null } | null;
  const filename = matchedFile?.original_filename ?? uploaded.name;
  const storagePath = `${requestId}/${filename}`;

  await supabase
    .from("mkc_file_requests")
    .update({ status: "delivering" })
    .eq("id", requestId);

  const buffer = Buffer.from(await uploaded.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(DELIVERY_BUCKET)
    .upload(storagePath, buffer, { contentType: matchedFile?.mime_type ?? (uploaded.type || "application/octet-stream"), upsert: true });

  if (uploadError) {
    await supabase.from("mkc_file_requests").update({ status: "failed", error_message: `staging upload failed: ${uploadError.message}` }).eq("id", requestId);
    return NextResponse.json({ status: "error", error: uploadError.message }, { status: 502 });
  }

  try {
    const { data: signedUrlData, error: signError } = await supabase.storage.from(DELIVERY_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signError || !signedUrlData) {
      throw new Error(signError?.message ?? "failed to create signed URL");
    }

    const sendResult = await sendWhatsAppDocument(fileRequest.wa_phone_number, signedUrlData.signedUrl, filename);

    if (!sendResult.success) {
      logger.warn("files/agent/deliver: WhatsApp send failed", { requestId, error: sendResult.error });
      await supabase.from("mkc_file_requests").update({ status: "failed", error_message: sendResult.error ?? "unknown send error" }).eq("id", requestId);
      return NextResponse.json({ status: "error", error: sendResult.error }, { status: 502 });
    }

    await supabase
      .from("mkc_file_requests")
      .update({ status: "sent", wa_message_id: sendResult.externalId ?? null, sent_at: new Date().toISOString(), error_message: null })
      .eq("id", requestId);

    return NextResponse.json({ status: "ok" });
  } finally {
    // Best-effort cleanup regardless of outcome -- this bucket is a relay
    // hop, never durable storage (see migration 0245's header comment). A
    // failed delete here just means the object sits until the next natural
    // overwrite of the same requestId path or a manual sweep; it does not
    // block the response.
    const { error: deleteError } = await supabase.storage.from(DELIVERY_BUCKET).remove([storagePath]);
    if (deleteError) {
      logger.warn("files/agent/deliver: failed to clean up staged file", { requestId, error: deleteError.message });
    }
  }
}
