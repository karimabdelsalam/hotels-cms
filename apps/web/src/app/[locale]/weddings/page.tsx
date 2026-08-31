import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getResorts } from "@fantazia/db/content";
import { Reveal } from "@/components/Reveal";
import { PageHero } from "@/components/PageHero";
import { EnquiryForm } from "@/components/EnquiryForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: `${t("weddingsTitle")} — Fantazia`, description: t("weddingsBody") };
}

export default async function WeddingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const resorts = await getResorts(locale);

  return (
    <>
      <PageHero
        eyebrow={t("weddingsEyebrow")}
        title={t("weddingsTitle")}
        lede={t("weddingsBody")}
        fill="f-3"
      />
      <section className="section sec-shell">
        <div className="wrap">
          <Reveal>
            <EnquiryForm resorts={resorts.map((r) => ({ id: r.id, name: r.name }))} />
          </Reveal>
        </div>
      </section>
    </>
  );
}
