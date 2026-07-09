import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger, serializeError } from "@/lib/logger";

describe("logger", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv ?? "test");
    vi.restoreAllMocks();
  });

  it("writes a single JSON line to the matching console method", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("something broke", { orderId: "abc" });

    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({
      level: "error",
      message: "something broke",
      environment: "production",
      context: { orderId: "abc" },
    });
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("omits the context key when no context is given", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("no context here");

    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed).not.toHaveProperty("context");
  });

  it("routes each level to its own console method", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    logger.warn("careful");
    logger.debug("details");

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(debugSpy).toHaveBeenCalledOnce();
  });
});

describe("serializeError", () => {
  it("extracts message, stack and name from an Error instance", () => {
    const err = new TypeError("bad type");
    const result = serializeError(err);
    expect(result.name).toBe("TypeError");
    expect(result.message).toBe("bad type");
    expect(result.stack).toContain("TypeError");
  });

  it("wraps a plain string", () => {
    expect(serializeError("plain failure").message).toBe("plain failure");
  });

  it("JSON-stringifies non-Error, non-string values", () => {
    expect(serializeError({ code: 42 }).message).toBe('{"code":42}');
  });
});
