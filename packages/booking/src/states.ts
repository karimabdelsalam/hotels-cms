/**
 * The booking state machine, as data.
 *
 * Transitions are declared rather than scattered through the code that
 * performs them, so an illegal move is caught in one place and the diagram in
 * docs/booking-lifecycle.md has exactly one implementation.
 */

export const BOOKING_STATES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "EXPIRED",
  "PAID",
  "PAYMENT_FAILED",
  "CONFIRMING",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "NEEDS_MANUAL_REVIEW",
  "MODIFIED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "COMPLETED",
  "NO_SHOW",
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

const ALLOWED: Record<BookingState, BookingState[]> = {
  DRAFT: ["PENDING_PAYMENT", "EXPIRED"],
  PENDING_PAYMENT: ["PAID", "PAYMENT_FAILED", "EXPIRED"],
  EXPIRED: [],
  PAID: ["CONFIRMING"],
  PAYMENT_FAILED: ["PENDING_PAYMENT", "EXPIRED"],
  CONFIRMING: ["CONFIRMED", "PENDING_CONFIRMATION", "NEEDS_MANUAL_REVIEW"],
  PENDING_CONFIRMATION: ["CONFIRMED", "NEEDS_MANUAL_REVIEW"],
  // A booking under review can still be rescued by hand, or refunded.
  NEEDS_MANUAL_REVIEW: ["CONFIRMED", "CANCELLED", "REFUND_PENDING"],
  CONFIRMED: ["MODIFIED", "CANCELLED", "COMPLETED", "NO_SHOW"],
  MODIFIED: ["CONFIRMED", "CANCELLED"],
  CANCELLED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED", "NEEDS_MANUAL_REVIEW"],
  REFUNDED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

/**
 * The states where the guest has paid and no reservation exists.
 *
 * Not a generic error bucket: reaching NEEDS_MANUAL_REVIEW means money was
 * taken and nothing was booked, which is the single most expensive failure
 * this system can have. An empty queue is a launch criterion.
 */
export const NEEDS_ATTENTION: BookingState[] = ["NEEDS_MANUAL_REVIEW"];

export function canTransition(from: BookingState, to: BookingState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function isTerminal(state: BookingState): boolean {
  return ALLOWED[state]?.length === 0;
}

export class IllegalTransition extends Error {
  constructor(readonly from: string, readonly to: string) {
    super(`A booking cannot go from ${from} to ${to}.`);
    this.name = "IllegalTransition";
  }
}
