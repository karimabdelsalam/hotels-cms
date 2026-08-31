"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitGuest, type CheckoutState } from "../actions";

export function CheckoutForm({ holdId, locale }: { holdId: string; locale: string }) {
  const t = useTranslations("booking");
  const [state, action, pending] = useActionState<CheckoutState, FormData>(submitGuest, null);

  const changed = state && "priceChanged" in state ? state : null;
  const expired = state && "error" in state && state.error === "expired";

  if (expired) {
    return (
      <div className="price-changed">
        <h2>{t("holdExpired")}</h2>
        <a className="btn btn--coral" href={`/${locale}`}>
          {t("startOver")}
        </a>
      </div>
    );
  }

  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-EG" : locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);

  return (
    <>
      {/* The form stays mounted through a price change. Swapping it for a
          different one would throw away everything already typed, and asking
          someone to retype their name because the rate moved is how a booking
          gets abandoned. The hold already carries the new price, so submitting
          again charges what is on screen. */}
      {changed && (
        <div className="price-changed" role="alert">
          <h2>{t("priceChanged")}</h2>
          <p>
            <s>{t("priceWas", { was: money(changed.wasMinor, changed.currency) })}</s>
            <br />
            <b>{t("priceNow", { now: money(changed.nowMinor, changed.currency) })}</b>
          </p>
        </div>
      )}

      <form action={action} className="form">
        <input type="hidden" name="holdId" value={holdId} />
        <input type="hidden" name="locale" value={locale} />

        <div className="grid-2">
          <label className="field">
            <span>{t("firstName")}</span>
            <input name="firstName" className="inp" required autoComplete="given-name" />
          </label>
          <label className="field">
            <span>{t("lastName")}</span>
            <input name="lastName" className="inp" required autoComplete="family-name" />
          </label>
        </div>

        <label className="field">
          <span>{t("email")}</span>
          <input name="email" type="email" className="inp" required autoComplete="email" />
          <small>{t("emailHint")}</small>
        </label>

        <div className="grid-2">
          <label className="field">
            <span>{t("phone")}</span>
            <input name="phone" type="tel" className="inp" autoComplete="tel" />
          </label>
          <label className="field">
            <span>{t("country")}</span>
            <input name="country" className="inp" maxLength={2} autoComplete="country" placeholder="EG" />
          </label>
        </div>

        <label className="field">
          <span>{t("requests")}</span>
          <textarea name="specialRequests" className="inp" rows={3} />
          <small>{t("requestsHint")}</small>
        </label>

        <label className="check">
          <input type="checkbox" name="marketingConsent" />
          <span>{t("marketing")}</span>
        </label>

        {state && "error" in state && state.error !== "expired" && (
          <p className="err" role="alert">
            {state.error}
          </p>
        )}

        <button className="btn btn--coral" type="submit" disabled={pending}>
          {pending ? t("paying") : changed ? t("acceptNewPrice") : t("payNow")}
        </button>
      </form>
    </>
  );
}
