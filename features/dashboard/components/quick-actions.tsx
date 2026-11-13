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
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-background/40 p-4 text-center text-sm font-medium transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:bg-primary/5 hover:shadow-[0_18px_30px_-22px_hsl(var(--primary)/0.8)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
              <action.icon className="h-5 w-5 text-primary" />
            </span>
            {action.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
