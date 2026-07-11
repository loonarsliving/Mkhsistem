import { z } from "zod";

import { FOLLOW_UP_ACTIVITY_TYPE, LEAD_SOURCE, PAYMENT_TYPE } from "@/constants/app";

export const addProspectSchema = z.object({
  customerName: z.string().min(2, "Nama pelanggan wajib diisi").max(200),
  phone: z.string().min(8, "Nomor telepon tidak valid").max(20),
  houseType: z.string().min(1, "Tipe rumah wajib diisi").max(100),
  city: z.string().min(1, "Kota wajib diisi").max(100),
  leadSource: z.enum(Object.values(LEAD_SOURCE) as [string, ...string[]], { required_error: "Sumber prospek wajib dipilih" }),
  notes: z.string().max(2000).optional(),
});
export type AddProspectInput = z.infer<typeof addProspectSchema>;

export const addFollowUpSchema = z.object({
  prospectId: z.string().uuid(),
  activityType: z.enum(Object.values(FOLLOW_UP_ACTIVITY_TYPE) as [string, ...string[]], {
    required_error: "Jenis aktivitas wajib dipilih",
  }),
  activityDate: z.string().min(1, "Tanggal wajib diisi"),
  activityTime: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
export type AddFollowUpInput = z.infer<typeof addFollowUpSchema>;

export const recordPaymentSchema = z.object({
  prospectId: z.string().uuid(),
  paymentType: z.enum(Object.values(PAYMENT_TYPE) as [string, ...string[]], { required_error: "Jenis pembayaran wajib dipilih" }),
  amount: z.coerce.number().positive("Jumlah harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal wajib diisi"),
  notes: z.string().max(2000).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const rejectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

export const setBranchTargetSchema = z.object({
  branchId: z.string().uuid("Cabang wajib dipilih"),
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodYear: z.coerce.number().int().min(2020).max(2100),
  targetUnits: z.coerce.number().int().min(0, "Target tidak boleh negatif"),
  sellingPricePerUnit: z.coerce.number().min(0, "Harga jual tidak boleh negatif"),
  commissionPercent: z.coerce.number().min(0).max(100, "Persentase maksimal 100"),
});
export type SetBranchTargetInput = z.infer<typeof setBranchTargetSchema>;
