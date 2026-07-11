import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Building2, MapPin, Megaphone, Phone, User } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProspectStatusBadge } from "@/components/shared/status-badge";
import { LEAD_SOURCE_LABEL } from "@/constants/app";

import { AddFollowUpDialog } from "./add-follow-up-dialog";
import { FollowUpTimeline } from "./follow-up-timeline";
import { PaymentList } from "./payment-list";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { SetGreenButton } from "./set-green-button";
import type { getProspectDetailAction } from "../actions/crm-query.actions";

interface ProspectDetailProps {
  data: Awaited<ReturnType<typeof getProspectDetailAction>>;
  canAddFollowUp: boolean;
  canSetGreen: boolean;
  canRecordPayment: boolean;
}

export function ProspectDetail({ data, canAddFollowUp, canSetGreen, canRecordPayment }: ProspectDetailProps) {
  const { prospect, followUps, payments } = data;
  if (!prospect) return null;

  const canShowGreenAction = canSetGreen && (prospect.status === "red" || prospect.status === "yellow");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>{prospect.customer_name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{prospect.sales?.full_name} · {prospect.branch?.name}</p>
            </div>
            <ProspectStatusBadge status={prospect.status} />
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" /> {prospect.phone}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" /> {prospect.house_type}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" /> {prospect.city}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Megaphone className="h-4 w-4 text-muted-foreground" /> {LEAD_SOURCE_LABEL[prospect.lead_source]}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              Dibuat {format(new Date(prospect.created_at), "dd MMM yyyy", { locale: idLocale })}
            </div>
            {prospect.notes && <p className="sm:col-span-2 text-sm text-muted-foreground">{prospect.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Timeline</CardTitle>
            {canAddFollowUp && prospect.status !== "closing" && <AddFollowUpDialog prospectId={prospect.id} />}
          </CardHeader>
          <CardContent>
            <FollowUpTimeline createdAt={prospect.created_at} followUps={followUps} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {canShowGreenAction && (
          <Card>
            <CardContent className="p-4">
              <SetGreenButton prospectId={prospect.id} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Pembayaran</CardTitle>
            {canRecordPayment && <RecordPaymentDialog prospectId={prospect.id} />}
          </CardHeader>
          <CardContent>
            <PaymentList payments={payments} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
