"use client";

import { useState, useTransition } from "react";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SalaryCandidate } from "@/repositories/salary-input.repository";

import { submitEmployeeSalaryAction } from "../actions/salary-input.actions";
import { MONTH_LABELS } from "../schemas/salary-input.schema";

interface SalaryInputFormProps {
  candidates: SalaryCandidate[];
}

const now = new Date();

export function SalaryInputForm({ candidates }: SalaryInputFormProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [note, setNote] = useState("");
  const [separateSchedule, setSeparateSchedule] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmployeeId("");
    setAmount("");
    setBankName("");
    setBankAccountNumber("");
    setBankAccountHolder("");
    setNote("");
    setSeparateSchedule(false);
  }

  function handleEmployeeChange(id: string) {
    setEmployeeId(id);
    setSeparateSchedule(candidates.find((c) => c.id === id)?.separateSchedule ?? false);
  }

  function handleSubmit() {
    if (!employeeId) {
      toast.error("Pilih karyawan lebih dulu");
      return;
    }
    const amountNumber = Number(amount);
    if (!amountNumber || amountNumber <= 0) {
      toast.error("Nominal gaji harus lebih dari 0");
      return;
    }
    if (bankAccountNumber.trim().length < 4) {
      toast.error("Nomor rekening minimal 4 digit");
      return;
    }

    startTransition(async () => {
      const result = await submitEmployeeSalaryAction({
        employeeId,
        periodMonth,
        periodYear,
        amount: amountNumber,
        bankName,
        bankAccountNumber,
        bankAccountHolder,
        note,
        separateSchedule,
      });

      if (!result.success) {
        toast.error(result.error ?? "Gagal mengirim slip gaji");
        return;
      }
      toast.success("Slip gaji terkirim ke karyawan, Super Admin telah diberi notifikasi untuk transfer");
      reset();
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
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>Karyawan</Label>
            <Select value={employeeId} onValueChange={handleEmployeeChange} disabled={isPending}>
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
          </div>

          <div className="space-y-1.5">
            <Label>Periode Bulan</Label>
            <Select
              value={String(periodMonth)}
              onValueChange={(value) => setPeriodMonth(Number(value))}
              disabled={isPending}
            >
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
          </div>

          <div className="space-y-1.5">
            <Label>Periode Tahun</Label>
            <Input
              type="number"
              min={2020}
              value={periodYear}
              onChange={(event) => setPeriodYear(Number(event.target.value))}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Nominal Gaji (Rp)</Label>
          <Input
            type="number"
            min={1}
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="contoh: 3500000"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Nama Bank</Label>
            <Input
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
              placeholder="contoh: BRI"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nomor Rekening</Label>
            <Input
              value={bankAccountNumber}
              onChange={(event) => setBankAccountNumber(event.target.value)}
              placeholder="contoh: 123456789012"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Atas Nama</Label>
            <Input
              value={bankAccountHolder}
              onChange={(event) => setBankAccountHolder(event.target.value)}
              placeholder="Nama pemilik rekening"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Catatan (opsional)</Label>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Tunjangan, potongan, atau catatan lain…"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="separateSchedule"
            checked={separateSchedule}
            onCheckedChange={(checked) => setSeparateSchedule(checked === true)}
            disabled={isPending}
          />
          <Label htmlFor="separateSchedule" className="font-normal leading-snug text-muted-foreground">
            Karyawan ini gajian di jadwal terpisah dari cabang (mis. tanggal beda) -- jangan tunggu dia untuk kirim ringkasan
            otomatis ke Super Admin.
          </Label>
        </div>

        <Button onClick={handleSubmit} disabled={isPending || !employeeId}>
          <Banknote className="mr-1 h-4 w-4" />
          Kirim Slip Gaji
        </Button>
      </CardContent>
    </Card>
  );
}
