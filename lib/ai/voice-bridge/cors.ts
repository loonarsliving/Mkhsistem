/**
 * Shared CORS handling for the voice-bridge routes — Ultron is a separate
 * Vercel deployment, so these are the only two API routes in the app meant
 * to be called cross-origin. Scoped to a single configured origin rather
 * than left wide open.
 */
export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  const allowed = process.env.VOICE_BRIDGE_ALLOWED_ORIGIN;
  if (!origin || !allowed) return null;
  return origin === allowed ? origin : null;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}
