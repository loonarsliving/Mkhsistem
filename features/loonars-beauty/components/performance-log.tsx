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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  listContentItemsAction,
  listOrderSnapshotsAction,
  logContentMetricsAction,
  logOrderSnapshotAction,
} from "../actions/loonars-beauty.actions";
import { ORDER_CHANNELS } from "../schemas/loonars-beauty.schema";

const CHANNEL_LABEL: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  website: "Website",
  offline: "Offline",
  other: "Lainnya",
};

export function PerformanceLog() {
  const queryClient = useQueryClient();

  const { data: contentItems } = useQuery({ queryKey: ["loonars-content-items"], queryFn: () => listContentItemsAction({ status: "published" }) });
  const { data: orderSnapshots } = useQuery({ queryKey: ["loonars-order-snapshots"], queryFn: () => listOrderSnapshotsAction() });

  const [metricSubmitting, setMetricSubmitting] = React.useState(false);
  const [contentItemId, setContentItemId] = React.useState<string>("");
  const [views, setViews] = React.useState("0");
  const [likes, setLikes] = React.useState("0");
  const [linkClicks, setLinkClicks] = React.useState("0");
  const [watchThrough, setWatchThrough] = React.useState(false);
  const [boosted, setBoosted] = React.useState(false);

  const [orderSubmitting, setOrderSubmitting] = React.useState(false);
  const [channel, setChannel] = React.useState<string>("shopee");
  const [ordersCount, setOrdersCount] = React.useState("0");
  const [unitsSold, setUnitsSold] = React.useState("0");
  const [revenueIdr, setRevenueIdr] = React.useState("0");

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

  async function handleLogOrder() {
    setOrderSubmitting(true);
    const result = await logOrderSnapshotAction({
      channel: channel as (typeof ORDER_CHANNELS)[number],
      ordersCount: Number(ordersCount),
      unitsSold: Number(unitsSold),
      revenueIdr: Number(revenueIdr),
    });
    setOrderSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat order");
      return;
    }
    toast.success("Data order hari ini dicatat");
    setOrdersCount("0");
    setUnitsSold("0");
    setRevenueIdr("0");
    queryClient.invalidateQueries({ queryKey: ["loonars-order-snapshots"] });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Catat Order Hari Ini (dari Loonars Dashboard)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Input manual dari laporan Loonars Dashboard per channel -- dipakai untuk melihat korelasi performa konten vs penjualan.</p>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Order</Label>
              <Input type="number" min={0} value={ordersCount} onChange={(e) => setOrdersCount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit Terjual</Label>
              <Input type="number" min={0} value={unitsSold} onChange={(e) => setUnitsSold(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Omzet (Rp)</Label>
              <Input type="number" min={0} value={revenueIdr} onChange={(e) => setRevenueIdr(e.target.value)} />
            </div>
          </div>
          <Button disabled={orderSubmitting} onClick={handleLogOrder}>
            {orderSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan Order
          </Button>

          {orderSnapshots && orderSnapshots.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead className="text-right">Omzet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderSnapshots.slice(0, 7).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.snapshot_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</TableCell>
                    <TableCell>{CHANNEL_LABEL[row.channel] ?? row.channel}</TableCell>
                    <TableCell className="text-right">{row.orders_count}</TableCell>
                    <TableCell className="text-right">Rp{Number(row.revenue_idr).toLocaleString("id-ID")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
