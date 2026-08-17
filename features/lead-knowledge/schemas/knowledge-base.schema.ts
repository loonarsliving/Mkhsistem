import { z } from "zod";

export const KNOWLEDGE_BASE_KATEGORI = [
  "harga",
  "unit",
  "fasilitas",
  "pembayaran",
  "lainnya",
] as const;

export const KNOWLEDGE_BASE_KATEGORI_LABEL: Record<
  (typeof KNOWLEDGE_BASE_KATEGORI)[number],
  string
> = {
  harga: "Harga",
  unit: "Unit",
  fasilitas: "Fasilitas",
  pembayaran: "Skema Pembayaran",
  lainnya: "Lainnya",
};

export const knowledgeBaseSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid("Project wajib dipilih"),
  kategori: z.enum(KNOWLEDGE_BASE_KATEGORI, { required_error: "Kategori wajib dipilih" }),
  pertanyaanUmum: z.string().min(5, "Pertanyaan minimal 5 karakter").max(500),
  jawaban: z.string().min(2, "Jawaban minimal 2 karakter").max(4000),
});
export type KnowledgeBaseInput = z.infer<typeof knowledgeBaseSchema>;
