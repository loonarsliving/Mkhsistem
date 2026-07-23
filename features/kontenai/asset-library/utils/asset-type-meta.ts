import {
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Ligature,
  LayoutTemplate,
  ShapesIcon,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

import type { KontenAiAssetType } from "@/repositories/kontenai-assets.repository";

export const ASSET_TYPE_OPTIONS: { value: KontenAiAssetType; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "logo", label: "Logo" },
  { value: "brand_guideline", label: "Brand Guideline" },
  { value: "font", label: "Font" },
  { value: "template", label: "Template" },
  { value: "document", label: "Document" },
];

export const ASSET_TYPE_ICON: Record<KontenAiAssetType, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  logo: ShapesIcon,
  brand_guideline: BookOpen,
  font: Ligature,
  template: LayoutTemplate,
  document: FileText,
};

export const ASSET_TYPE_LABEL: Record<KontenAiAssetType, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  logo: "Logo",
  brand_guideline: "Brand Guideline",
  font: "Font",
  template: "Template",
  document: "Document",
};

/** Tailwind token classes per asset type -- background + icon color for the thumbnail placeholder. */
export const ASSET_TYPE_COLOR: Record<KontenAiAssetType, string> = {
  image: "bg-primary/10 text-primary",
  video: "bg-accent text-accent-foreground",
  audio: "bg-warning/10 text-warning",
  logo: "bg-secondary text-secondary-foreground",
  brand_guideline: "bg-success/10 text-success",
  font: "bg-muted text-muted-foreground",
  template: "bg-success/10 text-success",
  document: "bg-destructive/10 text-destructive",
};

/** Accept attribute for the native file input, per selected category -- keeps the picker focused instead of "any file". */
export const ASSET_TYPE_ACCEPT: Record<KontenAiAssetType, string> = {
  image: "image/png,image/jpeg,image/webp,image/svg+xml,image/gif",
  video: "video/mp4,video/quicktime,video/webm",
  audio: "audio/mpeg,audio/wav,audio/mp4,audio/ogg",
  logo: "image/png,image/svg+xml,image/webp",
  brand_guideline: "application/pdf",
  font: ".ttf,.otf,.woff,.woff2",
  template: ".psd,.ai,.pptx,.fig,.sketch",
  document: "application/pdf,.doc,.docx,.xls,.xlsx",
};

export function guessAssetTypeFromMime(mimeType: string): KontenAiAssetType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";
  return "document";
}
