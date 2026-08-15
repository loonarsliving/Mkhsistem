import { z } from "zod";

export const submitPurchaseRequestSchema = z.object({
  projectId: z.string().uuid(),
  materialId: z.string().uuid("Pilih material"),
  requestedQuantity: z.number().positive("Jumlah harus lebih dari 0"),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type SubmitPurchaseRequestInput = z.infer<typeof submitPurchaseRequestSchema>;

export const decidePurchaseRequestSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type DecidePurchaseRequestInput = z.infer<typeof decidePurchaseRequestSchema>;
