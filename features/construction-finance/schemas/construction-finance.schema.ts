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

/**
 * For projects already running on mkh-properti's own gaji-tukang/borongan
 * flow (currently just Jogja Loonars) -- owner types in each blok's
 * current sisa kontrak by hand, this pushes it one-way into mkh-properti's
 * tukang_borongan table (sync_inbound's tukang_borongan_sisa_upsert
 * branch, migration 0019 there). Not tied to a construction_projects row.
 */
export const syncTukangBorongonSchema = z.object({
  proyek: z.enum(["LL", "AFP", "IH", "GCI", "GCR"], { errorMap: () => ({ message: "Pilih proyek" }) }),
  blok: z.string().trim().max(30).optional().or(z.literal("")),
  nama: z.string().trim().min(2, "Nama tukang wajib diisi").max(150),
  item: z.string().trim().max(200).optional().or(z.literal("")),
  nilaiKontrak: z.number().min(0, "Tidak boleh negatif"),
  terbayar: z.number().min(0, "Tidak boleh negatif"),
  totalUnit: z.number().positive().optional(),
  hargaPerUnit: z.number().positive().optional(),
  unitSelesai: z.number().min(0).optional(),
  ket: z.string().trim().max(500).optional().or(z.literal("")),
});
export type SyncTukangBorongonInput = z.infer<typeof syncTukangBorongonSchema>;
