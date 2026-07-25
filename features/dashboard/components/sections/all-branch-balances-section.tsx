"use client";

import { useQuery } from "@tanstack/react-query";

import { allBranchBalancesAction } from "@/features/dashboard/actions/dashboard-query.actions";
import { AllBranchBalancesCard } from "@/features/dashboard/components/branch-balance-card";

/** Directors' all-branch balance overview, fetched client-side instead of blocking the dashboard's initial render. */
export function AllBranchBalancesSection() {
  const { data: balances } = useQuery({ queryKey: ["all-branch-balances"], queryFn: allBranchBalancesAction });
  if (!balances || balances.length === 0) return null;
  return <AllBranchBalancesCard balances={balances} />;
}
