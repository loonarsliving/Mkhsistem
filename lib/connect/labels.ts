/**
 * Labels + allowed values for the Markom Jogja / Sales Jogja groups (0294).
 * Every list here mirrors a CHECK constraint or RPC rule in migration 0294;
 * the database stays the control, these only drive the forms.
 */

export type ConnectDepartmentKind = "hospitality" | "markom" | "sales" | "koordinasi" | "direct" | "wa_lead";

export function departmentKind(code: string): ConnectDepartmentKind {
  if (code.startsWith("markom_")) return "markom";
  if (code.startsWith("sales_")) return "sales";
  // cross-team group (0298): plain chat, no workflow / work panel / report
  if (code.startsWith("koordinasi_")) return "koordinasi";
  // direct 1-on-1 chats (0300): plain chat too
  if (code === "pesan_pribadi") return "direct";
  // WhatsApp ad leads (0303): one conversation per customer, answered on WhatsApp
  if (code.startsWith("lead_wa_")) return "wa_lead";
  return "hospitality";
}

/** Plain conversation: text + photos only, no work panel, quick reports or live report. */
export function isPlainChat(kind: ConnectDepartmentKind): boolean {
  return kind === "koordinasi" || kind === "direct" || kind === "wa_lead";
}

const ROLE_LABELS: Record<ConnectDepartmentKind, Record<string, string>> = {
  // member = derived from settings.member_of (0302: the Markom Jogja team)
  hospitality: { manager: "Hospitality Manager", front_office: "Front Office", cleaning: "Cleaning", security: "Security", member: "Markom" },
  markom: { markom: "Markom", room_approver: "Persetujuan kamar villa" },
  sales: { sales: "Sales", manager: "Kepala Cabang / Manager Sales" },
  koordinasi: { member: "Anggota" },
  direct: { member: "" },
  wa_lead: { sales: "Sales", manager: "Pemantau lead" },
};

export function memberRoleLabel(role: string | null | undefined, departmentCode: string): string {
  if (!role) return "";
  return ROLE_LABELS[departmentKind(departmentCode)][role] ?? role;
}

// ---- Markom: content calendar ----
export const CONTENT_PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "website", "other"] as const;
export const CONTENT_FORMATS = ["feed", "reels", "story", "carousel", "video", "live", "other"] as const;
export const CONTENT_TOPICS = ["villa", "loonars2", "kol", "brand", "promo", "other"] as const;
export const CONTENT_ACTIONS = ["start", "ready", "publish", "reschedule", "reassign", "cancel"] as const;
export type ContentAction = (typeof CONTENT_ACTIONS)[number];

export const CONTENT_PLATFORM_LABELS: Record<(typeof CONTENT_PLATFORMS)[number], string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  website: "Website",
  other: "Lainnya",
};
export const CONTENT_FORMAT_LABELS: Record<(typeof CONTENT_FORMATS)[number], string> = {
  feed: "Feed",
  reels: "Reels",
  story: "Story",
  carousel: "Carousel",
  video: "Video",
  live: "Live",
  other: "Lainnya",
};
export const CONTENT_TOPIC_LABELS: Record<(typeof CONTENT_TOPICS)[number], string> = {
  villa: "Villa Loonars",
  loonars2: "Loonars 2 (unit)",
  kol: "Konten KOL",
  brand: "Brand",
  promo: "Promo",
  other: "Lainnya",
};
export const CONTENT_STATUS_LABELS: Record<string, string> = {
  planned: "Direncanakan",
  in_production: "Produksi",
  ready: "Siap tayang",
  published: "Tayang",
  cancelled: "Dibatalkan",
};

// ---- Markom: KOL ----
export const KOL_PLATFORMS = ["instagram", "tiktok", "youtube", "other"] as const;
export const KOL_COMPENSATIONS = ["barter", "paid", "barter_paid"] as const;
export const KOL_DELIVERABLES = ["feed", "reels", "story", "tiktok", "tag_lokasi", "link_booking"] as const;
export type KolDeliverable = (typeof KOL_DELIVERABLES)[number];

export const KOL_COMPENSATION_LABELS: Record<(typeof KOL_COMPENSATIONS)[number], string> = {
  barter: "Barter (menginap gratis)",
  paid: "Berbayar",
  barter_paid: "Barter + fee",
};
export const KOL_DELIVERABLE_LABELS: Record<KolDeliverable, string> = {
  feed: "Post feed",
  reels: "Reels",
  story: "Story",
  tiktok: "Video TikTok",
  tag_lokasi: "Tag lokasi",
  link_booking: "Link booking loonars.id",
};
export const KOL_STATUS_LABELS: Record<string, string> = {
  requested: "Menunggu persetujuan kamar",
  approved: "Disetujui — kupon terbit",
  rejected: "Ditolak",
  booked: "Sudah booking",
  staying: "Sedang menginap",
  content_due: "Menunggu konten",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

// ---- Sales ----
export const VISIT_OUTCOMES = ["done", "no_show", "cancelled"] as const;
export const VISIT_OUTCOME_LABELS: Record<(typeof VISIT_OUTCOMES)[number], string> = {
  done: "Selesai",
  no_show: "Tidak datang",
  cancelled: "Dibatalkan",
};
export const VISIT_STATUS_LABELS: Record<string, string> = { scheduled: "Terjadwal", ...VISIT_OUTCOME_LABELS };
export const INTEREST_LEVELS = ["cold", "warm", "hot"] as const;
export const INTEREST_LABELS: Record<(typeof INTEREST_LEVELS)[number], string> = { cold: "Dingin", warm: "Hangat", hot: "Panas" };
export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending_verification: "Menunggu verifikasi Finance",
  verified: "Terverifikasi",
  rejected: "Ditolak Finance",
};
export const UNIT_STATUS_LABELS: Record<string, string> = {
  tersedia: "Tersedia",
  dp: "DP",
  verifikasi: "Verifikasi",
  terjual: "Terjual",
};
