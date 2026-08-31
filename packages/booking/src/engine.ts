import { randomUUID } from "node:crypto";
import { prisma } from "@fantazia/db";
import { connectorFor } from "./connector";
import {
  ConnectorRejection,
  ConnectorTransportError,
  ConnectorUnavailable,
  type Occupancy,
  type Quote,
} from "./connector/types";
import { priceQuote } from "./pricing";
import { generateReference } from "./reference";
import { canTransition, IllegalTransition, type BookingState } from "./states";
import { runOnce } from "./idempotency";
import { availabilityFromSnapshot, nightsBetween } from "./connector/snapshot";
import { queueNotification } from "./email";

const HOLD_MINUTES = 15;

/* ------------------------------------------------------------------ *
 * Transitions
 * ------------------------------------------------------------------ */

/**
 * Moves a booking and writes the event, in one transaction.
 *
 * Both or neither: a status that changed without an event is a booking whose
 * history has a hole in it, and the history is what makes an inconsistency
 * investigable at 2am.
 */
export async function transition(options: {
  bookingId: string;
  to: BookingState;
  type: string;
  actorType: "guest" | "system" | "staff" | "provider";
  actorId?: string;
  payload?: unknown;
  data?: Record<string, unknown>;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: options.bookingId },
      select: { status: true, correlationId: true },
    });
    if (!booking) throw new Error("That booking no longer exists.");

    const from = booking.status as BookingState;
    if (from !== options.to && !canTransition(from, options.to)) {
      throw new IllegalTransition(from, options.to);
    }

    await tx.booking.update({
      where: { id: options.bookingId },
      data: { status: options.to, ...(options.data ?? {}) },
    });

    await tx.bookingEvent.create({
      data: {
        bookingId: options.bookingId,
        type: options.type,
        fromStatus: from,
        toStatus: options.to,
        actorType: options.actorType,
        actorId: options.actorId,
        payload: (options.payload ?? undefined) as never,
        correlationId: booking.correlationId,
      },
    });
  });
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export type SearchRequest = {
  checkIn: string;
  checkOut: string;
  occupancy: Occupancy;
  roomsCount: number;
  /** Omit to search the whole group. */
  resortId?: string;
};

export type SearchResult = {
  resortId: string;
  rooms: Awaited<ReturnType<typeof availabilityFromSnapshot>>["rooms"];
  /** Cheapest room total at this resort, for the "from" price on a card. */
  fromMinor: number | null;
  currency: string | null;
  unavailableReason?: string;
};

/**
 * Availability across the group.
 *
 * A resort whose connection is down is returned with a reason rather than
 * dropped: the guest sees the property and can enquire, instead of a resort
 * silently vanishing from a group of three.
 */
export async function search(request: SearchRequest): Promise<SearchResult[]> {
  const nights = nightsBetween(request.checkIn, request.checkOut);
  if (nights.length === 0) return [];

  // Deliberately not filtered on `integration.enabled`. A resort that cannot
  // be checked must still come back — with a reason — so the guest sees three
  // properties and an explanation rather than a group that silently shrank.
  const resorts = await prisma.resort.findMany({
    where: {
      status: "published",
      ...(request.resortId ? { id: request.resortId } : {}),
    },
    select: { id: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });

  return Promise.all(
    resorts.map(async (resort): Promise<SearchResult> => {
      try {
        const connector = await connectorFor(resort.id);
        const availability = await connector.getAvailability({
          resortId: resort.id,
          checkIn: request.checkIn,
          checkOut: request.checkOut,
          occupancy: request.occupancy,
          roomsCount: request.roomsCount,
        });
        const cheapest = availability.rooms[0];
        return {
          resortId: resort.id,
          rooms: availability.rooms,
          fromMinor: cheapest?.roomTotalMinor ?? null,
          currency: cheapest?.currency ?? null,
        };
      } catch (error) {
        return {
          resortId: resort.id,
          rooms: [],
          fromMinor: null,
          currency: null,
          unavailableReason:
            error instanceof ConnectorUnavailable
              ? error.message
              : "We could not check availability here just now.",
        };
      }
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Hold and quote
 * ------------------------------------------------------------------ */

export type HoldRequest = {
  resortId: string;
  sessionId: string;
  checkIn: string;
  checkOut: string;
  lines: { roomTypeId: string; ratePlanId: string; quantity: number; occupancy: Occupancy }[];
  promoCode?: string;
};

export type HoldResult = { holdId: string; quote: Quote; expiresAt: Date };

/**
 * Enters checkout: prices the stay and holds that price for fifteen minutes.
 *
 * Not an inventory hold in OPERA unless the connector offers one — it holds
 * the quote, not the room. The re-check before payment is what catches a room
 * that sold in the meantime.
 */
export async function createHold(request: HoldRequest): Promise<HoldResult> {
  const correlationId = randomUUID();
  const connector = await connectorFor(request.resortId);

  const quote = await connector.quote({
    resortId: request.resortId,
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    lines: request.lines,
    promoCode: request.promoCode,
    correlationId,
  });

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
  const hold = await prisma.bookingHold.create({
    data: {
      resortId: request.resortId,
      sessionId: request.sessionId,
      payload: {
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        lines: request.lines,
        promoCode: request.promoCode ?? null,
        correlationId,
      } as never,
      quote: quote as never,
      expiresAt,
    },
  });

  return { holdId: hold.id, quote, expiresAt };
}

export type ValidateOutcome =
  | { ok: true; quote: Quote }
  | { ok: false; reason: "expired" | "gone" }
  | { ok: false; reason: "changed"; quote: Quote; previousTotalMinor: number }
  | { ok: false; reason: "unavailable"; message: string };

/**
 * The last check before money moves.
 *
 * Re-prices live, cache bypassed. A price that moved is returned as a
 * difference for the guest to accept — never charged silently, and never
 * quietly held at the old number either.
 */
export async function validateHold(holdId: string): Promise<ValidateOutcome> {
  const hold = await prisma.bookingHold.findUnique({ where: { id: holdId } });
  if (!hold) return { ok: false, reason: "gone" };
  if (hold.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const payload = hold.payload as {
    checkIn: string;
    checkOut: string;
    lines: HoldRequest["lines"];
    promoCode: string | null;
    correlationId: string;
  };
  const previous = hold.quote as unknown as Quote;

  let fresh: Quote;
  try {
    fresh = await priceQuote({
      resortId: hold.resortId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      lines: payload.lines,
      promoCode: payload.promoCode ?? undefined,
      correlationId: payload.correlationId,
    });
  } catch (error) {
    if (error instanceof ConnectorRejection) {
      return { ok: false, reason: "unavailable", message: error.message };
    }
    throw error;
  }

  if (fresh.totalMinor !== previous.totalMinor) {
    // The hold now carries the new price, so accepting it charges what was
    // just shown rather than what was shown fifteen minutes ago.
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { quote: fresh as never },
    });
    return { ok: false, reason: "changed", quote: fresh, previousTotalMinor: previous.totalMinor };
  }

  return { ok: true, quote: fresh };
}

/* ------------------------------------------------------------------ *
 * Booking
 * ------------------------------------------------------------------ */

export type GuestDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  country?: string;
  marketingConsent?: boolean;
};

/** Turns a validated hold into a DRAFT booking with a reference. */
export async function createBookingFromHold(options: {
  holdId: string;
  guest: GuestDetails;
  locale: string;
  specialRequests?: string;
}): Promise<{ bookingId: string; reference: string }> {
  const validated = await validateHold(options.holdId);
  if (!validated.ok) {
    if (validated.reason === "changed") {
      throw new ConnectorRejection("The price changed. Please confirm the new total.", "PRICE_CHANGED");
    }
    if (validated.reason === "unavailable") {
      throw new ConnectorRejection(validated.message, "NO_AVAILABILITY");
    }
    throw new ConnectorRejection("That checkout has expired. Please search again.", "HOLD_EXPIRED");
  }

  const hold = (await prisma.bookingHold.findUnique({
    where: { id: options.holdId },
    include: { booking: { select: { id: true, reference: true } } },
  }))!;

  // One hold, one booking. A refreshed checkout page must not open a second.
  if (hold.booking) {
    return { bookingId: hold.booking.id, reference: hold.booking.reference };
  }

  const payload = hold.payload as { checkIn: string; checkOut: string; correlationId: string };
  const quote = validated.quote;
  const nights = nightsBetween(payload.checkIn, payload.checkOut).length;

  const guest = await prisma.guest.create({
    data: {
      firstName: options.guest.firstName,
      lastName: options.guest.lastName,
      email: options.guest.email,
      phone: options.guest.phone,
      country: options.guest.country,
      locale: options.locale,
      marketingConsent: options.guest.marketingConsent ?? false,
    },
  });

  const reference = await generateReference();
  const adults = quote.lines.reduce((s, l) => s + l.occupancy.adults * l.quantity, 0);
  const children = quote.lines.reduce((s, l) => s + l.occupancy.children * l.quantity, 0);

  const booking = await prisma.booking.create({
    data: {
      reference,
      resortId: hold.resortId,
      guestId: guest.id,
      holdId: hold.id,
      status: "DRAFT",
      checkIn: new Date(`${payload.checkIn}T00:00:00Z`),
      checkOut: new Date(`${payload.checkOut}T00:00:00Z`),
      nights,
      adults,
      children,
      childAges: quote.lines.flatMap((l) => l.occupancy.childAges),
      roomsCount: quote.lines.reduce((s, l) => s + l.quantity, 0),
      currency: quote.currency,
      roomTotal: quote.roomTotalMinor,
      taxesTotal: quote.taxesTotalMinor,
      feesTotal: quote.feesTotalMinor,
      totalAmount: quote.totalMinor,
      locale: options.locale,
      specialRequests: options.specialRequests,
      correlationId: payload.correlationId,
      rooms: {
        create: quote.lines.map((line) => ({
          roomTypeId: line.roomTypeId,
          ratePlanId: line.ratePlanId,
          adults: line.occupancy.adults,
          children: line.occupancy.children,
          childAges: line.occupancy.childAges,
          quantity: line.quantity,
          nightlyRates: line.nightly as never,
          roomTotal: line.roomTotalMinor,
        })),
      },
      events: {
        create: {
          type: "booking.created",
          toStatus: "DRAFT",
          actorType: "guest",
          correlationId: payload.correlationId,
          payload: { quote: quote.totalMinor, currency: quote.currency } as never,
        },
      },
    },
  });

  return { bookingId: booking.id, reference: booking.reference };
}

/* ------------------------------------------------------------------ *
 * Reservation creation — where the care goes
 * ------------------------------------------------------------------ */

const MAX_ATTEMPTS = 5;

/** Roughly 2s → 4m, with jitter so retries do not arrive in lockstep. */
function backoffMs(attempt: number): number {
  const base = Math.min(2000 * 2 ** (attempt - 1), 240_000);
  return base + Math.floor(Math.random() * (base * 0.25));
}

export type ConfirmOutcome =
  | { status: "confirmed"; reference: string; confirmationNumber?: string }
  | { status: "pending_confirmation"; reference: string }
  | { status: "retry_scheduled"; reference: string; nextAttemptAt: Date }
  | { status: "needs_review"; reference: string; reason: string };

/**
 * Creates the reservation in the property system.
 *
 * The dangerous failure is not a rejected request — it is a request that
 * *succeeded* while the response was lost. So every attempt after the first
 * begins by looking the reservation up by our own reference. If it already
 * exists we adopt it. Without this, one network timeout produces two
 * reservations for one guest and the hotel finds out at check-in.
 */
export async function confirmBooking(
  bookingId: string,
  options: {
    /**
     * A person pressed "try again". The automatic attempt budget does not
     * apply — staff decide when to stop — but every safety check still does,
     * the lookup above most of all.
     */
     manual?: boolean;
  } = {},
): Promise<ConfirmOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { rooms: true, guest: true },
  });
  if (!booking) throw new Error("That booking no longer exists.");

  if (booking.status === "CONFIRMED") {
    return {
      status: "confirmed",
      reference: booking.reference,
      confirmationNumber: booking.externalConfirmationNumber ?? undefined,
    };
  }
  const retryable =
    booking.status === "PAID" ||
    booking.status === "CONFIRMING" ||
    // A person pressing "try again" on a booking sitting in review is the
    // commonest retry there is. Handled here rather than requiring the caller
    // to move the status first — the caller that forgets skips the lookup too.
    (options.manual && booking.status === "NEEDS_MANUAL_REVIEW");
  if (!retryable) {
    throw new IllegalTransition(booking.status, "CONFIRMING");
  }

  const attempt = booking.confirmAttempts + 1;
  if (booking.status === "PAID" || booking.status === "NEEDS_MANUAL_REVIEW") {
    await transition({
      bookingId,
      to: "CONFIRMING",
      type: "reservation.attempt",
      actorType: "system",
      payload: { attempt },
    });
  }
  await prisma.booking.update({ where: { id: bookingId }, data: { confirmAttempts: attempt } });

  let connector;
  try {
    connector = await connectorFor(booking.resortId);
  } catch (error) {
    return scheduleOrReview(booking.id, booking.reference, attempt, String((error as Error).message), options.manual);
  }

  // Look before you leap.
  //
  // Deliberately not keyed on the attempt counter alone. A staff retry from
  // the admin resets nothing, but if it ever did, keying on the counter would
  // silently skip this check and create a second reservation — which is how
  // this exact guard was defeated once already. Anything that has been tried
  // before, or already carries an external id, gets looked up first.
  const triedBefore = booking.confirmAttempts > 0 || Boolean(booking.externalReservationId);
  if (triedBefore) {
    try {
      const existing = await connector.getReservationByReference(
        booking.reference,
        booking.resortId,
        booking.correlationId,
      );
      if (existing && existing.status === "confirmed") {
        await adopt(bookingId, existing.externalReservationId, existing.externalConfirmationNumber, attempt);
        return {
          status: "confirmed",
          reference: booking.reference,
          confirmationNumber: existing.externalConfirmationNumber,
        };
      }
    } catch {
      // The lookup itself failed. Creating now might duplicate, so we wait
      // rather than risk it — a delayed booking is recoverable, two are not.
      return scheduleOrReview(bookingId, booking.reference, attempt, "Could not check for an existing reservation.", options.manual);
    }
  }

  const request = {
    reference: booking.reference,
    resortId: booking.resortId,
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    checkOut: booking.checkOut.toISOString().slice(0, 10),
    guest: {
      firstName: booking.guest.firstName,
      lastName: booking.guest.lastName,
      email: booking.guest.email,
      phone: booking.guest.phone ?? undefined,
      country: booking.guest.country ?? undefined,
    },
    lines: booking.rooms.map((room) => ({
      roomTypeId: room.roomTypeId,
      ratePlanId: room.ratePlanId,
      quantity: room.quantity,
      occupancy: { adults: room.adults, children: room.children, childAges: room.childAges },
      nightly: room.nightlyRates as unknown as { date: string; minor: number }[],
      roomTotalMinor: room.roomTotal,
    })),
    currency: booking.currency,
    totalMinor: booking.totalAmount,
    specialRequests: booking.specialRequests ?? undefined,
    correlationId: booking.correlationId,
  };

  try {
    // Keyed on the booking, so a duplicated job cannot create twice either.
    const ref = await runOnce({
      key: `reservation:${booking.id}`,
      scope: "reservation",
      request: { bookingId: booking.id },
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      work: () => connector.createReservation(request),
    });

    if (!connector.capabilities.instantConfirmation && !ref.externalConfirmationNumber) {
      await transition({
        bookingId,
        to: "PENDING_CONFIRMATION",
        type: "reservation.accepted",
        actorType: "system",
        payload: { externalReservationId: ref.externalReservationId },
        data: { externalReservationId: ref.externalReservationId },
      });
      await queueNotification({ bookingId, kind: "pending_confirmation" });
      return { status: "pending_confirmation", reference: booking.reference };
    }

    await adopt(bookingId, ref.externalReservationId, ref.externalConfirmationNumber, attempt);
    return {
      status: "confirmed",
      reference: booking.reference,
      confirmationNumber: ref.externalConfirmationNumber,
    };
  } catch (error) {
    // A business refusal will say the same thing five times more slowly.
    if (error instanceof ConnectorRejection) {
      await transition({
        bookingId,
        to: "NEEDS_MANUAL_REVIEW",
        type: "reservation.rejected",
        actorType: "system",
        payload: { code: error.code, message: error.message, attempt },
        data: { nextAttemptAt: null },
      });
      // The guest is told the truth immediately rather than left wondering
      // why a payment went through and no confirmation came.
      await queueNotification({ bookingId, kind: "needs_review" });
      return { status: "needs_review", reference: booking.reference, reason: error.message };
    }

    if (error instanceof ConnectorTransportError || error instanceof ConnectorUnavailable) {
      return scheduleOrReview(bookingId, booking.reference, attempt, error.message, options.manual);
    }
    throw error;
  }
}

async function adopt(
  bookingId: string,
  externalReservationId: string,
  confirmationNumber: string | undefined,
  attempt: number,
) {
  await transition({
    bookingId,
    to: "CONFIRMED",
    type: "reservation.confirmed",
    actorType: "system",
    payload: { externalReservationId, confirmationNumber, attempt },
    data: {
      externalReservationId,
      externalConfirmationNumber: confirmationNumber ?? null,
      confirmedAt: new Date(),
      nextAttemptAt: null,
    },
  });
  await queueNotification({ bookingId, kind: "confirmed" });
}

async function scheduleOrReview(
  bookingId: string,
  reference: string,
  attempt: number,
  reason: string,
  manual = false,
): Promise<ConfirmOutcome> {
  if (!manual && attempt >= MAX_ATTEMPTS) {
    await transition({
      bookingId,
      to: "NEEDS_MANUAL_REVIEW",
      type: "reservation.exhausted",
      actorType: "system",
      payload: { attempt, reason },
      data: { nextAttemptAt: null },
    });
    await queueNotification({ bookingId, kind: "needs_review" });
    return { status: "needs_review", reference, reason };
  }

  if (manual) {
    // Back to the queue, not onto a schedule. A person is standing there; the
    // honest answer is "that did not work", not a retry they cannot see.
    await transition({
      bookingId,
      to: "NEEDS_MANUAL_REVIEW",
      type: "reservation.manual_retry_failed",
      actorType: "staff",
      payload: { attempt, reason },
      data: { nextAttemptAt: null },
    }).catch(() => undefined);
    return { status: "needs_review", reference, reason };
  }

  const nextAttemptAt = new Date(Date.now() + backoffMs(attempt));
  await prisma.booking.update({ where: { id: bookingId }, data: { nextAttemptAt } });
  await prisma.bookingEvent.create({
    data: {
      bookingId,
      type: "reservation.retry_scheduled",
      actorType: "system",
      correlationId: (await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { correlationId: true },
      }))!.correlationId,
      payload: { attempt, reason, nextAttemptAt } as never,
    },
  });
  return { status: "retry_scheduled", reference, nextAttemptAt };
}

/** Bookings whose retry is due. Driven by a worker, not by a request. */
export async function dueForConfirmation(limit = 20) {
  return prisma.booking.findMany({
    where: { status: "CONFIRMING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true, reference: true },
  });
}

/** Holds nobody came back to. Only ever touches DRAFT bookings. */
export async function expireStaleHolds(): Promise<number> {
  const stale = await prisma.booking.findMany({
    where: { status: { in: ["DRAFT", "PENDING_PAYMENT"] }, hold: { expiresAt: { lt: new Date() } } },
    select: { id: true },
  });
  for (const booking of stale) {
    await transition({
      bookingId: booking.id,
      to: "EXPIRED",
      type: "hold.expired",
      actorType: "system",
    }).catch(() => undefined);
  }
  await prisma.bookingHold.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, booking: null },
  });
  return stale.length;
}
