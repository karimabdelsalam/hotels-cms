"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { MENU_ROUTES, MENU_MAX_DEPTH, MENU_TARGET_TYPES } from "@fantazia/db/content";
import { requirePermissionForAction } from "@/server/auth";
import { revalidatePublicSite } from "@/server/revalidate";
import { audit } from "@/server/audit";

/* ------------------------------------------------------------------ *
 * Saving a menu
 *
 * The whole tree is sent and written in one transaction. Menus are small
 * and every edit is relative — moving one item renumbers its siblings and
 * may reparent others — so saving item by item would leave the menu in
 * states that were never valid if any call failed halfway. One write, or
 * none.
 * ------------------------------------------------------------------ */

const Label = z.object({
  localeCode: z.string().min(2).max(12),
  label: z.string().max(120),
});

/**
 * The tree is recursive, so the type is written by hand and zod is told to
 * match it. Inferring it from a `z.lazy` schema gives `any` at the recursion
 * point, which would quietly disable checking on exactly the nested items this
 * whole screen exists to manage.
 */
type ItemInput = {
  /** Client ids for new rows start with "new:" and are replaced on write. */
  id: string;
  targetType: (typeof MENU_TARGET_TYPES)[number];
  pageId: string | null;
  resortId: string | null;
  offerId: string | null;
  experienceId: string | null;
  route: string | null;
  url: string | null;
  openNewTab: boolean;
  labels: { localeCode: string; label: string }[];
  children?: ItemInput[];
};

const Node: z.ZodType<ItemInput> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    targetType: z.enum(MENU_TARGET_TYPES),
    pageId: z.string().nullable(),
    resortId: z.string().nullable(),
    offerId: z.string().nullable(),
    experienceId: z.string().nullable(),
    route: z.string().nullable(),
    url: z.string().nullable(),
    openNewTab: z.boolean(),
    labels: z.array(Label),
    children: z.array(Node).optional(),
  }),
);

const Payload = z.object({
  menuId: z.string().min(1),
  items: z.array(Node),
});

export type SaveMenuResult = { ok: true; savedAt: number } | { error: string };

/**
 * Reject a tree the renderer could not render.
 *
 * Every rule here mirrors something `getMenu` does when it resolves an item.
 * Catching it at save time turns a silently missing menu entry into a message
 * on the screen of the person who caused it.
 */
function validate(items: ItemInput[], depth = 1): string | null {
  if (depth > MENU_MAX_DEPTH && items.length > 0) {
    return `Menus go ${MENU_MAX_DEPTH} levels deep. Move the deeper items up a level.`;
  }
  for (const item of items) {
    switch (item.targetType) {
      case "page":
        if (!item.pageId) return "Every page item needs a page chosen.";
        break;
      case "resort":
        if (!item.resortId) return "Every resort item needs a resort chosen.";
        break;
      case "offer":
        if (!item.offerId) return "Every offer item needs an offer chosen.";
        break;
      case "experience":
        if (!item.experienceId) return "Every experience item needs an experience chosen.";
        break;
      case "route":
        if (!item.route || !(item.route in MENU_ROUTES)) {
          return "A system-route item points at a route the site does not have.";
        }
        break;
      case "url": {
        const url = item.url?.trim();
        if (!url) return "Every external link needs an address.";
        // The renderer puts this straight into href. A relative or malformed
        // value would produce a link that goes nowhere from half the site.
        if (!/^https?:\/\//i.test(url)) {
          return `External links must start with http:// or https:// — "${url}" does not.`;
        }
        break;
      }
    }
    const nested = item.children ?? [];
    if (nested.length > 0) {
      const problem = validate(nested, depth + 1);
      if (problem) return problem;
    }
  }
  return null;
}

/** Only the id for the chosen target survives; the rest are cleared. */
function targetColumns(item: ItemInput) {
  return {
    targetType: item.targetType,
    pageId: item.targetType === "page" ? item.pageId : null,
    resortId: item.targetType === "resort" ? item.resortId : null,
    offerId: item.targetType === "offer" ? item.offerId : null,
    experienceId: item.targetType === "experience" ? item.experienceId : null,
    route: item.targetType === "route" ? item.route : null,
    url: item.targetType === "url" ? item.url?.trim() || null : null,
  };
}

export async function saveMenu(menuId: string, itemsJson: string): Promise<SaveMenuResult> {
  const actor = await requirePermissionForAction("menus:write");

  let raw: unknown;
  try {
    raw = { menuId, items: JSON.parse(itemsJson) };
  } catch {
    return { error: "The menu could not be read. Reload the page and try again." };
  }

  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the menu and try again." };
  }

  const problem = validate(parsed.data.items);
  if (problem) return { error: problem };

  const before = await prisma.menu.findUnique({
    where: { id: parsed.data.menuId },
    include: { items: { include: { translations: true }, orderBy: { position: "asc" } } },
  });
  if (!before) return { error: "That menu no longer exists." };

  // Referenced content must still exist. Without this a stale tab could
  // resurrect an item pointing at a deleted resort, and the foreign key would
  // fail with a message no one could act on.
  const collect = (items: ItemInput[], out: ItemInput[] = []): ItemInput[] => {
    for (const i of items) {
      out.push(i);
      collect(i.children ?? [], out);
    }
    return out;
  };
  const flat = collect(parsed.data.items);
  const missing = await missingTargets(flat);
  if (missing) return { error: missing };

  await prisma.$transaction(async (tx) => {
    // Rebuilding beats diffing here. The tree is at most a few dozen rows, and
    // a rebuild cannot leave an orphan or a stale parent pointer behind.
    await tx.menuItem.deleteMany({ where: { menuId: parsed.data.menuId } });

    const write = async (items: ItemInput[], parentId: string | null) => {
      for (const [position, item] of items.entries()) {
        const created = await tx.menuItem.create({
          data: {
            menuId: parsed.data.menuId,
            parentId,
            position,
            openNewTab: item.openNewTab,
            ...targetColumns(item),
            translations: {
              create: item.labels
                // A blank override means "use the target's own name", which is
                // what makes a renamed resort rename itself in every menu.
                .filter((l) => l.label.trim().length > 0)
                .map((l) => ({ localeCode: l.localeCode, label: l.label.trim() })),
            },
          },
        });
        await write(item.children ?? [], created.id);
      }
    };

    await write(parsed.data.items, null);
  });

  const after = await prisma.menu.findUnique({
    where: { id: parsed.data.menuId },
    include: { items: { include: { translations: true }, orderBy: { position: "asc" } } },
  });

  await audit(actor, "menu.save", "Menu", parsed.data.menuId, before, after);
  revalidatePath("/menus");
  await revalidatePublicSite();
  return { ok: true as const, savedAt: Date.now() };
}

/** Names the first target that has gone missing, in words worth reading. */
async function missingTargets(items: ItemInput[]): Promise<string | null> {
  const ids = (key: "pageId" | "resortId" | "offerId" | "experienceId", type: string) =>
    items.filter((i) => i.targetType === type && i[key]).map((i) => i[key] as string);

  const pageIds = ids("pageId", "page");
  const resortIds = ids("resortId", "resort");
  const offerIds = ids("offerId", "offer");
  const experienceIds = ids("experienceId", "experience");

  const [pages, resorts, offers, experiences] = await Promise.all([
    pageIds.length ? prisma.page.findMany({ where: { id: { in: pageIds } }, select: { id: true } }) : [],
    resortIds.length ? prisma.resort.findMany({ where: { id: { in: resortIds } }, select: { id: true } }) : [],
    offerIds.length ? prisma.offer.findMany({ where: { id: { in: offerIds } }, select: { id: true } }) : [],
    experienceIds.length
      ? prisma.experience.findMany({ where: { id: { in: experienceIds } }, select: { id: true } })
      : [],
  ]);

  const gone = (wanted: string[], found: { id: string }[]) =>
    wanted.find((id) => !found.some((f) => f.id === id));

  if (gone(pageIds, pages)) return "One of the pages in this menu has been deleted. Remove that item and save again.";
  if (gone(resortIds, resorts)) return "One of the resorts in this menu has been deleted. Remove that item and save again.";
  if (gone(offerIds, offers)) return "One of the offers in this menu has been deleted. Remove that item and save again.";
  if (gone(experienceIds, experiences))
    return "One of the experiences in this menu has been deleted. Remove that item and save again.";
  return null;
}
