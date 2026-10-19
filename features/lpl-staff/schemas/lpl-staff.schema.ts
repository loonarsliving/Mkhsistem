import { z } from "zod";

export const addLplEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
  email: z.string().trim().min(1, "Email wajib diisi").email("Format email tidak valid"),
  phone: z.string().optional(),
  divisionId: z.string().uuid("Divisi wajib dipilih"),
  gender: z.enum(["male", "female"]).nullable(),
  joinDate: z.string().min(1, "Tanggal bergabung wajib diisi"),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountHolder: z.string().optional(),
});
export type AddLplEmployeeInput = z.infer<typeof addLplEmployeeSchema>;
