import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AssetLibraryBoard } from "@/features/kontenai/asset-library/components/asset-library-board";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Asset Library" };

/**
 * Video keyframe extraction + multiple sequential Gemini Vision calls
 * (Analyze / Analyze Again on video assets) can take well past the
 * Next.js/Vercel default Node function timeout -- 60s is safe across every
 * Vercel plan tier (Hobby included) and generous enough for the small
 * (<=8 frame) batches this sprint extracts. Server actions inherit their
 * calling route's maxDuration, so this covers the vision actions too.
 */
export const maxDuration = 60;

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
