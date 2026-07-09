"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { TargetPicker } from "@/components/shared/target-picker";
import { STORAGE_BUCKETS } from "@/constants/app";

import { createAnnouncementAction, listAnnouncementCategoriesAction } from "../actions/announcement.actions";
import { announcementFormSchema, type AnnouncementFormInput } from "../schemas/announcement.schema";

export function AnnouncementForm() {
  const router = useRouter();
  const { data: categories } = useQuery({ queryKey: ["announcement-categories"], queryFn: listAnnouncementCategoriesAction });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementFormInput>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: "",
      content: "",
      categoryId: null,
      isPinned: false,
      expiresAt: "",
      targets: [],
      attachments: [],
    },
  });

  async function onSubmit(values: AnnouncementFormInput) {
    const result = await createAnnouncementAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat pengumuman");
      return;
    }
    toast.success("Pengumuman berhasil dipublikasikan");
    router.push(`/announcements/${result.data?.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Judul Pengumuman</Label>
            <Input id="title" {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Isi Pengumuman</Label>
            <Textarea id="content" rows={8} {...register("content")} />
            {errors.content && <p className="text-sm text-destructive">{errors.content.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa Kategori</SelectItem>
                      {categories?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiresAt">Berlaku Sampai (opsional)</Label>
              <Input id="expiresAt" type="date" {...register("expiresAt")} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Controller control={control} name="isPinned" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />} />
            Sematkan pengumuman ini
          </label>

          <div className="space-y-2">
            <Label>Lampiran</Label>
            <Controller
              control={control}
              name="attachments"
              render={({ field }) => (
                <FileUploadField bucket={STORAGE_BUCKETS.ANNOUNCEMENT_ATTACHMENTS} value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-6">
          <Label>Target Penerima</Label>
          <Controller control={control} name="targets" render={({ field }) => <TargetPicker onChange={field.onChange} />} />
          {errors.targets && <p className="text-sm text-destructive">{errors.targets.message}</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Publikasikan Pengumuman
        </Button>
      </div>
    </form>
  );
}
