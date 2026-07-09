import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Notifikasi" };

export default async function NotificationsPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Notifikasi" description="Semua notifikasi Anda." />
      <NotificationList />
    </div>
  );
}
