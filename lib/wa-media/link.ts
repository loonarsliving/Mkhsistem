import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { APP_URL } from "@/constants/app";

/**
 * Short, query-free links for files Whacenter must download before sending
 * them over WhatsApp. Whacenter answers HTTP 500 for a Supabase signed URL
 * ("...?token=...", ~500 chars) -- seen 2026-10-24 on the villa guest chat --
 * while every file send that ever succeeded used a URL without a query
 * string. So instead of a signed URL we hand out
 *   <APP_URL>/api/wa-media/<payload>.<sig>/<name>
 * where payload = {bucket, path, expiry} and sig = HMAC-SHA256 over it,
 * served by app/api/wa-media/[token]/[name]/route.ts. Only the private
 * buckets listed here can be reached, and only until the expiry.
 */
const ALLOWED_BUCKETS = new Set(["refund-transfer-proofs"]);

interface WaMediaPayload {
  b: string;
  p: string;
  e: number;
}

function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  // Derived key, so the service-role key itself never signs anything public.
  return createHmac("sha256", secret).update("mkc-wa-media-link-v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Builds the short link. `ttlSeconds` only needs to cover Whacenter's immediate download. */
export function createWaMediaUrl(
  bucket: string,
  path: string,
  ttlSeconds: number,
  now: number = Date.now(),
): string {
  if (!ALLOWED_BUCKETS.has(bucket)) throw new Error(`wa-media: bucket not allowed: ${bucket}`);
  const payload = Buffer.from(
    JSON.stringify({
      b: bucket,
      p: path,
      e: Math.floor(now / 1000) + ttlSeconds,
    } satisfies WaMediaPayload),
  ).toString("base64url");
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const name = /^[a-z0-9]{2,5}$/.test(ext) ? `file.${ext}` : "file";
  return `${APP_URL}/api/wa-media/${payload}.${sign(payload)}/${name}`;
}

/** Returns the bucket/path a token grants, or null if it is forged, expired, or for a bucket not on the list. */
export function readWaMediaToken(
  token: string,
  now: number = Date.now(),
): { bucket: string; path: string } | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let data: WaMediaPayload;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WaMediaPayload;
  } catch {
    return null;
  }
  if (typeof data?.b !== "string" || typeof data.p !== "string" || typeof data.e !== "number")
    return null;
  if (!ALLOWED_BUCKETS.has(data.b) || data.e < Math.floor(now / 1000)) return null;
  return { bucket: data.b, path: data.p };
}
