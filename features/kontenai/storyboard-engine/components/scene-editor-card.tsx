"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";

interface SceneEditorCardProps {
  scene: KontenAiStoryboardScene;
  index: number;
  total: number;
  onChange: (patch: Partial<KontenAiStoryboardScene>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** One editable scene card in the Storyboard builder -- every field from the Sprint 4 spec (Scene Title, Visual Description, Camera Angle, Shot Type, Motion, Voice Over, On Screen Text, Duration), plus reorder/remove controls. */
export function SceneEditorCard({ scene, index, total, onChange, onRemove, onMoveUp, onMoveDown }: SceneEditorCardProps) {
  const idPrefix = `scene-${scene.id}`;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Scene {index + 1}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={onMoveUp} aria-label="Pindah scene ke atas">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={index === total - 1} onClick={onMoveDown} aria-label="Pindah scene ke bawah">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Hapus scene">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-title`}>Scene Title</Label>
          <Input id={`${idPrefix}-title`} value={scene.sceneTitle} onChange={(e) => onChange({ sceneTitle: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-visual`}>Visual Description</Label>
          <Textarea id={`${idPrefix}-visual`} value={scene.visualDescription} onChange={(e) => onChange({ visualDescription: e.target.value })} rows={2} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-angle`}>Camera Angle</Label>
            <Input id={`${idPrefix}-angle`} value={scene.cameraAngle} onChange={(e) => onChange({ cameraAngle: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-shot`}>Shot Type</Label>
            <Input id={`${idPrefix}-shot`} value={scene.shotType} onChange={(e) => onChange({ shotType: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-motion`}>Motion</Label>
            <Input id={`${idPrefix}-motion`} value={scene.motion} onChange={(e) => onChange({ motion: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-voiceover`}>Voice Over</Label>
          <Textarea id={`${idPrefix}-voiceover`} value={scene.voiceOver} onChange={(e) => onChange({ voiceOver: e.target.value })} rows={2} />
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-text`}>On Screen Text</Label>
            <Input id={`${idPrefix}-text`} value={scene.onScreenText} onChange={(e) => onChange({ onScreenText: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-duration`}>Duration (s)</Label>
            <Input
              id={`${idPrefix}-duration`}
              type="number"
              min={1}
              max={60}
              value={scene.durationSeconds}
              onChange={(e) => onChange({ durationSeconds: Number(e.target.value) || 1 })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
