import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarCheck,
  LayoutDashboard,
  Megaphone,
  Network,
  Settings,
  ShieldCheck,
  StickyNote,
  Users,
} from "lucide-react";

import { PERMISSIONS, type PermissionKey } from "@/constants/rbac";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: PermissionKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Utama",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Absensi", href: "/attendance", icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_VIEW_OWN },
      { label: "Memo", href: "/memo", icon: StickyNote, permission: PERMISSIONS.MEMO_VIEW },
      { label: "Pengumuman", href: "/announcements", icon: Megaphone, permission: PERMISSIONS.ANNOUNCEMENT_VIEW },
    ],
  },
  {
    label: "Manajemen",
    items: [
      { label: "Karyawan", href: "/employees", icon: Users, permission: PERMISSIONS.EMPLOYEE_VIEW_BRANCH },
      { label: "Cabang", href: "/branches", icon: Building2, permission: PERMISSIONS.BRANCH_MANAGE },
      { label: "Divisi", href: "/divisions", icon: Network, permission: PERMISSIONS.DIVISION_MANAGE },
      { label: "Jabatan", href: "/positions", icon: ShieldCheck, permission: PERMISSIONS.POSITION_MANAGE },
    ],
  },
  {
    label: "Sistem",
    items: [{ label: "Pengaturan", href: "/settings", icon: Settings, permission: PERMISSIONS.SETTINGS_MANAGE }],
  },
];
