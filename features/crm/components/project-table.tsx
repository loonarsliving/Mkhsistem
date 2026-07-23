"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Archive, ArchiveRestore, FolderKanban, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { OFFERING_TYPE_LABEL, PROJECT_TYPE_LABEL } from "@/constants/app";
import type { CrmProjectOfferingTypeDb, CrmProjectStatusDb, CrmProjectTypeDb } from "@/types/database.types";

import { setCrmProjectActiveAction } from "../actions/crm-project.actions";
import type { CrmProjectInput } from "../schemas/crm-project.schema";
import { ProjectFormDialog } from "./project-form-dialog";

interface ProjectRow {
  id: string;
  name: string;
  city: string | null;
  branch_id: string;
  project_type: CrmProjectTypeDb;
  offering_type: CrmProjectOfferingTypeDb;
  status: CrmProjectStatusDb;
  start_date: string | null;
  target_launch_date: string | null;
  is_active: boolean;
  branch: { name: string } | null;
}

export function ProjectTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [toggleTarget, setToggleTarget] = React.useState<ProjectRow | null>(null);
  const [toggling, setToggling] = React.useState(false);

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setToggling(true);
    const result = await setCrmProjectActiveAction(toggleTarget.id, !toggleTarget.is_active);
    setToggling(false);
    setToggleTarget(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memperbarui status project");
      return;
    }
    toast.success(toggleTarget.is_active ? "Project diarsipkan" : "Project diaktifkan kembali");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ProjectFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Tambah Project
            </Button>
          }
        />
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Belum ada project" description="Tambahkan project pertama untuk digunakan di seluruh modul." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Cabang</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Penawaran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Target Launching</TableHead>
                <TableHead>Aktif</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const formValues: CrmProjectInput = {
                  id: project.id,
                  name: project.name,
                  city: project.city ?? "",
                  branchId: project.branch_id,
                  projectType: project.project_type,
                  offeringType: project.offering_type,
                  status: project.status,
                  startDate: project.start_date ?? "",
                  targetLaunchDate: project.target_launch_date ?? "",
                };
                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <p className="font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.city ?? "-"}</p>
                    </TableCell>
                    <TableCell>{project.branch?.name ?? "-"}</TableCell>
                    <TableCell>{PROJECT_TYPE_LABEL[project.project_type as keyof typeof PROJECT_TYPE_LABEL]}</TableCell>
                    <TableCell>{OFFERING_TYPE_LABEL[project.offering_type as keyof typeof OFFERING_TYPE_LABEL]}</TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={project.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {project.target_launch_date
                        ? format(new Date(project.target_launch_date), "dd MMM yyyy", { locale: idLocale })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={project.is_active ? "success" : "secondary"}>{project.is_active ? "Aktif" : "Arsip"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <ProjectFormDialog
                          initialValues={formValues}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={project.is_active ? "Arsipkan" : "Aktifkan"}
                          onClick={() => setToggleTarget(project)}
                        >
                          {project.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4 text-success" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={toggleTarget !== null}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.is_active ? "Arsipkan project ini?" : "Aktifkan kembali project ini?"}
        description={
          toggleTarget?.is_active
            ? "Project yang diarsipkan tidak akan muncul di pilihan project saat Sales menambah prospect baru, namun data prospect yang sudah ada tetap tersimpan."
            : "Project akan kembali muncul di pilihan project saat menambah prospect baru."
        }
        confirmLabel={toggleTarget?.is_active ? "Arsipkan" : "Aktifkan"}
        destructive={toggleTarget?.is_active}
        loading={toggling}
        onConfirm={handleToggleActive}
      />
    </div>
  );
}
