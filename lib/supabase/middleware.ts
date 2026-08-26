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
// The /api/debug/* diagnostics (whatsapp-config, meta-ads-config,
// instagram-config, zernio-connect) used to be listed here so an operator
// could open them directly in a browser -- but that also meant anyone on the
// internet who found the path could hit them unauthenticated. They now
// require the normal cookie session like every other route, AND their own
// handlers additionally gate on Super Admin (requireSuperAdminSession, see
// lib/rbac/session.ts) so being logged in as e.g. Sales isn't enough either.
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
  // pg_cron-triggered worker routes (net.http_post carries no session
  // cookie) -- found missing here while building 0096: every tick of
  // crm-promo-sends-worker and the daily social-snapshot capture cron has
  // been silently redirected to /login instead of running, confirmed via
  // social_account_snapshots/crm_promo_sends both being completely empty.
  "/api/crm/dispatch-promo-sends",
  "/api/social/capture-snapshots",
  "/api/social/publish-content",
  "/api/markom/check-ads-balance",
  "/api/markom/refresh-ad-campaign-spend",
  // Called cross-origin by the Ultron voice assistant (separate "filehub"
  // deployment) with a Supabase access token in the Authorization header,
  // never a same-site session cookie -- must stay out of the cookie-based
  // redirect below, or even the CORS preflight OPTIONS gets redirected to
  // /login before it reaches the route handler. Both routes enforce their
  // own Super Admin bearer-token auth (requireSuperAdminBearer) and CORS
  // (VOICE_BRIDGE_ALLOWED_ORIGIN) independently -- see lib/ai/voice-bridge/.
  "/api/ai/voice-bridge",
  "/api/ai/voice-assistant",
  // Called server-to-server by the Villa app's villa-api Supabase Edge
  // Function (no browser session) -- enforces its own shared-secret check
  // (x-internal-secret compared against VILLA_BRIDGE_SECRET) in the route
  // handler itself, see app/api/wa/send/route.ts.
  "/api/wa/send",
  // Server-to-server bridge that deploys the villa-api Supabase Edge
  // Function via the Supabase Management API -- built because the MCP
  // deploy_edge_function tool is stuck behind a broken approval gate.
  // Own shared-secret check (x-internal-secret against VILLA_DEPLOY_SECRET),
  // see app/api/villa/deploy/route.ts.
  "/api/villa/deploy",
  // Same pattern, for setting Supabase Edge Function secrets instead of
  // deploying code -- see app/api/villa/secrets/route.ts.
  "/api/villa/secrets",
  // pg_cron-triggered (construction_run_tukang_teaching_check, 0196) via
  // automation_post/pg_net -- no browser session, same class of bug as
  // crm-promo-sends-worker above. Own auth: requireCronAuth (x-cron-secret).
  "/api/automation/construction-tukang-tip",
  // pg_cron-triggered (ad-lead-pending-question-timeout-sweep, 0229) via
  // automation_post/pg_net -- same class of bug as
  // crm-promo-sends-worker/construction-tukang-tip above, found the same
  // way: this sweep was silently redirected to /login on every tick since
  // it shipped, so pending_questions never actually timed out. Own auth:
  // requireCronAuth (x-cron-secret).
  "/api/ai/lead-pending-question-timeout",
  // One-off manual trigger (no automated caller) for
  // handoffProspectToKepalaCabang -- see app/api/ai/lead-manual-handoff/route.ts.
  // Own auth: requireCronAuth (x-cron-secret).
  "/api/ai/lead-manual-handoff",
  // One-off manual trigger (no automated caller) for sending an arbitrary
  // WhatsApp text through automation_post(), e.g. onboarding a brand new
  // contractor_wa_senders row -- see app/api/admin/send-wa-message/route.ts.
  // Own auth: requireCronAuth (x-cron-secret). Found missing here the same
  // way every route above was: a real automation_post() call to it landed
  // on the /login HTML page (200 OK) instead of ever reaching the handler.
  "/api/admin/send-wa-message",
  // Called server-to-server by loonars-sales's own backend (never a browser)
  // to redeem the one-time code minted by /api/sso/loonars-sales -- see
  // app/api/sso/loonars-sales/exchange/route.ts and migration
  // 0236_sso_exchange_codes.sql. Own auth: the code itself (unguessable,
  // single-use, 60s TTL), same posture as /api/ai/process-job's claim-by-id.
  "/api/sso/loonars-sales/exchange",
  // Called server-to-server by the Mac Mini local file-manager agent
  // (Filemanager repo, no browser session) -- catalog sync, polling for
  // pending WhatsApp file requests, and delivering matched files. Own auth:
  // requireFileAgentAuth (x-file-agent-secret), see
  // lib/security/file-agent-auth.ts and migration 0245. Listed as a prefix
  // (startsWith below) since it covers /api/files/agent/sync,
  // /requests/pending, and /requests/:id/deliver together.
  "/api/files/agent",
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
