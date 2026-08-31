/**
 * Typed content queries for the public site.
 *
 * Every query takes a locale and falls back per field to the default locale —
 * a resort with a translated name but no translated description shows the
 * translated name and the English description, rather than a blank page.
 */
import { prisma } from "./index";

export const DEFAULT_LOCALE = "en";

type Trans = { localeCode: string } & Record<string, unknown>;

/** Pick the row for `locale`, else the default-locale row, else the first present. */
export function pick<T extends Trans>(rows: T[], locale: string): T | undefined {
  return (
    rows.find((r) => r.localeCode === locale) ??
    rows.find((r) => r.localeCode === DEFAULT_LOCALE) ??
    rows[0]
  );
}

/** Field-level fallback: the localised value if it is present and non-empty, else the default. */
export function field<T extends Trans>(rows: T[], locale: string, key: keyof T): string | null {
  const local = rows.find((r) => r.localeCode === locale);
  const value = local?.[key];
  if (typeof value === "string" && value.trim()) return value;
  const fallback = rows.find((r) => r.localeCode === DEFAULT_LOCALE)?.[key];
  return typeof fallback === "string" && fallback.trim() ? fallback : null;
}

export type Brand = {
  /** Full legal-ish name, used in titles and the footer. */
  name: string;
  /** The wordmark, set in the display face. Usually the name in capitals. */
  wordmark: string;
  /** Where the group is, translated. */
  location: string;
  tagline: string | null;
};

const BRAND_FALLBACK: Brand = {
  name: "Fantazia Hotels",
  wordmark: "FANTAZIA",
  location: "Marsa Alam",
  tagline: null,
};

/**
 * The group's own name is content, not a constant. It appears in the header,
 * the footer, every page title and every email, so it lives in one row and is
 * edited in admin rather than being found and replaced across the codebase.
 */
export async function getBrand(locale: string): Promise<Brand> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["brand.name", "brand.wordmark", "brand.location", "brand.tagline"] } },
  });

  const read = (key: string): string | null => {
    const value = rows.find((r) => r.key === key)?.value;
    if (typeof value === "string") return value.trim() || null;
    // A per-locale object, for the fields that are translated.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const map = value as Record<string, unknown>;
      const local = map[locale];
      if (typeof local === "string" && local.trim()) return local;
      const fallback = map[DEFAULT_LOCALE];
      if (typeof fallback === "string" && fallback.trim()) return fallback;
    }
    return null;
  };

  return {
    name: read("brand.name") ?? BRAND_FALLBACK.name,
    wordmark: read("brand.wordmark") ?? BRAND_FALLBACK.wordmark,
    location: read("brand.location") ?? BRAND_FALLBACK.location,
    tagline: read("brand.tagline"),
  };
}

export async function getEnabledLocales() {
  return prisma.locale.findMany({
    where: { isEnabled: true },
    orderBy: { displayOrder: "asc" },
  });
}

export async function getModules() {
  const rows = await prisma.siteModule.findMany({ orderBy: { displayOrder: "asc" } });
  return {
    all: rows,
    enabled: (key: string) => rows.find((m) => m.key === key)?.enabled ?? false,
  };
}

export async function getResorts(locale: string) {
  const rows = await prisma.resort.findMany({
    where: { status: "published" },
    orderBy: { displayOrder: "asc" },
    include: {
      translations: true,
      destination: { include: { translations: true } },
      amenities: { include: { amenity: { include: { translations: true } } } },
      heroMedia: { include: { translations: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    stars: r.starRating,
    fromRateMinor: r.fromRateMinor,
    currency: r.currency,
    slug: field(r.translations, locale, "slug") ?? r.code.toLowerCase(),
    name: field(r.translations, locale, "name") ?? r.code,
    tagline: field(r.translations, locale, "tagline"),
    shortDescription: field(r.translations, locale, "shortDescription"),
    description: field(r.translations, locale, "description"),
    destination: field(r.destination.translations, locale, "name"),
    hero: r.heroMedia
      ? {
          storageKey: r.heroMedia.storageKey,
          alt: field(r.heroMedia.translations, locale, "alt") ?? "",
          placeholder: r.heroMedia.placeholder,
          focalX: r.heroMedia.focalX,
          focalY: r.heroMedia.focalY,
        }
      : null,
    amenities: r.amenities
      .map((a) => field(a.amenity.translations, locale, "name"))
      .filter((n): n is string => Boolean(n)),
  }));
}

export async function getResortBySlug(locale: string, slug: string) {
  const match = await prisma.resortTranslation.findFirst({
    where: { slug },
    select: { resortId: true },
  });
  if (!match) return null;

  const r = await prisma.resort.findUnique({
    where: { id: match.resortId },
    include: {
      translations: true,
      destination: { include: { translations: true } },
      amenities: { include: { amenity: { include: { translations: true } } } },
      heroMedia: { include: { translations: true } },
      roomTypes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        include: {
          translations: true,
          media: {
            orderBy: { displayOrder: "asc" },
            include: { media: { include: { translations: true } } },
          },
        },
      },
    },
  });
  if (!r || r.status !== "published") return null;

  return {
    id: r.id,
    code: r.code,
    stars: r.starRating,
    currency: r.currency,
    checkInTime: r.checkInTime,
    checkOutTime: r.checkOutTime,
    fromRateMinor: r.fromRateMinor,
    latitude: r.latitude,
    longitude: r.longitude,
    slug: field(r.translations, locale, "slug") ?? slug,
    name: field(r.translations, locale, "name") ?? r.code,
    tagline: field(r.translations, locale, "tagline"),
    shortDescription: field(r.translations, locale, "shortDescription"),
    description: field(r.translations, locale, "description"),
    metaTitle: field(r.translations, locale, "metaTitle"),
    metaDescription: field(r.translations, locale, "metaDescription"),
    destination: field(r.destination.translations, locale, "name"),
    hero: r.heroMedia
      ? {
          storageKey: r.heroMedia.storageKey,
          alt: field(r.heroMedia.translations, locale, "alt") ?? "",
          placeholder: r.heroMedia.placeholder,
          focalX: r.heroMedia.focalX,
          focalY: r.heroMedia.focalY,
        }
      : null,
    amenities: r.amenities
      .map((a) => field(a.amenity.translations, locale, "name"))
      .filter((n): n is string => Boolean(n)),
    rooms: r.roomTypes.map((rt) => ({
      id: rt.id,
      slug: field(rt.translations, locale, "slug") ?? rt.id,
      name: field(rt.translations, locale, "name") ?? "",
      description: field(rt.translations, locale, "description"),
      maxOccupancy: rt.maxOccupancy,
      maxAdults: rt.maxAdults,
      maxChildren: rt.maxChildren,
      sizeSqm: rt.sizeSqm,
      bedConfig: rt.bedConfig,
      fromRateMinor: rt.fromRateMinor,
      // Alt text falls back through the locale chain like any other field, so a
      // photo described only in English is still described in Arabic rather
      // than reaching a screen reader empty.
      images: rt.media.map((m) => ({
        storageKey: m.media.storageKey,
        alt: field(m.media.translations, locale, "alt") ?? "",
        placeholder: m.media.placeholder,
        focalX: m.media.focalX,
        focalY: m.media.focalY,
      })),
    })),
  };
}

export async function getExperiences(locale: string) {
  const rows = await prisma.experience.findMany({
    where: { status: "published" },
    orderBy: { displayOrder: "asc" },
    include: { translations: true },
  });
  return rows.map((x) => ({
    id: x.id,
    code: x.code,
    category: x.category,
    slug: field(x.translations, locale, "slug") ?? x.code.toLowerCase(),
    name: field(x.translations, locale, "name") ?? x.code,
    summary: field(x.translations, locale, "summary"),
  }));
}

export async function getExperienceBySlug(locale: string, slug: string) {
  const match = await prisma.experienceTranslation.findFirst({
    where: { slug },
    select: { experienceId: true },
  });
  if (!match) return null;

  const x = await prisma.experience.findUnique({
    where: { id: match.experienceId },
    include: { translations: true },
  });
  if (!x || x.status !== "published") return null;

  return {
    id: x.id,
    code: x.code,
    category: x.category,
    durationHours: x.durationHours,
    priceMinor: x.priceMinor,
    slug: field(x.translations, locale, "slug") ?? slug,
    name: field(x.translations, locale, "name") ?? x.code,
    summary: field(x.translations, locale, "summary"),
    description: field(x.translations, locale, "description"),
  };
}

export async function getOfferBySlug(locale: string, slug: string) {
  const match = await prisma.offerTranslation.findFirst({
    where: { slug },
    select: { offerId: true },
  });
  if (!match) return null;

  const o = await prisma.offer.findUnique({
    where: { id: match.offerId },
    include: { translations: true },
  });
  if (!o || o.status !== "published") return null;

  return {
    id: o.id,
    resortId: o.resortId,
    promoCode: o.promoCode,
    slug: field(o.translations, locale, "slug") ?? slug,
    title: field(o.translations, locale, "title") ?? "",
    summary: field(o.translations, locale, "summary"),
    description: field(o.translations, locale, "description"),
    terms: field(o.translations, locale, "terms"),
    validityLabel: field(o.translations, locale, "validityLabel"),
  };
}

/**
 * Every locale's slug for one entity, so hreflang and the language switcher
 * point at the same page in the other language rather than at the English
 * slug — the detail most multilingual sites get wrong.
 */
export async function getEntitySlugs(
  kind: "resort" | "experience" | "offer" | "page",
  id: string,
): Promise<Record<string, string>> {
  const rows =
    kind === "resort"
      ? await prisma.resortTranslation.findMany({
          where: { resortId: id },
          select: { localeCode: true, slug: true },
        })
      : kind === "experience"
        ? await prisma.experienceTranslation.findMany({
            where: { experienceId: id },
            select: { localeCode: true, slug: true },
          })
        : kind === "offer"
          ? await prisma.offerTranslation.findMany({
              where: { offerId: id },
              select: { localeCode: true, slug: true },
            })
          : await prisma.pageTranslation.findMany({
              where: { pageId: id },
              select: { localeCode: true, slug: true },
            });

  return Object.fromEntries(rows.map((r) => [r.localeCode, r.slug]));
}

/**
 * Everything indexable, as one entry per page with the path it has in EVERY
 * locale. Built this way so hreflang alternates point at the other language's
 * slug rather than reusing this one.
 *
 * Unpublished content, and anything belonging to a switched-off module, is
 * excluded — nothing lingers as an orphan that search engines keep serving.
 */
export async function getSitemapEntries(
  locales: string[],
): Promise<{ paths: Record<string, string>; updatedAt: Date }[]> {
  const modules = await getModules();
  const now = new Date();

  /** The same path in every locale — index and static routes. */
  const shared = (path: string, updatedAt = now) => ({
    paths: Object.fromEntries(locales.map((l) => [l, path])),
    updatedAt,
  });

  /** A translated slug per locale, falling back to the default locale's. */
  const translated = <T extends { localeCode: string; slug: string }>(
    rows: T[],
    prefix: string,
    updatedAt: Date,
  ) => {
    const fallback = rows.find((r) => r.localeCode === DEFAULT_LOCALE)?.slug ?? rows[0]?.slug;
    if (!fallback) return null;
    return {
      paths: Object.fromEntries(
        locales.map((l) => [l, `${prefix}/${rows.find((r) => r.localeCode === l)?.slug ?? fallback}`]),
      ),
      updatedAt,
    };
  };

  const out: { paths: Record<string, string>; updatedAt: Date }[] = [shared("")];

  if (modules.enabled("resorts")) {
    out.push(shared("resorts"));
    const rows = await prisma.resort.findMany({
      where: { status: "published" },
      include: { translations: { select: { localeCode: true, slug: true } } },
    });
    for (const r of rows) {
      const e = translated(r.translations, "resorts", r.updatedAt);
      if (e) out.push(e);
    }
  }

  if (modules.enabled("experiences")) {
    out.push(shared("experiences"));
    const rows = await prisma.experience.findMany({
      where: { status: "published" },
      include: { translations: { select: { localeCode: true, slug: true } } },
    });
    for (const x of rows) {
      const e = translated(x.translations, "experiences", x.updatedAt);
      if (e) out.push(e);
    }
  }

  if (modules.enabled("offers")) {
    out.push(shared("offers"));
    const rows = await prisma.offer.findMany({
      where: { status: "published" },
      include: { translations: { select: { localeCode: true, slug: true } } },
    });
    for (const o of rows) {
      const e = translated(o.translations, "offers", o.updatedAt);
      if (e) out.push(e);
    }
  }

  if (modules.enabled("reef")) out.push(shared("diving"));
  if (modules.enabled("weddings")) out.push(shared("weddings"));

  const pages = await prisma.page.findMany({
    where: { status: "published" },
    include: { translations: { select: { localeCode: true, slug: true } } },
  });
  for (const pg of pages) {
    const fallback =
      pg.translations.find((r) => r.localeCode === DEFAULT_LOCALE)?.slug ??
      pg.translations[0]?.slug;
    if (!fallback) continue;
    out.push({
      paths: Object.fromEntries(
        locales.map((l) => [
          l,
          pg.translations.find((r) => r.localeCode === l)?.slug ?? fallback,
        ]),
      ),
      updatedAt: pg.updatedAt,
    });
  }

  return out;
}

export async function getOffers(locale: string) {
  const rows = await prisma.offer.findMany({
    where: { status: "published" },
    orderBy: { displayOrder: "asc" },
    include: { translations: true },
  });
  return rows.map((o) => ({
    id: o.id,
    promoCode: o.promoCode,
    slug: field(o.translations, locale, "slug") ?? o.id,
    title: field(o.translations, locale, "title") ?? "",
    summary: field(o.translations, locale, "summary"),
    validityLabel: field(o.translations, locale, "validityLabel"),
  }));
}

export async function getPageBySlug(locale: string, slug: string) {
  const match = await prisma.pageTranslation.findFirst({
    where: { slug },
    select: { pageId: true },
  });
  if (!match) return null;

  const p = await prisma.page.findUnique({
    where: { id: match.pageId },
    include: { translations: true },
  });
  if (!p || p.status !== "published") return null;

  const localised = pick(p.translations, locale);
  return {
    id: p.id,
    key: p.key,
    title: field(p.translations, locale, "title") ?? "",
    slug: field(p.translations, locale, "slug") ?? slug,
    metaTitle: field(p.translations, locale, "metaTitle"),
    metaDescription: field(p.translations, locale, "metaDescription"),
    blocks: (localised?.blocks ?? []) as { type: string; props: Record<string, unknown> }[],
  };
}

/**
 * Resolve a menu into rendered links.
 *
 * Items point at entities, so a renamed resort updates every menu automatically.
 * An item whose target is unpublished, or whose module is switched off, is
 * dropped here — which is why a menu item can never render as a broken link.
 */
/**
 * The system routes a menu item may point at.
 *
 * This is the single source of truth for both sides: the renderer below
 * resolves against it, and the admin's menu builder offers exactly these. They
 * must not drift — a route the admin allows but the renderer does not know
 * produces an item that silently disappears from the site, which is the worst
 * kind of bug to diagnose because nothing anywhere reports an error.
 *
 * `module` names the SiteModule switch that governs the route. When that switch
 * is off the item is not rendered, so a menu can never link into a section that
 * has been turned off.
 */
export const MENU_ROUTES: Record<string, { label: string; module?: string }> = {
  "/": { label: "Home" },
  "/resorts": { label: "Our Resorts", module: "resorts" },
  "/offers": { label: "Offers", module: "offers" },
  "/experiences": { label: "Experiences", module: "experiences" },
  "/diving": { label: "The Reef", module: "reef" },
  "/weddings": { label: "Weddings", module: "weddings" },
  "/destinations": { label: "Destinations", module: "destinations" },
  "/my-booking": { label: "My Booking" },
  "/contact": { label: "Contact" },
};

/**
 * How deep the renderer actually goes. `resolve` builds the child map from
 * top-level items only, so a grandchild has no parent to attach to and is
 * dropped. The builder enforces the same number rather than trusting
 * `Menu.maxDepth`, so the two can never disagree.
 */
export const MENU_MAX_DEPTH = 2;

/** The target kinds the renderer can resolve. Anything else resolves to null. */
export const MENU_TARGET_TYPES = ["page", "resort", "offer", "experience", "route", "url"] as const;
export type MenuTargetType = (typeof MENU_TARGET_TYPES)[number];

export async function getMenu(locale: string, key: string) {
  const menu = await prisma.menu.findUnique({
    where: { key },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          translations: true,
          page: { include: { translations: true } },
          resort: { include: { translations: true } },
          offer: { include: { translations: true } },
          experience: { include: { translations: true } },
        },
      },
    },
  });
  if (!menu) return [];

  const modules = await getModules();

  type Resolved = { id: string; label: string; href: string; newTab: boolean; children: Resolved[] };

  const resolve = (item: (typeof menu.items)[number]): Resolved | null => {
    const override = field(item.translations, locale, "label");
    let label: string | null = override;
    let href: string | null = null;

    switch (item.targetType) {
      case "page": {
        if (!item.page || item.page.status !== "published") return null;
        label ??= field(item.page.translations, locale, "title");
        href = `/${locale}/${field(item.page.translations, locale, "slug")}`;
        break;
      }
      case "resort": {
        if (!item.resort || item.resort.status !== "published") return null;
        label ??= field(item.resort.translations, locale, "name");
        href = `/${locale}/resorts/${field(item.resort.translations, locale, "slug")}`;
        break;
      }
      case "offer": {
        if (!item.offer || item.offer.status !== "published") return null;
        label ??= field(item.offer.translations, locale, "title");
        href = `/${locale}/offers/${field(item.offer.translations, locale, "slug")}`;
        break;
      }
      case "experience": {
        if (!item.experience || item.experience.status !== "published") return null;
        label ??= field(item.experience.translations, locale, "name");
        href = `/${locale}/experiences/${field(item.experience.translations, locale, "slug")}`;
        break;
      }
      case "route": {
        const def = item.route ? MENU_ROUTES[item.route] : undefined;
        if (!def) return null;
        if (def.module && !modules.enabled(def.module)) return null; // module switched off
        label ??= def.label;
        href = `/${locale}${item.route === "/" ? "" : item.route}`;
        break;
      }
      case "url": {
        if (!item.url) return null;
        href = item.url;
        break;
      }
      default:
        return null;
    }

    if (!label || !href) return null;
    return { id: item.id, label, href, newTab: item.openNewTab, children: [] };
  };

  const byId = new Map<string, Resolved>();
  const top: Resolved[] = [];

  for (const item of menu.items.filter((i) => !i.parentId)) {
    const r = resolve(item);
    if (!r) continue;
    byId.set(item.id, r);
    top.push(r);
  }
  for (const item of menu.items.filter((i) => i.parentId)) {
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (!parent) continue;
    const r = resolve(item);
    if (r) parent.children.push(r);
  }

  return top;
}

/** Minor units to a display string, e.g. 390000 → "EGP 3,900". */
export function formatMoney(minor: number | null, currency: string, locale: string): string | null {
  if (minor == null) return null;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
