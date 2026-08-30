"use client";

import { useTranslations } from "next-intl";

/**
 * Three fields on the surface. Rooms, adults, children, child ages, and promo
 * code open in a popover when the booking engine lands — the brief needs all of
 * them, and eight controls in a row looks like a form from 2011.
 */
export function SearchBar() {
  const t = useTranslations("search");

  return (
    <form
      className="search fade-up"
      role="search"
      aria-label={t("label")}
      onSubmit={(e) => e.preventDefault()}
    >
      <button className="fld" type="button">
        <span className="k">{t("resort")}</span>
        <span className="v">{t("allResorts")}</span>
      </button>
      <button className="fld" type="button">
        <span className="k">{t("when")}</span>
        <span className="v">12 – 19 Nov</span>
      </button>
      <button className="fld" type="button">
        <span className="k">{t("who")}</span>
        <span className="v">{t("twoAdults")}</span>
      </button>
      <button className="btn btn--coral" type="submit">
        {t("submit")}
        <span className="ar" aria-hidden="true">→</span>
      </button>
    </form>
  );
}
