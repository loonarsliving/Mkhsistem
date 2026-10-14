"use client";

import * as React from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RefundCustomer } from "@/repositories/refund.repository";

import { addInstallmentAction, saveRefundCustomerAction, sendRefundReminderAction } from "../actions/refund.actions";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

/** "Ingatkan Owner & Vando". customer = null -> summary of every termin due up to this month. */
export function RefundReminderDialog({
  open,
  customer,
  onOpenChange,
}: {
  open: boolean;
  customer: Pick<RefundCustomer, "id" | "name"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = React.useState("");
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (open) setNote("");
  }, [open]);

  async function handleSend() {
    setSending(true);
    const result = await sendRefundReminderAction({ customerId: customer?.id ?? null, note });
    setSending(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim pengingat");
      return;
    }
    toast.success(`Pengingat terkirim ke ${result.data?.recipients ?? 0} orang (notifikasi + WhatsApp)`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingatkan Owner & Vando</DialogTitle>
          <DialogDescription>
            {customer
              ? `Kirim pengingat refund ${customer.name}: sisa refund, termin yang jatuh tempo, dan rekening tujuan.`
              : "Kirim daftar semua termin refund yang belum dibayar sampai bulan ini."}{" "}
            Dikirim lewat notifikasi aplikasi dan WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="refund-reminder-note">Catatan (opsional)</Label>
          <Textarea
            id="refund-reminder-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Contoh: customer sudah menanyakan 2x minggu ini"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Kirim Pengingat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Create (customer = null) or edit a refund customer. */
export function RefundCustomerFormDialog({
  open,
  customer,
  canEditPhone,
  onOpenChange,
}: {
  open: boolean;
  customer: RefundCustomer | null;
  /** Super Admin only (0288): the WhatsApp chat may only reach refund customers' numbers. */
  canEditPhone: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [refundAmount, setRefundAmount] = React.useState<number | undefined>();
  const [openingPaid, setOpeningPaid] = React.useState<number | undefined>();
  const [bankName, setBankName] = React.useState("");
  const [bankAccountNumber, setBankAccountNumber] = React.useState("");
  const [bankAccountHolder, setBankAccountHolder] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setRefundAmount(customer?.refundAmount);
    setOpeningPaid(customer?.openingPaidAmount ?? 0);
    setBankName(customer?.bankName ?? "");
    setBankAccountNumber(customer?.bankAccountNumber ?? "");
    setBankAccountHolder(customer?.bankAccountHolder ?? "");
    setNotes(customer?.notes ?? "");
  }, [open, customer]);

  async function handleSave() {
    setSaving(true);
    setFieldErrors({});
    const result = await saveRefundCustomerAction({
      id: customer?.id,
      name,
      phone,
      refundAmount: refundAmount ?? Number.NaN,
      openingPaidAmount: openingPaid ?? 0,
      bankName,
      bankAccountNumber,
      bankAccountHolder,
      notes,
    });
    setSaving(false);
    if (!result.success) {
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error ?? "Gagal menyimpan");
      return;
    }
    toast.success(customer ? "Data customer diperbarui" : "Customer refund ditambahkan");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit — ${customer.name}` : "Tambah Customer Refund"}</DialogTitle>
          <DialogDescription>Terbayar awal = pembayaran di luar jadwal termin. Termin yang dicentang dihitung otomatis.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rc-name">Nama Customer</Label>
            <Input id="rc-name" value={name} onChange={(e) => setName(e.target.value)} />
            <FieldError errors={fieldErrors.name} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rc-phone">No. Telepon (WhatsApp)</Label>
            <Input
              id="rc-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
              disabled={!canEditPhone}
            />
            {!canEditPhone && <p className="text-xs text-muted-foreground">Nomor HP hanya bisa diubah oleh Super Admin.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-amount">Jumlah Refund</Label>
            <CurrencyInput id="rc-amount" value={refundAmount} onValueChange={setRefundAmount} />
            <FieldError errors={fieldErrors.refundAmount} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-opening">Terbayar Awal</Label>
            <CurrencyInput id="rc-opening" value={openingPaid} onValueChange={setOpeningPaid} />
            <FieldError errors={fieldErrors.openingPaidAmount} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-bank">Bank</Label>
            <Input id="rc-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BRI / BSI / BCA …" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-account">Nomor Rekening</Label>
            <Input id="rc-account" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rc-holder">Atas Nama Rekening</Label>
            <Input id="rc-holder" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rc-notes">Catatan</Label>
            <Textarea id="rc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RefundAddInstallmentDialog({
  customer,
  onOpenChange,
}: {
  customer: RefundCustomer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [month, setMonth] = React.useState("");
  const [amount, setAmount] = React.useState<number | undefined>();
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    if (!customer) return;
    setMonth("");
    setAmount(customer.unscheduledAmount > 0 ? customer.unscheduledAmount : undefined);
    setFieldErrors({});
  }, [customer]);

  async function handleSave() {
    if (!customer) return;
    setSaving(true);
    const result = await addInstallmentAction({ customerId: customer.id, month, amount: amount ?? Number.NaN });
    setSaving(false);
    if (!result.success) {
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error ?? "Gagal menambah termin");
      return;
    }
    toast.success("Termin ditambahkan");
    onOpenChange(false);
  }

  return (
    <Dialog open={customer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tambah Termin — {customer?.name}</DialogTitle>
          <DialogDescription>Satu termin per bulan per customer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ri-month">Bulan</Label>
            <Input id="ri-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <FieldError errors={fieldErrors.month} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ri-amount">Nominal</Label>
            <CurrencyInput id="ri-amount" value={amount} onValueChange={setAmount} />
            <FieldError errors={fieldErrors.amount} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving || !month}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
