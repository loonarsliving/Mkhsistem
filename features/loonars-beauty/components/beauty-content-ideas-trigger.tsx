"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { triggerContentIdeasAction } from "../actions/loonars-beauty.actions";

/**
 * On-demand trigger for the automated content-idea pipeline (0126): real
 * Zernio performance + the latest competitor comparison's gaps/
 * recommendations -> 3 concrete ideas inserted straight into
 * loonars_content_items (status='idea'). Runs automatically every Monday
 * regardless -- this just lets the team get a fresh batch now.
 */
export function BeautyContentIdeasTrigger() {
  const queryClient = useQueryClient();
  const [triggering, setTriggering] = React.useState(false);

  async function handleTrigger() {
    setTriggering(true);
    const result = await triggerContentIdeasAction();
    setTriggering(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat ide konten");
      return;
    }
    toast.success("AI sedang membuat ide konten baru berdasarkan performa & analisa kompetitor -- akan muncul di Rencana Konten sebentar lagi");
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["loonars-content-items"] }), 10000);
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Buat 3 ide konten baru otomatis berdasarkan performa akun & hasil analisa kompetitor terbaru (berjalan otomatis tiap Senin).
        </p>
        <Button size="sm" variant="outline" disabled={triggering} onClick={handleTrigger}>
          {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Buat Ide Konten AI
        </Button>
      </CardContent>
    </Card>
  );
}
