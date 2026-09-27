import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forwardToVillaChat } from "@/lib/ai/domains/villa-chat-mirror";

const RAW = JSON.stringify({ pushName: "Bunga", from: "0811400441", to: "6282228885223", message: "Halo", is_group: false });

describe("forwardToVillaChat", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VILLA_BRIDGE_SECRET", "rahasia-uji");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the raw Whacenter body unchanged, with the shared secret", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await forwardToVillaChat(RAW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://living.haluoleo.id/api/wa/mirror");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(RAW);
    expect(init.headers["x-internal-secret"]).toBe("rahasia-uji");
  });

  it("does nothing without the secret", async () => {
    vi.stubEnv("VILLA_BRIDGE_SECRET", "");
    await forwardToVillaChat(RAW);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for an empty body", async () => {
    await forwardToVillaChat("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when villa is down", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(forwardToVillaChat(RAW)).resolves.toBeUndefined();
  });

  it("never throws when villa rejects the request", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(forwardToVillaChat(RAW)).resolves.toBeUndefined();
  });
});
