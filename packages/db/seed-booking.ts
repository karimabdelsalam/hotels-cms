/**
 * Booking-side seed: rate plans, a cancellation policy, an inventory snapshot,
 * and a simulator environment.
 *
 * Kept separate from the content seed so it can be re-run while working on the
 * booking module without touching pages, menus or media.
 */
import { prisma } from "./src/index";

const DAYS = 120; // enough to book several months out

async function main() {
  const resorts = await prisma.resort.findMany({
    include: { roomTypes: { where: { active: true } }, translations: { where: { localeCode: "en" } } },
  });
  if (resorts.length === 0) throw new Error("Seed the content first.");

  const environment = await prisma.integrationEnvironment.upsert({
    where: { id: "env-simulator" },
    update: { enabled: true, circuitState: "closed" },
    create: {
      id: "env-simulator",
      name: "Simulator",
      integrationType: "simulator",
      endpoint: "simulator://local",
      environment: "test",
      // A pointer, and for the simulator it points at nothing.
      credentialRef: "SIMULATOR",
      enabled: true,
    },
  });

  const locales = await prisma.locale.findMany({ where: { isEnabled: true } });

  for (const resort of resorts) {
    const name = resort.translations[0]?.name ?? resort.code;

    await prisma.resortIntegration.upsert({
      where: { resortId: resort.id },
      update: { enabled: true, environmentId: environment.id },
      create: {
        resortId: resort.id,
        environmentId: environment.id,
        operaResortCode: resort.code,
        capabilities: {
          mode: "native",
          instantConfirmation: true,
          liveAvailability: false,
          multiRoomBooking: true,
          modification: true,
          cancellation: true,
          promoCodes: true,
          childAges: true,
          quoteBeforeBooking: true,
        },
        enabled: true,
        bookingMode: "snapshot",
      },
    });

    const policy = await prisma.cancellationPolicy.upsert({
      where: { id: `policy-${resort.id}` },
      update: {},
      create: {
        id: `policy-${resort.id}`,
        resortId: resort.id,
        type: "free_until",
        freeUntilDays: 3,
        freeUntilTime: "18:00",
        penaltyType: "nights",
        penaltyValue: 1,
        translations: {
          create: locales
            .filter((l) => ["en", "ar"].includes(l.code))
            .map((l) => ({
              localeCode: l.code,
              summary:
                l.code === "ar"
                  ? "إلغاء مجاني حتى الساعة ٦ مساءً قبل ٣ أيام من الوصول. بعد ذلك تُحتسب ليلة واحدة."
                  : "Free cancellation until 18:00 three days before arrival. After that, one night is charged.",
            })),
        },
      },
    });

    const plans: [string, string, string, number][] = [
      ["BB", "bed_and_breakfast", "Bed & breakfast", 0],
      ["AI", "all_inclusive", "All inclusive", 1],
    ];

    for (const [code, mealPlan, planName, order] of plans) {
      const plan = await prisma.ratePlan.upsert({
        where: { resortId_externalCode: { resortId: resort.id, externalCode: code } },
        update: { active: true },
        create: {
          resortId: resort.id,
          externalCode: code,
          mealPlan,
          policyId: policy.id,
          isPublic: true,
          active: true,
          displayOrder: order,
          translations: {
            create: locales
              .filter((l) => ["en", "ar"].includes(l.code))
              .map((l) => ({
                localeCode: l.code,
                name:
                  l.code === "ar"
                    ? code === "BB" ? "مبيت وإفطار" : "شامل كليًا"
                    : planName,
              })),
          },
        },
      });

      for (const roomType of resort.roomTypes) {
        await prisma.ratePlanRoomType.upsert({
          where: { ratePlanId_roomTypeId: { ratePlanId: plan.id, roomTypeId: roomType.id } },
          update: {},
          create: { ratePlanId: plan.id, roomTypeId: roomType.id },
        });

        // All-inclusive costs more than bed and breakfast; weekends cost more
        // than weekdays. Enough shape that a total is not a flat multiple.
        const base = roomType.fromRateMinor ?? 400000;
        const rows: {
          resortId: string; roomTypeId: string; ratePlanId: string; date: Date;
          availableCount: number; rateMinor: number; currency: string; source: string;
          restrictions: object;
        }[] = [];

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        for (let i = 0; i < DAYS; i++) {
          const date = new Date(today);
          date.setUTCDate(date.getUTCDate() + i);
          const weekend = [4, 5].includes(date.getUTCDay()); // Fri/Sat in Egypt
          const mealUplift = code === "AI" ? 1.45 : 1;
          rows.push({
            resortId: resort.id,
            roomTypeId: roomType.id,
            ratePlanId: plan.id,
            date,
            // Thinner near-term availability, so "only 2 left" is reachable.
            availableCount: i < 3 ? 2 : i < 14 ? 5 : 12,
            rateMinor: Math.round(base * mealUplift * (weekend ? 1.18 : 1)),
            currency: resort.currency,
            source: "simulator",
            restrictions: { minStay: weekend ? 2 : 1 },
          });
        }

        await prisma.inventorySnapshot.deleteMany({
          where: { resortId: resort.id, roomTypeId: roomType.id, ratePlanId: plan.id },
        });
        await prisma.inventorySnapshot.createMany({ data: rows });
      }
    }

    console.log(`  ${name}: ${resort.roomTypes.length} room types × ${plans.length} rate plans × ${DAYS} nights`);
  }

  console.log(`\ninventory rows: ${await prisma.inventorySnapshot.count()}`);
  console.log(`rate plans:     ${await prisma.ratePlan.count()}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
