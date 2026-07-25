import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/constants/rbac";
import { requirePermission } from "@/lib/rbac/session";

/**
 * Hands off the current MK Connect session to loonars-sales so Jogja sales
 * staff and Super Admin don't have to log in a second time. loonars-sales
 * already calls this project's Supabase Auth token endpoint during its own
 * login (see its doLogin()), so it can validate this same access_token the
 * same way -- no separate shared secret to provision. The token is the
 * user's real Supabase session JWT, which already expires in 1 hour.
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

  const url = new URL("https://loonars.haluoleo.id/sso");
  url.searchParams.set("token", session.access_token);

  return NextResponse.redirect(url.toString());
}
