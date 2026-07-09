import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { EmploymentStatusBadge } from "@/components/shared/status-badge";
import type { EmploymentStatus } from "@/constants/app";
import { getInitials } from "@/lib/utils";
import type { EmployeeDirectoryRow } from "@/types/domain";

export function EmployeeReadonlyView({ employee }: { employee: EmployeeDirectoryRow }) {
  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={employee.avatar_url ?? undefined} alt={employee.full_name} />
            <AvatarFallback className="text-lg">{getInitials(employee.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold">{employee.full_name}</p>
            <p className="text-sm text-muted-foreground">{employee.employee_code}</p>
            <EmploymentStatusBadge status={employee.employment_status as EmploymentStatus} />
          </div>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Field label="Email" value={employee.email} />
          <Field label="Nomor HP" value={employee.phone ?? "-"} />
          <Field label="Cabang" value={employee.branch_name} />
          <Field label="Divisi" value={employee.division_name ?? "-"} />
          <Field label="Jabatan" value={employee.position_name ?? "-"} />
          <Field label="Role" value={employee.role_name} />
          <Field label="Bergabung Sejak" value={employee.join_date} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
