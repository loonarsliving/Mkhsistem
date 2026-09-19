"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Gauge, ImageIcon, Loader2, Rocket, Sparkles, TrendingDown, TrendingUp, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { StatTile } from "@/components/shared/stat-tile";
import { CampaignDecisionPanel } from "./campaign-decision-panel";
import { CampaignMetaReviewStatus } from "./campaign-meta-review-status";
import { CreativeVariantsList } from "./creative-variants-list";
import { MetaAdPreview } from "./meta-ad-preview";
import {
  askOccupancyCopilotAction,
  deleteOccupancyCampaignDraftAction,
  generateCreativeVariantsAction,
  getOccupancyCalendarAction,
  launchOccupancyCampaignAction,
  listCreativeAssetsAction,
  listOccupancyCampaignsAction,
  listOccupancyTargetsAction,
  moveOccupancyCampaignToReviewAction,
  pauseOccupancyCampaignAction,
  requestOccupancyAdsBriefAction,
  saveOccupancyTargetAction,
} from "../actions/occupancy-ads.actions";

const CLASS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" }> = {
  LOW: { label: "LOW", variant: "destructive" },
  HEALTHY: { label: "HEALTHY", variant: "success" },
  HIGH: { label: "HIGH", variant: "secondary" },
  FULL: { label: "FULL", variant: "default" },
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft (AI)",
  review: "Review",
  approved: "Disetujui",
  rejected: "Ditolak",
  ready_for_meta: "Siap Luncur",
  active: "Aktif",
  paused: "Dijeda",
  completed: "Selesai",
  archived: "Arsip",
  failed: "Gagal",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function OccupancyDashboard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [propertyName, setPropertyName] = React.useState("Loonars Private Living");
  const [busy, setBusy] = React.useState<string | null>(null);

  const { data: targets, isLoading: targetsLoading } = useQuery({ queryKey: ["occupancy-targets"], queryFn: listOccupancyTargetsAction });
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({ queryKey: ["occupancy-campaigns"], queryFn: listOccupancyCampaignsAction });
  const { data: creativeAssets } = useQuery({ queryKey: ["occupancy-creative-assets"], queryFn: () => listCreativeAssetsAction() });

  const activeTargetId = React.useMemo(() => targets?.find((t) => t.property_name === propertyName && t.is_active)?.id ?? null, [targets, propertyName]);

  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: ["occupancy-calendar", propertyName],
    queryFn: () => getOccupancyCalendarAction(propertyName, todayIso(), addDaysIso(21)),
  });

  async function handleRequestBrief() {
    if (!activeTargetId) {
      toast.error("Belum ada target okupansi aktif untuk properti ini");
      return;
    }
    setBusy("brief");
    const result = await requestOccupancyAdsBriefAction(activeTargetId);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Draft campaign AI berhasil dibuat -- review di tab Campaign");
    queryClient.invalidateQueries({ queryKey: ["occupancy-campaigns"] });
  }

  async function handleCampaignAction(action: (id: string) => Promise<{ success: boolean; error?: string }>, id: string, label: string) {
    setBusy(id);
    const result = await action(id);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(label);
    queryClient.invalidateQueries({ queryKey: ["occupancy-campaigns"] });
  }

  async function handleGenerateVariants(id: string) {
    setBusy(id);
    const result = await generateCreativeVariantsAction(id);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Varian kreatif dibuat");
    queryClient.invalidateQueries({ queryKey: ["occupancy-creative-variants", id] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Properti:</span>
          <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className="w-64" />
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/occupancy-ads/assets">
            <ImageIcon className="mr-1.5 h-4 w-4" />
            Creative Asset Library
          </Link>
        </Button>
      </div>

      {calendar && !calendar.ok && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            Data okupansi tidak tersedia: {calendar.reason}. Tidak ada angka yang ditampilkan/dipakai untuk menghindari data palsu.
          </CardContent>
        </Card>
      )}

      {calendar?.ok && calendar.gapSummary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={CalendarDays} label="Hari Dianalisis" value={String(calendar.gapSummary.totalDays)} />
          <StatTile icon={TrendingDown} label="Hari LOW" value={String(calendar.gapSummary.lowDays)} tone="destructive" />
          <StatTile icon={Gauge} label="Rata-rata Okupansi" value={`${calendar.gapSummary.averageOccupancyPct}%`} />
          <StatTile icon={TrendingUp} label="Rata-rata Gap" value={`${calendar.gapSummary.averageGapPct} poin`} />
        </div>
      )}

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Kalender Okupansi</TabsTrigger>
          <TabsTrigger value="campaigns">Campaign</TabsTrigger>
          <TabsTrigger value="targets">Target</TabsTrigger>
          <TabsTrigger value="copilot">Tanya Occupancy AI</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-3">
          {canManage && (
            <Button onClick={handleRequestBrief} disabled={busy === "brief" || !activeTargetId}>
              {busy === "brief" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Minta AI Buat Draft Campaign
            </Button>
          )}
          {calendarLoading && <p className="text-sm text-muted-foreground">Memuat kalender okupansi dari villa-api...</p>}
          {calendar?.ok && calendar.days && calendar.days.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {calendar.days.map((d) => {
                const badge = CLASS_BADGE[d.classification];
                return (
                  <Card key={`${d.date}-${d.roomTypeCode}`}>
                    <CardContent className="space-y-1 py-3 text-center">
                      <div className="text-xs text-muted-foreground">{d.date}</div>
                      <div className="text-lg font-semibold">{d.occupancyPct}%</div>
                      <div className="text-xs text-muted-foreground">{d.availableUnits} unit tersedia</div>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            calendar?.ok && <EmptyState icon={CalendarDays} title="Tidak ada data" description="villa-api tidak mengembalikan tipe kamar untuk rentang ini." />
          )}
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-3">
          {campaignsLoading && <p className="text-sm text-muted-foreground">Memuat campaign...</p>}
          {campaigns && campaigns.length === 0 && <EmptyState icon={Sparkles} title="Belum ada campaign" description="Minta AI membuat draft dari tab Kalender Okupansi." />}
          {campaigns?.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {c.property_name} · {c.target_market} · {c.audience_persona} · Rp{c.daily_budget_idr.toLocaleString("id-ID")}/hari
                  </p>
                </div>
                <Badge variant="secondary">{STATUS_LABEL[c.status] ?? c.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {c.failure_reason && <p className="text-xs text-destructive">Gagal: {c.failure_reason}</p>}

                {["draft", "review", "rejected", "approved", "ready_for_meta"].includes(c.status) && <MetaAdPreview campaign={c} canManage={canManage} />}

                {canManage && ["draft", "review", "rejected"].includes(c.status) && (
                  <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => handleGenerateVariants(c.id)}>
                    {busy === c.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                    Buat Varian Kreatif (AI)
                  </Button>
                )}
                <CreativeVariantsList campaignId={c.id} canManage={canManage} />

                {(c.status === "active" || c.status === "paused") && <CampaignDecisionPanel campaignId={c.id} campaignStatus={c.status} />}
                <CampaignMetaReviewStatus campaignId={c.id} hasMetaAdId={Boolean(c.meta_ad_id)} />

                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {c.status === "draft" && (
                      <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => handleCampaignAction(moveOccupancyCampaignToReviewAction, c.id, "Dipindah ke review")}>
                        Kirim ke Review
                      </Button>
                    )}
                    {c.status === "approved" && (
                      <Button
                        size="sm"
                        disabled={busy === c.id}
                        onClick={async () => {
                          const primaryAsset = creativeAssets?.find((a) => a.id === c.primary_asset_id);
                          if (!primaryAsset) {
                            toast.error('Belum ada aset terpilih untuk campaign ini -- pilih dulu lewat "Ganti Aset" di Meta Ad Preview sebelum meluncurkan.');
                            return;
                          }
                          if (!window.confirm(`Luncurkan campaign ini ke Meta dengan budget Rp${c.daily_budget_idr.toLocaleString("id-ID")}/hari? Ini akan mengeluarkan biaya iklan nyata.`)) return;
                          setBusy(c.id);
                          const result = await launchOccupancyCampaignAction(c.id, [primaryAsset.public_url], primaryAsset.media_type as "image" | "video");
                          setBusy(null);
                          if (!result.success) toast.error(result.error);
                          else {
                            toast.success("Campaign diluncurkan ke Meta");
                            queryClient.invalidateQueries({ queryKey: ["occupancy-campaigns"] });
                          }
                        }}
                      >
                        {busy === c.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                        Luncurkan (Real Spend)
                      </Button>
                    )}
                    {(c.status === "active" || c.status === "paused") && (
                      <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => handleCampaignAction(pauseOccupancyCampaignAction, c.id, "Campaign dijeda")}>
                        Jeda
                      </Button>
                    )}
                    {(c.status === "draft" || c.status === "review" || c.status === "failed" || c.status === "rejected") && (
                      <Button size="sm" variant="destructive" disabled={busy === c.id} onClick={() => handleCampaignAction(deleteOccupancyCampaignDraftAction, c.id, "Draft dihapus")}>
                        Hapus
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="targets">
          <TargetForm propertyName={propertyName} targetsLoading={targetsLoading} existing={targets?.find((t) => t.property_name === propertyName) ?? null} canManage={canManage} />
        </TabsContent>

        <TabsContent value="copilot">
          <CopilotPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TargetForm({
  propertyName,
  existing,
  canManage,
  targetsLoading,
}: {
  propertyName: string;
  existing: {
    id: string;
    target_occupancy_pct: number;
    critical_occupancy_pct: number;
    max_daily_budget_idr: number;
    max_weekly_budget_idr: number | null;
    is_active: boolean;
  } | null;
  canManage: boolean;
  targetsLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [targetPct, setTargetPct] = React.useState(String(existing?.target_occupancy_pct ?? 60));
  const [criticalPct, setCriticalPct] = React.useState(String(existing?.critical_occupancy_pct ?? 90));
  const [maxBudget, setMaxBudget] = React.useState(String(existing?.max_daily_budget_idr ?? 0));
  const [maxWeeklyBudget, setMaxWeeklyBudget] = React.useState(String(existing?.max_weekly_budget_idr ?? ""));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setTargetPct(String(existing?.target_occupancy_pct ?? 60));
    setCriticalPct(String(existing?.critical_occupancy_pct ?? 90));
    setMaxBudget(String(existing?.max_daily_budget_idr ?? 0));
    setMaxWeeklyBudget(String(existing?.max_weekly_budget_idr ?? ""));
  }, [existing]);

  if (targetsLoading) return <p className="text-sm text-muted-foreground">Memuat target...</p>;
  if (!canManage) return <p className="text-sm text-muted-foreground">Anda hanya memiliki akses lihat.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Target Okupansi -- {propertyName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Target Okupansi (%) -- di bawah ini = LOW</label>
          <Input type="number" value={targetPct} onChange={(e) => setTargetPct(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Ambang Kritis (%) -- di atas/sama = HIGH</label>
          <Input type="number" value={criticalPct} onChange={(e) => setCriticalPct(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Plafon Budget Harian (Rp)</label>
          <Input type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Plafon Budget Mingguan (Rp) -- opsional, misal 1.000.000/minggu. Kosongkan jika hanya ingin plafon harian.</label>
          <Input type="number" placeholder="Tidak ada plafon mingguan terpisah" value={maxWeeklyBudget} onChange={(e) => setMaxWeeklyBudget(e.target.value)} />
        </div>
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const result = await saveOccupancyTargetAction({
              id: existing?.id,
              propertyName,
              targetOccupancyPct: Number(targetPct),
              criticalOccupancyPct: Number(criticalPct),
              maxDailyBudgetIdr: Number(maxBudget),
              maxWeeklyBudgetIdr: maxWeeklyBudget.trim() === "" ? null : Number(maxWeeklyBudget),
              isActive: true,
            });
            setSaving(false);
            if (!result.success) toast.error(result.error);
            else {
              toast.success("Target disimpan");
              queryClient.invalidateQueries({ queryKey: ["occupancy-targets"] });
              queryClient.invalidateQueries({ queryKey: ["occupancy-calendar"] });
            }
          }}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Simpan Target
        </Button>
      </CardContent>
    </Card>
  );
}

function CopilotPanel() {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<{ answer: string; dataGap: boolean } | null>(null);
  const [asking, setAsking] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tanya Occupancy AI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Menjawab HANYA dari data okupansi/campaign/histori nyata -- tidak mengarang angka.</p>
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Contoh: Kenapa okupansi minggu ini rendah?" />
        <Button
          disabled={asking || question.trim().length === 0}
          onClick={async () => {
            setAsking(true);
            const result = await askOccupancyCopilotAction(question.trim());
            setAsking(false);
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            setAnswer(result.data ?? null);
          }}
        >
          {asking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Tanya
        </Button>
        {answer && (
          <div className="rounded-md border p-3 text-sm">
            <p>{answer.answer}</p>
            {answer.dataGap && <p className="mt-2 text-xs text-muted-foreground">AI menandai ada data yang belum tersedia untuk menjawab ini secara lengkap.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
