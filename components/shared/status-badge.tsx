import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus, type EmploymentStatus, type LeaveStatusType, type MemoPriority } from "@/constants/app";

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
