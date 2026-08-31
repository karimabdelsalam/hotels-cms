import { prisma } from "@fantazia/db";
import { MENU_ROUTES } from "@fantazia/db/content";
import { requirePermission, can } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { MenuBuilder, type MenuView, type Targets } from "./MenuBuilder";

export default async function MenusPage() {
  const actor = await requirePermission("content:read");
  const canWrite = can(actor, "menus:write");

  const [menus, locales, modules, pages, resorts, offers, experiences] = await Promise.all([
    prisma.menu.findMany({
      orderBy: { key: "asc" },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { translations: true },
        },
      },
    }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }),
    prisma.siteModule.findMany(),
    prisma.page.findMany({
      orderBy: { key: "asc" },
      select: { id: true, status: true, translations: { select: { localeCode: true, title: true } } },
    }),
    prisma.resort.findMany({
      orderBy: { displayOrder: "asc" },
      select: { id: true, status: true, translations: { select: { localeCode: true, name: true } } },
    }),
    prisma.offer.findMany({
      orderBy: { displayOrder: "asc" },
      select: { id: true, status: true, translations: { select: { localeCode: true, title: true } } },
    }),
    prisma.experience.findMany({
      orderBy: { displayOrder: "asc" },
      select: { id: true, status: true, translations: { select: { localeCode: true, name: true } } },
    }),
  ]);

  const en = <T extends { localeCode: string }>(rows: T[]) =>
    rows.find((r) => r.localeCode === "en") ?? rows[0];

  const targets: Targets = {
    page: pages.map((p) => ({
      id: p.id,
      name: en(p.translations)?.title ?? "Untitled page",
      published: p.status === "published",
    })),
    resort: resorts.map((r) => ({
      id: r.id,
      name: en(r.translations)?.name ?? "Untitled resort",
      published: r.status === "published",
    })),
    offer: offers.map((o) => ({
      id: o.id,
      name: en(o.translations)?.title ?? "Untitled offer",
      published: o.status === "published",
    })),
    experience: experiences.map((e) => ({
      id: e.id,
      name: en(e.translations)?.name ?? "Untitled experience",
      published: e.status === "published",
    })),
    // A route whose module is switched off is still offered, but marked. The
    // menu is allowed to be ready before the section is turned on.
    route: Object.entries(MENU_ROUTES).map(([path, def]) => ({
      id: path,
      name: def.label,
      published: !def.module || (modules.find((m) => m.key === def.module)?.enabled ?? false),
    })),
  };

  // Alphabetical by key would open on a footer menu. Order by how often a menu
  // is actually edited instead: the main navigation first, footers last.
  const MENU_ORDER = ["primary", "utility"];
  const rank = (key: string) => {
    const i = MENU_ORDER.indexOf(key);
    return i === -1 ? MENU_ORDER.length : i;
  };
  const ordered = [...menus].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key),
  );

  const views: MenuView[] = ordered.map((menu) => ({
    id: menu.id,
    key: menu.key,
    name: menu.name,
    items: menu.items.map((i) => ({
      id: i.id,
      parentId: i.parentId,
      position: i.position,
      targetType: i.targetType,
      pageId: i.pageId,
      resortId: i.resortId,
      offerId: i.offerId,
      experienceId: i.experienceId,
      route: i.route,
      url: i.url,
      openNewTab: i.openNewTab,
      labels: i.translations.map((t) => ({ localeCode: t.localeCode, label: t.label })),
    })),
  }));

  return (
    <>
      <PageHeader
        title="Menus"
        description="Items point at content, not at addresses. Rename a resort or change its slug and every menu follows, in every language."
      />
      <MenuBuilder
        menus={views}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        targets={targets}
        canWrite={canWrite}
      />
    </>
  );
}
