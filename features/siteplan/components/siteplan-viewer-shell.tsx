"use client";

import * as React from "react";
import { MapPin } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SiteplanViewer } from "./siteplan-viewer";

interface SiteplanViewerShellProps {
  projects: { id: string; nama: string; kode: string }[];
}

/** Project picker (only shown when there's more than one project) + the selected project's viewer. */
export function SiteplanViewerShell({ projects }: SiteplanViewerShellProps) {
  const [projectId, setProjectId] = React.useState<string | null>(projects[0]?.id ?? null);

  if (projects.length === 0) {
    return <EmptyState icon={MapPin} title="Belum ada project siteplan" description="Hubungi admin untuk menambahkan project siteplan." />;
  }

  return (
    <div className="space-y-4">
      {projects.length > 1 && (
        <Select value={projectId ?? undefined} onValueChange={setProjectId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Pilih project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nama} ({p.kode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {projectId && <SiteplanViewer projectId={projectId} />}
    </div>
  );
}
