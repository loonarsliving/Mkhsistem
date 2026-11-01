import { capitalizeFirst, terbilangRupiah } from "@/lib/utils/terbilang";

import { maskAccount, rupiah } from "./payslip-format";

/**
 * The "Slip Gaji" picture an employee receives on WhatsApp after Super
 * Admin sends the bank's bukti transfer (owner's ask 2026-11-02). Rendered
 * by next/og's ImageResponse (payslip-image.tsx) -- satori layout, so every
 * element is display:flex. No server-only import here: the card is plain
 * JSX so it can also be rendered from a one-off script.
 *
 * employee_salary_submissions only stores one take-home number (no gaji
 * pokok / tunjangan / potongan breakdown), so the slip shows exactly that
 * -- it never invents components that aren't recorded.
 */

export const PAYSLIP_WIDTH = 1080;
export const PAYSLIP_HEIGHT = 1560;

/** Loonars Private Living Villa logo (owner's choice 2026-11-02), public/branding/logo-loonars-villa.png is 902x708. */
export const PAYSLIP_LOGO = { path: "/branding/logo-loonars-villa.png", width: 191, height: 150 };

const C = {
  // Olive green taken from the Loonars logo.
  brand: "#4a4d38",
  brandSoft: "#eeefe6",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
};

export interface PayslipCardInput {
  slipNumber: string;
  periode: string;
  employeeName: string;
  jabatan: string | null;
  cabang: string | null;
  amount: number;
  bankName: string | null;
  bankAccountNumber: string;
  bankAccountHolder: string | null;
  transferredAt: Date;
  /** Data URI of the logo (PAYSLIP_LOGO), or null for a text-only header. */
  logo: string | null;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: `2px solid ${C.line}` }}>
      <div style={{ display: "flex", fontSize: 32, color: C.muted }}>{label}</div>
      <div style={{ display: "flex", fontSize: 34, color: C.ink, maxWidth: 600, textAlign: "right" }}>{value}</div>
    </div>
  );
}

export function PayslipCard(input: PayslipCardInput) {
  const rekening = [input.bankName?.trim().toUpperCase(), maskAccount(input.bankAccountNumber)].filter(Boolean).join(" ");
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "sans-serif", color: C.ink }}>
      <div style={{ display: "flex", height: 18, background: C.brand }} />

      <div style={{ display: "flex", flexDirection: "column", padding: "52px 72px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {input.logo ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={input.logo} width={PAYSLIP_LOGO.width} height={PAYSLIP_LOGO.height} />
          ) : (
            <div style={{ display: "flex", fontSize: 40, color: C.brand }}>Loonars Private Living Villa</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 26, color: C.muted }}>No. Slip</div>
            <div style={{ display: "flex", fontSize: 28, color: C.ink }}>{input.slipNumber}</div>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 44, fontSize: 30, letterSpacing: 6, color: C.brand }}>SLIP GAJI KARYAWAN</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 56, color: C.ink }}>{`Periode ${input.periode}`}</div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
          <Field label="Nama" value={input.employeeName.trim()} />
          {input.jabatan ? <Field label="Jabatan" value={input.jabatan} /> : null}
          {input.cabang ? <Field label="Cabang" value={input.cabang} /> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 36, padding: "36px 44px", borderRadius: 28, background: C.brandSoft }}>
          <div style={{ display: "flex", fontSize: 32, color: C.brand }}>Gaji diterima (take home pay)</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 88, color: C.brand }}>{rupiah(input.amount)}</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 28, color: C.brand }}>{capitalizeFirst(terbilangRupiah(input.amount))}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
          <Field label="Ditransfer ke" value={rekening} />
          {input.bankAccountHolder ? <Field label="Atas nama" value={input.bankAccountHolder.trim()} /> : null}
          <Field label="Tanggal transfer" value={formatDate(input.transferredAt)} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" }}>
            <div style={{ display: "flex", fontSize: 32, color: C.muted }}>Status</div>
            <div style={{ display: "flex", fontSize: 30, color: "#ffffff", background: C.brand, padding: "8px 28px", borderRadius: 999 }}>TELAH DITRANSFER</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 72px 44px", fontSize: 24, color: C.muted, textAlign: "center" }}>
        <div style={{ display: "flex" }}>Slip ini dibuat otomatis oleh MK Connect berdasarkan bukti transfer bank.</div>
        <div style={{ display: "flex", marginTop: 4 }}>Pertanyaan mengenai gaji dapat disampaikan ke Kepala Cabang.</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 28, color: C.ink }}>PT Maha Karya Haluoleo</div>
      </div>
    </div>
  );
}
