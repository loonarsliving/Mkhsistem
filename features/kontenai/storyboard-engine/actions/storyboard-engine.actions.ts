"use server";

import type { ProductionDirective, SceneTransition, Storyboard, StoryboardScene } from "@/features/kontenai/types";

/**
 * Sprint 4 - Storyboard Engine.
 *
 * AI Director (Sprint 3) is being built in parallel, so this module works
 * against a local, in-memory seed of `ProductionDirective`s shaped exactly
 * like the shared contract. Once Sprint 3 lands, `listDirectivesAction`
 * only needs its body swapped for a real fetch -- callers already consume
 * the shared type, so nothing downstream should need to change.
 */

const MOCK_DIRECTIVES: ProductionDirective[] = [
  {
    id: "dir-001",
    contentBriefId: "brief-101",
    narrativeAngle: "Before/after transformasi kamar kos yang baru direnovasi",
    keyMessages: [
      "Renovasi selesai dalam 2 minggu",
      "Harga sewa tetap terjangkau setelah renovasi",
      "Unit siap huni akhir bulan ini",
    ],
    visualStyle: "Cinematic, warm golden-hour lighting, slow pan",
    recommendedAssetTags: ["kos-renovasi", "before-after", "interior"],
    callToAction: "DM untuk jadwal survei unit",
    targetPlatform: "instagram",
    createdAt: "2026-07-14T02:00:00.000Z",
  },
  {
    id: "dir-002",
    contentBriefId: "brief-102",
    narrativeAngle: "Testimoni penghuni kos soal kenyamanan dan keamanan",
    keyMessages: [
      "Keamanan 24 jam dengan CCTV di tiap lantai",
      "Komunitas penghuni yang ramah dan aktif",
      "Lokasi 5 menit ke kampus",
    ],
    visualStyle: "Handheld, natural light, gaya dokumenter",
    recommendedAssetTags: ["testimoni", "keamanan", "komunitas"],
    callToAction: "Booking sekarang, unit terbatas",
    targetPlatform: "tiktok",
    createdAt: "2026-07-15T04:30:00.000Z",
  },
  {
    id: "dir-003",
    contentBriefId: "brief-103",
    narrativeAngle: "Edukasi tips memilih kos untuk mahasiswa baru",
    keyMessages: [
      "Cek lokasi dan akses transportasi",
      "Perhatikan fasilitas dan kebersihan kamar mandi",
      "Bandingkan harga sewa dengan fasilitas yang didapat",
    ],
    visualStyle: "Terang, flat lay, teks overlay besar bergaya meme",
    recommendedAssetTags: ["tips", "edukasi", "mahasiswa-baru"],
    callToAction: "Simpan post ini buat referensi",
    targetPlatform: "tiktok",
    createdAt: "2026-07-16T09:15:00.000Z",
  },
  {
    id: "dir-004",
    contentBriefId: "brief-104",
    narrativeAngle: "Promo diskon sewa tahunan Villa Cariu",
    keyMessages: [
      "Diskon 15% untuk sewa 12 bulan",
      "Private pool di setiap unit",
      "Free maintenance bulanan selama masa sewa",
    ],
    visualStyle: "Luxury, drone shot, color grade sinematik",
    recommendedAssetTags: ["villa", "promo", "private-pool", "drone"],
    callToAction: "Hubungi sales untuk penawaran khusus",
    targetPlatform: "instagram",
    createdAt: "2026-07-17T01:45:00.000Z",
  },
  {
    id: "dir-005",
    contentBriefId: "brief-105",
    narrativeAngle: "Behind the scenes proses onboarding tenant baru",
    keyMessages: [
      "Proses akad cepat dan transparan",
      "Tim support siap membantu 7 hari seminggu",
      "Serah terima unit terdokumentasi lengkap",
    ],
    visualStyle: "Vlog style, casual, subtitle tebal",
    recommendedAssetTags: ["onboarding", "proses-sewa", "tim-support"],
    callToAction: "Follow untuk update proses lainnya",
    targetPlatform: "tiktok",
    createdAt: "2026-07-18T06:20:00.000Z",
  },
  {
    id: "dir-006",
    contentBriefId: "brief-106",
    narrativeAngle: "Highlight fasilitas gym dan co-working space",
    keyMessages: [
      "Akses gym 24 jam tanpa biaya tambahan",
      "Co-working space dengan wifi cepat",
      "Cocok untuk WFH dan remote worker",
    ],
    visualStyle: "Modern, high-contrast, cut cepat mengikuti musik",
    recommendedAssetTags: ["fasilitas", "gym", "coworking-space"],
    callToAction: "Booking tur fasilitas gratis",
    targetPlatform: "instagram",
    createdAt: "2026-07-19T08:10:00.000Z",
  },
  {
    id: "dir-007",
    contentBriefId: "brief-107",
    narrativeAngle: "Perbandingan sewa kos vs kontrakan untuk karyawan baru",
    keyMessages: [
      "Kos lebih fleksibel tanpa kontrak jangka panjang",
      "Sudah termasuk listrik dan air",
      "Dekat dengan pusat bisnis kota",
    ],
    visualStyle: "Split-screen comparison, overlay infografis",
    recommendedAssetTags: ["perbandingan", "edukasi", "karyawan-baru"],
    callToAction: "Cek unit tersedia di link bio",
    targetPlatform: "tiktok",
    createdAt: "2026-07-20T03:50:00.000Z",
  },
];

export async function listDirectivesAction(): Promise<ProductionDirective[]> {
  return MOCK_DIRECTIVES;
}

const TRANSITIONS_CYCLE: SceneTransition[] = ["fade", "slide", "zoom"];

/** Small deterministic string hash so re-generating the same directive gives stable-but-varied durations. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}

function buildScenes(directive: ProductionDirective): StoryboardScene[] {
  const scenes: StoryboardScene[] = [];
  let order = 0;

  const pushScene = (params: {
    description: string;
    textOverlay: string | null;
    transition: SceneTransition;
    tags: string[];
    seedKey: string;
    baseDuration: number;
  }) => {
    const variance = hashString(`${directive.id}-${params.seedKey}`) % 3; // 0, 1, or 2 extra seconds
    scenes.push({
      id: `${directive.id}-scene-${order + 1}`,
      order,
      description: params.description,
      durationSeconds: params.baseDuration + variance,
      transition: params.transition,
      textOverlay: params.textOverlay,
      requiredAssetTags: params.tags,
      selectedAssetId: null,
    });
    order += 1;
  };

  // Opening hook scene, grounded in the directive's narrative angle.
  pushScene({
    description: `Hook pembuka: ${directive.narrativeAngle}, langsung menarik perhatian dalam 3 detik pertama.`,
    textOverlay: truncate(directive.narrativeAngle, 60),
    transition: "cut",
    tags: [...directive.recommendedAssetTags.slice(0, 2), directive.targetPlatform],
    seedKey: "hook",
    baseDuration: 3,
  });

  // One scene per key message, cycling transitions so the sequence doesn't feel repetitive.
  directive.keyMessages.forEach((message, index) => {
    pushScene({
      description: `Menampilkan poin: "${message}" dengan visual bergaya ${directive.visualStyle.toLowerCase()}.`,
      textOverlay: truncate(message, 70),
      transition: TRANSITIONS_CYCLE[index % TRANSITIONS_CYCLE.length],
      tags: [directive.recommendedAssetTags[index % directive.recommendedAssetTags.length]],
      seedKey: `message-${index}`,
      baseDuration: 4,
    });
  });

  // Closing CTA scene.
  pushScene({
    description: `Penutup dengan ajakan bertindak: ${directive.callToAction}.`,
    textOverlay: truncate(directive.callToAction, 60),
    transition: "fade",
    tags: [directive.recommendedAssetTags[directive.recommendedAssetTags.length - 1], "cta"],
    seedKey: "cta",
    baseDuration: 3,
  });

  return scenes;
}

export async function generateStoryboardAction(directiveId: string): Promise<Storyboard> {
  const directive = MOCK_DIRECTIVES.find((d) => d.id === directiveId);
  if (!directive) {
    throw new Error(`Directive ${directiveId} tidak ditemukan`);
  }

  // Simulate AI generation latency.
  const delayMs = 800 + (hashString(directiveId) % 700);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const scenes = buildScenes(directive);
  const totalDurationSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  return {
    id: `storyboard-${directiveId}-${Date.now()}`,
    directiveId,
    scenes,
    totalDurationSeconds,
    createdAt: new Date().toISOString(),
  };
}
