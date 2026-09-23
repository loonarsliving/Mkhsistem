"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOGJA_BRANCH_ID } from "@/constants/app";
import { listEmployeesAction } from "@/features/employees/actions/employee-query.actions";

import { saveCommissionRateAction } from "../actions/siteplan.actions";
import { commissionRateSchema, type CommissionRateInput } from "../schemas/siteplan.schema";

interface CommissionRateFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: CommissionRateInput & { employeeName?: string };
  onSaved: () => void;
}

const EMPTY_VALUES: CommissionRateInput = { employeeId: "", commissionRatePercent: 0 };

/**
 * The rate this saves is what loonars_unit_fee_request (0275) multiplies against a purchase's
 * price for any fee_rate_based project (Loonars 2 only for now) -- scoped to Jogja employees here
 * since that's the only branch currently selling from one.
 */
export function CommissionRateFormDialog({ trigger, initialValues, onSaved }: CommissionRateFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const { data: employees } = useQuery({
    queryKey: ["jogja-sales-employees"],
    queryFn: () => listEmployeesAction({ branchId: JOGJA_BRANCH_ID, employmentStatus: "active", pageSize: 100 }),
    enabled: open,
  });
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommissionRateInput>({
    resolver: zodResolver(commissionRateSchema),
    defaultValues: initialValues ?? EMPTY_VALUES,
  });

  React.useEffect(() => {
    if (open) reset(initialValues ?? EMPTY_VALUES);
  }, [open, initialValues, reset]);

  async function onSubmit(values: CommissionRateInput) {
    const result = await saveCommissionRateAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan rate komisi");
      return;
    }
    toast.success("Rate komisi berhasil disimpan");
    setOpen(false);
    onSaved();
  }

  const isEditingExisting = Boolean(initialValues);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditingExisting ? "Edit Rate Komisi" : "Tambah Rate Komisi"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>Sales</Label>
            {isEditingExisting ? (
              <Input value={initialValues?.employeeName ?? ""} disabled />
            ) : (
              <Controller
                control={control}
                name="employeeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih sales" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.items.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            {errors.employeeId && <p className="text-sm text-destructive">{errors.employeeId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="commissionRatePercent">Rate Komisi (%)</Label>
            <Input id="commissionRatePercent" type="number" step="0.1" min="0" max="100" {...register("commissionRatePercent")} />
            {errors.commissionRatePercent && <p className="text-sm text-destructive">{errors.commissionRatePercent.message}</p>}
            <p className="text-xs text-muted-foreground">Fee dihitung otomatis sebagai persentase ini dikali harga total unit.</p>
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
