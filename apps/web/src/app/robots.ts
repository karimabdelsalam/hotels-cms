import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The booking flow and personal-data pages are never indexed.
        disallow: ["/api/", "/*/book/", "/*/booking/", "/*/my-booking"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
