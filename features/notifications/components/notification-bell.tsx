"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

import { markAllNotificationsReadAction, markNotificationReadAction } from "../actions/notification.actions";
import { useNotifications } from "../hooks/use-notifications";

export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const { notifications, unreadCount } = useNotifications(userId);

  async function handleClick(notificationId: string, link: string | null, isRead: boolean) {
    if (!isRead) await markNotificationReadAction(notificationId);
    if (link) router.push(link);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifikasi">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Notifikasi</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllNotificationsReadAction()}>
              <CheckCheck className="h-4 w-4" /> Tandai semua dibaca
            </Button>
          )}
        </div>
        <Separator />
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <EmptyState icon={Bell} title="Belum ada notifikasi" className="border-0 py-10" />
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleClick(notification.id, notification.link, notification.is_read)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-accent",
                  !notification.is_read && "bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2">
                  {!notification.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <p className="truncate font-medium">{notification.title}</p>
                </div>
                {notification.body && <p className="line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>}
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: idLocale })}
                </p>
              </button>
            ))
          )}
        </div>
        <Separator />
        <Link href="/notifications" className="block px-4 py-2.5 text-center text-sm text-primary hover:underline">
          Lihat semua notifikasi
        </Link>
      </PopoverContent>
    </Popover>
  );
}
