import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERMISSIONS } from "@/constants/rbac";
import { requirePermission } from "@/lib/rbac/session";

/**
 * Hands off the current MK Connect session to loonars-sales so Jogja sales
 * staff and Super Admin don't have to log in a second time.
 *
 * Previously this redirected straight to loonars-sales with the user's real
 * Supabase session JWT in the `token` query string param -- a bearer
 * credential in a URL is a security smell (browser history, server access
 * logs, any CDN/proxy in between, and the Referer header of whatever
 * loonars-sales navigates to next could all end up holding it for far
 * longer than the token's own 1-hour expiry). It now mints a short-lived,
 * single-use opaque exchange code instead: the real access_token is staged
 * server-side (see migration 0236_sso_exchange_codes.sql) and only the code
 * travels in the URL. loonars-sales is expected to exchange it
 * server-to-server via POST /api/sso/loonars-sales/exchange for the real
 * token before the code's 60s TTL elapses or it's consumed once, whichever
 * comes first -- see that route for the receiving side's contract.
 */
export async function GET() {
  await requirePermission(PERMISSIONS.LOONARS_SALES_VIEW);

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect("https://loonars.haluoleo.id/login");
  }

  // 32 random bytes, base64url-encoded -- unguessable and URL-safe without
  // percent-encoding.
  const code = randomBytes(32).toString("base64url");

  const admin = createAdminClient();
  const { error } = await admin.from("sso_exchange_codes").insert({ code, access_token: session.access_token });
  if (error) {
    return NextResponse.redirect("https://loonars.haluoleo.id/login?error=sso_unavailable");
  }

  const url = new URL("https://loonars.haluoleo.id/sso");
  url.searchParams.set("code", code);

  return NextResponse.redirect(url.toString());
}
