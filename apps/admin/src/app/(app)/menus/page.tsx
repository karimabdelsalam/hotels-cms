import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

const LABELS: Record<string, string> = {
  page: "Page",
  resort: "Resort",
  offer: "Offer",
  experience: "Experience",
  route: "System route",
  url: "External link",
};

export default async function MenusPage() {
  await requirePermission("menus:write");

  const [menus, modules] = await Promise.all([
    prisma.menu.findMany({
      orderBy: { key: "asc" },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            page: { include: { translations: true } },
            resort: { include: { translations: true } },
            offer: { include: { translations: true } },
            experience: { include: { translations: true } },
            translations: true,
          },
        },
      },
    }),
    prisma.siteModule.findMany(),
  ]);

  const moduleFor: Record<string, string> = {
    "/resorts": "resorts",
    "/offers": "offers",
    "/experiences": "experiences",
    "/diving": "reef",
    "/weddings": "weddings",
    "/destinations": "destinations",
  };
  const enabled = (key?: string) =>
    !key || (modules.find((m) => m.key === key)?.enabled ?? false);

  return (
    <>
      <PageHeader
        title="Menus"
        description="Items point at content, not at addresses. Rename a resort or change its slug and every menu follows, in every language."
      />
      <div className="cards">
        {menus.map((menu) => (
          <section className="card" key={menu.id}>
            <h2>{menu.name}</h2>
            <ul className="rows">
              {menu.items
                .filter((i) => !i.parentId)
                .map((item) => {
                  const kids = menu.items.filter((c) => c.parentId === item.id);
                  return (
                    <li key={item.id} className="menu-item">
                      <MenuRow item={item} enabled={enabled} moduleFor={moduleFor} />
                      {kids.length > 0 && (
                        <ul className="rows nested">
                          {kids.map((k) => (
                            <li key={k.id}>
                              <MenuRow item={k} enabled={enabled} moduleFor={moduleFor} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
            {menu.items.length === 0 && <p className="note">Empty.</p>}
          </section>
        ))}
      </div>
      <p className="note">
        An item whose target is unpublished, or whose section is switched off, is greyed here
        and never rendered on the site — a menu item cannot become a broken link.
      </p>
    </>
  );
}

type Item = {
  id: string;
  targetType: string;
  route: string | null;
  url: string | null;
  page?: { status: string; translations: { localeCode: string; title: string }[] } | null;
  resort?: { status: string; translations: { localeCode: string; name: string }[] } | null;
  offer?: { status: string; translations: { localeCode: string; title: string }[] } | null;
  experience?: { status: string; translations: { localeCode: string; name: string }[] } | null;
  translations: { localeCode: string; label: string }[];
};

function MenuRow({
  item,
  enabled,
  moduleFor,
}: {
  item: Item;
  enabled: (key?: string) => boolean;
  moduleFor: Record<string, string>;
}) {
  const en = <T extends { localeCode: string }>(rows: T[]) =>
    rows.find((r) => r.localeCode === "en") ?? rows[0];

  let label = en(item.translations)?.label ?? null;
  let reason: string | null = null;

  if (item.targetType === "page") {
    label ??= en(item.page?.translations ?? [])?.title ?? null;
    if (item.page && item.page.status !== "published") reason = "Page is not published";
  } else if (item.targetType === "resort") {
    label ??= en(item.resort?.translations ?? [])?.name ?? null;
    if (item.resort && item.resort.status !== "published") reason = "Resort is not published";
  } else if (item.targetType === "offer") {
    label ??= en(item.offer?.translations ?? [])?.title ?? null;
    if (item.offer && item.offer.status !== "published") reason = "Offer is not published";
  } else if (item.targetType === "experience") {
    label ??= en(item.experience?.translations ?? [])?.name ?? null;
    if (item.experience && item.experience.status !== "published")
      reason = "Experience is not published";
  } else if (item.targetType === "route") {
    label ??= item.route;
    if (item.route && !enabled(moduleFor[item.route])) reason = "Section is switched off";
  } else if (item.targetType === "url") {
    label ??= item.url;
  }

  return (
    <span className={`menu-row${reason ? " off" : ""}`}>
      <span>
        <b>{label ?? "Untitled"}</b>
        <code>{LABELS[item.targetType] ?? item.targetType}</code>
      </span>
      {reason ? <span className="chip chip--warn">{reason}</span> : null}
    </span>
  );
}
