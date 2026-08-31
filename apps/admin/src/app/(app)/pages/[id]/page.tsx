import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { PageEditor } from "./PageEditor";
import type { Block } from "./blocks";

export default async function PageEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("content:read");

  const [page, locales] = await Promise.all([
    prisma.page.findUnique({ where: { id }, include: { translations: true } }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  if (!page) notFound();

  const title = page.translations.find((t) => t.localeCode === "en")?.title ?? page.key;

  return (
    <>
      <PageHeader
        title={title}
        description={`Key ${page.key}. Content and address are per language.`}
        actions={
          <Link className="btn" href="/pages">
            All pages
          </Link>
        }
      />
      <PageEditor
        page={{ id: page.id, key: page.key, status: page.status, isSystem: page.isSystem }}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        translations={page.translations.map((t) => ({
          localeCode: t.localeCode,
          title: t.title,
          slug: t.slug,
          metaTitle: t.metaTitle,
          metaDescription: t.metaDescription,
          blocks: (t.blocks ?? []) as Block[],
        }))}
        canWrite={actor.permissions.has("content:write")}
        canPublish={actor.permissions.has("content:publish")}
      />
    </>
  );
}
