import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { MediaLibrary } from "./MediaLibrary";

export default async function MediaPage() {
  const actor = await requirePermission("content:read");

  const [assets, locales] = await Promise.all([
    prisma.mediaAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        translations: true,
        uploadedBy: { select: { firstName: true, lastName: true } },
        _count: {
          select: {
            resortHeroes: true,
            destinationHeroes: true,
            experienceHeroes: true,
            offerHeroes: true,
            restaurantHeroes: true,
            resortGallery: true,
            roomTypeMedia: true,
          },
        },
      },
    }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Media"
        description="Images are stored on this server. Each upload is resized to four widths in WebP and AVIF, stripped of camera metadata, and given a tiny placeholder so cards never reflow while loading."
      />
      <MediaLibrary
        assets={assets.map((a) => ({
          id: a.id,
          storageKey: a.storageKey,
          width: a.width,
          height: a.height,
          bytes: a.bytes,
          placeholder: a.placeholder,
          originalName: a.originalName,
          focalX: a.focalX,
          focalY: a.focalY,
          uses: Object.values(a._count).reduce((x, y) => x + y, 0),
          uploadedBy: a.uploadedBy
            ? `${a.uploadedBy.firstName} ${a.uploadedBy.lastName}`
            : null,
          translations: a.translations.map((t) => ({
            localeCode: t.localeCode,
            alt: t.alt,
            caption: t.caption,
          })),
        }))}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        canWrite={actor.permissions.has("media:write")}
      />
    </>
  );
}
