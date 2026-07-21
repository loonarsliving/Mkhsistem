"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listContentBriefsAction } from "@/features/kontenai/ai-director/actions/ai-director.actions";
import { BriefDetailPanel } from "@/features/kontenai/ai-director/components/brief-detail-panel";
import { BriefList } from "@/features/kontenai/ai-director/components/brief-list";

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 py-6">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex h-full min-h-[240px] items-center justify-center py-10 text-sm text-muted-foreground">
          Memuat brief Content Planner...
        </CardContent>
      </Card>
    </div>
  );
}

export function AiDirectorBoard() {
  const { data: briefs, isLoading } = useQuery({
    queryKey: ["kontenai-ai-director-briefs"],
    queryFn: listContentBriefsAction,
  });

  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);

  if (isLoading) return <BoardSkeleton />;

  const briefList = briefs ?? [];

  if (briefList.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <Wand2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada brief untuk diproses</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Brief akan muncul di sini setelah Content Planner membuat task baru dan (opsional) Content Audit menambahkan insight performa.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedBrief = briefList.find((brief) => brief.id === selectedBriefId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Content Briefs ({briefList.length})</h2>
        <BriefList briefs={briefList} selectedBriefId={selectedBriefId} onSelect={setSelectedBriefId} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Arahan Produksi</h2>
        {selectedBrief ? (
          <BriefDetailPanel key={selectedBrief.id} brief={selectedBrief} />
        ) : (
          <Card>
            <CardContent className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 py-10 text-center">
              <Wand2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Pilih salah satu brief di sebelah kiri untuk melihat detail dan menghasilkan arahan produksi.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
