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

  return new NextResponse(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
