/**
 * The contract between the booking engine and any property system.
 *
 * One interface, several implementations, chosen per resort at runtime. The
 * point of the capability flags is that no code anywhere asks "is this resort
 * on OPERA?" — the UI reads what the connector says it can do and renders
 * accordingly. A resort whose connector cannot modify reservations shows no
 * Modify button; one without instant confirmation says "we are confirming"
 * rather than inventing a number we do not have.
 */

export type ConnectorCapabilities = {
  mode: "native" | "delegated";
  /** false → the booking rests in PENDING_CONFIRMATION until a reference arrives. */
  instantConfirmation: boolean;
  /** false → availability is served from the ARI snapshot rather than live. */
  liveAvailability: boolean;
  multiRoomBooking: boolean;
  modification: boolean;
  cancellation: boolean;
  promoCodes: boolean;
  childAges: boolean;
  quoteBeforeBooking: boolean;
};

export type Money = { minor: number; currency: string };

export type Occupancy = {
  adults: number;
  children: number;
  childAges: number[];
};

export type AvailabilityQuery = {
  resortId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  occupancy: Occupancy;
  roomsCount: number;
  promoCode?: string;
};

export type NightlyRate = { date: string; minor: number };

export type AvailableRoom = {
  roomTypeId: string;
  ratePlanId: string;
  /** How many of this room type are left. Governs the rooms-count selector. */
  available: number;
  nightly: NightlyRate[];
  /** Sum of `nightly`, for one room, before taxes and fees. */
  roomTotalMinor: number;
  currency: string;
  restrictions: Restrictions;
};

export type Restrictions = {
  minStay?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  stopSell?: boolean;
};

export type AvailabilityResult = {
  resortId: string;
  rooms: AvailableRoom[];
  /** true when this came from the ARI snapshot rather than a live call. */
  fromSnapshot: boolean;
  asOf: Date;
};

export type QuoteLine = {
  roomTypeId: string;
  ratePlanId: string;
  quantity: number;
  occupancy: Occupancy;
  nightly: NightlyRate[];
  roomTotalMinor: number;
};

export type QuoteRequest = {
  resortId: string;
  checkIn: string;
  checkOut: string;
  lines: { roomTypeId: string; ratePlanId: string; quantity: number; occupancy: Occupancy }[];
  promoCode?: string;
  correlationId: string;
};

/**
 * A fresh, authoritative, itemised price fetched immediately before payment.
 *
 * Deliberately separate from availability: rates shown while browsing may come
 * from the snapshot, but a cached price is never the price the guest pays.
 */
export type Quote = {
  resortId: string;
  currency: string;
  lines: QuoteLine[];
  roomTotalMinor: number;
  taxesTotalMinor: number;
  feesTotalMinor: number;
  totalMinor: number;
  /** Taxes and fees named, so the guest can see what they are paying for. */
  breakdown: { label: string; minor: number; kind: "tax" | "fee" }[];
  quotedAt: Date;
};

export type ReservationRequest = {
  /** Our reference. Sent as the external system's own guest reference so a
   *  lost response can be recovered by looking it up. */
  reference: string;
  resortId: string;
  checkIn: string;
  checkOut: string;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    country?: string;
  };
  lines: QuoteLine[];
  currency: string;
  totalMinor: number;
  specialRequests?: string;
  correlationId: string;
};

export type ReservationRef = {
  externalReservationId: string;
  /** Present when the system returns it in the same call — the OWS path does. */
  externalConfirmationNumber?: string;
  /** Per-line ids, needed to modify or partially cancel later. */
  lineIds?: string[];
};

export type ReservationDetail = ReservationRef & {
  status: "confirmed" | "cancelled" | "unknown";
  checkIn?: string;
  checkOut?: string;
  totalMinor?: number;
  currency?: string;
};

export type CancelRequest = {
  reference: string;
  externalReservationId: string;
  resortId: string;
  correlationId: string;
};

export type CancellationRef = {
  cancellationNumber: string;
  cancelledAt: Date;
};

export type ConnectorHealth = {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
};

export interface PropertyConnector {
  readonly resortId: string;
  readonly capabilities: ConnectorCapabilities;

  getAvailability(q: AvailabilityQuery): Promise<AvailabilityResult>;
  quote(q: QuoteRequest): Promise<Quote>;
  createReservation(r: ReservationRequest): Promise<ReservationRef>;
  /** Looked up by OUR reference — this is what makes a lost response recoverable. */
  getReservationByReference(reference: string, resortId: string): Promise<ReservationDetail | null>;
  cancelReservation(r: CancelRequest): Promise<CancellationRef>;
  healthCheck(): Promise<ConnectorHealth>;
}

/* ---------------- errors ---------------- */

/**
 * Transport or 5xx: the request may or may not have landed. Safe to retry, but
 * only after looking to see whether it already succeeded.
 */
export class ConnectorTransportError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ConnectorTransportError";
  }
}

/**
 * The property system understood the request and said no: no availability, an
 * invalid rate code, a closed date. Retrying produces the same answer more
 * slowly, so this never retries.
 */
export class ConnectorRejection extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "ConnectorRejection";
  }
}

/** The breaker is open: the connection is known bad, so we do not try. */
export class ConnectorUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorUnavailable";
  }
}
