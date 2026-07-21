import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { AssetSelectorWorkspace } from "@/features/kontenai/asset-selector/components/asset-selector-workspace";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Asset Selector" };

export default async function AssetSelectorPage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

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
