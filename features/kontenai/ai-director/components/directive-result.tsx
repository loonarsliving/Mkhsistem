import { ArrowRight, Megaphone, Palette, Tags, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductionDirective, TargetPlatform } from "@/features/kontenai/types";

const PLATFORM_LABEL: Record<TargetPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

interface DirectiveResultProps {
  directive: ProductionDirective;
}

/**
 * Renders a ProductionDirective as the clear hand-off artifact to
 * Sprint 4 (Storyboard Engine) -- everything the storyboard step needs
 * to turn this into a scene-by-scene plan.
 */
export function DirectiveResult({ directive }: DirectiveResultProps) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Arahan Produksi (Production Directive)</CardTitle>
        <Badge variant="outline">{PLATFORM_LABEL[directive.targetPlatform]}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5" />
            Narrative Angle
          </p>
          <p className="text-sm">{directive.narrativeAngle}</p>
        </section>

        <section className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ArrowRight className="h-3.5 w-3.5" />
            Key Messages
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {directive.keyMessages.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
            Visual Style
          </p>
          <p className="text-sm">{directive.visualStyle}</p>
        </section>

        <section className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Tags className="h-3.5 w-3.5" />
            Recommended Asset Tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {directive.recommendedAssetTags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </section>

        <section className="space-y-1 rounded-md border border-border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Call To Action
          </p>
          <p className="text-sm font-medium">{directive.callToAction}</p>
        </section>
      </CardContent>
    </Card>
  );
}
