import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  ATTENDANCE_STATUS_LABEL,
  KPI_TASK_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  PROSPECT_STATUS_LABEL,
  SITEPLAN_UNIT_STATUS_LABEL,
  type AttendanceStatus,
  type EmploymentStatus,
  type KpiTaskStatus,
  type LeaveStatusType,
  type MemoPriority,
  type PaymentStatus,
  type ProjectStatus,
  type ProspectStatus,
  type SiteplanUnitStatus,
} from "@/constants/app";

const ATTENDANCE_VARIANT: Record<AttendanceStatus, BadgeProps["variant"]> = {
  hadir: "success",
  terlambat: "warning",
  izin: "secondary",
  sakit: "secondary",
  alpha: "destructive",
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return <Badge variant={ATTENDANCE_VARIANT[status]}>{ATTENDANCE_STATUS_LABEL[status]}</Badge>;
}

const EMPLOYMENT_VARIANT: Record<EmploymentStatus, BadgeProps["variant"]> = {
  active: "success",
  inactive: "secondary",
  on_leave: "warning",
  terminated: "destructive",
};
const EMPLOYMENT_LABEL: Record<EmploymentStatus, string> = {
  active: "Aktif",
  inactive: "Tidak Aktif",
  on_leave: "Cuti",
  terminated: "Berhenti",
};

export function EmploymentStatusBadge({ status }: { status: EmploymentStatus }) {
  return <Badge variant={EMPLOYMENT_VARIANT[status]}>{EMPLOYMENT_LABEL[status]}</Badge>;
}

const LEAVE_VARIANT: Record<LeaveStatusType, BadgeProps["variant"]> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};
const LEAVE_LABEL: Record<LeaveStatusType, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export function LeaveStatusBadge({ status }: { status: LeaveStatusType }) {
  return <Badge variant={LEAVE_VARIANT[status]}>{LEAVE_LABEL[status]}</Badge>;
}

const PRIORITY_VARIANT: Record<MemoPriority, BadgeProps["variant"]> = {
  low: "secondary",
  normal: "outline",
  high: "warning",
  urgent: "destructive",
};
const PRIORITY_LABEL: Record<MemoPriority, string> = {
  low: "Rendah",
  normal: "Normal",
  high: "Tinggi",
  urgent: "Mendesak",
};

export function PriorityBadge({ priority }: { priority: MemoPriority }) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

const PROSPECT_VARIANT: Record<ProspectStatus, BadgeProps["variant"]> = {
  red: "destructive",
  yellow: "warning",
  green: "success",
  closing: "default",
  inactive: "secondary",
};

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  return <Badge variant={PROSPECT_VARIANT[status]}>{PROSPECT_STATUS_LABEL[status]}</Badge>;
}

const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, BadgeProps["variant"]> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={PAYMENT_STATUS_VARIANT[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

const PROJECT_STATUS_VARIANT: Record<ProjectStatus, BadgeProps["variant"]> = {
  planning: "secondary",
  selling: "success",
  completed: "default",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={PROJECT_STATUS_VARIANT[status]}>{PROJECT_STATUS_LABEL[status]}</Badge>;
}

const KPI_TASK_STATUS_VARIANT: Record<KpiTaskStatus, BadgeProps["variant"]> = {
  pending: "warning",
  completed: "success",
  rejected: "destructive",
};

export function KpiTaskStatusBadge({ status }: { status: KpiTaskStatus }) {
  return <Badge variant={KPI_TASK_STATUS_VARIANT[status]}>{KPI_TASK_STATUS_LABEL[status]}</Badge>;
}

/** tersedia=green, dp=blue(ish primary), verifikasi=amber, terjual=red -- same four-state palette used for the siteplan viewer's hotspot markers (see siteplan-viewer.tsx's SITEPLAN_MARKER_VARIANT). */
const SITEPLAN_UNIT_STATUS_VARIANT: Record<SiteplanUnitStatus, BadgeProps["variant"]> = {
  tersedia: "success",
  dp: "default",
  verifikasi: "warning",
  terjual: "destructive",
};

export function SiteplanUnitStatusBadge({ status }: { status: SiteplanUnitStatus }) {
  return <Badge variant={SITEPLAN_UNIT_STATUS_VARIANT[status]}>{SITEPLAN_UNIT_STATUS_LABEL[status]}</Badge>;
}
