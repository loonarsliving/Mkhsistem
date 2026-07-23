import Link from "next/link";
import { CalendarPlus, FilePlus2, Megaphone, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS, type PermissionKey } from "@/constants/rbac";
import { cn } from "@/lib/utils";

const ACTIONS = [
  {
    label: "Ajukan Izin/Sakit",
    href: "/attendance/history?action=leave",
    icon: CalendarPlus,
    permission: [PERMISSIONS.ATTENDANCE_VIEW_OWN, PERMISSIONS.ATTENDANCE_VIEW_BRANCH, PERMISSIONS.ATTENDANCE_VIEW_ALL],
  },
  { label: "Buat Memo", href: "/memo/new", icon: FilePlus2, permission: [PERMISSIONS.MEMO_CREATE] },
  { label: "Buat Pengumuman", href: "/announcements/new", icon: Megaphone, permission: [PERMISSIONS.ANNOUNCEMENT_CREATE] },
  {
    label: "Data Karyawan",
    href: "/employees",
    icon: Users,
    permission: [PERMISSIONS.EMPLOYEE_VIEW_BRANCH, PERMISSIONS.EMPLOYEE_VIEW_ALL],
  },
] as const;

export function QuickActions({ permissions }: { permissions: PermissionKey[] }) {
  const actions = ACTIONS.filter((a) => a.permission.some((key) => permissions.includes(key)));
  if (actions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aksi Cepat</CardTitle>
      </CardHeader>
      <CardContent className={cn("grid gap-3", actions.length > 2 ? "grid-cols-2" : "grid-cols-1")}>
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5"
          >
            <action.icon className="h-5 w-5 text-primary" />
            {action.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
