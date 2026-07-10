import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static assets)
     * - _vercel (platform-injected assets, e.g. Speed Insights' script —
     *   must never be caught by the auth redirect below)
     * - favicon.ico, images, and other public files
     * - robots.txt, sitemap.xml, manifest.webmanifest, and the dynamically
     *   generated /icon route (app/robots.ts, sitemap.ts, manifest.ts,
     *   icon.tsx) — none carry a file extension the pattern below already
     *   excludes, so without this they'd get redirected to /login for an
     *   unauthenticated crawler/browser request instead of serving content.
     */
    "/((?!_next/static|_next/image|_vercel|favicon.ico|images/|icon$|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|gif)$).*)",
  ],
};
