"use client";

import { Loader2, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Storyboard } from "@/features/kontenai/types";
import { cn } from "@/lib/utils";

interface StoryboardListProps {
  storyboards: Storyboard[];
  activeStoryboardId: string | null;
  runningStoryboardId: string | null;
  hasResults: (storyboardId: string) => boolean;
  onSelect: (storyboardId: string) => void;
  onRunSelection: (storyboardId: string) => void;
}

export function StoryboardList({
  storyboards,
  activeStoryboardId,
  runningStoryboardId,
  hasResults,
  onSelect,
  onRunSelection,
}: StoryboardListProps) {
  return (
    <div className="space-y-3">
      {storyboards.map((storyboard) => {
        const isActive = storyboard.id === activeStoryboardId;
        const isRunning = storyboard.id === runningStoryboardId;
        const done = hasResults(storyboard.id);

        return (
          <Card
            key={storyboard.id}
            className={cn("cursor-pointer transition-colors", isActive && "border-primary")}
            onClick={() => onSelect(storyboard.id)}
          >
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">Storyboard {storyboard.id}</p>
                <p className="text-xs text-muted-foreground">
                  {storyboard.scenes.length} scene &middot; {storyboard.totalDurationSeconds}s total
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {done && (
                    <Badge variant="success" className="text-[10px]">
                      Hasil tersedia
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={done ? "outline" : "default"}
                disabled={isRunning}
                onClick={(e) => {
                  e.stopPropagation();
                  onRunSelection(storyboard.id);
                }}
              >
                {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {isRunning ? "Memilih aset..." : done ? "Jalankan Ulang" : "Auto-Select Assets"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
