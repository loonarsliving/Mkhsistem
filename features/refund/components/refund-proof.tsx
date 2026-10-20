"use client";

import * as React from "react";
import { Eye, Loader2, Paperclip, RotateCw, Upload } from "lucide-react";
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

import { getRefundProofUrlAction, recordRefundTransferProofAction, resendRefundTransferProofAction } from "../actions/refund.actions";
import { formatRefundMonth } from "../schemas/refund.schema";

const BUCKET = "refund-transfer-proofs";
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const AUTO = "auto";

/**
 * "Upload Bukti" (0289): the file goes straight from the browser to the
 * private bucket, then the Server Action ticks the termin and forwards the
 * proof to the customer's WhatsApp -- same path as the WA "REFUND <nama>" photo.
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
      if (result.data?.forwarded) toast.success(`Bukti tersimpan${termin} · diteruskan ke WhatsApp customer`);
      else toast.warning(`Bukti tersimpan${termin}, tapi gagal diteruskan ke customer: ${result.data?.forwardError ?? "unknown"}`);
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
            Bukti disimpan di sistem, termin otomatis dicentang terbayar, lalu diteruskan ke WhatsApp customer. Bisa juga lewat WA: kirim foto ke nomor
            perusahaan dengan keterangan <b>REFUND {customer?.name.split(/[\s,]/)[0]}</b>.
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Simpan & Teruskan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Stored proofs on a customer card: view (signed link) and, for managers, resend. */
export function RefundProofList({ customer, canManage }: { customer: RefundCustomer; canManage: boolean }) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
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

  async function resend(proofId: string) {
    setBusyId(proofId);
    const result = await resendRefundTransferProofAction({ proofId });
    setBusyId(null);
    if (result.success) toast.success("Bukti transfer dikirim ulang ke customer");
    else toast.error(result.error ?? "Gagal mengirim ulang");
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
          <Badge variant={p.forwardStatus === "sent" ? "secondary" : "destructive"} className="h-5 px-1.5 text-[10px]">
            {p.forwardStatus === "sent" ? "Terkirim ke customer" : "Belum terkirim"}
          </Badge>
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => void view(p.id)}>
            <Eye className="h-3.5 w-3.5" /> Lihat
          </Button>
          {canManage && (
            <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busyId === p.id} onClick={() => void resend(p.id)}>
              {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Kirim ulang
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
