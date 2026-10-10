import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off internal utility, same shape and guard as
 * app/api/admin/send-wa-message/route.ts: uploads a base64 image to the
 * public project-photos bucket and returns its public URL, for the case
 * that route's own comment already anticipates -- "manually re-forwarding
 * a bukti transfer photo that was reconciled directly in the database
 * instead of through the normal WhatsApp flow" -- when that photo has no
 * WhatsApp-hosted media URL at all because it never came in through the
 * bot (e.g. shown directly to an operator in another channel). Without
 * this, send-wa-message's imageUrl has nothing to point at.
 *
 * Uses createAdminClient() (service role) deliberately: project-photos'
 * RLS insert policy requires an authenticated session holding
 * crm_project_photo.manage, which no automation caller has.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  let body: { imageBase64?: unknown; contentType?: unknown; fileName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "invalid JSON body" }, { status: 400 });
  }

  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const contentType = typeof body.contentType === "string" && body.contentType.trim() ? body.contentType.trim() : "image/jpeg";
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : "upload.jpg";
  if (!imageBase64) {
    return NextResponse.json({ status: "error", error: "imageBase64 is required" }, { status: 400 });
  }

  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
    return NextResponse.json({ status: "error", error: "decoded image is empty or exceeds 10MB" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const path = `manual-reconciliation/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await supabase.storage.from("project-photos").upload(path, bytes, { contentType, upsert: false });
  if (error) {
    logger.warn("upload-bukti-transfer: storage upload failed", { error: error.message });
    return NextResponse.json({ status: "error", error: error.message }, { status: 502 });
  }

  const { data: publicUrlData } = supabase.storage.from("project-photos").getPublicUrl(path);
  return NextResponse.json({ status: "ok", url: publicUrlData.publicUrl });
}
