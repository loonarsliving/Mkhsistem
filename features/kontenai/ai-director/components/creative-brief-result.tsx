import { Heart, Lightbulb, MessageSquare, MousePointerClick, Sparkles, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { objectiveLabel, platformLabel } from "@/features/kontenai/ai-director/types";
import type { KontenAiCreativeBriefRow } from "@/types/domain";

interface CreativeBriefResultProps {
  brief: Pick<
    KontenAiCreativeBriefRow,
    "objective" | "platform" | "big_idea" | "hook" | "key_message" | "target_emotion" | "cta" | "content_angle" | "referenced_asset_ids"
  >;
}

const FIELDS: { key: keyof CreativeBriefResultProps["brief"]; label: string; icon: typeof Lightbulb }[] = [
  { key: "big_idea", label: "Big Idea", icon: Lightbulb },
  { key: "hook", label: "Hook", icon: Sparkles },
  { key: "key_message", label: "Key Message", icon: MessageSquare },
  { key: "target_emotion", label: "Target Emotion", icon: Heart },
  { key: "cta", label: "CTA", icon: MousePointerClick },
  { key: "content_angle", label: "Content Angle", icon: Target },
];

/** Renders the six Creative Brief fields -- shared by the "just generated" result view and the history detail view. */
export function CreativeBriefResult({ brief }: CreativeBriefResultProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">Creative Brief</CardTitle>
        <div className="flex gap-1.5">
          <Badge variant="secondary">{objectiveLabel(brief.objective)}</Badge>
          <Badge variant="outline">{platformLabel(brief.platform)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {FIELDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm">{brief[key] as string}</p>
            </div>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          {brief.referenced_asset_ids.length > 0
            ? `Disusun berdasarkan ${brief.referenced_asset_ids.length} aset dari Asset Library yang sudah dianalisis Gemini Vision.`
            : "Belum ada aset relevan yang sudah dianalisis Gemini Vision saat brief ini dibuat."}
        </p>
      </CardContent>
    </Card>
  );
}
