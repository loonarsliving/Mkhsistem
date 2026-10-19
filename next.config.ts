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
  // ffmpeg never runs on Vercel: video renders run on the off-Vercel worker
  // (scripts/render-worker.ts), and on Vercel lib/video/extract-keyframes.ts
  // skips keyframe extraction so video analysis uses its no-frames fallback.
  // This used to *include* @ffmpeg-installer for every route, which
  // copied a ~70MB static binary into every function bundle of every retained
  // deployment and filled the Hobby team's 10GB Function Storage. Exclude it
  // explicitly so no route can pull it back in by accident.
  outputFileTracingExcludes: {
    "*": ["./node_modules/@ffmpeg-installer/**/*"],
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
