"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cancelOwnBooking, forgetBooking, type CancelState } from "./actions";

type Booking = {
  id: string;
  reference: string;
  status: string;
  resortName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  guestName: string;
  guestEmail: string;
  total: string;
  confirmationNumber: string | null;
  rooms: { name: string; quantity: number }[];
  policy: string | null;
};

export function BookingView({ booking, canCancel }: { booking: Booking; canCancel: boolean }) {
  const t = useTranslations("myBooking");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<CancelState, FormData>(
    async (prev, formData) => {
      const result = await cancelOwnBooking(prev, formData);
      if (result && "ok" in result) router.refresh();
      return result;
    },
    null,
  );

  const cancelled = booking.status === "CANCELLED" || (state && "ok" in state);

  const statusLabel =
    booking.status === "CONFIRMED"
      ? t("statusConfirmed")
      : booking.status === "CANCELLED"
        ? t("statusCancelled")
        : booking.status === "NEEDS_MANUAL_REVIEW"
          ? t("statusNeedsUs")
          : ["PAID", "CONFIRMING", "PENDING_CONFIRMATION"].includes(booking.status)
            ? t("statusConfirming")
            : t("statusOther");

  return (
    <>
      <div className="confirm-card">
        <div className="confirm-row">
          <span>{t("reference")}</span>
          <b>
            <code>{booking.reference}</code>
          </b>
        </div>
        <div className="confirm-row">
          <span>{t("status")}</span>
          <b>{cancelled ? t("statusCancelled") : statusLabel}</b>
        </div>
        {booking.confirmationNumber && !cancelled && (
          <div className="confirm-row">
            <span>{t("confirmationNumber")}</span>
            <b>
              <code>{booking.confirmationNumber}</code>
            </b>
          </div>
        )}
        <div className="confirm-row">
          <span>{t("stay")}</span>
          <b>
            {booking.resortName}
            <br />
            {booking.checkIn} → {booking.checkOut}
          </b>
        </div>
        {booking.rooms.map((room) => (
          <div className="confirm-row" key={room.name}>
            <span>{room.name}</span>
            <b>{room.quantity > 1 ? `× ${room.quantity}` : ""}</b>
          </div>
        ))}
        <div className="confirm-row">
          <span>{t("guest")}</span>
          <b>
            {booking.guestName}
            <br />
            {booking.guestEmail}
          </b>
        </div>
        <div className="confirm-row total">
          <span>{t("total")}</span>
          <b>{booking.total}</b>
        </div>
      </div>

      {booking.policy && !cancelled && (
        <div className="policy-box">
          <h3>{t("cancellation")}</h3>
          <p>{booking.policy}</p>
        </div>
      )}

      {cancelled && (
        <p className="note" role="status">
          {t("cancelled")}
        </p>
      )}

      {!cancelled && !canCancel && <p className="note">{t("cannotCancelHere")}</p>}

      {!cancelled && canCancel && !confirming && (
        <div className="btn-row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(true)}>
            {t("cancel")}
          </button>
        </div>
      )}

      {!cancelled && canCancel && confirming && (
        <form action={action} className="price-changed">
          <input type="hidden" name="bookingId" value={booking.id} />
          <p>{t("cancelWarning")}</p>
          {state && "error" in state && (
            <p className="err" role="alert">
              {state.error}
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {t("keep")}
            </button>
            <button className="btn btn--coral btn--sm" type="submit" disabled={pending}>
              {pending ? t("cancelling") : t("cancelConfirm")}
            </button>
          </div>
        </form>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={async () => {
            await forgetBooking();
            router.refresh();
          }}
        >
          {t("done")}
        </button>
      </div>
    </>
  );
}
