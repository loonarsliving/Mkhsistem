import "server-only";

import { JOGJA_BRANCH_ID } from "@/constants/app";
import { ROLE_KEYS } from "@/constants/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { issueVillaReferral, sendReferralToEmployee } from "@/lib/villa/referral";

/**
 * Villa: Vando meminta kode referral karyawan lewat WhatsApp (owner
 * 2026-10-02): "REFERAL <nama karyawan>".
 *
 * Sistem mengambil kode aktif karyawan itu (atau membuatnya kalau belum
 * ada) dari villa-api, mengirimkannya ke WA karyawan, lalu membalas Vando.
 *
 * Dikunci ke Kepala Cabang Jogja (Vando) dan super admin -- orang yang sama
 * yang boleh membuka /villa-referral. Pesan "referal ..." dari nomor lain
 * jatuh ke jalur biasa tanpa diproses, supaya karyawan yang sekadar
 * bertanya soal referral tidak dijawab dengan penolakan aneh.
 */

const REFERAL_RE = /^\s*refer+al+\s+(.{2,60}?)\s*$/i;

/** Nama karyawan dari "REFERAL <nama>" (juga "referral"), atau null kalau bukan perintah itu. */
export function parseReferralCommand(text: string): string | null {
  const match = text.match(REFERAL_RE);
  return match ? match[1].trim() : null;
}

export type VillaReferralOutcome =
  { outcome: "not_applicable" } | { outcome: "handled"; reply: string };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

async function findAuthorizedSender(
  sender: string,
): Promise<{ id: string; full_name: string } | null> {
  const suffix = digitsOnly(sender).slice(-9);
  if (suffix.length < 9) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("v_employee_directory")
    .select("id, full_name, phone, role_key, branch_id")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .not("phone", "is", null);
  const employee = (data ?? []).find((e) => digitsOnly(e.phone ?? "").endsWith(suffix));
  if (!employee) return null;
  const allowed =
    employee.role_key === ROLE_KEYS.SUPER_ADMIN ||
    (employee.role_key === ROLE_KEYS.KEPALA_CABANG && employee.branch_id === JOGJA_BRANCH_ID);
  return allowed ? { id: employee.id, full_name: employee.full_name } : null;
}

export async function tryVillaReferralRequestViaWhatsApp(
  sender: string,
  text: string,
): Promise<VillaReferralOutcome> {
  const query = parseReferralCommand(text);
  if (!query) return { outcome: "not_applicable" };

  const requester = await findAuthorizedSender(sender);
  if (!requester) {
    logger.warn("villa referral: perintah REFERAL dari nomor yang tidak berwenang, diabaikan");
    return { outcome: "not_applicable" };
  }

  const supabase = createAdminClient();
  const { data: candidates } = await supabase
    .from("employees")
    .select("id, full_name")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .ilike("full_name", `%${query.replace(/[%_]/g, "")}%`)
    .limit(10);

  const list = candidates ?? [];
  const exact = list.filter((e) => e.full_name.trim().toLowerCase() === query.toLowerCase());
  const chosen = exact.length === 1 ? exact[0] : list.length === 1 ? list[0] : null;

  if (!chosen) {
    if (list.length === 0) {
      return {
        outcome: "handled",
        reply: `Karyawan dengan nama "${query}" tidak ditemukan. Coba tulis nama lengkapnya, mis. REFERAL Budi Santoso.`,
      };
    }
    return {
      outcome: "handled",
      reply: `Ada ${list.length} karyawan yang cocok dengan "${query}":\n${list.map((e) => `- ${e.full_name}`).join("\n")}\n\nBalas dengan nama lengkapnya, mis. REFERAL ${list[0].full_name}.`,
    };
  }

  const issued = await issueVillaReferral({
    employeeId: chosen.id,
    employeeName: chosen.full_name,
    createdBy: `${requester.full_name} (WA)`,
  });
  if (!issued.ok)
    return {
      outcome: "handled",
      reply: `Kode referral untuk ${chosen.full_name} gagal dibuat: ${issued.error}`,
    };

  const kode = issued.data.kode;
  const sent = await sendReferralToEmployee(chosen.id, kode.kode, Number(kode.diskon_persen));
  const status = issued.data.baru ? "dibuat" : "sudah ada";
  return {
    outcome: "handled",
    reply: sent.ok
      ? `✅ Kode referral ${chosen.full_name}: *${kode.kode}* (${status}). Sudah dikirim ke WA ${sent.name}.`
      : `Kode referral ${chosen.full_name}: *${kode.kode}* (${status}), tapi ${sent.error}. Silakan teruskan manual.`,
  };
}
