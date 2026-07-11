export const APP_NAME = "MK Connect";
export const APP_TAGLINE = "Internal Communication & Attendance System";
export const COMPANY_NAME = "PT Maha Karya Haluoleo";
/**
 * Canonical production origin, no trailing slash. Falls back to the real
 * custom domain (not a *.vercel.app alias) so metadata/manifest/robots/
 * sitemap and auth redirect URLs are correct even if the Vercel project's
 * own NEXT_PUBLIC_APP_URL env var is ever unset or stale.
 */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://mkh.haluoleo.id").replace(/\/$/, "");

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
  CRM: "crm",
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const PROSPECT_STATUS = {
  RED: "red",
  YELLOW: "yellow",
  GREEN: "green",
  CLOSING: "closing",
  INACTIVE: "inactive",
} as const;
export type ProspectStatus = (typeof PROSPECT_STATUS)[keyof typeof PROSPECT_STATUS];

export const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  red: "Baru",
  yellow: "Follow Up",
  green: "Menunggu Verifikasi",
  closing: "Closing",
  inactive: "Tidak Aktif",
};

export const LEAD_SOURCE = {
  FACEBOOK_ADS: "facebook_ads",
  INSTAGRAM: "instagram",
  TIKTOK: "tiktok",
  WALK_IN: "walk_in",
  REFERRAL: "referral",
  WHATSAPP: "whatsapp",
  MARKETPLACE: "marketplace",
  OTHER: "other",
} as const;
export type LeadSource = (typeof LEAD_SOURCE)[keyof typeof LEAD_SOURCE];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  facebook_ads: "Facebook Ads",
  instagram: "Instagram",
  tiktok: "TikTok",
  walk_in: "Walk In",
  referral: "Referral",
  whatsapp: "WhatsApp",
  marketplace: "Marketplace",
  other: "Lainnya",
};

export const FOLLOW_UP_ACTIVITY_TYPE = {
  PHONE_CALL: "phone_call",
  WHATSAPP: "whatsapp",
  MEETING: "meeting",
  SURVEY: "survey",
  VIDEO_CALL: "video_call",
  SITE_VISIT: "site_visit",
  NEGOTIATION: "negotiation",
} as const;
export type FollowUpActivityType = (typeof FOLLOW_UP_ACTIVITY_TYPE)[keyof typeof FOLLOW_UP_ACTIVITY_TYPE];

export const FOLLOW_UP_ACTIVITY_TYPE_LABEL: Record<FollowUpActivityType, string> = {
  phone_call: "Telepon",
  whatsapp: "WhatsApp",
  meeting: "Meeting",
  survey: "Survey",
  video_call: "Video Call",
  site_visit: "Kunjungan Lokasi",
  negotiation: "Negosiasi",
};

export const PAYMENT_TYPE = {
  BOOKING_FEE: "booking_fee",
  DP: "dp",
  INSTALLMENT: "installment",
  BANK_DISBURSEMENT: "bank_disbursement",
} as const;
export type PaymentType = (typeof PAYMENT_TYPE)[keyof typeof PAYMENT_TYPE];

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  booking_fee: "Booking Fee",
  dp: "DP",
  installment: "Cicilan",
  bank_disbursement: "Pencairan Bank",
};

export const PAYMENT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

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
