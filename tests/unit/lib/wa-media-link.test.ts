import { beforeAll, describe, expect, it } from "vitest";

import { createWaMediaUrl, readWaMediaToken } from "@/lib/wa-media/link";

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const PATH = "11111111-1111-4111-8111-111111111111/1700000000000-foto.jpg";

function tokenOf(url: string): string {
  return url.split("/api/wa-media/")[1].split("/")[0];
}

describe("wa-media short links", () => {
  it("builds a query-free link that resolves back to the bucket and path", () => {
    const url = createWaMediaUrl("refund-transfer-proofs", PATH, 3600);
    expect(url).not.toContain("?");
    expect(url.endsWith("/file.jpg")).toBe(true);
    expect(readWaMediaToken(tokenOf(url))).toEqual({ bucket: "refund-transfer-proofs", path: PATH });
  });

  it("rejects a tampered or expired token", () => {
    const token = tokenOf(createWaMediaUrl("refund-transfer-proofs", PATH, 3600));
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ b: "refund-transfer-proofs", p: "other/x.jpg", e: 9999999999 })).toString("base64url");
    expect(readWaMediaToken(`${forged}.${sig}`)).toBeNull();
    expect(readWaMediaToken(`${payload}.x${sig.slice(1)}`)).toBeNull();
    expect(readWaMediaToken(token, Date.now() + 2 * 3600 * 1000)).toBeNull();
  });

  it("only signs allowed buckets", () => {
    expect(() => createWaMediaUrl("attendance-selfies", PATH, 60)).toThrow();
  });
});
