import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Villa: owner forwards a dividend transfer proof photo to the investor it
 * belongs to, by sending the photo to WhatsApp with the unit code as the
 * caption (owner request 2026-09-25, e.g. "A2").
 *
 * This module is only the transport, mirroring villa-payment-confirmation.ts
 * exactly: caption recognition and the owner-only sender gate live here,
 * everything else -- finding the investor for that unit, building the
 * message, actually sending the photo -- lives in villa-api's
 * POST /bridge/dividend-proof-forward, behind the same shared
 * VILLA_BRIDGE_SECRET as the other villa bridges.
 *
 * Restricted the same way as LUNAS: only the active super admin's own
 * number is accepted (last-9-digits match against employees.phone), so a
 * random inbound photo captioned with what happens to look like a unit
 * code can never trigger a real dividend-proof send.
 */

const VILLA_API_BASE = "https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api";

/** Caption is the unit code alone, e.g. "A2", "C10". */
const UNIT_CODE_RE = /^\s*([A-Za-z]\d{1,2})\s*$/;

export type VillaDividendProofForwardOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "handled"; reply: string };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Same check as villa-payment-confirmation.ts's isVillaOwner(). */
async function isVillaOwner(sender: string): Promise<boolean> {
  const suffix = digitsOnly(sender).slice(-9);
  if (suffix.length < 9) return false;

  const supabase = createAdminClient();
  const { data: role } = await supabase.from("roles").select("id").eq("key", "super_admin").maybeSingle();
  if (!role?.id) return false;

  const { data: admins } = await supabase
    .from("employees")
    .select("phone")
    .eq("role_id", role.id)
    .eq("is_active", true)
    .not("phone", "is", null);

  return (admins ?? []).some((e) => digitsOnly(e.phone ?? "").endsWith(suffix));
}

export async function tryForwardVillaDividendProofViaWhatsApp(sender: string, mediaUrl: string, caption: string | undefined): Promise<VillaDividendProofForwardOutcome> {
  const match = (caption ?? "").match(UNIT_CODE_RE);
  if (!match) return { outcome: "not_applicable" };

  if (!(await isVillaOwner(sender))) {
    logger.warn("villa dividend proof forward: image with unit-code caption from a number that is not the villa owner, ignored");
    return { outcome: "not_applicable" };
  }

  const unitCode = match[1].toUpperCase();
  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret) {
    logger.error("villa dividend proof forward: VILLA_BRIDGE_SECRET is not configured");
    return { outcome: "handled", reply: "Gagal: jembatan villa belum dikonfigurasi. Mohon hubungi tim teknis." };
  }

  let body: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${VILLA_API_BASE}/bridge/dividend-proof-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ unit_code: unitCode, media_url: mediaUrl, sender }),
    });
    body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      logger.error("villa dividend proof forward: villa-api rejected the call", { status: res.status });
      return { outcome: "handled", reply: `Gagal memproses bukti transfer unit ${unitCode} (HTTP ${res.status}).` };
    }
  } catch (e) {
    logger.error("villa dividend proof forward: villa-api unreachable", { error: e instanceof Error ? e.message : String(e) });
    return { outcome: "handled", reply: `Gagal memproses bukti transfer unit ${unitCode}: server villa tidak bisa dihubungi.` };
  }

  if (body?.success === true) {
    return { outcome: "handled", reply: `Siap, bukti transfer sudah diteruskan ke ${body.investor_nama ?? "investor"} (unit ${unitCode}).` };
  }
  if (body?.reason === "investor_tidak_ditemukan") {
    return { outcome: "handled", reply: `Unit ${unitCode} tidak ditemukan atau investornya belum punya nomor HP terdaftar.` };
  }
  if (body?.reason === "bukan_admin") {
    return { outcome: "handled", reply: "Nomor ini belum terdaftar sebagai admin, jadi bukti transfer tidak diteruskan." };
  }
  return { outcome: "handled", reply: `Bukti transfer unit ${unitCode} tidak terkirim (${body?.reason ?? "sebab tidak diketahui"}).` };
}
