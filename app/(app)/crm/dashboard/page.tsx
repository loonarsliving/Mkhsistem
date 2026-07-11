import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Percent, TrendingUp, Users, Wallet } from "lucide-react";

import { BreadcrumbNav } from "@/components/shared/breadcrumb-nav";
import { PageHeader } from "@/components/shared/page-header";
import { RevenueTile } from "@/components/shared/revenue-tile";
import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  branchStatsAction,
  conversionAnalyticsAction,
  monthlyTrendAction,
  nationalStatsAction,
} from "@/features/crm/actions/crm-query.actions";
import { BranchPerformanceCard } from "@/features/crm/components/branch-performance-card";
import { LeadSourceChart } from "@/features/crm/components/lead-source-chart";
import { MonthlyTrendChart } from "@/features/crm/components/monthly-trend-chart";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard CRM" };

interface BranchRankingRow {
  branch_id: string;
  branch_name: string;
  target_units: number;
  target_revenue: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

interface SalesPerformanceRow {
  sales_id: string;
  full_name: string;
  target_units: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

/**
 * CRM Dashboard = Operational Analysis ("why is the company performing like
 * this"). Landing page for the Company -> Branch -> Sales -> Customer
 * drill-down; scoped automatically to view_all (company-wide) vs
 * view_branch (own branch only) the same way every other CRM page is.
 */
export default async function CrmDashboardPage() {
  const session = await requireSession();
  const canViewAll = hasPermission(session, "crm_analytics.view_all");
  const canViewBranch = hasPermission(session, "crm_analytics.view_branch");
  if (!canViewAll && !canViewBranch) {
    redirect("/dashboard?error=forbidden");
  }

  const branchId = canViewAll ? undefined : session.employee.branch_id;

  const [stats, conversion, trend] = await Promise.all([
    canViewAll ? nationalStatsAction() : branchStatsAction(branchId),
    conversionAnalyticsAction(branchId),
    monthlyTrendAction(6, branchId),
  ]);

  const branchRanking = canViewAll && stats ? ((stats as { branch_ranking?: unknown }).branch_ranking ?? []) : [];
  const salesPerformance = !canViewAll && stats ? ((stats as { sales_performance?: unknown }).sales_performance ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard CRM" description="Konversi, performa cabang/sales, dan tren bulanan." />

      <BreadcrumbNav
        items={[
          { label: "Company", href: canViewAll ? undefined : "/crm/dashboard" },
          ...(canViewAll ? [] : [{ label: session.employee.branch_name ?? "Cabang" }]),
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {canViewAll && (
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/branches">Lihat Semua Cabang</Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link href="/crm/customers">Database Pelanggan</Link>
        </Button>
      </div>

      {canViewAll ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={Users} label="Total Prospects" value={String(conversion?.total_prospects ?? 0)} />
          <StatTile icon={CheckCircle2} label="Total Closing" value={String(conversion?.total_closing ?? 0)} tone="success" />
          <StatTile icon={Percent} label="Conversion Rate" value={`${conversion?.conversion_percent ?? 0}%`} />
          <StatTile icon={TrendingUp} label="Achievement" value={`${stats?.achievement_percent ?? 0}%`} tone="success" />
          <RevenueTile icon={Wallet} label="Collection" value={formatCurrency(stats?.collection ?? 0)} tone="success" />
        </div>
      ) : (
        // Branch Manager view: whole-branch figures only (crm_branch_stats), never per-sales data.
        <BranchPerformanceCard stats={stats as Awaited<ReturnType<typeof branchStatsAction>>} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <MonthlyTrendChart data={trend} />
        <LeadSourceChart data={(conversion?.lead_source_performance ?? []) as never} />
      </div>

      {canViewAll && (branchRanking as BranchRankingRow[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branch Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Achievement</TableHead>
                    <TableHead className="text-right">Collection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(branchRanking as BranchRankingRow[]).map((row, i) => (
                    <TableRow key={row.branch_id}>
                      <TableCell className="font-medium tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/crm/branches/${row.branch_id}`} className="hover:underline">
                          {row.branch_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.target_units}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.closing_units}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.achievement_percent}%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.collection)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!canViewAll && (salesPerformance as SalesPerformanceRow[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Achievement</TableHead>
                    <TableHead className="text-right">Collection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(salesPerformance as SalesPerformanceRow[]).map((row, i) => (
                    <TableRow key={row.sales_id}>
                      <TableCell className="font-medium tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/crm/sales/${row.sales_id}`} className="hover:underline">
                          {row.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.target_units}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.closing_units}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.achievement_percent}%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.collection)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
