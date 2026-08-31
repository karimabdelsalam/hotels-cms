import { prisma } from "@fantazia/db";
import { requirePermission, resortScopeFilter, can } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { Rates } from "./Rates";

export default async function RatesPage() {
  const actor = await requirePermission("content:read");
  const scope = resortScopeFilter(actor);

  const [resorts, locales] = await Promise.all([
    prisma.resort.findMany({
      where: scope,
      orderBy: { displayOrder: "asc" },
      include: {
        translations: { where: { localeCode: "en" }, select: { name: true } },
        ratePlans: {
          orderBy: { displayOrder: "asc" },
          include: {
            translations: true,
            policy: { include: { translations: true } },
            roomTypes: { select: { roomTypeId: true } },
            _count: { select: { bookingRooms: true } },
          },
        },
        cancellationPolicies: { include: { translations: true, ratePlans: { select: { id: true } } } },
      },
    }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }),
  ]);

  return (
    <>
      <PageHeader
        title="Rates and terms"
        description="What a guest is buying: a price, a meal arrangement, and the terms for changing their mind."
      />
      <Rates
        resorts={resorts.map((r) => ({
          id: r.id,
          name: r.translations[0]?.name ?? r.code,
          currency: r.currency,
          plans: r.ratePlans.map((p) => ({
            id: p.id,
            externalCode: p.externalCode,
            mealPlan: p.mealPlan,
            policyId: p.policyId,
            minStay: p.minStay,
            maxStay: p.maxStay,
            advanceDays: p.advanceDays,
            isPublic: p.isPublic,
            active: p.active,
            roomTypeCount: p.roomTypes.length,
            bookingCount: p._count.bookingRooms,
            translations: p.translations.map((t) => ({
              localeCode: t.localeCode,
              name: t.name,
              description: t.description,
            })),
          })),
          policies: r.cancellationPolicies.map((p) => ({
            id: p.id,
            type: p.type,
            freeUntilDays: p.freeUntilDays,
            freeUntilTime: p.freeUntilTime,
            penaltyType: p.penaltyType,
            penaltyValue: p.penaltyValue,
            usedBy: p.ratePlans.length,
            summaryEn: p.translations.find((t) => t.localeCode === "en")?.summary ?? "",
            summaryAr: p.translations.find((t) => t.localeCode === "ar")?.summary ?? "",
          })),
        }))}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        canWrite={can(actor, "content:write")}
      />
    </>
  );
}
