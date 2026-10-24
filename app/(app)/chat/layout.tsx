import type { Metadata, Viewport } from "next";

/**
 * Point "Add to Home Screen" on /chat at a manifest whose start_url is /chat
 * (app/chat-manifest.webmanifest/route.ts). Without this the root manifest
 * applies and the shortcut opens the dashboard instead of the chat.
 */
export const metadata: Metadata = {
  manifest: "/chat-manifest.webmanifest",
  appleWebApp: { capable: true, title: "MKH Chat", statusBarStyle: "default" },
};

/**
 * Android Chrome: let the on-screen keyboard shrink the layout (100dvh) so the
 * composer stays right above it, like WhatsApp. iOS ignores this key; the chat
 * follows the visual viewport there instead (chat-app.tsx).
 */
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
