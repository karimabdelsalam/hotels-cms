"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { findBooking, type LookupState } from "./actions";

export function LookupForm() {
  const t = useTranslations("myBooking");
  const router = useRouter();
  const [state, action, pending] = useActionState<LookupState, FormData>(
    async (prev, formData) => {
      const result = await findBooking(prev, formData);
      // On success the action sets a cookie and returns null; the page reads
      // it on the next render, so a refresh is what reveals the booking.
      if (result === null) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="form lookup">
      <label className="field">
        <span>{t("reference")}</span>
        <input
          name="reference"
          className="inp mono"
          required
          autoFocus
          placeholder="FNT-8F3K2P"
          autoComplete="off"
          // Typed off a printout, so casing should not matter.
          style={{ textTransform: "uppercase" }}
        />
        <small>{t("referenceHint")}</small>
      </label>

      <label className="field">
        <span>{t("email")}</span>
        <input name="email" type="email" className="inp" required autoComplete="email" />
      </label>

      {state?.error && (
        <p className="err" role="alert">
          {state.error}
        </p>
      )}

      <button className="btn btn--coral" type="submit" disabled={pending}>
        {pending ? t("finding") : t("find")}
      </button>
    </form>
  );
}
