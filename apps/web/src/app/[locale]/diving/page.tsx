import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getResorts } from "@fantazia/db/content";
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
  return { title: `${t("reefTitle")} — Fantazia Marsa Alam`, description: t("reefBody") };
}

export default async function DivingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const ts = await getTranslations("stats");
  const td = await getTranslations("diving");
  const resorts = await getResorts(locale);

  return (
    <>
      <PageHero
        eyebrow={t("reefEyebrow")}
        title={t("reefTitle")}
        lede={t("reefBody")}
        fill="f-reef"
      />

      <section className="section sec-shell">
        <div className="wrap manifesto">
          <Reveal>
            <h2 className="d2">{td("title")}</h2>
          </Reveal>
          <div className="mf">
            <Reveal delay={0.08}>
              <p>{td("body1")}</p>
            </Reveal>
            <Reveal delay={0.16}>
              <p>{td("body2")}</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section sec-foam" style={{ paddingBlock: "clamp(56px,7vw,96px)" }}>
        <div className="wrap">
          <Reveal>
            <div className="stats">
              <div className="stat"><b>40</b><span>{ts("metres")}</span></div>
              <div className="stat"><b>14</b><span>{ts("diveSites")}</span></div>
              <div className="stat"><b>{resorts.length}</b><span>{ts("resorts")}</span></div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section sec-shell">
        <div className="wrap">
          <div className="head">
            <Reveal><h2 className="d2">{td("whereToStay")}</h2></Reveal>
          </div>
          <div className="rooms">
            {resorts.map((r, i) => (
              <Reveal key={r.id} delay={i * 0.06} as="div">
                <article className="room">
                  <div className="room-body">
                    <h3 className="d3">
                      <Link href={`/${locale}/resorts/${r.slug}`}>{r.name}</Link>
                    </h3>
                    {r.shortDescription && <p>{r.shortDescription}</p>}
                  </div>
                  <Link href={`/${locale}/resorts/${r.slug}`} className="btn btn--outline">
                    {td("view")}<span className="ar" aria-hidden="true">→</span>
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
