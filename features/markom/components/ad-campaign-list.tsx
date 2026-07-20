"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Eye, Loader2, MessageCircle, MousePointerClick, Pause, Play, Rocket, Search, Send, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatTile } from "@/components/shared/stat-tile";
import { listProjectsForPhotoUploadAction } from "../actions/project-photo.actions";
import {
  analyzeAdCampaignAction,
  deleteAdCampaignDraftAction,
  launchDraftCampaignAction,
  listAdCampaignsAction,
  requestAdsResearchAction,
  setAdCampaignStatusAction,
} from "../actions/ads.actions";

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "default" | "success" | "destructive" }> = {
  draft: { label: "Draft -- menunggu diluncurkan", variant: "default" },
  active: { label: "Aktif", variant: "success" },
  paused: { label: "Dijeda", variant: "secondary" },
  ended: { label: "Selesai", variant: "secondary" },
  failed: { label: "Gagal", variant: "destructive" },
};

export function AdCampaignList({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = React.useState<string>("");
  const [researching, setResearching] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const { data: projects } = useQuery({ queryKey: ["markom-projects-for-photos"], queryFn: listProjectsForPhotoUploadAction, enabled: canManage });
  const { data: campaigns, isLoading } = useQuery({ queryKey: ["markom-ad-campaigns"], queryFn: listAdCampaignsAction });

  async function handleResearch() {
    const project = (projects ?? []).find((p) => p.id === projectId);
    if (!project) {
      toast.error("Pilih project terlebih dahulu");
      return;
    }
    setResearching(true);
    try {
      const result = await requestAdsResearchAction(project.id, project.branch_id);
      if (!result.success) {
        toast.error(result.error ?? "Gagal menjadwalkan riset iklan");
        return;
      }
      toast.success("AI sedang meriset -- hasilnya akan muncul di bawah sebagai draft dalam beberapa saat");
      queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menjadwalkan riset iklan");
    } finally {
      setResearching(false);
    }
  }

  /** try/catch/finally is deliberate here -- without it, any thrown error (network hiccup, Vercel function timeout on a slow Meta launch) leaves the button stuck spinning forever with no toast, since setBusyId(null) would never run. */
  async function handleLaunchDraft(id: string) {
    setBusyId(id);
    try {
      const result = await launchDraftCampaignAction(id);
      if (!result.success) {
        toast.error(result.error ?? "Gagal meluncurkan iklan");
        queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
        return;
      }
      toast.success("Iklan berhasil diluncurkan ke Meta");
      queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal meluncurkan iklan -- coba lagi");
      queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteDraft() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteAdCampaignDraftAction(deleteTarget);
      if (!result.success) {
        toast.error(result.error ?? "Gagal menghapus draft iklan");
        return;
      }
      toast.success("Draft iklan dihapus");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus draft iklan");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAnalyze(id: string) {
    setBusyId(id);
    try {
      const result = await analyzeAdCampaignAction(id);
      if (!result.success) {
        toast.error(result.error ?? "Gagal menganalisis performa iklan");
        return;
      }
      toast.success("Analisis AI selesai");
      queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menganalisis performa iklan");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleStatus(id: string, metaAdId: string | null, currentStatus: string) {
    setBusyId(id);
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    try {
      const result = await setAdCampaignStatusAction(id, metaAdId, nextStatus);
      if (!result.success) {
        toast.error(result.error ?? "Gagal mengubah status iklan");
        return;
      }
      toast.success(nextStatus === "active" ? "Iklan diaktifkan kembali" : "Iklan dijeda");
      queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status iklan");
    } finally {
      setBusyId(null);
    }
  }

  const items = campaigns ?? [];

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-56 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Riset iklan untuk project</p>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih project" />
                </SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.city ? ` — ${p.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={handleResearch} disabled={researching || !projectId}>
              {researching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Riset
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              AI meriset tren &amp; kompetitor, memilih foto dari galeri project, dan menulis materi iklan -- hasilnya muncul di bawah sebagai <strong>Draft</strong> untuk Anda tinjau. Iklan baru benar-benar tayang (dan mulai menghabiskan budget) setelah Anda menekan tombol <strong>Luncurkan</strong> pada draft tersebut. Project ini juga otomatis dijadwalkan ulang tiap minggu untuk diluncurkan otomatis oleh AI jika sudah punya foto.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState icon={Rocket} title="Belum ada iklan" description="Klik Riset di atas untuk membuat draft iklan pertama, atau tunggu AI menjadwalkan otomatis tiap minggu." />
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((c) => {
            const statusInfo = STATUS_LABEL[c.status] ?? { label: c.status, variant: "secondary" as const };
            const project = c.project as { name?: string; city?: string } | null;
            const photo = c.photo as { public_url?: string; caption?: string } | null;
            return (
              <Card key={c.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
                  {photo?.public_url && (
                    <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-32">
                      <Image src={photo.public_url} alt={c.headline} fill sizes="128px" className="object-cover" unoptimized />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{project?.name ?? "-"}</p>
                        <p className="text-sm text-muted-foreground">
                          {project?.city} &middot; Rp {c.daily_budget_idr.toLocaleString("id-ID")}/hari &middot; {c.launched_by === "ai" ? "Diluncurkan AI" : "Diluncurkan manual"}
                        </p>
                      </div>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    <p className="text-sm font-medium">{c.headline}</p>
                    <p className="text-sm text-muted-foreground">{c.primary_text}</p>
                    {c.research_summary && <p className="text-xs italic text-muted-foreground">Riset AI: {c.research_summary}</p>}
                    {c.target_areas && c.target_areas.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Area target hasil riset AI: <span className="font-medium">{c.target_areas.join(", ")}</span>
                      </p>
                    )}
                    {c.status === "failed" && c.failure_reason && <p className="text-xs text-destructive">Gagal: {c.failure_reason}</p>}

                    {(c.status === "active" || c.status === "paused") && (
                      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <StatTile icon={Wallet} label="Spend" value={`Rp ${(c.spend_idr ?? 0).toLocaleString("id-ID")}`} className="p-2" />
                          <StatTile icon={Eye} label="Impressions" value={(c.impressions ?? 0).toLocaleString("id-ID")} className="p-2" />
                          <StatTile icon={MousePointerClick} label="Klik" value={(c.clicks ?? 0).toLocaleString("id-ID")} className="p-2" />
                          <StatTile icon={MessageCircle} label="Percakapan WA" value={(c.conversations_started ?? 0).toLocaleString("id-ID")} className="p-2" />
                        </div>
                        {c.ai_analysis && <p className="text-xs text-muted-foreground">{c.ai_analysis}</p>}
                        <p className="text-[11px] text-muted-foreground/70">
                          {c.analyzed_at
                            ? `${c.ai_analysis ? "Dianalisis AI" : "Data diperbarui"} ${new Date(c.analyzed_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} -- disinkron otomatis tiap 2 jam dari Meta.`
                            : "Menunggu sinkronisasi data pertama dari Meta (berjalan otomatis tiap 2 jam)."}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {canManage && c.status === "draft" && (
                        <>
                          <Button size="sm" disabled={busyId === c.id} onClick={() => handleLaunchDraft(c.id)}>
                            {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Luncurkan
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === c.id} onClick={() => setDeleteTarget(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus Draft
                          </Button>
                        </>
                      )}
                      {canManage && c.status === "failed" && (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === c.id} onClick={() => setDeleteTarget(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Hapus
                        </Button>
                      )}
                      {canManage && (c.status === "active" || c.status === "paused") && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === c.id}
                            onClick={() => handleToggleStatus(c.id, c.meta_ad_id, c.status)}
                          >
                            {c.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            {c.status === "active" ? "Jeda" : "Aktifkan"}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleAnalyze(c.id)}>
                            {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                            {c.analyzed_at ? "Analisis Ulang" : "Analisis"}
                          </Button>
                        </>
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
        title="Hapus iklan ini?"
        description="Belum pernah tayang di Meta, jadi tidak ada budget yang terpakai. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus"
        destructive
        loading={deleting}
        onConfirm={handleDeleteDraft}
      />
    </div>
  );
}
