"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import { retryConfirmation, attachReference, cancelBooking } from "../actions";

/**
 * Three actions, and no fourth.
 *
 * Try again, record a reservation someone made by hand, or give the money
 * back. Each says what it will do before it does it, because every one of them
 * touches a real guest's real money.
 */
export function ReviewActions({
  bookingId,
  status,
  hasExternalReservation,
}: {
  bookingId: string;
  status: string;
  hasExternalReservation: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refund, setRefund] = useState(true);
  const [attachState, attachAction, attachPending] = useActionState(attachReference, null);

  const retry = () =>
    start(async () => {
      setResult(null);
      const outcome = await retryConfirmation(bookingId);
      if ("error" in outcome && outcome.error) return setResult({ error: outcome.error });
      const o = "outcome" in outcome ? outcome.outcome : null;
      setResult({
        message:
          o?.status === "confirmed"
            ? `Confirmed. ${o.confirmationNumber ? `Confirmation number ${o.confirmationNumber}.` : ""}`
            : o?.status === "retry_scheduled"
              ? "Still not answering. Another attempt is scheduled."
              : o?.status === "needs_review"
                ? `The property system refused it: ${o.reason}`
                : "Sent.",
      });
      router.refresh();
    });

  const cancel = () =>
    start(async () => {
      setResult(null);
      const outcome = await cancelBooking(bookingId, refund);
      if ("error" in outcome && outcome.error) return setResult({ error: outcome.error });
      setCancelling(false);
      setResult({ message: refund ? "Cancelled, and a refund is now due." : "Cancelled." });
      router.refresh();
    });

  const canRetry = ["NEEDS_MANUAL_REVIEW", "CONFIRMING", "PAID"].includes(status);
  const canAttach = ["NEEDS_MANUAL_REVIEW", "CONFIRMING", "PENDING_CONFIRMATION"].includes(status);

  return (
    <section className="card">
      <h2>What you can do</h2>

      {result?.error && (
        <p className="err" role="alert">
          {result.error}
        </p>
      )}
      {result?.message && (
        <p className="ok" role="status">
          {result.message}
        </p>
      )}

      {!attaching && !cancelling && (
        <div className="btn-row">
          {canRetry && (
            <button type="button" className="btn btn--pri btn--sm" onClick={retry} disabled={pending}>
              {pending ? "Trying…" : "Try again"}
            </button>
          )}
          {canAttach && (
            <button type="button" className="btn btn--sm" onClick={() => setAttaching(true)} disabled={pending}>
              Attach a reference from OPERA
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setCancelling(true)}
            disabled={pending}
          >
            Cancel this booking
          </button>
        </div>
      )}

      {canRetry && !attaching && !cancelling && (
        <p className="note">
          Trying again runs exactly the path the automatic retry runs, including the lookup
          that adopts a reservation the property system already made. It will not create a
          second one.
        </p>
      )}

      {attaching && (
        <form action={attachAction} className="form">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="note">
            Use this when someone has created the reservation by hand in OPERA. Copy the
            identifiers exactly — the booking will read as confirmed to the guest from the
            moment you save, so a number that is not real makes an honest problem into a
            hidden one.
          </p>
          <Field id="ext" label="Reservation id" hint="OPERA's internal id for the reservation.">
            <input id="ext" name="externalReservationId" className="inp mono" required />
          </Field>
          <Field id="conf" label="Confirmation number" hint="What the guest will be told. Optional.">
            <input id="conf" name="confirmationNumber" className="inp mono" />
          </Field>
          <div className="btn-row">
            <button type="button" className="btn btn--sm" onClick={() => setAttaching(false)} disabled={attachPending}>
              Cancel
            </button>
          </div>
          <SaveBar state={attachState} pending={attachPending} label="Attach and confirm" />
        </form>
      )}

      {cancelling && (
        <div className="danger-zone">
          <p>
            {hasExternalReservation
              ? "This cancels the reservation in the property system first. If that fails, nothing is refunded — a refund on a room the hotel is still holding is the worst of both."
              : "There is no reservation in the property system to cancel, so this only marks our record cancelled."}
          </p>
          <label className="toggle-wrap">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            <span>Also mark a refund as due</span>
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn--sm" onClick={() => setCancelling(false)} disabled={pending}>
              Keep it
            </button>
            <button type="button" className="btn btn--danger btn--sm" onClick={cancel} disabled={pending}>
              {pending ? "Cancelling…" : "Cancel the booking"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
