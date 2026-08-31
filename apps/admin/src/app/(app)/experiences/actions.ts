"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { requirePermissionForAction } from "@/server/auth";
import { checkSlugAvailable } from "@/server/slugs";
import { audit } from "@/server/audit";
import { slugSchema } from "@/lib/slug";

const Details = z.object({
  experienceId: z.string().min(1),
  category: z.enum(["water", "desert", "wellness", "family"]),
  durationHours: z.coerce.number().min(0).max(48).nullable(),
  priceMinor: z.coerce.number().int().min(0).nullable(),
  status: z.enum(["draft", "published", "archived"]),
  displayOrder: z.coerce.number().int().min(0),
});

export async function saveExperienceDetails(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");
  const priceRaw = formData.get("price");

  const parsed = Details.safeParse({
    experienceId: String(formData.get("experienceId") ?? ""),
    category: String(formData.get("category") ?? "water"),
    durationHours: formData.get("durationHours") || null,
    priceMinor: priceRaw ? Math.round(Number(priceRaw) * 100) : null,
    status: String(formData.get("status") ?? "draft"),
    displayOrder: formData.get("displayOrder") ?? 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }

  const before = await prisma.experience.findUnique({ where: { id: parsed.data.experienceId } });
  if (!before) return { error: "That experience no longer exists." };

  const after = await prisma.experience.update({
    where: { id: parsed.data.experienceId },
    data: {
      category: parsed.data.category,
      durationHours: parsed.data.durationHours,
      priceMinor: parsed.data.priceMinor,
      status: parsed.data.status,
      displayOrder: parsed.data.displayOrder,
    },
  });

  await audit(actor, "experience.update", "Experience", after.id, before, after);
  revalidatePath(`/experiences/${after.id}`);
  revalidatePath("/experiences");
  return { ok: true as const, savedAt: Date.now() };
}

const Translation = z.object({
  experienceId: z.string().min(1),
  localeCode: z.string().min(2),
  name: z.string().min(1, "A name is required"),
  slug: slugSchema,
  summary: z.string().nullable(),
  description: z.string().nullable(),
});

export async function saveExperienceTranslation(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");

  const parsed = Translation.safeParse({
    experienceId: String(formData.get("experienceId") ?? ""),
    localeCode: String(formData.get("localeCode") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    summary: (formData.get("summary") as string) || null,
    description: (formData.get("description") as string) || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const clash = await checkSlugAvailable(d.localeCode, d.slug, {
    kind: "experience",
    id: d.experienceId,
  });
  if (clash) return { error: clash };

  const before = await prisma.experienceTranslation.findUnique({
    where: { experienceId_localeCode: { experienceId: d.experienceId, localeCode: d.localeCode } },
  });

  const payload = { name: d.name, slug: d.slug, summary: d.summary, description: d.description };
  const after = await prisma.experienceTranslation.upsert({
    where: { experienceId_localeCode: { experienceId: d.experienceId, localeCode: d.localeCode } },
    update: payload,
    create: { experienceId: d.experienceId, localeCode: d.localeCode, ...payload },
  });

  await audit(actor, "experience.translation.save", "ExperienceTranslation", after.id, before, after);
  revalidatePath(`/experiences/${d.experienceId}`);
  revalidatePath("/experiences");
  return { ok: true as const, savedAt: Date.now() };
}

export async function createExperience() {
  const actor = await requirePermissionForAction("content:write");
  const count = await prisma.experience.count();
  const x = await prisma.experience.create({
    data: {
      code: `EXP_${Date.now()}`,
      category: "water",
      status: "draft",
      displayOrder: count,
      translations: {
        create: [{ localeCode: "en", name: "Untitled experience", slug: `experience-${Date.now()}` }],
      },
    },
  });
  await audit(actor, "experience.create", "Experience", x.id, null, x);
  revalidatePath("/experiences");
  return x.id;
}
