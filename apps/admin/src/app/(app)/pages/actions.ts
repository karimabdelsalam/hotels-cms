"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { requirePermissionForAction } from "@/server/auth";
import { checkSlugAvailable } from "@/server/slugs";
import { audit } from "@/server/audit";
import { slugSchema } from "@/lib/slug";

/**
 * The block types the site can render. Anything else is rejected here rather
 * than stored and silently skipped at render time.
 */
const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lede"), props: z.object({ text: z.string() }) }),
  z.object({ type: z.literal("heading"), props: z.object({ text: z.string() }) }),
  z.object({ type: z.literal("richText"), props: z.object({ html: z.string() }) }),
  z.object({
    type: z.literal("quote"),
    props: z.object({ text: z.string(), attribution: z.string().optional() }),
  }),
  z.object({ type: z.literal("facts"), props: z.object({ items: z.array(z.string()) }) }),
  z.object({
    type: z.literal("cta"),
    props: z.object({ label: z.string(), href: z.string() }),
  }),
]);

const Details = z.object({
  pageId: z.string().min(1),
  status: z.enum(["draft", "published", "archived"]),
});

export async function savePageDetails(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:publish");

  const parsed = Details.safeParse({
    pageId: String(formData.get("pageId") ?? ""),
    status: String(formData.get("status") ?? "draft"),
  });
  if (!parsed.success) return { error: "Check the values and try again." };

  const before = await prisma.page.findUnique({ where: { id: parsed.data.pageId } });
  if (!before) return { error: "That page no longer exists." };

  const after = await prisma.page.update({
    where: { id: parsed.data.pageId },
    data: {
      status: parsed.data.status,
      publishedAt:
        parsed.data.status === "published" ? (before.publishedAt ?? new Date()) : before.publishedAt,
    },
  });

  await audit(actor, "page.update", "Page", after.id, before, after);
  revalidatePath(`/pages/${after.id}`);
  revalidatePath("/pages");
  return { ok: true as const, savedAt: Date.now() };
}

const Translation = z.object({
  pageId: z.string().min(1),
  localeCode: z.string().min(2),
  title: z.string().min(1, "A title is required"),
  slug: slugSchema,
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  blocks: z.array(Block),
});

export async function savePageTranslation(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("content:write");

  let blocks: unknown = [];
  try {
    blocks = JSON.parse(String(formData.get("blocks") ?? "[]"));
  } catch {
    return { error: "The page content could not be read. Nothing was saved." };
  }

  const parsed = Translation.safeParse({
    pageId: String(formData.get("pageId") ?? ""),
    localeCode: String(formData.get("localeCode") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    metaTitle: (formData.get("metaTitle") as string) || null,
    metaDescription: (formData.get("metaDescription") as string) || null,
    blocks,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const clash = await checkSlugAvailable(d.localeCode, d.slug, { kind: "page", id: d.pageId });
  if (clash) return { error: clash };

  const before = await prisma.pageTranslation.findUnique({
    where: { pageId_localeCode: { pageId: d.pageId, localeCode: d.localeCode } },
  });

  const payload = {
    title: d.title,
    slug: d.slug,
    metaTitle: d.metaTitle,
    metaDescription: d.metaDescription,
    blocks: d.blocks,
  };

  const after = await prisma.pageTranslation.upsert({
    where: { pageId_localeCode: { pageId: d.pageId, localeCode: d.localeCode } },
    update: payload,
    create: { pageId: d.pageId, localeCode: d.localeCode, ...payload },
  });

  await audit(actor, "page.translation.save", "PageTranslation", after.id, before, after);
  revalidatePath(`/pages/${d.pageId}`);
  revalidatePath("/pages");
  return { ok: true as const, savedAt: Date.now() };
}

export async function createPage() {
  const actor = await requirePermissionForAction("content:write");
  const stamp = Date.now();
  const page = await prisma.page.create({
    data: {
      key: `page-${stamp}`,
      status: "draft",
      translations: {
        create: [{ localeCode: "en", title: "Untitled page", slug: `page-${stamp}`, blocks: [] }],
      },
    },
  });
  await audit(actor, "page.create", "Page", page.id, null, page);
  revalidatePath("/pages");
  return page.id;
}
