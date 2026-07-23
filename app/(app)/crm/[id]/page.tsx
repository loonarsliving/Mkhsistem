import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getProspectDetailAction } from "@/features/crm/actions/crm-query.actions";
import { ProspectDetail } from "@/features/crm/components/prospect-detail";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Detail Prospect" };

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  const data = await getProspectDetailAction(id).catch(() => null);
  if (!data?.prospect) notFound();

  const isOwner = data.prospect.sales_id === session.userId;
  const canManageAll = hasPermission(session, "prospect.manage");
  const isBranchScoped =
    hasPermission(session, "prospect.view_branch") && data.prospect.branch_id === session.employee.branch_id;

  const canAddFollowUp = hasPermission(session, "prospect.follow_up_create") && (isOwner || canManageAll || isBranchScoped);
  const canSetGreen = isOwner || canManageAll;
  const canRecordPayment = hasPermission(session, "prospect.finance_verify");

  return (
    <div className="space-y-6">
      <PageHeader title={data.prospect.customer_name} description="Detail prospect, timeline follow up, dan riwayat pembayaran." />
      <ProspectDetail data={data} canAddFollowUp={canAddFollowUp} canSetGreen={canSetGreen} canRecordPayment={canRecordPayment} />
    </div>
  );
}
