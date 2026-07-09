export const APP_NAME = "MK Connect";
export const APP_TAGLINE = "Internal Communication & Attendance System";
export const COMPANY_NAME = "PT Maha Karya Haluoleo";

export const ATTENDANCE_STATUS = {
  HADIR: "hadir",
  TERLAMBAT: "terlambat",
  IZIN: "izin",
  SAKIT: "sakit",
  ALPHA: "alpha",
} as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  hadir: "Hadir",
  terlambat: "Terlambat",
  izin: "Izin",
  sakit: "Sakit",
  alpha: "Alpha",
};

export const LEAVE_TYPE = {
  IZIN: "izin",
  SAKIT: "sakit",
} as const;
export type LeaveType = (typeof LEAVE_TYPE)[keyof typeof LEAVE_TYPE];

export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type LeaveStatusType = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS];

export const EMPLOYMENT_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  ON_LEAVE: "on_leave",
  TERMINATED: "terminated",
} as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[keyof typeof EMPLOYMENT_STATUS];

export const MEMO_PRIORITY = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
} as const;
export type MemoPriority = (typeof MEMO_PRIORITY)[keyof typeof MEMO_PRIORITY];

export const TARGET_TYPE = {
  ALL_BRANCH: "all_branch",
  BRANCH: "branch",
  ALL_DIVISION: "all_division",
  DIVISION: "division",
  POSITION: "position",
  USER: "user",
} as const;
export type TargetType = (typeof TARGET_TYPE)[keyof typeof TARGET_TYPE];

export const NOTIFICATION_TYPE = {
  MEMO: "memo",
  ANNOUNCEMENT: "announcement",
  ATTENDANCE: "attendance",
  LEAVE_REQUEST: "leave_request",
  SYSTEM: "system",
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const STORAGE_BUCKETS = {
  AVATARS: "avatars",
  ATTENDANCE_SELFIES: "attendance-selfies",
  MEMO_ATTACHMENTS: "memo-attachments",
  ANNOUNCEMENT_ATTACHMENTS: "announcement-attachments",
  COMPANY_ASSETS: "company-assets",
  LEAVE_ATTACHMENTS: "leave-attachments",
} as const;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
