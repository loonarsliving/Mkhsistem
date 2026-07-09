"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Check, ClipboardList, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveStatusBadge } from "@/components/shared/status-badge";
import type { LeaveStatusType } from "@/constants/app";
import { getInitials } from "@/lib/utils";

import { decideLeaveRequestAction } from "../actions/attendance.actions";
import { listMyLeaveRequestsAction, listPendingLeaveRequestsAction } from "../actions/attendance-query.actions";

export function MyLeaveRequestList() {
  const { data } = useQuery({ queryKey: ["my-leave-requests"], queryFn: listMyLeaveRequestsAction });
  const requests = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Riwayat Pengajuan Izin/Sakit</CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada pengajuan" className="border-0 py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((req) => (
              <li key={req.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">{req.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(req.start_date), "dd MMM yyyy", { locale: idLocale })} –{" "}
                    {format(new Date(req.end_date), "dd MMM yyyy", { locale: idLocale })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{req.reason}</p>
                </div>
                <LeaveStatusBadge status={req.status as LeaveStatusType} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PendingLeaveApprovalList() {
  const router = useRouter();
  const { data, refetch } = useQuery({ queryKey: ["pending-leave-requests"], queryFn: listPendingLeaveRequestsAction });
  const requests = data ?? [];
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  async function handleDecision(id: string, approve: boolean) {
    setProcessingId(id);
    const result = await decideLeaveRequestAction({ leaveRequestId: id, approve });
    setProcessingId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memproses pengajuan");
      return;
    }
    toast.success(approve ? "Pengajuan disetujui" : "Pengajuan ditolak");
    refetch();
    router.refresh();
  }

  if (requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Persetujuan Izin/Sakit Menunggu</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {requests.map((req) => {
            const employee = req.employees as { full_name: string; employee_code: string; avatar_url: string | null } | null;
            return (
              <li key={req.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {employee ? getInitials(employee.full_name) : "-"}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{employee?.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {req.type} · {format(new Date(req.start_date), "dd MMM")} – {format(new Date(req.end_date), "dd MMM yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={processingId === req.id}
                    onClick={() => handleDecision(req.id, false)}
                  >
                    <X className="h-4 w-4" /> Tolak
                  </Button>
                  <Button size="sm" disabled={processingId === req.id} onClick={() => handleDecision(req.id, true)}>
                    <Check className="h-4 w-4" /> Setujui
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
