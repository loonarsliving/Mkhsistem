import { z } from "zod";

export const submitConstructionExpenseSchema = z.object({
  projectId: z.string().uuid("Proyek tidak valid"),
  expenseType: z.enum(["gaji_tukang", "pembelian_material", "material_tunai", "pembelian_lain_lain", "lain_lain_tunai"]),
  partyName: z.string().trim().min(2, "Wajib diisi").max(150),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  expenseDate: z.string().min(1, "Tanggal wajib diisi"),
});
export type SubmitConstructionExpenseInput = z.infer<typeof submitConstructionExpenseSchema>;

export const settleConstructionExpenseSchema = z.object({
  id: z.string().uuid(),
});
export type SettleConstructionExpenseInput = z.infer<typeof settleConstructionExpenseSchema>;

export const recordConstructionFundTransferSchema = z.object({
  projectId: z.string().uuid(),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  transferDate: z.string().min(1, "Tanggal wajib diisi"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type RecordConstructionFundTransferInput = z.infer<typeof recordConstructionFundTransferSchema>;
