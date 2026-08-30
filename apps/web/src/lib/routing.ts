/**
 * Locale routing. Every locale is prefixed, including the default:
 * /en/… , /ar/… . A bare / redirects to the default.
 *
 * Leaving the default unprefixed saves one path segment and costs duplicate-content
 * ambiguity plus a special case in every URL helper. With up to seven locales,
 * consistency wins.
 */
export const DEFAULT_LOCALE = "en";

/** Kept in sync with the Locale table by the middleware's enabled-locale check. */
export const KNOWN_LOCALES = ["en", "ar", "de", "ru", "fr"] as const;
export type KnownLocale = (typeof KNOWN_LOCALES)[number];

export const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

export function dirFor(locale: string): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function isKnownLocale(value: string): value is KnownLocale {
  return (KNOWN_LOCALES as readonly string[]).includes(value);
}
