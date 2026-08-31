import { getTranslations } from "next-intl/server";

/** The dates and party, restated so nobody books the wrong week. */
export async function StaySummary({
  checkIn,
  checkOut,
  nights,
  adults,
  childrenCount,
  rooms,
  locale,
}: {
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  childrenCount: number;
  rooms: number;
  locale: string;
}) {
  const t = await getTranslations("search");
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <p className="stay-summary">
      <span>
        {fmt.format(new Date(`${checkIn}T00:00:00Z`))} → {fmt.format(new Date(`${checkOut}T00:00:00Z`))}
      </span>
      <span>{t("nights", { count: nights })}</span>
      <span>
        {adults} {t("adults")}
        {childrenCount > 0 ? `, ${childrenCount} ${t("children")}` : ""}
      </span>
      <span>
        {rooms} {t("rooms")}
      </span>
    </p>
  );
}
