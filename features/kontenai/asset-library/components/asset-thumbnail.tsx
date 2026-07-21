import { cn } from "@/lib/utils";
import type { AssetType } from "@/features/kontenai/types";

import { ASSET_TYPE_COLOR, ASSET_TYPE_ICON } from "./asset-type-icon";

interface AssetThumbnailProps {
  type: AssetType;
  className?: string;
  iconClassName?: string;
}

/**
 * Placeholder thumbnail -- there is no real file storage/upload yet, so
 * every asset renders as a colored box with an icon matching its type
 * instead of an actual preview image.
 */
export function AssetThumbnail({ type, className, iconClassName }: AssetThumbnailProps) {
  const Icon = ASSET_TYPE_ICON[type];
  return (
    <div className={cn("flex items-center justify-center rounded-md", ASSET_TYPE_COLOR[type], className)}>
      <Icon className={cn("h-8 w-8", iconClassName)} />
    </div>
  );
}
