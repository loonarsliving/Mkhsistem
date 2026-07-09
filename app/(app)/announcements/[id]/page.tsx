import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, Paperclip, Pin } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { STORAGE_BUCKETS } from "@/constants/app";
import { AnnouncementDeleteButton } from "@/features/announcements/components/announcement-delete-button";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getInitials } from "@/lib/utils";
import { getAnnouncementById } from "@/repositories/announcement.repository";
import { getSignedUrls } from "@/services/storage.service";

export const metadata: Metadata = { title: "Detail Pengumuman" };

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const announcement = await getAnnouncementById(supabase, id).catch(() => null);
  if (!announcement) notFound();

  const canManage = hasPermission(session, "announcement.manage") || announcement.created_by === session.userId;
  const attachments = announcement.announcement_attachments as { id: string; file_url: string; file_name: string }[];
  const attachmentUrls = await getSignedUrls(
    STORAGE_BUCKETS.ANNOUNCEMENT_ATTACHMENTS,
    attachments.map((a) => a.file_url),
  );

  const author = announcement.created_by_employee as { full_name: string; avatar_url: string | null } | null;
  const category = announcement.announcement_categories as { name: string; color: string } | null;
  const expired = announcement.expires_at ? new Date(announcement.expires_at) < new Date() : false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={announcement.title} actions={canManage && <AnnouncementDeleteButton announcementId={announcement.id} />} />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {announcement.is_pinned && (
              <span className="flex items-center gap-1 text-xs font-medium text-primary">
                <Pin className="h-3.5 w-3.5" /> Disematkan
              </span>
            )}
            {category && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: category.color }}>
                {category.name}
              </span>
            )}
            {expired && <span className="text-xs font-medium text-destructive">Kedaluwarsa</span>}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {author ? getInitials(author.full_name) : "-"}
            </span>
            <div>
              <p className="font-medium text-foreground">{author?.full_name}</p>
              <p>{format(new Date(announcement.published_at), "dd MMMM yyyy, HH:mm", { locale: idLocale })}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{announcement.content}</div>

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
        </CardContent>
      </Card>
    </div>
  );
}
