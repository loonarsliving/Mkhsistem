"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setKontenAiAutomationEnabledAction } from "@/features/kontenai/actions/automation-settings.actions";
import { Switch } from "@/components/ui/switch";

interface AutomationToggleProps {
  initialEnabled: boolean;
}

/**
 * On/off switch for the full daily KontenAI automation (brief -> render ->
 * Content Studio review -> auto-publish -> storage cleanup). Off by default
 * -- the dispatch cron (kontenai_automation_dispatch, every 5 minutes)
 * checks this flag and does nothing at all while it's off, so leaving it
 * off is always safe.
 */
export function AutomationToggle({ initialEnabled }: AutomationToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const result = await setKontenAiAutomationEnabledAction(next);
      if (!result.success) {
        setEnabled(!next);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Automasi KontenAI diaktifkan" : "Automasi KontenAI dimatikan");
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Automasi Penuh KontenAI</p>
        <p className="text-sm text-muted-foreground">
          Bila aktif: brief harian (occupancy/leasehold/beauty) otomatis diproduksi jadi video, dikirim ke Content Studio untuk
          direview AI, dan bila lolos langsung dijadwalkan tayang -- video dihapus dari storage begitu selesai tayang.
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={handleToggle} disabled={isPending} aria-label="Toggle automasi KontenAI" />
    </div>
  );
}
