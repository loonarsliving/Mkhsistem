import Link from "next/link";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Megaphone, Pin } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { getInitials } from "@/lib/utils";

interface AnnouncementListItem {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  published_at: string;
  expires_at: string | null;
  announcement_categories: { name: string; color: string } | null;
  created_by_employee: { full_name: string; avatar_url: string | null } | null;
}

export function AnnouncementList({ announcements }: { announcements: AnnouncementListItem[] }) {
  if (announcements.length === 0) {
    return <EmptyState icon={Megaphone} title="Belum ada pengumuman" description="Pengumuman yang dipublikasikan akan muncul di sini." />;
  }

  return (
    <div className="space-y-3">
      {announcements.map((item) => {
        const expired = item.expires_at ? new Date(item.expires_at) < new Date() : false;
        return (
          <Link key={item.id} href={`/announcements/${item.id}`}>
            <Card className={`transition-colors hover:border-primary ${expired ? "opacity-60" : ""}`}>
              <CardContent className="flex gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {item.is_pinned ? <Pin className="h-5 w-5 text-primary" /> : <Megaphone className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{item.title}</p>
                    {item.announcement_categories && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: item.announcement_categories.color }}
                      >
                        {item.announcement_categories.name}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{item.content}</p>
                  <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                      {item.created_by_employee ? getInitials(item.created_by_employee.full_name) : "-"}
                    </span>
                    {item.created_by_employee?.full_name}
                    <span>·</span>
                    {format(new Date(item.published_at), "dd MMM yyyy", { locale: idLocale })}
                    {expired && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-destructive">Kedaluwarsa</span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
