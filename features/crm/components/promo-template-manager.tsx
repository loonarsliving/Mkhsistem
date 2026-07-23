"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";

import {
  createPromoTemplateAction,
  deletePromoTemplateAction,
  getPromoSendStatsAction,
  listPromoTemplatesAction,
  setPromoTemplateActiveAction,
} from "../actions/promo-template.actions";

const CADENCE_OPTIONS = [3, 7, 14, 30];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

function SendStatsBadges({ templateId }: { templateId: string }) {
  const { data: stats } = useQuery({ queryKey: ["promo-send-stats", templateId], queryFn: () => getPromoSendStatsAction(templateId) });
  if (!stats) return null;
  return (
    <div className="flex gap-1.5 text-xs">
      <Badge variant="outline">Terkirim: {stats.sent}</Badge>
      <Badge variant="outline">Antre: {stats.queued}</Badge>
      {stats.failed > 0 && <Badge variant="destructive">Gagal: {stats.failed}</Badge>}
    </div>
  );
}

/**
 * AI/system-managed follow-up: Markom defines the message once (with real
 * data placeholders), picks who and when, and the paced sender worker
 * (app/api/crm/dispatch-promo-sends) does the actual reach-out on a
 * schedule -- so leads that a human never gets around to following up
 * still hear from the company.
 */
export function PromoTemplateManager({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const tempIdRef = React.useRef(crypto.randomUUID());

  const [name, setName] = React.useState("");
  const [branchId, setBranchId] = React.useState<string>("all");
  const [messageBody, setMessageBody] = React.useState("");
  const [cadenceDays, setCadenceDays] = React.useState("7");
  const [sendHourLocal, setSendHourLocal] = React.useState("10");
  const [photoStoragePath, setPhotoStoragePath] = React.useState<string | undefined>();
  const [photoPublicUrl, setPhotoPublicUrl] = React.useState<string | undefined>();

  const { data: templates, isLoading } = useQuery({ queryKey: ["promo-templates"], queryFn: listPromoTemplatesAction });
  const { data: branches } = useQuery({ queryKey: ["branches-for-promo"], queryFn: listBranchesAction });

  function resetForm() {
    setName("");
    setBranchId("all");
    setMessageBody("");
    setCadenceDays("7");
    setSendHourLocal("10");
    setPhotoStoragePath(undefined);
    setPhotoPublicUrl(undefined);
    tempIdRef.current = crypto.randomUUID();
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { path, publicUrl } = await uploadEntityFile("promo-templates", tempIdRef.current, files[0]);
      if (!publicUrl) throw new Error("Gagal mendapatkan URL foto");
      setPhotoStoragePath(path);
      setPhotoPublicUrl(publicUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah foto");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleCreate() {
    setSubmitting(true);
    const result = await createPromoTemplateAction({
      branchId: branchId === "all" ? undefined : branchId,
      name,
      messageBody,
      cadenceDays: Number(cadenceDays),
      sendHourLocal: Number(sendHourLocal),
      photoStoragePath,
      photoPublicUrl,
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan template");
      return;
    }
    toast.success("Template promo disimpan -- akan mulai dikirim sesuai jadwal");
    resetForm();
    setAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ["promo-templates"] });
  }

  async function handleToggleActive(id: string, next: boolean) {
    const result = await setPromoTemplateActiveAction(id, next);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah status");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["promo-templates"] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    const result = await deletePromoTemplateAction(deleteTarget);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus template");
      return;
    }
    toast.success("Template dihapus");
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["promo-templates"] });
  }

  const items = templates ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Template Promo Terjadwal</p>
          <p className="text-xs text-muted-foreground">
            Pesan otomatis ke prospect aktif per cabang, dikirim bertahap agar nomor WhatsApp tidak kena banned.
          </p>
        </div>
        {canManage && (
          <Dialog
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> Template Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Template Promo Baru</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Nama template (mis. Promo Akhir Bulan)" value={name} onChange={(e) => setName(e.target.value)} />

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Cabang</p>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Cabang</SelectItem>
                      {(branches ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Isi Pesan — gunakan {"{nama}"}, {"{kota}"}, {"{tipe_rumah}"}, {"{proyek}"} untuk personalisasi otomatis
                  </p>
                  <Textarea
                    placeholder="Halo {nama}, ada promo khusus untuk rumah {tipe_rumah} di {kota}..."
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    rows={5}
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Foto (opsional)</p>
                  <div className="flex items-center gap-3">
                    {photoPublicUrl && (
                      <div className="relative h-16 w-16 overflow-hidden rounded-md border bg-muted">
                        <Image src={photoPublicUrl} alt="Preview" fill sizes="64px" className="object-cover" unoptimized />
                      </div>
                    )}
                    <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => handlePhotoUpload(e.target.files)} />
                    <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      {photoPublicUrl ? "Ganti Foto" : "Unggah Foto"}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Kirim Ulang Setiap</p>
                    <Select value={cadenceDays} onValueChange={setCadenceDays}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CADENCE_OPTIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} hari
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Jam Kirim (WITA)</p>
                    <Select value={sendHourLocal} onValueChange={setSendHourLocal}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {String(h).padStart(2, "0")}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={submitting || !name || messageBody.length < 10} onClick={handleCreate}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Simpan Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={Megaphone}
          title="Belum ada template promo"
          description="Buat template pertama -- sistem akan otomatis mengirim ke prospect aktif sesuai jadwal, tanpa perlu manual tiap kali."
        />
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((t) => {
            const branch = t.branch as { name?: string } | null;
            return (
              <Card key={t.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{branch?.name ?? "Semua Cabang"}</p>
                    </div>
                    {canManage && <Switch checked={t.is_active} onCheckedChange={(v) => handleToggleActive(t.id, v)} />}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.message_body}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">Setiap {t.cadence_days} hari</Badge>
                    <Badge variant="secondary">{String(t.send_hour_local).padStart(2, "0")}:00 WITA</Badge>
                    {!t.is_active && <Badge variant="outline">Nonaktif</Badge>}
                  </div>
                  <SendStatsBadges templateId={t.id} />
                  {canManage && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setDeleteTarget(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Hapus
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus template promo ini?"
        description="Pesan yang sudah terkirim tidak terpengaruh, tapi tidak akan ada pengiriman baru dari template ini."
        confirmLabel="Hapus"
        destructive
        loading={submitting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
