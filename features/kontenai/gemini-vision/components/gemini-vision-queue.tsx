"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, Loader2, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssetRecord, AssetVisionMetadata } from "@/features/kontenai/types";
import type { AnalysisQueueItem, AnalysisStatus } from "@/features/kontenai/gemini-vision/types";
import { analyzeAssetAction } from "@/features/kontenai/gemini-vision/actions/gemini-vision.actions";

import { AnalysisStatusBadge } from "./analysis-status-badge";
import { AssetMetadataDialog } from "./asset-metadata-dialog";
import { AssetTypeBadge } from "./asset-type-badge";

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function toQueueItem(asset: AssetRecord): AnalysisQueueItem {
  return { asset, status: asset.metadata ? "analyzed" : "not_analyzed" };
}

export function GeminiVisionQueue({ initialAssets }: { initialAssets: AssetRecord[] }) {
  const [items, setItems] = useState<AnalysisQueueItem[]>(() => initialAssets.map(toQueueItem));
  const [metadataById, setMetadataById] = useState<Record<string, AssetVisionMetadata>>(() => {
    const initial: Record<string, AssetVisionMetadata> = {};
    for (const asset of initialAssets) {
      if (asset.metadata) initial[asset.id] = asset.metadata;
    }
    return initial;
  });
  const [dialogAssetId, setDialogAssetId] = useState<string | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [, startTransition] = useTransition();

  const setStatus = (assetId: string, status: AnalysisStatus) => {
    setItems((prev) => prev.map((item) => (item.asset.id === assetId ? { ...item, status } : item)));
  };

  async function runAnalysis(assetId: string) {
    setStatus(assetId, "analyzing");
    try {
      const result = await analyzeAssetAction(assetId);
      setMetadataById((prev) => ({ ...prev, [assetId]: result }));
      setStatus(assetId, "analyzed");
    } catch {
      setStatus(assetId, "failed");
    }
  }

  function handleAnalyze(assetId: string) {
    startTransition(() => {
      void runAnalysis(assetId);
    });
  }

  async function handleBatchAnalyze() {
    setIsBatchRunning(true);
    const pending = items.filter((item) => item.status === "not_analyzed" || item.status === "failed").map((item) => item.asset.id);
    for (const assetId of pending) {
      // Sequential on purpose so per-item progress stays visible and legible in the queue.
      await runAnalysis(assetId);
    }
    setIsBatchRunning(false);
  }

  const notAnalyzedCount = useMemo(() => items.filter((item) => item.status === "not_analyzed" || item.status === "failed").length, [items]);
  const analyzingCount = useMemo(() => items.filter((item) => item.status === "analyzing").length, [items]);
  const analyzedCount = items.length - notAnalyzedCount - analyzingCount;
  const dialogItem = items.find((item) => item.asset.id === dialogAssetId) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Antrean Analisis
            </CardTitle>
            <CardDescription>
              {analyzedCount} dianalisis - {analyzingCount} berjalan - {notAnalyzedCount} menunggu, dari {items.length} aset.
            </CardDescription>
          </div>
          <Button onClick={() => void handleBatchAnalyze()} disabled={isBatchRunning || notAnalyzedCount === 0}>
            {isBatchRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Analisis Semua ({notAnalyzedCount})
          </Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Belum ada aset untuk dianalisis</p>
              <p className="text-sm text-muted-foreground">Unggah aset lewat Asset Library terlebih dahulu.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama file</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ukuran</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const metadata = metadataById[item.asset.id] ?? null;
                  return (
                    <TableRow key={item.asset.id}>
                      <TableCell className="max-w-[240px] truncate font-medium" title={item.asset.filename}>
                        {item.asset.filename}
                      </TableCell>
                      <TableCell>
                        <AssetTypeBadge type={item.asset.type} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <AnalysisStatusBadge status={item.status} />
                          {item.status === "analyzing" ? <Progress value={65} tone="warning" className="h-1.5 w-24" /> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatSize(item.asset.sizeBytes)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {metadata ? (
                            <Button variant="outline" size="sm" onClick={() => setDialogAssetId(item.asset.id)}>
                              <Eye className="h-4 w-4" />
                              Lihat hasil
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant={item.status === "failed" ? "destructive" : "secondary"}
                            disabled={item.status === "analyzing"}
                            onClick={() => handleAnalyze(item.asset.id)}
                          >
                            {item.status === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            {item.status === "analyzed" ? "Analisis ulang" : item.status === "failed" ? "Coba lagi" : "Analisis"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Gemini Vision di sini masih berupa simulasi (mock) -- belum terhubung ke API Gemini yang sesungguhnya.
          </p>
        </CardFooter>
      </Card>

      <AssetMetadataDialog
        asset={dialogItem?.asset ?? null}
        metadata={dialogItem ? metadataById[dialogItem.asset.id] ?? null : null}
        open={dialogAssetId !== null}
        onOpenChange={(open) => setDialogAssetId(open ? dialogAssetId : null)}
      />
    </div>
  );
}

export function GeminiVisionQueueSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
