"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Link2, PackageX, ShoppingBag, TrendingUp, Wallet } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { getLiveOrderSyncAction } from "../actions/loonars-beauty.actions";

const CHANNEL_LABEL: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  website: "Website",
  offline: "Offline",
};

function formatRp(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

/** Live pull from Loonars Dashboard's own database -- see repositories/loonars-dashboard-sync.repository.ts. Replaces manual order entry once LOONARS_DASHBOARD_* env vars are set. */
export function LiveOrderSync() {
  const { data, isLoading } = useQuery({ queryKey: ["loonars-dashboard-live-sync"], queryFn: getLiveOrderSyncAction });

  if (isLoading) return null;

  if (!data?.configured) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Sinkronisasi Loonars Dashboard belum aktif</p>
            <p className="text-xs text-muted-foreground">
              Set <code className="rounded bg-muted px-1">LOONARS_DASHBOARD_SUPABASE_URL</code> dan{" "}
              <code className="rounded bg-muted px-1">LOONARS_DASHBOARD_SERVICE_ROLE_KEY</code> di Environment Variables Vercel (project
              mkhsistem) untuk menarik data order otomatis. Sampai saat itu, catat order lewat form manual di bawah.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { summary, recentOrders, lowStockProducts } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Order Live dari Loonars Dashboard (30 hari terakhir)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile icon={ShoppingBag} label="Total Order" value={summary.ordersCount.toLocaleString("id-ID")} />
            <StatTile icon={TrendingUp} label="Omzet" value={formatRp(summary.totalRevenue)} />
            <StatTile icon={Wallet} label="Profit" value={formatRp(summary.totalProfit)} />
          </div>

          {Object.keys(summary.byChannel).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(summary.byChannel).map(([channel, count]) => (
                <Badge key={channel} variant="secondary">
                  {CHANNEL_LABEL[channel] ?? channel}: {count}
                </Badge>
              ))}
            </div>
          )}

          {recentOrders.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                    <TableCell>{CHANNEL_LABEL[order.channel] ?? order.channel}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatRp(order.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {recentOrders.length === 0 && <p className="text-sm text-muted-foreground">Belum ada order tercatat di Loonars Dashboard.</p>}
        </CardContent>
      </Card>

      {lowStockProducts.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <CardTitle className="text-sm font-medium">Stok Menipis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Konten yang lagi dipush sebaiknya jangan drive traffic ke produk yang stoknya hampir habis.
            </p>
            {lowStockProducts.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-sm">
                <div className="flex items-center gap-2">
                  <PackageX className="h-3.5 w-3.5 text-warning" />
                  <span>{product.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {product.stock} / min {product.min_stock}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
