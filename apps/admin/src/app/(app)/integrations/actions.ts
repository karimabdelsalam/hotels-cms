"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@fantazia/db";
import { connectorFor } from "@fantazia/booking";
import { requirePermissionForAction } from "@/server/auth";
import { audit } from "@/server/audit";

/**
 * The connection to the property system.
 *
 * Nothing here ever accepts a credential. The row holds a `credentialRef`
 * naming environment variables on the server; a password typed into a web form
 * ends up in the database, in every backup, and in this file's audit trail.
 */

const Environment = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Give it a name").max(80),
  integrationType: z.enum(["simulator", "ows", "oxi", "channel_manager"]),
  endpoint: z.string().min(1, "An endpoint is required").max(500),
  chainCode: z.string().max(20).nullable(),
  environment: z.enum(["test", "production"]),
  credentialRef: z
    .string()
    .min(1, "Name the credential")
    .max(60)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use the environment-variable style: OPERA_PROD"),
});

export async function saveEnvironment(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("integrations:manage");

  const parsed = Environment.safeParse({
    id: (formData.get("id") as string) || undefined,
    name: String(formData.get("name") ?? "").trim(),
    integrationType: String(formData.get("integrationType") ?? "simulator"),
    endpoint: String(formData.get("endpoint") ?? "").trim(),
    chainCode: (formData.get("chainCode") as string)?.trim() || null,
    environment: String(formData.get("environment") ?? "test"),
    credentialRef: String(formData.get("credentialRef") ?? "").trim().toUpperCase(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  // A live OPERA endpoint over plain HTTP would put a PMS credential on the
  // wire in clear. Refused rather than warned about.
  if (d.integrationType === "ows" && !/^https:\/\//i.test(d.endpoint)) {
    return { error: "An OWS endpoint must be https. Plain HTTP would send the password in clear." };
  }

  const before = d.id
    ? await prisma.integrationEnvironment.findUnique({ where: { id: d.id } })
    : null;

  const payload = {
    name: d.name,
    integrationType: d.integrationType,
    endpoint: d.endpoint,
    chainCode: d.chainCode,
    environment: d.environment,
    credentialRef: d.credentialRef,
  };

  const after = d.id
    ? await prisma.integrationEnvironment.update({ where: { id: d.id }, data: payload })
    : await prisma.integrationEnvironment.create({ data: { ...payload, enabled: false } });

  await audit(actor, d.id ? "integration.env.update" : "integration.env.create",
              "IntegrationEnvironment", after.id, before, after);
  revalidatePath("/integrations");
  return { ok: true as const, savedAt: Date.now() };
}

/**
 * Switching the connection on runs a health check first.
 *
 * Enabling a connection that does not answer means every booking from that
 * moment lands in the review queue. Better to find out here than from a guest.
 */
export async function setEnvironmentEnabled(id: string, enabled: boolean) {
  const actor = await requirePermissionForAction("integrations:manage");

  const environment = await prisma.integrationEnvironment.findUnique({
    where: { id },
    include: { integrations: { where: { enabled: true }, take: 1 } },
  });
  if (!environment) return { error: "That connection no longer exists." };

  if (enabled) {
    const resortId = environment.integrations[0]?.resortId;
    if (resortId) {
      // Temporarily on, so the connector can be built and asked.
      await prisma.integrationEnvironment.update({ where: { id }, data: { enabled: true } });
      try {
        const connector = await connectorFor(resortId);
        const health = await connector.healthCheck();
        if (!health.ok) {
          await prisma.integrationEnvironment.update({ where: { id }, data: { enabled: false } });
          return { error: `It did not answer: ${health.detail ?? "no detail"}. Left switched off.` };
        }
      } catch (error) {
        await prisma.integrationEnvironment.update({ where: { id }, data: { enabled: false } });
        return {
          error: `Could not reach it: ${error instanceof Error ? error.message : "unknown"}. Left switched off.`,
        };
      }
    }
  }

  await prisma.integrationEnvironment.update({
    where: { id },
    data: { enabled, ...(enabled ? { circuitState: "closed", consecutiveFails: 0 } : {}) },
  });
  await audit(actor, "integration.env.toggle", "IntegrationEnvironment", id,
              { enabled: environment.enabled }, { enabled });
  revalidatePath("/integrations");
  return { ok: true as const };
}

const Link = z.object({
  resortId: z.string().min(1),
  environmentId: z.string().min(1, "Choose a connection"),
  operaResortCode: z.string().max(20).nullable(),
  bookingMode: z.enum(["snapshot", "live"]),
});

export async function saveResortIntegration(_prev: unknown, formData: FormData) {
  const actor = await requirePermissionForAction("integrations:manage");

  const parsed = Link.safeParse({
    resortId: String(formData.get("resortId") ?? ""),
    environmentId: String(formData.get("environmentId") ?? ""),
    operaResortCode: (formData.get("operaResortCode") as string)?.trim().toUpperCase() || null,
    bookingMode: String(formData.get("bookingMode") ?? "snapshot"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  }
  const d = parsed.data;

  const environment = await prisma.integrationEnvironment.findUnique({
    where: { id: d.environmentId },
  });
  if (!environment) return { error: "That connection no longer exists." };

  // Without a resort code nothing can be routed to a property, and the
  // connector refuses to build. Caught here so the message is readable.
  if (environment.integrationType === "ows" && !d.operaResortCode) {
    return { error: "An OWS connection needs the OPERA resort code for this property." };
  }

  const before = await prisma.resortIntegration.findUnique({ where: { resortId: d.resortId } });

  const capabilities =
    (before?.capabilities as object | null) ??
    ({
      mode: "native",
      instantConfirmation: true,
      liveAvailability: false,
      multiRoomBooking: true,
      modification: true,
      cancellation: true,
      promoCodes: true,
      childAges: true,
      quoteBeforeBooking: true,
    } as const);

  const after = await prisma.resortIntegration.upsert({
    where: { resortId: d.resortId },
    update: {
      environmentId: d.environmentId,
      operaResortCode: d.operaResortCode,
      bookingMode: d.bookingMode,
    },
    create: {
      resortId: d.resortId,
      environmentId: d.environmentId,
      operaResortCode: d.operaResortCode,
      bookingMode: d.bookingMode,
      capabilities: capabilities as never,
      enabled: false,
    },
  });

  await audit(actor, "integration.resort.save", "ResortIntegration", after.id, before, after);
  revalidatePath("/integrations");
  return { ok: true as const, savedAt: Date.now() };
}

/** A resort switched off takes no bookings — the site says so and offers an enquiry. */
export async function setResortIntegrationEnabled(resortId: string, enabled: boolean) {
  const actor = await requirePermissionForAction("integrations:manage");

  const before = await prisma.resortIntegration.findUnique({ where: { resortId } });
  if (!before) return { error: "Set the connection for this resort first." };

  await prisma.resortIntegration.update({ where: { resortId }, data: { enabled } });
  await audit(actor, "integration.resort.toggle", "ResortIntegration", before.id,
              { enabled: before.enabled }, { enabled });
  revalidatePath("/integrations");
  return { ok: true as const };
}

/** Asks the property system whether it is there, and records what it said. */
export async function testConnection(resortId: string) {
  await requirePermissionForAction("integrations:manage");
  try {
    const connector = await connectorFor(resortId);
    const health = await connector.healthCheck();
    await prisma.resortIntegration.update({
      where: { resortId },
      data: {
        syncStatus: health.ok ? "ok" : "error",
        lastSyncAt: health.ok ? new Date() : undefined,
        lastErrorAt: health.ok ? null : new Date(),
      },
    });
    revalidatePath("/integrations");
    return health.ok
      ? { ok: true as const, message: `Answered in ${health.latencyMs ?? 0}ms. ${health.detail ?? ""}`.trim() }
      : { error: health.detail ?? "It did not answer." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not reach it." };
  }
}
