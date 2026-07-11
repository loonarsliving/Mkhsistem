import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, PlusCircle, Target, Users, Wallet } from "lucide-react";

import { BreadcrumbNav } from "@/components/shared/breadcrumb-nav";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RevenueTile } from "@/components/shared/revenue-tile";
import { StatTile } from "@/components/shared/stat-tile";
import { ProspectStatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOLLOW_UP_ACTIVITY_TYPE_LABEL } from "@/constants/app";
import {
  listProspectsAction,
  listRecentFollowUpsBySalesAction,
  monthlyTrendAction,
  salesStatsAction,
} from "@/features/crm/actions/crm-query.actions";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { FollowUpActivityTypeDb, ProspectStatusDb } from "@/types/database.types";

export const metadata: Metadata = { title: "Detail Sales" };

interface ProspectRow {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  status: ProspectStatusDb;
  created_at: string;
}

interface FollowUpRow {
  id: string;
  activity_type: FollowUpActivityTypeDb;
  activity_date: string;
  activity_time: string | null;
  notes: string | null;
  prospect: { customer_name: string; phone: string } | null;
  created_by_employee: { full_name: string } | null;
}

export default async function CrmSalesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, branch_id, branches:branch_id(name)")
    .eq("id", id)
    .single();

  if (!employee) redirect("/dashboard?error=forbidden");

  const canViewAll = hasPermission(session, "sales_target.view_all");
  const canViewOwnBranch =
    hasPermission(session, "sales_target.view_branch") && employee.branch_id === session.employee.branch_id;
  const isSelf = session.userId === id;

  if (!isSelf && !canViewAll && !canViewOwnBranch) {
    redirect("/dashboard?error=forbidden");
  }

  const [salesStats, prospects, followUps, monthlyTrend] = await Promise.all([
    salesStatsAction(id),
    listProspectsAction({ salesId: id, page: 1, pageSize: 10 }),
    listRecentFollowUpsBySalesAction(id, 15),
    monthlyTrendAction(6, undefined, id),
  ]);

  const prospectItems = (prospects.items ?? []) as unknown as ProspectRow[];
  const followUpItems = (followUps ?? []) as unknown as FollowUpRow[];

  return (
    <div className="space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Company", href: "/crm/dashboard" },
          { label: employee.branches?.name ?? "Cabang", href: `/crm/branches/${employee.branch_id}` },
          { label: employee.full_name },
        ]}
      />
      <PageHeader title={employee.full_name} description="Detail performa sales" />

      {salesStats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Target} label="Target Unit" value={String(salesStats.target_units)} />
            <StatTile icon={CheckCircle2} label="Closing Unit" value={String(salesStats.closing_units)} tone="success" />
            <StatTile icon={Target} label="Achievement" value={`${salesStats.achievement_percent}%`} tone="success" />
            <RevenueTile icon={Wallet} label="Collection" value={formatCurrency(salesStats.collection)} tone="success" />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">Baru {salesStats.prospects_red}</span>
            <span className="rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">Follow Up {salesStats.prospects_yellow}</span>
            <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">Verifikasi {salesStats.prospects_green}</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Closing {salesStats.prospects_closing}</span>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prospect</CardTitle>
        </CardHeader>
        <CardContent>
          {prospectItems.length === 0 ? (
            <EmptyState icon={Users} title="Belum ada prospect" className="border-0 py-8" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Kota</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prospectItems.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/crm/${row.id}`} className="block hover:underline">
                          <p className="font-medium">{row.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{row.phone}</p>
                        </Link>
                      </TableCell>
                      <TableCell>{row.city}</TableCell>
                      <TableCell>
                        <ProspectStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Follow Up Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {followUpItems.length === 0 ? (
            <EmptyState icon={PlusCircle} title="Belum ada follow up" className="border-0 py-8" />
          ) : (
            <ul className="divide-y divide-border">
              {followUpItems.map((f) => (
                <li key={f.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <PlusCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {FOLLOW_UP_ACTIVITY_TYPE_LABEL[f.activity_type]} · {f.prospect?.customer_name ?? "-"}
                    </p>
                    {f.notes && <p className="mt-0.5 truncate text-sm text-muted-foreground">{f.notes}</p>}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(
                          new Date(f.activity_time ? `${f.activity_date}T${f.activity_time}` : f.activity_date),
                          { addSuffix: true, locale: idLocale },
                        )}
                      </span>
                      {f.created_by_employee && (
                        <span className="text-xs text-muted-foreground">· {f.created_by_employee.full_name}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyTrend.length === 0 ? (
            <EmptyState icon={Target} title="Belum ada riwayat" className="border-0 py-8" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Achievement</TableHead>
                    <TableHead className="text-right">Collection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrend.map((row) => (
                    <TableRow key={`${row.period_year}-${row.period_month}`}>
                      <TableCell className="font-medium">
                        {new Date(row.period_year, row.period_month - 1).toLocaleDateString("id-ID", {
                          month: "long",
                          year: "numeric",
                        })}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
