/**
 * Plain (non server-only) platform constants -- kept separate from
 * platform-adapters.ts (which is "server-only" since it touches real
 * credential-check functions) so client components can import the
 * platform list/labels without pulling in server-only code.
 */
export type PublishPlatform = "instagram" | "facebook" | "tiktok" | "youtube_shorts";

export const PUBLISH_PLATFORMS: PublishPlatform[] = ["instagram", "facebook", "tiktok", "youtube_shorts"];

export const PUBLISH_PLATFORM_LABELS: Record<PublishPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
};
