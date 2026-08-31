import { randomInt } from "node:crypto";
import { prisma } from "@fantazia/db";

/**
 * The code a guest reads down the phone.
 *
 * No vowels, so it cannot spell anything; no O/0 or I/1, because it gets read
 * aloud and written down. Random rather than sequential: a sequential
 * reference tells a competitor how many bookings were taken last week, and
 * lets anyone guess the next one.
 */
const ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";

function candidate(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `FNT-${out}`;
}

export async function generateReference(): Promise<string> {
  // 29^6 is about 594 million, so a clash is remote — but "remote" is not
  // "impossible", and a duplicate reference would attach a guest to someone
  // else's booking.
  for (let attempt = 0; attempt < 8; attempt++) {
    const reference = candidate();
    const taken = await prisma.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!taken) return reference;
  }
  throw new Error("Could not generate a booking reference.");
}
