"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { assertResortInScopeForAction, requirePermissionForAction } from "@/server/auth";
import { audit } from "@/server/audit";

const Details = z.object({
  resortId: z.string().min(1),
  starRating: z.coerce.number().int().min(1).max(5).nullable(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
  phone: z.string().max(40).nullable(),
  email: z.string().email().nullable().or(z.literal("").transform(() => null)),
  fromRateMinor: z.coerce.number().int().min(0).nullable(),
  status: z.enum(["draft", "published", "archived"]),
});

export async function saveResortDetails(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");

  const raw = {
    resortId: String(formData.get("resortId") ?? ""),
    starRating: formData.get("starRating") ? formData.get("starRating") : null,
    checkInTime: String(formData.get("checkInTime") ?? ""),
    checkOutTime: String(formData.get("checkOutTime") ?? ""),
    phone: (formData.get("phone") as string) || null,
    email: (formData.get("email") as string) || null,
    fromRate: formData.get("fromRate"),
    status: String(formData.get("status") ?? "draft"),
  };

  // Rates are entered in EGP and stored as integer minor units — no floats
  // anywhere in the money path.
  const rate = raw.fromRate ? Math.round(Number(raw.fromRate) * 100) : null;

  const parsed = Details.safeParse({ ...raw, fromRateMinor: rate });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }

  assertResortInScopeForAction(actor, parsed.data.resortId);

  const before = await prisma.resort.findUnique({ where: { id: parsed.data.resortId } });
  if (!before) return { error: "That resort no longer exists." };

  const after = await prisma.resort.update({
    where: { id: parsed.data.resortId },
    data: {
      starRating: parsed.data.starRating,
      checkInTime: parsed.data.checkInTime,
      checkOutTime: parsed.data.checkOutTime,
      phone: parsed.data.phone,
      email: parsed.data.email,
      fromRateMinor: parsed.data.fromRateMinor,
      status: parsed.data.status,
    },
  });

  await audit(actor, "resort.update", "Resort", after.id, before, after);
  revalidatePath(`/resorts/${after.id}`);
  revalidatePath("/resorts");
  return { ok: true as const, savedAt: Date.now() };
}

const Translation = z.object({
  resortId: z.string().min(1),
  localeCode: z.string().min(2),
  name: z.string().min(1, "A name is required"),
  slug: z
    .string()
    .min(1, "A slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  tagline: z.string().nullable(),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
});

/** Reserved by system routes — a resort slug may never shadow one. */
const RESERVED = new Set([
  "resorts", "offers", "experiences", "diving", "weddings", "search",
  "book", "booking", "my-booking", "destinations", "api",
]);

export async function saveResortTranslation(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");

  const parsed = Translation.safeParse({
    resortId: String(formData.get("resortId") ?? ""),
    localeCode: String(formData.get("localeCode") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    tagline: (formData.get("tagline") as string) || null,
    shortDescription: (formData.get("shortDescription") as string) || null,
    description: (formData.get("description") as string) || null,
    metaTitle: (formData.get("metaTitle") as string) || null,
    metaDescription: (formData.get("metaDescription") as string) || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const data = parsed.data;

  assertResortInScopeForAction(actor, data.resortId);

  if (RESERVED.has(data.slug)) {
    return { error: `"${data.slug}" is a reserved address. Choose another slug.` };
  }

  // Slugs are unique per locale across every content type, so a clash is
  // reported plainly rather than throwing a database error at the editor.
  const [clashResort, clashPage, clashOffer, clashExperience] = await Promise.all([
    prisma.resortTranslation.findFirst({
      where: { localeCode: data.localeCode, slug: data.slug, NOT: { resortId: data.resortId } },
    }),
    prisma.pageTranslation.findFirst({ where: { localeCode: data.localeCode, slug: data.slug } }),
    prisma.offerTranslation.findFirst({ where: { localeCode: data.localeCode, slug: data.slug } }),
    prisma.experienceTranslation.findFirst({
      where: { localeCode: data.localeCode, slug: data.slug },
    }),
  ]);
  if (clashResort || clashPage || clashOffer || clashExperience) {
    return { error: `The slug "${data.slug}" is already used in this language.` };
  }

  const before = await prisma.resortTranslation.findUnique({
    where: { resortId_localeCode: { resortId: data.resortId, localeCode: data.localeCode } },
  });

  const after = await prisma.resortTranslation.upsert({
    where: { resortId_localeCode: { resortId: data.resortId, localeCode: data.localeCode } },
    update: {
      name: data.name,
      slug: data.slug,
      tagline: data.tagline,
      shortDescription: data.shortDescription,
      description: data.description,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
    },
    create: {
      resortId: data.resortId,
      localeCode: data.localeCode,
      name: data.name,
      slug: data.slug,
      tagline: data.tagline,
      shortDescription: data.shortDescription,
      description: data.description,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
    },
  });

  await audit(actor, "resort.translation.save", "ResortTranslation", after.id, before, after);
  revalidatePath(`/resorts/${data.resortId}`);
  revalidatePath("/resorts");
  return { ok: true as const, savedAt: Date.now() };
}
