import { ASSET_TYPE_COLOR, ASSET_TYPE_ICON } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import { cn } from "@/lib/utils";
import type { KontenAiAssetType } from "@/repositories/kontenai-assets.repository";

interface AssetThumbnailProps {
  assetType: KontenAiAssetType;
  publicUrl: string;
  title: string;
  className?: string;
}

export function AssetThumbnail({ assetType, publicUrl, title, className }: AssetThumbnailProps) {
  if (assetType === "image" || assetType === "logo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not an app asset
      <img src={publicUrl} alt={title} className={cn("h-full w-full object-cover", className)} loading="lazy" />
    );
  }

  if (assetType === "video") {
    return <video src={publicUrl} className={cn("h-full w-full object-cover", className)} muted preload="metadata" />;
  }

  const Icon = ASSET_TYPE_ICON[assetType];
  return (
    <div className={cn("flex h-full w-full items-center justify-center", ASSET_TYPE_COLOR[assetType], className)}>
      <Icon className="h-8 w-8" />
    </div>
  );
}
