"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { SITEPLAN_UNIT_STATUS_LABEL, type SiteplanUnitStatus } from "@/constants/app";
import { cn } from "@/lib/utils";

import { getSiteplanViewerDataAction } from "../actions/siteplan.actions";
import { UnitDetailModal } from "./unit-detail-modal";
import { UnitPurchaseForm } from "./unit-purchase-form";

/** Same four-state palette/tokens as SiteplanUnitStatusBadge (components/shared/status-badge.tsx) -- grid boxes use the raw bg-* tokens directly instead of the pill Badge component so the status color fills the whole tap target. */
const BOX_CLASS: Record<SiteplanUnitStatus, string> = {
  tersedia: "border-success/40 bg-success text-success-foreground hover:bg-success/90",
  dp: "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90",
  verifikasi: "border-warning/40 bg-warning text-warning-foreground hover:bg-warning/90",
  terjual: "border-destructive/40 bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const UNGROUPED_LABEL = "Belum dikelompokkan";

interface SiteplanUnit {
  id: string;
  blok: string;
  status: string;
  row_label: string | null;
}

interface SiteplanViewerProps {
  projectId: string;
}

/** Groups already-ordered units (row_label asc nulls-last, sort_order, blok) into named row sections, keeping the query's row order and putting null row_label units into a trailing "Belum dikelompokkan" bucket. */
function groupByRow(units: SiteplanUnit[]) {
  const groups = new Map<string, SiteplanUnit[]>();
  for (const unit of units) {
    const key = unit.row_label ?? UNGROUPED_LABEL;
    const list = groups.get(key);
    if (list) list.push(unit);
    else groups.set(key, [unit]);
  }
  // Ensure the ungrouped bucket always renders last, even if some units happened to sort before it.
  const ungrouped = groups.get(UNGROUPED_LABEL);
  if (ungrouped) {
    groups.delete(UNGROUPED_LABEL);
    groups.set(UNGROUPED_LABEL, ungrouped);
  }
  return Array.from(groups.entries());
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

  const units = data?.units ?? [];

  if (units.length === 0) {
    return <EmptyState icon={MapPin} title="Belum ada unit" description="Admin belum menambahkan unit untuk project ini." />;
  }

  const rows = groupByRow(units);

  return (
    <div className="space-y-6">
      {rows.map(([rowLabel, rowUnits]) => (
        <div key={rowLabel} className="space-y-2">
          <h3 className={cn("text-sm font-semibold", rowLabel === UNGROUPED_LABEL ? "text-muted-foreground" : "text-foreground")}>
            {rowLabel}
          </h3>
          <div className="flex flex-wrap gap-2">
            {rowUnits.map((unit) => {
              const status = unit.status as SiteplanUnitStatus;
              return (
                <button
                  key={unit.id}
                  type="button"
                  className={cn(
                    // min 3.25rem square-ish tap target for touch usability (this app also ships as a Capacitor mobile app)
                    "flex min-h-[3.25rem] min-w-[3.25rem] flex-col items-center justify-center rounded-md border-2 px-3 py-2 text-sm font-bold shadow-sm transition-colors",
                    BOX_CLASS[status],
                  )}
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
        </div>
      ))}

      <div className="flex flex-wrap gap-4 border-t pt-4 text-sm">
        {(Object.entries(SITEPLAN_UNIT_STATUS_LABEL) as [SiteplanUnitStatus, string][]).map(([status, label]) => (
          <div key={status} className="flex items-center gap-2">
            <span className={cn("inline-block h-3.5 w-3.5 rounded-sm border", BOX_CLASS[status])} />
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
