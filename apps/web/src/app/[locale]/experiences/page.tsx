import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getExperiences } from "@fantazia/db/content";
import { Reveal } from "@/components/Reveal";
import { PageHero } from "@/components/PageHero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: `${t("experiencesTitle")} — Fantazia`, description: t("reefBody") };
}

const FILLS = ["x1", "x2", "x3", "x4"] as const;

export default async function ExperiencesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const experiences = await getExperiences(locale);

  return (
    <>
      <PageHero
        eyebrow={t("experiencesEyebrow")}
        title={t("experiencesTitle")}
        fill="x1"
      />
      <section className="section sec-shell">
        <div className="wrap">
          <div className="tiles">
            {experiences.map((x, i) => (
              <Reveal key={x.id} delay={i * 0.07} as="div">
                <Link href={`/${locale}/experiences/${x.slug}`} className="tile">
                  <span className={`fill ${FILLS[i % FILLS.length]}`} />
                  <span className="tile-txt">
                    <span className="n">{x.name}</span>
                    {x.summary && <span className="m">{x.summary}</span>}
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
