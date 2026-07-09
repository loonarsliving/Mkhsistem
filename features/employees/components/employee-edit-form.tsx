"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_BUCKETS } from "@/constants/app";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";
import { listDivisionsAction } from "@/features/divisions/actions/division-query.actions";
import { listPositionsAction } from "@/features/positions/actions/position-query.actions";
import { uploadUserFile } from "@/lib/supabase/storage";
import { getInitials } from "@/lib/utils";

import { updateEmployeeAction } from "../actions/employee.actions";
import { listRolesAction } from "../actions/employee-query.actions";
import { updateEmployeeSchema, type UpdateEmployeeInput } from "../schemas/employee.schema";

export function EmployeeEditForm({ initialValues }: { initialValues: UpdateEmployeeInput }) {
  const router = useRouter();
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction });
  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: listDivisionsAction });
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: listPositionsAction });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: listRolesAction });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEmployeeInput>({ resolver: zodResolver(updateEmployeeSchema), defaultValues: initialValues });

  const avatarUrl = watch("avatarUrl");
  const fullName = watch("fullName");

  async function handleAvatarChange(file: File | undefined) {
    if (!file) return;
    try {
      const { publicUrl } = await uploadUserFile(STORAGE_BUCKETS.AVATARS, initialValues.id, file, file.name);
      setValue("avatarUrl", publicUrl ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah foto");
    }
  }

  async function onSubmit(values: UpdateEmployeeInput) {
    const result = await updateEmployeeAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memperbarui data karyawan");
      return;
    }
    toast.success("Data karyawan berhasil diperbarui");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatarUrl || undefined} alt={fullName} />
              <AvatarFallback className="text-lg">{getInitials(fullName)}</AvatarFallback>
            </Avatar>
            <div>
              <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                Ganti Foto
                <input type="file" accept="image/*" hidden onChange={(e) => handleAvatarChange(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nama Lengkap</Label>
              <Input id="fullName" {...register("fullName")} />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="employeeCode">Kode Karyawan</Label>
              <Input id="employeeCode" {...register("employeeCode")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Nomor HP</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <div className="space-y-2">
              <Label>Status Kepegawaian</Label>
              <Controller
                control={control}
                name="employmentStatus"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="inactive">Tidak Aktif</SelectItem>
                      <SelectItem value="on_leave">Cuti</SelectItem>
                      <SelectItem value="terminated">Berhenti</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Cabang</Label>
              <Controller
                control={control}
                name="branchId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
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
            </div>

            <div className="space-y-2">
              <Label>Divisi</Label>
              <Controller
                control={control}
                name="divisionId"
                render={({ field }) => (
                  <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue />
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
                      <SelectValue />
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
                      <SelectValue />
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="joinDate">Tanggal Bergabung</Label>
              <Input id="joinDate" type="date" {...register("joinDate")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Alamat</Label>
            <Textarea id="address" rows={2} {...register("address")} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Perubahan
        </Button>
      </div>
    </form>
  );
}
