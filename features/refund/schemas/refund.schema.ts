import { z } from "zod";

const uuid = z.string().uuid();

export const MONTH_SHORT_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

/** "2026-10-01" -> "Okt 26", the same column labels as the CS refund spreadsheet. */
export function formatRefundMonth(dueMonth: string): string {
  const [year, month] = dueMonth.split("-");
  return `${MONTH_SHORT_LABELS[Number(month) - 1] ?? month} ${year?.slice(2) ?? ""}`;
}

export const toggleInstallmentPaidSchema = z.object({
  installmentId: uuid,
  paid: z.boolean(),
});
export type ToggleInstallmentPaidInput = z.infer<typeof toggleInstallmentPaidSchema>;

export const sendRefundReminderSchema = z.object({
  /** null/undefined = summary of every termin due up to this month. */
  customerId: uuid.nullable().optional(),
  note: z.string().max(1000, "Catatan maksimal 1000 karakter").optional(),
});
export type SendRefundReminderInput = z.infer<typeof sendRefundReminderSchema>;

export const sendRefundChatSchema = z.object({
  customerId: uuid,
  message: z.string().trim().min(1, "Pesan wajib diisi").max(4096, "Pesan maksimal 4096 karakter"),
});
export type SendRefundChatInput = z.infer<typeof sendRefundChatSchema>;

export const refundCustomerIdSchema = z.object({ customerId: uuid });
export type RefundCustomerIdInput = z.infer<typeof refundCustomerIdSchema>;

const optionalText = z.string().trim().max(200).optional();

export const saveRefundCustomerSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1, "Nama customer wajib diisi").max(200),
    phone: optionalText,
    refundAmount: z.number({ invalid_type_error: "Jumlah refund wajib diisi" }).min(0, "Tidak boleh negatif"),
    openingPaidAmount: z.number().min(0, "Tidak boleh negatif"),
    bankName: optionalText,
    bankAccountNumber: optionalText,
    bankAccountHolder: optionalText,
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.openingPaidAmount <= v.refundAmount, {
    message: "Terbayar awal tidak boleh melebihi jumlah refund",
    path: ["openingPaidAmount"],
  });
export type SaveRefundCustomerInput = z.infer<typeof saveRefundCustomerSchema>;

export const addInstallmentSchema = z.object({
  customerId: uuid,
  /** "YYYY-MM" from <input type="month"> */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Bulan tidak valid"),
  amount: z.number({ invalid_type_error: "Nominal wajib diisi" }).positive("Nominal harus lebih dari 0"),
});
export type AddInstallmentInput = z.infer<typeof addInstallmentSchema>;

export const deleteInstallmentSchema = z.object({ installmentId: uuid });
export type DeleteInstallmentInput = z.infer<typeof deleteInstallmentSchema>;

export const recordRefundProofSchema = z.object({
  customerId: uuid,
  /** null = let the system pick the oldest unpaid termin. */
  installmentId: uuid.nullable(),
  storagePath: z.string().min(1).max(500),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});
export type RecordRefundProofInput = z.infer<typeof recordRefundProofSchema>;

export const refundProofIdSchema = z.object({ proofId: uuid });
export type RefundProofIdInput = z.infer<typeof refundProofIdSchema>;
