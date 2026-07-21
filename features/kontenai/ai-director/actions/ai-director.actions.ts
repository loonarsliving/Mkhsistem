"use server";

/**
 * Sprint 3 - AI Director actions.
 *
 * PLACEHOLDER IMPLEMENTATION: these actions are fully mocked / in-memory.
 * There is no real Supabase read of Content Planner (kpi_tasks) or
 * Content Audit tables here, and no real LLM call -- per the explicit
 * project-owner decision for this build phase. `listContentBriefsAction`
 * returns a fixed, seeded `ContentBrief[]` and `generateDirectiveAction`
 * simulates "AI thinking" with a delay before returning a
 * template-assembled `ProductionDirective`.
 *
 * A later phase should replace the body of `generateDirectiveAction`
 * with a real call to an LLM (e.g. Gemini) fed the matching
 * `ContentBrief`, and replace `listContentBriefsAction` with a
 * repository read that joins kpi_tasks with the latest Content Audit
 * weekly evaluation for that branch/division.
 */

import type { ContentBrief, ContentFocus, ProductionDirective, TargetPlatform } from "@/features/kontenai/types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CONTENT_BRIEFS: ContentBrief[] = [
  {
    id: "brief-001",
    kpiTaskId: "kpi-task-4821",
    title: "Promo Akhir Pekan: Unit Studio Ready Stock",
    description: "Highlight 3 unit studio yang baru kosong di tower B, dorong booking survey lokasi sebelum akhir bulan.",
    contentFocus: "leasehold_sales",
    targetPlatform: "instagram",
    branchId: "branch-jogja-01",
    divisionId: "division-markom",
    dueDate: "2026-07-25",
    auditInsight: {
      narrative: "Konten leasehold minggu lalu kuat di hook tapi CTA masih lemah -- banyak like, sedikit klik ke WA.",
      scores: { hook: 8.2, value: 7.4, cta: 5.1, nicheFit: 7.8, engagementPotential: 7.6, platformOptimization: 6.9, overall: 7.2 },
      growthSignal: "on_track",
      recommendations: [
        "Perjelas CTA dengan satu langkah konkret (mis. \"chat WA sekarang\")",
        "Tambahkan urgensi -- stok terbatas / harga naik minggu depan",
      ],
    },
  },
  {
    id: "brief-002",
    kpiTaskId: "kpi-task-4822",
    title: "Testimoni Penghuni: Kenyamanan Kos Putri",
    description: "Kumpulkan kutipan penghuni tentang keamanan dan kebersihan untuk membangun kepercayaan calon penyewa baru.",
    contentFocus: "occupancy",
    targetPlatform: "tiktok",
    branchId: "branch-jogja-02",
    divisionId: "division-markom",
    dueDate: "2026-07-27",
    auditInsight: {
      narrative: "Konten occupancy bulan ini stagnan di engagement -- audiens menonton tapi jarang komentar atau share.",
      scores: { hook: 6.0, value: 6.8, cta: 4.5, nicheFit: 7.0, engagementPotential: 5.2, platformOptimization: 5.8, overall: 5.9 },
      growthSignal: "below_benchmark",
      recommendations: [
        "Gunakan wajah dan suara asli penghuni, bukan voice over generik",
        "Buka dengan pertanyaan yang memancing komentar di 3 detik pertama",
      ],
    },
  },
  {
    id: "brief-003",
    kpiTaskId: "kpi-task-4823",
    title: "Edukasi Rutin Perawatan Kulit Sebelum Tidur",
    description: "Konten edukasi ringan seputar skincare routine malam menggunakan produk andalan Loonars Beauty.",
    contentFocus: "beauty",
    targetPlatform: "instagram",
    branchId: "branch-jogja-01",
    divisionId: "division-loonars-beauty",
    dueDate: "2026-07-24",
    auditInsight: {
      narrative: "Seri edukasi skincare konsisten jadi performer terbaik bulan ini -- hook kuat dan share rate tinggi.",
      scores: { hook: 9.0, value: 8.6, cta: 7.2, nicheFit: 9.1, engagementPotential: 8.8, platformOptimization: 8.0, overall: 8.5 },
      growthSignal: "excellent",
      recommendations: [
        "Pertahankan format edukasi 3-langkah yang sudah terbukti",
        "Coba selipkan soft-sell produk di langkah terakhir",
      ],
    },
  },
  {
    id: "brief-004",
    kpiTaskId: "kpi-task-4824",
    title: "Pengumuman Jam Operasional Libur Nasional",
    description: "Informasikan perubahan jam operasional kantor cabang selama libur nasional mendatang.",
    contentFocus: "general",
    targetPlatform: "instagram",
    branchId: "branch-jogja-01",
    divisionId: "division-markom",
    dueDate: "2026-07-23",
    auditInsight: null,
  },
  {
    id: "brief-005",
    kpiTaskId: "kpi-task-4825",
    title: "Behind The Scenes: Renovasi Area Bersama Kos Putra",
    description: "Tunjukkan progres renovasi ruang bersama untuk membangun antisipasi calon penyewa dan penghuni lama.",
    contentFocus: "occupancy",
    targetPlatform: "instagram",
    branchId: "branch-jogja-03",
    divisionId: "division-markom",
    dueDate: "2026-07-29",
    auditInsight: null,
  },
  {
    id: "brief-006",
    kpiTaskId: "kpi-task-4826",
    title: "Flash Sale Sewa Tahunan -- Diskon DP",
    description: "Dorong konversi penyewa baru dengan promo diskon DP untuk kontrak sewa tahunan, berlaku 1 minggu.",
    contentFocus: "leasehold_sales",
    targetPlatform: "tiktok",
    branchId: "branch-jogja-02",
    divisionId: "division-markom",
    dueDate: "2026-07-22",
    auditInsight: {
      narrative: "Format promo diskon di TikTok minggu lalu unggul di value tapi platform optimization masih rendah (durasi kepanjangan).",
      scores: { hook: 7.5, value: 8.0, cta: 7.8, nicheFit: 7.2, engagementPotential: 7.0, platformOptimization: 4.8, overall: 6.9 },
      growthSignal: "on_track",
      recommendations: [
        "Pangkas durasi ke bawah 20 detik agar tidak drop-off",
        "Gunakan trending audio yang sesuai niche properti",
      ],
    },
  },
  {
    id: "brief-007",
    kpiTaskId: "kpi-task-4827",
    title: "Review Jujur: Produk Serum Vitamin C Loonars",
    description: "Format review jujur (pros/cons) untuk produk serum best seller guna menjawab keraguan calon pembeli.",
    contentFocus: "beauty",
    targetPlatform: "tiktok",
    branchId: "branch-jogja-01",
    divisionId: "division-loonars-beauty",
    dueDate: "2026-07-26",
    auditInsight: {
      narrative: "Format review jujur baru dicoba dua kali, hasilnya campur -- niche fit tinggi tapi CTA ke checkout masih bocor.",
      scores: { hook: 7.0, value: 7.5, cta: 5.5, nicheFit: 8.4, engagementPotential: 7.1, platformOptimization: 6.5, overall: 6.9 },
      growthSignal: "on_track",
      recommendations: [
        "Sematkan link/keranjang produk di bio dan sebutkan eksplisit di akhir video",
        "Tambahkan before/after singkat untuk memperkuat klaim",
      ],
    },
  },
  {
    id: "brief-008",
    kpiTaskId: "kpi-task-4828",
    title: "Ucapan Terima Kasih 100 Penyewa Aktif",
    description: "Momen pencapaian internal -- ucapan terima kasih ke komunitas penyewa sekaligus soft promo referral.",
    contentFocus: "general",
    targetPlatform: "tiktok",
    branchId: "branch-jogja-03",
    divisionId: "division-markom",
    dueDate: "2026-07-30",
    auditInsight: null,
  },
];

/** Sprint 3 input: Content Planner brief + latest Content Audit insight, combined. */
export async function listContentBriefsAction(): Promise<ContentBrief[]> {
  await delay(300);
  return CONTENT_BRIEFS;
}

interface DirectiveTemplate {
  angleOptions: string[];
  messageOptions: string[];
  visualStyleOptions: string[];
  assetTagOptions: string[];
  ctaOptions: string[];
}

const FOCUS_TEMPLATES: Record<ContentFocus, DirectiveTemplate> = {
  leasehold_sales: {
    angleOptions: [
      "Urgensi terbatas: unit/promo yang hilang jika calon penyewa menunda keputusan hari ini",
      "Bukti sosial: kepuasan penyewa terbaru sebagai alasan rasional untuk pindah sekarang",
      "Perbandingan nilai: apa yang didapat penyewa dibanding harga kos/sewa sekitar",
    ],
    messageOptions: [
      "Stok unit terbatas, harga masih di rate promo",
      "Lokasi strategis dekat kampus/perkantoran",
      "Proses booking cepat, cukup chat WA dan survey langsung",
      "Fasilitas lengkap tanpa biaya tersembunyi",
    ],
    visualStyleOptions: [
      "Visual cerah dan bersih dengan overlay teks bold berisi harga/promo",
      "Walkthrough sinematik unit dengan musik upbeat dan cut cepat",
      "Split-screen sebelum/sesudah untuk menonjolkan kondisi unit",
    ],
    assetTagOptions: ["unit-interior", "exterior-building", "promo-banner", "location-map", "testimoni-penyewa"],
    ctaOptions: [
      "Chat WA sekarang untuk booking survey -- link di bio",
      "DM \"SURVEY\" untuk jadwalkan kunjungan gratis",
      "Klik link di bio sebelum promo berakhir",
    ],
  },
  occupancy: {
    angleOptions: [
      "Kehidupan sehari-hari penghuni sebagai bukti kenyamanan dan keamanan",
      "Komunitas dan rasa memiliki -- kos bukan sekadar tempat tidur",
      "Transparansi fasilitas dan aturan agar calon penyewa merasa aman memutuskan",
    ],
    messageOptions: [
      "Keamanan 24 jam dan lingkungan yang terjaga",
      "Komunitas penghuni yang hangat dan suportif",
      "Fasilitas bersama terawat dan nyaman dipakai",
      "Testimoni jujur langsung dari penghuni saat ini",
    ],
    visualStyleOptions: [
      "Gaya dokumenter, natural light, wawancara singkat penghuni",
      "Montase suasana keseharian dengan voice over hangat",
      "POV penghuni menunjukkan area favorit di kos",
    ],
    assetTagOptions: ["common-area", "penghuni-testimoni", "keamanan-fasilitas", "kamar-interior", "suasana-malam"],
    ctaOptions: [
      "Follow untuk cerita penghuni lainnya minggu depan",
      "DM kami kalau mau tanya-tanya soal kamar kosong",
      "Simpan post ini kalau lagi cari kos yang aman & nyaman",
    ],
  },
  beauty: {
    angleOptions: [
      "Edukasi problem-solution: masalah kulit umum lalu solusi produk",
      "Rutinitas simpel yang bisa langsung ditiru penonton hari ini",
      "Honest review untuk menjawab keraguan sebelum checkout",
    ],
    messageOptions: [
      "Bahan aktif yang relevan untuk masalah kulit spesifik",
      "Rutinitas singkat, cocok untuk yang sibuk",
      "Hasil bertahap yang realistis, bukan janji instan",
      "Aman untuk pemakaian harian",
    ],
    visualStyleOptions: [
      "Close-up produk dan tekstur dengan pencahayaan lembut, palet warna pastel",
      "Before/after dengan transisi halus, tone hangat dan personal",
      "Talking-head santai ala teman cerita rutinitas skincare",
    ],
    assetTagOptions: ["produk-closeup", "before-after", "skincare-routine", "talking-head", "packaging-lifestyle"],
    ctaOptions: [
      "Cek link di bio buat checkout sebelum stok promo habis",
      "Komen \"ROUTINE\" buat dapat rangkuman langkah lengkapnya",
      "Save video ini buat rutinitas malam kamu nanti",
    ],
  },
  general: {
    angleOptions: [
      "Informasi jelas dan ramah agar audiens tahu langkah selanjutnya",
      "Nada apresiatif -- merayakan momen bersama komunitas/pelanggan",
      "Transparansi operasional agar audiens tidak kebingungan",
    ],
    messageOptions: [
      "Informasi disampaikan singkat dan mudah diingat",
      "Ajak audiens untuk turut merayakan atau berpartisipasi",
      "Pastikan detail penting (tanggal/jam/lokasi) terlihat jelas",
    ],
    visualStyleOptions: [
      "Desain grafis bersih dengan brand color dan tipografi besar",
      "Klip singkat suasana kantor/komunitas dengan musik ringan",
      "Kartu info statis dengan ikon sederhana untuk keterbacaan cepat",
    ],
    assetTagOptions: ["info-graphic", "brand-logo", "team-moment", "office-exterior"],
    ctaOptions: [
      "Simpan post ini sebagai pengingat",
      "Follow untuk update lainnya",
      "Tag teman yang perlu tahu info ini",
    ],
  },
};

function pick<T>(options: T[], seed: number): T {
  return options[seed % options.length];
}

/** Simple deterministic hash so the same brief always yields the same "AI" pick, but different briefs vary. */
function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Sprint 3 core action: turns a ContentBrief into a ProductionDirective.
 *
 * PLACEHOLDER: this assembles a plausible directive from templates keyed
 * by contentFocus and nudged by the brief's auditInsight (when present),
 * rather than calling a real LLM. Replace this body with a Gemini/LLM
 * call once that integration is wired up -- the function signature and
 * return shape (ProductionDirective) should stay the same so downstream
 * Sprint 4 (Storyboard Engine) is unaffected.
 */
export async function generateDirectiveAction(contentBriefId: string): Promise<ProductionDirective> {
  const brief = CONTENT_BRIEFS.find((b) => b.id === contentBriefId);
  if (!brief) {
    throw new Error(`Content brief ${contentBriefId} tidak ditemukan`);
  }

  // Simulate AI reasoning latency.
  await delay(800 + Math.floor(Math.random() * 700));

  const template = FOCUS_TEMPLATES[brief.contentFocus];
  const seed = hashSeed(brief.id + brief.title);

  const narrativeAngle = pick(template.angleOptions, seed);
  const visualStyle = pick(template.visualStyleOptions, seed + 1);
  let callToAction = pick(template.ctaOptions, seed + 2);

  const keyMessages = [
    template.messageOptions[seed % template.messageOptions.length],
    template.messageOptions[(seed + 1) % template.messageOptions.length],
    template.messageOptions[(seed + 2) % template.messageOptions.length],
  ];

  const assetTags = [
    template.assetTagOptions[seed % template.assetTagOptions.length],
    template.assetTagOptions[(seed + 1) % template.assetTagOptions.length],
    template.assetTagOptions[(seed + 2) % template.assetTagOptions.length],
  ];

  // Nudge the directive using the Content Audit insight when available,
  // mirroring how a real AI Director would prioritize what has (or
  // hasn't) worked recently for this brief's focus area.
  if (brief.auditInsight) {
    const { growthSignal, scores, recommendations } = brief.auditInsight;

    if (growthSignal === "below_benchmark") {
      keyMessages.unshift("Perbaiki titik lemah minggu lalu: " + (recommendations[0] ?? "tingkatkan engagement di 3 detik pertama"));
      callToAction = "Buka dengan pertanyaan yang mengundang komentar, lalu tutup: " + callToAction;
    } else if (growthSignal === "excellent") {
      keyMessages.unshift("Pertahankan formula pemenang minggu lalu (skor keseluruhan " + scores.overall.toFixed(1) + "/10)");
    } else if (scores.cta < 6) {
      callToAction = callToAction + " (perjelas -- CTA minggu lalu lemah, skor " + scores.cta.toFixed(1) + "/10)";
    }
  }

  const directive: ProductionDirective = {
    id: `directive-${brief.id}-${Date.now()}`,
    contentBriefId: brief.id,
    narrativeAngle,
    keyMessages: Array.from(new Set(keyMessages)),
    visualStyle,
    recommendedAssetTags: Array.from(new Set(assetTags)),
    callToAction,
    targetPlatform: brief.targetPlatform as TargetPlatform,
    createdAt: new Date().toISOString(),
  };

  return directive;
}
