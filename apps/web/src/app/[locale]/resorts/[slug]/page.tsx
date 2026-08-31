import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getResortBySlug, getEntitySlugs, formatMoney, getBrand } from "@fantazia/db/content";
import { alternatesFor, resortJsonLd } from "@/lib/seo";
import { Media } from "@/components/Media";
import { Reveal } from "@/components/Reveal";

/**
 * Content comes from the database and is edited in admin, so this page is
 * revalidated rather than frozen at build time. Five minutes is the ceiling on
 * how long an edit takes to appear; publishing does not require a deploy.
 */
export const revalidate = 300;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const resort = await getResortBySlug(locale, slug);
  if (!resort) return {};
  const brand = await getBrand(locale);
  return {
    title: resort.metaTitle ?? `${resort.name} — ${brand.name}`,
    description: resort.metaDescription ?? resort.shortDescription ?? undefined,
    alternates: await alternatesFor(locale, await getEntitySlugs("resort", resort.id), "resorts"),
  };
}

export default async function ResortPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const resort = await getResortBySlug(locale, slug);
  if (!resort) notFound();

  const t = await getTranslations("resort");
  const price = formatMoney(resort.fromRateMinor, resort.currency, locale);

  const jsonLd = resortJsonLd({
    name: resort.name,
    description: resort.shortDescription,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/${locale}/resorts/${resort.slug}`,
    starRating: resort.stars,
    latitude: resort.latitude,
    longitude: resort.longitude,
    city: resort.destination,
    priceCurrency: resort.currency,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="resort-hero">
        <Media media={resort.hero} fallbackClass="f-1" sizes="100vw" priority />
        <div className="wrap resort-hero-inner">
          <Reveal>
            <Link href={`/${locale}/resorts`} className="tag tag--surf">
              ← {t("backToResorts")}
            </Link>
          </Reveal>
          <Reveal delay={0.06}><h1 className="d1">{resort.name}</h1></Reveal>
          {resort.tagline && (
            <Reveal delay={0.12}><p className="lede on-deep-lede">{resort.tagline}</p></Reveal>
          )}
        </div>
      </header>

      <section className="section sec-shell">
        <div className="wrap resort-body">
          <div className="resort-main">
            {resort.description && <p className="lede">{resort.description}</p>}
            {resort.amenities.length > 0 && (
              <div className="facts">
                {resort.amenities.map((a) => (
                  <span className="fact" key={a}>{a}</span>
                ))}
              </div>
            )}
          </div>
          <aside className="resort-aside">
            {price && (
              <div className="rate">
                <span className="k">{t("from")}</span>
                <span className="v">{price}</span> <span className="u">{t("perNight")}</span>
              </div>
            )}
            <dl className="kv">
              <div><dt>Check in</dt><dd>{resort.checkInTime}</dd></div>
              <div><dt>Check out</dt><dd>{resort.checkOutTime}</dd></div>
              {resort.stars && <div><dt>Rating</dt><dd>{"★".repeat(resort.stars)}</dd></div>}
              {resort.destination && <div><dt>Where</dt><dd>{resort.destination}</dd></div>}
            </dl>
          </aside>
        </div>
      </section>

      {resort.rooms.length > 0 && (
        <section className="section sec-sand">
          <div className="wrap">
            <div className="head">
              <h2 className="d2">{t("rooms")}</h2>
            </div>
            <div className="rooms">
              {resort.rooms.map((room, i) => (
                <Reveal key={room.id} delay={i * 0.06} as="div">
                  <article className={`room${room.images.length > 0 ? " room--shot" : ""}`}>
                    {room.images[0] && (
                      <div className="room-shot">
                        <Media
                          media={room.images[0]}
                          fallbackClass="f-2"
                          sizes="(min-width: 900px) 320px, 100vw"
                        />
                      </div>
                    )}
                    <div className="room-body">
                      <h3 className="d3">{room.name}</h3>
                      {room.description && <p>{room.description}</p>}
                      <div className="facts">
                        <span className="fact">
                          {t("sleeps")} {room.maxOccupancy}
                        </span>
                        {room.sizeSqm != null && <span className="fact">{room.sizeSqm} m²</span>}
                        {room.bedConfig && <span className="fact">{room.bedConfig}</span>}
                      </div>
                    </div>
                    {room.fromRateMinor != null && (
                      <div className="rate">
                        <span className="k">{t("from")}</span>
                        <span className="v">
                          {formatMoney(room.fromRateMinor, resort.currency, locale)}
                        </span>{" "}
                        <span className="u">{t("perNight")}</span>
                      </div>
                    )}
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
