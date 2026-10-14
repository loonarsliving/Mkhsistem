import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for the customer refund module (/refund, migration 0287). Pure
 * queries -- every total below is derived here from the raw rows rather than
 * stored, so ticking a termin can never leave a stale "terbayar"/"sisa"
 * figure behind.
 */

export interface RefundInstallment {
  id: string;
  customerId: string;
  /** "YYYY-MM-01" */
  dueMonth: string;
  amount: number;
  isPaid: boolean;
  paidAt: string | null;
}

export interface RefundCustomer {
  id: string;
  name: string;
  phone: string | null;
  refundAmount: number;
  /** Paid before / outside the termin schedule (carried over from the spreadsheet's "Terbayar"). */
  openingPaidAmount: number;
  /** openingPaidAmount + every termin ticked as paid. */
  paidAmount: number;
  /** refundAmount - paidAmount, floored at 0. */
  remainingAmount: number;
  /** Unpaid termin already on the schedule. */
  scheduledUnpaidAmount: number;
  /** Part of the remaining refund that has no termin yet (remaining - scheduled unpaid), never negative. */
  unscheduledAmount: number;
  /** Scheduled termin exceed what is still owed -- the schedule needs correcting. */
  overScheduled: boolean;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  notes: string | null;
  sortOrder: number;
  installments: RefundInstallment[];
  unreadMessages: number;
  lastMessageAt: string | null;
  lastReminderAt: string | null;
}

export interface RefundChatMessage {
  id: string;
  direction: "outbound" | "inbound";
  body: string;
  deliveryStatus: "sent" | "failed" | "received";
  error: string | null;
  senderName: string | null;
  createdAt: string;
}

/** First day of the current month in WITA, as "YYYY-MM-01" -- same "bulan ini" the reminder RPC uses. */
export function currentRefundMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}-01`;
}

export async function listRefundCustomers(supabase: TypedSupabaseClient): Promise<RefundCustomer[]> {
  const [customersRes, installmentsRes, messagesRes, remindersRes] = await Promise.all([
    supabase
      .from("mkc_refund_customers")
      .select("*")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("customer_name", { ascending: true }),
    supabase.from("mkc_refund_installments").select("*").order("due_month", { ascending: true }).limit(5000),
    supabase
      .from("mkc_refund_chat_messages")
      .select("customer_id, direction, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("mkc_refund_reminders")
      .select("customer_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (customersRes.error) throw customersRes.error;
  if (installmentsRes.error) throw installmentsRes.error;
  if (messagesRes.error) throw messagesRes.error;
  if (remindersRes.error) throw remindersRes.error;

  const installmentsByCustomer = new Map<string, RefundInstallment[]>();
  for (const row of installmentsRes.data ?? []) {
    const list = installmentsByCustomer.get(row.customer_id) ?? [];
    list.push({
      id: row.id,
      customerId: row.customer_id,
      dueMonth: row.due_month,
      amount: Number(row.amount),
      isPaid: row.is_paid,
      paidAt: row.paid_at,
    });
    installmentsByCustomer.set(row.customer_id, list);
  }

  const unread = new Map<string, number>();
  const lastMessage = new Map<string, string>();
  for (const row of messagesRes.data ?? []) {
    if (!lastMessage.has(row.customer_id)) lastMessage.set(row.customer_id, row.created_at);
    if (row.direction === "inbound" && !row.read_at) unread.set(row.customer_id, (unread.get(row.customer_id) ?? 0) + 1);
  }

  const lastReminder = new Map<string, string>();
  for (const row of remindersRes.data ?? []) {
    if (row.customer_id && !lastReminder.has(row.customer_id)) lastReminder.set(row.customer_id, row.created_at);
  }

  return (customersRes.data ?? []).map((row) => {
    const installments = installmentsByCustomer.get(row.id) ?? [];
    const refundAmount = Number(row.refund_amount);
    const openingPaidAmount = Number(row.opening_paid_amount);
    const paidAmount = openingPaidAmount + installments.filter((i) => i.isPaid).reduce((sum, i) => sum + i.amount, 0);
    const remainingAmount = Math.max(refundAmount - paidAmount, 0);
    const scheduledUnpaidAmount = installments.filter((i) => !i.isPaid).reduce((sum, i) => sum + i.amount, 0);
    return {
      id: row.id,
      name: row.customer_name,
      phone: row.phone,
      refundAmount,
      openingPaidAmount,
      paidAmount,
      remainingAmount,
      scheduledUnpaidAmount,
      unscheduledAmount: Math.max(remainingAmount - scheduledUnpaidAmount, 0),
      overScheduled: scheduledUnpaidAmount > remainingAmount + 0.5,
      bankName: row.bank_name,
      bankAccountNumber: row.bank_account_number,
      bankAccountHolder: row.bank_account_holder,
      notes: row.notes,
      sortOrder: row.sort_order,
      installments,
      unreadMessages: unread.get(row.id) ?? 0,
      lastMessageAt: lastMessage.get(row.id) ?? null,
      lastReminderAt: lastReminder.get(row.id) ?? null,
    };
  });
}

export async function listRefundChatMessages(supabase: TypedSupabaseClient, customerId: string): Promise<RefundChatMessage[]> {
  const { data, error } = await supabase
    .from("mkc_refund_chat_messages")
    .select("id, direction, body, delivery_status, error, sent_by, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const senderIds = [...new Set((data ?? []).map((m) => m.sent_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: employees } = await supabase.from("employees").select("id, full_name").in("id", senderIds);
    for (const e of employees ?? []) names.set(e.id, e.full_name);
  }

  return (data ?? [])
    .map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      deliveryStatus: m.delivery_status,
      error: m.error,
      senderName: m.sent_by ? (names.get(m.sent_by) ?? null) : null,
      createdAt: m.created_at,
    }))
    .reverse();
}
