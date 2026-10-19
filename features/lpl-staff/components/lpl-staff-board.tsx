"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, Loader2, Plus, UserX, UsersRound } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LplEmployee } from "@/repositories/lpl-staff.repository";

import { addLplEmployeeAction, removeLplEmployeeAction } from "../actions/lpl-staff.actions";
import { addLplEmployeeSchema, type AddLplEmployeeInput } from "../schemas/lpl-staff.schema";

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function AddEmployeeDialog({ divisions }: { divisions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddLplEmployeeInput>({
    resolver: zodResolver(addLplEmployeeSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      divisionId: "",
      gender: null,
      joinDate: new Date().toISOString().slice(0, 10),
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolder: "",
    },
  });

  async function onSubmit(values: AddLplEmployeeInput) {
    const result = await addLplEmployeeAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambahkan karyawan");
      return;
    }
    toast.success(`Karyawan ditambahkan (${result.data?.employeeCode}). Undangan login dikirim ke email mereka.`);
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Tambah Karyawan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Karyawan Loonars Private Living</DialogTitle>
        </DialogHeader>
        <form id="lpl-add-employee" onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fullName">Nama Lengkap</Label>
            <Input id="fullName" {...register("fullName")} />
            <FieldError message={errors.fullName?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (untuk login)</Label>
            <Input id="email" type="email" {...register("email")} />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Nomor HP</Label>
            <Input id="phone" {...register("phone")} />
          </div>
          <div className="space-y-2">
            <Label>Divisi</Label>
            <Controller
              control={control}
              name="divisionId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.divisionId?.message} />
          </div>
          <div className="space-y-2">
            <Label>Jenis Kelamin</Label>
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    <SelectItem value="male">Laki-laki</SelectItem>
                    <SelectItem value="female">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="joinDate">Tanggal Bergabung</Label>
            <Input id="joinDate" type="date" {...register("joinDate")} />
            <FieldError message={errors.joinDate?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank</Label>
            <Input id="bankName" placeholder="BCA / BRI / ..." {...register("bankName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountNumber">Nomor Rekening</Label>
            <Input id="bankAccountNumber" inputMode="numeric" {...register("bankAccountNumber")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountHolder">Atas Nama</Label>
            <Input id="bankAccountHolder" {...register("bankAccountHolder")} />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="lpl-add-employee" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LplStaffBoard({
  employees,
  divisions,
  currentUserId,
}: {
  employees: LplEmployee[];
  divisions: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = React.useState<LplEmployee | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleRemove() {
    if (!removing) return;
    setLoading(true);
    const result = await removeLplEmployeeAction(removing.id);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengeluarkan karyawan");
      return;
    }
    toast.success(`${removing.fullName} dikeluarkan`);
    setRemoving(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{employees.length} karyawan aktif</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/hr/salary">
              <Banknote className="h-4 w-4" /> Input Gaji
            </Link>
          </Button>
          <AddEmployeeDialog divisions={divisions} />
        </div>
      </CardHeader>
      <CardContent>
        {employees.length === 0 ? (
          <EmptyState icon={UsersRound} title="Belum ada karyawan" description="Tambahkan karyawan Loonars Private Living." className="py-8" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Divisi</TableHead>
                  <TableHead>Nomor HP</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium">{e.fullName}</div>
                      <div className="text-xs text-muted-foreground">{e.email}</div>
                    </TableCell>
                    <TableCell>{e.employeeCode}</TableCell>
                    <TableCell>{e.divisionName ?? "-"}</TableCell>
                    <TableCell>{e.phone ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {e.id !== currentUserId && (
                        <Button variant="outline" size="sm" onClick={() => setRemoving(e)}>
                          <UserX className="h-4 w-4 text-destructive" /> Keluarkan
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Keluarkan ${removing?.fullName ?? "karyawan"}?`}
        description="Karyawan tidak bisa lagi masuk ke sistem. Riwayat absensi dan gaji tetap tersimpan."
        destructive
        loading={loading}
        onConfirm={handleRemove}
      />
    </Card>
  );
}
