import { Suspense } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { Sidebar } from "@/components/layout/sidebar";
import { Topnav } from "@/components/layout/topnav";
import { PushRegistration } from "@/components/shared/push-registration";
import { WebPushRegistration } from "@/components/shared/web-push-registration";
import { PERMISSIONS } from "@/constants/rbac";
import { RefundChatAlerts } from "@/features/refund/components/refund-chat-alerts";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <PushRegistration />
      <WebPushRegistration />
      {(hasPermission(session, PERMISSIONS.REFUND_MANAGE) || hasPermission(session, PERMISSIONS.REFUND_VIEW)) && (
        <Suspense fallback={null}>
          <RefundChatAlerts userId={session.userId} />
        </Suspense>
      )}
      <Sidebar permissions={session.permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topnav session={session} />
        <main className="flex-1 p-4 sm:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
