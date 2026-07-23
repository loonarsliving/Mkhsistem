"use client";

import * as React from "react";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SceneEditorCard } from "@/features/kontenai/storyboard-engine/components/scene-editor-card";
import { StoryboardPreviewDialog } from "@/features/kontenai/storyboard-engine/components/storyboard-preview-dialog";
import { useSaveStoryboardScenes } from "@/features/kontenai/storyboard-engine/hooks/use-storyboard-mutations";
import type { KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";

interface StoryboardBuilderProps {
  storyboardId: string;
  title: string;
  initialScenes: KontenAiStoryboardScene[];
}

function blankScene(order: number): KontenAiStoryboardScene {
  return {
    id: `scene-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    order,
    sceneTitle: "",
    visualDescription: "",
    cameraAngle: "",
    shotType: "",
    motion: "",
    voiceOver: "",
    onScreenText: "",
    durationSeconds: 4,
    selectedAssetId: null,
    assetMatches: [],
  };
}

/** The Storyboard Engine builder: add/remove/reorder scenes, edit every field, preview, and save -- keyed by storyboardId in the parent so switching storyboards resets this state. */
export function StoryboardBuilder({ storyboardId, title, initialScenes }: StoryboardBuilderProps) {
  const [scenes, setScenes] = React.useState<KontenAiStoryboardScene[]>(initialScenes);
  const saveMutation = useSaveStoryboardScenes();

  const totalDuration = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  function updateScene(index: number, patch: Partial<KontenAiStoryboardScene>) {
    setScenes((prev) => prev.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)));
  }

  function removeScene(index: number) {
    setScenes((prev) => prev.filter((_, i) => i !== index));
  }

  function addScene() {
    setScenes((prev) => [...prev, blankScene(prev.length)]);
  }

  function moveScene(index: number, direction: -1 | 1) {
    setScenes((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {scenes.length} scene -- total {totalDuration}s
          </p>
        </div>
        <div className="flex gap-2">
          <StoryboardPreviewDialog title={title} scenes={scenes} />
          <Button
            type="button"
            size="sm"
            disabled={saveMutation.isPending || scenes.length === 0}
            onClick={() => saveMutation.mutate({ storyboardId, scenes })}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Menyimpan..." : "Save Changes"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {scenes.map((scene, index) => (
          <SceneEditorCard
            key={scene.id}
            scene={scene}
            index={index}
            total={scenes.length}
            onChange={(patch) => updateScene(index, patch)}
            onRemove={() => removeScene(index)}
            onMoveUp={() => moveScene(index, -1)}
            onMoveDown={() => moveScene(index, 1)}
          />
        ))}

        <Button type="button" variant="outline" className="w-full" onClick={addScene}>
          <Plus className="h-4 w-4" />
          Tambah Scene
        </Button>
      </CardContent>
    </Card>
  );
}
