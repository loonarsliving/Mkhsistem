"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ClipboardList, Loader2, Paperclip, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_BUCKETS } from "@/constants/app";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { cn } from "@/lib/utils";
import type { ProjectWbsItem, WbsProgressLogItem } from "@/repositories/cm-wbs.repository";

import { decideWbsProgressAction, submitWbsProgressAction } from "../actions/cm-wbs.actions";
import { submitWbsProgressSchema, type SubmitWbsProgressInput } from "../schemas/cm-wbs.schema";

interface CmWbsProgressCardProps {
  overallProgress: number;
  items: ProjectWbsItem[];
  pendingLogs: WbsProgressLogItem[];
  canSubmit: boolean;
  canApprove: boolean;
}

const STATUS_LABEL: Record<ProjectWbsItem["status"], string> = {
  not_started: "Belum Mulai",
  in_progress: "Berjalan",
  completed: "Selesai",
};

function SubmitProgressDialog({ item }: { item: ProjectWbsItem }) {
  const [open, setOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubmitWbsProgressInput>({
    resolver: zodResolver(submitWbsProgressSchema),
    defaultValues: { projectWbsId: item.id, progressPct: item.progressPct, photoUrl: "", note: "" },
  });
  const photoUrl = watch("photoUrl");

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { publicUrl } = await uploadEntityFile(STORAGE_BUCKETS.PROJECT_PHOTOS, item.id, file);
      setValue("photoUrl", publicUrl ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah foto");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: SubmitWbsProgressInput) {
    const result = await submitWbsProgressAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim laporan progress");
      return;
    }
    toast.success("Progress dikirim, menunggu approval");
    reset({ projectWbsId: item.id, progressPct: item.progressPct, photoUrl: "", note: "" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Lapor Progress
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lapor Progress -- {item.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label>Progress Sekarang (%)</Label>
            <Input type="number" min="0" max="100" step="1" disabled={isSubmitting} {...register("progressPct", { valueAsNumber: true })} />
            {errors.progressPct && <p className="text-sm text-destructive">{errors.progressPct.message}</p>}
            <p className="text-xs text-muted-foreground">Progress terakhir yang disetujui: {item.progressPct}%</p>
          </div>
          <div className="space-y-1.5">
            <Label>Foto</Label>
            {photoUrl ? (
              <div className="flex items-center gap-2">
                <a href={photoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  Lihat foto
                </a>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setValue("photoUrl", "")}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={uploading} asChild>
                <label>
                  {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}
                  Ambil/Pilih Foto
                  <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => handlePhoto(e.target.files?.[0])} />
                </label>
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea rows={2} disabled={isSubmitting} {...register("note")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || uploading}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Kirim
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingLogRow({ log }: { log: WbsProgressLogItem }) {
  const [busy, setBusy] = React.useState(false);

  async function decide(approve: boolean) {
    setBusy(true);
    const reason = approve ? undefined : (window.prompt("Alasan penolakan?") ?? undefined);
    const result = await decideWbsProgressAction({ logId: log.id, approve, rejectReason: reason });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memproses");
      return;
    }
    toast.success(approve ? "Progress disetujui" : "Progress ditolak");
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">
          {log.wbsName} — {log.progressPct}%
        </p>
        <p className="text-xs text-muted-foreground">
          {log.submittedByName ?? "-"} · {new Date(log.submittedAt).toLocaleString("id-ID")}
        </p>
        {log.note && <p className="mt-1 text-xs">{log.note}</p>}
        {log.photoUrl && (
          <a href={log.photoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
            Lihat foto
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide(true)}>
          Setujui
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(false)}>
          Tolak
        </Button>
      </div>
    </div>
  );
}

export function CmWbsProgressCard({ overallProgress, items, pendingLogs, canSubmit, canApprove }: CmWbsProgressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          Progress Pembangunan (WBS)
        </CardTitle>
        <CardDescription>Progress keseluruhan dihitung otomatis dari bobot tiap pekerjaan -- saat ini {overallProgress}%.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{item.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {item.weight}%
                  </Badge>
                  {item.status === "completed" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full bg-primary transition-all", item.progressPct >= 100 && "bg-emerald-600")}
                    style={{ width: `${item.progressPct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.progressPct}% · {STATUS_LABEL[item.status]}
                </p>
              </div>
              {canSubmit && <SubmitProgressDialog item={item} />}
            </div>
          ))}
        </div>

        {canApprove && pendingLogs.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Menunggu Approval ({pendingLogs.length})</p>
            {pendingLogs.map((log) => (
              <PendingLogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
