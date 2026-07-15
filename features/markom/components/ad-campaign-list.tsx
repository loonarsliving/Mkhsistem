"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pause, Play, Rocket, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { listProjectsForPhotoUploadAction } from "../actions/project-photo.actions";
import { launchDraftCampaignAction, listAdCampaignsAction, requestAdsResearchAction, setAdCampaignStatusAction } from "../actions/ads.actions";

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

  const { data: projects } = useQuery({ queryKey: ["markom-projects-for-photos"], queryFn: listProjectsForPhotoUploadAction, enabled: canManage });
  const { data: campaigns, isLoading } = useQuery({ queryKey: ["markom-ad-campaigns"], queryFn: listAdCampaignsAction });

  async function handleResearch() {
    const project = (projects ?? []).find((p) => p.id === projectId);
    if (!project) {
      toast.error("Pilih project terlebih dahulu");
      return;
    }
    setResearching(true);
    const result = await requestAdsResearchAction(project.id, project.branch_id);
    setResearching(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menjadwalkan riset iklan");
      return;
    }
    toast.success("AI sedang meriset -- hasilnya akan muncul di bawah sebagai draft dalam beberapa saat");
    queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
  }

  async function handleLaunchDraft(id: string) {
    setBusyId(id);
    const result = await launchDraftCampaignAction(id);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal meluncurkan iklan");
      queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
      return;
    }
    toast.success("Iklan berhasil diluncurkan ke Meta");
    queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
  }

  async function handleToggleStatus(id: string, metaAdId: string | null, currentStatus: string) {
    setBusyId(id);
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    const result = await setAdCampaignStatusAction(id, metaAdId, nextStatus);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah status iklan");
      return;
    }
    toast.success(nextStatus === "active" ? "Iklan diaktifkan kembali" : "Iklan dijeda");
    queryClient.invalidateQueries({ queryKey: ["markom-ad-campaigns"] });
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
                    {c.status === "failed" && c.failure_reason && <p className="text-xs text-destructive">Gagal: {c.failure_reason}</p>}
                    {canManage && c.status === "draft" && (
                      <Button size="sm" disabled={busyId === c.id} onClick={() => handleLaunchDraft(c.id)}>
                        {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Luncurkan
                      </Button>
                    )}
                    {canManage && (c.status === "active" || c.status === "paused") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === c.id}
                        onClick={() => handleToggleStatus(c.id, c.meta_ad_id, c.status)}
                      >
                        {c.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {c.status === "active" ? "Jeda" : "Aktifkan"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
