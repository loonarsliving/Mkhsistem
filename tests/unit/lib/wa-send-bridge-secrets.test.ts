import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/notifications/engine", () => ({
  sendWhatsAppText: vi.fn(async () => ({ success: true })),
  sendWhatsAppImage: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/lib/security/rate-limit", () => ({ getClientIp: () => "1.1.1.1", recordAuthFailure: () => false }));

import { POST } from "@/app/api/wa/send/route";

function req(secret: string) {
  return new Request("https://x/api/wa/send", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify({ phone: "6281234567890", message: "halo" }),
  });
}

describe("/api/wa/send — rahasia villa & advisor terpisah", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.VILLA_BRIDGE_SECRET = "villa-secret";
    process.env.ADVISOR_BRIDGE_SECRET = "a".repeat(40);
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("rahasia villa tetap diterima (perilaku lama)", async () => {
    expect((await POST(req("villa-secret"))).status).not.toBe(401);
  });
  it("rahasia advisor diterima", async () => {
    expect((await POST(req("a".repeat(40)))).status).not.toBe(401);
  });
  it("rahasia lain ditolak", async () => {
    expect((await POST(req("salah"))).status).toBe(401);
  });
  it("rahasia advisor pendek diabaikan", async () => {
    process.env.ADVISOR_BRIDGE_SECRET = "pendek";
    expect((await POST(req("pendek"))).status).toBe(401);
  });
  it("tanpa rahasia villa & advisor tetap 503 seperti sebelumnya", async () => {
    process.env.VILLA_BRIDGE_SECRET = "";
    process.env.ADVISOR_BRIDGE_SECRET = "";
    expect((await POST(req("x"))).status).toBe(503);
  });
});
