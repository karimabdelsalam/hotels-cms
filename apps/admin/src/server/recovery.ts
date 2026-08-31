import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@fantazia/db";
import { hashPassword, verifyPassword } from "@/lib/password";

/**
 * Recovery codes: the way back in when the phone is gone.
 *
 * Ten codes, each usable once. Shown exactly once, at enrolment, and stored
 * only as hashes — so we cannot show them again later and neither can anyone
 * who reads the table.
 */

const COUNT = 10;

/** Unambiguous alphabet: no O/0, no I/1/l, since these get written on paper. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function oneCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function normalise(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Replaces any existing codes. Returns the plaintext once — the caller must
 * show it immediately, because nothing can recover it afterwards.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: COUNT }, oneCode);
  const hashes = await Promise.all(codes.map((c) => hashPassword(normalise(c))));

  await prisma.$transaction([
    prisma.userRecoveryCode.deleteMany({ where: { userId } }),
    prisma.userRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    }),
  ]);

  return codes;
}

/**
 * Spends one code if it matches an unused one.
 *
 * Every stored hash is checked rather than looked up, because the codes are
 * hashed with a salt — there is nothing to index on. Ten argon2 verifications
 * is slow by design and the attempt counter caps how often it can be provoked.
 */
export async function consumeRecoveryCode(userId: string, submitted: string): Promise<boolean> {
  const candidate = normalise(submitted);
  if (candidate.length !== 10) return false;

  const rows = await prisma.userRecoveryCode.findMany({ where: { userId, usedAt: null } });
  for (const row of rows) {
    if (await verifyPassword(row.codeHash, candidate)) {
      // Marked used rather than deleted, so the audit trail still shows that a
      // recovery code was spent and when.
      const spent = await prisma.userRecoveryCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      // Zero means another request spent it first; that is a failure here.
      return spent.count === 1;
    }
  }
  return false;
}

export async function countUnusedCodes(userId: string): Promise<number> {
  return prisma.userRecoveryCode.count({ where: { userId, usedAt: null } });
}
