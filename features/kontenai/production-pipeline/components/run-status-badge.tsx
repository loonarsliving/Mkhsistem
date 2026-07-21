import type { PipelineRunStatus } from "@/features/kontenai/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";

const STATUS_CONFIG: Record<PipelineRunStatus, { label: string; variant: BadgeProps["variant"] }> = {
  in_progress: { label: "In Progress", variant: "default" },
  awaiting_revision: { label: "Awaiting Revision", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export function RunStatusBadge({ status }: { status: PipelineRunStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
