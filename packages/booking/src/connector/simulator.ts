import { prisma } from "@fantazia/db";
import {
  type PropertyConnector,
  type ConnectorCapabilities,
  type AvailabilityQuery,
  type AvailabilityResult,
  type QuoteRequest,
  type Quote,
  type ReservationRequest,
  type ReservationRef,
  type ReservationDetail,
  type CancelRequest,
  type CancellationRef,
  type ConnectorHealth,
  ConnectorTransportError,
  ConnectorRejection,
} from "./types";
import { availabilityFromSnapshot } from "./snapshot";
import { priceQuote } from "../pricing";
import { logIntegration } from "../log";

/**
 * A property system that lives in our own database.
 *
 * This exists so the booking flow can be exercised — including its failure
 * branches — before OPERA is reachable, and so those branches stay tested
 * afterwards. A test that can only run against a live PMS is a test nobody
 * runs.
 *
 * The failure modes are deliberately provokable: a reference containing
 * FAIL-TRANSPORT times out, FAIL-REJECT is refused outright, and FAIL-LOST
 * creates the reservation and then reports a transport failure — the exact
 * shape that produces two bookings for one guest if the engine does not look
 * before it retries.
 */

export const SIMULATOR_CAPABILITIES: ConnectorCapabilities = {
  mode: "native",
  instantConfirmation: true,
  liveAvailability: false,
  multiRoomBooking: true,
  modification: true,
  cancellation: true,
  promoCodes: true,
  childAges: true,
  quoteBeforeBooking: true,
};

/**
 * What the simulator remembers, in the database rather than in memory.
 *
 * An in-process Map looked simpler and was wrong: the web server and a worker
 * would each keep their own idea of what exists, and a restart would forget
 * everything. That makes the simulator unable to exercise the one case it is
 * most needed for — a reservation that already exists when the retry arrives.
 */
export async function resetSimulator(): Promise<void> {
  await prisma.simulatorReservation.deleteMany({});
}

export class SimulatorConnector implements PropertyConnector {
  readonly capabilities = SIMULATOR_CAPABILITIES;

  constructor(readonly resortId: string) {}

  async getAvailability(q: AvailabilityQuery): Promise<AvailabilityResult> {
    return availabilityFromSnapshot(q);
  }

  async quote(q: QuoteRequest): Promise<Quote> {
    return priceQuote(q);
  }

  async createReservation(r: ReservationRequest): Promise<ReservationRef> {
    const started = Date.now();

    if (r.reference.includes("FAIL-REJECT")) {
      await this.log("createReservation", r.correlationId, "rejected", started, "NO_AVAILABILITY");
      throw new ConnectorRejection("No rooms are available for those dates.", "NO_AVAILABILITY");
    }

    if (r.reference.includes("FAIL-TRANSPORT")) {
      await this.log("createReservation", r.correlationId, "transport_error", started, "TIMEOUT");
      throw new ConnectorTransportError("The property system did not answer in time.");
    }

    const existing = await prisma.simulatorReservation.findUnique({ where: { reference: r.reference } });
    if (existing) {
      // Already made. Returning it rather than making another is the whole
      // reason the reference travels with the request.
      await this.log("createReservation", r.correlationId, "ok_existing", started, null);
      return {
        externalReservationId: existing.externalReservationId,
        externalConfirmationNumber: existing.confirmationNumber,
      };
    }

    const created = await prisma.simulatorReservation.create({
      data: {
        reference: r.reference,
        resortId: this.resortId,
        externalReservationId: `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        confirmationNumber: String(100000 + Math.floor(Math.random() * 899999)),
        status: "confirmed",
        checkIn: r.checkIn,
        checkOut: r.checkOut,
      },
    });

    if (r.reference.includes("FAIL-LOST")) {
      // Created, then the answer is lost. The dangerous case.
      await this.log("createReservation", r.correlationId, "transport_error", started, "LOST_RESPONSE");
      throw new ConnectorTransportError("The connection dropped before the reply arrived.");
    }

    await this.log("createReservation", r.correlationId, "ok", started, null);
    return {
      externalReservationId: created.externalReservationId,
      externalConfirmationNumber: created.confirmationNumber,
    };
  }

  async getReservationByReference(
    reference: string,
    _resortId: string,
    correlationId: string,
  ): Promise<ReservationDetail | null> {
    const started = Date.now();
    const found = await prisma.simulatorReservation.findUnique({ where: { reference } });
    await this.log("getReservationByReference", correlationId, found ? "ok" : "not_found", started, null);
    if (!found) return null;
    return {
      externalReservationId: found.externalReservationId,
      externalConfirmationNumber: found.confirmationNumber,
      status: found.status === "cancelled" ? "cancelled" : "confirmed",
      checkIn: found.checkIn,
      checkOut: found.checkOut,
    };
  }

  async cancelReservation(r: CancelRequest): Promise<CancellationRef> {
    const started = Date.now();
    const found = await prisma.simulatorReservation.findUnique({ where: { reference: r.reference } });
    if (!found) {
      await this.log("cancelReservation", r.correlationId, "rejected", started, "NOT_FOUND");
      throw new ConnectorRejection("There is no such reservation to cancel.", "NOT_FOUND");
    }
    await prisma.simulatorReservation.update({
      where: { reference: r.reference },
      data: { status: "cancelled" },
    });
    await this.log("cancelReservation", r.correlationId, "ok", started, null);
    return {
      cancellationNumber: `CXL-${found.externalReservationId}`,
      cancelledAt: new Date(),
    };
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return { ok: true, latencyMs: 0, detail: "Simulator — no property system is being contacted." };
  }

  private log(
    operation: string,
    correlationId: string,
    status: string,
    started: number,
    errorCode: string | null,
  ) {
    return logIntegration({
      resortId: this.resortId,
      connector: "simulator",
      operation,
      correlationId,
      request: null,
      response: null,
      status,
      durationMs: Date.now() - started,
      errorCode,
    });
  }
}
