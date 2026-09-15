"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export interface PublicSiteplanUnit {
  blok: string;
  status: string;
}

interface PublicSiteplanShareViewProps {
  nama: string;
  units: PublicSiteplanUnit[];
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Hand-placed marker positions for the Loonars 2 marketing render
 * (public/siteplan/loonars-2-marketing.jpg, 1024x1536). This is the exact
 * artwork the owner supplied for sharing -- not the abstract grid the
 * internal /siteplan viewer uses -- so hotspot coordinates are specific to
 * this one image, not data-driven the way the retired 0202
 * loonars_unit_positions table was.
 *
 * Coordinates were read off the actual image (percentage of width/height),
 * not guessed: both label columns sit at a fixed x (AVARA left at 17%,
 * BANYU right at 83%), and the 10 rows per column run from y=81% at unit 01
 * up to y=9% at unit 10 in even 8%-height steps, confirmed by overlaying a
 * 5%-gridline reference image and reading each label's row against it.
 */
function markerPosition(blok: string): { xPct: number; yPct: number } | null {
  const match = /^(AVARA|BANYU)-(\d{2})$/.exec(blok);
  if (!match) return null;
  const [, row, numStr] = match;
  const n = Number(numStr);
  if (n < 1 || n > 10) return null;
  return {
    xPct: row === "AVARA" ? 17 : 83,
    yPct: 81 - (n - 1) * 8,
  };
}

/** Matches the internal viewer's SiteplanUnitStatusBadge palette (tersedia=success, dp=primary, verifikasi=warning, terjual=destructive), tinted semi-transparent so the original "AVARA - 10" label text stays legible underneath. */
const STATUS_OVERLAY_CLASS: Record<string, string> = {
  tersedia: "bg-success/60 ring-success",
  dp: "bg-primary/60 ring-primary",
  verifikasi: "bg-warning/60 ring-warning",
  terjual: "bg-destructive/65 ring-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  tersedia: "Tersedia",
  dp: "Dalam Proses (DP)",
  verifikasi: "Menunggu Verifikasi",
  terjual: "Terjual",
};

/**
 * The public, unauthenticated live siteplan a sales rep shares over WhatsApp. Auto-refreshes every
 * 30s (router.refresh() re-runs the server component's data fetch) so a family member who keeps the
 * link open sees a block flip to "Terjual" without having to reopen it -- this is a live board, not a
 * one-time export.
 */
export function PublicSiteplanShareView({ nama, units, imageSrc, imageWidth, imageHeight }: PublicSiteplanShareViewProps) {
  const router = useRouter();

  React.useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(interval);
  }, [router]);

  const statusByBlok = new Map(units.map((u) => [u.blok, u.status]));

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Siteplan Live</p>
        <h1 className="text-xl font-bold">{nama}</h1>
      </div>

      <div className="relative overflow-hidden rounded-xl shadow-md ring-1 ring-border">
        <Image src={imageSrc} alt={`Siteplan ${nama}`} width={imageWidth} height={imageHeight} className="h-auto w-full" priority />
        {units.map((unit) => {
          const pos = markerPosition(unit.blok);
          if (!pos) return null;
          return (
            <div
              key={unit.blok}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md ring-2",
                STATUS_OVERLAY_CLASS[unit.status] ?? "bg-muted/60 ring-muted",
              )}
              style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, width: "15%", height: "3.4%" }}
              title={`${unit.blok} — ${STATUS_LABEL[unit.status] ?? unit.status}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 text-xs">
        {(["tersedia", "dp", "verifikasi", "terjual"] as const).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-3 rounded-sm ring-1", STATUS_OVERLAY_CLASS[status])} />
            {STATUS_LABEL[status]}
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Status unit diperbarui langsung dari sistem dan menyegarkan otomatis setiap 30 detik.
      </p>

      {statusByBlok.size === 0 && <p className="text-center text-sm text-muted-foreground">Belum ada data unit untuk siteplan ini.</p>}
    </div>
  );
}
