import { z } from "zod";

import { SITEPLAN_PAYMENT_METHOD, SITEPLAN_TRANSACTION_TYPE } from "@/constants/app";

/** Mirrors loonars_unit_purchase_submit's validation -- the RPC re-checks everything server-side too, this is just for fast form feedback. */
export const siteplanPurchaseSchema = z
  .object({
    unitId: z.string().uuid(),
    buyerName: z.string().min(2, "Nama pembeli minimal 2 karakter").max(200),
    nik: z.string().max(32).optional(),
    phone: z.string().max(32).optional(),
    address: z.string().max(500).optional(),
    transactionType: z.enum(Object.values(SITEPLAN_TRANSACTION_TYPE) as [string, ...string[]], {
      required_error: "Tipe transaksi wajib dipilih",
    }),
    paymentMethod: z.enum(Object.values(SITEPLAN_PAYMENT_METHOD) as [string, ...string[]], {
      required_error: "Metode pembayaran wajib dipilih",
    }),
    price: z.coerce.number().positive("Harga wajib diisi").optional(),
    bookingFee: z.coerce.number().nonnegative().optional(),
    dpAmount: z.coerce.number().nonnegative().optional(),
    pelunasanAmount: z.coerce.number().nonnegative().optional(),
    handoverDate: z.string().optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((val, ctx) => {
    // Type-conditional numeric fields, per transaction_type:
    //   booking -> Harga + Booking Fee
    //   dp      -> Harga + DP + Pelunasan + Tanggal Serah Terima
    //   akad    -> Harga (lunas) + Tanggal Serah Terima
    if (!val.price) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Harga wajib diisi" });
    }
    if (val.transactionType === "booking" && !val.bookingFee) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bookingFee"], message: "Booking fee wajib diisi" });
    }
    if (val.transactionType === "dp") {
      if (!val.dpAmount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dpAmount"], message: "Nominal DP wajib diisi" });
      if (!val.handoverDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["handoverDate"], message: "Tanggal serah terima wajib diisi" });
    }
    if (val.transactionType === "akad" && !val.handoverDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["handoverDate"], message: "Tanggal serah terima wajib diisi" });
    }
  });
export type SiteplanPurchaseInput = z.infer<typeof siteplanPurchaseSchema>;

/** branchId is required since 0262: every siteplan project is exclusively visible/bookable by its own branch's Sales/Kepala Cabang (siteplan.manage and prospect.finance_verify still see every project). */
export const siteplanProjectSchema = z.object({
  id: z.string().uuid().optional(),
  kode: z.string().min(1, "Kode wajib diisi").max(50),
  nama: z.string().min(2, "Nama minimal 2 karakter").max(200),
  branchId: z.string().uuid({ message: "Cabang wajib dipilih" }),
  lokasi: z.string().max(300).optional(),
  warna: z.string().max(20).optional(),
});
export type SiteplanProjectInput = z.infer<typeof siteplanProjectSchema>;

/**
 * harga has no lock-awareness here on purpose -- the schema only shapes what a form CAN submit.
 * The actual lock is enforced by loonars_units_price_lock_guard (0264): submitting the unit's own
 * unchanged harga is always accepted (NEW = OLD, nothing to reject), and the unit form dialog
 * disables the harga input entirely for a locked unit so a value change is never even offered.
 */
export const siteplanUnitSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  blok: z.string().min(1, "Kode unit wajib diisi").max(50),
  tipe: z.string().max(100).optional(),
  harga: z.coerce.number().nonnegative().optional(),
  luas: z.coerce.number().nonnegative().optional(),
});
export type SiteplanUnitInput = z.infer<typeof siteplanUnitSchema>;

// ----------------------------------------------------------------------------
// Notary contact (0266)
// ----------------------------------------------------------------------------

/** Reuses the messaging module's Indonesian phone regex -- same shape requirement for any number this app sends WhatsApp to. */
const NOTARIS_PHONE_REGEX = /^(?:\+62|62|0)8[1-9][0-9]{6,10}$/;

export const notarisContactSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().min(2, "Nama minimal 2 karakter").max(200),
  phone: z.string().min(1, "Nomor HP wajib diisi").regex(NOTARIS_PHONE_REGEX, "Nomor HP tidak valid (contoh: 081234567890)"),
  notes: z.string().max(500).optional(),
});
export type NotarisContactInput = z.infer<typeof notarisContactSchema>;

// ----------------------------------------------------------------------------
// Akad scheduling (0266)
// ----------------------------------------------------------------------------

/**
 * Buyer fields are re-validated here even though most already exist on the purchase row -- "Jadwalkan
 * Akad" lets the rep complete/correct them at this stage (a booking-fee purchase often only has partial
 * data), and what's submitted here is what gets snapshotted onto loonars_akad_schedules and sent to the
 * notary, not whatever the original purchase happened to have.
 */
export const akadScheduleRequestSchema = z.object({
  purchaseId: z.string().uuid(),
  buyerName: z.string().min(2, "Nama pembeli minimal 2 karakter").max(200),
  nik: z
    .string()
    .min(1, "NIK wajib diisi")
    .regex(/^\d{16}$/, "NIK harus 16 digit angka"),
  phone: z.string().min(1, "Nomor HP wajib diisi").regex(NOTARIS_PHONE_REGEX, "Nomor HP tidak valid (contoh: 081234567890)"),
  address: z.string().min(5, "Alamat wajib diisi").max(500),
  ktpPhotoPath: z.string().min(1, "Foto KTP wajib diunggah"),
  tanggalAkad: z.string().min(1, "Tanggal akad wajib diisi"),
  notes: z.string().max(1000).optional(),
});
export type AkadScheduleRequestInput = z.infer<typeof akadScheduleRequestSchema>;

export const akadScheduleConfirmSchema = z.object({
  id: z.string().uuid(),
  tanggalAkadFinal: z.string().min(1, "Tanggal akad final wajib diisi"),
});
export type AkadScheduleConfirmInput = z.infer<typeof akadScheduleConfirmSchema>;
