import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { AnimatedValue } from "./animated-value";

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
    <div
      className={cn(
        "group anim-rise flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_hsl(30_30%_20%/0.35)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110",
          TONE_CLASS[tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-lg font-semibold leading-tight tabular-nums">
          <AnimatedValue value={value} />
        </p>
      </div>
    </div>
  );
}
