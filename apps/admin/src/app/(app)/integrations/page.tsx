import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { Integrations } from "./Integrations";

export default async function IntegrationsPage() {
  // Group-level by design: this is one connection serving all three resorts,
  // and a resort admin changing it would change it for everyone.
  await requirePermission("integrations:manage");

  const [environments, resorts, recentCalls] = await Promise.all([
    prisma.integrationEnvironment.findMany({
      orderBy: { createdAt: "asc" },
      include: { integrations: { select: { resortId: true } } },
    }),
    prisma.resort.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        translations: { where: { localeCode: "en" }, select: { name: true } },
        integration: true,
      },
    }),
    prisma.integrationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { resort: { include: { translations: { where: { localeCode: "en" } } } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Property system"
        description="One connection serves all three resorts — they are one OPERA installation, told apart by resort code."
      />
      <Integrations
        environments={environments.map((e) => ({
          id: e.id,
          name: e.name,
          integrationType: e.integrationType,
          endpoint: e.endpoint,
          chainCode: e.chainCode,
          environment: e.environment,
          credentialRef: e.credentialRef,
          enabled: e.enabled,
          circuitState: e.circuitState,
          lastErrorAt: e.lastErrorAt ? e.lastErrorAt.toISOString() : null,
          lastErrorSummary: e.lastErrorSummary,
          usedBy: e.integrations.length,
        }))}
        resorts={resorts.map((r) => ({
          id: r.id,
          name: r.translations[0]?.name ?? r.code,
          code: r.code,
          environmentId: r.integration?.environmentId ?? null,
          operaResortCode: r.integration?.operaResortCode ?? null,
          bookingMode: r.integration?.bookingMode ?? "snapshot",
          enabled: r.integration?.enabled ?? false,
          syncStatus: r.integration?.syncStatus ?? "never",
          lastSyncAt: r.integration?.lastSyncAt ? r.integration.lastSyncAt.toISOString() : null,
        }))}
        recentCalls={recentCalls.map((c) => ({
          id: c.id,
          operation: c.operation,
          connector: c.connector,
          status: c.status,
          errorCode: c.errorCode,
          durationMs: c.durationMs,
          resort: c.resort?.translations[0]?.name ?? null,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
