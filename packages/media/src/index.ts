/**
 * Media URLs.
 *
 * Two deployment shapes are supported, and the difference is one env var:
 *
 *   MEDIA_URL_BASE set   — files live under a directory the web server serves
 *                          directly (on cPanel, somewhere under public_html).
 *                          Node is never in the request path, which is the
 *                          fastest and cheapest option.
 *   MEDIA_URL_BASE unset — the app streams them from /media/… itself. Fine for
 *                          development and for hosts without static mounts.
 */
export const VARIANTS = {
  thumb: 320,
  card: 800,
  wide: 1600,
  hero: 2400,
} as const;

export type Variant = keyof typeof VARIANTS;

export function mediaUrl(storageKey: string, variant?: Variant, ext: "avif" | "webp" = "webp") {
  const base = process.env.NEXT_PUBLIC_MEDIA_URL_BASE ?? "/media";
  const clean = base.replace(/\/+$/, "");
  return variant ? `${clean}/${storageKey}/${variant}.${ext}` : `${clean}/${storageKey}/original`;
}

/** srcSet across the variants, so the browser picks the right one. */
export function mediaSrcSet(storageKey: string, ext: "avif" | "webp" = "webp") {
  return (Object.keys(VARIANTS) as Variant[])
    .map((v) => `${mediaUrl(storageKey, v, ext)} ${VARIANTS[v]}w`)
    .join(", ");
}
