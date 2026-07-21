"use client";

import { useState } from "react";
import { Clapperboard, Layers, Loader2, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoryboardSummary } from "@/features/kontenai/render-engine/types";

interface ReadyToRenderListProps {
  storyboards: StoryboardSummary[];
  queuedStoryboardIds: Set<string>;
  onRender: (storyboardId: string) => Promise<void>;
}

export function ReadyToRenderList({ storyboards, queuedStoryboardIds, onRender }: ReadyToRenderListProps) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function handleRender(storyboardId: string) {
    setSubmittingId(storyboardId);
    try {
      await onRender(storyboardId);
    } finally {
      setSubmittingId(null);
    }
  }

  if (storyboards.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <Clapperboard className="h-8 w-8 opacity-50" />
          <p>Belum ada storyboard yang siap dirender.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {storyboards.map((storyboard) => {
        const isQueued = queuedStoryboardIds.has(storyboard.id);
        const isSubmitting = submittingId === storyboard.id;
        return (
          <Card key={storyboard.id} className="flex flex-col">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-snug">{storyboard.title}</CardTitle>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {storyboard.targetPlatform}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  {storyboard.sceneCount} scenes
                </span>
                <span className="flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  {storyboard.totalDurationSeconds}s
                </span>
              </div>
            </CardHeader>
            <CardContent className="mt-auto pt-0">
              <Button
                className="w-full"
                size="sm"
                disabled={isQueued || isSubmitting}
                onClick={() => handleRender(storyboard.id)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : isQueued ? (
                  "Already Queued"
                ) : (
                  <>
                    <Clapperboard className="h-4 w-4" />
                    Render
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
