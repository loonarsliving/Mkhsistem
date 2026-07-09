/**
 * Builds a per-request Content-Security-Policy with a fresh nonce.
 * script-src uses nonce + 'strict-dynamic' (Next's own hydration script and
 * anything it loads, like @vercel/speed-insights, inherit trust from it).
 * style-src stays 'unsafe-inline': Radix UI / Floating UI position popovers,
 * dropdowns and tooltips via inline `style` attributes at runtime, which a
 * nonce cannot cover (nonces only apply to <script>/<style> elements, not
 * attributes) — tightening this would break the UI, not secure it further,
 * since script injection (the actual XSS vector) is already blocked above.
 */
export function buildCspHeader(): { nonce: string; header: string } {
  const nonce = generateNonce();
  const supabase = supabaseOrigins();

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabase ? ` ${supabase.https}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase.https} ${supabase.wss}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];

  return { nonce, header: directives.join("; ") };
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function supabaseOrigins(): { https: string; wss: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return { https: `https://${hostname}`, wss: `wss://${hostname}` };
  } catch {
    return null;
  }
}
