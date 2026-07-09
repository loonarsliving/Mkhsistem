import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Megaphone, Pin } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

interface RecentAnnouncementItem {
  id: string;
  title: string;
  is_pinned: boolean;
  published_at: string;
  announcement_categories: { name: string; color: string } | null;
}

export function RecentAnnouncementList({ announcements }: { announcements: RecentAnnouncementItem[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Pengumuman Terbaru</CardTitle>
        <Link href="/announcements" className="text-sm text-primary hover:underline">
          Lihat semua
        </Link>
      </CardHeader>
      <CardContent>
        {announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="Belum ada pengumuman" className="border-0 py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {announcements.map((item) => (
              <li key={item.id}>
                <Link href={`/announcements/${item.id}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    {item.is_pinned ? <Pin className="h-4 w-4 text-primary" /> : <Megaphone className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {item.announcement_categories && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: item.announcement_categories.color }}
                        >
                          {item.announcement_categories.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.published_at), { addSuffix: true, locale: idLocale })}
                      </span>
                    </div>
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
