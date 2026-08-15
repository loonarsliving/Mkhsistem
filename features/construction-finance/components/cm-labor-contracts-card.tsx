"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, HardHat, Loader2, Plus, Sparkles } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";
import type { Contractor, LaborContractWithSummary, LaborPaymentItem, ProjectWbsOption } from "@/repositories/cm-labor.repository";

import {
  addLaborDeductionAction,
  applyLaborAdvanceAction,
  createContractorAction,
  createLaborContractAction,
  decideLaborPaymentAction,
  generateLaborPaymentAction,
  reviewLaborPaymentAction,
  setLaborContractWeightsAction,
} from "../actions/cm-labor.actions";
import {
  applyLaborAdvanceSchema,
  createContractorSchema,
  createLaborContractSchema,
  generateLaborPaymentSchema,
  setLaborContractWeightsSchema,
  type ApplyLaborAdvanceInput,
  type CreateContractorInput,
  type CreateLaborContractInput,
  type GenerateLaborPaymentInput,
  type SetLaborContractWeightsInput,
} from "../schemas/cm-labor.schema";

interface CmLaborContractsCardProps {
  projectId: string;
  contracts: LaborContractWithSummary[];
  contractors: Contractor[];
  wbsOptions: ProjectWbsOption[];
  pendingPayments: LaborPaymentItem[];
  canManage: boolean;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function CreateContractorDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CreateContractorInput>({ resolver: zodResolver(createContractorSchema), defaultValues: { fullName: "", contractorType: "tukang", phone: "" } });

  async function onSubmit(values: CreateContractorInput) {
    const result = await createContractorAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambah kontraktor");
      return;
    }
    toast.success("Kontraktor ditambahkan");
    reset();
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Kontraktor Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Kontraktor/Mandor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label>Nama</Label>
            <Input disabled={isSubmitting} {...register("fullName")} />
          </div>
          <div className="space-y-1.5">
            <Label>No. HP (opsional)</Label>
            <Input disabled={isSubmitting} {...register("phone")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateContractDialog({ projectId, contractors }: { projectId: string; contractors: Contractor[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateLaborContractInput>({
    resolver: zodResolver(createLaborContractSchema),
    defaultValues: { projectId, contractorId: "", contractValue: undefined, retentionPct: 0, startDate: today(), targetCompletion: "", notes: "" },
  });

  async function onSubmit(values: CreateLaborContractInput) {
    const result = await createLaborContractAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat kontrak");
      return;
    }
    toast.success("Kontrak borongan dibuat -- lanjutkan atur bobot pekerjaan");
    reset({ projectId, contractorId: "", contractValue: undefined, retentionPct: 0, startDate: today(), targetCompletion: "", notes: "" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Kontrak Borongan Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kontrak Borongan Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="flex items-center justify-between">
            <Label>Kontraktor/Mandor</Label>
            <CreateContractorDialog onCreated={() => router.refresh()} />
          </div>
          <Controller
            control={control}
            name="contractorId"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kontraktor" />
                </SelectTrigger>
                <SelectContent>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.contractorId && <p className="text-sm text-destructive">{errors.contractorId.message}</p>}

          <div className="space-y-1.5">
            <Label>Nilai Kontrak</Label>
            <Controller control={control} name="contractValue" render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} disabled={isSubmitting} />} />
            {errors.contractValue && <p className="text-sm text-destructive">{errors.contractValue.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Retention (%) -- opsional, ditahan dari tiap pembayaran</Label>
            <Input type="number" min="0" max="100" step="0.5" disabled={isSubmitting} {...register("retentionPct", { valueAsNumber: true })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tanggal Mulai</Label>
              <Input type="date" disabled={isSubmitting} {...register("startDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Target Selesai</Label>
              <Input type="date" disabled={isSubmitting} {...register("targetCompletion")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea rows={2} disabled={isSubmitting} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Buat Kontrak
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SetWeightsDialog({ contract, wbsOptions }: { contract: LaborContractWithSummary; wbsOptions: ProjectWbsOption[] }) {
  const [open, setOpen] = React.useState(false);
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<SetLaborContractWeightsInput>({
    resolver: zodResolver(setLaborContractWeightsSchema),
    defaultValues: { contractId: contract.id, weights: wbsOptions.map((w) => ({ projectWbsId: w.id, weightPct: 0 })) },
  });
  const { fields } = useFieldArray({ control, name: "weights" });
  const weights = watch("weights");
  const total = weights?.reduce((sum, w) => sum + (Number(w.weightPct) || 0), 0) ?? 0;

  async function onSubmit(values: SetLaborContractWeightsInput) {
    const filtered = { ...values, weights: values.weights.filter((w) => w.weightPct > 0) };
    const result = await setLaborContractWeightsAction(filtered);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan bobot");
      return;
    }
    toast.success("Bobot pekerjaan disimpan");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Atur Bobot Pekerjaan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bobot Pekerjaan -- {contract.contractorName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <p className="text-xs text-muted-foreground">Total harus 100%. Kosongkan/isi 0 untuk pekerjaan yang tidak termasuk kontrak ini.</p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center justify-between gap-2">
                <Label className="flex-1 text-sm font-normal">{wbsOptions[index]?.name}</Label>
                <Controller
                  control={control}
                  name={`weights.${index}.weightPct`}
                  render={({ field: f }) => (
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-24"
                      disabled={isSubmitting}
                      value={f.value ?? 0}
                      onChange={(e) => f.onChange(Number(e.target.value))}
                    />
                  )}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            ))}
          </div>
          <p className={cn("text-sm font-medium", Math.abs(total - 100) > 0.5 ? "text-destructive" : "text-emerald-600")}>Total: {total}%</p>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || Math.abs(total - 100) > 0.5}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Simpan Bobot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GeneratePaymentDialog({ contract }: { contract: LaborContractWithSummary }) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<GenerateLaborPaymentInput>({ resolver: zodResolver(generateLaborPaymentSchema), defaultValues: { contractId: contract.id, periodStart: "", periodEnd: "" } });

  async function onSubmit(values: GenerateLaborPaymentInput) {
    const result = await generateLaborPaymentAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat pembayaran");
      return;
    }
    toast.success("Draft pembayaran dibuat, menunggu approval");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Ajukan Pembayaran
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajukan Pembayaran Mingguan -- {contract.contractorName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Periode Mulai</Label>
              <Input type="date" disabled={isSubmitting} {...register("periodStart")} />
            </div>
            <div className="space-y-1.5">
              <Label>Periode Selesai</Label>
              <Input type="date" disabled={isSubmitting} {...register("periodEnd")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Nominal dihitung otomatis dari progress yang sudah disetujui sejak pembayaran terakhir -- bukan diinput manual.
          </p>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Hitung & Ajukan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApplyAdvanceDialog({ contract }: { contract: LaborContractWithSummary }) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ApplyLaborAdvanceInput>({ resolver: zodResolver(applyLaborAdvanceSchema), defaultValues: { contractId: contract.id, amount: undefined, note: "" } });

  async function onSubmit(values: ApplyLaborAdvanceInput) {
    const result = await applyLaborAdvanceAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat advance");
      return;
    }
    toast.success("Advance dicatat -- akan dipotong otomatis dari pembayaran berikutnya");
    reset({ contractId: contract.id, amount: undefined, note: "" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Kasbon/Advance
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat Kasbon -- {contract.contractorName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label>Jumlah</Label>
            <Input type="number" min="0" step="1000" disabled={isSubmitting} {...register("amount", { valueAsNumber: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea rows={2} disabled={isSubmitting} {...register("note")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const AI_VERDICT_LABEL: Record<NonNullable<LaborPaymentItem["aiVerdict"]>, { label: string; className: string }> = {
  sesuai: { label: "AI: Sesuai Bukti Foto", className: "border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-400" },
  perlu_dicek: { label: "AI: Perlu Dicek", className: "border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400" },
  tidak_sesuai: { label: "AI: Tidak Sesuai Bukti Foto", className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

function PendingPaymentRow({ payment }: { payment: LaborPaymentItem }) {
  const [busy, setBusy] = React.useState(false);
  const [showDeduction, setShowDeduction] = React.useState(false);
  const [deductionAmount, setDeductionAmount] = React.useState("");
  const [deductionReason, setDeductionReason] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [ai, setAi] = React.useState<{ verdict: LaborPaymentItem["aiVerdict"]; summary: string | null; concerns: string[]; photoCount: number } | null>(
    payment.aiVerdict ? { verdict: payment.aiVerdict, summary: payment.aiSummary, concerns: payment.aiConcerns, photoCount: payment.aiPhotoCount } : null,
  );

  async function runAiReview() {
    setAiBusy(true);
    const result = await reviewLaborPaymentAction({ paymentId: payment.id });
    setAiBusy(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Analisa AI gagal");
      return;
    }
    setAi({ verdict: result.data.verdict, summary: result.data.summary, concerns: result.data.concerns, photoCount: result.data.photoCount });
    toast.success("Analisa AI selesai");
  }

  async function decide(approve: boolean) {
    setBusy(true);
    const reason = approve ? undefined : (window.prompt("Alasan penolakan?") ?? undefined);
    const result = await decideLaborPaymentAction({ paymentId: payment.id, approve, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memproses");
      return;
    }
    toast.success(approve ? "Pembayaran disetujui & dicatat ke keuangan" : "Pembayaran ditolak");
  }

  async function addDeduction() {
    const amount = Number(deductionAmount);
    if (!amount || amount <= 0 || deductionReason.trim().length < 3) {
      toast.error("Isi jumlah dan alasan potongan");
      return;
    }
    setBusy(true);
    const result = await addLaborDeductionAction({ paymentId: payment.id, amount, category: "other", reason: deductionReason });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambah potongan");
      return;
    }
    toast.success("Potongan ditambahkan");
    setDeductionAmount("");
    setDeductionReason("");
    setShowDeduction(false);
  }

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="font-medium">
            {payment.contractorName} — {payment.periodStart} s/d {payment.periodEnd}
          </p>
          <p className="text-xs text-muted-foreground">
            Gross {formatCurrency(payment.grossEarned)} · Retention {formatCurrency(payment.retentionAmount)} · Potongan{" "}
            {formatCurrency(payment.deductionAmount)}
          </p>
          {ai?.verdict && (
            <Badge variant="outline" className={cn("mt-1", AI_VERDICT_LABEL[ai.verdict].className)}>
              {AI_VERDICT_LABEL[ai.verdict].label}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={aiBusy || busy} onClick={runAiReview}>
            {aiBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            {ai ? "Analisa Ulang AI" : "Analisa AI"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowDeduction((v) => !v)}>
            + Potongan
          </Button>
          <Button size="sm" disabled={busy} onClick={() => decide(true)}>
            Setujui & Bayar
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(false)}>
            Tolak
          </Button>
        </div>
      </div>
      {ai && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          <p className="text-muted-foreground">
            Berdasarkan {ai.photoCount} foto progres lapangan pada periode ini{ai.photoCount === 0 && " (tidak ada foto -- rekomendasi cek manual)"}.
          </p>
          {ai.summary && <p className="mt-1">{ai.summary}</p>}
          {ai.concerns.length > 0 && (
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-700 dark:text-amber-400">
              {ai.concerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showDeduction && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Jumlah</Label>
            <Input type="number" className="w-32" value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Alasan</Label>
            <Input value={deductionReason} onChange={(e) => setDeductionReason(e.target.value)} />
          </div>
          <Button size="sm" disabled={busy} onClick={addDeduction}>
            Tambah
          </Button>
        </div>
      )}
    </div>
  );
}

export function CmLaborContractsCard({ projectId, contracts, contractors, wbsOptions, pendingPayments, canManage }: CmLaborContractsCardProps) {
  if (!canManage && contracts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          Kontrak Borongan / Kontraktor
        </CardTitle>
        <CardDescription>Pembayaran dihitung dari earned value (nilai kontrak x bobot pekerjaan x progress bertambah) -- bukan input manual.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && <CreateContractDialog projectId={projectId} contractors={contractors} />}

        <div className="space-y-3">
          {contracts.map((c) => (
            <div key={c.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{c.contractorName}</p>
                  <p className="text-xs text-muted-foreground">
                    Kontrak {formatCurrency(c.contractValue)} · Retention {c.retentionPct}%
                  </p>
                </div>
                {c.summary.status === "overpayment" && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Overpayment
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Earned</p>
                  <p className="tabular-nums">{formatCurrency(c.summary.cumulativeEarned)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dibayar</p>
                  <p className="tabular-nums">{formatCurrency(c.summary.cumulativePaid)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sisa Bisa Dibayar</p>
                  <p className="tabular-nums font-medium">{formatCurrency(c.summary.payable)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Kasbon Belum Lunas</p>
                  <p className="tabular-nums">{formatCurrency(c.summary.outstandingAdvance)}</p>
                </div>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <SetWeightsDialog contract={c} wbsOptions={wbsOptions} />
                  {c.hasWeights && <GeneratePaymentDialog contract={c} />}
                  <ApplyAdvanceDialog contract={c} />
                </div>
              )}
            </div>
          ))}
          {contracts.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kontrak borongan.</p>}
        </div>

        {canManage && pendingPayments.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Pembayaran Menunggu Approval ({pendingPayments.length})</p>
            {pendingPayments.map((p) => (
              <PendingPaymentRow key={p.id} payment={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
