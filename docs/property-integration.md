# Property Integration Layer

This is the most important design decision in the project, because it is the one that is
still uncertain. The booking backend may be a channel manager, OPERA directly, or a
third-party booking engine — and it may **differ per hotel**. The architecture is built so
that this question can be answered late, answered differently for each property, and
answered again later without a rewrite.

## 1. The two booking modes

Every property runs in one of two modes, set per hotel in the admin panel.

### Mode A — Native booking (we own the funnel)

The guest searches, compares, and pays on our site. We create the reservation in the
property's system through a connector.

```
Guest → our search → our rooms/rates → our checkout → our payment
      → connector.createReservation() → confirmation number → our confirmation page
```

We get: unified group search across all properties, full conversion analytics, our own
upsell and offer logic, one design language end to end, and first-party guest data.

### Mode B — Delegated booking (a third-party engine owns the funnel)

We own discovery, content, and SEO. At the moment of booking we hand off to an external
booking engine with the search parameters pre-filled.

```
Guest → our search/property page → deep link or embed with prefilled params
      → third-party BE checkout → their confirmation
```

We get: a working booking path in days rather than months. We lose: cross-property
comparison for that hotel, checkout analytics, and design control at the last step.

**Why both must exist.** With three properties possibly on three different setups, mode B
is the bridge that lets a hotel go live before its integration is ready, and the fallback
if one property's system never exposes a usable API. A property can be switched from B to A
by changing one configuration row — no code, no redeploy.

In group-level "All Hotels" search, mode B properties appear with an indicative starting
price where one is available and a **Check availability** action that opens their engine,
rather than being silently omitted. If no indicative price exists, they appear without a
price rather than not at all — a property missing from the group site is worse than a
property without a number next to it.

## 2. The `PropertyConnector` interface

One interface, several implementations, selected per hotel at runtime.

```ts
interface PropertyConnector {
  readonly hotelId: string;
  readonly capabilities: ConnectorCapabilities;

  getHotelInfo(): Promise<PropertyDescriptor>;
  getAvailability(q: AvailabilityQuery): Promise<AvailabilityResult>;
  getRates(q: RateQuery): Promise<RateResult>;
  quote(q: QuoteRequest): Promise<Quote>;              // authoritative pre-booking price
  createReservation(r: ReservationRequest): Promise<ReservationRef>;
  getReservation(ref: ReservationLookup): Promise<ReservationDetail>;
  modifyReservation(r: ModifyRequest): Promise<ReservationRef>;
  cancelReservation(r: CancelRequest): Promise<CancellationRef>;
  healthCheck(): Promise<ConnectorHealth>;
}

interface ConnectorCapabilities {
  mode: 'native' | 'delegated';
  instantConfirmation: boolean;   // false → booking rests in PENDING_CONFIRMATION
  liveAvailability: boolean;      // false → availability served from synced ARI cache
  multiRoomBooking: boolean;
  modification: boolean;
  cancellation: boolean;
  promoCodes: boolean;
  childAges: boolean;
  quoteBeforeBooking: boolean;
}
```

`capabilities` is what makes genuinely different properties coexist. The UI reads it: a
hotel whose connector cannot modify reservations does not render a **Modify** button; a
hotel without `instantConfirmation` shows "we will confirm within X" instead of a
confirmation number. No conditional logic anywhere asks "is this hotel on OPERA?"

`quote()` is separate from `getRates()` on purpose. Rates are for browsing and may come
from cache. A quote is a fresh, authoritative, itemised price with taxes and fees, fetched
immediately before payment. **A cached price is never the price the guest pays.**

## 3. The implementations

### `ChannelManagerConnector` — recommended primary path

A channel manager already holds a certified two-way integration with each hotel's OPERA
(usually over OXI), and exposes a modern API to partners. That work is done, tested, and
supported by a vendor.

- **Availability and rates:** the CM pushes ARI updates to a webhook endpoint; we maintain
  a synced inventory table plus a short Redis cache. Some CMs also offer a pull endpoint
  for verification.
- **Reservations:** pushed to the CM (`OTA_HotelResNotifRQ` or the vendor's REST
  equivalent), which writes into OPERA and returns a confirmation number.
- `liveAvailability: false`, `instantConfirmation: true` for most vendors.

**Advantages:** one integration instead of three; no VPN into hotel networks; no Oracle
licensing negotiation; vendor-supported; the hotels most likely already pay for it.

**What to verify before committing:** which CM each hotel uses, whether the contract
includes a **direct-booking / booking-engine API** (distinct from OTA distribution, and
often a separate SKU), rate-plan visibility for direct channels, and the ARI push latency.

**The real trade-off:** ARI is a synced picture, not a live query. Between the last push
and a booking there is a window where inventory can move. Mitigate with an allotment
buffer per room type, a stop-sell threshold, and a mandatory `quote()` before payment.

### `OperaOwsConnector` — best control, highest cost

OPERA Web Services is SOAP/XML and **synchronous**: real-time availability, rates, and
reservation creation. This is the correct interface for a custom booking engine.

- Requires the OWS component to be licensed and installed, plus site-to-site VPN or a
  private link from `apps/api` to each property.
- One connector instance per hotel: its own endpoint, credentials, hotel code, and chain
  code. Never one shared database connection.
- `liveAvailability: true`, `instantConfirmation: true`.

**Cost:** three separate installations to license, network access to negotiate with each
hotel's IT, and SOAP envelopes to maintain. Realistically the longest lead time in the
project, and mostly outside our control.

### A note on OXI — worth reading before deciding

OXI is not a real-time web API. It is an **asynchronous, message-queue interface engine**
built for exchanging business messages between OPERA and an external system — classically a
CRS or channel manager. It handles ARI download and reservation upload well. It was not
designed for a guest waiting for an availability response inside a checkout.

Practically this means:

- **Using OXI for ARI is sound.** Subscribe to rate and availability messages, keep our own
  inventory picture, serve search from it. This is exactly what a channel manager does.
- **Using OXI for reservation creation costs you instant confirmation.** You send a message
  and acknowledge later, so checkout ends in "pending confirmation" rather than a
  confirmation number. Workable — `instantConfirmation: false` handles it — but it is a
  real downgrade in conversion and in guest trust, and it complicates the payment/booking
  consistency rules in `booking-lifecycle.md`.
- **The strongest OPERA-direct setup is OXI for ARI plus OWS for booking**, which needs
  both licensed.

So: "connect to OPERA over OXI directly" is possible, but if it is chosen, it should be
chosen knowing it buys asynchronous confirmation, and that a channel manager gives the same
data path with a supported API and none of the VPN work.

### `DelegatedBookingEngineConnector` — the bridge

Wraps a third-party engine (SynXis, D-EDGE, Bookassist, Profitroom, Cloudbeds, or the
channel manager's own engine). Implements `getHotelInfo()` and, where the vendor exposes
one, an indicative starting price. `createReservation()` throws by design — the mode is
`delegated`, and the funnel hands off.

What it must still do: build a correctly parameterised deep link (property code, dates,
occupancy, promo code, locale, currency) and emit a `booking_handoff` analytics event so we
can measure what we are giving away.

### `MockConnector` — the one that unblocks everything

A deterministic, seeded fake with configurable latency, failure injection, and realistic
Egyptian room types, rate plans, and EGP pricing. It implements the full interface and every
capability combination.

This is not a stopgap; it is a first-class deliverable. **All of Phases 1–3 are built and
tested against it.** It means the website, booking engine, payment flow, and admin can be
finished and demoed before a single decision about OPERA, channel managers, or vendors is
made. It also stays in CI permanently, because integration tests cannot depend on a live
hotel system.

## 4. Selecting a connector

```
ConnectorRegistry.for(hotelId)
  → read HotelIntegration row (type, endpoint, codes, credential ref, enabled)
  → resolve credentials from secret manager (never from the API response path)
  → instantiate/return the cached connector
  → wrap in: timeout → retry(backoff+jitter) → circuit breaker → metrics → audit log
```

Every connector is wrapped in the same decorator chain. Resilience is not each
implementation's responsibility, so it cannot be forgotten in one of them.

Circuit-breaker state is per hotel. When one property's integration is open:

- group search excludes it and records the reason,
- its property page stays fully browsable with an enquiry CTA,
- admin integration health shows breaker state and last error, credentials redacted.

## 5. Mapping external codes

Our entities and the property's codes are never assumed to match. Mapping is explicit,
editable in admin, and validated.

| Ours | External | Where |
| --- | --- | --- |
| `RoomType.id` | `external_code` | per hotel |
| `RatePlan.id` | `external_code` | per hotel |
| `Hotel.id` | `hotel_code` / chain code | `HotelIntegration` |
| `Booking.reference` | `external_reservation_id` | `Booking` |

External identifiers are stored verbatim and never regenerated. Unmapped codes arriving
from an ARI sync surface in admin as **needs mapping** rather than being silently dropped —
silent drops are how inventory quietly disappears from a website.

## 6. Recommendation

Ranked for the stated goal of *one unified group booking experience*:

1. **Channel manager**, if the contract includes a direct-booking API. Fastest credible
   path to native mode across all three hotels, one integration, no VPN.
2. **OPERA OWS**, if it is licensed and hotel IT will provide network access. Best control
   and true live availability; longest lead time.
3. **OXI for ARI, plus OWS or the CM for reservations.** Sound hybrid if OWS exists.
4. **Delegated third-party engine**, per hotel, as a bridge or a permanent fallback for any
   property whose system cannot support native mode.

**What is needed to decide** — and none of it blocks development, because Phases 1–3 run on
the mock connector:

- Which channel manager each of the three hotels uses today, and whether the contract
  covers a booking-engine/direct API.
- Whether OWS is licensed on any of the three OPERA installations.
- Whether hotel IT will permit site-to-site VPN from our API.
- Whether any hotel already has a third-party booking engine under contract.
