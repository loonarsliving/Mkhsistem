import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Pin, StickyNote } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PriorityBadge } from "@/components/shared/status-badge";
import type { MemoPriority } from "@/constants/app";

interface RecentMemoItem {
  id: string;
  title: string;
  priority: string;
  is_pinned: boolean;
  is_mandatory_read: boolean;
  published_at: string;
}

export function RecentMemoList({ memos }: { memos: RecentMemoItem[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Memo Terbaru</CardTitle>
        <Link href="/memo" className="text-sm text-primary hover:underline">
          Lihat semua
        </Link>
      </CardHeader>
      <CardContent>
        {memos.length === 0 ? (
          <EmptyState icon={StickyNote} title="Belum ada memo" className="border-0 py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {memos.map((memo) => (
              <li key={memo.id}>
                <Link href={`/memo/${memo.id}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    {memo.is_pinned ? <Pin className="h-4 w-4 text-primary" /> : <StickyNote className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{memo.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <PriorityBadge priority={memo.priority as MemoPriority} />
                      {memo.is_mandatory_read && (
                        <span className="text-xs font-medium text-destructive">Wajib dibaca</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(memo.published_at), { addSuffix: true, locale: idLocale })}
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
