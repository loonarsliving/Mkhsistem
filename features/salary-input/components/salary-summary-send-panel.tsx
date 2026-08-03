"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { SalarySubmission } from "@/repositories/salary-input.repository";

import { sendSalarySummaryAction } from "../actions/salary-input.actions";

interface SalarySummarySendPanelProps {
  branchName: string;
  items: SalarySubmission[];
}

/**
 * Sits above the input form. Every submit_employee_salary() call already
 * pings Super Admin individually, but a Kepala Cabang running payroll for
 * several employees back-to-back turned that into a burst of separate
 * WhatsApp messages. This button folds everything still un-summarized into
 * ONE WhatsApp message (names + bank accounts) once they're done inputting.
 */
export function SalarySummarySendPanel({ branchName, items }: SalarySummarySendPanelProps) {
  const [isSending, setIsSending] = useState(false);

  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  async function handleSend() {
    setIsSending(true);
    const result = await sendSalarySummaryAction({});
    setIsSending(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim ringkasan");
      return;
    }
    toast.success(`Ringkasan ${result.data?.count ?? items.length} karyawan terkirim ke Super Admin (1 WA)`);
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Kirim Ringkasan ke Super Admin
        </CardTitle>
        <CardDescription>
          {items.length} karyawan cabang {branchName} sudah diinput tapi belum dikirim ke Super Admin. Ini otomatis terkirim begitu
          semua karyawan aktif di cabang sudah diinput -- kalau belum semua, atau ingin kirim sebagian sekarang, tekan tombol di bawah
          untuk mengirim <strong>1 pesan WhatsApp</strong> berisi semua nama dan nomor rekeningnya sekaligus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5">
              <span>{item.employeeName}</span>
              <span className="tabular-nums text-muted-foreground">{formatCurrency(item.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="tabular-nums">
            Total: {formatCurrency(total)}
          </Badge>
          <Button onClick={handleSend} disabled={isSending}>
            <Send className="mr-1 h-4 w-4" />
            Kirim 1 WA Ringkasan ({items.length} karyawan)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
