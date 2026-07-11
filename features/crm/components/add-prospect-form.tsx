"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ProspectStatusBadge } from "@/components/shared/status-badge";
import { LEAD_SOURCE_LABEL } from "@/constants/app";
import { useDebounce } from "@/hooks/use-debounce";

import { checkDuplicateProspectAction, createProspectAction } from "../actions/crm.actions";
import { listCrmProjectsAction } from "../actions/crm-query.actions";
import { addProspectSchema, type AddProspectInput } from "../schemas/crm.schema";

export function AddProspectForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddProspectInput>({
    resolver: zodResolver(addProspectSchema),
    defaultValues: { customerName: "", phone: "", projectId: "", houseType: "", city: "", leadSource: undefined, notes: "" },
  });

  const { data: projects } = useQuery({ queryKey: ["crm-projects"], queryFn: listCrmProjectsAction });

  const phone = watch("phone");
  const customerName = watch("customerName");
  const debouncedPhone = useDebounce(phone, 400);
  const debouncedName = useDebounce(customerName, 400);

  const { data: duplicate } = useQuery({
    queryKey: ["crm-duplicate-check", debouncedPhone, debouncedName],
    queryFn: () => checkDuplicateProspectAction(debouncedPhone, debouncedName),
    enabled: debouncedPhone.trim().length >= 6 && debouncedName.trim().length >= 2,
  });

  async function onSubmit(values: AddProspectInput) {
    if (duplicate) {
      toast.error("Prospect ini sudah terdaftar. Tidak dapat menyimpan data duplikat.");
      return;
    }
    const result = await createProspectAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan prospect");
      return;
    }
    toast.success("Prospect berhasil ditambahkan");
    router.push(`/crm/${result.data!.id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data Prospect</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customerName">Nama Pelanggan</Label>
              <Input id="customerName" {...register("customerName")} />
              {errors.customerName && <p className="text-sm text-destructive">{errors.customerName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Nomor Telepon</Label>
              <Input id="phone" inputMode="tel" {...register("phone")} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
          </div>

          {duplicate && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-destructive">Prospect ini sudah terdaftar</p>
                <p>
                  <span className="text-muted-foreground">Sales:</span> {duplicate.sales_name}
                </p>
                <p>
                  <span className="text-muted-foreground">Tanggal Dibuat:</span>{" "}
                  {format(new Date(duplicate.created_at), "dd MMM yyyy", { locale: idLocale })}
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span> <ProspectStatusBadge status={duplicate.status} />
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
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
              {errors.projectId && <p className="text-sm text-destructive">{errors.projectId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="houseType">Tipe Rumah</Label>
              <Input id="houseType" placeholder="Contoh: Tipe 36/72" {...register("houseType")} />
              {errors.houseType && <p className="text-sm text-destructive">{errors.houseType.message}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">Kota</Label>
              <Input id="city" {...register("city")} />
              {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Sumber Prospect</Label>
              <Controller
                control={control}
                name="leadSource"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih sumber" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.leadSource && <p className="text-sm text-destructive">{errors.leadSource.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" rows={3} {...register("notes")} />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || Boolean(duplicate)}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan Prospect
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
