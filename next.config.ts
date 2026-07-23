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
  // keyframes server-side. @ffmpeg-installer/ffmpeg resolves its per-platform
  // binary package (@ffmpeg-installer/linux-x64) via a *dynamic* require()
  // built from path.resolve(__dirname, ...) at runtime -- Next's automatic
  // file tracer can't follow that statically, so without an explicit include
  // the binary silently never makes it into the deployed serverless function
  // and every upload fails with "Cannot find module
  // .../node_modules/@ffmpeg-installer/linux-x64/package.json". A route-scoped
  // key here has been unreliable in production, so this includes it for every
  // route -- the binary is a few MB, not worth re-debugging tracing edge
  // cases over. Render Engine (Sprint 6) no longer runs ffmpeg on Vercel at
  // all -- scripts/render-worker.ts does the actual render on its own host.
  outputFileTracingIncludes: {
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
