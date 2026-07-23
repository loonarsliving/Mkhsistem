import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PublishingWorkspace } from "@/features/kontenai/publishing-engine/components/publishing-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Publishing Engine" };

export default async function PublishingEnginePage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publishing Engine"
        description="Pilih video hasil Render Engine, hasilkan caption & hashtag dengan AI Director, pilih platform tujuan, lalu tentukan jadwal publish-nya. Lihat semua jadwal di Content Calendar."
      />
      <PublishingWorkspace />
    </div>
  );
}
