import { Building2, Network, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { getInitials } from "@/lib/utils";
import type { EmployeeDirectoryRow } from "@/types/domain";

export function ProfileSummaryCard({ employee }: { employee: EmployeeDirectoryRow }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <Avatar className="h-16 w-16">
          <AvatarImage src={employee.avatar_url ?? undefined} alt={employee.full_name} />
          <AvatarFallback className="text-lg">{getInitials(employee.full_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <p className="text-lg font-semibold">{employee.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {employee.employee_code} · {employee.role_name}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> {employee.branch_name}
            </span>
            {employee.division_name && (
              <span className="flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5" /> {employee.division_name}
              </span>
            )}
            {employee.position_name && (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> {employee.position_name}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
