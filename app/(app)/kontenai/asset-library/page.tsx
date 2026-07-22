import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AssetLibraryBoard } from "@/features/kontenai/asset-library/components/asset-library-board";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Asset Library" };

export default async function AssetLibraryPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Library"
        description="Sumber tunggal seluruh aset marketing -- image, video, audio, logo, brand guideline, font, template, dan document -- yang akan digunakan oleh Gemini Vision, AI Director, Storyboard Engine, Asset Selector, Render Engine, Publishing Engine, Learning Engine, dan AI Optimization."
      />
      <AssetLibraryBoard />
    </div>
  );
}
