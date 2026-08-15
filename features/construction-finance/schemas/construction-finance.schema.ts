import { z } from "zod";

export const submitConstructionExpenseSchema = z
  .object({
    projectId: z.string().uuid("Proyek tidak valid"),
    expenseType: z.enum(["gaji_tukang", "pembelian_material", "material_tunai", "pembelian_lain_lain", "lain_lain_tunai"]),
    partyName: z.string().trim().min(2, "Wajib diisi").max(150),
    amount: z.number().positive("Nominal harus lebih dari 0"),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    expenseDate: z.string().min(1, "Tanggal wajib diisi"),
    materialId: z.string().uuid().optional().or(z.literal("")),
    quantity: z.number().positive("Jumlah harus lebih dari 0").optional(),
  })
  .refine((data) => !data.materialId || (data.quantity !== undefined && data.quantity > 0), {
    message: "Jumlah wajib diisi kalau memilih material",
    path: ["quantity"],
  });
export type SubmitConstructionExpenseInput = z.infer<typeof submitConstructionExpenseSchema>;

export const settleConstructionExpenseSchema = z.object({
  id: z.string().uuid(),
});
export type SettleConstructionExpenseInput = z.infer<typeof settleConstructionExpenseSchema>;

export const createConstructionProjectSchema = z.object({
  branchId: z.string().uuid("Pilih cabang"),
  name: z.string().trim().min(3, "Nama proyek wajib diisi").max(200),
  budgetPerUnit: z.number().positive("Anggaran per unit harus lebih dari 0"),
  totalUnits: z.number().int().positive("Jumlah unit harus lebih dari 0"),
});
export type CreateConstructionProjectInput = z.infer<typeof createConstructionProjectSchema>;

export const addBoqLineSchema = z.object({
  projectId: z.string().uuid(),
  category: z.enum(["material", "labor", "equipment", "other"]),
  materialId: z.string().uuid().optional().or(z.literal("")),
  description: z.string().trim().min(2, "Wajib diisi").max(300),
  quantity: z.number().positive("Quantity harus lebih dari 0"),
  unit: z.string().trim().min(1, "Satuan wajib diisi").max(30),
  unitPrice: z.number().min(0, "Harga tidak boleh negatif"),
});
export type AddBoqLineInput = z.infer<typeof addBoqLineSchema>;

export const deleteBoqLineSchema = z.object({ id: z.string().uuid() });
export type DeleteBoqLineInput = z.infer<typeof deleteBoqLineSchema>;

export const recordConstructionFundTransferSchema = z.object({
  projectId: z.string().uuid(),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  transferDate: z.string().min(1, "Tanggal wajib diisi"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type RecordConstructionFundTransferInput = z.infer<typeof recordConstructionFundTransferSchema>;
