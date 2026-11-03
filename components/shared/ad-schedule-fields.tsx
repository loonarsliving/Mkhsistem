"use client";

import { CalendarClock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AD_DURATION_OPTIONS,
  computeScheduleEnd,
  parseCampaignSchedule,
  remainingScheduleDays,
  type CampaignScheduleInput,
} from "@/lib/ads/campaign-schedule";

/**
 * Pilihan durasi iklan 7/14/30 hari + total budget (migrasi 0312), dipakai di
 * Ads Specialist dan Loonars AI Occupancy Ads sebelum tombol Luncurkan.
 * "continuous" = perilaku lama (budget harian, berjalan terus).
 */
export interface AdScheduleValue {
  duration: "continuous" | `${(typeof AD_DURATION_OPTIONS)[number]}`;
  totalBudget: string;
}

export const DEFAULT_AD_SCHEDULE: AdScheduleValue = { duration: "continuous", totalBudget: "" };

/** null = tanpa jadwal. Validasi final tetap di server (parseCampaignSchedule dipanggil ulang di server action). */
export function toScheduleInput(value: AdScheduleValue): CampaignScheduleInput | null {
  if (value.duration === "continuous") return null;
  return { durationDays: Number(value.duration), totalBudgetIdr: Number(value.totalBudget) };
}

/** Pesan validasi untuk ditampilkan sebelum peluncuran, atau null bila valid. */
export function adScheduleError(value: AdScheduleValue): string | null {
  const parsed = parseCampaignSchedule(toScheduleInput(value));
  return parsed.ok ? null : parsed.error;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function AdScheduleFields({
  value,
  onChange,
  disabled,
  continuousLabel,
}: {
  value: AdScheduleValue;
  onChange: (value: AdScheduleValue) => void;
  disabled?: boolean;
  /** Teks opsi "terus berjalan", mis. "Terus berjalan (Rp50.000/hari)". */
  continuousLabel: string;
}) {
  const parsed = parseCampaignSchedule(toScheduleInput(value));
  const typedSomething = value.totalBudget.trim() !== "";

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Durasi tayang</span>
        <Select value={value.duration} onValueChange={(v) => onChange({ ...value, duration: v as AdScheduleValue["duration"] })} disabled={disabled}>
          <SelectTrigger className="h-8 w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continuous">{continuousLabel}</SelectItem>
            {AD_DURATION_OPTIONS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {days} hari dengan total budget
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.duration !== "continuous" && (
        <div className="space-y-1">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total budget Rp</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={50000}
              placeholder="mis. 3000000"
              value={value.totalBudget}
              onChange={(e) => onChange({ ...value, totalBudget: e.target.value })}
              disabled={disabled}
              className="h-8 w-40"
            />
          </label>
          {parsed.ok && parsed.schedule ? (
            <p className="text-xs text-muted-foreground">
              ≈ Rp{parsed.schedule.dailyBudgetIdr.toLocaleString("id-ID")}/hari × {parsed.schedule.durationDays} hari. Iklan berhenti otomatis sekitar{" "}
              <span className="font-medium">{formatDate(computeScheduleEnd(new Date(), parsed.schedule.durationDays))}</span>. Budget harian tetap dibatasi
              plafon yang berlaku, jadi total belanja tidak akan melebihi angka ini.
            </p>
          ) : (
            typedSomething && !parsed.ok && <p className="text-xs text-destructive">{parsed.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Ringkasan jadwal untuk iklan yang sudah tayang. Tidak merender apa-apa untuk iklan tanpa jadwal. */
export function AdScheduleSummary({
  durationDays,
  totalBudgetIdr,
  endsAt,
}: {
  durationDays: number | null | undefined;
  totalBudgetIdr: number | null | undefined;
  endsAt: string | null | undefined;
}) {
  if (!durationDays || !endsAt) return null;
  const remaining = remainingScheduleDays(endsAt);
  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <CalendarClock className="h-3.5 w-3.5" />
      Jadwal {durationDays} hari
      {totalBudgetIdr ? <> &middot; total maks Rp{totalBudgetIdr.toLocaleString("id-ID")}</> : null}
      {" "}&middot; {remaining > 0 ? `sisa ${remaining} hari (berakhir ${formatDate(new Date(endsAt))})` : `berakhir ${formatDate(new Date(endsAt))}`}
    </p>
  );
}
