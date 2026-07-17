"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { listContentItemsAction, logContentMetricsAction } from "../actions/loonars-beauty.actions";

export function PerformanceLog() {
  const queryClient = useQueryClient();

  const { data: contentItems } = useQuery({ queryKey: ["loonars-content-items"], queryFn: () => listContentItemsAction({ status: "published" }) });

  const [metricSubmitting, setMetricSubmitting] = React.useState(false);
  const [contentItemId, setContentItemId] = React.useState<string>("");
  const [views, setViews] = React.useState("0");
  const [likes, setLikes] = React.useState("0");
  const [linkClicks, setLinkClicks] = React.useState("0");
  const [watchThrough, setWatchThrough] = React.useState(false);
  const [boosted, setBoosted] = React.useState(false);

  async function handleLogMetrics() {
    if (!contentItemId) {
      toast.error("Pilih konten terlebih dahulu");
      return;
    }
    setMetricSubmitting(true);
    const result = await logContentMetricsAction({
      contentItemId,
      views: Number(views),
      likes: Number(likes),
      comments: 0,
      shares: 0,
      saves: 0,
      linkClicks: Number(linkClicks),
      watchThrough50Pct: watchThrough,
      boostedSparkAds: boosted,
    });
    setMetricSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat performa");
      return;
    }
    toast.success("Performa konten dicatat untuk hari ini");
    setViews("0");
    setLikes("0");
    setLinkClicks("0");
    setWatchThrough(false);
    setBoosted(false);
    queryClient.invalidateQueries({ queryKey: ["loonars-beauty-retargeting"] });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Catat Performa Konten Hari Ini</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Input manual dari TikTok/Instagram Insights -- satu entri per konten per hari (isi ulang untuk update).</p>
        <Select value={contentItemId} onValueChange={setContentItemId}>
          <SelectTrigger>
            <SelectValue placeholder="Pilih konten yang sudah published" />
          </SelectTrigger>
          <SelectContent>
            {(contentItems ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Views</Label>
            <Input type="number" min={0} value={views} onChange={(e) => setViews(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Likes</Label>
            <Input type="number" min={0} value={likes} onChange={(e) => setLikes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Klik ke Toko</Label>
            <Input type="number" min={0} value={linkClicks} onChange={(e) => setLinkClicks(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="watch-through" checked={watchThrough} onCheckedChange={(v) => setWatchThrough(Boolean(v))} />
          <Label htmlFor="watch-through" className="text-sm font-normal">
            Rata-rata penonton menonton &gt;50% durasi
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="boosted" checked={boosted} onCheckedChange={(v) => setBoosted(Boolean(v))} />
          <Label htmlFor="boosted" className="text-sm font-normal">
            Sudah di-boost Spark Ads
          </Label>
        </div>
        <Button disabled={metricSubmitting} onClick={handleLogMetrics}>
          {metricSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Simpan Performa
        </Button>
      </CardContent>
    </Card>
  );
}
