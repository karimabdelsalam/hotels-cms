"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { connectorFor, transition, queueNotification } from "@fantazia/booking";

/**
 * Finding and cancelling your own booking, without an account.
 *
 * The key is reference plus the email it was booked with. That is deliberately
 * two secrets, not one: a reference alone is six characters and guessable at
 * scale, and it appears in inboxes, printouts and hotel paperwork.
 */

const LOOKUP_COOKIE = "fantazia_booking";
const LOOKUP_MAX_AGE = 60 * 30;

const Lookup = z.object({
  reference: z.string().min(3).max(20),
  email: z.string().email(),
});

export type LookupState = { error: string } | null;

/** Rate limiting, per browser. Crude, and better than nothing in front of a guessing loop. */
const ATTEMPT_COOKIE = "fantazia_lookup_tries";
const MAX_TRIES = 8;

export async function findBooking(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const parsed = Lookup.safeParse({
    reference: String(formData.get("reference") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
  });

  const jar = await cookies();
  const tries = Number(jar.get(ATTEMPT_COOKIE)?.value ?? 0);
  if (tries >= MAX_TRIES) {
    return { error: "Too many attempts. Wait a few minutes, or contact us and we will find it." };
  }

  // One message for every failure, so the form never reveals which references
  // exist or which addresses booked.
  const GENERIC = { error: "We could not find a booking with those details." };
  if (!parsed.success) return GENERIC;

  const booking = await prisma.booking.findUnique({
    where: { reference: parsed.data.reference.toUpperCase() },
    select: { id: true, guest: { select: { email: true } } },
  });

  const matches =
    booking && booking.guest.email.toLowerCase() === parsed.data.email.toLowerCase();

  if (!matches) {
    jar.set(ATTEMPT_COOKIE, String(tries + 1), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300,
    });
    return GENERIC;
  }

  // A short-lived token for this booking only, so the page can be refreshed
  // without retyping and a link cannot be forwarded to reveal it later.
  jar.set(LOOKUP_COOKIE, booking.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOOKUP_MAX_AGE,
  });
  jar.delete(ATTEMPT_COOKIE);
  return null;
}

export async function forgetBooking(): Promise<void> {
  (await cookies()).delete(LOOKUP_COOKIE);
}

export async function currentBookingId(): Promise<string | null> {
  return (await cookies()).get(LOOKUP_COOKIE)?.value ?? null;
}

export type CancelState = { error: string } | { ok: true } | null;

/**
 * Cancels in the property system first, then our record.
 *
 * Same order as the admin action, for the same reason: a booking marked
 * cancelled here while the room is still held in OPERA is a room nobody sells
 * and a guest who is not coming.
 */
export async function cancelOwnBooking(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const bookingId = await currentBookingId();
  if (!bookingId || bookingId !== String(formData.get("bookingId") ?? "")) {
    return { error: "Please find your booking again." };
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { error: "Please find your booking again." };
  if (booking.status !== "CONFIRMED") {
    return { error: "This booking cannot be cancelled here. Please contact the resort." };
  }

  if (booking.externalReservationId) {
    try {
      const connector = await connectorFor(booking.resortId);
      if (!connector.capabilities.cancellation) {
        return { error: "Please contact the resort directly to cancel this booking." };
      }
      await connector.cancelReservation({
        reference: booking.reference,
        externalReservationId: booking.externalReservationId,
        resortId: booking.resortId,
        correlationId: booking.correlationId,
      });
    } catch {
      // Never leave the guest thinking it is cancelled when it is not.
      return {
        error:
          "We could not cancel it just now and nothing has changed. Please try again shortly, or contact us.",
      };
    }
  }

  await transition({
    bookingId,
    to: "CANCELLED",
    type: "booking.cancelled_by_guest",
    actorType: "guest",
    data: { cancelledAt: new Date() },
  });
  await queueNotification({ bookingId, kind: "cancelled" });

  return { ok: true };
}
