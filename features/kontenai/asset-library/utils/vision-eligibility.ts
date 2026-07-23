import type { KontenAiAssetType } from "@/repositories/kontenai-assets.repository";

/** Only image and video get Gemini Vision -- audio/logo/brand_guideline/font/template/document are out of scope for this sprint. Plain (non-server-action) module so both server actions and client components can import it. */
export const VISION_ELIGIBLE_TYPES: KontenAiAssetType[] = ["image", "video"];

export function isVisionEligibleAssetType(assetType: KontenAiAssetType): boolean {
  return VISION_ELIGIBLE_TYPES.includes(assetType);
}
