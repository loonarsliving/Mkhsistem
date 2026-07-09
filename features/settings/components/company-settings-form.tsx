"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_BUCKETS } from "@/constants/app";
import { uploadEntityFile } from "@/lib/supabase/storage";

import { updateCompanySettingsAction } from "../actions/settings.actions";
import { companySettingsSchema, type CompanySettingsInput } from "../schemas/settings.schema";

export function CompanySettingsForm({ initialValues }: { initialValues: CompanySettingsInput }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CompanySettingsInput>({ resolver: zodResolver(companySettingsSchema), defaultValues: initialValues });

  const logoUrl = watch("companyLogoUrl");

  async function handleLogoChange(file: File | undefined) {
    if (!file) return;
    try {
      const { publicUrl } = await uploadEntityFile(STORAGE_BUCKETS.COMPANY_ASSETS, "logo", file);
      setValue("companyLogoUrl", publicUrl ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah logo");
    }
  }

  async function onSubmit(values: CompanySettingsInput) {
    const result = await updateCompanySettingsAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan pengaturan");
      return;
    }
    toast.success("Pengaturan perusahaan berhasil disimpan");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="Logo perusahaan" className="h-14 w-14 rounded-lg border border-border object-contain" />}
            <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
              Unggah Logo Perusahaan
              <input type="file" accept="image/*" hidden onChange={(e) => handleLogoChange(e.target.files?.[0])} />
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Nama Perusahaan</Label>
            <Input id="companyName" {...register("companyName")} />
            {errors.companyName && <p className="text-sm text-destructive">{errors.companyName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyAddress">Alamat Perusahaan</Label>
            <Textarea id="companyAddress" rows={2} {...register("companyAddress")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone">Zona Waktu</Label>
              <Input id="timezone" {...register("timezone")} placeholder="Asia/Makassar" />
              {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultRadiusMeters">Radius Absensi Default (meter)</Label>
              <Input id="defaultRadiusMeters" type="number" min={10} max={5000} {...register("defaultRadiusMeters")} />
            </div>
          </div>
        </CardContent>
      </Card>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Simpan Pengaturan
      </Button>
    </form>
  );
}
