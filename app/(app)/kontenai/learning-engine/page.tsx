import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { LearningEngineDashboard } from "@/features/kontenai/learning-engine/components/learning-engine-dashboard";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Learning Engine" };

export default async function LearningEnginePage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning Engine"
        description="Riwayat hasil produksi dan feedback Content Studio -- setiap production run yang selesai didistilasi menjadi skor akhir, verdict, dan catatan 'apa yang berhasil' / 'apa yang perlu diperbaiki' untuk KontenAI belajar dari waktu ke waktu."
      />
      <LearningEngineDashboard />
    </div>
  );
}
