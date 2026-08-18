import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface RevenueTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}

const TONE_CLASS: Record<NonNullable<RevenueTileProps["tone"]>, string> = {
  default: "bg-muted text-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

const TONE_WRAPPER_CLASS: Record<NonNullable<RevenueTileProps["tone"]>, string> = {
  default: "border-border",
  success: "border-success/20 bg-success/5",
  warning: "border-warning/20 bg-warning/5",
  destructive: "border-destructive/20 bg-destructive/5",
};

/**
 * For monetary KPIs that can run into the hundreds of millions or billions
 * of Rupiah (Revenue, Target Revenue, Collection). Always spans the full
 * width of whatever grid it sits in (`col-span-full`) and never wraps --
 * the font shrinks fluidly with viewport width instead, so every digit
 * stays on one line on desktop, tablet, and mobile alike.
 */
export function RevenueTile({ icon: Icon, label, value, tone = "default", className }: RevenueTileProps) {
  return (
    <div className={cn("col-span-full flex items-center gap-4 rounded-lg border p-4 sm:p-5", TONE_WRAPPER_CLASS[tone], className)}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONE_CLASS[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="whitespace-nowrap text-[clamp(1.125rem,4.5vw,2.25rem)] font-bold leading-tight tabular-nums">{value}</p>
      </div>
    </div>
  );
}
