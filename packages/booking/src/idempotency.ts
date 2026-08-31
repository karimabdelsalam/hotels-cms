import { createHash } from "node:crypto";
import { prisma } from "@fantazia/db";

/**
 * Do a thing at most once, whatever the caller does.
 *
 * The first result for a key is stored and replayed for repeats. A guest who
 * double-clicks Pay, refreshes the payment page, or whose webhook is delivered
 * twice must not produce a second charge or a second reservation.
 */

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class IdempotencyConflict extends Error {
  constructor(readonly key: string) {
    super("The same key was used for a different request.");
    this.name = "IdempotencyConflict";
  }
}

export class OperationInFlight extends Error {
  constructor(readonly key: string) {
    super("That is already in progress. Wait a moment and check again.");
    this.name = "OperationInFlight";
  }
}

export async function runOnce<T>(options: {
  key: string;
  scope: string;
  request: unknown;
  ttlMs: number;
  work: () => Promise<T>;
}): Promise<T> {
  const requestHash = hashRequest(options.request);
  const expiresAt = new Date(Date.now() + options.ttlMs);

  // Claiming the key and doing the work are separate on purpose: a unique
  // constraint is what makes two simultaneous callers resolve, and it can only
  // do that if the claim is its own write.
  //
  // `createMany` with skipDuplicates rather than a `create` in a try/catch: a
  // losing claim is ordinary control flow here, and a failing create writes a
  // line to the error log every time someone double-clicks. Noise in an error
  // log is worse than no log — it teaches people to ignore it.
  const { count } = await prisma.idempotencyKey.createMany({
    data: [{ key: options.key, scope: options.scope, requestHash, status: "in_progress", expiresAt }],
    skipDuplicates: true,
  });

  if (count === 0) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key: options.key } });
    if (!existing) throw new OperationInFlight(options.key);

    // The same key with different contents is a caller bug, and answering it
    // with the first result would be worse than refusing.
    if (existing.requestHash !== requestHash) throw new IdempotencyConflict(options.key);

    if (existing.status === "done") return existing.response as T;
    if (existing.status === "failed") {
      // A failed attempt may be retried; take the key over and try again.
      await prisma.idempotencyKey.update({
        where: { key: options.key },
        data: { status: "in_progress", expiresAt },
      });
    } else {
      throw new OperationInFlight(options.key);
    }
  }

  try {
    const result = await options.work();
    await prisma.idempotencyKey.update({
      where: { key: options.key },
      data: { status: "done", response: result as never },
    });
    return result;
  } catch (error) {
    await prisma.idempotencyKey
      .update({ where: { key: options.key }, data: { status: "failed" } })
      .catch(() => undefined);
    throw error;
  }
}

/** Expired keys are only a cache of answers nobody will ask for again. */
export async function purgeExpiredKeys(): Promise<number> {
  const { count } = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
