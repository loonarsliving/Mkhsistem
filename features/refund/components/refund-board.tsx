"use client";

import * as React from "react";
import { AlertTriangle, BellRing, CalendarPlus, Loader2, MessageCircle, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrency } from "@/lib/utils";
import type { RefundCustomer, RefundInstallment } from "@/repositories/refund.repository";

import { deleteInstallmentAction, toggleInstallmentPaidAction } from "../actions/refund.actions";
import { formatRefundMonth } from "../schemas/refund.schema";
import { RefundChatDialog } from "./refund-chat-dialog";
import { RefundAddInstallmentDialog, RefundCustomerFormDialog, RefundReminderDialog } from "./refund-dialogs";

type MonthState = "paid" | "overdue" | "current" | "upcoming";

function monthState(installment: RefundInstallment, currentMonth: string): MonthState {
  if (installment.isPaid) return "paid";
  if (installment.dueMonth < currentMonth) return "overdue";
  if (installment.dueMonth === currentMonth) return "current";
  return "upcoming";
}

const STATE_CLASS: Record<MonthState, string> = {
  paid: "border-emerald-500/40 bg-emerald-500/10",
  overdue: "border-destructive/50 bg-destructive/10",
  current: "border-amber-500/50 bg-amber-500/10",
  upcoming: "border-border",
};

function InstallmentChip({
  installment,
  currentMonth,
  canManage,
}: {
  installment: RefundInstallment;
  currentMonth: string;
  canManage: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  const [optimisticPaid, setOptimisticPaid] = React.useState(installment.isPaid);
  React.useEffect(() => setOptimisticPaid(installment.isPaid), [installment.isPaid]);

  const state = monthState({ ...installment, isPaid: optimisticPaid }, currentMonth);

  async function toggle(paid: boolean) {
    setPending(true);
    setOptimisticPaid(paid);
    const result = await toggleInstallmentPaidAction({ installmentId: installment.id, paid });
    setPending(false);
    if (!result.success) {
      setOptimisticPaid(!paid);
      toast.error(result.error ?? "Gagal menyimpan");
      return;
    }
    toast.success(`${formatRefundMonth(installment.dueMonth)} ${paid ? "ditandai terbayar" : "dibatalkan"}`);
  }

  async function remove() {
    if (!window.confirm(`Hapus termin ${formatRefundMonth(installment.dueMonth)} (${formatCurrency(installment.amount)})?`)) return;
    setPending(true);
    const result = await deleteInstallmentAction({ installmentId: installment.id });
    setPending(false);
    if (!result.success) toast.error(result.error ?? "Gagal menghapus termin");
  }

  return (
    <label
      className={cn(
        "group relative flex min-w-[118px] cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors",
        STATE_CLASS[state],
        !canManage && "cursor-default",
      )}
    >
      {pending ? (
        <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
      ) : (
        <Checkbox
          checked={optimisticPaid}
          disabled={!canManage}
          onCheckedChange={(v) => void toggle(v === true)}
          aria-label={`Termin ${formatRefundMonth(installment.dueMonth)} terbayar`}
          className="mt-0.5"
        />
      )}
      <span className="leading-tight">
        <span className="block font-medium">{formatRefundMonth(installment.dueMonth)}</span>
        <span className="block tabular-nums text-muted-foreground">{formatCurrency(installment.amount)}</span>
        {state === "overdue" && <span className="block font-medium text-destructive">Terlambat</span>}
        {state === "current" && <span className="block font-medium text-amber-600 dark:text-amber-400">Bulan ini</span>}
      </span>
      {canManage && !optimisticPaid && !pending && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void remove();
          }}
          className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          aria-label="Hapus termin"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </label>
  );
}

function Amount({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("font-semibold tabular-nums", className)}>{formatCurrency(value)}</p>
    </div>
  );
}

export function RefundBoard({
  customers,
  currentMonth,
  canManage,
}: {
  customers: RefundCustomer[];
  currentMonth: string;
  canManage: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [chatCustomerId, setChatCustomerId] = React.useState<string | null>(null);
  const [reminder, setReminder] = React.useState<{ open: boolean; customer: RefundCustomer | null }>({ open: false, customer: null });
  const [form, setForm] = React.useState<{ open: boolean; customer: RefundCustomer | null }>({ open: false, customer: null });
  const [addInstallmentFor, setAddInstallmentFor] = React.useState<RefundCustomer | null>(null);

  const allMonths = React.useMemo(
    () => [...new Set(customers.flatMap((c) => c.installments.map((i) => i.dueMonth)))].sort(),
    [customers],
  );
  const [selectedMonth, setSelectedMonth] = React.useState(() =>
    allMonths.includes(currentMonth) ? currentMonth : (allMonths.find((m) => m >= currentMonth) ?? allMonths[0] ?? currentMonth),
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q));
  }, [customers, query]);

  const monthRows = React.useMemo(
    () =>
      filtered
        .map((c) => ({ customer: c, installment: c.installments.find((i) => i.dueMonth === selectedMonth) }))
        .filter((r): r is { customer: RefundCustomer; installment: RefundInstallment } => Boolean(r.installment)),
    [filtered, selectedMonth],
  );
  const monthTotal = monthRows.reduce((s, r) => s + r.installment.amount, 0);
  const monthPaid = monthRows.filter((r) => r.installment.isPaid).reduce((s, r) => s + r.installment.amount, 0);

  const chatCustomer = customers.find((c) => c.id === chatCustomerId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / no. HP" className="pl-8" />
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setForm({ open: true, customer: null })}>
              <Plus className="h-4 w-4" /> Tambah Customer
            </Button>
            <Button onClick={() => setReminder({ open: true, customer: null })}>
              <BellRing className="h-4 w-4" /> Ingatkan Owner & Vando
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="customer">
        <TabsList>
          <TabsTrigger value="customer">Per Customer</TabsTrigger>
          <TabsTrigger value="month">Per Bulan</TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="mt-4 space-y-3">
          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="Tidak ada customer" description="Belum ada data refund atau tidak cocok dengan pencarian." className="py-10" />
          ) : (
            filtered.map((c, index) => (
              <Card key={c.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <span className="text-muted-foreground">{index + 1}.</span> {c.name}
                        {c.remainingAmount === 0 && c.refundAmount > 0 && (
                          <Badge className="ml-2 align-middle" variant="secondary">
                            Lunas
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.phone ?? "No. HP belum ada"} ·{" "}
                        {c.bankAccountNumber
                          ? `${c.bankName ?? ""} ${c.bankAccountNumber}${c.bankAccountHolder ? ` a.n. ${c.bankAccountHolder}` : ""}`
                          : "Rekening belum ada"}
                      </p>
                      {c.notes && <p className="mt-1 text-xs italic text-muted-foreground">{c.notes}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setChatCustomerId(c.id)}>
                        <MessageCircle className="h-4 w-4" /> Chat
                        {c.unreadMessages > 0 && (
                          <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                            {c.unreadMessages}
                          </Badge>
                        )}
                      </Button>
                      {canManage && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setReminder({ open: true, customer: c })}>
                            <BellRing className="h-4 w-4" /> Ingatkan
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setForm({ open: true, customer: c })} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                    <Amount label="Jumlah Refund" value={c.refundAmount} />
                    <Amount label="Terbayar" value={c.paidAmount} className="text-emerald-600 dark:text-emerald-400" />
                    <Amount label="Sisa" value={c.remainingAmount} className={c.remainingAmount > 0 ? "text-destructive" : undefined} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {c.installments.map((i) => (
                      <InstallmentChip key={i.id} installment={i} currentMonth={currentMonth} canManage={canManage} />
                    ))}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setAddInstallmentFor(c)}
                        className="flex min-w-[118px] items-center justify-center gap-1 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted"
                      >
                        <CalendarPlus className="h-4 w-4" /> Termin
                      </button>
                    )}
                  </div>

                  {(c.unscheduledAmount > 0.5 || c.overScheduled) && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {c.overScheduled
                        ? `Total termin belum dibayar (${formatCurrency(c.scheduledUnpaidAmount)}) melebihi sisa refund (${formatCurrency(c.remainingAmount)}) — cek kembali jadwalnya.`
                        : `${formatCurrency(c.unscheduledAmount)} dari sisa refund belum punya jadwal termin.`}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Pilih bulan" />
                  </SelectTrigger>
                  <SelectContent>
                    {allMonths.map((m) => (
                      <SelectItem key={m} value={m}>
                        {formatRefundMonth(m)}
                        {m === currentMonth ? " (bulan ini)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Terbayar <span className="font-semibold tabular-nums text-foreground">{formatCurrency(monthPaid)}</span> dari{" "}
                  <span className="font-semibold tabular-nums text-foreground">{formatCurrency(monthTotal)}</span>
                </p>
              </div>
              {monthRows.length === 0 ? (
                <EmptyState icon={CalendarPlus} title="Tidak ada termin" description="Tidak ada termin di bulan ini." className="py-8" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Termin</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthRows.map(({ customer, installment }) => (
                        <TableRow key={installment.id}>
                          <TableCell>
                            <div className="font-medium">{customer.name}</div>
                            <div className="text-xs text-muted-foreground">Sisa {formatCurrency(customer.remainingAmount)}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-block">
                              <InstallmentChip installment={installment} currentMonth={currentMonth} canManage={canManage} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={installment.isPaid ? "secondary" : installment.dueMonth < currentMonth ? "destructive" : "outline"}>
                              {installment.isPaid ? "Terbayar" : installment.dueMonth < currentMonth ? "Terlambat" : "Belum dibayar"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => setChatCustomerId(customer.id)} aria-label="Chat">
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              {canManage && (
                                <Button size="sm" variant="outline" onClick={() => setReminder({ open: true, customer })} aria-label="Ingatkan">
                                  <BellRing className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RefundChatDialog customer={chatCustomer} canManage={canManage} onOpenChange={(open) => !open && setChatCustomerId(null)} />
      <RefundReminderDialog
        open={reminder.open}
        customer={reminder.customer}
        onOpenChange={(open) => setReminder((r) => ({ ...r, open }))}
      />
      <RefundCustomerFormDialog open={form.open} customer={form.customer} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} />
      <RefundAddInstallmentDialog customer={addInstallmentFor} onOpenChange={(open) => !open && setAddInstallmentFor(null)} />
    </div>
  );
}
