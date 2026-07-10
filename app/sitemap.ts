import type { MetadataRoute } from "next";

import { APP_URL } from "@/constants/app";

/**
 * Only the truly public, unauthenticated routes belong here — everything
 * else requires a session and has no business being crawled or listed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/login", "/register", "/forgot-password"];
  return routes.map((route) => ({
    url: `${APP_URL}${route}`,
    lastModified: new Date(),
  }));
}
