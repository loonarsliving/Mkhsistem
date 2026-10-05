import "server-only";

import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Kode referral karyawan untuk villa Loonars Private Living (owner
 * 2026-10-02). Tamu yang memakai kode di loonars.id tetap membayar harga
 * normal; kodenya menandai karyawan yang membawa tamu, dan karyawan itu
 * mendapat fee 10% dari nilai booking setelah tamu lunas.
 *
 * Modul ini hanya TRANSPOR ke villa-api (/bridge/referral/*): kode, harga,
 * dan pencatatan fee semuanya hidup di villa, satu-satunya tempat booking
 * dihitung. Yang dikerjakan di sini hanya yang memang milik Mkhsistem:
 * data karyawan dan pengiriman WA ke karyawan.
 */

const VILLA_API_BASE = "https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api";

export interface VillaReferralCode {
  id: string;
  kode: string;
  employee_id: string | null;
  employee_nama: string;
  fee_persen: number;
  aktif: boolean;
  catatan: string | null;
  dibuat_oleh: string | null;
  created_at: string;
  jumlah_dipakai: number;
  jumlah_sah: number;
  fee_sah: number;
  fee_menunggu: number;
  fee_sudah_dibayar: number;
}

export interface VillaReferralRedemption {
  id: string;
  referral_code_id: string;
  kode: string;
  employee_nama: string;
  guest_nama: string | null;
  tgl_checkin: string | null;
  malam: number | null;
  nilai_booking: number;
  fee: number;
  fee_dibayar_at: string | null;
  created_at: string;
  status_fee: "menunggu_lunas" | "sah" | "gugur";
}

type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function callVillaReferral<T>(path: string, body: unknown): Promise<BridgeResult<T>> {
  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret) {
    logger.error("villa referral: VILLA_BRIDGE_SECRET belum dikonfigurasi");
    return { ok: false, error: "Koneksi ke sistem villa belum dikonfigurasi" };
  }
  try {
    const res = await fetch(`${VILLA_API_BASE}/bridge/referral/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      (T & { alasan?: string; error?: string }) | null;
    if (!res.ok) {
      logger.error("villa referral: villa-api menolak panggilan", { path, status: res.status });
      return {
        ok: false,
        error: json?.alasan ?? json?.error ?? `Sistem villa menolak (HTTP ${res.status})`,
      };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    logger.error("villa referral: villa-api tidak bisa dihubungi", {
      path,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: "Sistem villa tidak bisa dihubungi" };
  }
}

export function listVillaReferrals() {
  return callVillaReferral<{ kode: VillaReferralCode[]; pemakaian: VillaReferralRedemption[] }>(
    "list",
    {},
  );
}

/** Selalu membuat kode baru (tombol "Tambah kode" di dashboard). */
export function createVillaReferral(input: {
  employeeId: string;
  employeeName: string;
  kode?: string | null;
  catatan?: string | null;
  createdBy: string;
}) {
  return callVillaReferral<{ success: boolean; baru: boolean; kode: VillaReferralCode }>("create", {
    employee_id: input.employeeId,
    employee_nama: input.employeeName,
    kode: input.kode || null,
    catatan: input.catatan || null,
    dibuat_oleh: input.createdBy,
  });
}

/** Kode aktif terakhir karyawan itu, atau buat baru kalau belum punya (perintah WA). */
export function issueVillaReferral(input: {
  employeeId: string;
  employeeName: string;
  createdBy: string;
}) {
  return callVillaReferral<{ success: boolean; baru: boolean; kode: VillaReferralCode }>("issue", {
    employee_id: input.employeeId,
    employee_nama: input.employeeName,
    dibuat_oleh: input.createdBy,
  });
}

export function setVillaReferralActive(id: string, aktif: boolean) {
  return callVillaReferral<{ success: boolean; kode: VillaReferralCode }>("set-active", {
    id,
    aktif,
  });
}

export function buildReferralWaMessage(
  employeeName: string,
  kode: string,
  feePersen: number,
): string {
  return [
    `Halo ${employeeName}, ini kode referral Loonars Private Living milik Anda:`,
    "",
    `*${kode}*`,
    "",
    `Bagikan ke calon tamu dan minta mereka memasukkan kode ini saat memesan di loonars.id/private-living.`,
    `Anda mendapat fee ${feePersen}% dari nilai booking setelah tamu melunasi pembayaran. Tamu tetap membayar harga normal.`,
    "",
    "Kode hanya berlaku untuk pemesanan lewat website loonars.id.",
  ].join("\n");
}

/** Kirim kode ke WA karyawan pemiliknya. Nomor diambil dari employees.phone. */
export async function sendReferralToEmployee(
  employeeId: string,
  kode: string,
  feePersen: number,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("full_name, phone")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!employee) return { ok: false, error: "Karyawan tidak ditemukan" };
  if (!employee.phone)
    return { ok: false, error: `${employee.full_name} belum punya nomor HP di data karyawan` };
  const result = await sendWhatsAppText(
    employee.phone,
    buildReferralWaMessage(employee.full_name, kode, feePersen),
  );
  if (!result.success)
    return {
      ok: false,
      error: `WA ke ${employee.full_name} gagal terkirim${result.error ? `: ${result.error}` : ""}`,
    };
  return { ok: true, name: employee.full_name };
}
