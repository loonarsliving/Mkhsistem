"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Instagram, Loader2, Music2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";

import {
  createCompetitorAccountAction,
  createCompetitorContentLogAction,
  deactivateCompetitorAccountAction,
  listCompetitorAccountsAction,
  listCompetitorContentLogsAction,
} from "../actions/social.actions";

const PLATFORM_ICON = { instagram: Instagram, tiktok: Music2 } as const;

export function CompetitorTracker({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [logTarget, setLogTarget] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [newPlatform, setNewPlatform] = React.useState<"instagram" | "tiktok">("instagram");
  const [newHandle, setNewHandle] = React.useState("");
  const [newDisplayName, setNewDisplayName] = React.useState("");

  const [logType, setLogType] = React.useState<string>("reel");
  const [logUrl, setLogUrl] = React.useState("");
  const [logHook, setLogHook] = React.useState("");
  const [logDuration, setLogDuration] = React.useState("");
  const [logCaption, setLogCaption] = React.useState("");
  const [logHashtags, setLogHashtags] = React.useState("");
  const [logEngagement, setLogEngagement] = React.useState("");

  const { data: competitors, isLoading } = useQuery({ queryKey: ["content-planner-competitors"], queryFn: listCompetitorAccountsAction });
  const { data: recentLogs } = useQuery({ queryKey: ["content-planner-competitor-logs"], queryFn: () => listCompetitorContentLogsAction() });

  async function handleAddCompetitor() {
    setSubmitting(true);
    const result = await createCompetitorAccountAction({ platform: newPlatform, handle: newHandle, displayName: newDisplayName || undefined });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambahkan kompetitor");
      return;
    }
    toast.success("Kompetitor ditambahkan");
    setNewHandle("");
    setNewDisplayName("");
    setAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ["content-planner-competitors"] });
  }

  async function handleDeleteCompetitor() {
    if (!deleteTarget) return;
    setSubmitting(true);
    const result = await deactivateCompetitorAccountAction(deleteTarget);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus kompetitor");
      return;
    }
    toast.success("Kompetitor dihapus dari daftar pantauan");
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["content-planner-competitors"] });
  }

  async function handleAddLog() {
    if (!logTarget) return;
    setSubmitting(true);
    const result = await createCompetitorContentLogAction({
      competitorAccountId: logTarget,
      contentUrl: logUrl || undefined,
      contentType: logType as "reel" | "video" | "photo" | "carousel" | "story" | "other",
      hook: logHook || undefined,
      durationSeconds: logDuration ? Number(logDuration) : undefined,
      caption: logCaption || undefined,
      hashtags: logHashtags || undefined,
      engagementNotes: logEngagement || undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat konten kompetitor");
      return;
    }
    toast.success("Konten kompetitor dicatat -- akan jadi bahan riset AI");
    setLogTarget(null);
    setLogUrl("");
    setLogHook("");
    setLogDuration("");
    setLogCaption("");
    setLogHashtags("");
    setLogEngagement("");
    queryClient.invalidateQueries({ queryKey: ["content-planner-competitor-logs"] });
  }

  const items = competitors ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Kompetitor Dipantau</p>
        {canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5" /> Tambah Kompetitor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Kompetitor</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Select value={newPlatform} onValueChange={(v) => setNewPlatform(v as "instagram" | "tiktok")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="@handle" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} />
                <Input placeholder="Nama tampilan (opsional)" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
              </div>
              <DialogFooter>
                <Button disabled={submitting || !newHandle} onClick={handleAddCompetitor}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Simpan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isLoading && items.length === 0 && (
        <EmptyState icon={Instagram} title="Belum ada kompetitor" description="Tambahkan akun kompetitor Instagram/TikTok untuk dipantau timMarkom." />
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            const Icon = PLATFORM_ICON[c.platform];
            return (
              <Card key={c.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">@{c.handle}</p>
                    </div>
                    <Badge variant="secondary">{c.platform}</Badge>
                  </div>
                  {c.display_name && <p className="text-xs text-muted-foreground">{c.display_name}</p>}
                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setLogTarget(c.id)}>
                        <Plus className="h-3.5 w-3.5" /> Catat Konten
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {recentLogs && recentLogs.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Konten Kompetitor Tercatat Terbaru</p>
          <div className="space-y-2">
            {recentLogs.slice(0, 5).map((log) => {
              const competitor = log.competitor as { platform?: string; handle?: string } | null;
              return (
                <Card key={log.id}>
                  <CardContent className="space-y-1 p-3 text-sm">
                    <p className="font-medium">
                      @{competitor?.handle} {log.content_type && <Badge variant="secondary">{log.content_type}</Badge>}
                    </p>
                    {log.hook && <p className="text-xs text-muted-foreground">Hook: {log.hook}</p>}
                    {log.caption && <p className="text-xs text-muted-foreground line-clamp-2">Caption: {log.caption}</p>}
                    {log.engagement_notes && <p className="text-xs text-muted-foreground">Engagement: {log.engagement_notes}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={logTarget !== null} onOpenChange={(open) => !open && setLogTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Catat Konten Kompetitor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={logType} onValueChange={setLogType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reel">Reel</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="photo">Foto</SelectItem>
                <SelectItem value="carousel">Carousel</SelectItem>
                <SelectItem value="story">Story</SelectItem>
                <SelectItem value="other">Lainnya</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Link konten (opsional)" value={logUrl} onChange={(e) => setLogUrl(e.target.value)} />
            <Input placeholder="Hook pembuka" value={logHook} onChange={(e) => setLogHook(e.target.value)} />
            <Input placeholder="Durasi (detik)" type="number" value={logDuration} onChange={(e) => setLogDuration(e.target.value)} />
            <Textarea placeholder="Caption" value={logCaption} onChange={(e) => setLogCaption(e.target.value)} rows={2} />
            <Input placeholder="Hashtag" value={logHashtags} onChange={(e) => setLogHashtags(e.target.value)} />
            <Textarea
              placeholder="Catatan engagement (mis. likes/comments yang terlihat)"
              value={logEngagement}
              onChange={(e) => setLogEngagement(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button disabled={submitting} onClick={handleAddLog}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Simpan Catatan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus kompetitor ini dari pantauan?"
        confirmLabel="Hapus"
        destructive
        loading={submitting}
        onConfirm={handleDeleteCompetitor}
      />
    </div>
  );
}
