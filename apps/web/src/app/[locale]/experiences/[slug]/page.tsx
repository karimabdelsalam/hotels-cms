import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getExperienceBySlug, getExperiences, getEntitySlugs } from "@fantazia/db/content";
import { alternatesFor } from "@/lib/seo";
import { Reveal } from "@/components/Reveal";
import { PageHero } from "@/components/PageHero";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const x = await getExperienceBySlug(locale, slug);
  if (!x) return {};
  return {
    title: `${x.name} — Fantazia Marsa Alam`,
    description: x.summary ?? undefined,
    alternates: await alternatesFor(locale, await getEntitySlugs("experience", x.id), "experiences"),
  };
}

export default async function ExperiencePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const x = await getExperienceBySlug(locale, slug);
  if (!x) notFound();

  const t = await getTranslations("home");
  const others = (await getExperiences(locale)).filter((o) => o.slug !== x.slug).slice(0, 3);

  return (
    <>
      <PageHero eyebrow={t("experiencesEyebrow")} title={x.name} lede={x.summary} fill="x2" />

      <section className="section sec-shell">
        <div className="wrap prose">
          <Reveal>
            <p className="lede">{x.description ?? x.summary}</p>
          </Reveal>
        </div>
      </section>

      {others.length > 0 && (
        <section className="section sec-sand">
          <div className="wrap">
            <div className="head">
              <h2 className="d2">{t("experiencesTitle")}</h2>
            </div>
            <div className="tiles">
              {others.map((o, i) => (
                <Reveal key={o.id} delay={i * 0.07} as="div">
                  <Link href={`/${locale}/experiences/${o.slug}`} className="tile">
                    <span className={`fill x${(i % 4) + 1}`} />
                    <span className="tile-txt">
                      <span className="n">{o.name}</span>
                      {o.summary && <span className="m">{o.summary}</span>}
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
