import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@fantazia/db";
import { search } from "@fantazia/booking";
import { formatMoney, getBrand, field } from "@fantazia/db/content";
import { Media } from "@/components/Media";
import { SelectRoom } from "./SelectRoom";
import { StaySummary } from "./StaySummary";

/**
 * Availability changes by the minute, so nothing here is cached. Every other
 * page on the site is ISR; this one is a live read on purpose.
 */
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
  return {
    title: `${t("title")} — ${brand.name}`,
    // A results page for one guest's dates has nothing to offer a search
    // engine, and crawling it would hammer the availability path.
    robots: { index: false, follow: false },
  };
}

type Query = {
  checkIn?: string;
  checkOut?: string;
  adults?: string;
  children?: string;
  rooms?: string;
  resort?: string;
};

const isDate = (v: string | undefined): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  const q = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("booking");
  const ts = await getTranslations("search");

  // A malformed or missing date is a link someone typed, not an error worth a
  // stack trace. Send them back to choose properly.
  if (!isDate(q.checkIn) || !isDate(q.checkOut) || q.checkOut <= q.checkIn) {
    return (
      <section className="section sec-shell page-top">
        <div className="wrap narrow">
          <h1 className="d1">{t("title")}</h1>
          <p className="lede">{t("tryOtherDates")}</p>
          <Link className="btn btn--coral" href={`/${locale}`}>
            {t("backHome")}
          </Link>
        </div>
      </section>
    );
  }

  // Bound to consts so the narrowing above survives into the closures below.
  const checkIn = q.checkIn;
  const checkOut = q.checkOut;
  const adults = Math.min(20, Math.max(1, Number(q.adults) || 2));
  const children = Math.min(20, Math.max(0, Number(q.children) || 0));
  const rooms = Math.min(9, Math.max(1, Number(q.rooms) || 1));

  const results = await search({
    checkIn,
    checkOut,
    occupancy: { adults, children, childAges: [] },
    roomsCount: rooms,
    resortId: q.resort,
  });

  const resortIds = results.map((r) => r.resortId);
  const [resorts, roomTypes, ratePlans] = await Promise.all([
    prisma.resort.findMany({
      where: { id: { in: resortIds } },
      include: {
        translations: true,
        heroMedia: { include: { translations: true } },
      },
    }),
    prisma.roomType.findMany({
      where: { resortId: { in: resortIds } },
      include: {
        translations: true,
        media: { orderBy: { displayOrder: "asc" }, take: 1, include: { media: { include: { translations: true } } } },
      },
    }),
    prisma.ratePlan.findMany({
      where: { resortId: { in: resortIds } },
      include: { translations: true, policy: { include: { translations: true } } },
    }),
  ]);

  const nights = Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
  );
  const anything = results.some((r) => r.rooms.length > 0);

  return (
    <section className="section sec-shell page-top">
      <div className="wrap">
        <header className="head">
          <h1 className="d1">{t("title")}</h1>
          <StaySummary
            checkIn={checkIn}
            checkOut={checkOut}
            nights={nights}
            adults={adults}
            childrenCount={children}
            rooms={rooms}
            locale={locale}
          />
        </header>

        {!anything && (
          <div className="empty-state">
            <p className="lede">{t("noneAnywhere")}</p>
            <Link className="btn btn--coral" href={`/${locale}`}>
              {t("tryOtherDates")}
            </Link>
          </div>
        )}

        <div className="results">
          {results.map((result) => {
            const resort = resorts.find((r) => r.id === result.resortId);
            if (!resort) return null;
            const name = field(resort.translations, locale, "name") ?? resort.code;

            return (
              <article className="result" key={result.resortId}>
                <div className="result-head">
                  <div className="result-shot">
                    <Media
                      media={
                        resort.heroMedia
                          ? {
                              storageKey: resort.heroMedia.storageKey,
                              alt: field(resort.heroMedia.translations, locale, "alt") ?? "",
                              placeholder: resort.heroMedia.placeholder,
                              focalX: resort.heroMedia.focalX,
                              focalY: resort.heroMedia.focalY,
                            }
                          : null
                      }
                      fallbackClass="f-1"
                      sizes="(min-width: 900px) 260px, 100vw"
                    />
                  </div>
                  <div>
                    <h2 className="d2">{name}</h2>
                    {result.unavailableReason ? (
                      <p className="note">{t("resortUnavailable")}</p>
                    ) : result.rooms.length === 0 ? (
                      <p className="note">{t("noneHere")}</p>
                    ) : (
                      <p className="note">{t("optionsHere", { count: result.rooms.length })}</p>
                    )}
                    {(result.unavailableReason || result.rooms.length === 0) && (
                      <Link
                        className="btn btn--sm"
                        href={`/${locale}/resorts/${field(resort.translations, locale, "slug") ?? ""}`}
                      >
                        {t("enquireInstead")}
                      </Link>
                    )}
                  </div>
                </div>

                {result.rooms.length > 0 && (
                  <ul className="avail-list">
                    {result.rooms.map((room) => {
                      const roomType = roomTypes.find((rt) => rt.id === room.roomTypeId);
                      const plan = ratePlans.find((rp) => rp.id === room.ratePlanId);
                      if (!roomType || !plan) return null;
                      const image = roomType.media[0]?.media;

                      return (
                        <li className="avail-row" key={`${room.roomTypeId}:${room.ratePlanId}`}>
                          <div className="avail-shot">
                            <Media
                              media={
                                image
                                  ? {
                                      storageKey: image.storageKey,
                                      alt: field(image.translations, locale, "alt") ?? "",
                                      placeholder: image.placeholder,
                                      focalX: image.focalX,
                                      focalY: image.focalY,
                                    }
                                  : null
                              }
                              fallbackClass="f-2"
                              sizes="160px"
                            />
                          </div>

                          <div className="avail-body">
                            <h3>{field(roomType.translations, locale, "name") ?? ""}</h3>
                            <div className="facts">
                              <span className="fact">{t("sleeps", { count: roomType.maxOccupancy })}</span>
                              {roomType.sizeSqm && <span className="fact">{roomType.sizeSqm} m²</span>}
                              <span className="fact">
                                {field(plan.translations, locale, "name") ?? plan.externalCode}
                              </span>
                              {room.available <= 3 && (
                                <span className="fact fact--warn">
                                  {t("onlyLeft", { count: room.available })}
                                </span>
                              )}
                            </div>
                            {plan.policy && (
                              <p className="policy">
                                {field(plan.policy.translations, locale, "summary")}
                              </p>
                            )}
                          </div>

                          <div className="avail-price">
                            <span className="v">
                              {formatMoney(room.roomTotalMinor * rooms, room.currency, locale)}
                            </span>
                            <span className="u">
                              {t("perStay", { nights: ts("nights", { count: nights }) })}
                            </span>
                            <SelectRoom
                              locale={locale}
                              resortId={result.resortId}
                              roomTypeId={room.roomTypeId}
                              ratePlanId={room.ratePlanId}
                              checkIn={checkIn}
                              checkOut={checkOut}
                              adults={adults}
                              childrenCount={children}
                              rooms={rooms}
                              label={t("selectRoom")}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
