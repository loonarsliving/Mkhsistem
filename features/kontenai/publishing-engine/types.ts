import { PUBLISH_PLATFORMS, PUBLISH_PLATFORM_LABELS, type PublishPlatform } from "@/lib/publishing/platform-types";

export interface PublishPlatformOption {
  value: PublishPlatform;
  label: string;
}

export const PLATFORM_OPTIONS: PublishPlatformOption[] = PUBLISH_PLATFORMS.map((value) => ({ value, label: PUBLISH_PLATFORM_LABELS[value] }));

export function platformLabel(value: string): string {
  return PUBLISH_PLATFORM_LABELS[value as PublishPlatform] ?? value;
}

export const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-muted-foreground" },
  scheduled: { label: "Scheduled", className: "text-blue-600" },
  published: { label: "Published", className: "text-emerald-600" },
  failed: { label: "Failed", className: "text-destructive" },
};
