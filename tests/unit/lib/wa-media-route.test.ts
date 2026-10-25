import { beforeAll, describe, expect, it, vi } from "vitest";

const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ download }) } }) }));

import { GET } from "@/app/api/wa-media/[token]/[name]/route";
import { createWaMediaUrl } from "@/lib/wa-media/link";

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const call = (token: string) => GET(new Request("https://x/api/wa-media/t/file.jpg"), { params: Promise.resolve({ token, name: "file.jpg" }) });
const tokenOf = (url: string) => url.split("/api/wa-media/")[1].split("/")[0];

describe("wa-media route", () => {
  it("serves the whole file with its exact length and an image type", async () => {
    const bytes = new Uint8Array(1234).fill(7);
    download.mockResolvedValueOnce({ data: new Blob([bytes], { type: "" }), error: null });
    const res = await call(tokenOf(createWaMediaUrl("hospitality-evidence", "c/u/1700000000000-foto.jpg", 3600)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("1234");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect((await res.arrayBuffer()).byteLength).toBe(1234);
  });

  it("answers 404 for a forged token without touching storage", async () => {
    download.mockClear();
    const res = await call("abc.def");
    expect(res.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
});
