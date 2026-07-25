"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { listRecentFollowUpsBySalesAction, salesStatsAction } from "@/features/crm/actions/crm-query.actions";
import { RecentProspectActivityCard } from "@/features/crm/components/recent-prospect-activity-card";
import { SalesCrmActivityCard } from "@/features/crm/components/sales-crm-activity-card";
import { SalesTargetCommissionSection } from "@/features/crm/components/sales-target-commission-section";

/**
 * Sales' target/commission, CRM activity, and recent prospect activity cards
 * used to block the dashboard's initial server render (part of the big
 * Promise.all in page.tsx). Moved here to fetch client-side instead, same
 * pattern as LoonarsFeeCard -- the page shell renders immediately and these
 * fill in once ready, instead of adding to TTFB.
 */
export function SalesDashboardSection({ userId }: { userId: string }) {
  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ["sales-stats"], queryFn: () => salesStatsAction() });
  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ["sales-recent-follow-ups", userId],
    queryFn: () => listRecentFollowUpsBySalesAction(userId, 8),
  });

  return (
    <>
      {statsLoading ? <Skeleton className="h-48 w-full" /> : <SalesTargetCommissionSection stats={stats ?? null} />}
      {statsLoading ? <Skeleton className="h-32 w-full" /> : <SalesCrmActivityCard stats={stats ?? null} />}
      {activitiesLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <RecentProspectActivityCard activities={(activities ?? []) as unknown as Parameters<typeof RecentProspectActivityCard>[0]["activities"]} />
      )}
    </>
  );
}
