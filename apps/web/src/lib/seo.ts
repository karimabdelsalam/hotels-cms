import type { Metadata } from "next";
import { getEnabledLocales } from "@fantazia/db/content";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Self-referencing canonical plus an hreflang set across enabled locales.
 *
 * `paths` may be one path shared by every locale, or a per-locale map — entity
 * pages have a different slug in each language, and pointing German at the
 * English slug is the classic multilingual SEO bug.
 */
export async function alternatesFor(
  locale: string,
  paths: string | Record<string, string> = "",
  prefix = "",
): Promise<Metadata["alternates"]> {
  const locales = await getEnabledLocales();

  const pathFor = (code: string): string => {
    const raw = typeof paths === "string" ? paths : (paths[code] ?? paths.en ?? "");
    const full = [prefix, raw].filter(Boolean).join("/");
    return full ? `/${full}` : "";
  };

  const languages = Object.fromEntries(
    locales.map((l) => [l.code, `${BASE}/${l.code}${pathFor(l.code)}`]),
  );

  return {
    canonical: `${BASE}/${locale}${pathFor(locale)}`,
    languages: { ...languages, "x-default": `${BASE}/en${pathFor("en")}` },
  };
}

/** schema.org Resort, so a property page can rank on its own. */
export function resortJsonLd(input: {
  name: string;
  description?: string | null;
  url: string;
  starRating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  priceCurrency?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Resort",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: input.url,
    ...(input.starRating
      ? { starRating: { "@type": "Rating", ratingValue: input.starRating } }
      : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: input.city ?? "Marsa Alam",
      addressCountry: "EG",
    },
    ...(input.latitude && input.longitude
      ? { geo: { "@type": "GeoCoordinates", latitude: input.latitude, longitude: input.longitude } }
      : {}),
    ...(input.priceCurrency ? { priceRange: input.priceCurrency } : {}),
  };
}
