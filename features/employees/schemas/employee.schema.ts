import { z } from "zod";

export const createEmployeeSchema = z.object({
  employeeCode: z.string().min(2, "Kode karyawan minimal 2 karakter").max(30),
  fullName: z.string().min(2, "Nama minimal 2 karakter").max(150),
  email: z.string().min(1, "Email wajib diisi").email("Format email tidak valid"),
  phone: z.string().optional(),
  branchId: z.string().uuid("Cabang wajib dipilih"),
  divisionId: z.string().uuid().nullable(),
  positionId: z.string().uuid().nullable(),
  roleId: z.string().uuid("Role wajib dipilih"),
  gender: z.enum(["male", "female"]).nullable(),
  birthDate: z.string().optional(),
  joinDate: z.string().min(1, "Tanggal bergabung wajib diisi"),
  address: z.string().optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.omit({ email: true }).extend({
  id: z.string().uuid(),
  employmentStatus: z.enum(["active", "inactive", "on_leave", "terminated"]),
  avatarUrl: z.string().optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
