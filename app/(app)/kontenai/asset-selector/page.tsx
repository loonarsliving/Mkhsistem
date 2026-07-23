import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AssetSelectorWorkspace } from "@/features/kontenai/asset-selector/components/asset-selector-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Asset Selector" };

export default async function AssetSelectorPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Selector"
        description="Pilih storyboard dari Storyboard Engine, lalu AI otomatis mencocokkan aset terbaik dari Asset Library untuk setiap scene berdasarkan metadata Gemini Vision -- lengkap dengan skor kecocokan, 5 alternatif per scene, dan opsi ganti manual."
      />
      <AssetSelectorWorkspace />
    </div>
  );
}
