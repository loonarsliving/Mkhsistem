"use client";

import * as React from "react";
import { Wand2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePublishSchedule, useGeneratePublishingCopy } from "@/features/kontenai/publishing-engine/hooks/use-publishing-mutations";
import { PLATFORM_OPTIONS } from "@/features/kontenai/publishing-engine/types";
import type { PublishPlatform } from "@/lib/publishing/platform-types";
import type { KontenAiRenderJobWithStoryboard } from "@/repositories/kontenai-render-jobs.repository";

interface PublishFormProps {
  renderJob: KontenAiRenderJobWithStoryboard;
}

/** Steps 2-6: platform, AI-generated caption/hashtags (editable), and an optional publish date/time -- saved as Draft when empty, Scheduled when set. */
export function PublishForm({ renderJob }: PublishFormProps) {
  const [platform, setPlatform] = React.useState<PublishPlatform>("instagram");
  const [caption, setCaption] = React.useState("");
  const [hashtags, setHashtags] = React.useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");

  const generateMutation = useGeneratePublishingCopy();
  const createMutation = useCreatePublishSchedule();

  function handleGenerate() {
    generateMutation.mutate(
      { renderJobId: renderJob.id, platform },
      {
        onSuccess: (result) => {
          setCaption(result.caption);
          setHashtags(result.hashtags);
        },
      },
    );
  }

  function addHashtag() {
    const value = hashtagInput.trim().replace(/^#*/, "");
    if (!value) return;
    const tag = `#${value}`;
    if (!hashtags.includes(tag)) setHashtags((prev) => [...prev, tag]);
    setHashtagInput("");
  }

  function handleSave() {
    createMutation.mutate(
      {
        renderJobId: renderJob.id,
        platform,
        caption,
        hashtags,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      },
      {
        onSuccess: () => {
          setCaption("");
          setHashtags([]);
          setScheduledAt("");
        },
      },
    );
  }

  const canSave = caption.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{renderJob.storyboard?.title ?? "Jadwalkan Publish"}</CardTitle>
        <CardDescription>Pilih platform, hasilkan caption & hashtag, lalu tentukan tanggal/jam publish (kosongkan untuk simpan sebagai Draft).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderJob.output_public_url && <video src={renderJob.output_public_url} controls className="w-full max-w-xs rounded-md border" />}

        <div className="space-y-2">
          <Label htmlFor="publish-platform">Platform</Label>
          <Select value={platform} onValueChange={(value) => setPlatform(value as PublishPlatform)}>
            <SelectTrigger id="publish-platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" variant="outline" className="w-full" disabled={generateMutation.isPending} onClick={handleGenerate}>
          <Wand2 className="h-4 w-4" />
          {generateMutation.isPending ? "Menghasilkan caption & hashtag..." : "Generate Caption & Hashtag"}
        </Button>

        <div className="space-y-2">
          <Label htmlFor="publish-caption">Caption</Label>
          <Textarea id="publish-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder="Tulis atau generate caption..." />
        </div>

        <div className="space-y-2">
          <Label htmlFor="publish-hashtags">Hashtags</Label>
          <div className="flex gap-2">
            <Input
              id="publish-hashtags"
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addHashtag();
                }
              }}
              placeholder="Ketik lalu Enter"
            />
            <Button type="button" variant="outline" onClick={addHashtag}>
              Tambah
            </Button>
          </div>
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {hashtags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button type="button" onClick={() => setHashtags((prev) => prev.filter((t) => t !== tag))} aria-label={`Hapus ${tag}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="publish-scheduled-at">Tanggal & Jam Publish</Label>
          <Input id="publish-scheduled-at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          <p className="text-xs text-muted-foreground">Kosongkan untuk menyimpan sebagai Draft.</p>
        </div>

        <Button type="button" className="w-full" disabled={!canSave || createMutation.isPending} onClick={handleSave}>
          {createMutation.isPending ? "Menyimpan..." : scheduledAt ? "Jadwalkan Publish" : "Simpan sebagai Draft"}
        </Button>
      </CardContent>
    </Card>
  );
}
