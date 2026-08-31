import { prisma } from "@fantazia/db";
import type { AvailabilityQuery, AvailabilityResult, AvailableRoom, Restrictions } from "./types";

/**
 * Availability read from the ARI snapshot OXI keeps current.
 *
 * Search never touches OPERA. Three resorts sit behind one installation, so
 * querying live would mean an OPERA outage takes the whole group's search
 * offline at once. Reading a pushed snapshot means only creating a reservation
 * needs the connection up.
 */

export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function restrictionsOf(value: unknown): Restrictions {
  if (!value || typeof value !== "object") return {};
  const r = value as Record<string, unknown>;
  return {
    minStay: typeof r.minStay === "number" ? r.minStay : undefined,
    maxStay: typeof r.maxStay === "number" ? r.maxStay : undefined,
    closedToArrival: r.closedToArrival === true,
    closedToDeparture: r.closedToDeparture === true,
    stopSell: r.stopSell === true,
  };
}

export async function availabilityFromSnapshot(q: AvailabilityQuery): Promise<AvailabilityResult> {
  const nights = nightsBetween(q.checkIn, q.checkOut);
  if (nights.length === 0) {
    return { resortId: q.resortId, rooms: [], fromSnapshot: true, asOf: new Date() };
  }

  const rows = await prisma.inventorySnapshot.findMany({
    where: {
      resortId: q.resortId,
      date: { in: nights.map((n) => new Date(`${n}T00:00:00Z`)) },
      roomType: { active: true },
      ratePlan: { active: true, isPublic: true },
    },
    include: { roomType: true },
  });

  // Group by the room/rate pair a guest would actually book.
  const byPair = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.roomTypeId}:${row.ratePlanId}`;
    const list = byPair.get(key) ?? [];
    list.push(row);
    byPair.set(key, list);
  }

  const totalGuests = q.occupancy.adults + q.occupancy.children;
  const out: AvailableRoom[] = [];
  let asOf = new Date(0);

  for (const [key, group] of byPair) {
    // Every night must be present. A gap means we do not know the price for
    // one of the nights, and quoting around a hole is how a guest is told a
    // total that was never real.
    if (group.length !== nights.length) continue;

    const roomType = group[0]!.roomType;
    if (totalGuests > roomType.maxOccupancy) continue;
    if (q.occupancy.adults > roomType.maxAdults) continue;
    if (q.occupancy.children > roomType.maxChildren) continue;

    const restrictions = group.map((g) => restrictionsOf(g.restrictions));
    if (restrictions.some((r) => r.stopSell)) continue;

    const arrival = group.find((g) => g.date.toISOString().slice(0, 10) === nights[0]);
    if (restrictionsOf(arrival?.restrictions).closedToArrival) continue;

    const minStay = Math.max(0, ...restrictions.map((r) => r.minStay ?? 0));
    if (nights.length < minStay) continue;
    const maxStay = Math.min(...restrictions.map((r) => r.maxStay ?? Infinity));
    if (nights.length > maxStay) continue;

    // The fewest rooms free on any night is how many can actually be booked
    // for the whole stay.
    const available = Math.min(...group.map((g) => g.availableCount));
    if (available < q.roomsCount) continue;

    const [first] = group;
    const currency = first!.currency;
    if (group.some((g) => g.currency !== currency)) continue; // never mix currencies

    const nightly = group
      .map((g) => ({ date: g.date.toISOString().slice(0, 10), minor: g.rateMinor }))
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const g of group) if (g.syncedAt > asOf) asOf = g.syncedAt;

    const [roomTypeId, ratePlanId] = key.split(":") as [string, string];
    out.push({
      roomTypeId,
      ratePlanId,
      available,
      nightly,
      roomTotalMinor: nightly.reduce((sum, n) => sum + n.minor, 0),
      currency,
      restrictions: {
        minStay: minStay || undefined,
        maxStay: Number.isFinite(maxStay) ? maxStay : undefined,
      },
    });
  }

  out.sort((a, b) => a.roomTotalMinor - b.roomTotalMinor);
  return {
    resortId: q.resortId,
    rooms: out,
    fromSnapshot: true,
    asOf: asOf.getTime() === 0 ? new Date() : asOf,
  };
}
