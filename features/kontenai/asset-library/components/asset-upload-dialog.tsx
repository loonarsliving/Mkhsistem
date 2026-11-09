"use client";

import * as React from "react";
import { UploadCloud, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_LABELS, CONTENT_FOCUS_VALUES } from "@/constants/app";
import { useUploadKontenAiAsset } from "@/features/kontenai/asset-library/hooks/use-kontenai-asset-mutations";
import { ASSET_TYPE_ACCEPT, ASSET_TYPE_OPTIONS, guessAssetTypeFromMime } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import type { KontenAiAssetType } from "@/repositories/kontenai-assets.repository";

const INITIAL_TYPE: KontenAiAssetType = "image";

export function AssetUploadDialog() {
  const uploadMutation = useUploadKontenAiAsset();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [assetType, setAssetType] = React.useState<KontenAiAssetType>(INITIAL_TYPE);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [project, setProject] = React.useState("");
  const [campaign, setCampaign] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [contentType, setContentType] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  function resetForm() {
    setFile(null);
    setAssetType(INITIAL_TYPE);
    setTitle("");
    setDescription("");
    setCompany("");
    setProject("");
    setCampaign("");
    setPlatform("");
    setContentType("");
    setLocation("");
    setTags([]);
    setTagInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    if (selected) {
      setAssetType(guessAssetTypeFromMime(selected.type));
      if (!title) setTitle(selected.name.replace(/\.[^/.]+$/, ""));
    }
  }

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    await uploadMutation.mutateAsync({ file, title, description, assetType, company, project, campaign, platform, contentType, location, tags });
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <UploadCloud className="h-4 w-4" />
          Upload Assets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Upload Aset</DialogTitle>
            <DialogDescription>Image, video, audio, logo, brand guideline, font, template, atau document -- tersimpan di Supabase Storage.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="asset-upload-type">Tipe</Label>
            <Select value={assetType} onValueChange={(value) => setAssetType(value as KontenAiAssetType)}>
              <SelectTrigger id="asset-upload-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-upload-file">File</Label>
            <Input
              id="asset-upload-file"
              ref={fileInputRef}
              type="file"
              accept={ASSET_TYPE_ACCEPT[assetType]}
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              required
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} -- {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-upload-title">Judul</Label>
            <Input id="asset-upload-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-upload-description">Deskripsi</Label>
            <Textarea id="asset-upload-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="asset-upload-company">Company</Label>
              <Select value={company || undefined} onValueChange={setCompany}>
                <SelectTrigger id="asset-upload-company">
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
            <div className="space-y-2">
              <Label htmlFor="asset-upload-project">Project</Label>
              <Input id="asset-upload-project" value={project} onChange={(e) => setProject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-upload-campaign">Campaign</Label>
              <Input id="asset-upload-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-upload-platform">Platform</Label>
              <Input id="asset-upload-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="instagram, tiktok..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-upload-content-type">Content Type</Label>
              <Input id="asset-upload-content-type" value={contentType} onChange={(e) => setContentType(e.target.value)} placeholder="reel, feed, ad, story..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-upload-location">Location</Label>
              <Input id="asset-upload-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Yogyakarta, Villa Cariu..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-upload-tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="asset-upload-tags"
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

          <DialogFooter>
            <Button type="submit" disabled={uploadMutation.isPending || !file || !title.trim()}>
              {uploadMutation.isPending ? "Mengunggah..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
