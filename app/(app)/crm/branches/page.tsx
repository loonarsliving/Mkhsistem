import type { Metadata } from "next";
import Link from "next/link";

import { BreadcrumbNav } from "@/components/shared/breadcrumb-nav";
import { PageHeader } from "@/components/shared/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";
import { nationalStatsAction } from "@/features/crm/actions/crm-query.actions";
import { requirePermission } from "@/lib/rbac/session";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Cabang" };

interface BranchRankingRow {
  branch_id: string;
  branch_name: string;
  target_units: number;
  target_revenue: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

export default async function CrmBranchesPage() {
  await requirePermission("crm_analytics.view_all");

  const [branches, nationalStats] = await Promise.all([listBranchesAction(), nationalStatsAction()]);

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const branchRanking = (nationalStats?.branch_ranking ?? []) as unknown as BranchRankingRow[];

  return (
    <div className="space-y-6">
      <BreadcrumbNav items={[{ label: "Company", href: "/crm/dashboard" }, { label: "Cabang" }]} />
      <PageHeader title="Cabang" description="Pilih cabang untuk melihat detail performa." />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Cabang</TableHead>
            <TableHead className="text-right">Target Unit</TableHead>
            <TableHead className="text-right">Achievement</TableHead>
            <TableHead className="text-right">Collection</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {branchRanking.map((row, i) => (
            <TableRow key={row.branch_id} className="cursor-pointer">
              <TableCell className="font-medium tabular-nums">{i + 1}</TableCell>
              <TableCell className="font-medium">
                <Link href={`/crm/branches/${row.branch_id}`} className="block hover:underline">
                  {branchNames.get(row.branch_id) ?? row.branch_name}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.target_units}</TableCell>
              <TableCell className="text-right tabular-nums">{row.achievement_percent}%</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(row.collection)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
