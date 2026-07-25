"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { branchStatsAction } from "@/features/crm/actions/crm-query.actions";
import { BranchPerformanceCard } from "@/features/crm/components/branch-performance-card";
import { branchBalanceAction } from "@/features/dashboard/actions/dashboard-query.actions";
import { BranchBalanceCard } from "@/features/dashboard/components/branch-balance-card";

/** Kepala Cabang's branch KPI + balance cards, fetched client-side instead of blocking the dashboard's initial render. */
export function BranchDashboardSection({ branchId }: { branchId: string | null }) {
  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ["crm-branch-stats"], queryFn: () => branchStatsAction() });
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["branch-balance", branchId],
    queryFn: () => (branchId ? branchBalanceAction(branchId) : Promise.resolve(null)),
    enabled: Boolean(branchId),
  });

  return (
    <>
      {statsLoading ? <Skeleton className="h-56 w-full" /> : stats && <BranchPerformanceCard stats={stats} />}
      {branchId && (balanceLoading ? <Skeleton className="h-32 w-full" /> : balance && <BranchBalanceCard balance={balance} />)}
    </>
  );
}
