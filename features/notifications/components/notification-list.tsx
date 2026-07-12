"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Archive, Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { NOTIFICATION_CATEGORY_LABEL, type NotificationStatus } from "@/constants/app";
import { cn } from "@/lib/utils";

import { archiveNotificationAction, markAllNotificationsReadAction, markNotificationReadAction } from "../actions/notification.actions";
import { listNotificationsAction } from "../actions/notification-query.actions";

const PAGE_SIZE = 20;

const TABS: { value: "inbox" | NotificationStatus; label: string }[] = [
  { value: "inbox", label: "Semua" },
  { value: "unread", label: "Belum Dibaca" },
  { value: "archived", label: "Diarsipkan" },
];

export function NotificationList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<"inbox" | NotificationStatus>("inbox");
  const [page, setPage] = React.useState(1);

  const status = tab === "inbox" ? undefined : tab;

  const { data } = useQuery({
    queryKey: ["notifications-page", tab, page],
    queryFn: () => listNotificationsAction(page, status),
  });

  const items = data?.items ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
  }

  async function handleClick(id: string, link: string | null, isRead: boolean) {
    if (!isRead) {
      await markNotificationReadAction(id);
      invalidate();
    }
    if (link) router.push(link);
  }

  async function handleArchive(id: string) {
    await archiveNotificationAction(id);
    invalidate();
  }

  async function handleMarkAll() {
    await markAllNotificationsReadAction();
    invalidate();
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value as typeof tab);
              setPage(1);
            }}
          >
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            <CheckCheck className="h-4 w-4" /> Tandai semua dibaca
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={Bell} title="Belum ada notifikasi" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((notification) => (
              <li key={notification.id} className="flex items-start gap-2 px-2 py-3">
                <button
                  onClick={() => handleClick(notification.id, notification.link, notification.is_read)}
                  className={cn(
                    "flex flex-1 flex-col gap-1 text-left transition-colors hover:bg-accent",
                    !notification.is_read && "bg-primary/5",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {!notification.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <p className="text-sm font-medium">{notification.title}</p>
                    {notification.category && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {NOTIFICATION_CATEGORY_LABEL[notification.category] ?? notification.category}
                      </span>
                    )}
                  </div>
                  {notification.body && <p className="text-sm text-muted-foreground">{notification.body}</p>}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(notification.created_at), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                  </p>
                </button>
                {notification.status !== "archived" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Arsipkan notifikasi"
                    onClick={() => handleArchive(notification.id)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}
