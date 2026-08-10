import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Banknote,
  BarChart3,
  BedDouble,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  Clapperboard,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileWarning,
  Flower2,
  FolderKanban,
  HardHat,
  Images,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Megaphone,
  MessageCircle,
  Network,
  PieChart,
  Radar,
  ReceiptText,
  Rocket,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Target,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

import { PERMISSIONS, type PermissionKey } from "@/constants/rbac";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown if the user has ANY of these permissions. A single key is shorthand for a one-item array. */
  permission?: PermissionKey | PermissionKey[];
  /** Renders as a plain external <a target="_blank"> instead of an internal Next <Link>. */
  external?: boolean;
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
      // Directly under Dashboard on purpose: the dashboard says what the
      // numbers are, FRIDAY says what they mean. Reading them in that order is
      // the intended habit.
      { label: "FRIDAY", href: "/friday", icon: Radar, permission: PERMISSIONS.FRIDAY_VIEW },
      // The group view sits next to the company view, not inside it: reading
      // "how is the holding doing" and "how is this company doing" are
      // different questions asked by the same person on different days.
      { label: "Holding Group", href: "/friday/holding", icon: Building2, permission: PERMISSIONS.HOLDING_VIEW },
      {
        label: "Ruang Kerja Asisten",
        href: "/asisten",
        icon: ClipboardList,
        permission: PERMISSIONS.ASSISTANT_WORKSPACE_VIEW,
      },
      {
        label: "Absensi",
        href: "/attendance",
        icon: CalendarCheck,
        permission: [PERMISSIONS.ATTENDANCE_VIEW_OWN, PERMISSIONS.ATTENDANCE_VIEW_BRANCH, PERMISSIONS.ATTENDANCE_VIEW_ALL],
      },
      { label: "Memo", href: "/memo", icon: StickyNote, permission: PERMISSIONS.MEMO_VIEW },
      { label: "Pengumuman", href: "/announcements", icon: Megaphone, permission: PERMISSIONS.ANNOUNCEMENT_VIEW },
    ],
  },
  {
    label: "CRM",
    items: [
      {
        label: "Dashboard CRM",
        href: "/crm/dashboard",
        icon: PieChart,
        permission: [PERMISSIONS.CRM_ANALYTICS_VIEW_BRANCH, PERMISSIONS.CRM_ANALYTICS_VIEW_ALL],
      },
      {
        label: "Daftar Prospect",
        href: "/crm",
        icon: UsersRound,
        permission: [PERMISSIONS.PROSPECT_VIEW_OWN, PERMISSIONS.PROSPECT_VIEW_BRANCH, PERMISSIONS.PROSPECT_VIEW_ALL],
      },
      {
        label: "Database Pelanggan",
        href: "/crm/customers",
        icon: Database,
        permission: [PERMISSIONS.CRM_ANALYTICS_VIEW_BRANCH, PERMISSIONS.CRM_ANALYTICS_VIEW_ALL],
      },
      { label: "Verifikasi Pembayaran", href: "/crm/finance", icon: ReceiptText, permission: PERMISSIONS.PROSPECT_FINANCE_VERIFY },
      { label: "Target Sales", href: "/crm/targets", icon: Target, permission: PERMISSIONS.SALES_TARGET_MANAGE },
      { label: "SP1 Sales", href: "/crm/warnings", icon: FileWarning, permission: PERMISSIONS.SP1_WARNING_MANAGE },
      { label: "Project Master", href: "/crm/projects", icon: FolderKanban, permission: PERMISSIONS.CRM_PROJECT_MANAGE },
      {
        label: "Analitik CRM",
        href: "/crm/analytics",
        icon: BarChart3,
        permission: [PERMISSIONS.CRM_ANALYTICS_VIEW_BRANCH, PERMISSIONS.CRM_ANALYTICS_VIEW_ALL],
      },
      {
        label: "Siteplan Loonars Villa",
        href: "/api/sso/loonars-sales",
        icon: MapPinned,
        permission: PERMISSIONS.LOONARS_SALES_VIEW,
        external: true,
      },
    ],
  },
  {
    label: "Markom",
    items: [
      {
        label: "Checklist",
        href: "/markom",
        icon: ListChecks,
        permission: [PERMISSIONS.KPI_TASK_VIEW_OWN, PERMISSIONS.KPI_TASK_VIEW_BRANCH, PERMISSIONS.KPI_TASK_VIEW_ALL],
      },
      { label: "Assign Task", href: "/markom/assign", icon: ClipboardCheck, permission: PERMISSIONS.KPI_TASK_ASSIGN },
      {
        label: "Ranking Markom",
        href: "/markom/ranking",
        icon: Trophy,
        permission: [PERMISSIONS.KPI_TASK_VIEW_BRANCH, PERMISSIONS.KPI_TASK_VIEW_ALL],
      },
      { label: "Foto Project", href: "/markom/photos", icon: Images, permission: PERMISSIONS.CRM_PROJECT_PHOTO_MANAGE },
      { label: "Content Studio", href: "/markom/content-studio", icon: Clapperboard, permission: PERMISSIONS.CONTENT_SUBMISSION_MANAGE },
      { label: "Ads Specialist", href: "/markom/ads", icon: Rocket, permission: PERMISSIONS.AD_CAMPAIGN_VIEW },
      { label: "Content Planner", href: "/markom/content-planner", icon: Sparkles, permission: PERMISSIONS.CONTENT_PLANNER_VIEW },
      { label: "KontenAI", href: "/kontenai", icon: BrainCircuit, permission: PERMISSIONS.CONTENT_PLANNER_VIEW },
      { label: "Content Audit", href: "/markom/content-audit", icon: BarChart3, permission: PERMISSIONS.CONTENT_PLANNER_VIEW },
      { label: "Promo Broadcast", href: "/markom/promo-broadcast", icon: Megaphone, permission: PERMISSIONS.PROMO_TEMPLATE_VIEW },
    ],
  },
  {
    label: "Loonars Beauty",
    items: [
      {
        label: "Konten",
        href: "/loonars-beauty",
        icon: Flower2,
        permission: [PERMISSIONS.LOONARS_BEAUTY_VIEW, PERMISSIONS.LOONARS_BEAUTY_MANAGE],
      },
      {
        label: "Order",
        href: "/loonars-beauty/orders",
        icon: ShoppingBag,
        permission: [PERMISSIONS.LOONARS_BEAUTY_VIEW, PERMISSIONS.LOONARS_BEAUTY_MANAGE],
      },
      {
        label: "Performa Konten",
        href: "/loonars-beauty/performance",
        icon: TrendingUp,
        permission: [PERMISSIONS.LOONARS_BEAUTY_VIEW, PERMISSIONS.LOONARS_BEAUTY_MANAGE],
      },
      {
        label: "Evaluasi Mingguan",
        href: "/loonars-beauty/evaluation",
        icon: Sparkles,
        permission: [PERMISSIONS.LOONARS_BEAUTY_VIEW, PERMISSIONS.LOONARS_BEAUTY_MANAGE],
      },
    ],
  },
  {
    label: "Manajemen",
    items: [
      {
        label: "Ruang Kerja HR",
        href: "/hr",
        icon: BriefcaseBusiness,
        permission: PERMISSIONS.HR_WORKSPACE_VIEW,
      },
      {
        label: "Disiplin & Pemberhentian",
        href: "/hr/discipline",
        icon: ShieldAlert,
        permission: PERMISSIONS.HR_DISCIPLINE_VIEW,
      },
      {
        label: "Karyawan",
        href: "/employees",
        icon: Users,
        permission: [PERMISSIONS.EMPLOYEE_VIEW_BRANCH, PERMISSIONS.EMPLOYEE_VIEW_ALL],
      },
      { label: "Pending Registration", href: "/registrations", icon: UserCheck, permission: PERMISSIONS.REGISTRATION_MANAGE },
      { label: "Cabang", href: "/branches", icon: Building2, permission: PERMISSIONS.BRANCH_MANAGE },
      { label: "Divisi", href: "/divisions", icon: Network, permission: PERMISSIONS.DIVISION_MANAGE },
      { label: "Jabatan", href: "/positions", icon: ShieldCheck, permission: PERMISSIONS.POSITION_MANAGE },
      {
        label: "Payroll & HR Expense",
        href: "/hr/finance-sync",
        icon: Wallet,
        permission: [PERMISSIONS.PAYROLL_MANAGE, PERMISSIONS.HR_EXPENSE_CREATE, PERMISSIONS.HR_EXPENSE_APPROVE],
      },
      {
        label: "Input Gaji Karyawan",
        href: "/hr/salary",
        icon: Banknote,
        permission: [PERMISSIONS.SALARY_INPUT_SUBMIT, PERMISSIONS.SALARY_INPUT_TRANSFER],
      },
      {
        label: "Keuangan Proyek Kendari",
        href: "/construction-finance",
        icon: HardHat,
        permission: [PERMISSIONS.CONSTRUCTION_FINANCE_VIEW_OWN, PERMISSIONS.CONSTRUCTION_FINANCE_MANAGE],
      },
      {
        label: "Approval WA",
        href: "/approval",
        icon: ClipboardCheck,
        permission: [PERMISSIONS.APPROVAL_REQUEST_VIEW_OWN, PERMISSIONS.APPROVAL_REQUEST_MANAGE],
      },
      { label: "Okupansi Kos", href: "/kos-occupancy", icon: BedDouble, permission: PERMISSIONS.KOS_OCCUPANCY_VIEW },
    ],
  },
  {
    label: "Sistem",
    items: [
      { label: "Pengaturan", href: "/settings", icon: Settings, permission: PERMISSIONS.SETTINGS_MANAGE },
      { label: "Monitoring", href: "/monitoring", icon: Activity, permission: PERMISSIONS.SYSTEM_MONITORING_VIEW },
      { label: "Kirim Pesan WA", href: "/messaging", icon: MessageCircle, permission: PERMISSIONS.MESSAGING_SEND },
      { label: "Modul AI", href: "/ai", icon: BrainCircuit, permission: PERMISSIONS.AI_MODULE_MANAGE },
    ],
  },
];
