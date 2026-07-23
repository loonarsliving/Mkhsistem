import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}

const TONE_CLASS: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "bg-muted text-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function StatTile({ icon: Icon, label, value, tone = "default", className }: StatTileProps) {
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-border p-4", className)}>
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONE_CLASS[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-lg font-semibold leading-tight tabular-nums">{value}</p>
      </div>
    </div>
  );
}
