"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import { upsertProductAction } from "../actions/crm.actions";
import { listProductsAction } from "../actions/crm-query.actions";
import { upsertProductSchema, type UpsertProductInput } from "../schemas/crm.schema";

/** Product Master admin: add new products to the catalog every branch's Target form picks from. Unlimited products -- new ones appear immediately for every branch. */
export function ManageProductsDialog() {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["crm-products", "all"],
    queryFn: () => listProductsAction(true),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertProductInput>({
    resolver: zodResolver(upsertProductSchema),
    defaultValues: { productName: "", category: "", unit: "unit", defaultPrice: 0, defaultCommission: 0, status: "active" },
  });

  async function onSubmit(values: UpsertProductInput) {
    const result = await upsertProductAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan produk");
      return;
    }
    toast.success(`Produk "${values.productName}" disimpan`);
    reset({ productName: "", category: "", unit: "unit", defaultPrice: 0, defaultCommission: 0, status: "active" });
    queryClient.invalidateQueries({ queryKey: ["crm-products"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Package className="h-4 w-4" /> Kelola Produk
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Master Produk</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-lg border border-border p-4" noValidate>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tambah Produk Baru</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="productName">Nama Produk</Label>
              <Input id="productName" placeholder="Cth. Rumah Subsidi" {...register("productName")} />
              {errors.productName && <p className="text-sm text-destructive">{errors.productName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="category">Kategori</Label>
              <Input id="category" placeholder="Cth. Rumah" {...register("category")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="unit">Satuan</Label>
              <Input id="unit" placeholder="unit / pcs / dll" {...register("unit")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="defaultPrice">Harga Default (Rp)</Label>
              <Input id="defaultPrice" type="number" min={0} step="1000000" {...register("defaultPrice")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="defaultCommission">Komisi Default (%)</Label>
              <Input id="defaultCommission" type="number" min={0} max={100} step="0.5" {...register("defaultCommission")} />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <Plus className="h-4 w-4" /> Tambah Produk
          </Button>
        </form>

        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Harga Default</TableHead>
                <TableHead className="text-right">Komisi Default</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading &&
                (products ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.category ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(p.default_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.default_commission}%</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "success" : "secondary"}>{p.status === "active" ? "Aktif" : "Nonaktif"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
