"use client";

import * as React from "react";
import { Eye, Loader2, Paperclip, RotateCw, Send, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { formatCurrency } from "@/lib/utils";
import type { RefundCustomer } from "@/repositories/refund.repository";

import {
  getRefundProofUrlAction,
  previewRefundTransferProofAction,
  recordRefundTransferProofAction,
  sendRefundTransferProofAction,
} from "../actions/refund.actions";
import { formatRefundMonth } from "../schemas/refund.schema";

const BUCKET = "refund-transfer-proofs";
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const AUTO = "auto";

/**
 * "Upload Bukti" (0289): the file goes straight from the browser to the
 * private bucket, then the Server Action ticks the termin and stores the
 * record -- same path as the WA "REFUND <nama>" photo. Sending to the
 * customer is the separate "Kirim Bukti" button on the stored proof.
 */
export function RefundProofDialog({ customer, onOpenChange }: { customer: RefundCustomer | null; onOpenChange: (open: boolean) => void }) {
  const [installmentId, setInstallmentId] = React.useState<string>(AUTO);
  const [file, setFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);

  const unpaid = React.useMemo(() => (customer?.installments ?? []).filter((i) => !i.isPaid), [customer]);

  React.useEffect(() => {
    if (!customer) return;
    setInstallmentId(AUTO);
    setFile(null);
  }, [customer]);

  async function handleSave() {
    if (!customer || !file) return;
    if (!(ACCEPTED as readonly string[]).includes(file.type)) {
      toast.error("File harus berupa foto (JPG/PNG/WEBP) atau PDF");
      return;
    }
    setSaving(true);
    try {
      const uploaded = await uploadEntityFile(BUCKET, customer.id, file);
      const result = await recordRefundTransferProofAction({
        customerId: customer.id,
        installmentId: installmentId === AUTO ? null : installmentId,
        storagePath: uploaded.path,
        contentType: file.type as (typeof ACCEPTED)[number],
      });
      if (!result.success) {
        toast.error(result.error ?? "Gagal menyimpan bukti transfer");
        return;
      }
      const termin = result.data?.termin ? ` · termin ${formatRefundMonth(result.data.termin)} dicentang` : "";
      toast.success(`Bukti tersimpan${termin} · klik "Kirim Bukti" untuk mengirim ke customer`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah file");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={customer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bukti Transfer — {customer?.name}</DialogTitle>
          <DialogDescription>
            Bukti disimpan di sistem (hanya untuk internal) dan termin otomatis dicentang terbayar. Customer belum menerima apa-apa sampai Anda klik{" "}
            <b>Kirim Bukti</b>. Bisa juga lewat WA: kirim foto ke nomor perusahaan dengan keterangan{" "}
            <b>REFUND {customer?.name.split(/[\s,]/)[0]}</b>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Termin</Label>
            <Select value={installmentId} onValueChange={setInstallmentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Otomatis — termin tertua yang belum dibayar</SelectItem>
                {unpaid.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {formatRefundMonth(i.dueMonth)} · {formatCurrency(i.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-proof-file">File bukti (foto atau PDF, maks 10MB)</Label>
            <Input id="refund-proof-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving || !file}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Kirim Bukti": shows the company-made proof card and its caption (no bank
 * details), and only sends to the customer's WhatsApp on confirm.
 */
function RefundProofSendDialog({ proofId, customerName, onClose }: { proofId: string | null; customerName: string; onClose: () => void }) {
  const [preview, setPreview] = React.useState<{ image: string; message: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!proofId) return;
    let cancelled = false;
    setPreview(null);
    setLoading(true);
    void previewRefundTransferProofAction({ proofId }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.success && result.data) setPreview(result.data);
      else {
        toast.error(result.error ?? "Gagal membuat kartu bukti");
        onClose();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [proofId, onClose]);

  async function send() {
    if (!proofId) return;
    setSending(true);
    const result = await sendRefundTransferProofAction({ proofId });
    setSending(false);
    if (result.success) {
      toast.success(`Bukti terkirim ke WhatsApp ${customerName}`);
      onClose();
    } else toast.error(result.error ?? "Gagal mengirim");
  }

  return (
    <Dialog open={proofId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kirim Bukti — {customerName}</DialogTitle>
          <DialogDescription>Periksa dulu. Gambar dan pesan ini yang akan diterima customer di WhatsApp.</DialogDescription>
        </DialogHeader>
        {loading || !preview ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the server, nothing to optimise */}
            <img src={preview.image} alt="Kartu bukti pembayaran refund" className="w-full rounded-md border" />
            <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{preview.message}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={() => void send()} disabled={!preview || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim ke Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Stored proofs on a customer card: view the bank proof (signed link, internal) and, for managers, "Kirim Bukti". */
export function RefundProofList({ customer, canManage }: { customer: RefundCustomer; canManage: boolean }) {
  const [sendingProofId, setSendingProofId] = React.useState<string | null>(null);
  const closeSend = React.useCallback(() => setSendingProofId(null), []);
  if (customer.proofs.length === 0) return null;

  const terminLabel = (installmentId: string | null) => {
    const inst = customer.installments.find((i) => i.id === installmentId);
    return inst ? formatRefundMonth(inst.dueMonth) : "tanpa termin";
  };

  async function view(proofId: string) {
    // Open the tab synchronously so a popup blocker doesn't eat it, then point it at the signed URL.
    const tab = window.open("", "_blank");
    const result = await getRefundProofUrlAction({ proofId });
    if (!result.success || !result.data) {
      tab?.close();
      toast.error(result.error ?? "Gagal membuka bukti");
      return;
    }
    if (tab) tab.location.href = result.data.url;
    else window.location.href = result.data.url;
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" /> Bukti transfer ({customer.proofs.length})
      </p>
      {customer.proofs.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{terminLabel(p.installmentId)}</span>
          <span className="text-muted-foreground">
            {new Date(p.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Makassar" })} ·{" "}
            {p.source === "whatsapp" ? "via WA" : "via dashboard"}
          </span>
          <Badge
            variant={p.forwardStatus === "sent" ? "secondary" : p.forwardStatus === "failed" ? "destructive" : "outline"}
            className="h-5 px-1.5 text-[10px]"
            title={p.forwardStatus === "failed" ? (p.forwardError ?? undefined) : undefined}
          >
            {p.forwardStatus === "sent" ? "Terkirim ke customer" : p.forwardStatus === "failed" ? "Gagal terkirim" : "Belum dikirim"}
          </Badge>
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => void view(p.id)}>
            <Eye className="h-3.5 w-3.5" /> Lihat
          </Button>
          {canManage &&
            (p.forwardStatus === "pending" ? (
              <Button size="sm" className="h-6 px-2" onClick={() => setSendingProofId(p.id)}>
                <Send className="h-3.5 w-3.5" /> Kirim Bukti
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setSendingProofId(p.id)}>
                <RotateCw className="h-3.5 w-3.5" /> Kirim ulang
              </Button>
            ))}
        </div>
      ))}
      <RefundProofSendDialog proofId={sendingProofId} customerName={customer.name} onClose={closeSend} />
    </div>
  );
}
