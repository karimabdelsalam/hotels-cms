import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPageBySlug, getEntitySlugs } from "@fantazia/db/content";
import { alternatesFor } from "@/lib/seo";
import { Blocks, type Block } from "@/components/Blocks";
import { PageHero } from "@/components/PageHero";

type Props = { params: Promise<{ locale: string; slug: string }> };

/**
 * Content pages, matched LAST in the router — an editor cannot create a page
 * whose slug shadows /resorts, /offers, or the booking flow.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await getPageBySlug(locale, slug);
  if (!page) return {};
  return {
    title: page.metaTitle ?? `${page.title} — Fantazia Marsa Alam`,
    description: page.metaDescription ?? undefined,
    alternates: await alternatesFor(locale, await getEntitySlugs("page", page.id)),
  };
}

export default async function ContentPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = await getPageBySlug(locale, slug);
  if (!page) notFound();

  return (
    <>
      <PageHero title={page.title} fill="f-2" />
      <section className="section sec-shell">
        <div className="wrap prose">
          <Blocks blocks={page.blocks as Block[]} locale={locale} />
        </div>
      </section>
    </>
  );
}
