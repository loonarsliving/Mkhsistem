import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Bell } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { Notification } from "@/types/domain";

export function RecentNotificationsCard({ notifications }: { notifications: Notification[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Notifikasi Hari Ini</CardTitle>
        <Link href="/notifications" className="text-sm text-primary hover:underline">
          Lihat semua
        </Link>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <EmptyState icon={Bell} title="Tidak ada notifikasi baru" className="border-0 py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "/notifications"} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Bell className={`h-4 w-4 ${n.is_read ? "text-muted-foreground" : "text-primary"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${n.is_read ? "text-muted-foreground" : "font-medium"}`}>{n.title}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: idLocale })}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
