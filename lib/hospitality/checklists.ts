/**
 * Hospitality checklist definitions (Loonars Connect, migration 0291).
 *
 * The item KEYS must match public.mkc_hosp_checklist_items() in the
 * migration exactly -- the database is what validates a submission, this
 * file only labels it. tests/unit/lib/hospitality-checklists.test.ts parses
 * the migration and fails if the two drift apart.
 */

export const CHECKLIST_KINDS = [
  "cleaning",
  "fo_inspection",
  "security_shift_start",
  "security_late_checkin",
  "security_patrol",
  "security_shift_end",
] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

export const SECURITY_KINDS = ["security_shift_start", "security_late_checkin", "security_patrol", "security_shift_end"] as const;
export type SecurityKind = (typeof SECURITY_KINDS)[number];

export interface ChecklistItem {
  key: string;
  label: string;
}

export const CHECKLIST_ITEMS: Record<ChecklistKind, readonly ChecklistItem[]> = {
  cleaning: [
    { key: "sampah_dibuang", label: "Sampah dibuang" },
    { key: "linen_diganti", label: "Sprei & sarung bantal diganti" },
    { key: "kamar_mandi_dibersihkan", label: "Kamar mandi dibersihkan" },
    { key: "lantai_disapu_dipel", label: "Lantai disapu & dipel" },
    { key: "debu_permukaan", label: "Debu meja, lemari & permukaan dilap" },
    { key: "amenities_diisi", label: "Amenities diisi ulang" },
    { key: "handuk_diganti", label: "Handuk diganti" },
    { key: "kolam_dicek", label: "Kolam dicek & dibersihkan" },
    { key: "ac_lampu_dimatikan", label: "AC & lampu dimatikan saat selesai" },
  ],
  fo_inspection: [
    { key: "kebersihan_aroma", label: "Kebersihan & aroma kamar" },
    { key: "tempat_tidur_linen", label: "Tempat tidur & linen" },
    { key: "kamar_mandi_air_pembuangan", label: "Kamar mandi, air & pembuangan" },
    { key: "amenities_handuk", label: "Amenities & handuk lengkap" },
    { key: "ac_lampu_fasilitas", label: "AC, lampu & fasilitas berfungsi" },
    { key: "kolam_renang", label: "Kolam renang bersih" },
    { key: "pintu_kunci_keamanan", label: "Pintu, kunci & keamanan" },
  ],
  security_shift_start: [
    { key: "akses_gerbang", label: "Akses & gerbang" },
    { key: "cctv", label: "CCTV menyala & merekam" },
    { key: "lampu", label: "Lampu area menyala" },
    { key: "parkir_area_umum", label: "Parkir & area umum aman" },
    { key: "kunci_akses", label: "Kunci & kartu akses lengkap" },
    { key: "serah_terima_shift", label: "Serah terima dari shift sebelumnya diterima" },
  ],
  security_late_checkin: [
    { key: "reservasi_terverifikasi", label: "Reservasi terverifikasi di sistem villa" },
    { key: "kunci_akses_diserahkan", label: "Kunci / akses diserahkan" },
    { key: "tamu_diantar_ke_unit", label: "Tamu diantar ke unit" },
  ],
  security_patrol: [
    { key: "gerbang", label: "Gerbang" },
    { key: "area_parkir", label: "Area parkir" },
    { key: "area_umum", label: "Area umum" },
    { key: "perimeter", label: "Pagar / perimeter" },
    { key: "lampu_area", label: "Lampu area" },
  ],
  security_shift_end: [
    { key: "area_aman", label: "Semua area aman" },
    { key: "cctv", label: "CCTV normal" },
    { key: "kunci_akses", label: "Kunci & akses lengkap" },
    { key: "catatan_serah_terima", label: "Catatan serah terima ditulis" },
  ],
};

export const CHECKLIST_TITLES: Record<ChecklistKind, string> = {
  cleaning: "Checklist Kebersihan",
  fo_inspection: "Pemeriksaan Kamar FO",
  security_shift_start: "Cek Awal Shift",
  security_late_checkin: "Bantuan Check-in Malam",
  security_patrol: "Patroli",
  security_shift_end: "Serah Terima Akhir Shift",
};

export const EVIDENCE_SLOTS = ["bed", "bathroom", "main_room", "problem", "other"] as const;
export type EvidenceSlot = (typeof EVIDENCE_SLOTS)[number];

export const EVIDENCE_SLOT_LABELS: Record<EvidenceSlot, string> = {
  bed: "Tempat tidur",
  bathroom: "Kamar mandi",
  main_room: "Ruang utama",
  problem: "Foto masalah",
  other: "Lainnya",
};

export const FO_DECISIONS = ["ready", "needs_recleaning", "needs_maintenance"] as const;
export type FoDecision = (typeof FO_DECISIONS)[number];

export const FO_DECISION_LABELS: Record<FoDecision, string> = {
  ready: "Siap dijual",
  needs_recleaning: "Bersihkan ulang",
  needs_maintenance: "Perlu perbaikan",
};

export const MEMBER_ROLES = ["manager", "front_office", "cleaning", "security"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  manager: "Hospitality Manager",
  front_office: "Front Office",
  cleaning: "Cleaning",
  security: "Security",
};

export const ISSUE_CATEGORIES = ["room", "facility", "security", "guest_complaint", "cleaning", "other"] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
  room: "Kamar",
  facility: "Fasilitas",
  security: "Keamanan",
  guest_complaint: "Komplain tamu",
  cleaning: "Kebersihan",
  other: "Lainnya",
};

export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu dibersihkan",
  in_progress: "Sedang dibersihkan",
  awaiting_inspection: "Menunggu pemeriksaan FO",
  completed: "Selesai",
  blocked: "Terkendala",
  cancelled: "Dibatalkan",
};

export const ISSUE_STATUS_LABELS: Record<string, string> = {
  open: "Terbuka",
  in_progress: "Ditangani",
  resolved: "Selesai",
  cancelled: "Dibatalkan",
};

/** Which group roles may perform which action -- mirrors the role checks inside the 0291 RPCs (UI hint only; the database decides). */
export const ROLE_CAN = {
  startCleaning: ["cleaning", "manager"],
  submitCleaning: ["cleaning", "manager"],
  inspect: ["front_office", "manager"],
  assignTask: ["manager", "front_office"],
  blockTask: ["cleaning", "manager", "front_office"],
  security: ["security", "manager"],
  lateCheckin: ["security", "front_office", "manager"],
  assignIssue: ["manager", "front_office"],
  cancelIssue: ["manager"],
} as const satisfies Record<string, readonly MemberRole[]>;

export function roleCan(role: string | null | undefined, action: keyof typeof ROLE_CAN): boolean {
  return !!role && (ROLE_CAN[action] as readonly string[]).includes(role);
}
