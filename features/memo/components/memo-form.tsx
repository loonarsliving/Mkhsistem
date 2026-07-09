"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
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

import { createMemoAction } from "../actions/memo.actions";
import { memoFormSchema, type MemoFormInput } from "../schemas/memo.schema";

export function MemoForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MemoFormInput>({
    resolver: zodResolver(memoFormSchema),
    defaultValues: {
      title: "",
      content: "",
      priority: "normal",
      isPinned: false,
      isMandatoryRead: false,
      expiresAt: "",
      targets: [],
      attachments: [],
    },
  });

  async function onSubmit(values: MemoFormInput) {
    const result = await createMemoAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat memo");
      return;
    }
    toast.success("Memo berhasil dipublikasikan");
    router.push(`/memo/${result.data?.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Judul Memo</Label>
            <Input id="title" {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Isi Memo</Label>
            <Textarea id="content" rows={8} {...register("content")} />
            {errors.content && <p className="text-sm text-destructive">{errors.content.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Prioritas</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Rendah</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Tinggi</SelectItem>
                      <SelectItem value="urgent">Mendesak</SelectItem>
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

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Controller control={control} name="isPinned" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />} />
              Sematkan memo ini
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="isMandatoryRead"
                render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}
              />
              Wajib dibaca
            </label>
          </div>

          <div className="space-y-2">
            <Label>Lampiran</Label>
            <Controller
              control={control}
              name="attachments"
              render={({ field }) => (
                <FileUploadField bucket={STORAGE_BUCKETS.MEMO_ATTACHMENTS} value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-6">
          <Label>Target Penerima</Label>
          <Controller
            control={control}
            name="targets"
            render={({ field }) => <TargetPicker onChange={field.onChange} />}
          />
          {errors.targets && <p className="text-sm text-destructive">{errors.targets.message}</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Publikasikan Memo
        </Button>
      </div>
    </form>
  );
}
