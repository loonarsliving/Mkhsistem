import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck,
  LayoutDashboard,
  Megaphone,
  Network,
  ReceiptText,
  Settings,
  ShieldCheck,
  StickyNote,
  Target,
  UserCheck,
  Users,
  UsersRound,
} from "lucide-react";

import { PERMISSIONS, type PermissionKey } from "@/constants/rbac";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown if the user has ANY of these permissions. A single key is shorthand for a one-item array. */
  permission?: PermissionKey | PermissionKey[];
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
    label: "CRM",
    items: [
      {
        label: "Prospect",
        href: "/crm",
        icon: UsersRound,
        permission: [PERMISSIONS.PROSPECT_VIEW_OWN, PERMISSIONS.PROSPECT_VIEW_BRANCH, PERMISSIONS.PROSPECT_VIEW_ALL],
      },
      { label: "Verifikasi Pembayaran", href: "/crm/finance", icon: ReceiptText, permission: PERMISSIONS.PROSPECT_FINANCE_VERIFY },
      { label: "Target Sales", href: "/crm/targets", icon: Target, permission: PERMISSIONS.SALES_TARGET_MANAGE },
      {
        label: "Analitik CRM",
        href: "/crm/analytics",
        icon: BarChart3,
        permission: [PERMISSIONS.CRM_ANALYTICS_VIEW_BRANCH, PERMISSIONS.CRM_ANALYTICS_VIEW_ALL],
      },
    ],
  },
  {
    label: "Manajemen",
    items: [
      { label: "Karyawan", href: "/employees", icon: Users, permission: PERMISSIONS.EMPLOYEE_VIEW_BRANCH },
      { label: "Pending Registration", href: "/registrations", icon: UserCheck, permission: PERMISSIONS.REGISTRATION_MANAGE },
      { label: "Cabang", href: "/branches", icon: Building2, permission: PERMISSIONS.BRANCH_MANAGE },
      { label: "Divisi", href: "/divisions", icon: Network, permission: PERMISSIONS.DIVISION_MANAGE },
      { label: "Jabatan", href: "/positions", icon: ShieldCheck, permission: PERMISSIONS.POSITION_MANAGE },
    ],
  },
  {
    label: "Sistem",
    items: [
      { label: "Pengaturan", href: "/settings", icon: Settings, permission: PERMISSIONS.SETTINGS_MANAGE },
      { label: "Monitoring", href: "/monitoring", icon: Activity, permission: PERMISSIONS.SYSTEM_MONITORING_VIEW },
    ],
  },
];
