"use client";

import { useQuery } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listCreativeBriefsAction } from "@/features/kontenai/ai-director/actions/creative-brief.actions";
import { CREATIVE_BRIEFS_QUERY_KEY } from "@/features/kontenai/ai-director/hooks/use-creative-brief-mutations";
import { objectiveLabel, platformLabel } from "@/features/kontenai/ai-director/types";
import { useGenerateStoryboard } from "@/features/kontenai/storyboard-engine/hooks/use-storyboard-mutations";

interface BriefPickerProps {
  selectedBriefId: string | null;
  onSelectBrief: (id: string) => void;
  onGenerated: (storyboardId: string) => void;
}

/** Step 1 of Storyboard Engine: "Ambil Creative Brief dari AI Director" -- picks a brief from Sprint 3's history, then generates a storyboard from it. */
export function BriefPicker({ selectedBriefId, onSelectBrief, onGenerated }: BriefPickerProps) {
  const { data: briefs, isLoading, isError, refetch } = useQuery({
    queryKey: CREATIVE_BRIEFS_QUERY_KEY,
    queryFn: listCreativeBriefsAction,
  });
  const generateMutation = useGenerateStoryboard();

  const list = briefs ?? [];
  const selectedBrief = list.find((brief) => brief.id === selectedBriefId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wand2 className="h-4 w-4 text-primary" />
          Generate Storyboard
        </CardTitle>
        <CardDescription>Pilih Creative Brief dari AI Director, lalu AI akan menyusun storyboard scene-by-scene.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">Gagal memuat daftar Creative Brief.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada Creative Brief. Buat satu di halaman{" "}
            <a href="/kontenai/ai-director" className="underline">
              AI Director
            </a>{" "}
            terlebih dahulu.
          </p>
        ) : (
          <>
            <Select value={selectedBriefId ?? undefined} onValueChange={onSelectBrief}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Creative Brief..." />
              </SelectTrigger>
              <SelectContent>
                {list.map((brief) => (
                  <SelectItem key={brief.id} value={brief.id}>
                    {brief.product_project} -- {objectiveLabel(brief.objective)} / {platformLabel(brief.platform)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedBrief && <p className="text-xs text-muted-foreground">Big Idea: {selectedBrief.big_idea}</p>}

            <Button
              type="button"
              className="w-full"
              disabled={!selectedBriefId || generateMutation.isPending}
              onClick={() => {
                if (!selectedBriefId) return;
                generateMutation.mutate(selectedBriefId, {
                  onSuccess: (storyboard) => onGenerated(storyboard.id),
                });
              }}
            >
              <Wand2 className="h-4 w-4" />
              {generateMutation.isPending ? "AI menyusun storyboard..." : "Generate Storyboard"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
