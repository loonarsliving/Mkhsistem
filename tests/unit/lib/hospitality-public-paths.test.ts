import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/supabase/middleware";

/**
 * pg_cron calls these via automation_post() with x-cron-secret and no login
 * session. If they were not public paths, middleware would 307 them to
 * /login and no report or cleanup would ever run (the 0096 class of bug).
 */
describe("hospitality cron routes bypass session middleware", () => {
  it.each(["/api/hospitality/reports/dispatch", "/api/hospitality/retention"])("%s is public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it("does not expose the chat page itself", () => {
    expect(isPublicPath("/chat")).toBe(false);
  });
});
