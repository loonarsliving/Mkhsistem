import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/supabase/middleware";

/**
 * Every app/api/villa/ai/* route is called server-to-server by villa with
 * x-internal-secret, never with a login session. A route missing from
 * PUBLIC_PATHS gets 307'd to /login and villa only sees "gagal: HTTP 200" --
 * this happened to five of them before this test existed.
 */
describe("villa AI bridge routes are reachable without a session", () => {
  const dir = join(process.cwd(), "app/api/villa/ai");
  const routes = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `/api/villa/ai/${d.name}`);

  it("finds the bridge routes", () => {
    expect(routes).toContain("/api/villa/ai/chat-reply");
    expect(routes).toContain("/api/villa/ai/translate");
  });

  it.each(routes)("%s is a public path", (route) => {
    expect(isPublicPath(route)).toBe(true);
  });
});
