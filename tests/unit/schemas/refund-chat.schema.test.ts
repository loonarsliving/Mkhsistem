import { describe, expect, it } from "vitest";

import { sendRefundChatSchema } from "@/features/refund/schemas/refund.schema";

const customerId = "11111111-1111-4111-8111-111111111111";

describe("sendRefundChatSchema", () => {
  it("accepts text, a photo with caption, and a photo without caption", () => {
    expect(sendRefundChatSchema.safeParse({ customerId, message: "Halo" }).success).toBe(true);
    expect(sendRefundChatSchema.safeParse({ customerId, message: "Bukti", mediaPath: `${customerId}/1-foto.jpg` }).success).toBe(true);
    expect(sendRefundChatSchema.safeParse({ customerId, message: "", mediaPath: `${customerId}/1-foto.jpg` }).success).toBe(true);
  });

  it("rejects an empty message without a photo", () => {
    expect(sendRefundChatSchema.safeParse({ customerId, message: "  " }).success).toBe(false);
  });

  it("rejects a photo outside this customer's folder", () => {
    expect(sendRefundChatSchema.safeParse({ customerId, message: "", mediaPath: "22222222-2222-4222-8222-222222222222/x.jpg" }).success).toBe(false);
    expect(sendRefundChatSchema.safeParse({ customerId, message: "", mediaPath: `${customerId}/../other/x.jpg` }).success).toBe(false);
  });
});
