"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { SITEPLAN_UNIT_STATUS_LABEL, type SiteplanUnitStatus } from "@/constants/app";
import { cn } from "@/lib/utils";

import { getSiteplanViewerDataAction } from "../actions/siteplan.actions";
import { UnitDetailModal } from "./unit-detail-modal";
import { UnitPurchaseForm } from "./unit-purchase-form";

/** Same four-state palette/tokens as SiteplanUnitStatusBadge (components/shared/status-badge.tsx) -- markers use the raw bg-* tokens directly instead of the pill Badge component since they're circular map pins, not inline text badges. */
const MARKER_CLASS: Record<SiteplanUnitStatus, string> = {
  tersedia: "bg-success text-success-foreground",
  dp: "bg-primary text-primary-foreground",
  verifikasi: "bg-warning text-warning-foreground",
  terjual: "bg-destructive text-destructive-foreground",
};

interface SiteplanViewerProps {
  projectId: string;
}

export function SiteplanViewer({ projectId }: SiteplanViewerProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["siteplan-viewer", projectId],
    queryFn: () => getSiteplanViewerDataAction(projectId),
  });
  const [purchaseUnit, setPurchaseUnit] = React.useState<{ id: string; blok: string } | null>(null);
  const [detailUnit, setDetailUnit] = React.useState<{ id: string; blok: string; status: SiteplanUnitStatus } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["siteplan-viewer", projectId] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const image = data?.image;
  const units = data?.units ?? [];
  const positions = data?.positions ?? [];
  const positionByUnitId = new Map(positions.map((p) => [p.unit_id, p]));

  if (!image?.imageUrl) {
    return (
      <EmptyState
        icon={MapPin}
        title="Siteplan belum tersedia"
        description="Admin belum mengunggah gambar siteplan untuk project ini."
      />
    );
  }

  const aspectRatio = image.image_width && image.image_height ? image.image_width / image.image_height : 16 / 9;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          {/* Aspect-ratio wrapper keeps the image + its overlaid hotspots aligned regardless of rendered width (desktop full-width vs. a scaled-down phone screen). */}
          <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-md border bg-muted" style={{ aspectRatio }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- external/storage-hosted image, next/image's remote-pattern allowlist isn't set up for the siteplan-images bucket */}
            <img src={image.imageUrl} alt="Siteplan" className="absolute inset-0 h-full w-full object-contain" />
            {units.map((unit) => {
              const pos = positionByUnitId.get(unit.id);
              if (!pos) return null;
              const status = unit.status as SiteplanUnitStatus;
              return (
                <button
                  key={unit.id}
                  type="button"
                  className={cn(
                    // min ~28px tap target for touch usability (this app also ships as a Capacitor mobile app)
                    "absolute flex h-8 min-w-[2rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white px-1.5 text-[11px] font-bold leading-none shadow-md transition-transform hover:z-10 hover:scale-110",
                    MARKER_CLASS[status],
                  )}
                  style={{ left: `${pos.x_pct}%`, top: `${pos.y_pct}%` }}
                  title={`Unit ${unit.blok} — ${SITEPLAN_UNIT_STATUS_LABEL[status]}`}
                  onClick={() => {
                    if (status === "tersedia") {
                      setPurchaseUnit({ id: unit.id, blok: unit.blok });
                    } else {
                      setDetailUnit({ id: unit.id, blok: unit.blok, status });
                    }
                  }}
                >
                  {unit.blok}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        {(Object.entries(SITEPLAN_UNIT_STATUS_LABEL) as [SiteplanUnitStatus, string][]).map(([status, label]) => (
          <div key={status} className="flex items-center gap-2">
            <span className={cn("inline-block h-3.5 w-3.5 rounded-full", MARKER_CLASS[status])} />
            {label}
          </div>
        ))}
      </div>

      {purchaseUnit && (
        <UnitPurchaseForm
          open={Boolean(purchaseUnit)}
          onOpenChange={(open) => !open && setPurchaseUnit(null)}
          unitId={purchaseUnit.id}
          unitBlok={purchaseUnit.blok}
          onSubmitted={invalidate}
        />
      )}

      <UnitDetailModal
        open={Boolean(detailUnit)}
        onOpenChange={(open) => !open && setDetailUnit(null)}
        unitId={detailUnit?.id ?? null}
        unitBlok={detailUnit?.blok ?? ""}
        unitStatus={detailUnit?.status ?? "tersedia"}
      />
    </div>
  );
}
