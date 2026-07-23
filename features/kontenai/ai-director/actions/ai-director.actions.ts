"use server";

/**
 * Sprint 3 - AI Director actions.
 *
 * Reads Content Planner briefs (enriched with the latest Content Audit
 * insight) from the shared `getMockDb()` store and turns them into a
 * `ProductionDirective`. There is still no real Supabase read of
 * Content Planner (kpi_tasks) / Content Audit tables and no real LLM
 * call here -- per the explicit project-owner decision for this build
 * phase -- but the logic now genuinely varies per brand
 * (`ContentFocus`) and per audit insight instead of being generic
 * boilerplate, and the generated directive is persisted into the
 * shared mock database so downstream sprints (Storyboard Engine,
 * Production Pipeline) see the same object.
 *
 * A later phase should replace the body of `generateDirectiveAction`
 * with a real call to an LLM (e.g. Gemini) fed the matching
 * `ContentBrief`, and replace `listContentBriefsAction` with a
 * repository read that joins kpi_tasks with the latest Content Audit
 * weekly evaluation for that branch/division.
 */

import type { ContentBrief, ContentFocus, ProductionDirective, TargetPlatform } from "@/features/kontenai/types";
import { getMockDb } from "@/features/kontenai/lib/mock-db";
import { BRAND_TONE_GUIDANCE } from "@/features/kontenai/lib/brands";
import { generateId } from "@/features/kontenai/lib/ids";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sprint 3 input: Content Planner brief + latest Content Audit insight, combined. */
export async function listContentBriefsAction(): Promise<ContentBrief[]> {
  await delay(300);
  return getMockDb().contentBriefs;
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

/** Words too generic to be useful as content-specific asset tags. */
const KEYWORD_STOPWORDS = new Set([
  "yang", "dengan", "untuk", "dari", "dan", "atau", "ke", "di", "para", "akan",
  "agar", "adalah", "sebagai", "pada", "ini", "itu", "the", "and", "for", "with",
  "dorong", "tunjukkan", "informasikan", "ajak", "kumpulkan", "gunakan",
]);

/**
 * Very lightweight keyword extraction (no real NLP): pulls the most
 * "distinctive" words out of the brief's title/description so different
 * briefs -- even within the same contentFocus -- surface different
 * content-specific asset tags instead of only the generic brand tag.
 */
function extractKeywordTags(brief: ContentBrief, count: number): string[] {
  const text = `${brief.title} ${brief.description ?? ""}`.toLowerCase();
  const words = text
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !KEYWORD_STOPWORDS.has(word));

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    tags.push(word);
    if (tags.length >= count) break;
  }
  return tags;
}

/** Maps a ContentFocus to the implied brand tag used across the asset library. */
function brandTagFor(contentFocus: ContentFocus): string {
  return contentFocus;
}

/**
 * Sprint 3 core action: turns a ContentBrief into a ProductionDirective.
 *
 * PLACEHOLDER: this assembles a plausible directive from templates keyed
 * by contentFocus, shaped by the brand's tone guidance, and nudged by
 * the brief's auditInsight (when present), rather than calling a real
 * LLM. Replace this body with a Gemini/LLM call once that integration
 * is wired up -- the function signature and return shape
 * (ProductionDirective) should stay the same so downstream Sprint 4
 * (Storyboard Engine) and Sprint 7 (Production Pipeline) are unaffected.
 *
 * Contract: throws a plain `Error` with a clear message when
 * `contentBriefId` does not resolve to a brief in the shared mock
 * database -- callers (e.g. Production Pipeline) should treat this
 * action as capable of rejecting and handle it accordingly.
 */
export async function generateDirectiveAction(contentBriefId: string): Promise<ProductionDirective> {
  const db = getMockDb();
  const brief = db.contentBriefs.find((b) => b.id === contentBriefId);
  if (!brief) {
    throw new Error(`Content brief ${contentBriefId} tidak ditemukan`);
  }

  // Simulate AI reasoning latency.
  await delay(800 + Math.floor(Math.random() * 700));

  const template = FOCUS_TEMPLATES[brief.contentFocus];
  const toneGuidance = BRAND_TONE_GUIDANCE[brief.contentFocus];
  const seed = hashSeed(brief.id + brief.title);

  const narrativeAngle = `${pick(template.angleOptions, seed)} (${toneGuidance})`;
  const visualStyle = `${pick(template.visualStyleOptions, seed + 1)} -- ${toneGuidance}`;
  let callToAction = pick(template.ctaOptions, seed + 2);

  const keyMessages = [
    template.messageOptions[seed % template.messageOptions.length],
    template.messageOptions[(seed + 1) % template.messageOptions.length],
    template.messageOptions[(seed + 2) % template.messageOptions.length],
  ];

  // Brand tag first, then 2-3 content-specific keyword tags pulled from
  // the brief's own title/description, plus a couple of template-driven
  // tags so the storyboard/asset-selection stages still have familiar
  // categories to match against.
  const assetTags = [
    brandTagFor(brief.contentFocus),
    ...extractKeywordTags(brief, 3),
    template.assetTagOptions[seed % template.assetTagOptions.length],
    template.assetTagOptions[(seed + 1) % template.assetTagOptions.length],
  ];

  // Nudge the directive using the Content Audit insight when available,
  // mirroring how a real AI Director would prioritize what has (or
  // hasn't) worked recently for this brief's focus area.
  if (brief.auditInsight) {
    const { growthSignal, scores, recommendations } = brief.auditInsight;

    if (growthSignal === "below_benchmark") {
      keyMessages.unshift("Perbaiki titik lemah minggu lalu: " + (recommendations[0] ?? "tingkatkan engagement di 3 detik pertama"));
      callToAction = "Buka dengan pertanyaan yang mengundang komentar, lalu tutup dengan tegas: " + callToAction;
    } else if (growthSignal === "excellent") {
      keyMessages.unshift("Pertahankan formula pemenang minggu lalu (skor keseluruhan " + scores.overall.toFixed(1) + "/10) -- " + (recommendations[0] ?? "jangan ubah format yang sudah terbukti"));
    } else if (growthSignal === "on_track") {
      keyMessages.unshift((recommendations[0] ?? "Tingkatkan konsistensi format yang sudah on track") + " (skor keseluruhan " + scores.overall.toFixed(1) + "/10)");
    }

    if (scores.cta < 6) {
      callToAction = callToAction + " (perjelas -- CTA minggu lalu lemah, skor " + scores.cta.toFixed(1) + "/10: " + (recommendations.find((r) => /cta|checkout|link|klik/i.test(r)) ?? recommendations[0] ?? "buat CTA lebih eksplisit") + ")";
    }
  }

  const directive: ProductionDirective = {
    id: generateId("directive"),
    contentBriefId: brief.id,
    narrativeAngle,
    keyMessages: Array.from(new Set(keyMessages)),
    visualStyle,
    recommendedAssetTags: Array.from(new Set(assetTags)),
    callToAction,
    targetPlatform: brief.targetPlatform as TargetPlatform,
    createdAt: new Date().toISOString(),
  };

  db.directives.push(directive);

  return directive;
}
