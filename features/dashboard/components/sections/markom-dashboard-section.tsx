"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { teamStatsAction } from "@/features/markom/actions/markom-query.actions";
import { TeamSummaryCard } from "@/features/markom/components/team-summary-card";

/** Markom's own team KPI card, fetched client-side instead of blocking the dashboard's initial render. */
export function MarkomDashboardSection() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["markom-team-stats"], queryFn: () => teamStatsAction() });
  if (isLoading) return <Skeleton className="h-56 w-full" />;
  return <TeamSummaryCard stats={stats ?? null} />;
}
