"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportClientErrorAction } from "@/features/monitoring/actions/monitoring.actions";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void reportClientErrorAction({
      level: "error",
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Terjadi kesalahan</h2>
        <p className="text-sm text-muted-foreground">
          Kesalahan sudah tercatat dan akan ditinjau oleh tim sistem. Silakan coba lagi.
        </p>
      </div>
      <Button onClick={reset}>Coba Lagi</Button>
    </div>
  );
}
