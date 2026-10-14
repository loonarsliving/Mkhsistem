import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, History, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { PERMISSIONS, ROLE_KEYS } from "@/constants/rbac";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import { RefundBoard } from "@/features/refund/components/refund-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { getTodayAttendance } from "@/repositories/attendance.repository";
import { currentRefundMonth, listRefundCustomers } from "@/repositories/refund.repository";

export const metadata: Metadata = { title: "Refund Customer" };

/**
 * Refund & Customer Relation workspace (0287): the refund spreadsheet as a
 * live module -- tick paid termin, WhatsApp the customer, remind the owner
 * and Vando -- plus the officer's own check-in/out, so their whole day
 * happens on one page.
 */
export default async function RefundPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, PERMISSIONS.REFUND_MANAGE);
  if (!canManage && !hasPermission(session, PERMISSIONS.REFUND_VIEW)) redirect("/dashboard?error=forbidden");
  const canAttend = hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW_OWN);

  const supabase = await createClient();
  const currentMonth = currentRefundMonth();
  const [customers, attendance] = await Promise.all([
    listRefundCustomers(supabase),
    canAttend ? getTodayAttendance(supabase, session.userId) : Promise.resolve(null),
  ]);

  const totalRefund = customers.reduce((s, c) => s + c.refundAmount, 0);
  const totalPaid = customers.reduce((s, c) => s + c.paidAmount, 0);
  const totalRemaining = customers.reduce((s, c) => s + c.remainingAmount, 0);
  const unpaid = customers.flatMap((c) => c.installments.filter((i) => !i.isPaid));
  const dueThisMonth = unpaid.filter((i) => i.dueMonth === currentMonth).reduce((s, i) => s + i.amount, 0);
  const overdue = unpaid.filter((i) => i.dueMonth < currentMonth).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refund Customer"
        description="Data refund & jadwal termin customer. Centang termin yang sudah dibayar, chat customer lewat WhatsApp, dan ingatkan Owner & Vando dengan satu klik."
        actions={
          canAttend ? (
            <Button variant="outline" asChild>
              <Link href="/attendance/history">
                <History className="h-4 w-4" /> Riwayat Absensi
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {canAttend && (
          <div className="lg:col-span-1">
            <CheckInOutCard userId={session.userId} attendance={attendance} />
          </div>
        )}
        <div className={canAttend ? "grid gap-3 sm:grid-cols-2 lg:col-span-2" : "grid gap-3 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4"}>
          <StatTile icon={Wallet} label="Total Refund" value={formatCurrency(totalRefund)} />
          <StatTile icon={CheckCircle2} label="Terbayar" value={formatCurrency(totalPaid)} tone="success" />
          <StatTile icon={CalendarClock} label="Termin Bulan Ini (belum dibayar)" value={formatCurrency(dueThisMonth)} tone="warning" />
          <StatTile
            icon={AlertTriangle}
            label={`Sisa Refund${overdue > 0 ? ` · Terlambat ${formatCurrency(overdue)}` : ""}`}
            value={formatCurrency(totalRemaining)}
            tone="destructive"
          />
        </div>
      </div>

      <RefundBoard
        customers={customers}
        currentMonth={currentMonth}
        canManage={canManage}
        canManageNumbers={canManage && session.roleKey === ROLE_KEYS.SUPER_ADMIN}
      />
    </div>
  );
}
