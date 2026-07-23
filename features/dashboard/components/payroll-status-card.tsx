import { Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * MK Connect has no payroll module yet (no payroll table, no payroll RPC).
 * Rather than repurpose CRM commission data to fake a "Payroll Status"
 * figure -- which would both misrepresent payroll and violate "no CRM
 * statistics on the Executive Dashboard" -- this is an honest placeholder
 * until a real payroll module exists.
 */
export function PayrollStatusCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" /> Payroll Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Modul payroll belum tersedia di MK Connect.</p>
      </CardContent>
    </Card>
  );
}
