"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { cn } from "@/lib/utils";

import { markAllNotificationsReadAction, markNotificationReadAction } from "../actions/notification.actions";
import { listNotificationsAction } from "../actions/notification-query.actions";

const PAGE_SIZE = 20;

export function NotificationList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);

  const { data } = useQuery({
    queryKey: ["notifications-page", page],
    queryFn: () => listNotificationsAction(page),
  });

  const items = data?.items ?? [];

  async function handleClick(id: string, link: string | null, isRead: boolean) {
    if (!isRead) {
      await markNotificationReadAction(id);
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
    }
    if (link) router.push(link);
  }

  async function handleMarkAll() {
    await markAllNotificationsReadAction();
    queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            <CheckCheck className="h-4 w-4" /> Tandai semua dibaca
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={Bell} title="Belum ada notifikasi" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((notification) => (
              <li key={notification.id}>
                <button
                  onClick={() => handleClick(notification.id, notification.link, notification.is_read)}
                  className={cn(
                    "flex w-full flex-col gap-1 px-2 py-3 text-left transition-colors hover:bg-accent",
                    !notification.is_read && "bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {!notification.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <p className="text-sm font-medium">{notification.title}</p>
                  </div>
                  {notification.body && <p className="text-sm text-muted-foreground">{notification.body}</p>}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(notification.created_at), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}
