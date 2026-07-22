import "server-only";

import { isInstagramConfigured } from "@/lib/social/instagram";
import { isTikTokConfigured } from "@/lib/social/tiktok-config";
import { PUBLISH_PLATFORM_LABELS, type PublishPlatform } from "@/lib/publishing/platform-types";

export { PUBLISH_PLATFORMS, PUBLISH_PLATFORM_LABELS, type PublishPlatform } from "@/lib/publishing/platform-types";

export interface PublishAdapterInput {
  videoUrl: string;
  caption: string;
  hashtags: string[];
}

export interface PublishAdapterResult {
  success: boolean;
  externalPostId?: string;
  externalPostUrl?: string;
  error?: string;
}

export interface PlatformAdapter {
  platform: PublishPlatform;
  /** Whether real API credentials for this platform exist in the environment -- not whether posting is actually wired up yet (see publish() below). */
  isConfigured(): boolean;
  publish(input: PublishAdapterInput): Promise<PublishAdapterResult>;
}

/**
 * Sprint 7 scope: "siapkan struktur integrasi API untuk setiap platform,
 * belum perlu implementasi penuh". Every adapter below reports real
 * credential presence where a client already exists elsewhere in the
 * codebase (Instagram: lib/social/instagram.ts's Graph API client, used by
 * Content Studio's publish worker; TikTok: lib/social/tiktok.ts's Business
 * API client), but none of them actually post yet -- Render Engine's
 * output is an explicitly-labeled draft (480p, silent placeholder audio,
 * no real Voice Over/BGM), so publishing it to a real account would be
 * premature regardless of credentials. A later sprint wires publish() to
 * the real per-platform flow (for Instagram: createInstagramMediaContainer
 * -> poll getInstagramContainerStatus -> publishInstagramContainer) once
 * Render Engine can produce finished, publish-ready output.
 */
function stubAdapter(platform: PublishPlatform, isConfigured: () => boolean): PlatformAdapter {
  return {
    platform,
    isConfigured,
    async publish(): Promise<PublishAdapterResult> {
      return {
        success: false,
        error: isConfigured()
          ? `Kredensial ${PUBLISH_PLATFORM_LABELS[platform]} tersedia, tapi publish otomatis belum diimplementasikan penuh pada sprint ini.`
          : `Integrasi ${PUBLISH_PLATFORM_LABELS[platform]} belum dikonfigurasi (kredensial API belum tersedia).`,
      };
    },
  };
}

const ADAPTERS: Record<PublishPlatform, PlatformAdapter> = {
  instagram: stubAdapter("instagram", isInstagramConfigured),
  facebook: stubAdapter("facebook", () => false),
  tiktok: stubAdapter("tiktok", isTikTokConfigured),
  youtube_shorts: stubAdapter("youtube_shorts", () => false),
};

export function getPlatformAdapter(platform: PublishPlatform): PlatformAdapter {
  return ADAPTERS[platform];
}
