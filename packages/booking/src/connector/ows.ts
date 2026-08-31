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
import { envelope, faultIn, pick, pickAttr, redact, xml, type SoapCredentials } from "./soap";
import { priceQuote } from "../pricing";
import { logIntegration } from "../log";

/**
 * OPERA Web Services — the transactional path.
 *
 * OWS is synchronous: it returns a confirmation number in the same call, which
 * is what makes `instantConfirmation: true` honest here. Availability still
 * comes from the OXI-fed snapshot, because search must survive an OPERA outage
 * and three resorts share one installation.
 *
 * ── A note on the message shapes below ──────────────────────────────────
 * OWS deployments differ: the service names, SOAP actions and namespace
 * versions depend on the OPERA release and which services were deployed. The
 * envelope, WS-Security, fault handling and parsing here are real; the
 * operation names and namespaces are configuration, filled from the WSDL the
 * property's team exports (Stage 2 of the provisioning runbook). They are NOT
 * guesses baked into code — a wrong namespace silently returns a fault, and
 * finding that out in production is expensive.
 */

export type OwsConfig = {
  endpoint: string;
  credentials: SoapCredentials;
  operaResortCode: string;
  chainCode?: string;
  /** From the exported WSDL. See docs/opera-provisioning-runbook.md Stage 2. */
  namespaces: {
    reservation: string;
    availability: string;
  };
  soapActions: {
    createBooking: string;
    fetchBooking: string;
    cancelBooking: string;
  };
  timeoutMs: number;
};

export const OWS_CAPABILITIES: ConnectorCapabilities = {
  mode: "native",
  // OWS answers in the same call, so the guest never waits on a queue.
  instantConfirmation: true,
  // Search reads the snapshot on purpose: see the note above.
  liveAvailability: false,
  multiRoomBooking: true,
  modification: true,
  cancellation: true,
  promoCodes: true,
  childAges: true,
  quoteBeforeBooking: true,
};

export class OwsConnector implements PropertyConnector {
  readonly capabilities = OWS_CAPABILITIES;

  constructor(
    readonly resortId: string,
    private readonly config: OwsConfig,
  ) {}

  async getAvailability(q: AvailabilityQuery): Promise<AvailabilityResult> {
    return availabilityFromSnapshot(q);
  }

  async quote(q: QuoteRequest): Promise<Quote> {
    // Priced from the snapshot the guest was shown, then taxed and feed by our
    // own rules. The authority that matters is the availability re-check
    // immediately before payment, which `validate` performs.
    return priceQuote(q);
  }

  async createReservation(r: ReservationRequest): Promise<ReservationRef> {
    const body = `
    <HotelReservation xmlns="${this.config.namespaces.reservation}">
      <HotelReference chainCode="${xml(this.config.chainCode)}" hotelCode="${xml(this.config.operaResortCode)}"/>
      <!-- Our own reference travels as the external guest reference. It is what
           getReservationByReference looks up when a response is lost. -->
      <ReservationID>
        <ReservationIDType>EXTERNAL</ReservationIDType>
        <ReservationIDValue>${xml(r.reference)}</ReservationIDValue>
      </ReservationID>
      <RoomStays>
        ${r.lines
          .map(
            (line) => `
        <RoomStay>
          <RoomTypes><RoomType roomTypeCode="${xml(line.roomTypeId)}" numberOfUnits="${line.quantity}"/></RoomTypes>
          <RatePlans><RatePlan ratePlanCode="${xml(line.ratePlanId)}"/></RatePlans>
          <GuestCounts>
            <GuestCount ageQualifyingCode="ADULT" count="${line.occupancy.adults}"/>
            ${line.occupancy.childAges
              .map((age) => `<GuestCount ageQualifyingCode="CHILD" age="${age}" count="1"/>`)
              .join("")}
          </GuestCounts>
          <TimeSpan start="${xml(r.checkIn)}" end="${xml(r.checkOut)}"/>
          <RoomRates>
            ${line.nightly
              .map(
                (n) =>
                  `<RoomRate effectiveDate="${xml(n.date)}" amountBeforeTax="${(n.minor / 100).toFixed(2)}" currencyCode="${xml(r.currency)}"/>`,
              )
              .join("")}
          </RoomRates>
        </RoomStay>`,
          )
          .join("")}
      </RoomStays>
      <ResGuests>
        <ResGuest>
          <Profile>
            <Customer>
              <PersonName>
                <GivenName>${xml(r.guest.firstName)}</GivenName>
                <Surname>${xml(r.guest.lastName)}</Surname>
              </PersonName>
              <Email>${xml(r.guest.email)}</Email>
              ${r.guest.phone ? `<Telephone phoneNumber="${xml(r.guest.phone)}"/>` : ""}
              ${r.guest.country ? `<Address><CountryName code="${xml(r.guest.country)}"/></Address>` : ""}
            </Customer>
          </Profile>
        </ResGuest>
      </ResGuests>
      ${r.specialRequests ? `<Comments><Comment><Text>${xml(r.specialRequests)}</Text></Comment></Comments>` : ""}
    </HotelReservation>`;

    const response = await this.call(
      this.config.soapActions.createBooking,
      body,
      "createReservation",
      r.correlationId,
    );

    const externalReservationId =
      pickAttr(response, "ReservationID", "ReservationIDValue") ??
      pick(response, "ReservationIDValue") ??
      pick(response, "UniqueID");
    const confirmation =
      pick(response, "ConfirmationNumber") ??
      pickAttr(response, "UniqueID", "ID");

    if (!externalReservationId) {
      // A 200 with no id is not a success. Treating it as one would confirm a
      // booking we cannot look up, modify or cancel.
      throw new ConnectorTransportError(
        "The property system accepted the reservation but returned no identifier.",
      );
    }

    return {
      externalReservationId,
      externalConfirmationNumber: confirmation ?? undefined,
    };
  }

  /**
   * The lookup that makes a lost response safe.
   *
   * Before every retry the engine asks this: if the reservation already
   * exists, it is adopted rather than created again. Without it a network
   * timeout produces two reservations for one guest and the hotel finds out at
   * check-in.
   */
  async getReservationByReference(
    reference: string,
    _resortId: string,
  ): Promise<ReservationDetail | null> {
    const body = `
    <FetchBookingRequest xmlns="${this.config.namespaces.reservation}">
      <HotelReference chainCode="${xml(this.config.chainCode)}" hotelCode="${xml(this.config.operaResortCode)}"/>
      <ReservationID>
        <ReservationIDType>EXTERNAL</ReservationIDType>
        <ReservationIDValue>${xml(reference)}</ReservationIDValue>
      </ReservationID>
    </FetchBookingRequest>`;

    let response: string;
    try {
      response = await this.call(
        this.config.soapActions.fetchBooking,
        body,
        "getReservationByReference",
        reference,
      );
    } catch (error) {
      // "Not found" is an answer, not a failure: it means we may safely create.
      if (error instanceof ConnectorRejection && /not.?found|no.?match/i.test(error.message)) {
        return null;
      }
      throw error;
    }

    const externalReservationId =
      pick(response, "ReservationIDValue") ?? pick(response, "UniqueID");
    if (!externalReservationId) return null;

    const cancelled = /<(?:\w+:)?ResStatus[^>]*>\s*Cancel/i.test(response);
    return {
      externalReservationId,
      externalConfirmationNumber: pick(response, "ConfirmationNumber") ?? undefined,
      status: cancelled ? "cancelled" : "confirmed",
      checkIn: pickAttr(response, "TimeSpan", "start") ?? undefined,
      checkOut: pickAttr(response, "TimeSpan", "end") ?? undefined,
    };
  }

  async cancelReservation(r: CancelRequest): Promise<CancellationRef> {
    const body = `
    <CancelBookingRequest xmlns="${this.config.namespaces.reservation}">
      <HotelReference chainCode="${xml(this.config.chainCode)}" hotelCode="${xml(this.config.operaResortCode)}"/>
      <ReservationID>
        <ReservationIDType>INTERNAL</ReservationIDType>
        <ReservationIDValue>${xml(r.externalReservationId)}</ReservationIDValue>
      </ReservationID>
    </CancelBookingRequest>`;

    const response = await this.call(
      this.config.soapActions.cancelBooking,
      body,
      "cancelReservation",
      r.correlationId,
    );

    return {
      cancellationNumber:
        pick(response, "CancellationNumber") ?? pick(response, "ReservationIDValue") ?? r.externalReservationId,
      cancelledAt: new Date(),
    };
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const started = Date.now();
    try {
      // A lookup for a reference that cannot exist: it exercises auth, the
      // endpoint and the envelope without creating anything.
      await this.getReservationByReference("HEALTHCHECK-000000", this.resortId);
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /* ---------------- transport ---------------- */

  private async call(
    soapAction: string,
    body: string,
    operation: string,
    correlationId: string,
  ): Promise<string> {
    const payload = envelope(body, this.config.credentials);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    let text: string;
    try {
      response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: soapAction,
        },
        body: payload,
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      await logIntegration({
        resortId: this.resortId,
        connector: "ows",
        operation,
        correlationId,
        request: redact(payload),
        response: null,
        status: "transport_error",
        durationMs: Date.now() - started,
        errorCode: controller.signal.aborted ? "TIMEOUT" : "NETWORK",
      });
      // The request may or may not have landed. That is precisely why the
      // engine looks before it retries.
      throw new ConnectorTransportError(
        controller.signal.aborted
          ? "The property system did not answer in time."
          : "Could not reach the property system.",
        error,
      );
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - started;
    const fault = faultIn(text);

    await logIntegration({
      resortId: this.resortId,
      connector: "ows",
      operation,
      correlationId,
      request: redact(payload),
      response: redact(text),
      status: fault ? "rejected" : response.ok ? "ok" : "http_error",
      durationMs,
      errorCode: fault?.code ?? (response.ok ? null : String(response.status)),
    });

    if (!response.ok) {
      // 5xx may be transient; 4xx is us, and repeating it changes nothing.
      if (response.status >= 500) {
        throw new ConnectorTransportError(
          `The property system returned ${response.status}.`,
        );
      }
      throw new ConnectorRejection(
        `The property system refused the request (${response.status}).`,
        String(response.status),
      );
    }

    // OWS reports business errors inside a 200, so this check is not optional.
    if (fault) throw new ConnectorRejection(fault.message, fault.code);

    return text;
  }
}
