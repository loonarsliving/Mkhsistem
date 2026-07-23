import Link from "next/link";
import { ClipboardCheck, UserCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PendingApprovalsCardProps {
  registrationCount?: number;
  financeVerificationCount: number;
}

export function PendingApprovalsCard({ registrationCount, financeVerificationCount }: PendingApprovalsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pending Approvals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {registrationCount !== undefined && (
          <Link
            href="/registrations"
            className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm transition-colors hover:border-primary"
          >
            <span className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-warning" /> Pending Registration
            </span>
            <span className="font-semibold tabular-nums">{registrationCount}</span>
          </Link>
        )}
        <Link
          href="/crm/finance"
          className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm transition-colors hover:border-primary"
        >
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-warning" /> Pending Finance Verification
          </span>
          <span className="font-semibold tabular-nums">{financeVerificationCount}</span>
        </Link>
      </CardContent>
    </Card>
  );
}
