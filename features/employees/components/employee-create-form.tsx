"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";
import { listDivisionsAction } from "@/features/divisions/actions/division-query.actions";
import { listPositionsAction } from "@/features/positions/actions/position-query.actions";

import { createEmployeeAction } from "../actions/employee.actions";
import { listRolesAction } from "../actions/employee-query.actions";
import { createEmployeeSchema, type CreateEmployeeInput } from "../schemas/employee.schema";

export function EmployeeCreateForm() {
  const router = useRouter();
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction });
  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: listDivisionsAction });
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: listPositionsAction });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: listRolesAction });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      employeeCode: "",
      fullName: "",
      email: "",
      phone: "",
      branchId: "",
      divisionId: null,
      positionId: null,
      roleId: "",
      gender: null,
      birthDate: "",
      joinDate: new Date().toISOString().slice(0, 10),
      address: "",
    },
  });

  async function onSubmit(values: CreateEmployeeInput) {
    const result = await createEmployeeAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambahkan karyawan");
      return;
    }
    toast.success("Karyawan berhasil ditambahkan. Undangan telah dikirim ke email mereka.");
    router.push(`/employees/${result.data?.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nama Lengkap</Label>
            <Input id="fullName" {...register("fullName")} />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="employeeCode">Kode Karyawan</Label>
            <Input id="employeeCode" {...register("employeeCode")} />
            {errors.employeeCode && <p className="text-sm text-destructive">{errors.employeeCode.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Nomor HP</Label>
            <Input id="phone" {...register("phone")} />
          </div>

          <div className="space-y-2">
            <Label>Cabang</Label>
            <Controller
              control={control}
              name="branchId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cabang" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.branchId && <p className="text-sm text-destructive">{errors.branchId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Divisi</Label>
            <Controller
              control={control}
              name="divisionId"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ada</SelectItem>
                    {divisions?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Jabatan</Label>
            <Controller
              control={control}
              name="positionId"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih jabatan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ada</SelectItem>
                    {positions?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Controller
              control={control}
              name="roleId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.roleId && <p className="text-sm text-destructive">{errors.roleId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Jenis Kelamin</Label>
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak diisi</SelectItem>
                    <SelectItem value="male">Laki-laki</SelectItem>
                    <SelectItem value="female">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthDate">Tanggal Lahir</Label>
            <Input id="birthDate" type="date" {...register("birthDate")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="joinDate">Tanggal Bergabung</Label>
            <Input id="joinDate" type="date" {...register("joinDate")} />
            {errors.joinDate && <p className="text-sm text-destructive">{errors.joinDate.message}</p>}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Alamat</Label>
            <Textarea id="address" rows={2} {...register("address")} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Karyawan
        </Button>
      </div>
    </form>
  );
}
