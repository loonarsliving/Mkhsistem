import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Percent, Target, Trophy, Wallet } from "lucide-react";

import { BreadcrumbNav, type BreadcrumbItem } from "@/components/shared/breadcrumb-nav";
import { PageHeader } from "@/components/shared/page-header";
import { RevenueTile } from "@/components/shared/revenue-tile";
import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";
import {
  branchStatsAction,
  conversionAnalyticsAction,
  isProjectMasterInUseAction,
  nationalStatsAction,
} from "@/features/crm/actions/crm-query.actions";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Detail Cabang" };

interface BranchRankingRow {
  branch_id: string;
}

interface SalesPerformanceRow {
  sales_id: string;
  full_name: string;
  target_units: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

export default async function CrmBranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  const canViewAll = hasPermission(session, "crm_analytics.view_all");
  const canViewOwnBranch = hasPermission(session, "crm_analytics.view_branch") && session.employee.branch_id === id;
  if (!canViewAll && !canViewOwnBranch) {
    redirect("/dashboard?error=forbidden");
  }

  const [branchStats, conversionAnalytics, nationalStats, branches, isProjectInUse] = await Promise.all([
    branchStatsAction(id),
    conversionAnalyticsAction(id),
    canViewAll ? nationalStatsAction() : Promise.resolve(null),
    listBranchesAction(),
    isProjectMasterInUseAction(),
  ]);

  const branchName = branches.find((b) => b.id === id)?.name ?? "Cabang";

  const branchRanking = (nationalStats?.branch_ranking ?? []) as unknown as BranchRankingRow[];
  const rankIndex = branchRanking.findIndex((b) => b.branch_id === id);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;

  const salesRanking = (branchStats?.sales_performance ?? []) as unknown as SalesPerformanceRow[];

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Company", href: "/crm/dashboard" },
    { label: "Cabang", href: "/crm/branches" },
    ...(isProjectInUse ? [{ label: "Project" }] : []),
    { label: branchName },
  ];

  return (
    <div className="space-y-6">
      <BreadcrumbNav items={breadcrumbItems} />
      <PageHeader title={branchName} description="Detail performa cabang" />

      {branchStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile icon={Target} label="Target Unit" value={String(branchStats.target_units)} />
          <StatTile icon={Percent} label="Achievement" value={`${branchStats.achievement_percent}%`} tone="success" />
          <StatTile
            icon={CheckCircle2}
            label="Conversion Rate"
            value={`${conversionAnalytics?.conversion_percent ?? 0}%`}
          />
          {rank !== null && (
            <StatTile icon={Trophy} label="Ranking" value={`#${rank} dari ${branchRanking.length} cabang`} tone="success" />
          )}
          <RevenueTile icon={Wallet} label="Target Revenue" value={formatCurrency(branchStats.target_revenue)} />
          <RevenueTile icon={Wallet} label="Collection" value={formatCurrency(branchStats.collection)} tone="success" />
        </div>
      )}

      {branchStats && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">Baru {branchStats.prospects_red}</span>
          <span className="rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">Follow Up {branchStats.prospects_yellow}</span>
          <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">Verifikasi {branchStats.prospects_green}</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Closing {branchStats.prospects_closing}</span>
        </div>
      )}

      {salesRanking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking Sales</CardTitle>
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
                  {salesRanking.map((row, i) => (
                    <TableRow key={row.sales_id} className="cursor-pointer">
                      <TableCell className="font-medium tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/crm/sales/${row.sales_id}`} className="block hover:underline">
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
