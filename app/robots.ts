import type { MetadataRoute } from "next";

import { APP_URL } from "@/constants/app";

/**
 * Internal company system, not a public site — disallow indexing entirely
 * rather than trying to carve out which routes are "safe" to crawl.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
