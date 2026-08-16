import { AlertTriangle, Camera, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ConstructionProgressAssessment } from "@/repositories/construction-finance.repository";

function formatAssessedAt(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" });
}

/**
 * Owner's request: show the AI photo-progress assessment inside the module
 * itself, not just the Saturday WhatsApp report -- one building-wide %
 * refreshed every Saturday (construction_dispatch_progress_assessment,
 * 0227), combining each block's latest photo AI reading into one synthesis.
 */
export function ConstructionProgressAssessmentCard({ assessment, projectName }: { assessment: ConstructionProgressAssessment; projectName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4" />
          Progres Bangunan (Penilaian AI) — {projectName}
        </CardTitle>
        <CardDescription>Disintesis tiap Sabtu dari foto progres lapangan per blok. Data pendukung, bukan angka final.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp className="h-3.5 w-3.5" />
              Estimasi Progres Keseluruhan
            </span>
            <span className="text-2xl font-semibold tabular-nums">{assessment.overallProgressPct}%</span>
          </div>
          <Progress value={assessment.overallProgressPct} />
        </div>

        {assessment.summary && <p className="text-sm text-muted-foreground">{assessment.summary}</p>}

        {assessment.concerns.length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Perlu Perhatian
            </p>
            <ul className="ml-5 list-disc text-sm text-muted-foreground">
              {assessment.concerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {assessment.blockSnapshot.map((b) => (
            <Badge key={b.code} variant={b.photoCount7d > 0 ? "secondary" : "outline"} title={b.aiStage ?? undefined}>
              {b.code}
              {b.aiProgressPct !== null ? ` ${b.aiProgressPct}%` : ""}
            </Badge>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {assessment.blockCountWithPhotos} dari {assessment.blockCount} blok ada foto 7 hari terakhir. Terakhir dinilai: {formatAssessedAt(assessment.assessedAt)}.
        </p>
      </CardContent>
    </Card>
  );
}
