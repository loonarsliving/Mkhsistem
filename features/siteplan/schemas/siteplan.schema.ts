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

export const siteplanProjectSchema = z.object({
  id: z.string().uuid().optional(),
  kode: z.string().min(1, "Kode wajib diisi").max(50),
  nama: z.string().min(2, "Nama minimal 2 karakter").max(200),
  lokasi: z.string().max(300).optional(),
  warna: z.string().max(20).optional(),
});
export type SiteplanProjectInput = z.infer<typeof siteplanProjectSchema>;

export const siteplanUnitSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  blok: z.string().min(1, "Kode unit wajib diisi").max(50),
  tipe: z.string().max(100).optional(),
  harga: z.coerce.number().nonnegative().optional(),
  luas: z.coerce.number().nonnegative().optional(),
});
export type SiteplanUnitInput = z.infer<typeof siteplanUnitSchema>;
