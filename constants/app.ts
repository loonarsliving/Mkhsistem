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

/** VAPID public key for Web Push subscriptions (lib/push/web-push.ts). Not a secret -- shipped to every browser as part of the subscribe flow, same as the private key's counterpart is embedded server-side in app/api/push/send/route.ts. */
export const VAPID_PUBLIC_KEY = "BNU8k6eYs1cva3cgNaxw7_3LuVDLSOJwWm3_KDB3Ix_Ql5S1rkSY-DDaDozFK1MKL9PGrgVQ9TPvRWmVz2HlsDs";

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
  REGISTRATION: "registration",
  CRM: "crm",
  KPI_TASK: "kpi_task",
  HR: "hr",
  FINANCE: "finance",
  PROJECT: "project",
  APPROVAL: "approval",
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const NOTIFICATION_STATUS = {
  UNREAD: "unread",
  READ: "read",
  ARCHIVED: "archived",
} as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS];

/** Human labels for mkc_notifications.category, grouped the same way the RBAC audit's module list is — used by the Notification Center's filter chips and detail view. */
export const NOTIFICATION_CATEGORY_LABEL: Record<string, string> = {
  attendance_reminder: "Pengingat Absensi",
  late_attendance: "Terlambat",
  forgot_checkout: "Lupa Check-out",
  leave_approved: "Izin/Sakit Disetujui",
  leave_rejected: "Izin/Sakit Ditolak",
  payroll_available: "Payroll Tersedia",
  new_prospect: "Prospect Baru",
  follow_up_reminder: "Pengingat Follow Up",
  new_assignment: "Penugasan Baru",
  closing_approved: "Closing Disetujui",
  customer_verification: "Verifikasi Pelanggan",
  target_reminder: "Pengingat Target Sales",
  markom_new_task: "Task Baru",
  task_revision: "Task Perlu Revisi",
  task_approved: "Task Disetujui",
  weekly_reminder: "Pengingat Mingguan",
  project_progress: "Update Progress Proyek",
  material_request: "Permintaan Material",
  inspection_reminder: "Pengingat Inspeksi",
  payment_received: "Pembayaran Diterima",
  invoice_due: "Invoice Jatuh Tempo",
  reimbursement_approved: "Reimbursement Disetujui",
  waiting_approval: "Menunggu Persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  new_announcement: "Pengumuman Baru",
  new_memo: "Memo Baru",
  maintenance: "Pemeliharaan Sistem",
  version_update: "Update Versi",
  emergency_notice: "Pemberitahuan Darurat",
  salary_transfer_request: "Permintaan Transfer Gaji",
  salary_transferred: "Gaji Ditransfer",
};

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

export const KPI_TASK_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  REJECTED: "rejected",
} as const;
export type KpiTaskStatus = (typeof KPI_TASK_STATUS)[keyof typeof KPI_TASK_STATUS];

export const KPI_TASK_STATUS_LABEL: Record<KpiTaskStatus, string> = {
  pending: "Pending",
  completed: "Selesai",
  rejected: "Ditolak",
};

export const PROJECT_TYPE = {
  COMMERCIAL: "commercial",
  SUBSIDIZED: "subsidized",
  VILLA: "villa",
  LAND: "land",
} as const;
export type ProjectType = (typeof PROJECT_TYPE)[keyof typeof PROJECT_TYPE];

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  commercial: "Komersial",
  subsidized: "Subsidi",
  villa: "Villa",
  land: "Kavling/Tanah",
};

export const PROJECT_STATUS = {
  PLANNING: "planning",
  SELLING: "selling",
  COMPLETED: "completed",
} as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Perencanaan",
  selling: "Penjualan",
  completed: "Selesai",
};

/**
 * What a project actually sells -- independent from PROJECT_TYPE (asset
 * category). Added after a real incident: a project literally named
 * "Property management" had no way to signal it wasn't a villa-for-sale
 * listing, so the AI ads pipeline drafted "Investasi Villa Produktif...
 * Miliki villa..." for it purely because projectType happened to be
 * "villa" (see lib/ai/domains/markom.ts's researchAndDraftAd, migration
 * 0145). Drives both ad copy framing and Meta geo-targeting.
 */
export const OFFERING_TYPE = {
  SALE: "sale",
  RENTAL_STAY: "rental_stay",
  MANAGEMENT_SERVICE: "management_service",
} as const;
export type OfferingType = (typeof OFFERING_TYPE)[keyof typeof OFFERING_TYPE];

export const OFFERING_TYPE_LABEL: Record<OfferingType, string> = {
  sale: "Jual unit/villa",
  rental_stay: "Sewa menginap (booking tamu)",
  management_service: "Jasa manajemen properti (untuk pemilik)",
};

export const STORAGE_BUCKETS = {
  AVATARS: "avatars",
  ATTENDANCE_SELFIES: "attendance-selfies",
  MEMO_ATTACHMENTS: "memo-attachments",
  ANNOUNCEMENT_ATTACHMENTS: "announcement-attachments",
  COMPANY_ASSETS: "company-assets",
  LEAVE_ATTACHMENTS: "leave-attachments",
  SITEPLAN_IMAGES: "siteplan-images",
  PROJECT_PHOTOS: "project-photos",
} as const;

/** loonars_units.status -- see supabase/migrations/0202_siteplan_native_feature.sql. */
export const SITEPLAN_UNIT_STATUS = {
  TERSEDIA: "tersedia",
  DP: "dp",
  VERIFIKASI: "verifikasi",
  TERJUAL: "terjual",
} as const;
export type SiteplanUnitStatus = (typeof SITEPLAN_UNIT_STATUS)[keyof typeof SITEPLAN_UNIT_STATUS];

export const SITEPLAN_UNIT_STATUS_LABEL: Record<SiteplanUnitStatus, string> = {
  tersedia: "Tersedia",
  dp: "DP",
  verifikasi: "Menunggu Verifikasi",
  terjual: "Terjual",
};

/** loonars_unit_purchases.transaction_type. */
export const SITEPLAN_TRANSACTION_TYPE = {
  BOOKING: "booking",
  DP: "dp",
  AKAD: "akad",
} as const;
export type SiteplanTransactionType = (typeof SITEPLAN_TRANSACTION_TYPE)[keyof typeof SITEPLAN_TRANSACTION_TYPE];

export const SITEPLAN_TRANSACTION_TYPE_LABEL: Record<SiteplanTransactionType, string> = {
  booking: "Booking Fee",
  dp: "Down Payment",
  akad: "Akad / Lunas",
};

/** loonars_unit_purchases.payment_method -- new field, not present in the original loonars-sales app. */
export const SITEPLAN_PAYMENT_METHOD = {
  CASH: "cash",
  KPR: "kpr",
  BOTH: "both",
} as const;
export type SiteplanPaymentMethod = (typeof SITEPLAN_PAYMENT_METHOD)[keyof typeof SITEPLAN_PAYMENT_METHOD];

export const SITEPLAN_PAYMENT_METHOD_LABEL: Record<SiteplanPaymentMethod, string> = {
  cash: "Cash",
  kpr: "KPR",
  both: "Cash + KPR",
};

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * The "Management Property" branch (code MP), seeded once when the branch
 * was created. Kos occupancy visibility is scoped to this branch's own
 * Kepala Cabang specifically -- not the Kepala Cabang role in general, since
 * every branch head shares that same role -- so getCurrentSession() compares
 * against this fixed id instead of a role_permissions grant.
 */
export const MANAGEMENT_PROPERTY_BRANCH_ID = "4d61f863-3358-4068-b80e-9770e882820e";

/**
 * The Jogja branch (code JOG). Right now Jogja is the only branch with a
 * Markom employee, so the owner wants the whole Markom page group visible
 * only to Markom + Jogja's own Kepala Cabang + Super Admin -- not every
 * branch head. See getCurrentSession() in lib/rbac/session.ts.
 */
export const JOGJA_BRANCH_ID = "fdeb7f3a-e211-4e6d-a2a6-35162378e3ae";

/**
 * The Kendari branch (code KDI). Construction project finance (dana proyek
 * pembangunan -- gaji tukang / pembelian material) is currently a
 * Kendari-only feature, gated the same way as JOGJA_BRANCH_ID above: every
 * branch shares the "Kepala Cabang" role, so getCurrentSession() strips the
 * permission back out for any Kepala Cabang whose branch isn't Kendari.
 */
export const KENDARI_BRANCH_ID = "61a95bc6-23b0-408d-8439-f821251c56d4";

/**
 * The Makassar branch. Owner's explicit call: the native Siteplan viewer
 * (0202/0203) is currently a Makassar-only project -- every branch shares
 * the "Kepala Cabang" and "Sales" roles, so getCurrentSession() strips
 * siteplan.view back out for any Kepala Cabang/Sales employee whose branch
 * isn't Makassar. Super Admin and the Direktur roles keep it everywhere.
 */
export const MAKASSAR_BRANCH_ID = "40cdf547-d9cb-4d59-aba3-265a2ba04da8";
