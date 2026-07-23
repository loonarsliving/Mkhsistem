import type { ComponentType } from "react";
import { FileImage, FileVideo, Music, Layers, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AssetType } from "@/features/kontenai/types";

const TYPE_ICON: Record<AssetType, ComponentType<{ className?: string }>> = {
  image: FileImage,
  video: FileVideo,
  audio: Music,
  logo: ImageIcon,
  template: Layers,
};

const TYPE_LABEL: Record<AssetType, string> = {
  image: "Gambar",
  video: "Video",
  audio: "Audio",
  logo: "Logo",
  template: "Template",
};

export function AssetTypeBadge({ type }: { type: AssetType }) {
  const Icon = TYPE_ICON[type];
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon className="h-3 w-3" />
      {TYPE_LABEL[type]}
    </Badge>
  );
}
