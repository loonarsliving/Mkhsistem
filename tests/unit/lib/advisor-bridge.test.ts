import { describe, expect, it } from "vitest";

import {
  ADVISOR_BELUM_TERSAMBUNG_TEXT,
  ADVISOR_DITERIMA_TEXT,
  ADVISOR_GAGAL_TEXT,
  forwardToAdvisor,
  isAdvisorMessage,
} from "@/lib/ai/domains/advisor-bridge";

describe("advisor bridge", () => {
  it("hanya pesan berawalan advisor/mentor yang diteruskan", () => {
    expect(isAdvisorMessage("advisor: apa fokus saya?")).toBe(true);
    expect(isAdvisorMessage("Mentor keputusan saya")).toBe(true);
    expect(isAdvisorMessage("okupansi villa hari ini?")).toBe(false);
    expect(isAdvisorMessage("advisornya siapa")).toBe(false);
  });

  it("tanpa konfigurasi lengkap tidak memanggil apa pun", async () => {
    let called = false;
    const f = (async () => { called = true; return new Response(null, { status: 202 }); }) as typeof fetch;
    expect(await forwardToAdvisor("6281", "advisor x", { url: "", secret: "s".repeat(40), fetchImpl: f })).toBe(ADVISOR_BELUM_TERSAMBUNG_TEXT);
    expect(await forwardToAdvisor("6281", "advisor x", { url: "https://a", secret: "pendek", fetchImpl: f })).toBe(ADVISOR_BELUM_TERSAMBUNG_TEXT);
    expect(called).toBe(false);
  });

  it("meneruskan nomor & pesan apa adanya dengan rahasia advisor", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
    const out = await forwardToAdvisor("6281234567890", "advisor: apa fokus saya?", { url: "https://advisor.example/", secret: "s".repeat(40), fetchImpl: f });
    expect(out).toBe(ADVISOR_DITERIMA_TEXT);
    expect(seen!.url).toBe("https://advisor.example/api/advisor/pesan");
    expect((seen!.init.headers as Record<string, string>)["x-advisor-bridge-secret"]).toBe("s".repeat(40));
    expect(JSON.parse(seen!.init.body as string)).toEqual({ nomor: "6281234567890", pesan: "advisor: apa fokus saya?" });
  });

  it("gagal dihubungi dijawab jujur", async () => {
    const f = (async () => { throw new Error("down"); }) as typeof fetch;
    expect(await forwardToAdvisor("6281", "advisor x", { url: "https://a", secret: "s".repeat(40), fetchImpl: f })).toBe(ADVISOR_GAGAL_TEXT);
    const g = (async () => new Response(null, { status: 401 })) as typeof fetch;
    expect(await forwardToAdvisor("6281", "advisor x", { url: "https://a", secret: "s".repeat(40), fetchImpl: g })).toBe(ADVISOR_GAGAL_TEXT);
  });
});
