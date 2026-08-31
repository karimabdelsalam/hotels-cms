import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@fantazia/db";
import { field, formatMoney, getBrand } from "@fantazia/db/content";

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
  // A confirmation carries a guest's name and dates. It must never be indexed.
  return { title: `${t("confirmed")} — ${brand.name}`, robots: { index: false, follow: false } };
}

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; reference: string }>;
}) {
  const { locale, reference } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("booking");

  const booking = await prisma.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    include: {
      guest: true,
      resort: { include: { translations: true } },
      rooms: { include: { roomType: { include: { translations: true } } } },
    },
  });

  if (!booking) {
    return (
      <section className="section sec-shell page-top">
        <div className="wrap narrow">
          <h1 className="d1">{t("confirming")}</h1>
          <p className="lede">{t("confirmingIntro", { reference: reference.toUpperCase() })}</p>
          <Link className="btn btn--coral" href={`/${locale}`}>
            {t("backHome")}
          </Link>
        </div>
      </section>
    );
  }

  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Three honest outcomes. The middle one is the one most sites get wrong:
  // a booking that is paid but not yet in the property system gets our
  // reference and a truthful sentence, never a confirmation number we do not
  // have.
  const state =
    booking.status === "CONFIRMED"
      ? "confirmed"
      : booking.status === "NEEDS_MANUAL_REVIEW"
        ? "needsUs"
        : "confirming";

  return (
    <section className="section sec-shell page-top">
      <div className="wrap narrow">
        <h1 className="d1">
          {state === "confirmed" ? t("confirmed") : state === "needsUs" ? t("needsUs") : t("confirming")}
        </h1>

        <p className="lede">
          {state === "confirmed"
            ? t("confirmedIntro", { email: booking.guest.email })
            : state === "needsUs"
              ? t("needsUsIntro", { reference: booking.reference })
              : t("confirmingIntro", { reference: booking.reference })}
        </p>

        <div className="confirm-card">
          <div className="confirm-row">
            <span>{t("reference")}</span>
            <b><code>{booking.reference}</code></b>
          </div>
          {booking.externalConfirmationNumber && (
            <div className="confirm-row">
              <span>{t("confirmationNumber")}</span>
              <b><code>{booking.externalConfirmationNumber}</code></b>
            </div>
          )}
          <div className="confirm-row">
            <span>{field(booking.resort.translations, locale, "name")}</span>
            <b>
              {fmt.format(booking.checkIn)} → {fmt.format(booking.checkOut)}
            </b>
          </div>
          {booking.rooms.map((room) => (
            <div className="confirm-row" key={room.id}>
              <span>{field(room.roomType.translations, locale, "name")}</span>
              <b>{room.quantity > 1 ? `× ${room.quantity}` : ""}</b>
            </div>
          ))}
          <div className="confirm-row total">
            <span>{t("total")}</span>
            <b>{formatMoney(booking.totalAmount, booking.currency, locale)}</b>
          </div>
        </div>

        <div className="btn-row">
          <Link className="btn btn--coral" href={`/${locale}`}>
            {t("backHome")}
          </Link>
        </div>
      </div>
    </section>
  );
}
