import { describe, expect, it } from "vitest";

import { EMPTY_IMAGE_CAPTION, WhatsAppConnector } from "@/lib/ai/connectors/whatsapp-connector";
import type { WhatsAppHttpClient } from "@/lib/ai/connectors/whatsapp-http-client";

const connector = new WhatsAppConnector(
  { accessToken: "", phoneNumberId: "", businessAccountId: "", verifyToken: "", whacenterDeviceId: "dev" },
  {} as WhatsAppHttpClient,
);

describe("WhatsAppConnector image messages", () => {
  it("keeps a real caption", () => {
    expect(connector.normalizeOutgoingMessage({ kind: "image", url: "https://x/a.jpg", caption: "Rate hari ini" })).toEqual({
      message: "Rate hari ini",
      file: "https://x/a.jpg",
    });
  });

  it("never sends a photo with an empty message (Whacenter rejects it)", () => {
    for (const caption of [undefined, "", "   "]) {
      expect(connector.normalizeOutgoingMessage({ kind: "image", url: "https://x/a.jpg", caption })).toEqual({
        message: EMPTY_IMAGE_CAPTION,
        file: "https://x/a.jpg",
      });
    }
  });
});
