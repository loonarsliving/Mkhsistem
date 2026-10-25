import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, sendWhatsAppText } = vi.hoisted(() => ({ rpc: vi.fn(), sendWhatsAppText: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/ai/notifications/engine", () => ({ sendWhatsAppText }));

import { tryCaptureWaLeadForProject, tryCaptureWaLeadMessage } from "@/lib/ai/domains/wa-lead-chat";
import { departmentKind, isPlainChat } from "@/lib/connect/labels";
import { formatWait, minutesSince } from "@/features/chat/components/wa-lead";

const GREETING = "Terima kasih telah menghubungi Loonars, sales terbaik kami akan segera menghubungi Anda.";

beforeEach(() => {
  rpc.mockReset();
  sendWhatsAppText.mockReset();
});

describe("tryCaptureWaLeadMessage", () => {
  it("leaves the existing flow alone when the database does not take the message", async () => {
    rpc.mockResolvedValueOnce({ data: { handled: false }, error: null });
    await expect(tryCaptureWaLeadMessage("6281200001111", "Budi", { kind: "text", text: "halo" }, null)).resolves.toEqual({ outcome: "not_applicable" });
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("falls back when the RPC fails or throws, never breaking the webhook", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(tryCaptureWaLeadMessage("6281200001111", undefined, { kind: "text", text: "halo" }, "ad-1")).resolves.toEqual({ outcome: "not_applicable" });
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(tryCaptureWaLeadMessage("6281200001111", undefined, { kind: "text", text: "halo" }, "ad-1")).resolves.toEqual({ outcome: "not_applicable" });
  });

  it("greets a new lead once and records the greeting with its delivery result", async () => {
    rpc
      .mockResolvedValueOnce({ data: { handled: true, lead_id: "L1", conversation_id: "C1", is_new: true, greeting: GREETING }, error: null })
      .mockResolvedValueOnce({ data: "M1", error: null });
    sendWhatsAppText.mockResolvedValueOnce({ success: true });

    const r = await tryCaptureWaLeadMessage("6281200001111", "Budi", { kind: "text", text: "info villa" }, "ad-1");
    expect(r).toEqual({ outcome: "captured", leadId: "L1", conversationId: "C1", isNew: true });
    expect(rpc).toHaveBeenNthCalledWith(1, "mkc_wa_lead_inbound", {
      p_phone: "6281200001111",
      p_name: "Budi",
      p_body: "info villa",
      p_media_url: null,
      p_ad_source_id: "ad-1",
      p_project_id: null,
    });
    expect(sendWhatsAppText).toHaveBeenCalledWith("6281200001111", GREETING);
    expect(rpc).toHaveBeenNthCalledWith(2, "mkc_wa_lead_record_system_out", { p_lead_id: "L1", p_body: GREETING, p_ok: true, p_error: null });
  });

  it("records a greeting that WhatsApp did not deliver as failed", async () => {
    rpc
      .mockResolvedValueOnce({ data: { handled: true, lead_id: "L1", conversation_id: "C1", is_new: true, greeting: GREETING }, error: null })
      .mockResolvedValueOnce({ data: "M1", error: null });
    sendWhatsAppText.mockResolvedValueOnce({ success: false, error: "device offline" });
    await tryCaptureWaLeadMessage("6281200001111", undefined, { kind: "text", text: "halo" }, "ad-1");
    expect(rpc).toHaveBeenNthCalledWith(2, "mkc_wa_lead_record_system_out", { p_lead_id: "L1", p_body: GREETING, p_ok: false, p_error: "device offline" });
  });

  it("does not greet again on a follow-up message, and passes photos through", async () => {
    rpc.mockResolvedValueOnce({ data: { handled: true, lead_id: "L1", conversation_id: "C1", is_new: false }, error: null });
    const r = await tryCaptureWaLeadMessage("6281200001111", undefined, { kind: "image", url: "https://wa/x.jpg", caption: "ini" }, null);
    expect(r).toEqual({ outcome: "captured", leadId: "L1", conversationId: "C1", isNew: false });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_body: "ini", p_media_url: "https://wa/x.jpg" });
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});

describe("tryCaptureWaLeadForProject", () => {
  it("opens the lead by the project the customer chose", async () => {
    rpc.mockResolvedValueOnce({ data: { handled: false }, error: null });
    await tryCaptureWaLeadForProject("6281200001111", "Budi", "1", "P1");
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_ad_source_id: null, p_project_id: "P1", p_body: "1" });
  });
});

describe("lead department and wait labels", () => {
  it("treats lead_wa_* departments as a plain WhatsApp lead chat", () => {
    expect(departmentKind("lead_wa_jogja")).toBe("wa_lead");
    expect(isPlainChat("wa_lead")).toBe(true);
    expect(departmentKind("sales_jogja")).toBe("sales");
  });

  it("formats how long a customer has been waiting", () => {
    const now = Date.parse("2026-10-25T10:00:00Z");
    expect(minutesSince(null, now)).toBeNull();
    expect(minutesSince("2026-10-25T09:43:30Z", now)).toBe(16);
    expect(formatWait(16)).toBe("16 mnt");
    expect(formatWait(95)).toBe("1 jam 35 mnt");
    expect(formatWait(60 * 50)).toBe("2 hari");
  });
});
