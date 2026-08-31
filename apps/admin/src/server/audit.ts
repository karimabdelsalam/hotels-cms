import "server-only";
import { headers } from "next/headers";
import { prisma } from "@fantazia/db";
import type { Actor } from "./auth";

/**
 * Every admin mutation is recorded with before/after state. Required by the
 * brief, and the thing that makes a bad change explainable a week later.
 */
export async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  const h = await headers();
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action,
      entityType,
      entityId,
      before: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
      after: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent") ?? null,
    },
  });
}
