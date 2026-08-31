import { prisma } from "@fantazia/db";
import type { PropertyConnector, ConnectorCapabilities } from "./types";
import { ConnectorUnavailable } from "./types";
import { SimulatorConnector, SIMULATOR_CAPABILITIES } from "./simulator";
import { OwsConnector, OWS_CAPABILITIES, type OwsConfig } from "./ows";

export * from "./types";
export { SimulatorConnector, resetSimulator } from "./simulator";
export { OwsConnector } from "./ows";
export { availabilityFromSnapshot, nightsBetween } from "./snapshot";

/**
 * Picks the connector for a resort from its stored integration.
 *
 * A resort with no integration row, or one switched off, gets no connector at
 * all rather than a default — a silent fallback to the simulator on a live
 * site would confirm bookings that exist nowhere.
 */
export async function connectorFor(resortId: string): Promise<PropertyConnector> {
  const integration = await prisma.resortIntegration.findUnique({
    where: { resortId },
    include: { environment: true },
  });

  if (!integration || !integration.enabled) {
    throw new ConnectorUnavailable("This resort is not set up to take bookings yet.");
  }
  if (!integration.environment.enabled) {
    throw new ConnectorUnavailable("The connection to the property system is switched off.");
  }
  if (integration.environment.circuitState === "open") {
    throw new ConnectorUnavailable("The property system is not responding. Try again shortly.");
  }

  switch (integration.environment.integrationType) {
    case "simulator":
      return new SimulatorConnector(resortId);

    case "ows": {
      if (!integration.operaResortCode) {
        throw new ConnectorUnavailable("This resort has no OPERA resort code set.");
      }
      return new OwsConnector(resortId, owsConfigFrom(integration));
    }

    default:
      throw new ConnectorUnavailable(
        `No connector is implemented for "${integration.environment.integrationType}".`,
      );
  }
}

/** What the UI may know about a resort without attempting a call. */
export async function capabilitiesFor(resortId: string): Promise<ConnectorCapabilities | null> {
  const integration = await prisma.resortIntegration.findUnique({
    where: { resortId },
    include: { environment: true },
  });
  if (!integration?.enabled || !integration.environment.enabled) return null;

  const stored = integration.capabilities;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    return stored as unknown as ConnectorCapabilities;
  }
  return integration.environment.integrationType === "ows"
    ? OWS_CAPABILITIES
    : SIMULATOR_CAPABILITIES;
}

type IntegrationRow = Awaited<ReturnType<typeof prisma.resortIntegration.findUnique>> & {
  environment: { endpoint: string; chainCode: string | null; credentialRef: string };
};

/**
 * Credentials are read from the environment at call time, named by the row's
 * `credentialRef`. The database holds the pointer; the secret lives where
 * secrets live. A credential in a table is a credential in every backup.
 */
function owsConfigFrom(integration: NonNullable<IntegrationRow>): OwsConfig {
  const ref = integration.environment.credentialRef;
  const username = process.env[`${ref}_USERNAME`];
  const password = process.env[`${ref}_PASSWORD`];
  if (!username || !password) {
    throw new ConnectorUnavailable(
      `Credentials for "${ref}" are not set on this server.`,
    );
  }

  // Namespaces and SOAP actions come from the property's exported WSDL —
  // see docs/opera-provisioning-runbook.md Stage 2. They differ between OPERA
  // releases, so they are configuration rather than constants in code.
  return {
    endpoint: integration.environment.endpoint,
    credentials: { username, password },
    operaResortCode: integration.operaResortCode!,
    chainCode: integration.environment.chainCode ?? undefined,
    namespaces: {
      reservation: process.env[`${ref}_NS_RESERVATION`] ?? "http://webservices.micros.com/og/4.3/HotelRes/",
      availability: process.env[`${ref}_NS_AVAILABILITY`] ?? "http://webservices.micros.com/og/4.3/Availability/",
    },
    soapActions: {
      createBooking: process.env[`${ref}_ACTION_CREATE`] ?? "http://webservices.micros.com/ows/5.1/Reservation.wsdl#CreateBooking",
      fetchBooking: process.env[`${ref}_ACTION_FETCH`] ?? "http://webservices.micros.com/ows/5.1/Reservation.wsdl#FetchBooking",
      cancelBooking: process.env[`${ref}_ACTION_CANCEL`] ?? "http://webservices.micros.com/ows/5.1/Reservation.wsdl#CancelBooking",
    },
    timeoutMs: Number(process.env[`${ref}_TIMEOUT_MS`] ?? 20000),
  };
}
