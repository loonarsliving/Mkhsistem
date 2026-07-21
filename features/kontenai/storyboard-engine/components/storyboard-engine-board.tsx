"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Sparkles, Send, Save, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductionDirective, Storyboard } from "@/features/kontenai/types";
import type { EditableScene } from "@/features/kontenai/storyboard-engine/types";
import { DirectivePicker } from "@/features/kontenai/storyboard-engine/components/directive-picker";
import { SceneCard } from "@/features/kontenai/storyboard-engine/components/scene-card";
import {
  generateStoryboardAction,
  listDirectivesAction,
  updateStoryboardScenesAction,
} from "@/features/kontenai/storyboard-engine/actions/storyboard-engine.actions";

function toEditableScenes(storyboard: Storyboard): EditableScene[] {
  return storyboard.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((scene) => ({
      id: scene.id,
      order: scene.order,
      description: scene.description,
      durationSeconds: scene.durationSeconds,
      transition: scene.transition,
      textOverlay: scene.textOverlay ?? "",
      requiredAssetTags: scene.requiredAssetTags,
      selectedAssetId: scene.selectedAssetId,
    }));
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function StoryboardEngineBoard() {
  const { data: directives, isLoading: isLoadingDirectives } = useQuery({
    queryKey: ["kontenai-storyboard-engine-directives"],
    queryFn: listDirectivesAction,
  });

  const [selectedDirective, setSelectedDirective] = useState<ProductionDirective | null>(null);
  const [scenes, setScenes] = useState<EditableScene[] | null>(null);
  const [directiveIdOfScenes, setDirectiveIdOfScenes] = useState<string | null>(null);
  const [storyboardId, setStoryboardId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDurationSeconds = useMemo(
    () => (scenes ?? []).reduce((sum, scene) => sum + scene.durationSeconds, 0),
    [scenes],
  );

  async function handleGenerate() {
    if (!selectedDirective) return;
    setIsGenerating(true);
    setError(null);
    try {
      const storyboard = await generateStoryboardAction(selectedDirective.id);
      setScenes(toEditableScenes(storyboard));
      setDirectiveIdOfScenes(selectedDirective.id);
      setStoryboardId(storyboard.id);
      setIsDirty(false);
      setSavedJustNow(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat storyboard. Coba lagi.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateScene(index: number, next: EditableScene) {
    setScenes((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
    setIsDirty(true);
    setSavedJustNow(false);
  }

  function moveScene(index: number, direction: -1 | 1) {
    setScenes((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy.map((scene, i) => ({ ...scene, order: i }));
    });
    setIsDirty(true);
    setSavedJustNow(false);
  }

  function removeScene(index: number) {
    setScenes((prev) => {
      if (!prev || prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index).map((scene, i) => ({ ...scene, order: i }));
    });
    setIsDirty(true);
    setSavedJustNow(false);
  }

  async function handleSaveScenes() {
    if (!scenes || !storyboardId) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateStoryboardScenesAction(
        storyboardId,
        scenes.map((scene) => ({
          id: scene.id,
          order: scene.order,
          description: scene.description,
          durationSeconds: scene.durationSeconds,
          transition: scene.transition,
          textOverlay: scene.textOverlay.trim() === "" ? null : scene.textOverlay,
          requiredAssetTags: scene.requiredAssetTags,
          selectedAssetId: scene.selectedAssetId,
        })),
      );
      if (!result.success) {
        setError(result.error ?? "Gagal menyimpan perubahan storyboard.");
        return;
      }
      setIsDirty(false);
      setSavedJustNow(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan storyboard.");
    } finally {
      setIsSaving(false);
    }
  }

  const hasStoryboardForSelection = scenes !== null && directiveIdOfScenes === selectedDirective?.id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Pilih Production Directive</CardTitle>
          <CardDescription>
            Directive dari AI Director berisi sudut cerita, gaya visual, dan platform target. Pilih satu untuk dijadikan storyboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DirectivePicker
            directives={directives}
            isLoading={isLoadingDirectives}
            selectedId={selectedDirective?.id ?? null}
            onSelect={(directive) => {
              setSelectedDirective(directive);
              setError(null);
            }}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedDirective
            ? `Directive terpilih: "${selectedDirective.narrativeAngle}"`
            : "Belum ada directive yang dipilih."}
        </p>
        <Button onClick={handleGenerate} disabled={!selectedDirective || isGenerating} className="sm:w-auto">
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isGenerating ? "Membuat storyboard..." : hasStoryboardForSelection ? "Buat Ulang Storyboard" : "Generate Storyboard"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {isGenerating && !hasStoryboardForSelection && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      )}

      {hasStoryboardForSelection && scenes && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Total durasi storyboard</p>
                  <p className="text-xl font-semibold tabular-nums">{formatDuration(totalDurationSeconds)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{scenes.length} scene</Badge>
                <Button
                  type="button"
                  variant={isDirty ? "default" : "outline"}
                  size="sm"
                  onClick={handleSaveScenes}
                  disabled={isSaving || !isDirty}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : savedJustNow && !isDirty ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {isSaving ? "Menyimpan..." : savedJustNow && !isDirty ? "Tersimpan" : "Simpan Perubahan"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                index={index}
                total={scenes.length}
                onChange={(next) => updateScene(index, next)}
                onMoveUp={() => moveScene(index, -1)}
                onMoveDown={() => moveScene(index, 1)}
                onRemove={() => removeScene(index)}
              />
            ))}
          </div>

          <Card>
            <CardContent className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium">Lanjutkan ke Asset Selector</p>
                <p className="text-xs text-muted-foreground">Tersedia setelah Asset Selector terhubung (Sprint 5).</p>
              </div>
              <Button variant="secondary" disabled title="Tersedia setelah Asset Selector terhubung">
                <Send className="h-4 w-4" />
                Kirim ke Asset Selector
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {!hasStoryboardForSelection && !isGenerating && selectedDirective && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Klik &quot;Generate Storyboard&quot; untuk membuat urutan scene dari directive ini.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
