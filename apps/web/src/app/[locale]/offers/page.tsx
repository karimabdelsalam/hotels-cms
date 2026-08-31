import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getOffers } from "@fantazia/db/content";
import { Reveal } from "@/components/Reveal";
import { PageHero } from "@/components/PageHero";

/**
 * Content comes from the database and is edited in admin, so this page is
 * revalidated rather than frozen at build time. Five minutes is the ceiling on
 * how long an edit takes to appear; publishing does not require a deploy.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: `${t("offersTitle")} — Fantazia`, description: t("offersEyebrow") };
}

export default async function OffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const offers = await getOffers(locale);

  return (
    <>
      <PageHero eyebrow={t("offersEyebrow")} title={t("offersTitle")} fill="f-2" />
      <section className="section sec-shell">
        <div className="wrap">
          <div className="offers">
            {offers.map((o, i) => (
              <Reveal key={o.id} delay={i * 0.07} as="div">
                <article className="offer">
                  {o.validityLabel && <span className="w">{o.validityLabel}</span>}
                  <h2>
                    <Link href={`/${locale}/offers/${o.slug}`}>{o.title}</Link>
                  </h2>
                  {o.summary && <p>{o.summary}</p>}
                  {o.promoCode && <span className="c">Code · {o.promoCode}</span>}
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
