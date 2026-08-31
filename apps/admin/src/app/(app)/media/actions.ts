"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { deleteMedia } from "@fantazia/media/store";
import { requirePermissionForAction } from "@/server/auth";
import { audit } from "@/server/audit";

const AltInput = z.object({
  mediaId: z.string().min(1),
  localeCode: z.string().min(2),
  alt: z.string().max(300),
  caption: z.string().max(500).nullable(),
});

export async function saveAltText(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("media:write");

  const parsed = AltInput.safeParse({
    mediaId: String(formData.get("mediaId") ?? ""),
    localeCode: String(formData.get("localeCode") ?? ""),
    alt: String(formData.get("alt") ?? "").trim(),
    caption: (formData.get("caption") as string) || null,
  });
  if (!parsed.success) return { error: "Check the values and try again." };
  const d = parsed.data;

  const before = await prisma.mediaAssetTranslation.findUnique({
    where: { mediaId_localeCode: { mediaId: d.mediaId, localeCode: d.localeCode } },
  });

  const after = await prisma.mediaAssetTranslation.upsert({
    where: { mediaId_localeCode: { mediaId: d.mediaId, localeCode: d.localeCode } },
    update: { alt: d.alt, caption: d.caption },
    create: { mediaId: d.mediaId, localeCode: d.localeCode, alt: d.alt, caption: d.caption },
  });

  await audit(actor, "media.alt.save", "MediaAssetTranslation", after.id, before, after);
  revalidatePath("/media");
  return { ok: true as const, savedAt: Date.now() };
}

const FocalInput = z.object({
  mediaId: z.string().min(1),
  focalX: z.coerce.number().min(0).max(1),
  focalY: z.coerce.number().min(0).max(1),
});

export async function saveFocalPoint(mediaId: string, focalX: number, focalY: number) {
  const actor = await requirePermissionForAction("media:write");
  const d = FocalInput.parse({ mediaId, focalX, focalY });

  const before = await prisma.mediaAsset.findUnique({ where: { id: d.mediaId } });
  const after = await prisma.mediaAsset.update({
    where: { id: d.mediaId },
    data: { focalX: d.focalX, focalY: d.focalY },
  });

  await audit(actor, "media.focal.save", "MediaAsset", after.id, before, after);
  revalidatePath("/media");
}

export async function removeMedia(mediaId: string) {
  const actor = await requirePermissionForAction("media:write");

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: mediaId },
    include: {
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
  });
  if (!asset) return { error: "That image no longer exists." };

  // Refuse rather than leave a hole in a live page.
  const uses = Object.values(asset._count).reduce((a, b) => a + b, 0);
  if (uses > 0) {
    return {
      error: `That image is used in ${uses} place${uses === 1 ? "" : "s"}. Remove it there first.`,
    };
  }

  await prisma.mediaAsset.delete({ where: { id: mediaId } });
  await deleteMedia(asset.storageKey);
  await audit(actor, "media.delete", "MediaAsset", mediaId, asset, null);
  revalidatePath("/media");
  return { ok: true as const };
}
