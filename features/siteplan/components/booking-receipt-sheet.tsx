"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SITEPLAN_PAYMENT_METHOD_LABEL, type SiteplanPaymentMethod } from "@/constants/app";
import { formatCurrency } from "@/lib/utils";
import { terbilangRupiah } from "@/lib/utils/terbilang";

import { issueBookingReceiptAction } from "../actions/siteplan.actions";

export interface BookingReceiptData {
  receiptNo: string;
  issuedAt: string;
  amount: number;
  buyerName: string;
  buyerPhone: string | null;
  unitLabel: string;
  paymentMethod: string;
  projectName: string | null;
  marketingName: string | null;
  purchaseStatus: "pending_verification" | "verified" | "rejected";
}

/**
 * The printable "Kwitansi Tanda Jadi" sheet, laid out to match the paper form PT Maha Karya
 * Haluoleo already uses for Loonars bookings (landscape, MKH wordmark left / Loonars wordmark
 * right, numbered field rows, two signature blocks).
 *
 * Two deliberate differences from that paper form:
 *   - The nominal is NOT the pre-printed Rp 5.000.000. It is the booking fee the rep entered on
 *     this purchase, snapshotted onto loonars_booking_receipts at issue time.
 *   - The "Terbilang" line is computed from that same stored number (lib/utils/terbilang), never
 *     typed by hand, so the words and the digits can never disagree.
 *
 * Printing uses the app's existing native print support (app/globals.css: `.print-area` stays
 * visible, `.no-print` is hidden) rather than a server-side PDF dependency.
 */
export function BookingReceiptSheet({ data }: { data: BookingReceiptData }) {
  const paymentLabel = SITEPLAN_PAYMENT_METHOD_LABEL[data.paymentMethod as SiteplanPaymentMethod] ?? data.paymentMethod;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Cetak Kwitansi
        </Button>
        <p className="text-sm text-muted-foreground">
          No. Kwitansi <span className="font-medium text-foreground">{data.receiptNo}</span> — nomor ini permanen, mencetak ulang
          tidak menerbitkan nomor baru.
        </p>
      </div>

      {data.purchaseStatus === "pending_verification" && (
        <Alert className="no-print">
          <AlertDescription>
            Pembelian ini belum diverifikasi Finance. Kwitansi tanda jadi tetap dapat dicetak untuk diserahkan ke pembeli, namun
            dana masuk masih menunggu konfirmasi Finance.
          </AlertDescription>
        </Alert>
      )}

      {data.purchaseStatus === "rejected" && (
        <Alert variant="destructive" className="no-print">
          <AlertDescription>
            Pembelian ini sudah ditolak Finance. Kwitansi di bawah tetap ditampilkan sebagai arsip — jangan diserahkan ke pembeli.
          </AlertDescription>
        </Alert>
      )}

      {/* Fixed 1000px canvas so the printed sheet keeps the paper form's proportions regardless of
          viewport; wrapped in an overflow-x container so it still scrolls (rather than breaking the
          page) on a phone, which matters because this app also ships as a Capacitor mobile app. */}
      <div className="overflow-x-auto">
        <div className="print-area mx-auto w-[1000px] bg-white p-10 text-[#3d3228] shadow-sm ring-1 ring-black/10 print:shadow-none print:ring-0">
          {/* Header: company wordmark left, product wordmark right */}
          <div className="flex items-start justify-between gap-8 border-b border-[#3d3228]/20 pb-6">
            <div>
              <p className="text-2xl font-black leading-tight tracking-tight text-[#1b3a6b]">MAHA KARYA</p>
              <p className="text-2xl font-black leading-tight tracking-tight text-[#1b3a6b]">HALUOLEO</p>
              <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-[#1b3a6b]/70">BUILDING A BETTER TOMORROW</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tracking-[0.18em] text-[#6b533a]">LOONARS</p>
              <p className="text-[10px] font-medium tracking-[0.34em] text-[#6b533a]/80">EXCELLENT LIVING</p>
              <p className="mt-2 text-[10px] leading-relaxed tracking-[0.18em] text-[#6b533a]/70">
                A BETTER LIVING
                <br />
                BEGINS HERE
              </p>
            </div>
          </div>

          {/* Title */}
          <div className="mt-6 text-center">
            <h1 className="text-3xl font-bold tracking-wide">KWITANSI TANDA JADI</h1>
            <p className="mt-1 text-sm tracking-[0.2em] text-[#3d3228]/80">BOOKING PEMBELIAN VILLA</p>
            <p className="text-sm tracking-[0.2em] text-[#3d3228]/80">{(data.projectName ?? "LOONARS EXCELLENT LIVING").toUpperCase()}</p>
          </div>

          {/* Receipt number + date */}
          <div className="mt-6 space-y-1 text-sm">
            <Field label="No. Kwitansi" value={data.receiptNo} />
            <Field label="Tanggal" value={format(new Date(data.issuedAt), "dd MMMM yyyy", { locale: idLocale })} />
          </div>

          {/* Buyer block */}
          <div className="mt-5 space-y-1 text-[15px]">
            <Field label="Nama Pembeli" value={data.buyerName} wide />
            <Field label="No. WhatsApp / Telp" value={data.buyerPhone ?? "-"} wide />
            <Field label="Unit Villa" value={data.unitLabel} wide />
            <Field label="Metode Pembayaran" value={paymentLabel} wide />
          </div>

          {/* Amount */}
          <div className="mt-6 space-y-2 border-t border-[#3d3228]/20 pt-5">
            <div className="flex items-center gap-4">
              <span className="w-56 shrink-0 text-[15px]">Jumlah Pembayaran</span>
              <span className="shrink-0">:</span>
              <span className="flex-1 bg-[#e8e0d6] px-4 py-2 text-3xl font-bold tabular-nums">{formatCurrency(data.amount)},-</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="w-56 shrink-0 text-[15px]">Terbilang</span>
              <span className="shrink-0">:</span>
              <span className="flex-1 bg-[#e8e0d6] px-4 py-2 text-xl italic">{terbilangRupiah(data.amount)}</span>
            </div>
            <div className="flex gap-4 pt-1">
              <span className="w-56 shrink-0 text-[15px]">Keterangan</span>
              <span className="shrink-0">:</span>
              <span className="flex-1 text-[15px] leading-relaxed">
                Pembayaran tanda jadi (booking) untuk pembelian Villa {data.unitLabel}
                {data.projectName ? ` — ${data.projectName}` : ""}.
              </span>
            </div>
          </div>

          {/* Signatures */}
          <div className="mt-10 grid grid-cols-2 gap-12">
            <div>
              <p className="text-sm font-semibold tracking-[0.12em]">PENERIMA</p>
              <p className="text-[11px] tracking-[0.2em] text-[#3d3228]/70">MAHA KARYA HALUOLEO</p>
              <div className="mt-16 border-t border-[#3d3228]/50 pt-1 text-center text-xs">
                ( {data.marketingName ?? "Nama & Tanda Tangan"} )
              </div>
              <p className="mt-2 text-center text-[11px] text-[#3d3228]/60">Stempel Perusahaan</p>
            </div>
            <div>
              <p className="text-right text-sm font-semibold tracking-[0.12em]">PEMBAYAR</p>
              <div className="mt-[4.6rem] border-t border-[#3d3228]/50 pt-1 text-center text-xs">( Nama &amp; Tanda Tangan )</div>
            </div>
          </div>

          <div className="mt-8 flex items-end justify-between border-t border-[#3d3228]/20 pt-4">
            <p className="text-sm font-semibold italic">Terima kasih atas kepercayaan Anda.</p>
            <p className="text-right text-[11px] tracking-[0.2em] text-[#3d3228]/70">
              EXCELLENT LIVING
              <br />
              LASTING VALUE
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className={wide ? "w-56 shrink-0" : "w-40 shrink-0"}>{label}</span>
      <span className="shrink-0">:</span>
      <span className="flex-1 border-b border-[#3d3228]/40 pb-0.5 font-medium">{value}</span>
    </div>
  );
}

/**
 * Shown when a booking has no receipt yet. Issuing is a mutation (it allocates the next
 * MKH/LNR/NNNN/YYYY from loonars_receipt_counters), so it happens on an explicit click through a
 * Server Action -- never as a side effect of rendering this page.
 */
export function BookingReceiptIssueButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handleIssue() {
    setBusy(true);
    const result = await issueBookingReceiptAction(purchaseId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menerbitkan kwitansi");
      return;
    }
    toast.success(`Kwitansi ${result.data?.receiptNo ?? ""} diterbitkan`);
    router.refresh();
  }

  return (
    <Button onClick={handleIssue} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      Terbitkan Kwitansi
    </Button>
  );
}
