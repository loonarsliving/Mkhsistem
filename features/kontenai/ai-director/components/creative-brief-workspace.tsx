"use client";

import { AlertTriangle, Wand2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreativeBriefForm } from "@/features/kontenai/ai-director/components/creative-brief-form";
import { CreativeBriefHistory } from "@/features/kontenai/ai-director/components/creative-brief-history";
import { CreativeBriefResult } from "@/features/kontenai/ai-director/components/creative-brief-result";
import { useGenerateCreativeBrief } from "@/features/kontenai/ai-director/hooks/use-creative-brief-mutations";

function ResultPlaceholder() {
  return (
    <Card>
      <CardContent className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 py-10 text-center">
        <Wand2 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Isi Campaign Intent di sebelah kiri lalu klik &quot;Generate Creative Brief&quot;.</p>
      </CardContent>
    </Card>
  );
}

function ResultLoading() {
  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </CardContent>
    </Card>
  );
}

function ResultError({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Gagal menghasilkan Creative Brief</p>
          <p className="text-xs">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** AI Director's workspace: campaign intent form + latest generated brief + full history, all on one page. */
export function CreativeBriefWorkspace() {
  const generateMutation = useGenerateCreativeBrief();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <CreativeBriefForm />

        <div>
          {generateMutation.isPending ? (
            <ResultLoading />
          ) : generateMutation.isError ? (
            <ResultError message={generateMutation.error instanceof Error ? generateMutation.error.message : "Terjadi kesalahan"} />
          ) : generateMutation.data ? (
            <CreativeBriefResult brief={generateMutation.data.brief} />
          ) : (
            <ResultPlaceholder />
          )}
        </div>
      </div>

      <CreativeBriefHistory />
    </div>
  );
}
