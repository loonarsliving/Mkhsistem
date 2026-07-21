import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AnalysisStatus } from "@/features/kontenai/gemini-vision/types";

const STATUS_CONFIG: Record<AnalysisStatus, { label: string; variant: "outline" | "warning" | "success" | "destructive"; Icon: typeof CheckCircle2 }> = {
  not_analyzed: { label: "Belum dianalisis", variant: "outline", Icon: CircleDashed },
  analyzing: { label: "Menganalisis...", variant: "warning", Icon: Loader2 },
  analyzed: { label: "Selesai dianalisis", variant: "success", Icon: CheckCircle2 },
  failed: { label: "Gagal dianalisis", variant: "destructive", Icon: XCircle },
};

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1 font-normal">
      <Icon className={`h-3 w-3 ${status === "analyzing" ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );
}
