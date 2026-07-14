"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FOLLOW_UP_ACTIVITY_TYPE_LABEL } from "@/constants/app";

import { addFollowUpAction } from "../actions/crm.actions";
import { addFollowUpSchema, type AddFollowUpInput } from "../schemas/crm.schema";

export function AddFollowUpDialog({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddFollowUpInput>({
    resolver: zodResolver(addFollowUpSchema),
    defaultValues: {
      prospectId,
      activityType: undefined,
      // toISOString() would give UTC, not local wall-clock time -- always
      // off by the local UTC offset (8h for WITA), which is exactly the
      // "jam tidak sesuai" bug reported. format() uses local time.
      activityDate: format(new Date(), "yyyy-MM-dd"),
      activityTime: format(new Date(), "HH:mm"),
      notes: "",
    },
  });

  async function onSubmit(values: AddFollowUpInput) {
    const result = await addFollowUpAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambahkan follow up");
      return;
    }
    toast.success("Follow up berhasil ditambahkan");
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus className="h-4 w-4" /> Tambah Follow Up
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Follow Up</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>Aktivitas</Label>
            <Controller
              control={control}
              name="activityType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih aktivitas" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FOLLOW_UP_ACTIVITY_TYPE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.activityType && <p className="text-sm text-destructive">{errors.activityType.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="activityDate">Tanggal</Label>
              <Input id="activityDate" type="date" {...register("activityDate")} />
              {errors.activityDate && <p className="text-sm text-destructive">{errors.activityDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="activityTime">Waktu</Label>
              <Input id="activityTime" type="time" {...register("activityTime")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" rows={3} {...register("notes")} />
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
