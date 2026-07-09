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
     */
    "/((?!_next/static|_next/image|_vercel|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|webp|gif)$).*)",
  ],
};
