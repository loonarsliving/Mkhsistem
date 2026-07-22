import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { GeminiVisionQueue } from "@/features/kontenai/gemini-vision/components/gemini-vision-queue";
import { listAssetsForAnalysisAction } from "@/features/kontenai/gemini-vision/actions/gemini-vision.actions";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Gemini Vision" };

export default async function GeminiVisionPage() {
  await requireKontenAiAccess();

  const assets = await listAssetsForAnalysisAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gemini Vision"
        description="Analisis otomatis aset visual (Sprint 2 KontenAI): deskripsi, objek terdeteksi, warna dominan, skor kualitas, dan rekomendasi penggunaan untuk tiap aset di Asset Library."
      />
      <GeminiVisionQueue initialAssets={assets} />
    </div>
  );
}
