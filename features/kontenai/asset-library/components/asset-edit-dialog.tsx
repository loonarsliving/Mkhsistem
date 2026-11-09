"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_LABELS, CONTENT_FOCUS_VALUES } from "@/constants/app";
import { useUpdateKontenAiAsset } from "@/features/kontenai/asset-library/hooks/use-kontenai-asset-mutations";
import type { KontenAiAssetWithCreator } from "@/repositories/kontenai-assets.repository";

interface AssetEditDialogProps {
  asset: KontenAiAssetWithCreator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Covers rename, move-folder (company/project/campaign/platform/content type), status, and tag edits -- all are the same "update classification metadata" surface, so one dialog instead of four near-identical ones. */
export function AssetEditDialog({ asset, open, onOpenChange }: AssetEditDialogProps) {
  const updateMutation = useUpdateKontenAiAsset();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [project, setProject] = React.useState("");
  const [campaign, setCampaign] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [contentType, setContentType] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [status, setStatus] = React.useState<"draft" | "active" | "archived">("draft");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  React.useEffect(() => {
    if (!asset) return;
    setTitle(asset.title);
    setDescription(asset.description ?? "");
    setCompany(asset.company ?? "");
    setProject(asset.project ?? "");
    setCampaign(asset.campaign ?? "");
    setPlatform(asset.platform ?? "");
    setContentType(asset.content_type ?? "");
    setLocation(asset.location ?? "");
    setStatus(asset.status as "draft" | "active" | "archived");
    setTags(asset.tags);
  }, [asset]);

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagInput("");
  }

  async function handleSave() {
    if (!asset) return;
    const result = await updateMutation.mutateAsync({
      assetId: asset.id,
      input: { title, description, company, project, campaign, platform, contentType, location, status, tags },
    });
    if (result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Aset</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="asset-edit-title">Judul</Label>
            <Input id="asset-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-edit-description">Deskripsi</Label>
            <Textarea id="asset-edit-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="asset-edit-company">Company</Label>
              <Select value={company || undefined} onValueChange={setCompany}>
                <SelectTrigger id="asset-edit-company">
                  <SelectValue placeholder="Pilih brand" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_FOCUS_VALUES.map((focus) => (
                    <SelectItem key={focus} value={focus}>
                      {BRAND_LABELS[focus]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-edit-project">Project</Label>
              <Input id="asset-edit-project" value={project} onChange={(e) => setProject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-edit-campaign">Campaign</Label>
              <Input id="asset-edit-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-edit-platform">Platform</Label>
              <Input id="asset-edit-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="instagram, tiktok..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-edit-content-type">Content Type</Label>
              <Input id="asset-edit-content-type" value={contentType} onChange={(e) => setContentType(e.target.value)} placeholder="reel, feed, ad..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-edit-location">Location</Label>
              <Input id="asset-edit-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Yogyakarta, Villa Cariu..." />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-edit-tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="asset-edit-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Ketik lalu Enter"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Tambah
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" onClick={() => setTags((prev) => prev.filter((t) => t !== tag))} aria-label={`Hapus tag ${tag}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || !title.trim()}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
