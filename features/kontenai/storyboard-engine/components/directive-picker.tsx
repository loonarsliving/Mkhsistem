"use client";

import { Clapperboard, Palette, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProductionDirective } from "@/features/kontenai/types";

const PLATFORM_LABEL: Record<ProductionDirective["targetPlatform"], string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

interface DirectivePickerProps {
  directives: ProductionDirective[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (directive: ProductionDirective) => void;
}

export function DirectivePicker({ directives, isLoading, selectedId, onSelect }: DirectivePickerProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (!directives || directives.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Belum ada production directive dari AI Director. Buat directive terlebih dahulu di modul sebelumnya.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {directives.map((directive) => {
        const active = directive.id === selectedId;
        return (
          <Card
            key={directive.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(directive)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(directive);
              }
            }}
            className={cn(
              "cursor-pointer transition-colors hover:border-primary/60",
              active && "border-primary ring-1 ring-primary",
            )}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm leading-snug">{directive.narrativeAngle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Palette className="h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-1">{directive.visualStyle}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                <span>{PLATFORM_LABEL[directive.targetPlatform]}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clapperboard className="h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-1">{directive.keyMessages.length} pesan kunci</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {directive.recommendedAssetTags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
