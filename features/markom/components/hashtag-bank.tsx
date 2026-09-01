"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Instagram, Loader2, Music2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import type { CompetitorFocus } from "@/repositories/social.repository";

import { listHashtagBankAction, triggerHashtagBankRefreshAction } from "../actions/social.actions";

const TIER_LABEL = { broad: "Broad", medium: "Medium", niche: "Niche" } as const;
const TIER_ORDER = ["broad", "medium", "niche"] as const;

interface HashtagBankPanelProps {
  focus: CompetitorFocus;
  platform: "instagram" | "tiktok";
  canManage: boolean;
}

function HashtagBankPanel({ focus, platform, canManage }: HashtagBankPanelProps) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const queryKey = ["markom-hashtag-bank", focus, platform];

  const { data, isLoading } = useQuery({ queryKey, queryFn: () => listHashtagBankAction(focus, platform) });

  async function handleRefresh() {
    setRefreshing(true);
    const result = await triggerHashtagBankRefreshAction(focus, platform);
    setRefreshing(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menjalankan riset hashtag");
      return;
    }
    toast.success("AI sedang meriset hashtag, daftar akan diperbarui dalam beberapa saat");
    setTimeout(() => queryClient.invalidateQueries({ queryKey }), 8000);
  }

  const items = data ?? [];
  const generatedAt = items[0]?.generated_at;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {generatedAt ? `Diperbarui ${new Date(generatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}` : "Belum pernah diriset"}
        </p>
        {canManage && (
          <Button size="sm" variant="outline" disabled={refreshing} onClick={handleRefresh}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Riset Ulang
          </Button>
        )}
      </div>

      {!isLoading && items.length === 0 && (
        <EmptyState icon={Hash} title="Belum ada hashtag bank" description='AI meriset otomatis tiap minggu, atau klik "Riset Ulang" untuk hasil sekarang.' />
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {TIER_ORDER.map((tier) => {
            const tierItems = items.filter((i) => i.tier === tier);
            if (tierItems.length === 0) return null;
            return (
              <Card key={tier}>
                <CardContent className="space-y-2 p-4">
                  <p className="text-xs font-medium text-muted-foreground">{TIER_LABEL[tier]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tierItems.map((item) => (
                      <Badge key={item.id} variant="secondary" title={item.rationale ?? undefined}>
                        #{item.hashtag}
                      </Badge>
                    ))}
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

interface HashtagBankProps {
  focus: CompetitorFocus;
  canManage: boolean;
}

/**
 * AI-generated hashtag bank (0251), following the 30/40/30 broad/medium/
 * niche formula already documented in the markom system prompt --
 * regenerated wholesale weekly per (focus, platform), never accumulated.
 */
export function HashtagBank({ focus, canManage }: HashtagBankProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Hashtag Bank</p>
      <Tabs defaultValue="instagram">
        <TabsList>
          <TabsTrigger value="instagram">
            <Instagram className="h-3.5 w-3.5" /> Instagram
          </TabsTrigger>
          <TabsTrigger value="tiktok">
            <Music2 className="h-3.5 w-3.5" /> TikTok
          </TabsTrigger>
        </TabsList>
        <TabsContent value="instagram">
          <HashtagBankPanel focus={focus} platform="instagram" canManage={canManage} />
        </TabsContent>
        <TabsContent value="tiktok">
          <HashtagBankPanel focus={focus} platform="tiktok" canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
