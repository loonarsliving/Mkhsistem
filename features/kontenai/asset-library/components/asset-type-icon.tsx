import { FileImage, FileVideo, FileAudio, ShapesIcon, LayoutTemplate, type LucideIcon } from "lucide-react";

import type { AssetType } from "@/features/kontenai/types";

export const ASSET_TYPE_ICON: Record<AssetType, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  logo: ShapesIcon,
  template: LayoutTemplate,
};

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  image: "Gambar",
  video: "Video",
  audio: "Audio",
  logo: "Logo",
  template: "Template",
};

/** Tailwind token classes per asset type -- background + icon color for the thumbnail placeholder. */
export const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  image: "bg-primary/10 text-primary",
  video: "bg-accent text-accent-foreground",
  audio: "bg-warning/10 text-warning",
  logo: "bg-secondary text-secondary-foreground",
  template: "bg-success/10 text-success",
};
