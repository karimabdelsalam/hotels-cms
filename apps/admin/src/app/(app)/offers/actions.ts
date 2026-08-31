"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { requirePermissionForAction } from "@/server/auth";
import { checkSlugAvailable } from "@/server/slugs";
import { audit } from "@/server/audit";
import { slugSchema } from "@/lib/slug";

const Details = z.object({
  offerId: z.string().min(1),
  promoCode: z.string().max(40).nullable(),
  resortId: z.string().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  displayOrder: z.coerce.number().int().min(0),
});

export async function saveOfferDetails(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");

  const parsed = Details.safeParse({
    offerId: String(formData.get("offerId") ?? ""),
    promoCode: (formData.get("promoCode") as string)?.trim() || null,
    // "" means group-wide: the offer applies at every resort.
    resortId: (formData.get("resortId") as string) || null,
    status: String(formData.get("status") ?? "draft"),
    displayOrder: formData.get("displayOrder") ?? 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }

  const before = await prisma.offer.findUnique({ where: { id: parsed.data.offerId } });
  if (!before) return { error: "That offer no longer exists." };

  const after = await prisma.offer.update({
    where: { id: parsed.data.offerId },
    data: {
      promoCode: parsed.data.promoCode,
      resortId: parsed.data.resortId,
      status: parsed.data.status,
      displayOrder: parsed.data.displayOrder,
    },
  });

  await audit(actor, "offer.update", "Offer", after.id, before, after);
  revalidatePath(`/offers/${after.id}`);
  revalidatePath("/offers");
  return { ok: true as const, savedAt: Date.now() };
}

const Translation = z.object({
  offerId: z.string().min(1),
  localeCode: z.string().min(2),
  title: z.string().min(1, "A title is required"),
  slug: slugSchema,
  summary: z.string().nullable(),
  description: z.string().nullable(),
  terms: z.string().nullable(),
  validityLabel: z.string().nullable(),
});

export async function saveOfferTranslation(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");

  const parsed = Translation.safeParse({
    offerId: String(formData.get("offerId") ?? ""),
    localeCode: String(formData.get("localeCode") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    summary: (formData.get("summary") as string) || null,
    description: (formData.get("description") as string) || null,
    terms: (formData.get("terms") as string) || null,
    validityLabel: (formData.get("validityLabel") as string) || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const clash = await checkSlugAvailable(d.localeCode, d.slug, { kind: "offer", id: d.offerId });
  if (clash) return { error: clash };

  const before = await prisma.offerTranslation.findUnique({
    where: { offerId_localeCode: { offerId: d.offerId, localeCode: d.localeCode } },
  });

  const payload = {
    title: d.title,
    slug: d.slug,
    summary: d.summary,
    description: d.description,
    terms: d.terms,
    validityLabel: d.validityLabel,
  };

  const after = await prisma.offerTranslation.upsert({
    where: { offerId_localeCode: { offerId: d.offerId, localeCode: d.localeCode } },
    update: payload,
    create: { offerId: d.offerId, localeCode: d.localeCode, ...payload },
  });

  await audit(actor, "offer.translation.save", "OfferTranslation", after.id, before, after);
  revalidatePath(`/offers/${d.offerId}`);
  revalidatePath("/offers");
  return { ok: true as const, savedAt: Date.now() };
}

export async function createOffer() {
  const actor = await requirePermissionForAction("content:write");
  const count = await prisma.offer.count();
  const offer = await prisma.offer.create({
    data: {
      status: "draft",
      displayOrder: count,
      translations: {
        create: [{ localeCode: "en", title: "Untitled offer", slug: `offer-${Date.now()}` }],
      },
    },
  });
  await audit(actor, "offer.create", "Offer", offer.id, null, offer);
  revalidatePath("/offers");
  return offer.id;
}
