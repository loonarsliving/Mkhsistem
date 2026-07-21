"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, RefreshCw, Send, Trash2, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uploadEntityFile } from "@/lib/supabase/storage";
import type { ContentStudioFocus } from "@/repositories/content-submissions.repository";

import { listKpiTasksAction } from "../actions/markom-query.actions";
import {
  createContentSubmissionAction,
  deleteContentSubmissionAction,
  listContentSubmissionsAction,
  markContentPublishedAction,
  publishContentNowAction,
  retryContentReviewAction,
} from "../actions/content-submission.actions";

const MAX_CONTENT_SIZE_BYTES = 50 * 1024 * 1024;
const AUTO_PUBLISH_SCORE_THRESHOLD = 8.5;

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "default" | "success" | "destructive" }> = {
  pending_review: { label: "Menunggu Review AI", variant: "default" },
  needs_revision: { label: "Perlu Revisi", variant: "destructive" },
  approved: { label: "Disetujui AI", variant: "success" },
  scheduled: { label: "Terjadwal Tayang Otomatis", variant: "secondary" },
  published: { label: "Sudah Tayang", variant: "success" },
  failed: { label: "Gagal Publish", variant: "destructive" },
};

/** Content Studio -- one board per submenu (Leasehold/Villa/Beauty), see app/(app)/markom/content-studio/[focus]/page.tsx. Beauty has no kpi_tasks brief to attach to, so the task picker only shows for the other two focuses. */
export function ContentStudioBoard({ focus, hasTaskBrief }: { focus: ContentStudioFocus; hasTaskBrief: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const now = new Date();

  const [taskId, setTaskId] = React.useState<string>("");
  const [platform, setPlatform] = React.useState<"instagram" | "tiktok">("instagram");
  const [caption, setCaption] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const { data: tasks } = useQuery({
    queryKey: ["markom-team-tasks-for-submission", focus, now.getMonth(), now.getFullYear()],
    queryFn: () => listKpiTasksAction({ periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1, contentFocus: focus === "beauty" ? undefined : focus }),
    enabled: hasTaskBrief,
  });
  const { data: submissions, isLoading } = useQuery({
    queryKey: ["markom-content-submissions", focus],
    queryFn: () => listContentSubmissionsAction(focus),
  });

  React.useEffect(() => {
    if (hasTaskBrief && !taskId && tasks && tasks.length > 0) setTaskId(tasks[0].id);
  }, [tasks, taskId, hasTaskBrief]);

  function invalidateSubmissions() {
    queryClient.invalidateQueries({ queryKey: ["markom-content-submissions", focus] });
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (hasTaskBrief && !taskId) {
      toast.error("Pilih task/brief terlebih dahulu");
      return;
    }
    const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";

    setUploading(true);
    try {
      const { path, publicUrl } = await uploadEntityFile("markom-content-submissions", taskId || focus, file, MAX_CONTENT_SIZE_BYTES);
      if (!publicUrl) throw new Error("Gagal mendapatkan URL konten");

      const result = await createContentSubmissionAction({
        taskId: hasTaskBrief ? taskId : undefined,
        contentFocus: focus,
        platform,
        storagePath: path,
        publicUrl,
        mediaType,
        mimeType: file.type,
        caption: caption || undefined,
      });
      if (!result.success) throw new Error(result.error ?? "Gagal menyimpan konten");

      toast.success(result.data?.aiReviewed ? "Konten terkirim, AI sudah selesai mereview" : "Konten tersimpan, tapi AI belum sempat mereview -- coba \"Review Ulang\" di bawah");
      setCaption("");
      invalidateSubmissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah konten");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRetryReview(id: string) {
    setBusyId(id);
    try {
      const result = await retryContentReviewAction(id);
      if (!result.success) {
        toast.error(result.error ?? "Gagal mereview ulang");
        return;
      }
      toast[result.data?.aiReviewed ? "success" : "error"](result.data?.aiReviewed ? "Review AI selesai" : "AI masih belum bisa merespons, coba lagi nanti");
      invalidateSubmissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mereview ulang");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublishNow(id: string) {
    setBusyId(id);
    try {
      const result = await publishContentNowAction(id);
      if (!result.success) {
        toast.error(result.error ?? "Gagal menayangkan konten");
        return;
      }
      toast.success("Konten berhasil ditayangkan");
      invalidateSubmissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menayangkan konten");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkPublished(id: string) {
    setBusyId(id);
    try {
      const result = await markContentPublishedAction(id);
      if (!result.success) {
        toast.error(result.error ?? "Gagal menandai konten selesai");
        return;
      }
      toast.success("Ditandai selesai");
      invalidateSubmissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menandai konten selesai");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteContentSubmissionAction(deleteTarget);
    setDeleting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus konten");
      return;
    }
    toast.success("Konten dihapus");
    setDeleteTarget(null);
    invalidateSubmissions();
  }

  const items = submissions ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          {hasTaskBrief && (
            <div className="min-w-56 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Brief/Task</p>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih brief checklist" />
                </SelectTrigger>
                <SelectContent>
                  {(tasks ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-40 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Platform</p>
            <Select value={platform} onValueChange={(v) => setPlatform(v as "instagram" | "tiktok")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-56 flex-1 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Caption (opsional)</p>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption yang akan dipakai saat konten tayang..." rows={1} />
          </div>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime" hidden onChange={(e) => handleUpload(e.target.files)} />
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || (hasTaskBrief && !taskId)}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Upload Konten
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            AI akan memberi skor 0-10 untuk konten yang Anda upload (untuk foto, AI benar-benar melihat isi gambarnya; untuk video, AI menilai berdasarkan caption &amp; brief
            saja karena belum bisa menonton video). Skor {AUTO_PUBLISH_SCORE_THRESHOLD} ke atas otomatis dijadwalkan dan ditayangkan sistem sendiri lewat Zernio pada jam
            terbaik; di bawah itu Anda perlu merevisi lalu upload ulang.
          </p>
        </CardContent>
      </Card>

      {!isLoading && items.length === 0 && (
        <EmptyState icon={UploadCloud} title="Belum ada konten diupload" description="Upload konten untuk submenu ini di atas." />
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((s) => {
            const statusInfo = STATUS_LABEL[s.status] ?? { label: s.status, variant: "secondary" as const };
            const task = s.task as { title?: string; description?: string } | null;
            return (
              <Card key={s.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
                  <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-32">
                    {s.media_type === "video" ? (
                      <video src={s.public_url} className="h-full w-full object-cover" muted />
                    ) : (
                      <Image src={s.public_url} alt={task?.title ?? "Konten"} fill sizes="128px" className="object-cover" unoptimized />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{task?.title ?? "Konten mandiri"}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.media_type === "video" ? "Video" : "Foto"} &middot; {s.platform === "instagram" ? "Instagram" : "TikTok"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.ai_score !== null && <Badge variant="outline">Skor {s.ai_score}</Badge>}
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                    </div>
                    {s.caption && <p className="text-sm text-muted-foreground">{s.caption}</p>}
                    {s.ai_verdict && (
                      <p className="rounded-md bg-muted/50 p-2 text-xs text-foreground">
                        <span className="font-medium">Review AI:</span> {s.ai_verdict}
                      </p>
                    )}
                    {s.status === "scheduled" && s.scheduled_publish_at && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Akan tayang otomatis {new Date(s.scheduled_publish_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    )}
                    {s.status === "published" && s.published_at && (
                      <p className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Tayang {new Date(s.published_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                        {s.zernio_permalink && (
                          <a href={s.zernio_permalink} target="_blank" rel="noreferrer" className="ml-1 underline">
                            Lihat post
                          </a>
                        )}
                      </p>
                    )}
                    {s.status === "failed" && s.failure_reason && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        {s.failure_reason}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {(s.status === "pending_review" || s.status === "needs_revision" || s.status === "failed") && (
                        <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => handleRetryReview(s.id)}>
                          {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Review Ulang
                        </Button>
                      )}
                      {s.status === "scheduled" && (
                        <Button size="sm" disabled={busyId === s.id} onClick={() => handlePublishNow(s.id)}>
                          {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Tayangkan Sekarang
                        </Button>
                      )}
                      {(s.status === "approved" || s.status === "scheduled") && (
                        <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => handleMarkPublished(s.id)}>
                          {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Tandai Sudah Dipublish Manual
                        </Button>
                      )}
                      {(s.status === "pending_review" || s.status === "needs_revision" || s.status === "approved" || s.status === "failed") && (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === s.id} onClick={() => setDeleteTarget(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus konten ini?"
        description="Konten yang sudah tayang/terjadwal tidak bisa dihapus dari sini."
        confirmLabel="Hapus"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
