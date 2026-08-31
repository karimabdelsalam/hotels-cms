import { prisma } from "@fantazia/db";
import { isConfigured, send } from "./transport";
import { render, type NotificationKind } from "./templates";

/**
 * Queue a message, and drain the queue.
 *
 * Queuing is cheap and happens inside the transition. Sending is slow and
 * fallible and happens in the worker, where a failure can be retried without
 * anything else waiting on it.
 */

const MAX_ATTEMPTS = 5;

/** Roughly a minute, then five, then twenty-five. */
function backoffMs(attempt: number): number {
  return Math.min(60_000 * 5 ** (attempt - 1), 6 * 60 * 60_000);
}

export async function queueNotification(options: {
  bookingId: string;
  kind: NotificationKind;
}): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: options.bookingId },
    select: { locale: true, guest: { select: { email: true } } },
  });
  if (!booking) return;

  // The unique index does the work: a retried transition, a duplicated webhook
  // or a staff member clicking twice all collapse into one message.
  await prisma.bookingNotification.createMany({
    data: [
      {
        bookingId: options.bookingId,
        kind: options.kind,
        channel: "email",
        recipient: booking.guest.email,
        locale: booking.locale,
      },
    ],
    skipDuplicates: true,
  });
}

export type DrainResult = { sent: number; failed: number; gaveUp: number; skipped: string | null };

export async function drainOutbox(limit = 20): Promise<DrainResult> {
  if (!isConfigured()) {
    // Not an error: a fresh environment has no SMTP yet, and messages should
    // wait rather than be marked failed and retried into exhaustion.
    const waiting = await prisma.bookingNotification.count({ where: { status: "pending" } });
    return {
      sent: 0,
      failed: 0,
      gaveUp: 0,
      skipped: waiting > 0 ? `SMTP not configured — ${waiting} message(s) waiting` : null,
    };
  }

  const due = await prisma.bookingNotification.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let gaveUp = 0;

  for (const row of due) {
    const attempt = row.attempts + 1;
    try {
      const message = await render(row.bookingId, row.kind as NotificationKind, row.locale);
      if (!message) {
        // The booking is gone. Nothing to send and nothing to retry.
        await prisma.bookingNotification.update({
          where: { id: row.id },
          data: { status: "failed", attempts: attempt, lastError: "The booking no longer exists." },
        });
        gaveUp++;
        continue;
      }

      await send(message);
      await prisma.bookingNotification.update({
        where: { id: row.id },
        data: { status: "sent", attempts: attempt, sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      if (attempt >= MAX_ATTEMPTS) {
        // Given up on, loudly. A guest with no confirmation is a call to the
        // resort, so this needs to be visible rather than buried.
        await prisma.bookingNotification.update({
          where: { id: row.id },
          data: { status: "failed", attempts: attempt, lastError: reason },
        });
        gaveUp++;
      } else {
        await prisma.bookingNotification.update({
          where: { id: row.id },
          data: {
            attempts: attempt,
            lastError: reason,
            nextAttemptAt: new Date(Date.now() + backoffMs(attempt)),
          },
        });
        failed++;
      }
    }
  }

  return { sent, failed, gaveUp, skipped: null };
}

/** For the worker's report line and the admin. */
export async function outboxTrouble(): Promise<{ failed: number; oldestPending: Date | null }> {
  const [failed, oldest] = await Promise.all([
    prisma.bookingNotification.count({ where: { status: "failed" } }),
    prisma.bookingNotification.findFirst({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  return { failed, oldestPending: oldest?.createdAt ?? null };
}
