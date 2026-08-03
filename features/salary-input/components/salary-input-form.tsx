"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SalaryCandidate } from "@/repositories/salary-input.repository";

import { submitEmployeeSalaryAction } from "../actions/salary-input.actions";
import { MONTH_LABELS, submitEmployeeSalarySchema, type SubmitEmployeeSalaryInput } from "../schemas/salary-input.schema";

interface SalaryInputFormProps {
  candidates: SalaryCandidate[];
}

const now = new Date();

/** Inline field error, matching the pattern used across the app's other react-hook-form forms (e.g. LeaveRequestDialog). */
function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export function SalaryInputForm({ candidates }: SalaryInputFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubmitEmployeeSalaryInput>({
    resolver: zodResolver(submitEmployeeSalarySchema),
    defaultValues: {
      employeeId: "",
      periodMonth: now.getMonth() + 1,
      periodYear: now.getFullYear(),
      amount: undefined,
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolder: "",
      note: "",
      separateSchedule: false,
    },
  });

  const employeeId = watch("employeeId");

  function handleEmployeeChange(id: string, onChange: (value: string) => void) {
    onChange(id);
    setValue("separateSchedule", candidates.find((c) => c.id === id)?.separateSchedule ?? false);
  }

  async function onSubmit(values: SubmitEmployeeSalaryInput) {
    const result = await submitEmployeeSalaryAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim slip gaji");
      return;
    }
    toast.success("Slip gaji terkirim ke karyawan, Super Admin telah diberi notifikasi untuk transfer");
    reset({
      employeeId: "",
      periodMonth: values.periodMonth,
      periodYear: values.periodYear,
      amount: undefined,
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolder: "",
      note: "",
      separateSchedule: false,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-4 w-4" />
          Input Gaji Karyawan
        </CardTitle>
        <CardDescription>
          Pilih karyawan, masukkan nominal gaji dan nomor rekeningnya. Slip gaji langsung terkirim ke karyawan, dan
          Super Admin menerima notifikasi untuk melakukan transfer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Karyawan</Label>
              <Controller
                control={control}
                name="employeeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => handleEmployeeChange(value, field.onChange)} disabled={isSubmitting}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih karyawan" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.fullName} ({person.employeeCode})
                          {person.separateSchedule ? " — jadwal terpisah" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.employeeId?.message} />
            </div>

            <div className="space-y-1.5">
              <Label>Periode Bulan</Label>
              <Controller
                control={control}
                name="periodMonth"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))} disabled={isSubmitting}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABELS.map((label, index) => (
                        <SelectItem key={label} value={String(index + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Periode Tahun</Label>
              <Input type="number" min={2020} disabled={isSubmitting} {...register("periodYear", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nominal Gaji</Label>
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <CurrencyInput
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="contoh: 3.500.000"
                  disabled={isSubmitting}
                />
              )}
            />
            <FieldError message={errors.amount?.message} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Nama Bank</Label>
              <Input placeholder="contoh: BRI" disabled={isSubmitting} {...register("bankName")} />
            </div>
            <div className="space-y-1.5">
              <Label>Nomor Rekening</Label>
              <Input placeholder="contoh: 123456789012" disabled={isSubmitting} {...register("bankAccountNumber")} />
              <FieldError message={errors.bankAccountNumber?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Atas Nama</Label>
              <Input placeholder="Nama pemilik rekening" disabled={isSubmitting} {...register("bankAccountHolder")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea placeholder="Tunjangan, potongan, atau catatan lain…" rows={2} disabled={isSubmitting} {...register("note")} />
          </div>

          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="separateSchedule"
              render={({ field }) => (
                <Checkbox
                  id="separateSchedule"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={isSubmitting}
                />
              )}
            />
            <Label htmlFor="separateSchedule" className="font-normal leading-snug text-muted-foreground">
              Karyawan ini gajian di jadwal terpisah dari cabang (mis. tanggal beda) -- jangan tunggu dia untuk kirim ringkasan
              otomatis ke Super Admin.
            </Label>
          </div>

          <Button type="submit" disabled={isSubmitting || !employeeId}>
            {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Banknote className="mr-1 h-4 w-4" />}
            Kirim Slip Gaji
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
