import type { MetadataRoute } from "next";
import { getEnabledLocales, getSitemapEntries } from "@fantazia/db/content";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Only enabled locales appear. A locale still behind the translation publish
 * gate is absent from the sitemap and from every hreflang set, so a
 * half-translated site is never offered to search engines.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = await getEnabledLocales();
  const codes = locales.map((l) => l.code);
  const entries = await getSitemapEntries(codes);

  const url = (code: string, path: string) => `${BASE}/${code}${path ? `/${path}` : ""}`;

  return entries.flatMap((entry) =>
    codes.map((code) => ({
      url: url(code, entry.paths[code] ?? ""),
      lastModified: entry.updatedAt,
      alternates: {
        languages: {
          ...Object.fromEntries(codes.map((c) => [c, url(c, entry.paths[c] ?? "")])),
          "x-default": url("en", entry.paths.en ?? ""),
        },
      },
    })),
  );
}
