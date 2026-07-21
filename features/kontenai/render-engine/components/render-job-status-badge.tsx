import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { RenderStatus } from "@/features/kontenai/types";

const STATUS_CONFIG: Record<RenderStatus, { label: string; variant: BadgeProps["variant"] }> = {
  queued: { label: "Queued", variant: "outline" },
  rendering: { label: "Rendering", variant: "default" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export function RenderJobStatusBadge({ status }: { status: RenderStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
