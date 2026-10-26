"use client";

import * as React from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BIAYA_JENIS,
  BIAYA_JENIS_LABELS,
  BIAYA_KATEGORI,
  BIAYA_KATEGORI_LABELS,
  BIAYA_STATUS_LABELS,
  biayaKode,
  biayaNama,
  biayaPeriodeLabel,
  biayaPeriodeOptions,
  formatRupiah,
  parseNominal,
  type BiayaJenis,
  type BiayaKategori,
} from "@/lib/connect/biaya";
import { cn } from "@/lib/utils";
import type { BiayaRef } from "@/repositories/connect.repository";

import { biayaFileUrlAction, cancelBiayaAction, createBiayaAction } from "../actions/biaya.actions";
import { StatusPill } from "./chat-cards";
import { useChat } from "./chat-context";
import { formatDateTime, shrinkPhoto } from "./chat-utils";
import { selectClass, useSubmit } from "./workflow-dialogs";

/**
 * Pengajuan Biaya Villa (0307). The card shows the villa record live (status,
 * Finance's decision, transfer date); files open through a 10-minute link.
 * The manager submits and cancels here; Finance acts on the villa dashboard.
 */

const TONE: Record<string, string> = {
  diajukan: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  disetujui: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ditransfer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ditolak: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  dibatalkan: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function dmy(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

function FileButton({ biaya, file, label }: { biaya: BiayaRef; file: "nota" | "bukti_bayar" | "bukti_transfer"; label: string }) {
  const { conversationId } = useChat();
  const [busy, setBusy] = React.useState(false);
  async function open() {
    // Open the tab first (popup blockers), then point it at the signed link.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const r = await biayaFileUrlAction({ conversationId, id: biaya.id, file });
      if (!r.success || !r.data) {
        tab?.close();
        toast.error(r.error ?? "Gagal membuka file");
        return;
      }
      if (tab) tab.location.href = r.data.url;
      else window.location.href = r.data.url;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" size="sm" variant={file === "bukti_transfer" ? "default" : "outline"} onClick={() => void open()} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} {label}
    </Button>
  );
}

export function BiayaCard({ biaya }: { biaya: BiayaRef }) {
  const { myRole } = useChat();
  const [cancelOpen, setCancelOpen] = React.useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{biayaKode(biaya.nomor)}</span>
        <span className="font-semibold">{biayaNama(biaya.kategori, biaya.kategoriNama)}</span>
        <StatusPill label={BIAYA_STATUS_LABELS[biaya.status] ?? biaya.status} tone={TONE[biaya.status] ?? TONE.dibatalkan} />
      </div>
      <p className="text-base font-semibold">{formatRupiah(biaya.nominal)}</p>
      <p className="text-xs text-muted-foreground">
        {BIAYA_JENIS_LABELS[biaya.jenis]} · biaya {biayaPeriodeLabel(biaya.periode)} · oleh {biaya.diajukanOlehNama}
        {biaya.diajukanLewat === "dashboard" ? " (dashboard villa)" : ""}
      </p>
      <p className="whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 text-xs">{biaya.keterangan}</p>
      {biaya.penerimaRekening && (
        <p className="text-xs">
          Transfer ke {biaya.penerimaBank} {biaya.penerimaRekening} a.n {biaya.penerimaNama}
        </p>
      )}
      {biaya.status === "ditolak" && <p className="text-xs font-medium text-red-700 dark:text-red-300">Ditolak {biaya.diputusOlehNama}: {biaya.alasanTolak}</p>}
      {biaya.status === "dibatalkan" && <p className="text-xs text-muted-foreground">Dibatalkan: {biaya.alasanBatal}</p>}
      {biaya.catatanFinance && <p className="text-xs text-muted-foreground">Catatan Finance: {biaya.catatanFinance}</p>}
      {biaya.status === "ditransfer" && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Ditransfer {dmy(biaya.tanggalTransfer)} oleh {biaya.ditransferOlehNama}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {biaya.adaBuktiTransfer && <FileButton biaya={biaya} file="bukti_transfer" label="Bukti transfer" />}
        {biaya.adaNota && <FileButton biaya={biaya} file="nota" label="Nota" />}
        {biaya.adaBuktiBayar && <FileButton biaya={biaya} file="bukti_bayar" label="Bukti bayar" />}
        {biaya.status === "diajukan" && myRole === "manager" && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>
            Batalkan
          </Button>
        )}
      </div>
      {cancelOpen && <CancelDialog biaya={biaya} onOpenChange={setCancelOpen} />}
    </div>
  );
}

/** Finance's transfer line, with the proof one tap away (the owner: the proof is sent through the chat). */
export function BiayaTransferLine({ body, at, biaya }: { body: string; at: string; biaya: BiayaRef }) {
  return (
    <div className="flex justify-center py-1">
      <div className="flex max-w-[90%] flex-col items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-900 shadow-sm dark:bg-emerald-950 dark:text-emerald-200">
        <span>
          {body} · {formatDateTime(at)}
        </span>
        {biaya.adaBuktiTransfer && <FileButton biaya={biaya} file="bukti_transfer" label="Lihat bukti transfer" />}
      </div>
    </div>
  );
}

function CancelDialog({ biaya, onOpenChange }: { biaya: BiayaRef; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Batalkan {biayaKode(biaya.nomor)}</DialogTitle>
          <DialogDescription>Hanya bisa selama Finance belum memproses.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Alasan, mis. salah nominal" />
        <DialogFooter>
          <Button disabled={pending || reason.trim().length < 3} onClick={() => void run(() => cancelBiayaAction({ id: biaya.id, reason }), "Pengajuan dibatalkan")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Batalkan pengajuan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Photo (shrunk to 1600px JPEG) or PDF, kept in memory until "Kirim". */
function FilePick({ label, value, onChange }: { label: string; value: File | null; onChange: (f: File | null) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(file.type === "application/pdf" ? file : await shrinkPhoto(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "File tidak bisa dibaca");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} {value ? "Ganti" : label}
      </Button>
      {value && (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{value.type === "application/pdf" ? value.name : "Foto siap"}</span>
          <button type="button" aria-label="Hapus file" onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}

export function BiayaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const periodeOptions = React.useMemo(() => biayaPeriodeOptions(), []);
  const [kategori, setKategori] = React.useState<BiayaKategori>("laundry");
  const [kategoriNama, setKategoriNama] = React.useState("");
  const [jenis, setJenis] = React.useState<BiayaJenis>("permintaan_dana");
  const [periode, setPeriode] = React.useState(periodeOptions[0]);
  const [nominal, setNominal] = React.useState("");
  const [keterangan, setKeterangan] = React.useState("");
  const [penerimaNama, setPenerimaNama] = React.useState("");
  const [penerimaBank, setPenerimaBank] = React.useState("");
  const [penerimaRekening, setPenerimaRekening] = React.useState("");
  const [nota, setNota] = React.useState<File | null>(null);
  const [buktiBayar, setBuktiBayar] = React.useState<File | null>(null);
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const amount = parseNominal(nominal);
  const ready =
    !!amount &&
    keterangan.trim().length >= 3 &&
    (kategori !== "lain_lain" || kategoriNama.trim().length >= 3) &&
    !!penerimaNama.trim() &&
    !!penerimaBank.trim() &&
    !!penerimaRekening.trim() &&
    (jenis !== "reimburse" || !!buktiBayar);

  function submit() {
    const form = new FormData();
    form.set("kategori", kategori);
    if (kategori === "lain_lain") form.set("kategoriNama", kategoriNama);
    form.set("jenis", jenis);
    form.set("periode", periode);
    form.set("nominal", String(amount ?? ""));
    form.set("keterangan", keterangan);
    form.set("penerimaNama", penerimaNama);
    form.set("penerimaBank", penerimaBank);
    form.set("penerimaRekening", penerimaRekening);
    if (nota) form.set("nota", nota);
    if (jenis === "reimburse" && buktiBayar) form.set("buktiBayar", buktiBayar);
    void run(() => createBiayaAction(form), "Pengajuan terkirim ke Finance villa");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pengajuan biaya villa</DialogTitle>
          <DialogDescription>Tercatat di Finance villa. Finance menyetujui dan mengirim bukti transfer; kabarnya masuk ke chat ini.</DialogDescription>
        </DialogHeader>
        <Field label="Kategori">
          <div className="flex flex-wrap gap-2">
            {BIAYA_KATEGORI.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKategori(k)}
                className={cn("rounded-full border px-3 py-1 text-sm", kategori === k ? "border-emerald-600 bg-emerald-50 font-semibold dark:bg-emerald-950" : "")}
              >
                {BIAYA_KATEGORI_LABELS[k]}
              </button>
            ))}
          </div>
        </Field>
        {kategori === "lain_lain" && (
          <Field label="Nama biaya" htmlFor="by-nama">
            <Input id="by-nama" value={kategoriNama} onChange={(e) => setKategoriNama(e.target.value)} maxLength={80} placeholder="mis. Gas elpiji, Servis AC" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jenis" htmlFor="by-jenis">
            <select id="by-jenis" className={selectClass} value={jenis} onChange={(e) => setJenis(e.target.value as BiayaJenis)}>
              {BIAYA_JENIS.map((j) => (
                <option key={j} value={j}>
                  {BIAYA_JENIS_LABELS[j]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bulan biaya" htmlFor="by-periode">
            <select id="by-periode" className={selectClass} value={periode} onChange={(e) => setPeriode(e.target.value)}>
              {periodeOptions.map((p) => (
                <option key={p} value={p}>
                  {biayaPeriodeLabel(p)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Nominal (Rp)" htmlFor="by-nominal">
          <Input id="by-nominal" inputMode="numeric" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="350000" />
          {amount && <p className="text-xs text-muted-foreground">{formatRupiah(amount)}</p>}
        </Field>
        <Field label="Keterangan" htmlFor="by-ket">
          <Textarea id="by-ket" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} maxLength={1000} placeholder="mis. Laundry sprei & handuk 1–15 Nov" />
        </Field>
        <Field label={jenis === "reimburse" ? "Rekening penggantian (rekening Anda)" : "Rekening tujuan transfer"}>
          <Input value={penerimaNama} onChange={(e) => setPenerimaNama(e.target.value)} maxLength={120} placeholder="Nama pemilik rekening" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={penerimaBank} onChange={(e) => setPenerimaBank(e.target.value)} maxLength={60} placeholder="Bank" />
            <Input value={penerimaRekening} onChange={(e) => setPenerimaRekening(e.target.value)} maxLength={40} inputMode="numeric" placeholder="Nomor rekening" />
          </div>
        </Field>
        <Field label="Lampiran">
          <div className="space-y-2">
            <FilePick label="Foto nota / tagihan" value={nota} onChange={setNota} />
            {jenis === "reimburse" && <FilePick label="Bukti bayar Anda (wajib)" value={buktiBayar} onChange={setBuktiBayar} />}
          </div>
        </Field>
        <DialogFooter>
          <Button disabled={pending || !ready} onClick={submit} className="w-full sm:w-auto">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Kirim ke Finance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
