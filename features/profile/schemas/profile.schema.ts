import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter").max(150),
  phone: z.string().optional(),
  address: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
    newPassword: z
      .string()
      .min(8, "Password minimal 8 karakter")
      .regex(/[a-z]/, "Password harus mengandung huruf kecil")
      .regex(/[A-Z]/, "Password harus mengandung huruf besar")
      .regex(/[0-9]/, "Password harus mengandung angka"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
