"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Scale } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { listNotarisAction, setNotarisActiveAction } from "../actions/siteplan.actions";
import { NotarisContactFormDialog } from "./notaris-contact-form-dialog";

const QUERY_KEY = ["siteplan-notaris"];

/**
 * loonars_akad_schedule_request always resolves the most recently created contact with active =
 * true -- there's no separate "primary" flag, so this list makes that plain (an "Aktif" badge)
 * and lets the owner flip a contact off before adding a replacement, rather than silently having
 * two active rows compete on created_at.
 */
export function NotarisContactManager() {
  const queryClient = useQueryClient();
  const { data: contacts, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: listNotarisAction });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function handleToggleActive(id: string, active: boolean) {
    const result = await setNotarisActiveAction(id, active);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah status notaris");
      return;
    }
    invalidate();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Kontak Notaris</CardTitle>
        <NotarisContactFormDialog
          trigger={
            <Button size="sm" variant="outline">
              <Scale className="h-4 w-4" /> Tambah Notaris
            </Button>
          }
          onSaved={invalidate}
        />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !contacts || contacts.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="Belum ada kontak notaris"
            description="Tambah kontak notaris agar tombol Jadwalkan Akad dapat mengirim data pembeli dan KTP melalui WhatsApp."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Nomor WhatsApp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.full_name}</TableCell>
                    <TableCell>{n.phone}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={n.active} onCheckedChange={(checked) => handleToggleActive(n.id, checked)} />
                        <Badge variant={n.active ? "success" : "outline"}>{n.active ? "Aktif" : "Nonaktif"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <NotarisContactFormDialog
                          initialValues={{ id: n.id, fullName: n.full_name, phone: n.phone, notes: n.notes ?? "" }}
                          trigger={
                            <Button size="sm" variant="ghost">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                          onSaved={invalidate}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
