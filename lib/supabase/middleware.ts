import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { buildCspHeader } from "@/lib/security/csp";
import type { Database } from "@/types/database.types";

// /api/push/send and /api/ai/whatsapp-relay are called by the mkc_notifications
// DB trigger (server-to-server, no browser session) -- see their own route
// files for request-level authorization (re-fetches by id, rejects anything
// not created in the last 2 minutes). /api/integrations/whatsapp/webhook is
// called by Meta directly (Meta's own verify-token handshake is its auth).
// /api/debug/whatsapp-config is TEMPORARY -- meant to be opened directly in a
// browser for diagnosis, returns booleans/labels only, never a secret value.
// /api/ai/process-job is called by the ai_job_queue insert trigger and the
// pg_cron sweep (migration 0065), server-to-server -- its own atomic claim
// (UPDATE ... WHERE status = 'pending') is the request-level authorization:
// job_id is an unguessable v4 UUID, and any call against an already-claimed
// job is a safe no-op, mirroring /api/push/send's re-fetch-by-id pattern.
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  // Must stay publicly reachable without login -- Meta/TikTok app review
  // (and end users) need to open these URLs directly, not get redirected
  // to /login.
  "/privacy-policy",
  "/terms-of-service",
  "/api/health",
  "/api/push/send",
  "/api/ai/whatsapp-relay",
  "/api/ai/process-job",
  "/api/integrations/whatsapp/webhook",
  "/api/debug/whatsapp-config",
  "/api/debug/meta-ads-config",
  // pg_cron-triggered worker routes (net.http_post carries no session
  // cookie) -- found missing here while building 0096: every tick of
  // crm-promo-sends-worker and the daily social-snapshot capture cron has
  // been silently redirected to /login instead of running, confirmed via
  // social_account_snapshots/crm_promo_sends both being completely empty.
  "/api/crm/dispatch-promo-sends",
  "/api/social/capture-snapshots",
  "/api/social/publish-content",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const REQUIRED_ENV_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

/**
 * Refreshes the Supabase auth session on every request, redirects
 * unauthenticated users away from protected routes, and attaches a
 * per-request nonce-based Content-Security-Policy to every response variant
 * (including redirects, for defense-in-depth). Called from the root
 * `middleware.ts`. Fine-grained (per-permission) authorization is enforced
 * again at the page/server-action level via RLS + `app_has_permission`.
 *
 * Middleware runs on every request, so an uncaught throw here takes the
 * entire site down at once (Vercel surfaces it as the opaque
 * MIDDLEWARE_INVOCATION_FAILED, with no detail). Two safeguards against
 * that: an explicit env-var check that fails loud with a specific message
 * (a misconfigured deployment needs a human to notice and fix it), and a
 * catch-all around the Supabase call that fails closed — redirect to
 * /login — instead of crashing the whole request.
 */
export async function updateSession(request: NextRequest) {
  const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missingEnvVars.length > 0) {
    logger.error("Middleware misconfigured: missing required environment variables", { missingEnvVars });
    return new NextResponse(
      `Configuration error: missing environment variable(s) ${missingEnvVars.join(", ")}. Set them in the Vercel project's Environment Variables (Production scope) and redeploy.`,
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const { nonce, header: cspHeader } = buildCspHeader();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce for its own generated <script> tags from this
  // request header, not from the response header set below — omitting this
  // silently breaks hydration under 'strict-dynamic'.
  requestHeaders.set("Content-Security-Policy", cspHeader);

  function withCsp(response: NextResponse) {
    response.headers.set("Content-Security-Policy", cspHeader);
    return response;
  }

  let supabaseResponse = withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  try {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
            cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    if (!user && !isPublicPath(pathname)) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("redirectTo", pathname);
      return withCsp(NextResponse.redirect(redirectUrl));
    }

    if (user && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
      return withCsp(NextResponse.redirect(new URL("/dashboard", request.url)));
    }

    return supabaseResponse;
  } catch (error) {
    logger.error("Middleware failed unexpectedly", { error: error instanceof Error ? error.message : String(error) });
    const { pathname } = request.nextUrl;
    if (isPublicPath(pathname)) {
      return supabaseResponse;
    }
    return withCsp(NextResponse.redirect(new URL("/login", request.url)));
  }
}
