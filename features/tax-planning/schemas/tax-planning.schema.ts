import { z } from "zod";

export const runTaxPlanningAnalysisSchema = z
  .object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal mulai tidak valid"),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal akhir tidak valid"),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "Tanggal akhir harus setelah tanggal mulai",
    path: ["periodEnd"],
  });

export type RunTaxPlanningAnalysisInput = z.infer<typeof runTaxPlanningAnalysisSchema>;

export const decideTaxProposalSchema = z.object({
  proposalId: z.string().uuid("ID usulan tidak valid"),
  decision: z.enum(["accept", "reject", "needs_review"]),
  note: z.string().trim().max(1000, "Catatan maksimal 1000 karakter").optional().or(z.literal("")),
});

export type DecideTaxProposalInput = z.infer<typeof decideTaxProposalSchema>;

export const updateFiscalConfigSchema = z.object({
  fiscalLossCarryforwardIdr: z.coerce.number().min(0, "Tidak boleh negatif"),
  fiscalLossExpiryNote: z.string().trim().max(500).optional().or(z.literal("")),
  umkmFinalTaxFirstEligibleYear: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
  umkmFinalTaxYearsUsed: z.coerce.number().int().min(0).max(3),
  annualTurnoverThresholdIdr: z.coerce.number().positive("Harus lebih dari 0"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type UpdateFiscalConfigInput = z.infer<typeof updateFiscalConfigSchema>;
