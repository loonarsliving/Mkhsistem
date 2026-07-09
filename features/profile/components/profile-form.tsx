"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_BUCKETS } from "@/constants/app";
import { uploadUserFile } from "@/lib/supabase/storage";
import { getInitials } from "@/lib/utils";

import { updateProfileAction } from "../actions/profile.actions";
import { updateProfileSchema, type UpdateProfileInput } from "../schemas/profile.schema";

interface ProfileFormProps {
  userId: string;
  initialValues: UpdateProfileInput;
}

export function ProfileForm({ userId, initialValues }: ProfileFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema), defaultValues: initialValues });

  const avatarUrl = watch("avatarUrl");
  const fullName = watch("fullName");

  async function handleAvatarChange(file: File | undefined) {
    if (!file) return;
    try {
      const { publicUrl } = await uploadUserFile(STORAGE_BUCKETS.AVATARS, userId, file, file.name);
      setValue("avatarUrl", publicUrl ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah foto");
    }
  }

  async function onSubmit(values: UpdateProfileInput) {
    const result = await updateProfileAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memperbarui profil");
      return;
    }
    toast.success("Profil berhasil diperbarui");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={avatarUrl || undefined} alt={fullName} />
          <AvatarFallback className="text-lg">{getInitials(fullName)}</AvatarFallback>
        </Avatar>
        <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
          Ganti Foto Profil
          <input type="file" accept="image/*" hidden onChange={(e) => handleAvatarChange(e.target.files?.[0])} />
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Nama Lengkap</Label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Nomor HP</Label>
        <Input id="phone" {...register("phone")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Alamat</Label>
        <Textarea id="address" rows={3} {...register("address")} />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Simpan Perubahan
      </Button>
    </form>
  );
}
