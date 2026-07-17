"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";

import { StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { createOrderAction, getOrderStatsAction, listOrdersAction, updateOrderStatusAction } from "../actions/loonars-beauty.actions";
import { ORDER_CHANNELS, ORDER_STATUSES, type CreateOrderInput } from "../schemas/loonars-beauty.schema";

const CHANNEL_LABEL: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  website: "Website",
  offline: "Offline",
  other: "Lainnya",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Baru",
  processing: "Diproses",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Batal",
};

const STATUS_VARIANT: Record<string, "secondary" | "success" | "outline" | "destructive"> = {
  pending: "secondary",
  processing: "secondary",
  shipped: "outline",
  completed: "success",
  cancelled: "destructive",
};

function formatRp(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const EMPTY_FORM: CreateOrderInput = {
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  channel: "whatsapp",
  productName: "",
  quantity: 1,
  unitPrice: 0,
  courier: "",
  trackingNumber: "",
  notes: "",
};

export function OrderBoard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState<CreateOrderInput>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = React.useState<string>("");

  const { data: stats } = useQuery({ queryKey: ["loonars-order-stats"], queryFn: () => getOrderStatsAction() });
  const { data: orders, isLoading } = useQuery({
    queryKey: ["loonars-orders", statusFilter],
    queryFn: () => listOrdersAction(statusFilter ? { status: statusFilter as (typeof ORDER_STATUSES)[number] } : undefined),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["loonars-orders"] });
    queryClient.invalidateQueries({ queryKey: ["loonars-order-stats"] });
  }

  async function handleCreate() {
    setSubmitting(true);
    const result = await createOrderAction(form);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan order");
      return;
    }
    toast.success(`Order ${result.data?.orderNumber} tersimpan`);
    setForm(EMPTY_FORM);
    setAddOpen(false);
    invalidate();
  }

  async function handleStatusChange(id: string, status: string) {
    const result = await updateOrderStatusAction({ id, status: status as (typeof ORDER_STATUSES)[number] });
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah status");
      return;
    }
    toast.success("Status order diperbarui");
    invalidate();
  }

  const total = form.quantity * form.unitPrice;

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={ShoppingBag} label="Order (30 hari)" value={stats.ordersCount.toLocaleString("id-ID")} />
          <StatTile icon={TrendingUp} label="Omzet (30 hari)" value={formatRp(stats.revenue)} />
          <StatTile icon={Wallet} label="Order Baru" value={(stats.byStatus.pending ?? 0).toLocaleString("id-ID")} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> Tambah Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tambah Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Nama pembeli" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
                  <Input placeholder="No. HP" value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} />
                </div>
                <Textarea
                  placeholder="Alamat pengiriman (opsional)"
                  value={form.customerAddress}
                  onChange={(e) => setForm((f) => ({ ...f, customerAddress: e.target.value }))}
                  rows={2}
                />
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v as CreateOrderInput["channel"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CHANNEL_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Nama produk (default: HydraGlow Advanced Brightening Lotion)"
                  value={form.productName}
                  onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Harga satuan"
                    value={form.unitPrice}
                    onChange={(e) => setForm((f) => ({ ...f, unitPrice: Number(e.target.value) }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Kurir (opsional)" value={form.courier} onChange={(e) => setForm((f) => ({ ...f, courier: e.target.value }))} />
                  <Input
                    placeholder="No. Resi (opsional)"
                    value={form.trackingNumber}
                    onChange={(e) => setForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  />
                </div>
                <Textarea placeholder="Catatan (opsional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
                <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                  <span className="text-sm font-medium text-muted-foreground">Total</span>
                  <span className="text-lg font-semibold">{formatRp(total)}</span>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={submitting || !form.customerName.trim()} onClick={handleCreate}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Simpan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daftar Order</CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && (!orders || orders.length === 0) && <p className="text-sm text-muted-foreground">Belum ada order tercatat.</p>}
          {orders && orders.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Pembeli</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{CHANNEL_LABEL[order.channel] ?? order.channel}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatRp(order.total_amount)}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <Select value={order.status} onValueChange={(v) => handleStatusChange(order.id, v)}>
                          <SelectTrigger className="h-7 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORDER_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
