import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { buildCspHeader } from "@/lib/security/csp";
import type { Database } from "@/types/database.types";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth/callback", "/api/health"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Refreshes the Supabase auth session on every request, redirects
 * unauthenticated users away from protected routes, and attaches a
 * per-request nonce-based Content-Security-Policy to every response variant
 * (including redirects, for defense-in-depth). Called from the root
 * `middleware.ts`. Fine-grained (per-permission) authorization is enforced
 * again at the page/server-action level via RLS + `app_has_permission`.
 */
export async function updateSession(request: NextRequest) {
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

  if (user && (pathname === "/login" || pathname === "/")) {
    return withCsp(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  return supabaseResponse;
}
