import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifikasi tanda tangan AI CFO MKH Property (mkh-properti migrasi 0057,
 * RPC cfo_tanda_ai): HMAC-SHA256(rahasia sync, "ai-cfo-narasi|<ts>|<sha256 hex body>").
 * Berlaku maks 5 menit dan terikat pada isi body (tidak bisa dipakai untuk isi lain).
 */
export const UMUR_TANDA_AI_CFO_DETIK = 300;

export function tandaAiCfoSah(secret: string, ts: string, sig: string, body: string, sekarangDetik: number): boolean {
  if (!secret || !/^\d{9,12}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(sekarangDetik - Number(ts)) > UMUR_TANDA_AI_CFO_DETIK) return false;
  const hash = createHash("sha256").update(body).digest("hex");
  const harap = createHmac("sha256", secret).update(`ai-cfo-narasi|${ts}|${hash}`).digest();
  const diberi = Buffer.from(sig, "hex");
  return diberi.length === harap.length && timingSafeEqual(diberi, harap);
}
