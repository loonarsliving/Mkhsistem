import { FileAudio, FileImage, FileVideo, Shapes, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssetType } from "@/features/kontenai/types";

const TYPE_ICON: Record<AssetType, typeof FileImage> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  logo: Sparkles,
  template: Shapes,
};

interface AssetThumbnailProps {
  type: AssetType;
  className?: string;
}

/** Placeholder thumbnail box -- no real asset storage/CDN wired up yet, this is mocked UI only. */
export function AssetThumbnail({ type, className }: AssetThumbnailProps) {
  const Icon = TYPE_ICON[type];
  return (
    <div
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-6 w-6" />
    </div>
  );
}
