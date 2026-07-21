import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { StudioVerdict } from "@/features/kontenai/types";

const VERDICT_VARIANT: Record<StudioVerdict, BadgeProps["variant"]> = {
  approved: "success",
  needs_revision: "warning",
};

const VERDICT_LABEL: Record<StudioVerdict, string> = {
  approved: "Disetujui",
  needs_revision: "Perlu Revisi",
};

/** Small verdict badge shared by the summary panel and the record list. */
export function LearningVerdictBadge({ verdict }: { verdict: StudioVerdict | null }) {
  if (!verdict) return <Badge variant="secondary">Belum Dinilai</Badge>;
  return <Badge variant={VERDICT_VARIANT[verdict]}>{VERDICT_LABEL[verdict]}</Badge>;
}
