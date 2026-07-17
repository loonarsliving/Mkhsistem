import "server-only";

import { createLoonarsDashboardClient } from "@/lib/supabase/loonars-dashboard-client";

/** Row shapes are hand-written (not codegen'd) for just the columns this read-only sync needs -- this is a foreign project's schema, not MK Connect's own. */
export interface LoonarsDashboardOrder {
  id: string;
  order_number: string;
  channel: string;
  status: string;
  customer_name: string | null;
  total: number;
  profit: number;
  created_at: string;
}

export async function listRecentOrders(limit = 10): Promise<LoonarsDashboardOrder[]> {
  const client = createLoonarsDashboardClient();
  if (!client) return [];

  const { data, error } = await client
    .from("orders")
    .select("id, order_number, channel, status, customer_name, total, profit, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LoonarsDashboardOrder[];
}

export interface LoonarsDashboardOrderSummary {
  ordersCount: number;
  totalRevenue: number;
  totalProfit: number;
  byChannel: Record<string, number>;
}

export async function getOrderSummary(sinceISODate: string): Promise<LoonarsDashboardOrderSummary> {
  const client = createLoonarsDashboardClient();
  if (!client) return { ordersCount: 0, totalRevenue: 0, totalProfit: 0, byChannel: {} };

  const { data, error } = await client.from("orders").select("channel, total, profit").gte("created_at", sinceISODate);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ channel: string; total: number; profit: number }>;
  const byChannel: Record<string, number> = {};
  let totalRevenue = 0;
  let totalProfit = 0;
  for (const row of rows) {
    byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
    totalRevenue += Number(row.total ?? 0);
    totalProfit += Number(row.profit ?? 0);
  }
  return { ordersCount: rows.length, totalRevenue, totalProfit, byChannel };
}

export interface LoonarsDashboardProductStock {
  id: string;
  name: string;
  sku: string;
  stock: number;
  min_stock: number;
}

/** Low-stock signal -- so a content push that's about to drive a spike doesn't run into an empty warehouse. */
export async function listLowStockProducts(): Promise<LoonarsDashboardProductStock[]> {
  const client = createLoonarsDashboardClient();
  if (!client) return [];

  const { data, error } = await client.from("products").select("id, name, sku, stock, min_stock").eq("is_active", true);
  if (error) throw error;
  return ((data ?? []) as LoonarsDashboardProductStock[]).filter((product) => product.stock <= product.min_stock);
}
