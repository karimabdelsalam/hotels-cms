import { prisma } from "@fantazia/db";
import type { Quote, QuoteLine, QuoteRequest } from "./connector/types";
import { availabilityFromSnapshot } from "./connector/snapshot";
import { ConnectorRejection } from "./connector/types";

/**
 * Turns a chosen set of rooms into an itemised total.
 *
 * Prices come from the same snapshot rows the guest was shown, re-read here
 * rather than trusted from the browser — a total assembled from numbers the
 * client sent is a total anyone can choose.
 */
export async function priceQuote(q: QuoteRequest): Promise<Quote> {
  if (q.lines.length === 0) {
    throw new ConnectorRejection("No rooms were chosen.", "EMPTY_QUOTE");
  }

  // One availability read covers every line; asking per line would multiply
  // queries and could see different snapshots mid-quote.
  const totalOccupancy = q.lines.reduce(
    (acc, l) => ({
      adults: Math.max(acc.adults, l.occupancy.adults),
      children: Math.max(acc.children, l.occupancy.children),
      childAges: acc.childAges,
    }),
    { adults: 0, children: 0, childAges: [] as number[] },
  );

  const availability = await availabilityFromSnapshot({
    resortId: q.resortId,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    occupancy: totalOccupancy,
    roomsCount: 1,
  });

  const lines: QuoteLine[] = [];
  let currency: string | null = null;

  for (const wanted of q.lines) {
    const found = availability.rooms.find(
      (r) => r.roomTypeId === wanted.roomTypeId && r.ratePlanId === wanted.ratePlanId,
    );
    if (!found) {
      throw new ConnectorRejection(
        "One of the rooms is no longer available for these dates.",
        "NO_AVAILABILITY",
      );
    }
    if (found.available < wanted.quantity) {
      throw new ConnectorRejection(
        `Only ${found.available} of that room ${found.available === 1 ? "is" : "are"} left.`,
        "INSUFFICIENT_INVENTORY",
      );
    }
    if (currency && currency !== found.currency) {
      throw new ConnectorRejection("Rooms in one booking must share a currency.", "MIXED_CURRENCY");
    }
    currency = found.currency;

    lines.push({
      roomTypeId: wanted.roomTypeId,
      ratePlanId: wanted.ratePlanId,
      quantity: wanted.quantity,
      occupancy: wanted.occupancy,
      nightly: found.nightly,
      roomTotalMinor: found.roomTotalMinor * wanted.quantity,
    });
  }

  const roomTotalMinor = lines.reduce((sum, l) => sum + l.roomTotalMinor, 0);
  const nights = lines[0]!.nightly.length;
  const roomsCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  const { taxesTotalMinor, feesTotalMinor, breakdown } = await applyTaxes({
    resortId: q.resortId,
    roomTotalMinor,
    nights,
    roomsCount,
  });

  return {
    resortId: q.resortId,
    currency: currency!,
    lines,
    roomTotalMinor,
    taxesTotalMinor,
    feesTotalMinor,
    totalMinor: roomTotalMinor + taxesTotalMinor + feesTotalMinor,
    breakdown,
    quotedAt: new Date(),
  };
}

export type TaxRule = {
  name: string;
  kind: "percentage" | "fixed_per_night" | "fixed_per_stay";
  value: number; // percent in basis points, or minor units
  appliesTo: "room" | "total";
  includedInRate: boolean;
  isFee: boolean;
};

/**
 * Tax and fee rules, read from settings.
 *
 * Rounding happens once per rule on the whole base, never per night and then
 * summed: rounding twelve times and adding produces a total that does not
 * match the printed percentage, and a guest checking the arithmetic is right
 * to complain.
 */
export async function applyTaxes(input: {
  resortId: string;
  roomTotalMinor: number;
  nights: number;
  roomsCount: number;
}): Promise<{
  taxesTotalMinor: number;
  feesTotalMinor: number;
  breakdown: { label: string; minor: number; kind: "tax" | "fee" }[];
}> {
  const rules = await loadTaxRules(input.resortId);

  let taxesTotalMinor = 0;
  let feesTotalMinor = 0;
  const breakdown: { label: string; minor: number; kind: "tax" | "fee" }[] = [];
  let base = input.roomTotalMinor;

  for (const rule of rules) {
    // A rule already inside the rate is shown but not added again.
    if (rule.includedInRate) continue;

    let amount = 0;
    if (rule.kind === "percentage") {
      const on = rule.appliesTo === "total" ? base + taxesTotalMinor + feesTotalMinor : base;
      amount = Math.round((on * rule.value) / 10_000);
    } else if (rule.kind === "fixed_per_night") {
      amount = rule.value * input.nights * input.roomsCount;
    } else {
      amount = rule.value * input.roomsCount;
    }

    if (amount === 0) continue;
    breakdown.push({ label: rule.name, minor: amount, kind: rule.isFee ? "fee" : "tax" });
    if (rule.isFee) feesTotalMinor += amount;
    else taxesTotalMinor += amount;
  }

  return { taxesTotalMinor, feesTotalMinor, breakdown };
}

/**
 * Egypt's standard hotel charges are the default, so a resort with nothing
 * configured still quotes a legal total rather than a room rate presented as
 * the price.
 */
const EGYPT_DEFAULT: TaxRule[] = [
  { name: "VAT", kind: "percentage", value: 1400, appliesTo: "room", includedInRate: false, isFee: false },
  { name: "Municipality tax", kind: "percentage", value: 200, appliesTo: "room", includedInRate: false, isFee: false },
  { name: "Service charge", kind: "percentage", value: 1200, appliesTo: "room", includedInRate: false, isFee: true },
];

async function loadTaxRules(resortId: string): Promise<TaxRule[]> {
  const row = await prisma.setting.findUnique({ where: { key: `tax.${resortId}` } });
  const value = row?.value;
  if (!Array.isArray(value)) return EGYPT_DEFAULT;

  const rules: TaxRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.name !== "string" || typeof r.value !== "number") continue;
    const kind = r.kind;
    if (kind !== "percentage" && kind !== "fixed_per_night" && kind !== "fixed_per_stay") continue;
    rules.push({
      name: r.name,
      kind,
      value: r.value,
      appliesTo: r.appliesTo === "total" ? "total" : "room",
      includedInRate: r.includedInRate === true,
      isFee: r.isFee === true,
    });
  }
  return rules.length > 0 ? rules : EGYPT_DEFAULT;
}
