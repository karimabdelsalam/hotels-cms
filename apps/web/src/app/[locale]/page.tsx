import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getResorts, getExperiences, getOffers, getModules, getBrand } from "@fantazia/db/content";
import { alternatesFor } from "@/lib/seo";
import { Hero } from "@/components/Hero";
import type { HeroSlide } from "@/components/HeroSlider";
import { Reveal } from "@/components/Reveal";
import { ResortCard } from "@/components/ResortCard";

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
  const brand = await getBrand(locale);
  return {
    title: `${brand.name} — ${brand.location}, Red Sea`,
    description: brand.tagline ?? t("lede"),
    alternates: await alternatesFor(locale),
  };
}

const XP_FILLS = ["x1", "x2", "x3", "x4"] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const tr = await getTranslations("resort");
  const ts = await getTranslations("stats");

  const [resorts, experiences, offers, modules] = await Promise.all([
    getResorts(locale),
    getExperiences(locale),
    getOffers(locale),
    getModules(),
  ]);

  const labels = { from: tr("from"), perNight: tr("perNight"), book: tr("book") };

  // The video leads, then one slide per property. Replace the files under
  // public/demo with the group's own footage and this needs no change.
  const heroSlides: HeroSlide[] = [
    {
      kind: "video",
      poster: "/demo/hero-poster.jpg",
      sources: [
        // Narrow viewports take the 720p cut first: same footage, a third of
        // the bytes, and nobody can tell at that size.
        { src: "/demo/hero-loop-720.mp4", type: "video/mp4", media: "(max-width: 900px)" },
        { src: "/demo/hero-loop.webm", type: "video/webm" },
        { src: "/demo/hero-loop.mp4", type: "video/mp4" },
      ],
    },
    ...resorts.map((r, i) => ({
      kind: "image" as const,
      media: r.hero,
      fallbackClass: (["f-1", "f-2", "f-3"][i % 3] ?? "f-1"),
      caption: r.name,
    })),
  ];

  return (
    <>
      <Hero slides={heroSlides} />

      {modules.enabled("manifesto") && (
        <section className="section sec-shell">
          <div className="wrap manifesto">
            <Reveal>
              <h2 className="d2">{t("manifestoTitle")}</h2>
            </Reveal>
            <div className="mf">
              <Reveal delay={0.08}><p>{t("manifesto1")}</p></Reveal>
              <Reveal delay={0.16}><p>{t("manifesto2")}</p></Reveal>
              <Reveal delay={0.24}>
                <Link href={`/${locale}/about`} className="btn btn--outline">
                  {t("aboutGroup")}<span className="ar" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {modules.enabled("resorts") && (
        <section className="section sec-shell" style={{ paddingTop: 0 }} id="resorts">
          <div className="wrap">
            <div className="head head--row">
              <Reveal>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <span className="tag">{t("collection")}</span>
                  <h2 className="d2">{t("resortsTitle")}</h2>
                </div>
              </Reveal>
              <Reveal delay={0.12}>
                <Link href={`/${locale}/resorts`} className="btn btn--outline">
                  {t("compareAll")}<span className="ar" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            </div>
            <div className="houses">
              {resorts.map((r, i) => (
                <Reveal key={r.id} delay={i * 0.08} as="div">
                  <ResortCard resort={r} locale={locale} index={i} labels={labels} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {modules.enabled("reef") && (
        <section className="feature">
          <div className="fill f-reef" />
          <div className="wrap">
            <div className="feature-copy">
              <Reveal><span className="tag tag--surf">{t("reefEyebrow")}</span></Reveal>
              <Reveal delay={0.06}><h2 className="d2">{t("reefTitle")}</h2></Reveal>
              <Reveal delay={0.12}><p className="lede">{t("reefBody")}</p></Reveal>
              <Reveal delay={0.18}>
                <Link href={`/${locale}/diving`} className="btn btn--on-deep">
                  {t("reefCta")}<span className="ar" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {modules.enabled("stats") && (
        <section className="section sec-foam" style={{ paddingBlock: "clamp(56px,7vw,96px)" }}>
          <div className="wrap">
            <Reveal>
              <div className="stats">
                <div className="stat"><b>{resorts.length}</b><span>{ts("resorts")}</span></div>
                <div className="stat"><b>640</b><span>{ts("rooms")}</span></div>
                <div className="stat"><b>40</b><span>{ts("metres")}</span></div>
                <div className="stat"><b>14</b><span>{ts("diveSites")}</span></div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {modules.enabled("experiences") && (
        <section className="section sec-shell" style={{ paddingTop: 0 }} id="experiences">
          <div className="wrap">
            <div className="head">
              <Reveal><span className="tag">{t("experiencesEyebrow")}</span></Reveal>
              <Reveal delay={0.06}><h2 className="d2">{t("experiencesTitle")}</h2></Reveal>
            </div>
          </div>
          <div className="rail">
            {experiences.map((x, i) => (
              <Link key={x.id} href={`/${locale}/experiences/${x.slug}`} className="xp">
                <div className={`fill ${XP_FILLS[i % XP_FILLS.length]}`} />
                <span className="xp-txt">
                  <span className="n">{x.name}</span>
                  {x.summary && <span className="m">{x.summary}</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {modules.enabled("offers") && (
        <section className="section sec-sand" id="offers">
          <div className="wrap">
            <div className="head head--row">
              <Reveal>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <span className="tag">{t("offersEyebrow")}</span>
                  <h2 className="d2">{t("offersTitle")}</h2>
                </div>
              </Reveal>
              <Reveal delay={0.12}>
                <Link href={`/${locale}/offers`} className="btn btn--outline">
                  {t("allOffers")}<span className="ar" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            </div>
            <div className="offers">
              {offers.map((o, i) => (
                <Reveal key={o.id} delay={i * 0.08} as="div">
                  <article className="offer">
                    {o.validityLabel && <span className="w">{o.validityLabel}</span>}
                    <h3><Link href={`/${locale}/offers/${o.slug}`}>{o.title}</Link></h3>
                    {o.summary && <p>{o.summary}</p>}
                    {o.promoCode && <span className="c">Code · {o.promoCode}</span>}
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {modules.enabled("weddings") && (
        <section className="section sec-shell" id="weddings">
          <div className="wrap evt">
            <Reveal><div className="evt-media" /></Reveal>
            <div className="evt-copy">
              <Reveal><span className="tag">{t("weddingsEyebrow")}</span></Reveal>
              <Reveal delay={0.06}><h2 className="d2">{t("weddingsTitle")}</h2></Reveal>
              <Reveal delay={0.12}><p className="lede">{t("weddingsBody")}</p></Reveal>
              <Reveal delay={0.18}>
                <Link href={`/${locale}/weddings`} className="btn btn--sea">
                  {t("weddingsCta")}<span className="ar" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
