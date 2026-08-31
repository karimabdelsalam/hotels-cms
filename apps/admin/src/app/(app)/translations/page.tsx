import { prisma } from "@fantazia/db";
import { getCompleteness } from "@fantazia/db/i18n";
import { requirePermission } from "@/server/auth";
import { isConfigured } from "@/server/translate";
import { PageHeader } from "@/components/PageHeader";
import { TranslationManager } from "./TranslationManager";

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; namespace?: string; status?: string; q?: string }>;
}) {
  const actor = await requirePermission("content:read");
  const params = await searchParams;

  const locales = await prisma.locale.findMany({ orderBy: { displayOrder: "asc" } });
  const target = params.locale ?? locales.find((l) => !l.isDefault)?.code ?? "ar";

  const where = {
    localeCode: target,
    status: { not: "removed" as const },
    ...(params.namespace ? { namespace: params.namespace } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.q
      ? {
          OR: [
            { key: { contains: params.q, mode: "insensitive" as const } },
            { value: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, english, namespaces, completeness] = await Promise.all([
    prisma.translationString.findMany({
      where,
      orderBy: [{ namespace: "asc" }, { key: "asc" }],
      take: 400,
    }),
    prisma.translationString.findMany({
      where: { localeCode: "en", status: { not: "removed" } },
      select: { namespace: true, key: true, value: true },
    }),
    prisma.translationString.groupBy({
      by: ["namespace"],
      where: { localeCode: target, status: { not: "removed" } },
      _count: { _all: true },
    }),
    getCompleteness(),
  ]);

  const sourceFor = (namespace: string, key: string) =>
    english.find((e) => e.namespace === namespace && e.key === key)?.value ?? "";

  return (
    <>
      <PageHeader
        title="Translations"
        description="Keys come from code; the words come from here. Changing an English string flips every other language to “needs review” while keeping its old text, so nothing silently drifts out of date."
      />
      <TranslationManager
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
          isEnabled: l.isEnabled,
        }))}
        completeness={completeness}
        active={target}
        namespaces={namespaces.map((n) => ({ name: n.namespace, count: n._count._all }))}
        filters={{
          namespace: params.namespace ?? "",
          status: params.status ?? "",
          q: params.q ?? "",
        }}
        rows={rows.map((r) => ({
          id: r.id,
          namespace: r.namespace,
          key: r.key,
          value: r.value,
          status: r.status,
          humanEdited: r.humanEdited,
          machineModel: r.machineModel,
          source: sourceFor(r.namespace, r.key),
        }))}
        aiConfigured={isConfigured()}
        canWrite={actor.permissions.has("translations:write")}
        canPublish={actor.permissions.has("content:publish")}
      />
    </>
  );
}
