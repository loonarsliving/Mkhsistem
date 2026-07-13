"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";
import { formatCurrency } from "@/lib/utils";

import { saveAndDistributeTargetAction } from "../actions/crm.actions";
import { getTargetHeaderDetailAction, listProductsAction, listTargetHeadersSummaryAction } from "../actions/crm-query.actions";
import { saveAndDistributeTargetSchema, type SaveAndDistributeTargetInput } from "../schemas/crm.schema";
import { ManageProductAssignmentDialog } from "./manage-product-assignment-dialog";
import { ManageProductsDialog } from "./manage-products-dialog";

const MONTH_LABEL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const EMPTY_ROW = { productId: "", targetUnit: 0, sellingPrice: 0, commissionPercent: 0 };

export function TargetManagementForm() {
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const queryClient = useQueryClient();

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction });
  const { data: products } = useQuery({ queryKey: ["crm-products", "active"], queryFn: () => listProductsAction(false) });
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["crm-target-headers-summary", month, year],
    queryFn: () => listTargetHeadersSummaryAction(month, year),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SaveAndDistributeTargetInput>({
    resolver: zodResolver(saveAndDistributeTargetSchema),
    defaultValues: { branchId: "", periodMonth: month, periodYear: year, details: [{ ...EMPTY_ROW }] },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "details" });

  const watchedBranchId = watch("branchId");
  const watchedDetails = watch("details");

  const { data: existingTarget, isFetching: loadingExisting } = useQuery({
    queryKey: ["crm-target-header-detail", watchedBranchId, month, year],
    queryFn: () => getTargetHeaderDetailAction(watchedBranchId, month, year),
    enabled: Boolean(watchedBranchId),
  });

  // Load the saved product list for this branch/period whenever the selection changes; otherwise start with one empty row.
  React.useEffect(() => {
    if (!watchedBranchId) return;
    if (loadingExisting) return;
    const rows = existingTarget?.crm_target_details ?? [];
    if (rows.length > 0) {
      replace(
        rows.map((r) => ({
          productId: r.product_id,
          targetUnit: r.target_unit,
          sellingPrice: r.selling_price,
          commissionPercent: r.commission_percent,
        })),
      );
    } else {
      replace([{ ...EMPTY_ROW }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedBranchId, month, year, loadingExisting, existingTarget]);

  function handleProductChange(index: number, productId: string, onChange: (value: string) => void) {
    onChange(productId);
    const product = products?.find((p) => p.id === productId);
    if (!product) return;
    const current = watchedDetails[index];
    // Auto-fill defaults only for a brand-new row (0/0 means never edited) -- never clobber an already-saved price/commission.
    if (!current?.sellingPrice) setValue(`details.${index}.sellingPrice`, product.default_price);
    if (!current?.commissionPercent) setValue(`details.${index}.commissionPercent`, product.default_commission);
  }

  const totalUnits = watchedDetails.reduce((sum, r) => sum + (Number(r.targetUnit) || 0), 0);
  const totalRevenue = watchedDetails.reduce((sum, r) => sum + (Number(r.targetUnit) || 0) * (Number(r.sellingPrice) || 0), 0);

  async function onSubmit(values: SaveAndDistributeTargetInput) {
    const result = await saveAndDistributeTargetAction({ ...values, periodMonth: month, periodYear: year });
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan target");
      return;
    }
    toast.success(
      result.data && result.data.distributedCount > 0
        ? `Target disimpan & didistribusikan ke ${result.data.distributedCount} Sales`
        : "Target cabang disimpan. Belum ada Sales yang ditugaskan ke produk-produk ini untuk didistribusikan.",
    );
    queryClient.invalidateQueries({ queryKey: ["crm-target-headers-summary", month, year] });
    queryClient.invalidateQueries({ queryKey: ["crm-target-header-detail", watchedBranchId, month, year] });
  }

  const usedProductIds = new Set(watchedDetails.map((r) => r.productId).filter(Boolean));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Set Target Cabang</CardTitle>
          <ManageProductsDialog />
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cabang</Label>
                <Controller
                  control={control}
                  name="branchId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih cabang" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches?.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.branchId && <p className="text-sm text-destructive">{errors.branchId.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bulan</Label>
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABEL.map((label, i) => (
                        <SelectItem key={label} value={String(i + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tahun</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </div>
              </div>
            </div>

            {watchedBranchId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Produk</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ ...EMPTY_ROW })}>
                    <Plus className="h-4 w-4" /> Add Product
                  </Button>
                </div>

                {loadingExisting ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const rowProductId = watchedDetails[index]?.productId;
                      const rowRevenue = (Number(watchedDetails[index]?.targetUnit) || 0) * (Number(watchedDetails[index]?.sellingPrice) || 0);
                      return (
                        <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[2fr,1fr,1.4fr,1fr,auto]">
                          <div className="space-y-1">
                            <Label className="text-xs">Product</Label>
                            <Controller
                              control={control}
                              name={`details.${index}.productId`}
                              render={({ field: f }) => (
                                <Select value={f.value} onValueChange={(v) => handleProductChange(index, v, f.onChange)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Pilih produk" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products
                                      ?.filter((p) => p.id === rowProductId || !usedProductIds.has(p.id))
                                      .map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.product_name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Target Unit</Label>
                            <Input type="number" min={0} {...register(`details.${index}.targetUnit`)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Selling Price</Label>
                            <Input type="number" min={0} step="1000000" {...register(`details.${index}.sellingPrice`)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Commission (%)</Label>
                            <Input type="number" min={0} max={100} step="0.5" {...register(`details.${index}.commissionPercent`)} />
                          </div>
                          <div className="flex items-end justify-end gap-1">
                            {rowProductId && (
                              <ManageProductAssignmentDialog
                                productId={rowProductId}
                                productName={products?.find((p) => p.id === rowProductId)?.product_name ?? ""}
                                branchId={watchedBranchId}
                              />
                            )}
                            <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground sm:col-span-5">Target Revenue: {formatCurrency(rowRevenue)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {errors.details?.root && <p className="text-sm text-destructive">{errors.details.root.message}</p>}
                {errors.details?.message && <p className="text-sm text-destructive">{errors.details.message}</p>}

                <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Grand Total Units</p>
                    <p className="font-medium tabular-nums">{totalUnits} unit</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Grand Total Revenue</p>
                    <p className="font-medium tabular-nums">{formatCurrency(totalRevenue)}</p>
                  </div>
                </div>
              </div>
            )}

            <Button type="submit" disabled={isSubmitting || !watchedBranchId} className="w-full sm:w-auto">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Simpan &amp; Distribusikan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Target Cabang — {MONTH_LABEL[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!summaryLoading && (summary ?? []).length === 0 ? (
            <EmptyState icon={Plus} title="Belum ada cabang" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cabang</TableHead>
                    <TableHead className="text-right">Jumlah Produk</TableHead>
                    <TableHead className="text-right">Total Unit</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(summary ?? []).map((row) => (
                    <TableRow key={row.branch_id}>
                      <TableCell className="font-medium">{row.branch_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.has_target ? row.product_count : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.has_target ? row.total_target_units : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.has_target ? formatCurrency(row.total_target_revenue) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
