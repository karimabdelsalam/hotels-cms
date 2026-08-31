import { prisma } from "@fantazia/db";
import {
  confirmBooking,
  dueForConfirmation,
  drainOutbox,
  expireStaleHolds,
  outboxTrouble,
  purgeExpiredKeys,
} from "@fantazia/booking";

/**
 * The jobs, separated from the loop that runs them.
 *
 * Each returns a one-line summary and never throws: a job that takes the
 * worker down with it stops every other job too, and the one that matters most
 * here is the one rescuing guests who have already paid.
 */

export type JobResult = { name: string; summary: string; failed: boolean };

async function guard(name: string, work: () => Promise<string>): Promise<JobResult> {
  try {
    return { name, summary: await work(), failed: false };
  } catch (error) {
    return {
      name,
      summary: error instanceof Error ? error.message : "Unknown error",
      failed: true,
    };
  }
}

/**
 * Retries reservation creation for bookings whose backoff has elapsed.
 *
 * This is the job the whole retry ladder depends on. Without something calling
 * it, a booking that hits a transport failure sits in CONFIRMING until a person
 * notices — which means the guest has paid and nobody knows.
 */
export function confirmDueBookings(): Promise<JobResult> {
  return guard("confirm", async () => {
    const due = await dueForConfirmation(20);
    if (due.length === 0) return "nothing due";

    const outcomes: string[] = [];
    for (const booking of due) {
      // One at a time, not in parallel: each one talks to OPERA, and twenty
      // simultaneous reservation calls is how a PMS starts refusing them all.
      try {
        const result = await confirmBooking(booking.id);
        outcomes.push(`${booking.reference}=${result.status}`);
      } catch (error) {
        outcomes.push(
          `${booking.reference}=error(${error instanceof Error ? error.message : "unknown"})`,
        );
      }
    }
    return `${due.length} due · ${outcomes.join(" ")}`;
  });
}

/** Holds nobody came back to. Only ever touches DRAFT and PENDING_PAYMENT. */
export function expireHolds(): Promise<JobResult> {
  return guard("holds", async () => {
    const count = await expireStaleHolds();
    return count === 0 ? "none stale" : `${count} expired`;
  });
}

/** Answers to questions nobody will ask again. */
export function purgeKeys(): Promise<JobResult> {
  return guard("idempotency", async () => {
    const count = await purgeExpiredKeys();
    return count === 0 ? "nothing to purge" : `${count} purged`;
  });
}

/**
 * Shouts about bookings sitting in review.
 *
 * Not a fix — a fix needs a person. But an unnoticed NEEDS_MANUAL_REVIEW is a
 * guest arriving to no room, so it is written to the log on every pass whether
 * anything changed or not. A number that must be zero should be visible even
 * when nobody is looking for it.
 */
export function reportReviewQueue(): Promise<JobResult> {
  return guard("review-queue", async () => {
    const count = await prisma.booking.count({ where: { status: "NEEDS_MANUAL_REVIEW" } });
    if (count === 0) return "empty";

    const oldest = await prisma.booking.findFirst({
      where: { status: "NEEDS_MANUAL_REVIEW" },
      orderBy: { updatedAt: "asc" },
      select: { reference: true, updatedAt: true },
    });
    const hours = oldest
      ? Math.round((Date.now() - oldest.updatedAt.getTime()) / 3_600_000)
      : 0;
    return `⚠ ${count} booking${count === 1 ? "" : "s"} PAID WITH NO RESERVATION · oldest ${oldest?.reference} (${hours}h)`;
  });
}

/**
 * Notices bookings that were confirmed but never got a PMS number.
 *
 * On the OWS path the number comes back in the same call, so this should stay
 * empty. It exists because "should" is not "does", and a guest holding a
 * confirmation the hotel cannot look up is a problem discovered at the desk.
 */
export function reportMissingConfirmationNumbers(): Promise<JobResult> {
  return guard("pms-numbers", async () => {
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const count = await prisma.booking.count({
      where: {
        status: "CONFIRMED",
        externalConfirmationNumber: null,
        confirmedAt: { lt: cutoff },
      },
    });
    return count === 0 ? "all present" : `⚠ ${count} confirmed without a PMS number`;
  });
}

/**
 * Sends the queued messages.
 *
 * Runs after the confirmation job in the same pass, so a booking confirmed
 * this minute has its email out this minute rather than next.
 */
export function sendQueuedEmails(): Promise<JobResult> {
  return guard("email", async () => {
    const result = await drainOutbox(20);
    if (result.skipped) return result.skipped;

    const trouble = await outboxTrouble();
    const parts: string[] = [];
    if (result.sent > 0) parts.push(`${result.sent} sent`);
    if (result.failed > 0) parts.push(`${result.failed} will retry`);
    if (result.gaveUp > 0) parts.push(`⚠ ${result.gaveUp} GIVEN UP ON`);
    // A guest with no confirmation phones the resort, so a stuck outbox is
    // said out loud on every pass rather than only when it changes.
    if (trouble.failed > 0) parts.push(`⚠ ${trouble.failed} undelivered in total`);
    return parts.length === 0 ? "nothing queued" : parts.join(" · ");
  });
}

export const JOBS = [
  confirmDueBookings,
  sendQueuedEmails,
  expireHolds,
  reportReviewQueue,
  reportMissingConfirmationNumbers,
  purgeKeys,
] as const;
