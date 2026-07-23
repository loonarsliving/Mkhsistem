import Link from "next/link";
import { CheckCircle2, ClipboardList, Percent, Users } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { teamStatsAction } from "../actions/markom-query.actions";

interface TeamMember {
  employee_id: string;
  full_name: string;
}

/**
 * The ONE Markom widget on the Home Dashboard -- shown to both a team member
 * ("my team") and their Branch Manager ("the team I review"), since it's the
 * exact same team data either way. Never lists members' individual stats
 * separately -- only the team as a whole.
 */
export function TeamSummaryCard({
  stats,
  reviewMode = false,
}: {
  stats: Awaited<ReturnType<typeof teamStatsAction>>;
  reviewMode?: boolean;
}) {
  if (!stats) return null;
  const teamMembers = (stats.team_members as unknown as TeamMember[] | null) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Markom Team — {stats.branch_name}</CardTitle>
        <Button asChild size="sm" variant={reviewMode ? "outline" : "default"}>
          <Link href="/markom">{reviewMode ? "Review Task" : "Lihat Checklist"}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {teamMembers.length > 0 ? teamMembers.map((m) => m.full_name).join(", ") : "Belum ada anggota tim aktif."}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile icon={ClipboardList} label="Total Tasks" value={String(stats.monthly_total)} />
          <StatTile icon={CheckCircle2} label="Completed Tasks" value={String(stats.monthly_completed)} tone="success" />
          <StatTile icon={ClipboardList} label="Remaining Tasks" value={String(stats.monthly_remaining)} />
          <StatTile icon={Percent} label="Weekly Achievement" value={`${stats.weekly_achievement_percent}%`} tone="success" />
          <StatTile icon={Percent} label="Monthly Achievement" value={`${stats.monthly_achievement_percent}%`} tone="success" />
        </div>
      </CardContent>
    </Card>
  );
}
