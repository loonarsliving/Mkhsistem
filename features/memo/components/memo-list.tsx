import Link from "next/link";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Pin, StickyNote } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PriorityBadge } from "@/components/shared/status-badge";
import { getInitials } from "@/lib/utils";
import type { MemoPriority } from "@/constants/app";

interface MemoListItem {
  id: string;
  title: string;
  content: string;
  priority: string;
  is_pinned: boolean;
  is_mandatory_read: boolean;
  published_at: string;
  created_by_employee: { full_name: string; avatar_url: string | null } | null;
}

export function MemoList({ memos }: { memos: MemoListItem[] }) {
  if (memos.length === 0) {
    return <EmptyState icon={StickyNote} title="Belum ada memo" description="Memo yang dipublikasikan akan muncul di sini." />;
  }

  return (
    <div className="space-y-3">
      {memos.map((memo) => (
        <Link key={memo.id} href={`/memo/${memo.id}`}>
          <Card className="transition-colors hover:border-primary">
            <CardContent className="flex gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                {memo.is_pinned ? <Pin className="h-5 w-5 text-primary" /> : <StickyNote className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{memo.title}</p>
                  <PriorityBadge priority={memo.priority as MemoPriority} />
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{memo.content}</p>
                <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                    {memo.created_by_employee ? getInitials(memo.created_by_employee.full_name) : "-"}
                  </span>
                  {memo.created_by_employee?.full_name}
                  <span>·</span>
                  {format(new Date(memo.published_at), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                  {memo.is_mandatory_read && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-destructive">Wajib dibaca</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
