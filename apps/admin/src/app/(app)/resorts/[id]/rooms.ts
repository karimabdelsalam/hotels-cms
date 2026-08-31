"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import {
  requirePermissionForAction,
  assertResortInScopeForAction,
  type Actor,
} from "@/server/auth";
import { revalidatePublicSite } from "@/server/revalidate";
import { audit } from "@/server/audit";
import { slugSchema, suggestSlug } from "@/lib/slug";

/* ------------------------------------------------------------------ *
 * Room types
 *
 * Rooms belong to a resort, so every action here re-checks that the
 * caller is allowed that resort. A resort admin scoped to Sirena must not
 * be able to edit a Fantazia Royal room by knowing its id.
 * ------------------------------------------------------------------ */

type Guard =
  | { ok: false; error: string }
  | { ok: true; actor: Actor; resortId: string };

async function guard(roomTypeId: string): Promise<Guard> {
  const actor = await requirePermissionForAction("content:write");
  const room = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    select: { resortId: true },
  });
  if (!room) return { ok: false, error: "That room no longer exists." };
  assertResortInScopeForAction(actor, room.resortId);
  return { ok: true, actor, resortId: room.resortId };
}

const Details = z.object({
  roomTypeId: z.string().min(1),
  externalCode: z.string().max(40).nullable(),
  maxAdults: z.coerce.number().int().min(1).max(20),
  maxChildren: z.coerce.number().int().min(0).max(20),
  maxOccupancy: z.coerce.number().int().min(1).max(30),
  sizeSqm: z.coerce.number().int().min(1).max(2000).nullable(),
  bedConfig: z.string().max(120).nullable(),
  fromRateMinor: z.coerce.number().int().min(0).nullable(),
  active: z.boolean(),
});

export async function saveRoomDetails(_prev: unknown, formData: FormData) {
  const rate = String(formData.get("fromRate") ?? "").trim();

  const parsed = Details.safeParse({
    roomTypeId: String(formData.get("roomTypeId") ?? ""),
    externalCode: (formData.get("externalCode") as string)?.trim().toUpperCase() || null,
    maxAdults: formData.get("maxAdults") ?? 2,
    maxChildren: formData.get("maxChildren") ?? 0,
    maxOccupancy: formData.get("maxOccupancy") ?? 2,
    sizeSqm: (formData.get("sizeSqm") as string)?.trim() ? formData.get("sizeSqm") : null,
    bedConfig: (formData.get("bedConfig") as string)?.trim() || null,
    // Money is entered in whole units and stored in minor units. Doing the
    // conversion here rather than in the form keeps the stored value integral —
    // a rate typed as 145.5 becomes 14550, never 14549.999999.
    fromRateMinor: rate ? Math.round(Number(rate) * 100) : null,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  if (rate && !Number.isFinite(Number(rate))) {
    return { error: "The rate must be a number." };
  }

  // A room that sleeps fewer people than its own adults-plus-children would
  // hand the booking engine an occupancy it can never satisfy.
  if (d.maxOccupancy < d.maxAdults) {
    return { error: `Sleeps ${d.maxOccupancy} but allows ${d.maxAdults} adults. Raise the total.` };
  }
  if (d.maxOccupancy > d.maxAdults + d.maxChildren) {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    return {
      error: `Sleeps ${d.maxOccupancy}, but only ${plural(d.maxAdults, "adult", "adults")} and ${plural(d.maxChildren, "child", "children")} are allowed — ${d.maxAdults + d.maxChildren} in all.`,
    };
  }

  const g = await guard(d.roomTypeId);
  if (!g.ok) return { error: g.error };

  // OPERA codes must be unique within the resort: two rooms sharing one code
  // would make availability ambiguous the moment the connector is switched on.
  if (d.externalCode) {
    const clash = await prisma.roomType.findFirst({
      where: {
        resortId: g.resortId,
        externalCode: d.externalCode,
        NOT: { id: d.roomTypeId },
      },
      include: { translations: { where: { localeCode: "en" }, select: { name: true } } },
    });
    if (clash) {
      const name = clash.translations[0]?.name ?? "another room";
      return { error: `PMS code ${d.externalCode} is already used by ${name} at this resort.` };
    }
  }

  const before = await prisma.roomType.findUnique({ where: { id: d.roomTypeId } });
  const after = await prisma.roomType.update({
    where: { id: d.roomTypeId },
    data: {
      externalCode: d.externalCode,
      maxAdults: d.maxAdults,
      maxChildren: d.maxChildren,
      maxOccupancy: d.maxOccupancy,
      sizeSqm: d.sizeSqm,
      bedConfig: d.bedConfig,
      fromRateMinor: d.fromRateMinor,
      active: d.active,
    },
  });

  await audit(g.actor, "room.update", "RoomType", after.id, before, after);
  revalidatePath(`/resorts/${g.resortId}`);
  await revalidatePublicSite();
  return { ok: true as const, savedAt: Date.now() };
}

const Translation = z.object({
  roomTypeId: z.string().min(1),
  localeCode: z.string().min(2),
  name: z.string().min(1, "A name is required"),
  slug: slugSchema,
  description: z.string().nullable(),
});

export async function saveRoomTranslation(_prev: unknown, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const typed = String(formData.get("slug") ?? "").trim();

  const parsed = Translation.safeParse({
    roomTypeId: String(formData.get("roomTypeId") ?? ""),
    localeCode: String(formData.get("localeCode") ?? ""),
    name,
    // Rooms have no page of their own yet, so nobody has a reason to think
    // about a slug. One is derived from the name when the field is left empty.
    slug: typed || suggestSlug(name),
    description: (formData.get("description") as string)?.trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const g = await guard(d.roomTypeId);
  if (!g.ok) return { error: g.error };

  // Room slugs are not in the site's shared URL space — there is no room page
  // yet — so they are checked only against the rooms of this resort, which is
  // what a future /resorts/x/rooms/y route would need.
  const clash = await prisma.roomTypeTranslation.findFirst({
    where: {
      localeCode: d.localeCode,
      slug: d.slug,
      roomType: { resortId: g.resortId },
      NOT: { roomTypeId: d.roomTypeId },
    },
    select: { name: true },
  });
  if (clash) {
    return { error: `"${d.slug}" is already used by ${clash.name} at this resort.` };
  }

  const before = await prisma.roomTypeTranslation.findUnique({
    where: { roomTypeId_localeCode: { roomTypeId: d.roomTypeId, localeCode: d.localeCode } },
  });

  const payload = { name: d.name, slug: d.slug, description: d.description };
  const after = await prisma.roomTypeTranslation.upsert({
    where: { roomTypeId_localeCode: { roomTypeId: d.roomTypeId, localeCode: d.localeCode } },
    update: payload,
    create: { roomTypeId: d.roomTypeId, localeCode: d.localeCode, ...payload },
  });

  await audit(g.actor, "room.translation.save", "RoomTypeTranslation", after.id, before, after);
  revalidatePath(`/resorts/${g.resortId}`);
  await revalidatePublicSite();
  return { ok: true as const, savedAt: Date.now() };
}

export async function createRoom(resortId: string) {
  const actor = await requirePermissionForAction("content:write");
  assertResortInScopeForAction(actor, resortId);

  const count = await prisma.roomType.count({ where: { resortId } });
  const room = await prisma.roomType.create({
    data: {
      resortId,
      displayOrder: count,
      // A new room starts switched off. It appears on the site only once
      // someone has given it a name and turned it on deliberately.
      active: false,
      translations: {
        create: [{ localeCode: "en", name: "New room", slug: `room-${Date.now()}` }],
      },
    },
  });

  await audit(actor, "room.create", "RoomType", room.id, null, room);
  revalidatePath(`/resorts/${resortId}`);
  return room.id;
}

export async function deleteRoom(roomTypeId: string) {
  const g = await guard(roomTypeId);
  if (!g.ok) return { error: g.error };

  const before = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    include: { translations: true },
  });

  await prisma.roomType.delete({ where: { id: roomTypeId } });

  await audit(g.actor, "room.delete", "RoomType", roomTypeId, before, null);
  revalidatePath(`/resorts/${g.resortId}`);
  await revalidatePublicSite();
  return { ok: true as const };
}

/** Move a room one place up or down. Order drives the public listing. */
export async function moveRoom(roomTypeId: string, direction: "up" | "down") {
  const g = await guard(roomTypeId);
  if (!g.ok) return { error: g.error };

  const rooms = await prisma.roomType.findMany({
    where: { resortId: g.resortId },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  const index = rooms.findIndex((r) => r.id === roomTypeId);
  const to = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || to < 0 || to >= rooms.length) return { ok: true as const };

  const reordered = [...rooms];
  const here = reordered[index];
  const there = reordered[to];
  if (!here || !there) return { ok: true as const };
  reordered[index] = there;
  reordered[to] = here;

  // Renumbering the whole list rather than swapping two values keeps the
  // sequence dense, so seeded gaps and duplicates heal themselves.
  await prisma.$transaction(
    reordered.map((r, position) =>
      prisma.roomType.update({ where: { id: r.id }, data: { displayOrder: position } }),
    ),
  );

  await audit(g.actor, "room.reorder", "RoomType", roomTypeId, { index }, { index: to });
  revalidatePath(`/resorts/${g.resortId}`);
  await revalidatePublicSite();
  return { ok: true as const };
}
