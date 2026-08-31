import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { OfferEditor } from "./OfferEditor";

export default async function OfferEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("content:read");

  const [offer, locales, resorts] = await Promise.all([
    prisma.offer.findUnique({ where: { id }, include: { translations: true } }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
    prisma.resort.findMany({
      orderBy: { displayOrder: "asc" },
      include: { translations: { select: { localeCode: true, name: true } } },
    }),
  ]);
  if (!offer) notFound();

  const title = offer.translations.find((t) => t.localeCode === "en")?.title ?? "Untitled offer";

  return (
    <>
      <PageHeader
        title={title}
        description="Leave the resort empty to make this a group-wide offer."
        actions={
          <Link className="btn" href="/offers">
            All offers
          </Link>
        }
      />
      <OfferEditor
        offer={{
          id: offer.id,
          promoCode: offer.promoCode,
          resortId: offer.resortId,
          status: offer.status,
          displayOrder: offer.displayOrder,
        }}
        resorts={resorts.map((r) => ({
          id: r.id,
          name: r.translations.find((t) => t.localeCode === "en")?.name ?? r.code,
        }))}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        translations={offer.translations.map((t) => ({
          localeCode: t.localeCode,
          title: t.title,
          slug: t.slug,
          summary: t.summary,
          description: t.description,
          terms: t.terms,
          validityLabel: t.validityLabel,
        }))}
        canWrite={actor.permissions.has("content:write")}
      />
    </>
  );
}
