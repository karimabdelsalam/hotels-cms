import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@fantazia/db";
import { field, formatMoney, getBrand } from "@fantazia/db/content";
import type { Quote } from "@fantazia/booking";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [t, brand] = await Promise.all([
    getTranslations({ locale, namespace: "booking" }),
    getBrand(locale),
  ]);
  return { title: `${t("checkout")} — ${brand.name}`, robots: { index: false, follow: false } };
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hold?: string }>;
}) {
  const { locale } = await params;
  const { hold: holdId } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("booking");

  const hold = holdId
    ? await prisma.bookingHold.findUnique({
        where: { id: holdId },
        include: { resort: { include: { translations: true } } },
      })
    : null;

  // An expired or unknown hold is not an error page — it is a price that no
  // longer stands, and the guest needs to be told that in those words.
  if (!hold || hold.expiresAt < new Date()) {
    return (
      <section className="section sec-shell page-top">
        <div className="wrap narrow">
          <h1 className="d1">{t("holdExpired")}</h1>
          <Link className="btn btn--coral" href={`/${locale}`}>
            {t("startOver")}
          </Link>
        </div>
      </section>
    );
  }

  const quote = hold.quote as unknown as Quote;
  const payload = hold.payload as { checkIn: string; checkOut: string };

  const [roomTypes, ratePlans] = await Promise.all([
    prisma.roomType.findMany({
      where: { id: { in: quote.lines.map((l) => l.roomTypeId) } },
      include: { translations: true },
    }),
    prisma.ratePlan.findMany({
      where: { id: { in: quote.lines.map((l) => l.ratePlanId) } },
      include: { translations: true, policy: { include: { translations: true } } },
    }),
  ]);

  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const minutesLeft = Math.max(1, Math.round((hold.expiresAt.getTime() - Date.now()) / 60_000));

  return (
    <section className="section sec-shell page-top">
      <div className="wrap checkout">
        <div className="checkout-form">
          <h1 className="d1">{t("checkout")}</h1>
          <p className="note">{t("holdExpires", { minutes: minutesLeft })}</p>
          <CheckoutForm holdId={hold.id} locale={locale} />
        </div>

        <aside className="checkout-summary">
          <h2>{t("yourStay")}</h2>
          <p className="stay-where">
            {field(hold.resort.translations, locale, "name")}
          </p>
          <p className="stay-when">
            {fmt.format(new Date(`${payload.checkIn}T00:00:00Z`))} →{" "}
            {fmt.format(new Date(`${payload.checkOut}T00:00:00Z`))}
          </p>

          <ul className="lines">
            {quote.lines.map((line) => {
              const roomType = roomTypes.find((rt) => rt.id === line.roomTypeId);
              const plan = ratePlans.find((rp) => rp.id === line.ratePlanId);
              return (
                <li key={`${line.roomTypeId}:${line.ratePlanId}`}>
                  <span>
                    {field(roomType?.translations ?? [], locale, "name")}
                    {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    <small>{field(plan?.translations ?? [], locale, "name")}</small>
                  </span>
                  <b>{formatMoney(line.roomTotalMinor, quote.currency, locale)}</b>
                </li>
              );
            })}
          </ul>

          <ul className="lines lines--totals">
            <li>
              <span>{t("rooms")}</span>
              <b>{formatMoney(quote.roomTotalMinor, quote.currency, locale)}</b>
            </li>
            {/* Named, not bundled into one "taxes and fees" line — a guest who
                checks the arithmetic should be able to. */}
            {quote.breakdown.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <b>{formatMoney(item.minor, quote.currency, locale)}</b>
              </li>
            ))}
            <li className="total">
              <span>{t("total")}</span>
              <b>{formatMoney(quote.totalMinor, quote.currency, locale)}</b>
            </li>
          </ul>

          {ratePlans[0]?.policy && (
            <div className="policy-box">
              <h3>{t("cancellation")}</h3>
              <p>{field(ratePlans[0].policy.translations, locale, "summary")}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
