import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { readWaMediaToken } from "@/lib/wa-media/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a file to Whacenter through a short HMAC-signed link (see
 * lib/wa-media/link.ts). No session: Whacenter is the caller. Public in
 * lib/supabase/middleware.ts; the signature + expiry are the guard.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; name: string }> },
) {
  const { token } = await params;
  const grant = readWaMediaToken(token);
  if (!grant) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from(grant.bucket).download(grant.path);
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  // A complete body with its exact length and an image type. The first sends
  // through this route (2026-10-25) came back HTTP 500 from Whacenter while the
  // response was streamed (chunked, no Content-Length); file links Whacenter
  // does accept are plain static files, so this one now looks like one.
  const body = Buffer.from(await data.arrayBuffer());
  return new NextResponse(body, {
    headers: {
      "Content-Type": waMediaContentType(data.type, grant.path),
      "Content-Length": String(body.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Storage's type when it is a real one, else from the file extension. */
function waMediaContentType(stored: string | undefined, path: string): string {
  if (stored && stored !== "application/octet-stream") return stored;
  const ext = path.split(".").pop()?.toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" }[ext ?? ""] ?? "application/octet-stream";
}
