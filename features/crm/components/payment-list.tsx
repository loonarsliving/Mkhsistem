import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentStatusBadge } from "@/components/shared/status-badge";
import { PAYMENT_TYPE_LABEL } from "@/constants/app";
import { formatCurrency } from "@/lib/utils";
import type { PaymentStatusDb, PaymentTypeDb } from "@/types/database.types";

interface PaymentRow {
  id: string;
  payment_type: PaymentTypeDb;
  amount: number;
  payment_date: string;
  status: PaymentStatusDb;
  recorded_by_employee: { full_name: string } | null;
}

export function PaymentList({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jenis</TableHead>
            <TableHead className="text-right">Jumlah</TableHead>
            <TableHead>Tanggal</TableHead>
            <TableHead>Dicatat Oleh</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{PAYMENT_TYPE_LABEL[p.payment_type]}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(p.amount)}</TableCell>
              <TableCell className="whitespace-nowrap">{format(new Date(p.payment_date), "dd MMM yyyy", { locale: idLocale })}</TableCell>
              <TableCell>{p.recorded_by_employee?.full_name ?? "-"}</TableCell>
              <TableCell>
                <PaymentStatusBadge status={p.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
