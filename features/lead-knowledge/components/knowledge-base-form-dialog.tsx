"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listCrmProjectsAdminAction } from "@/features/crm/actions/crm-query.actions";

import { saveKnowledgeBaseAction } from "../actions/knowledge-base.actions";
import {
  KNOWLEDGE_BASE_KATEGORI,
  KNOWLEDGE_BASE_KATEGORI_LABEL,
  knowledgeBaseSchema,
  type KnowledgeBaseInput,
} from "../schemas/knowledge-base.schema";

interface KnowledgeBaseFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: KnowledgeBaseInput;
}

export function KnowledgeBaseFormDialog({ trigger, initialValues }: KnowledgeBaseFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { data: projects } = useQuery({
    queryKey: ["crm-projects-admin"],
    queryFn: listCrmProjectsAdminAction,
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<KnowledgeBaseInput>({
    resolver: zodResolver(knowledgeBaseSchema),
    defaultValues: initialValues ?? {
      projectId: "",
      kategori: undefined,
      pertanyaanUmum: "",
      jawaban: "",
    },
  });

  async function onSubmit(values: KnowledgeBaseInput) {
    const result = await saveKnowledgeBaseAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan knowledge base");
      return;
    }
    toast.success("Knowledge base berhasil disimpan");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initialValues ? "Edit Knowledge Base" : "Tambah Knowledge Base"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Project</Label>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.projectId && (
                <p className="text-sm text-destructive">{errors.projectId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Controller
                control={control}
                name="kategori"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWLEDGE_BASE_KATEGORI.map((value) => (
                        <SelectItem key={value} value={value}>
                          {KNOWLEDGE_BASE_KATEGORI_LABEL[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.kategori && (
                <p className="text-sm text-destructive">{errors.kategori.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pertanyaanUmum">Pertanyaan yang sering ditanyakan lead</Label>
            <Textarea
              id="pertanyaanUmum"
              rows={2}
              placeholder="Contoh: Berapa DP untuk unit tipe 36?"
              {...register("pertanyaanUmum")}
            />
            {errors.pertanyaanUmum && (
              <p className="text-sm text-destructive">{errors.pertanyaanUmum.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="jawaban">
              Jawaban (AI akan pakai bahasa sendiri saat membalas, tapi hanya berdasarkan info ini)
            </Label>
            <Textarea
              id="jawaban"
              rows={4}
              placeholder="Jawaban lengkap dan akurat -- AI tidak akan mengarang di luar ini."
              {...register("jawaban")}
            />
            {errors.jawaban && <p className="text-sm text-destructive">{errors.jawaban.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
