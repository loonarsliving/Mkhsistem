import "server-only";

import { ImageResponse } from "next/og";

import { APP_URL } from "@/constants/app";
import { logger } from "@/lib/logger";

import { formatRefundMonthLong } from "./transfer-proof-format";

/**
 * The picture the refund customer receives instead of the bank screenshot
 * (owner's ask 2026-10-27): a company-made "Bukti Pembayaran Refund" card
 * with the termin paid, total / paid / remaining and the next termin -- no
 * bank, no account number. The bank screenshot itself stays in the private
 * bucket for internal checks.
 */

const WIDTH = 1080;
const HEIGHT = 1560;

const C = {
  brand: "#0f766e",
  brandSoft: "#ccfbf1",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  card: "#f8fafc",
  amber: "#b45309",
  amberSoft: "#fef3c7",
};

type Termin = { dueMonth: string; amount: number };

export interface RefundProofImageInput {
  customerName: string;
  installment: Termin | null;
  refundAmount: number;
  paidAmount: number;
  remainingAmount: number;
  nextInstallment: Termin | null;
  paidAt: Date;
}

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" });
}

/** The logo as a data URI, or null (the card still renders, text-only header). */
async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${APP_URL}/branding/logo-mkh.png`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch (err) {
    logger.warn("refund-proof-image: logo unavailable", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 0", borderBottom: `2px solid ${C.line}` }}>
      <div style={{ display: "flex", fontSize: 34, color: C.muted }}>{label}</div>
      <div style={{ display: "flex", fontSize: strong ? 42 : 36, color: strong ? C.brand : C.ink }}>{value}</div>
    </div>
  );
}

/** Renders the card as PNG bytes. */
export async function renderRefundProofImage(input: RefundProofImageInput): Promise<Buffer> {
  const logo = await loadLogo();
  const progress = input.refundAmount > 0 ? Math.min(Math.max(input.paidAmount / input.refundAmount, 0), 1) : 1;
  const lunas = input.remainingAmount <= 0;

  const next = lunas
    ? { title: "Status refund", body: "LUNAS", note: "Seluruh dana refund telah dibayarkan." }
    : input.nextInstallment
      ? { title: "Pembayaran berikutnya", body: `Termin ${formatRefundMonthLong(input.nextInstallment.dueMonth)}`, note: rupiah(input.nextInstallment.amount) }
      : { title: "Pembayaran berikutnya", body: "Akan diinformasikan", note: "Jadwal akan kami sampaikan kembali." };

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "sans-serif", color: C.ink }}>
        <div style={{ display: "flex", height: 18, background: C.brand }} />

        <div style={{ display: "flex", flexDirection: "column", padding: "56px 72px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={logo} width={331} height={80} />
            ) : (
              <div style={{ display: "flex", fontSize: 40, color: C.brand }}>PT Maha Karya Haluoleo</div>
            )}
            <div style={{ display: "flex", fontSize: 28, color: C.muted }}>{formatDate(input.paidAt)}</div>
          </div>

          <div style={{ display: "flex", marginTop: 48, fontSize: 30, letterSpacing: 4, color: C.brand }}>BUKTI PEMBAYARAN REFUND</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 34, color: C.muted }}>Kepada Yth. Bapak/Ibu</div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 52, color: C.ink }}>{input.customerName}</div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 40, padding: "36px 44px", borderRadius: 28, background: C.brandSoft }}>
            <div style={{ display: "flex", fontSize: 32, color: C.brand }}>
              {input.installment ? `Pembayaran termin ${formatRefundMonthLong(input.installment.dueMonth)}` : "Pembayaran refund"}
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: 84, color: C.brand }}>
              {input.installment ? rupiah(input.installment.amount) : "Telah ditransfer"}
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: 30, color: C.brand }}>Telah ditransfer ke rekening Bapak/Ibu</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
            <Row label="Total refund" value={rupiah(input.refundAmount)} />
            <Row label="Sudah dibayarkan" value={rupiah(input.paidAmount)} />
            <Row label="Sisa refund" value={rupiah(input.remainingAmount)} strong />
          </div>

          <div style={{ display: "flex", marginTop: 28, height: 22, borderRadius: 11, background: C.line }}>
            <div style={{ display: "flex", width: `${Math.round(progress * 100)}%`, height: 22, borderRadius: 11, background: C.brand }} />
          </div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 26, color: C.muted }}>{`${Math.floor(progress * 100)}% dari total refund telah dibayarkan`}</div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 36,
              padding: "30px 44px",
              borderRadius: 28,
              background: lunas ? C.brandSoft : C.amberSoft,
            }}
          >
            <div style={{ display: "flex", fontSize: 28, color: lunas ? C.brand : C.amber }}>{next.title}</div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 46, color: lunas ? C.brand : C.amber }}>{next.body}</div>
            <div style={{ display: "flex", marginTop: 4, fontSize: 32, color: lunas ? C.brand : C.amber }}>{next.note}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 72px 48px", fontSize: 26, color: C.muted }}>
          <div style={{ display: "flex" }}>Terima kasih atas kesabaran dan kepercayaan Bapak/Ibu.</div>
          <div style={{ display: "flex", marginTop: 6 }}>PT Maha Karya Haluoleo</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );

  return Buffer.from(await image.arrayBuffer());
}
