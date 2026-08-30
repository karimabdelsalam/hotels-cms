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

## 3. The environment we are actually integrating with

Confirmed, and it changes several earlier assumptions for the better:

- **One multi-property OPERA 5.6 on-premise installation** hosts all three hotels,
  distinguished by resort code — not three separate installations.
- **OXI is licensed** for all three properties.
- The channel manager will be **SiteMinder, STAAH, or SmartHOTEL**.
- No third-party booking engine is under contract; one would likely come from the same
  vendor as the channel manager.

What this buys us: **one integration, one credential set, one endpoint, one mapping
exercise.** The per-hotel connector configuration still exists — each property has its own
resort code, room codes, and rate codes — but they share one connection.

What it costs us: **one shared point of failure.** Three separate installations would have
isolated an outage to one property. Here, one outage is all three. See §7.

## 4. The implementations

### `ChannelManagerConnector` — the path

The channel manager talks to OPERA over **OXI, from the hotel side**, using the licence
already in place. We talk to the channel manager over the public internet with an API key.

```
  our API  ──HTTPS/API key──►  SiteMinder / STAAH / SmartHOTEL
                                          │
                                        OXI (hotel-side, licensed)
                                          ▼
                              one multi-property OPERA 5.6
                              resort codes: CAI · ALX · RSG
```

- **Availability and rates:** the CM pushes ARI updates to our webhook endpoint; we keep an
  `InventorySnapshot` per resort code, room type, rate plan, and date, plus a short Redis
  cache over the assembled search results.
- **Reservations:** pushed to the CM, which delivers them into OPERA over OXI.

**The single most important question to put to the vendor:** ask for their
**booking-engine / connectivity API for third-party direct booking** — explicitly *not*
their hosted booking engine product. These are different SKUs, and sales will offer the
hosted product by default because it is the bigger sale. All three vendors have their own
booking engine; what we need is the API underneath it.

Also worth confirming: rate-plan visibility for the direct channel (direct rates are often
scoped separately from OTA rates), ARI push latency, and whether reservation modification
and cancellation are supported through the same API or only creation.

### Two-stage confirmation — a detail worth designing for

OXI is asynchronous, so the **OPERA confirmation number does not come back in the same
breath as the booking**. Most channel managers return their own reservation ID
synchronously, with the PMS confirmation following minutes later.

So the connector confirms in two stages:

1. **CM reservation ID returns synchronously** → the booking is `CONFIRMED`, and the guest
   sees our booking reference immediately. The guest journey is not asynchronous.
2. **OPERA confirmation number arrives later** over the CM's status callback or a
   reconciliation poll → stored on the booking and shown in My Booking and to the
   reservations team.

`instantConfirmation: true` therefore holds on this path — the guest is never left waiting.
A reconciliation job flags any booking still missing its PMS confirmation number after a
threshold, so a silent OXI delivery failure surfaces as a queue rather than as a guest
arriving at a hotel with no reservation.

### `OperaOwsConnector` — kept as an option, not the plan

Real-time availability and reservation creation straight into OPERA, bypassing the CM. Now
simpler than originally assumed, because there is one installation rather than three — one
endpoint, one credential set, one resort-code parameter.

It stays unbuilt for now. It would only be worth it if the CM's direct-booking API proves
inadequate, or if live per-request availability turns out to matter more than the ARI
snapshot delivers. Requires the OWS component licensed (separate from OXI) and a network
path — see §5.

### `DelegatedBookingEngineConnector` — the fallback

Kept implemented because it costs little and removes a whole class of schedule risk. If the
CM's direct API is unavailable or its terms are unacceptable, a property can launch against
the vendor's hosted booking engine and switch to native mode later by changing one
configuration row.

The trade-off is real and worth stating plainly: **the hosted booking engine is the
vendor's UI, not ours.** The design work stops at the Book button. For a group that wants a
world-class site, that is the last place to compromise — which is exactly why the API
question above is the one to press hardest on.

### `MockConnector` — the one that unblocks everything

A deterministic, seeded fake with configurable latency, failure injection, and realistic
Egyptian room types, rate plans, and EGP pricing. It implements the full interface and every
capability combination.

This is not a stopgap; it is a first-class deliverable. **All of Phases 1–3 are built and
tested against it**, so the website, booking engine, payment flow, and admin can be finished
and demoed before the vendor conversation concludes. It also stays in CI permanently,
because integration tests cannot depend on a live hotel system.

## 5. Network access — why, and how much

Worth answering directly, because the amount of network work depends entirely on which path
is taken.

**On the channel-manager path: none.** No VPN, no firewall change, no tunnel. The CM is a
cloud service reachable over HTTPS; we authenticate with an API key. OPERA is reached by the
CM from inside the hotel network over the OXI licence already in place. Nothing of ours ever
touches the hotel LAN. This is a significant part of why the CM path is the recommended one.

**On an OPERA-direct path: some private route is required**, because OPERA 5.6 on-premise
sits on a private network with a private address. There are four ways to get one, in
descending order of how easily IT tends to approve them:

| Option | What it means | Trade-off |
| --- | --- | --- |
| **Outbound-only gateway** | A small connector service we deploy inside the hotel network; it holds the OPERA connection and dials **out** to our API over mTLS | No inbound firewall rules to open, nothing exposed to the internet. Usually the easiest approval. One more component to operate |
| **Colocation** | Run our API in the same datacentre as OPERA | No VPN at all. Only viable if the group has its own DC and wants to host there |
| **Site-to-site VPN** | Standard IPsec tunnel between our infrastructure and the hotel network | Well understood, but needs network engineering on both sides and IT sign-off |
| **Public exposure with TLS and an IP allowlist** | Publish the OPERA interface endpoint to the internet | **Not recommended.** A PMS holds guest identity and payment data; most hotel IT and most auditors will refuse, correctly |

So the earlier framing was too narrow: a site-to-site VPN is one option among several, and
on the path we are actually recommending, the question does not arise at all.

## 6. Selecting a connector

```
ConnectorRegistry.for(hotelId)
  → read HotelIntegration row (type, endpoint, codes, credential ref, enabled)
  → resolve credentials from secret manager (never from the API response path)
  → instantiate/return the cached connector
  → wrap in: timeout → retry(backoff+jitter) → circuit breaker → metrics → audit log
```

Every connector is wrapped in the same decorator chain. Resilience is not each
implementation's responsibility, so it cannot be forgotten in one of them.

Circuit-breaker state is tracked **per hotel and per shared environment**, because on this
topology they are not the same thing. A resort-code-specific rejection trips one property; a
channel-manager or OPERA outage trips all three at once.

When a breaker is open:

- group search excludes the affected properties and records the reason as `degraded`,
  distinct from `no availability`,
- property pages stay fully browsable with an enquiry CTA,
- admin integration health shows breaker state and last error, credentials redacted.

**Because ARI is pushed and stored, search and browsing survive an outage entirely** — they
read the snapshot, not the live system. Only new reservation creation queues. This is the
main compensation for having one shared installation instead of three.

## 7. Mapping external codes

Our entities and the property's codes are never assumed to match. Mapping is explicit,
editable in admin, and validated.

| Ours | External | Where |
| --- | --- | --- |
| `Hotel.id` | OPERA **resort code** (`CAI`, `ALX`, `RSG`) | `HotelIntegration` |
| `RoomType.id` | `external_code` | per hotel |
| `RatePlan.id` | `external_code` | per hotel |
| `Booking.reference` | CM reservation ID | `Booking.external_reservation_id` |
| `Booking.reference` | OPERA confirmation number | `Booking.external_confirmation_number`, arrives later |

The resort code is what makes one connection serve three hotels. Everything else —
endpoint, credentials, chain code — is shared and lives on a single `IntegrationEnvironment`
row that all three `HotelIntegration` rows reference.

External identifiers are stored verbatim and never regenerated. Unmapped codes arriving
from an ARI sync surface in admin as **needs mapping** rather than being silently dropped —
silent drops are how inventory quietly disappears from a website.

## 8. Building our own booking engine, on OPERA directly

This is the chosen direction, and it is the right one: it keeps the checkout inside our own
design and removes a per-booking fee to a vendor. What follows is how it actually connects,
and what has to be true for it to work.

### The interfaces OPERA 5.6 on-premise actually exposes

| Interface | Shape | Good for | Not good for |
| --- | --- | --- | --- |
| **OWS** (OPERA Web Services) | SOAP/XML, **synchronous** request/response | Live availability, rate lookup, creating, modifying, cancelling reservations, returning a confirmation number in the same call | Nothing — this is the interface built for exactly our use case |
| **OXI** (OPERA Xchange Interface) | XML business messages, **asynchronous**, queue-based | Continuous ARI sync — rates, availability, restrictions, room and rate codes — pushed to us as they change | A guest waiting inside a checkout for a confirmation number |
| Direct Oracle DB access | SQL | — | **Never.** Unsupported, voids support, breaks on upgrade, and no write path is safe |

OPERA Cloud's REST APIs (OHIP) are the modern answer to all of this, but they do not apply
to a 5.6 on-premise installation. Worth knowing as the migration path, not as an option now.

### The recommended shape: OXI for inventory, OWS for the transaction

```
   Browsing & search                        Checkout
   ─────────────────                        ────────
   guest → our site                         guest → our checkout
        → InventorySnapshot (Postgres)           → OWS: re-check availability + price
             ▲                                   → OWS: create reservation
             │ OXI pushes ARI continuously       → confirmation number returns in the call
        one multi-property OPERA 5.6        ─────────────────────────────────────────►
        resort codes: CAI · ALX · RSG              same OPERA
```

Each interface does what it was designed for. **Search never touches OPERA** — it reads a
snapshot kept current by OXI, so the homepage stays fast and the site survives an OPERA
outage. **The transaction always touches OPERA** — a live re-check immediately before
payment, then a real reservation with a real confirmation number, synchronously.

This also solves the oversell problem the pure-cache approach has: the snapshot can be
slightly stale for browsing, because nothing is committed until OWS confirms live.

### If OWS turns out not to be licensed

OXI alone still works, and this is worth knowing before paying for anything:

- Availability and rates come from the OXI-fed snapshot — no change.
- Reservation creation becomes an **asynchronous message**. Checkout ends with our booking
  reference and "we are confirming your stay"; the OPERA confirmation number arrives on a
  later message and reconciles onto the booking.
- Modification and cancellation are async the same way.
- `instantConfirmation: false`, and the capability flags carry it through the UI without
  conditional logic anywhere else.

The cost is real — a guest who pays and does not immediately get a confirmation number
converts worse and calls the hotel more — and the mitigation is an allotment buffer per room
type plus a stop-sell threshold, because the commit is no longer synchronous. Workable, but
**OWS is worth paying for if the quote is reasonable.** Get the number before deciding.

### What still has to be verified in the actual environment

Per the brief: do not invent endpoints or assume an undocumented API exists. These are
questions for the Oracle partner or whoever administers the installation.

1. **Is OWS licensed and installed?** If not, what does it cost to add? This is the single
   decision that shapes the checkout.
2. **Which OXI interfaces are configured today**, and which message types are enabled —
   reservation, profile, rate, inventory/availability, blocks?
3. **Exact version and patch level** of the 5.6 installation.
4. **Resort codes and chain code** for the three properties.
5. Is there an existing OXI interface to a channel manager, and **will ours run alongside
   it** without conflicting on the same message types?
6. Who owns the OPERA environment operationally, and is there a support contract covering
   interface configuration changes?

### The thing to get right: two systems writing the same inventory

A channel manager is still needed for OTA distribution — Booking.com and Expedia do not go
away. So OPERA ends up with two integrations: the CM for OTAs, and ours for direct.

**OPERA has to remain the single source of truth**, with the CM syncing from it. When we
create a direct booking through OWS, OPERA decrements, and OXI propagates that to the CM so
OTA availability drops. That is the normal topology, but it makes propagation latency a real
number to measure rather than assume — it is the width of the oversell window.

If reservations are created over OXI instead of OWS, that window widens by the async delay.
One more reason OWS is worth the licence.

### What this changes in the plan

- `OperaOwsConnector` and `OxiAriConnector` move from "designed but unbuilt" to the primary
  build in Phase 4.
- `ChannelManagerConnector` stays implemented, but for OTA reconciliation rather than as the
  direct-booking path.
- Network access now genuinely matters — see §5. The outbound-only on-premise gateway is
  likely the easiest approval, and avoids opening anything inbound.
- Phase 4 grows by roughly two weeks: SOAP client, XML schema mapping, and certification
  against the hotel's real configuration are more work than consuming a vendor REST API.

None of it blocks Phases 1–3, which run entirely on the mock connector.
