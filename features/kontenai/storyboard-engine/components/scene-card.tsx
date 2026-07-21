"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EditableScene } from "@/features/kontenai/storyboard-engine/types";
import { SCENE_TRANSITIONS } from "@/features/kontenai/storyboard-engine/types";
import { TagEditor } from "@/features/kontenai/storyboard-engine/components/tag-editor";

interface SceneCardProps {
  scene: EditableScene;
  index: number;
  total: number;
  onChange: (scene: EditableScene) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

export function SceneCard({ scene, index, total, onChange, onMoveUp, onMoveDown, onRemove }: SceneCardProps) {
  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            Scene {index + 1}
          </Badge>
          <span className="text-xs text-muted-foreground">of {total}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index === 0}
            onClick={onMoveUp}
            aria-label="Pindahkan scene ke atas"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index === total - 1}
            onClick={onMoveDown}
            aria-label="Pindahkan scene ke bawah"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={total <= 1}
            aria-label="Hapus scene"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Deskripsi scene</label>
          <Textarea
            value={scene.description}
            onChange={(e) => onChange({ ...scene, description: e.target.value })}
            className="min-h-16 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Durasi (detik)</label>
            <Input
              type="number"
              min={1}
              value={scene.durationSeconds}
              onChange={(e) => onChange({ ...scene, durationSeconds: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <label className="text-xs font-medium text-muted-foreground">Transisi</label>
            <Select value={scene.transition} onValueChange={(value) => onChange({ ...scene, transition: value as EditableScene["transition"] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENE_TRANSITIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Text overlay</label>
          <Input
            value={scene.textOverlay}
            onChange={(e) => onChange({ ...scene, textOverlay: e.target.value })}
            placeholder="Opsional, kosongkan jika tidak ada teks di layar"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tag aset wajib</label>
          <TagEditor tags={scene.requiredAssetTags} onChange={(tags) => onChange({ ...scene, requiredAssetTags: tags })} />
        </div>
      </CardContent>
    </Card>
  );
}
