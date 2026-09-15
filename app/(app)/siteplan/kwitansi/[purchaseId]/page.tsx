import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Receipt } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  BookingReceiptIssueButton,
  BookingReceiptSheet,
} from "@/features/siteplan/components/booking-receipt-sheet";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getBookingReceiptForPurchase, getSiteplanPurchaseById } from "@/repositories/loonars-siteplan.repository";

export const metadata: Metadata = { title: "Kwitansi Tanda Jadi" };

/**
 * The printable booking receipt for one siteplan purchase.
 *
 * A dedicated page rather than a dialog: the app's print support
 * (app/globals.css) hides everything outside `.print-area`, which is far more
 * predictable on a full page than inside a portalled modal over the app shell.
 *
 * Access is enforced twice, per the project's standard two-layer rule:
 * siteplan.view here, and RLS on loonars_unit_purchases /
 * loonars_booking_receipts (owning marketing rep, prospect.finance_verify, or
 * siteplan.manage) at the database. A rep from another branch gets a 404, not
 * another team's buyer data.
 */
export default async function BookingReceiptPage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const { purchaseId } = await params;
  await requirePermission("siteplan.view");
  const supabase = await createClient();

  const purchase = await getSiteplanPurchaseById(supabase, purchaseId).catch(() => null);
  if (!purchase) notFound();

  const receipt = await getBookingReceiptForPurchase(supabase, purchaseId);
  const unit = purchase.loonars_units as { blok: string; loonars_projects: { nama: string } | null } | null;
  const marketingName = (purchase.marketing as { full_name: string } | null)?.full_name ?? null;

  return (
    <div className="space-y-6">
      <div className="no-print space-y-4">
        <PageHeader
          title="Kwitansi Tanda Jadi"
          description={`Unit ${unit?.blok ?? "-"} — ${unit?.loonars_projects?.nama ?? "Siteplan"}`}
        />
        <Button variant="outline" size="sm" asChild>
          <Link href="/siteplan">Kembali ke Siteplan</Link>
        </Button>
      </div>

      {purchase.transaction_type !== "booking" ? (
        <EmptyState
          icon={FileText}
          title="Bukan transaksi booking"
          description="Kwitansi tanda jadi hanya diterbitkan untuk transaksi dengan tipe Booking Fee. Transaksi ini bertipe lain."
        />
      ) : !receipt ? (
        <EmptyState
          icon={Receipt}
          title="Kwitansi belum diterbitkan"
          description="Tekan tombol di bawah untuk menerbitkan nomor kwitansi (MKH/LNR/NNNN/TAHUN) dan menampilkan lembar cetaknya. Nomor hanya diterbitkan sekali per booking."
          action={<BookingReceiptIssueButton purchaseId={purchaseId} />}
        />
      ) : (
        <BookingReceiptSheet
          data={{
            receiptNo: receipt.receipt_no,
            issuedAt: receipt.issued_at,
            amount: Number(receipt.amount),
            buyerName: receipt.buyer_name,
            buyerPhone: receipt.buyer_phone,
            unitLabel: receipt.unit_label,
            paymentMethod: receipt.payment_method,
            projectName: unit?.loonars_projects?.nama ?? null,
            marketingName,
            purchaseStatus: purchase.status,
          }}
        />
      )}
    </div>
  );
}
