import type { NextConfig } from "next";

const supabaseHostname = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Asset Library uploads (features/kontenai/asset-library) go straight
      // through a Server Action (uploadKontenAiAssetAction) as FormData, up
      // to MAX_KONTENAI_ASSET_SIZE_BYTES (200MB) -- must stay above that.
      bodySizeLimit: "210mb",
    },
  },
  // KontenAI Video Intelligence (features/kontenai/asset-library) shells out to
  // the static ffmpeg binary from @ffmpeg-installer/ffmpeg to extract video
  // keyframes server-side. Next.js's file tracer resolves it fine via
  // require.resolve at runtime, but this makes the inclusion explicit so a
  // future tracer change can't silently drop the binary from the deployed
  // serverless function. Render Engine (Sprint 6) no longer runs ffmpeg on
  // Vercel at all -- scripts/render-worker.ts does the actual render on its
  // own host -- so it's dropped from this list.
  outputFileTracingIncludes: {
    "/kontenai/asset-library": ["./node_modules/@ffmpeg-installer/**/*"],
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Content-Security-Policy is set per-request (with a nonce) in
          // lib/supabase/middleware.ts, not here — it can't be static.
        ],
      },
    ];
  },
};

export default nextConfig;
