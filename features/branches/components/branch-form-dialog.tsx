"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LocateFixed } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useGeolocation } from "@/hooks/use-geolocation";

import { saveBranchAction } from "../actions/branch.actions";
import { branchSchema, type BranchInput } from "../schemas/branch.schema";

interface BranchFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: BranchInput;
}

export function BranchFormDialog({ trigger, initialValues }: BranchFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const geo = useGeolocation();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BranchInput>({
    resolver: zodResolver(branchSchema),
    defaultValues: initialValues ?? {
      code: "",
      name: "",
      address: "",
      city: "",
      latitude: null,
      longitude: null,
      radiusMeters: 100,
      phone: "",
      isHeadOffice: false,
      isActive: true,
    },
  });

  React.useEffect(() => {
    if (geo.latitude !== null) setValue("latitude", geo.latitude);
    if (geo.longitude !== null) setValue("longitude", geo.longitude);
  }, [geo.latitude, geo.longitude, setValue]);

  async function onSubmit(values: BranchInput) {
    const result = await saveBranchAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan cabang");
      return;
    }
    toast.success("Cabang berhasil disimpan");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Cabang" : "Tambah Cabang"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="code">Kode Cabang</Label>
              <Input id="code" {...register("code")} />
              {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nama Cabang</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">Kota</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telepon</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Alamat</Label>
            <Input id="address" {...register("address")} />
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label>Lokasi Kantor (untuk validasi radius absensi)</Label>
              <Button type="button" variant="ghost" size="sm" onClick={geo.request} disabled={geo.loading}>
                {geo.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                Gunakan Lokasi Saat Ini
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" step="any" placeholder="Latitude" {...register("latitude")} />
              <Input type="number" step="any" placeholder="Longitude" {...register("longitude")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="radiusMeters" className="text-xs">
                Radius Absensi (meter)
              </Label>
              <Input id="radiusMeters" type="number" min={10} max={5000} {...register("radiusMeters")} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="isHeadOffice" className="cursor-pointer">
              Kantor Pusat
            </Label>
            <Controller
              control={control}
              name="isHeadOffice"
              render={({ field }) => <Switch id="isHeadOffice" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="isActive" className="cursor-pointer">
              Aktif
            </Label>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => <Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />}
            />
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
