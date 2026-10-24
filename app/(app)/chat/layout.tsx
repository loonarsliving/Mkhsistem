import type { Metadata } from "next";

/**
 * Point "Add to Home Screen" on /chat at a manifest whose start_url is /chat
 * (app/chat-manifest.webmanifest/route.ts). Without this the root manifest
 * applies and the shortcut opens the dashboard instead of the chat.
 */
export const metadata: Metadata = {
  manifest: "/chat-manifest.webmanifest",
  appleWebApp: { capable: true, title: "MKH Chat", statusBarStyle: "default" },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
