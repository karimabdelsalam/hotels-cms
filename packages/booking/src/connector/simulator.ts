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

/** Reservations the simulator has "created", keyed by our reference. */
type Held = {
  externalReservationId: string;
  externalConfirmationNumber: string;
  status: "confirmed" | "cancelled";
  checkIn: string;
  checkOut: string;
};

const STORE = new Map<string, Held>();

/** Test hook: clears everything the simulator remembers. */
export function resetSimulator(): void {
  STORE.clear();
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

    const existing = STORE.get(r.reference);
    if (existing) {
      // Already made. Returning it rather than making another is the whole
      // reason the reference travels with the request.
      await this.log("createReservation", r.correlationId, "ok_existing", started, null);
      return {
        externalReservationId: existing.externalReservationId,
        externalConfirmationNumber: existing.externalConfirmationNumber,
      };
    }

    const created: Held = {
      externalReservationId: `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      externalConfirmationNumber: String(100000 + Math.floor(Math.random() * 899999)),
      status: "confirmed",
      checkIn: r.checkIn,
      checkOut: r.checkOut,
    };
    STORE.set(r.reference, created);

    if (r.reference.includes("FAIL-LOST")) {
      // Created, then the answer is lost. The dangerous case.
      await this.log("createReservation", r.correlationId, "transport_error", started, "LOST_RESPONSE");
      throw new ConnectorTransportError("The connection dropped before the reply arrived.");
    }

    await this.log("createReservation", r.correlationId, "ok", started, null);
    return {
      externalReservationId: created.externalReservationId,
      externalConfirmationNumber: created.externalConfirmationNumber,
    };
  }

  async getReservationByReference(reference: string): Promise<ReservationDetail | null> {
    const started = Date.now();
    const found = STORE.get(reference);
    await this.log("getReservationByReference", reference, found ? "ok" : "not_found", started, null);
    if (!found) return null;
    return {
      externalReservationId: found.externalReservationId,
      externalConfirmationNumber: found.externalConfirmationNumber,
      status: found.status,
      checkIn: found.checkIn,
      checkOut: found.checkOut,
    };
  }

  async cancelReservation(r: CancelRequest): Promise<CancellationRef> {
    const started = Date.now();
    const found = STORE.get(r.reference);
    if (!found) {
      await this.log("cancelReservation", r.correlationId, "rejected", started, "NOT_FOUND");
      throw new ConnectorRejection("There is no such reservation to cancel.", "NOT_FOUND");
    }
    found.status = "cancelled";
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
