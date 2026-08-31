import { z } from "zod";

/** Reserved by system routes — no content slug may shadow one. */
export const RESERVED_SLUGS = new Set([
  "resorts", "offers", "experiences", "diving", "weddings", "search",
  "book", "booking", "my-booking", "destinations", "api", "sitemap.xml", "robots.txt",
]);

export const slugSchema = z
  .string()
  .min(1, "A slug is required")
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

/** Transliterate loosely, then normalise. Arabic and Cyrillic land on Latin. */
export function suggestSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
