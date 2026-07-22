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
        description="Cocokkan storyboard dari Storyboard Engine dengan aset terbaik di pustaka aset, per scene, berdasarkan kecocokan tag."
      />
      <AssetSelectorWorkspace />
    </div>
  );
}
