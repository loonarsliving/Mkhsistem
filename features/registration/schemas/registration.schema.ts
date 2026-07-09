import { z } from "zod";

// Indonesian mobile numbers: 08xx / +628xx / 628xx, 9-13 digits after the prefix.
const PHONE_REGEX = /^(?:\+62|62|0)8[1-9][0-9]{6,10}$/;

export const registerSchema = z
  .object({
    fullName: z.string().min(2, "Nama lengkap minimal 2 karakter").max(200),
    email: z.string().min(1, "Email wajib diisi").email("Format email tidak valid"),
    phone: z
      .string()
      .min(1, "Nomor HP wajib diisi")
      .regex(PHONE_REGEX, "Nomor HP tidak valid (contoh: 081234567890)"),
    password: z.string().min(8, "Password minimal 8 karakter"),
    confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi"),
    branchId: z.string().min(1, "Cabang wajib dipilih"),
    divisionId: z.string().min(1, "Divisi wajib dipilih"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const rejectRegistrationSchema = z.object({
  employeeId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type RejectRegistrationInput = z.infer<typeof rejectRegistrationSchema>;
