import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";
import { SITEPLAN_UNIT_STATUS_LABEL, type SiteplanUnitStatus } from "@/constants/app";
import { listSiteplanProjects, listSiteplanUnits } from "@/repositories/loonars-siteplan.repository";

// Public share link (agency/marketing partner) -- no login, read-only, no
// click/tap interaction anywhere on the page. Uses the service-role client
// (bypasses RLS) because there is no authenticated session here; only unit
// code + status are selected/rendered, never buyer/purchase data. Kept out
// of search-engine indexing since this is a link handed out directly, not
// meant to be publicly discoverable.
export const metadata: Metadata = {
  title: "Siteplan",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const BOX_CLASS: Record<SiteplanUnitStatus, string> = {
  tersedia: "border-success/40 bg-success text-success-foreground",
  dp: "border-primary/40 bg-primary text-primary-foreground",
  verifikasi: "border-warning/40 bg-warning text-warning-foreground",
  terjual: "border-destructive/40 bg-destructive text-destructive-foreground",
};

const UNGROUPED_LABEL = "Belum dikelompokkan";

function groupByRow<T extends { row_label: string | null }>(units: T[]) {
  const groups = new Map<string, T[]>();
  for (const unit of units) {
    const key = unit.row_label ?? UNGROUPED_LABEL;
    const list = groups.get(key);
    if (list) list.push(unit);
    else groups.set(key, [unit]);
  }
  const ungrouped = groups.get(UNGROUPED_LABEL);
  if (ungrouped) {
    groups.delete(UNGROUPED_LABEL);
    groups.set(UNGROUPED_LABEL, ungrouped);
  }
  return Array.from(groups.entries());
}

export default async function SiteplanPreviewPage() {
  const supabase = createAdminClient();
  const projects = await listSiteplanProjects(supabase);
  const project = projects[0] ?? null;
  const units = project ? await listSiteplanUnits(supabase, project.id) : [];
  const rows = groupByRow(units);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Siteplan</p>
        <h1 className="text-2xl font-bold">{project?.nama ?? "Siteplan"}</h1>
        {project?.lokasi && <p className="text-sm text-muted-foreground">{project.lokasi}</p>}
      </div>

      {!project || units.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada data unit untuk ditampilkan.</p>
      ) : (
        <div className="space-y-6">
          {rows.map(([rowLabel, rowUnits]) => (
            <div key={rowLabel} className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">{rowLabel}</h2>
              <div className="flex flex-wrap gap-2">
                {rowUnits.map((unit) => {
                  const status = unit.status as SiteplanUnitStatus;
                  return (
                    <div
                      key={unit.id}
                      className={`flex min-h-[3.25rem] min-w-[3.25rem] select-none flex-col items-center justify-center rounded-md border-2 px-3 py-2 text-sm font-bold shadow-sm ${BOX_CLASS[status]}`}
                    >
                      {unit.blok}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-4 border-t pt-4 text-sm">
            {(Object.entries(SITEPLAN_UNIT_STATUS_LABEL) as [SiteplanUnitStatus, string][]).map(([status, label]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`inline-block h-3.5 w-3.5 rounded-sm border ${BOX_CLASS[status]}`} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
