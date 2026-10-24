import type { MetadataRoute } from "next";

import { APP_NAME } from "@/constants/app";

export const dynamic = "force-static";

/**
 * Home-screen manifest for /chat only (linked from app/(app)/chat/layout.tsx).
 * "Add to Home Screen" uses the linked manifest's start_url, not the page the
 * user was on -- with the root manifest (start_url "/") a shortcut added from
 * /chat opened the dashboard. Own `id` so it installs as a separate app from
 * the main MK Connect icon. Scope stays "/" so the login redirect
 * (/login?redirectTo=/chat) stays inside the installed app.
 */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/chat",
    name: `Chat — ${APP_NAME}`,
    short_name: "MKH Chat",
    description: "Loonars Connect: grup operasional & laporan Hospitality",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    background_color: "#f5fbfa",
    theme_color: "#0f766e",
    icons: [
      { src: "/images/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/images/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
