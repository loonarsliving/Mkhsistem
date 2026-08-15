import { z } from "zod";

export const createContractorSchema = z.object({
  fullName: z.string().trim().min(2, "Wajib diisi").max(150),
  contractorType: z.enum(["tukang", "mandor", "subcontractor"]).default("tukang"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});
export type CreateContractorInput = z.infer<typeof createContractorSchema>;

export const createLaborContractSchema = z.object({
  projectId: z.string().uuid(),
  contractorId: z.string().uuid("Pilih kontraktor"),
  contractValue: z.number().positive("Nilai kontrak harus lebih dari 0"),
  retentionPct: z.number().min(0).max(100).optional(),
  startDate: z.string().min(1),
  targetCompletion: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CreateLaborContractInput = z.infer<typeof createLaborContractSchema>;

export const setLaborContractWeightsSchema = z.object({
  contractId: z.string().uuid(),
  weights: z.array(z.object({ projectWbsId: z.string().uuid(), weightPct: z.number().positive().max(100) })).min(1, "Minimal 1 pekerjaan"),
});
export type SetLaborContractWeightsInput = z.infer<typeof setLaborContractWeightsSchema>;

export const generateLaborPaymentSchema = z.object({
  contractId: z.string().uuid(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});
export type GenerateLaborPaymentInput = z.infer<typeof generateLaborPaymentSchema>;

export const addLaborDeductionSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  category: z.enum(["damage", "rework", "penalty", "other"]),
  reason: z.string().trim().min(3, "Alasan wajib diisi"),
});
export type AddLaborDeductionInput = z.infer<typeof addLaborDeductionSchema>;

export const applyLaborAdvanceSchema = z.object({
  contractId: z.string().uuid(),
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ApplyLaborAdvanceInput = z.infer<typeof applyLaborAdvanceSchema>;

export const decideLaborPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  approve: z.boolean(),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type DecideLaborPaymentInput = z.infer<typeof decideLaborPaymentSchema>;
