import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, Paperclip, Pin } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STORAGE_BUCKETS } from "@/constants/app";
import { MemoDeleteButton, MemoReadButton, MemoShareButton } from "@/features/memo/components/memo-detail-actions";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getInitials } from "@/lib/utils";
import { getMemoById, getMemoReadReceipts, hasUserReadMemo } from "@/repositories/memo.repository";
import { getSignedUrls } from "@/services/storage.service";
import type { MemoPriority } from "@/constants/app";

export const metadata: Metadata = { title: "Detail Memo" };

export default async function MemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const memo = await getMemoById(supabase, id).catch(() => null);
  if (!memo) notFound();

  const canManage = hasPermission(session, "memo.manage") || memo.created_by === session.userId;
  const [alreadyRead, attachmentUrls, receipts] = await Promise.all([
    hasUserReadMemo(supabase, id, session.userId),
    getSignedUrls(
      STORAGE_BUCKETS.MEMO_ATTACHMENTS,
      (memo.memo_attachments as { file_url: string }[]).map((a) => a.file_url),
    ),
    canManage ? getMemoReadReceipts(supabase, id) : Promise.resolve(null),
  ]);

  const author = memo.created_by_employee as { full_name: string; avatar_url: string | null } | null;
  const attachments = memo.memo_attachments as { id: string; file_url: string; file_name: string }[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={memo.title}
        actions={
          <div className="flex gap-2">
            <MemoShareButton memoId={memo.id} title={memo.title} />
            {canManage && <MemoDeleteButton memoId={memo.id} />}
          </div>
        }
      />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {memo.is_pinned && (
              <span className="flex items-center gap-1 text-xs font-medium text-primary">
                <Pin className="h-3.5 w-3.5" /> Disematkan
              </span>
            )}
            <PriorityBadge priority={memo.priority as MemoPriority} />
            {memo.is_mandatory_read && <span className="text-xs font-medium text-destructive">Wajib dibaca</span>}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {author ? getInitials(author.full_name) : "-"}
            </span>
            <div>
              <p className="font-medium text-foreground">{author?.full_name}</p>
              <p>{format(new Date(memo.published_at), "dd MMMM yyyy, HH:mm", { locale: idLocale })}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{memo.content}</div>

          {attachments.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium">Lampiran</p>
              {attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachmentUrls[attachment.file_url]}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{attachment.file_name}</span>
                  <Download className="h-4 w-4 text-muted-foreground" />
                </a>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-4">
            <MemoReadButton memoId={memo.id} alreadyRead={alreadyRead} />
          </div>
        </CardContent>
      </Card>

      {receipts && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Status Pembacaan ({receipts.reads.length}/{receipts.audienceCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {receipts.reads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada yang membaca memo ini.</p>
            ) : (
              <ul className="divide-y divide-border">
                {receipts.reads.map((r) => {
                  const emp = r.employees as { full_name: string; employee_code: string } | null;
                  return (
                    <li key={r.user_id} className="flex items-center justify-between py-2 text-sm">
                      <span>{emp?.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(r.read_at), "dd MMM yyyy, HH:mm")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
