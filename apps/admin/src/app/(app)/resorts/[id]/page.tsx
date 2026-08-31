import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@fantazia/db";
import { assertResortInScope, requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { ResortEditor } from "./ResortEditor";

export default async function ResortEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requirePermission("content:read");

  const resort = await prisma.resort.findUnique({
    where: { id },
    include: {
      translations: true,
      roomTypes: {
        orderBy: { displayOrder: "asc" },
        include: {
          translations: true,
          media: {
            orderBy: { displayOrder: "asc" },
            include: {
              media: { include: { translations: { where: { localeCode: "en" }, select: { alt: true } } } },
            },
          },
        },
      },
    },
  });
  if (!resort) notFound();

  // Layer two of the three enforcement layers: the resource's own scope is
  // checked before anything renders.
  assertResortInScope(actor, resort.id);

  const [locales, assets] = await Promise.all([
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
    prisma.mediaAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: 120,
      include: { translations: { where: { localeCode: "en" }, select: { alt: true } } },
    }),
  ]);

  const en = resort.translations.find((t) => t.localeCode === "en");
  const title = en?.name ?? resort.code;

  return (
    <>
      <PageHeader
        title={title}
        description={`Resort code ${resort.code}. Content is translated per language; the details below are shared across all of them.`}
        actions={
          <Link className="btn" href="/resorts">
            All resorts
          </Link>
        }
      />
      <ResortEditor
        resort={{
          id: resort.id,
          code: resort.code,
          starRating: resort.starRating,
          checkInTime: resort.checkInTime,
          checkOutTime: resort.checkOutTime,
          phone: resort.phone,
          email: resort.email,
          fromRateMinor: resort.fromRateMinor,
          currency: resort.currency,
          status: resort.status,
          heroMediaId: resort.heroMediaId,
        }}
        assets={assets.map((a) => ({
          id: a.id,
          storageKey: a.storageKey,
          alt: a.translations[0]?.alt ?? "",
          focalX: a.focalX,
          focalY: a.focalY,
        }))}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        translations={resort.translations.map((t) => ({
          localeCode: t.localeCode,
          name: t.name,
          slug: t.slug,
          tagline: t.tagline,
          shortDescription: t.shortDescription,
          description: t.description,
          metaTitle: t.metaTitle,
          metaDescription: t.metaDescription,
        }))}
        rooms={resort.roomTypes.map((rt) => ({
          id: rt.id,
          externalCode: rt.externalCode,
          maxAdults: rt.maxAdults,
          maxChildren: rt.maxChildren,
          maxOccupancy: rt.maxOccupancy,
          sizeSqm: rt.sizeSqm,
          bedConfig: rt.bedConfig,
          fromRateMinor: rt.fromRateMinor,
          active: rt.active,
          translations: rt.translations.map((t) => ({
            localeCode: t.localeCode,
            name: t.name,
            slug: t.slug,
            description: t.description,
          })),
          images: rt.media.map((m) => ({
            id: m.media.id,
            storageKey: m.media.storageKey,
            alt: m.media.translations[0]?.alt ?? "",
          })),
        }))}
        canWrite={actor.permissions.has("content:write")}
      />
    </>
  );
}
