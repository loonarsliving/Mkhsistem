"use client";

import { Clock, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";

interface StoryboardPreviewDialogProps {
  title: string;
  scenes: KontenAiStoryboardScene[];
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/** Read-only, scene-by-scene walkthrough of the storyboard -- the "Preview Storyboard" requirement. */
export function StoryboardPreviewDialog({ title, scenes }: StoryboardPreviewDialogProps) {
  const totalDuration = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={scenes.length === 0}>
          <Eye className="h-4 w-4" />
          Preview Storyboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {scenes.length} scene -- total {formatDuration(totalDuration)}
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4 border-l pl-4">
          {scenes.map((scene, index) => (
            <li key={scene.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Scene {index + 1}</Badge>
                <p className="text-sm font-medium">{scene.sceneTitle || "(tanpa judul)"}</p>
                <Badge variant="outline" className="ml-auto font-mono text-xs">
                  {scene.durationSeconds}s
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{scene.visualDescription}</p>
              <div className="flex flex-wrap gap-1.5">
                {scene.cameraAngle && <Badge variant="outline">{scene.cameraAngle}</Badge>}
                {scene.shotType && <Badge variant="outline">{scene.shotType}</Badge>}
                {scene.motion && <Badge variant="outline">{scene.motion}</Badge>}
              </div>
              {scene.voiceOver && (
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">Voice Over: </span>
                  {scene.voiceOver}
                </p>
              )}
              {scene.onScreenText && (
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">On Screen Text: </span>
                  &quot;{scene.onScreenText}&quot;
                </p>
              )}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
