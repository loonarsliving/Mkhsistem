import { beforeEach, describe, expect, it, vi } from "vitest";

const { download, upload, getPublicUrl, remove, rpc } = vi.hoisted(() => ({
  download: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ download, upload, getPublicUrl, remove }) }, rpc }),
}));

import { cleanupWaOutbox, stageWaOutboxFile } from "@/lib/wa-media/outbox";

beforeEach(() => {
  for (const f of [download, upload, getPublicUrl, remove, rpc]) f.mockReset();
});

describe("stageWaOutboxFile", () => {
  it("copies the private file under a random name and returns its short public URL", async () => {
    download.mockResolvedValueOnce({ data: new Blob([new Uint8Array(10)], { type: "image/jpeg" }), error: null });
    upload.mockResolvedValueOnce({ error: null });
    getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/wa-outbox/${path}` } }));

    const url = await stageWaOutboxFile("hospitality-evidence", "conv/user/1700000000000-Foto Villa.JPG");
    expect(url).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/wa-outbox\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(url).not.toContain("?");
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "image/jpeg", upsert: false });
  });

  it("throws when the source cannot be read or the copy fails", async () => {
    download.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    await expect(stageWaOutboxFile("hospitality-evidence", "a/b.jpg")).rejects.toThrow(/source file unavailable/);
    download.mockResolvedValueOnce({ data: new Blob([new Uint8Array(1)]), error: null });
    upload.mockResolvedValueOnce({ error: { message: "quota" } });
    await expect(stageWaOutboxFile("hospitality-evidence", "a/b.png")).rejects.toThrow(/copy failed/);
  });
});

describe("cleanupWaOutbox", () => {
  it("removes the copies the database lists as due", async () => {
    rpc.mockResolvedValueOnce({ data: ["2026-10-24/a.jpg", "2026-10-24/b.jpg"], error: null });
    remove.mockResolvedValueOnce({ data: [{ name: "2026-10-24/a.jpg" }, { name: "2026-10-24/b.jpg" }], error: null });
    await expect(cleanupWaOutbox()).resolves.toEqual({ deleted: 2 });
    expect(remove).toHaveBeenCalledWith(["2026-10-24/a.jpg", "2026-10-24/b.jpg"]);
  });

  it("does nothing when nothing is due and never throws", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(cleanupWaOutbox()).resolves.toEqual({ deleted: 0 });
    rpc.mockRejectedValueOnce(new Error("down"));
    await expect(cleanupWaOutbox()).resolves.toEqual({ deleted: 0, error: "down" });
  });
});
