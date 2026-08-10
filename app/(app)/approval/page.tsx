import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/constants/rbac";
import { listApprovalRequests } from "@/repositories/approval-requests.repository";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Approval WA" };

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") return <Badge>Disetujui</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Ditolak</Badge>;
  return <Badge variant="outline">Menunggu</Badge>;
}

export default async function ApprovalPage() {
  const session = await requireSession();
  const canView = hasPermission(session, PERMISSIONS.APPROVAL_REQUEST_VIEW_OWN) || hasPermission(session, PERMISSIONS.APPROVAL_REQUEST_MANAGE);
  if (!canView) redirect("/dashboard?error=forbidden");

  const supabase = await createClient();
  const requests = await listApprovalRequests(supabase);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approval WA"
        description={
          'Pengajuan dikirim dan diputuskan lewat WhatsApp -- ketik "AJUKAN <detail>" (boleh sertakan foto) untuk mengajukan, Super Admin membalas SETUJU/TOLAK untuk memutuskan. Halaman ini hanya menampilkan riwayatnya.'
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" />
            Riwayat Pengajuan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Belum ada pengajuan" description='Belum ada pengajuan approval yang dikirim via WA.' className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Pemohon</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Diputuskan Oleh</TableHead>
                    <TableHead>Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono whitespace-nowrap">{req.code}</TableCell>
                      <TableCell>{req.requesterName ?? "-"}</TableCell>
                      <TableCell>{req.branchName ?? "-"}</TableCell>
                      <TableCell className="max-w-xs">
                        {req.requestText && <p className="line-clamp-2 text-sm">{req.requestText}</p>}
                        {req.imageUrl && (
                          <a href={req.imageUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                            Lihat foto
                          </a>
                        )}
                        {req.decisionNote && <p className="mt-1 text-xs text-muted-foreground">Catatan: {req.decisionNote}</p>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={req.status} />
                      </TableCell>
                      <TableCell>{req.decidedByName ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{new Date(req.createdAt).toLocaleString("id-ID")}</TableCell>
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
