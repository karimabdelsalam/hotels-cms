import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@fantazia/db";
import { field, formatMoney, getBrand } from "@fantazia/db/content";
import { capabilitiesFor } from "@fantazia/booking";
import { currentBookingId } from "./actions";
import { LookupForm } from "./LookupForm";
import { BookingView } from "./BookingView";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [t, brand] = await Promise.all([
    getTranslations({ locale, namespace: "myBooking" }),
    getBrand(locale),
  ]);
  // Indexable — it is a real entry point people search for — but it shows
  // nothing without a reference and the matching email.
  return { title: `${t("title")} — ${brand.name}` };
}

export default async function MyBookingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("myBooking");

  const bookingId = await currentBookingId();
  const booking = bookingId
    ? await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          guest: true,
          resort: { include: { translations: true } },
          rooms: {
            include: {
              roomType: { include: { translations: true } },
              ratePlan: { include: { policy: { include: { translations: true } } } },
            },
          },
        },
      })
    : null;

  if (!booking) {
    return (
      <section className="section sec-shell page-top">
        <div className="wrap narrow">
          <h1 className="d1">{t("title")}</h1>
          <p className="lede">{t("intro")}</p>
          <LookupForm />
        </div>
      </section>
    );
  }

  const capabilities = await capabilitiesFor(booking.resortId);
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="section sec-shell page-top">
      <div className="wrap narrow">
        <h1 className="d1">{t("yourBooking")}</h1>
        <BookingView
          booking={{
            id: booking.id,
            reference: booking.reference,
            status: booking.status,
            resortName: field(booking.resort.translations, locale, "name") ?? booking.resort.code,
            checkIn: fmt.format(booking.checkIn),
            checkOut: fmt.format(booking.checkOut),
            nights: booking.nights,
            adults: booking.adults,
            children: booking.children,
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
            guestEmail: booking.guest.email,
            total: formatMoney(booking.totalAmount, booking.currency, locale) ?? "",
            confirmationNumber: booking.externalConfirmationNumber,
            rooms: booking.rooms.map((r) => ({
              name: field(r.roomType.translations, locale, "name") ?? "",
              quantity: r.quantity,
            })),
            policy: field(
              booking.rooms[0]?.ratePlan.policy?.translations ?? [],
              locale,
              "summary",
            ),
          }}
          // A resort whose connector cannot cancel renders no cancel button at
          // all, rather than one that fails when pressed.
          canCancel={Boolean(capabilities?.cancellation) && booking.status === "CONFIRMED"}
        />
      </div>
    </section>
  );
}
