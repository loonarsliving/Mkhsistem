/**
 * Shared CORS handling for the voice-bridge routes — Ultron is a separate
 * Vercel deployment, so these are the only two API routes in the app meant
 * to be called cross-origin. Scoped to a single configured origin rather
 * than left wide open. Defaults to Ultron's production domain so this works
 * out of the box; override with VOICE_BRIDGE_ALLOWED_ORIGIN only if Ultron
 * ever moves to a different domain.
 */
const DEFAULT_ALLOWED_ORIGIN = "https://filemanager.haluoleo.id";

export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  const allowed = process.env.VOICE_BRIDGE_ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  if (!origin) return null;
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
