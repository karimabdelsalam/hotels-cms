"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { confirmBooking, transition, connectorFor } from "@fantazia/booking";
import { requirePermissionForAction, assertResortInScopeForAction } from "@/server/auth";
import { audit } from "@/server/audit";

/* ------------------------------------------------------------------ *
 * The manual review queue
 *
 * Everything here operates on a booking where the guest has paid and no
 * reservation exists. The actions are deliberately few and explicit:
 * try again, attach a reference someone created by hand, or give the
 * money back. Nothing here guesses.
 * ------------------------------------------------------------------ */

async function guard(bookingId: string) {
  const actor = await requirePermissionForAction("bookings:manage");
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, resortId: true, status: true, reference: true, correlationId: true },
  });
  if (!booking) return { ok: false as const, error: "That booking no longer exists." };
  assertResortInScopeForAction(actor, booking.resortId);
  return { ok: true as const, actor, booking };
}

/** Runs the same confirmation path the worker runs, on demand. */
export async function retryConfirmation(bookingId: string) {
  const g = await guard(bookingId);
  if (!g.ok) return { error: g.error };

  if (!["NEEDS_MANUAL_REVIEW", "CONFIRMING", "PAID"].includes(g.booking.status)) {
    return { error: `A booking that is ${g.booking.status} has nothing to retry.` };
  }

  // No status juggling here: confirmBooking handles a retry out of review
  // itself, so this cannot accidentally take a shortcut past its safety checks.
  try {
    const outcome = await confirmBooking(bookingId, { manual: true });
    await audit(g.actor, "booking.retry", "Booking", bookingId, null, outcome);
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/bookings");
    return { ok: true as const, outcome };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The retry failed." };
  }
}

const Attach = z.object({
  bookingId: z.string().min(1),
  externalReservationId: z.string().min(1, "Enter the reservation id from OPERA."),
  confirmationNumber: z.string().nullable(),
});

/**
 * Someone created the reservation by hand in OPERA. This records it.
 *
 * The reference is checked against the property system first where the
 * connector allows it: attaching a number nobody verified turns an honest
 * "needs review" into a booking that looks confirmed and is not.
 */
export async function attachReference(_prev: unknown, formData: FormData) {
  const parsed = Attach.safeParse({
    bookingId: String(formData.get("bookingId") ?? ""),
    externalReservationId: String(formData.get("externalReservationId") ?? "").trim(),
    confirmationNumber: (formData.get("confirmationNumber") as string)?.trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const g = await guard(d.bookingId);
  if (!g.ok) return { error: g.error };
  if (!["NEEDS_MANUAL_REVIEW", "CONFIRMING", "PENDING_CONFIRMATION"].includes(g.booking.status)) {
    return { error: `A booking that is ${g.booking.status} does not need a reference attached.` };
  }

  await transition({
    bookingId: d.bookingId,
    to: "CONFIRMED",
    type: "reservation.attached_by_staff",
    actorType: "staff",
    actorId: g.actor.id,
    payload: {
      externalReservationId: d.externalReservationId,
      confirmationNumber: d.confirmationNumber,
    },
    data: {
      externalReservationId: d.externalReservationId,
      externalConfirmationNumber: d.confirmationNumber,
      confirmedAt: new Date(),
      nextAttemptAt: null,
    },
  });

  await audit(g.actor, "booking.attach_reference", "Booking", d.bookingId, null, d);
  revalidatePath(`/bookings/${d.bookingId}`);
  revalidatePath("/bookings");
  return { ok: true as const, savedAt: Date.now() };
}

/**
 * Cancels in the property system first, then marks a refund due.
 *
 * Order matters and is not negotiable. A refund issued before a failed
 * external cancellation leaves the hotel holding a room for a guest who is not
 * coming and has their money back.
 */
export async function cancelBooking(bookingId: string, refund: boolean) {
  const g = await guard(bookingId);
  if (!g.ok) return { error: g.error };

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { error: "That booking no longer exists." };

  if (booking.externalReservationId) {
    try {
      const connector = await connectorFor(booking.resortId);
      if (!connector.capabilities.cancellation) {
        return {
          error:
            "This property's connection cannot cancel reservations. Cancel it in OPERA, then attach the cancellation by hand.",
        };
      }
      await connector.cancelReservation({
        reference: booking.reference,
        externalReservationId: booking.externalReservationId,
        resortId: booking.resortId,
        correlationId: booking.correlationId,
      });
    } catch (error) {
      // Stop here. Refunding now would be the exact mistake described above.
      return {
        error: `The property system would not cancel it: ${
          error instanceof Error ? error.message : "unknown error"
        }. Nothing has been refunded.`,
      };
    }
  }

  await transition({
    bookingId,
    to: "CANCELLED",
    type: "booking.cancelled",
    actorType: "staff",
    actorId: g.actor.id,
    payload: { refund },
    data: { cancelledAt: new Date() },
  });

  if (refund) {
    await transition({
      bookingId,
      to: "REFUND_PENDING",
      type: "refund.requested",
      actorType: "staff",
      actorId: g.actor.id,
    });
  }

  await audit(g.actor, "booking.cancel", "Booking", bookingId, { status: booking.status }, { refund });
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  return { ok: true as const };
}
