import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getResorts } from "@fantazia/db/content";
import { ResortCard } from "@/components/ResortCard";
import { Reveal } from "@/components/Reveal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: `${t("resortsTitle")} — Fantazia`, description: t("lede") };
}

export default async function ResortsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const tr = await getTranslations("resort");
  const resorts = await getResorts(locale);
  const labels = { from: tr("from"), perNight: tr("perNight"), book: tr("book") };

  return (
    <section className="section sec-shell page-top">
      <div className="wrap">
        <div className="head">
          <Reveal><span className="tag">{t("collection")}</span></Reveal>
          <Reveal delay={0.06}><h1 className="d2">{t("resortsTitle")}</h1></Reveal>
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
  );
}
