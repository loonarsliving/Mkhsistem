import { z } from "zod";

export const createHrExpenseSchema = z.object({
  expenseType: z.enum(["bonus", "reimbursement", "other"], { required_error: "Jenis pengeluaran wajib dipilih" }),
  employeeId: z.string().uuid("Karyawan wajib dipilih"),
  branchId: z.string().uuid("Cabang wajib dipilih"),
  amount: z.coerce.number().positive("Jumlah harus lebih dari 0"),
  expenseDate: z.string().min(1, "Tanggal wajib diisi"),
  description: z.string().min(3, "Deskripsi wajib diisi").max(2000),
});
export type CreateHrExpenseInput = z.infer<typeof createHrExpenseSchema>;

export const rejectHrExpenseSchema = z.object({
  hrExpenseId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type RejectHrExpenseInput = z.infer<typeof rejectHrExpenseSchema>;

export const createPayrollRunSchema = z.object({
  branchId: z.string().uuid("Cabang wajib dipilih"),
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodYear: z.coerce.number().int().min(2020),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const payrollItemSchema = z.object({
  employeeId: z.string().uuid(),
  baseSalary: z.coerce.number().min(0),
  allowances: z.coerce.number().min(0).default(0),
  deductions: z.coerce.number().min(0).default(0),
});
export type PayrollItemInput = z.infer<typeof payrollItemSchema>;

export const approvePayrollRunSchema = z.object({
  payrollRunId: z.string().uuid(),
  items: z.array(payrollItemSchema).min(1, "Minimal satu baris gaji karyawan wajib diisi"),
});
export type ApprovePayrollRunInput = z.infer<typeof approvePayrollRunSchema>;
