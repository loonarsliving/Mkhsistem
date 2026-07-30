import { z } from "zod";

export const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export const submitEmployeeSalarySchema = z.object({
  employeeId: z.string().uuid("Pilih karyawan"),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2020).max(2100),
  amount: z.number().positive("Nominal gaji harus lebih dari 0"),
  bankName: z.string().trim().max(100).optional().or(z.literal("")),
  bankAccountNumber: z.string().trim().min(4, "Nomor rekening minimal 4 digit").max(50),
  bankAccountHolder: z.string().trim().max(150).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type SubmitEmployeeSalaryInput = z.infer<typeof submitEmployeeSalarySchema>;

export const markSalaryTransferredSchema = z.object({
  id: z.string().uuid(),
});
export type MarkSalaryTransferredInput = z.infer<typeof markSalaryTransferredSchema>;
