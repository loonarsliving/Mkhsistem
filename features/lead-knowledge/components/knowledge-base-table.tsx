"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, BookOpen, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { setKnowledgeBaseActiveAction } from "../actions/knowledge-base.actions";
import { KNOWLEDGE_BASE_KATEGORI_LABEL } from "../schemas/knowledge-base.schema";
import type { KnowledgeBaseInput } from "../schemas/knowledge-base.schema";
import type { KnowledgeBaseKategoriDb, KnowledgeBaseSumberDb } from "@/types/database.types";
import { KnowledgeBaseFormDialog } from "./knowledge-base-form-dialog";

interface KnowledgeBaseRow {
  id: string;
  project_id: string;
  kategori: KnowledgeBaseKategoriDb;
  pertanyaan_umum: string;
  jawaban: string;
  sumber: KnowledgeBaseSumberDb;
  is_active: boolean;
  project: { name: string } | null;
}

export function KnowledgeBaseTable({ entries }: { entries: KnowledgeBaseRow[] }) {
  const router = useRouter();
  const [toggleTarget, setToggleTarget] = React.useState<KnowledgeBaseRow | null>(null);
  const [toggling, setToggling] = React.useState(false);

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setToggling(true);
    const result = await setKnowledgeBaseActiveAction(toggleTarget.id, !toggleTarget.is_active);
    setToggling(false);
    setToggleTarget(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memperbarui status");
      return;
    }
    toast.success(toggleTarget.is_active ? "Entri dinonaktifkan" : "Entri diaktifkan kembali");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <KnowledgeBaseFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Tambah Knowledge
            </Button>
          }
        />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Belum ada knowledge base"
          description="Isi pertanyaan & jawaban per project agar AI nurture bot bisa membalas lead secara otomatis tanpa mengarang jawaban."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Pertanyaan</TableHead>
                <TableHead>Jawaban</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Aktif</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const formValues: KnowledgeBaseInput = {
                  id: entry.id,
                  projectId: entry.project_id,
                  kategori: entry.kategori,
                  pertanyaanUmum: entry.pertanyaan_umum,
                  jawaban: entry.jawaban,
                };
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {entry.project?.name ?? "-"}
                    </TableCell>
                    <TableCell>{KNOWLEDGE_BASE_KATEGORI_LABEL[entry.kategori]}</TableCell>
                    <TableCell className="max-w-xs">{entry.pertanyaan_umum}</TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      {entry.jawaban}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.sumber === "dari_admin" ? "secondary" : "outline"}>
                        {entry.sumber === "dari_admin" ? "Dari Admin" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.is_active ? "success" : "secondary"}>
                        {entry.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <KnowledgeBaseFormDialog
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
                          aria-label={entry.is_active ? "Nonaktifkan" : "Aktifkan"}
                          onClick={() => setToggleTarget(entry)}
                        >
                          {entry.is_active ? (
                            <Archive className="h-4 w-4" />
                          ) : (
                            <ArchiveRestore className="h-4 w-4 text-success" />
                          )}
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
        title={toggleTarget?.is_active ? "Nonaktifkan entri ini?" : "Aktifkan kembali entri ini?"}
        description={
          toggleTarget?.is_active
            ? "AI nurture bot tidak akan lagi menggunakan jawaban ini untuk membalas lead."
            : "AI nurture bot akan kembali menggunakan jawaban ini untuk membalas lead."
        }
        confirmLabel={toggleTarget?.is_active ? "Nonaktifkan" : "Aktifkan"}
        destructive={toggleTarget?.is_active}
        loading={toggling}
        onConfirm={handleToggleActive}
      />
    </div>
  );
}
