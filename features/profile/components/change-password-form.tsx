"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changePasswordAction } from "../actions/profile.actions";
import { changePasswordSchema, type ChangePasswordInput } from "../schemas/profile.schema";

export function ChangePasswordForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(values: ChangePasswordInput) {
    const result = await changePasswordAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah password");
      return;
    }
    toast.success("Password berhasil diubah");
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Password Saat Ini</Label>
        <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
        {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">Password Baru</Label>
        <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Konfirmasi Password Baru</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Ubah Password
      </Button>
    </form>
  );
}
