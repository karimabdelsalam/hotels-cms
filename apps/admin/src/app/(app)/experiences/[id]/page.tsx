import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { ExperienceEditor } from "./ExperienceEditor";

export default async function ExperienceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requirePermission("content:read");

  const [x, locales] = await Promise.all([
    prisma.experience.findUnique({ where: { id }, include: { translations: true } }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  if (!x) notFound();

  const name = x.translations.find((t) => t.localeCode === "en")?.name ?? x.code;

  return (
    <>
      <PageHeader
        title={name}
        actions={
          <Link className="btn" href="/experiences">
            All experiences
          </Link>
        }
      />
      <ExperienceEditor
        experience={{
          id: x.id,
          category: x.category,
          durationHours: x.durationHours,
          priceMinor: x.priceMinor,
          status: x.status,
          displayOrder: x.displayOrder,
        }}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        translations={x.translations.map((t) => ({
          localeCode: t.localeCode,
          name: t.name,
          slug: t.slug,
          summary: t.summary,
          description: t.description,
        }))}
        canWrite={actor.permissions.has("content:write")}
      />
    </>
  );
}
