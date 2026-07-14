import { z } from "zod";

// Indonesian mobile numbers: 08xx / +628xx / 628xx, 9-13 digits after the prefix.
const PHONE_REGEX = /^(?:\+62|62|0)8[1-9][0-9]{6,10}$/;

export const whatsAppSendSchema = z.object({
  phone: z
    .string()
    .min(1, "Nomor HP wajib diisi")
    .regex(PHONE_REGEX, "Nomor HP tidak valid (contoh: 081234567890)"),
  message: z.string().min(1, "Pesan wajib diisi").max(4096, "Pesan maksimal 4096 karakter"),
});
export type WhatsAppSendInput = z.infer<typeof whatsAppSendSchema>;

/** Normalizes any accepted local/international format to the 62xxxxxxxxxx shape the WhatsApp connector expects. */
export function normalizeIndonesianPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}
