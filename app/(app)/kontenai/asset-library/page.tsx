import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { AssetLibraryBoard } from "@/features/kontenai/asset-library/components/asset-library-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Asset Library" };

export default async function AssetLibraryPage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

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
