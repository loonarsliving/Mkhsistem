import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Villa: owner confirms a website booking's QRIS payment by WhatsApp
 * (owner request 2026-09-12).
 *
 * The villa's public booking site takes a static QRIS payment, which no
 * gateway verifies. Until now the guest had to upload a photo of their
 * transfer receipt to get their unit locked. The owner's phone already
 * receives the QRIS notification, so they asked to be the confirmation
 * step themselves: villa-api WhatsApps them "balas LUNAS <kode>" when a
 * booking is made, they reply once the money lands, and the guest never
 * uploads anything.
 *
 * This module is only the transport. All the booking logic -- matching
 * the code, locking the unit, issuing the invoice, handling a unit that
 * was taken in the meantime -- lives in villa-api's
 * POST /bridge/confirm-payment, behind the same shared secret as the
 * other villa bridges, because that is where the bookings table and its
 * exclusion constraint are.
 *
 * Two deliberate restrictions:
 *
 *  - Only an exact "LUNAS <6 chars>" is recognised. A free-text "sudah
 *    masuk" is NOT accepted: with two guests awaiting payment at once --
 *    an ordinary weekend -- nothing in the message says which booking is
 *    meant, and guessing wrong locks the wrong unit and marks the wrong
 *    guest paid.
 *  - Only the active super admin's own number is accepted, matched the
 *    same tolerant last-9-digits way as findEmployeeByPhone. Anyone else
 *    sending the same words gets no reply and nothing happens, so a
 *    guessed code from an outsider cannot confirm a payment.
 */

const VILLA_API_BASE = "https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api";

/** "LUNAS A3F2C1" -- the code villa-api derives from the booking id, six hex characters. */
const LUNAS_RE = /^\s*lunas\s+([0-9a-f]{6})\s*$/i;

export type VillaPaymentConfirmationOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "handled"; reply: string };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** The villa owner is the active super admin in employees -- the same person the owner pointed at ("nomor wa saya ambil di mkhsistem super admin"). */
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

function formatRp(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? `Rp ${Math.round(v).toLocaleString("id-ID")}` : "-";
}

export async function tryConfirmVillaPaymentViaWhatsApp(sender: string, text: string): Promise<VillaPaymentConfirmationOutcome> {
  const match = text.match(LUNAS_RE);
  if (!match) return { outcome: "not_applicable" };

  // Checked only after the message already looks like a confirmation, so
  // an ordinary message from anyone never costs these two queries.
  if (!(await isVillaOwner(sender))) {
    logger.warn("villa payment confirmation: LUNAS message from a number that is not the villa owner, ignored");
    return { outcome: "not_applicable" };
  }

  const code = match[1].toUpperCase();
  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret) {
    logger.error("villa payment confirmation: VILLA_BRIDGE_SECRET is not configured");
    return { outcome: "handled", reply: "Konfirmasi gagal: jembatan villa belum dikonfigurasi. Mohon hubungi tim teknis." };
  }

  let body: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${VILLA_API_BASE}/bridge/confirm-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ code }),
    });
    body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      logger.error("villa payment confirmation: villa-api rejected the call", { status: res.status });
      return { outcome: "handled", reply: `Konfirmasi gagal (HTTP ${res.status}). Kode ${code} belum diproses — silakan coba lagi.` };
    }
  } catch (e) {
    logger.error("villa payment confirmation: villa-api unreachable", { error: e instanceof Error ? e.message : String(e) });
    return { outcome: "handled", reply: `Konfirmasi gagal: server villa tidak bisa dihubungi. Kode ${code} belum diproses — silakan coba lagi.` };
  }

  if (body?.success === true && body?.already_confirmed === true) {
    return { outcome: "handled", reply: `Kode ${code} sudah dikonfirmasi sebelumnya — unit ${body.unit_nomor ?? "-"} atas nama ${body.guest_nama ?? "-"} sudah terkunci. Tidak ada yang berubah.` };
  }

  if (body?.success === true) {
    return {
      outcome: "handled",
      reply:
        `Siap, pembayaran dikonfirmasi.\n\n` +
        `${body.guest_nama ?? "-"}\nUnit ${body.unit_nomor ?? "-"}\n${body.tgl_checkin ?? "-"} s/d ${body.tgl_checkout ?? "-"}\n${formatRp(body.total_bayar)}\n\n` +
        `Unit sudah masuk kalender dan invoice ${body.invoice_no ?? "-"} sudah bisa dicetak tamu.`,
    };
  }

  if (body?.reason === "unit_conflict") {
    return {
      outcome: "handled",
      reply:
        `Pembayaran dicatat dan invoice ${body.invoice_no ?? "-"} terbit, TAPI unit ${body.unit_nomor ?? "-"} keburu terisi booking lain untuk tanggal itu.\n\n` +
        `Tamu ${body.guest_nama ?? "-"} perlu dihubungi untuk pindah unit atau reschedule.`,
    };
  }

  if (body?.reason === "not_found") {
    return { outcome: "handled", reply: `Kode ${code} tidak ditemukan di booking yang menunggu pembayaran. Mohon cek lagi kodenya di pesan booking.` };
  }

  return { outcome: "handled", reply: `Kode ${code} tidak bisa diproses. Mohon cek lagi kodenya di pesan booking.` };
}
