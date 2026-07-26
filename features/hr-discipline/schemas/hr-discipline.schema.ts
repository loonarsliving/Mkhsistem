import { z } from "zod";

export const REASON_CATEGORIES = ["attendance", "conduct", "performance", "other"] as const;
export const WARNING_TYPES = ["sp1", "sp2", "sp3"] as const;

export const REASON_LABELS: Record<(typeof REASON_CATEGORIES)[number], string> = {
  attendance: "Kehadiran",
  conduct: "Perilaku",
  performance: "Kinerja",
  other: "Lainnya",
};

export const issueWarningSchema = z.object({
  employeeId: z.string().uuid("Pilih karyawan"),
  actionType: z.enum(WARNING_TYPES),
  reasonCategory: z.enum(REASON_CATEGORIES),
  description: z.string().trim().min(10, "Uraian minimal 10 karakter").max(2000, "Uraian maksimal 2000 karakter"),
});
export type IssueWarningInput = z.infer<typeof issueWarningSchema>;

export const terminateEmployeeSchema = z.object({
  employeeId: z.string().uuid("Pilih karyawan"),
  reasonCategory: z.enum(REASON_CATEGORIES),
  description: z.string().trim().min(10, "Uraian minimal 10 karakter").max(2000, "Uraian maksimal 2000 karakter"),
  lastWorkingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")
    .optional()
    .or(z.literal("")),
  /**
   * Only required when the employee has no active SP. The 20-character floor
   * mirrors the check constraint on hr_disciplinary_actions -- validating it
   * here as well turns a Postgres error into a field-level message.
   */
  bypassJustification: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>;

export const revokeActionSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5, "Alasan pencabutan minimal 5 karakter").max(500),
});
export type RevokeActionInput = z.infer<typeof revokeActionSchema>;
