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
      roomTypes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        include: { translations: true },
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
      fromRateMinor: rt.fromRateMinor,
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

  const ROUTE_LABELS: Record<string, { label: string; module?: string }> = {
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
        const def = item.route ? ROUTE_LABELS[item.route] : undefined;
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
