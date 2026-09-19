"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Film, ImageIcon, Loader2, Pencil, RefreshCw, Sparkles, ThumbsDown, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OCCUPANCY_PERSONA_CANDIDATES, OCCUPANCY_PERSONA_LABELS, type OccupancyPersona } from "@/lib/occupancy/campaign-rules";
import {
  approveOccupancyCampaignAction,
  createSingleCreativeVariationAction,
  listCreativeAssetsAction,
  regenerateOccupancyCampaignCopyAction,
  rejectOccupancyCampaignAction,
  setCampaignPrimaryAssetAction,
  updateOccupancyCampaignCopyManualAction,
} from "../actions/occupancy-ads.actions";

export interface MetaAdPreviewCampaign {
  id: string;
  status: string;
  headline: string | null;
  primary_text: string | null;
  description: string | null;
  cta: string | null;
  destination_url: string;
  primary_asset_id: string | null;
}

/**
 * Meta-style ad preview (spec's "META AD PREVIEW" requirement): the
 * selected creative asset, primary text, headline, CTA, and destination
 * URL, laid out to resemble how the ad will actually look once launched --
 * plus the review actions a human uses before a campaign can move to
 * approved/ready_for_meta (regenerate copy, change asset, create a
 * variation, approve, reject). Nothing here calls the Meta API -- launch
 * itself stays a separate, explicit action (launchOccupancyCampaignAction).
 */
export function MetaAdPreview({ campaign, canManage }: { campaign: MetaAdPreviewCampaign; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [changingAsset, setChangingAsset] = React.useState(false);
  const [choosingPersona, setChoosingPersona] = React.useState(false);
  const [editingCopy, setEditingCopy] = React.useState(false);
  const [draftHeadline, setDraftHeadline] = React.useState(campaign.headline ?? "");
  const [draftPrimaryText, setDraftPrimaryText] = React.useState(campaign.primary_text ?? "");
  const [draftDescription, setDraftDescription] = React.useState(campaign.description ?? "");
  const [draftCta, setDraftCta] = React.useState(campaign.cta ?? "");

  const { data: assets } = useQuery({ queryKey: ["occupancy-creative-assets"], queryFn: () => listCreativeAssetsAction() });
  const readyAssets = React.useMemo(() => (assets ?? []).filter((a) => ["approved", "ready", "active"].includes(a.status)), [assets]);
  const selectedAsset = React.useMemo(() => (assets ?? []).find((a) => a.id === campaign.primary_asset_id) ?? null, [assets, campaign.primary_asset_id]);

  function invalidateCampaigns() {
    queryClient.invalidateQueries({ queryKey: ["occupancy-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["occupancy-creative-variants", campaign.id] });
  }

  async function handleRegenerateCopy(persona?: OccupancyPersona) {
    setBusyAction("regenerate");
    const result = await regenerateOccupancyCampaignCopyAction(campaign.id, persona);
    setBusyAction(null);
    setChoosingPersona(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(persona ? `Copy dibuat ulang dengan persona "${OCCUPANCY_PERSONA_LABELS[persona]}"` : "Copy iklan dibuat ulang oleh AI (persona baru dipilih otomatis)");
    invalidateCampaigns();
  }

  function handleStartEditCopy() {
    setDraftHeadline(campaign.headline ?? "");
    setDraftPrimaryText(campaign.primary_text ?? "");
    setDraftDescription(campaign.description ?? "");
    setDraftCta(campaign.cta ?? "");
    setEditingCopy(true);
  }

  async function handleSaveCopy() {
    setBusyAction("save-copy");
    const result = await updateOccupancyCampaignCopyManualAction(campaign.id, {
      headline: draftHeadline,
      primaryText: draftPrimaryText,
      description: draftDescription,
      cta: draftCta,
    });
    setBusyAction(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Copy iklan disimpan");
    setEditingCopy(false);
    invalidateCampaigns();
  }

  async function handleChangeAsset(assetId: string) {
    setBusyAction("asset");
    const result = await setCampaignPrimaryAssetAction(campaign.id, assetId || null);
    setBusyAction(null);
    setChangingAsset(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    invalidateCampaigns();
  }

  async function handleCreateVariation() {
    setBusyAction("variation");
    const result = await createSingleCreativeVariationAction(campaign.id);
    setBusyAction(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("1 varian kreatif baru dibuat -- cek daftar varian di bawah");
    invalidateCampaigns();
  }

  async function handleApprove() {
    setBusyAction("approve");
    const result = await approveOccupancyCampaignAction(campaign.id);
    setBusyAction(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Campaign disetujui");
    invalidateCampaigns();
  }

  async function handleReject() {
    if (!window.confirm("Tolak draft campaign ini? Bisa dibuat ulang copy-nya kapan saja selama belum dihapus.")) return;
    setBusyAction("reject");
    const result = await rejectOccupancyCampaignAction(campaign.id);
    setBusyAction(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Campaign ditolak");
    invalidateCampaigns();
  }

  const canEdit = canManage && ["draft", "review", "rejected"].includes(campaign.status);

  return (
    <Card className="max-w-md border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Meta Ad Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {/* Facebook/Instagram-style card */}
        <div className="border-t">
          <div className="relative aspect-square w-full bg-muted">
            {selectedAsset ? (
              selectedAsset.media_type === "image" ? (
                <Image src={selectedAsset.public_url} alt={selectedAsset.filename} fill className="object-cover" unoptimized />
              ) : (
                <video src={selectedAsset.public_url} className="h-full w-full object-cover" controls preload="metadata" />
              )
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <p className="text-xs">Belum ada aset terpilih</p>
              </div>
            )}
            {selectedAsset && (
              <Badge variant="secondary" className="absolute left-2 top-2 gap-1">
                {selectedAsset.media_type === "video" ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                {selectedAsset.filename}
              </Badge>
            )}
          </div>
          <div className="space-y-2 p-4">
            {editingCopy ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Primary Text</label>
                  <Textarea rows={3} value={draftPrimaryText} onChange={(e) => setDraftPrimaryText(e.target.value)} placeholder="Isi caption utama..." />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Headline</label>
                  <Input value={draftHeadline} onChange={(e) => setDraftHeadline(e.target.value)} placeholder="Judul singkat..." />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Description</label>
                  <Textarea rows={2} value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} placeholder="Teks pendukung (opsional)..." />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">CTA</label>
                  <Input value={draftCta} onChange={(e) => setDraftCta(e.target.value)} placeholder="mis. BOOK_NOW" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={busyAction === "save-copy"} onClick={handleSaveCopy}>
                    {busyAction === "save-copy" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                    Simpan
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyAction === "save-copy"} onClick={() => setEditingCopy(false)}>
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm">{campaign.primary_text || <span className="text-muted-foreground">(belum ada primary text)</span>}</p>
                <div className="rounded-md border bg-muted/40 p-2.5">
                  <p className="truncate text-[11px] uppercase text-muted-foreground">{campaign.destination_url}</p>
                  <p className="text-sm font-semibold">{campaign.headline || <span className="font-normal text-muted-foreground">(belum ada headline)</span>}</p>
                  {campaign.description && <p className="text-xs text-muted-foreground">{campaign.description}</p>}
                  <div className="mt-2 flex items-center justify-between">
                    <Button size="sm" variant="secondary" disabled>
                      {campaign.cta || "Pelajari Selengkapnya"}
                    </Button>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {canManage && !editingCopy && (
          <div className="space-y-2 border-t p-3">
            {changingAsset ? (
              <Select onValueChange={handleChangeAsset} disabled={busyAction === "asset"}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih aset..." />
                </SelectTrigger>
                <SelectContent>
                  {readyAssets.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Belum ada aset siap pakai (approved/ready/active)</div>
                  )}
                  {readyAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : choosingPersona ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Pilih persona/angle untuk copy baru -- AI akan menulis ulang menyesuaikan pilihan ini:</p>
                <Select onValueChange={(v) => handleRegenerateCopy(v as OccupancyPersona)} disabled={busyAction === "regenerate"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCUPANCY_PERSONA_CANDIDATES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {OCCUPANCY_PERSONA_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" disabled={busyAction === "regenerate"} onClick={() => setChoosingPersona(false)}>
                  Batal
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!canEdit || busyAction === "regenerate"} onClick={() => handleRegenerateCopy()}>
                  {busyAction === "regenerate" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                  Buat Ulang Copy (AI)
                </Button>
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setChoosingPersona(true)}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Ganti Persona/Angle
                </Button>
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={handleStartEditCopy}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit Manual
                </Button>
                <Button size="sm" variant="outline" onClick={() => setChangingAsset(true)}>
                  <ImageIcon className="mr-1 h-3.5 w-3.5" />
                  Ganti Aset
                </Button>
                <Button size="sm" variant="outline" disabled={busyAction === "variation"} onClick={handleCreateVariation}>
                  {busyAction === "variation" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
                  Buat Variasi
                </Button>
              </div>
            )}

            {campaign.status === "review" && (
              <div className="flex gap-2 pt-1">
                <Button size="sm" disabled={busyAction === "approve"} onClick={handleApprove}>
                  {busyAction === "approve" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                  Setujui
                </Button>
                <Button size="sm" variant="destructive" disabled={busyAction === "reject"} onClick={handleReject}>
                  {busyAction === "reject" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="mr-1 h-3.5 w-3.5" />}
                  Tolak
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
