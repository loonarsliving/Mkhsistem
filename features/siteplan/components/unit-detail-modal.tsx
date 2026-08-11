"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SITEPLAN_PAYMENT_METHOD_LABEL, SITEPLAN_TRANSACTION_TYPE_LABEL, type SiteplanPaymentMethod, type SiteplanTransactionType } from "@/constants/app";
import { SiteplanUnitStatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import type { SiteplanUnitStatus } from "@/constants/app";

import { getSiteplanPurchaseForUnitAction } from "../actions/siteplan.actions";

interface UnitDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string | null;
  unitBlok: string;
  unitStatus: SiteplanUnitStatus;
}

export function UnitDetailModal({ open, onOpenChange, unitId, unitBlok, unitStatus }: UnitDetailModalProps) {
  const { data: purchase, isLoading } = useQuery({
    queryKey: ["siteplan-unit-purchase", unitId],
    queryFn: () => getSiteplanPurchaseForUnitAction(unitId as string),
    enabled: open && Boolean(unitId),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Unit {unitBlok} <SiteplanUnitStatusBadge status={unitStatus} />
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!isLoading && !purchase && (
          <p className="py-4 text-sm text-muted-foreground">
            Unit ini sudah tidak tersedia. Detail pembeli hanya dapat dilihat oleh marketing yang mengajukan atau tim finance.
          </p>
        )}

        {!isLoading && purchase && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Pembeli</p>
                <p className="font-medium">{purchase.buyer_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telepon</p>
                <p className="font-medium">{purchase.phone ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipe Transaksi</p>
                <p className="font-medium">{SITEPLAN_TRANSACTION_TYPE_LABEL[purchase.transaction_type as SiteplanTransactionType] ?? purchase.transaction_type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Metode Pembayaran</p>
                <p className="font-medium">{SITEPLAN_PAYMENT_METHOD_LABEL[purchase.payment_method as SiteplanPaymentMethod] ?? purchase.payment_method}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Harga</p>
                <p className="font-medium tabular-nums">{formatCurrency(purchase.price ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tanggal Transaksi</p>
                <p className="font-medium">{format(new Date(purchase.transaction_date), "dd MMM yyyy", { locale: idLocale })}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status Verifikasi</p>
              <p className="font-medium capitalize">{purchase.status.replace(/_/g, " ")}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
