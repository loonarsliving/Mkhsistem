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
        description="Pusat penyimpanan dan penelusuran seluruh aset produksi -- foto, video, audio, logo, dan template -- yang akan dikonsumsi oleh Gemini Vision, Asset Selector, Storyboard Engine, dan Render Engine."
      />
      <AssetLibraryBoard />
    </div>
  );
}
