import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getOfferBySlug, getResorts, getEntitySlugs } from "@fantazia/db/content";
import { alternatesFor } from "@/lib/seo";
import { Reveal } from "@/components/Reveal";
import { PageHero } from "@/components/PageHero";

/**
 * Content comes from the database and is edited in admin, so this page is
 * revalidated rather than frozen at build time. Five minutes is the ceiling on
 * how long an edit takes to appear; publishing does not require a deploy.
 */
export const revalidate = 300;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const o = await getOfferBySlug(locale, slug);
  if (!o) return {};
  return {
    title: `${o.title} — Fantazia Marsa Alam`,
    description: o.summary ?? undefined,
    alternates: await alternatesFor(locale, await getEntitySlugs("offer", o.id), "offers"),
  };
}

export default async function OfferPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const offer = await getOfferBySlug(locale, slug);
  if (!offer) notFound();

  const t = await getTranslations("home");
  const tr = await getTranslations("resort");
  const tf = await getTranslations("offer");

  // A group-wide offer (no resortId) applies at every resort.
  const resorts = await getResorts(locale);
  const eligible = offer.resortId ? resorts.filter((r) => r.id === offer.resortId) : resorts;

  return (
    <>
      <PageHero
        eyebrow={offer.validityLabel ?? t("offersEyebrow")}
        title={offer.title}
        lede={offer.summary}
        fill="f-3"
      />

      <section className="section sec-shell">
        <div className="wrap offer-body">
          <div className="prose">
            <Reveal>
              <p className="lede">{offer.description ?? offer.summary}</p>
            </Reveal>
            {offer.terms && (
              <Reveal delay={0.08}>
                <div className="terms">
                  <h2 className="d3">{tf("terms")}</h2>
                  <p>{offer.terms}</p>
                </div>
              </Reveal>
            )}
          </div>

          <aside className="resort-aside">
            {offer.promoCode && (
              <div>
                <span className="tag">{tf("code")}</span>
                <p className="promo">{offer.promoCode}</p>
              </div>
            )}
            <div>
              <span className="tag">{tf("appliesAt")}</span>
              <ul className="plain-list">
                {eligible.map((r) => (
                  <li key={r.id}>
                    <Link href={`/${locale}/resorts/${r.slug}`}>{r.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link href={`/${locale}/resorts`} className="btn btn--sea">
              {tr("book")}
              <span className="ar" aria-hidden="true">→</span>
            </Link>
          </aside>
        </div>
      </section>
    </>
  );
}
