# Delivery Roadmap

## The organising principle

**Everything through Phase 4 is built against the simulator connector.** The website, booking
engine, payment flow, and admin portal can be complete and demo-ready before a single
decision is made about channel managers, OPERA licensing, or VPN access.

This matters because the integration decision is the one thing genuinely outside our
control — it depends on hotel IT, vendor contracts, and Oracle licensing. Sequencing it
first would idle the project for weeks. Sequencing it late costs nothing, because the
`PropertyConnector` interface is the same either way.

## Where the build actually stands

Written down because a roadmap that does not say what is finished is a wish list.

| | Area | State |
| --- | --- | --- |
| ✅ | Monorepo, Postgres, Prisma schema and migrations, seed | Done |
| ✅ | Public site — home, resorts, rooms, offers, experiences, reef, weddings, pages | Done |
| ✅ | Two languages live (English, Arabic) with RTL from data, three more ready to enable | Done |
| ✅ | Admin: content, media, pages, site sections, staff and RBAC, audit log | Done |
| ✅ | Translation manager with drift detection, and AI translation that never overwrites a hand-edited string | Done |
| ✅ | Menu builder — reorder, nest, per-language labels, items pointing at content not addresses | Done |
| ✅ | Rooms editor, including photos | Done |
| ✅ | Two-step sign-in with recovery codes | Done |
| ✅ | Booking: schema, connector contract, engine, holds, state machine, idempotency | Done |
| ✅ | OWS connector — envelope, WS-Security, faults, redaction, lost-response recovery | Done, **untested against a live OPERA** |
| ✅ | Simulator connector with provokable failures | Done |
| ✅ | Public booking flow — search, results, checkout, payment, confirmation | Done |
| ✅ | Admin bookings and the manual-review queue | Done |
| ⏳ | Payment provider adapter | **Blocked on choosing a provider.** The seam and lifecycle are built and tested; a real adapter is `PaymentProvider` plus its signature check |
| ⏳ | OWS against the real installation | **Blocked on the WSDL, endpoint and service account** — Stage 2 of the provisioning runbook |
| ⏳ | OXI inventory feed | Blocked on the same. Inventory is currently seeded |
| ⏳ | Real content and photography | Yours |
| ⏳ | Confirmation emails | Not started |
| ⏳ | My Booking (lookup, cancel) | Not started |

**Nothing on the blocked list blocks the rest.** Everything above it is built and tested
against a simulator that stands in for OPERA, including the failure branches.

## Phases

### Phase 0 — Foundation · ~2 weeks
Monorepo, CI, Postgres and Prisma schema, migrations, seed data for three placeholder
properties, design tokens and the `packages/ui` primitives, staff auth with RBAC and the
tenancy extension, base observability.

**i18n foundation:** the `Locale` registry, `TranslationString` table, key sync from the
English source catalogue, the fallback chain, bundle compilation to Redis, prefixed locale
routing, and direction driven by `Locale.direction`. English and Arabic are seeded as the
first two locales — Arabic specifically because it proves RTL works before any layout is
built on top of it.

**Done when:** a scoped user can log in, see only their hotel; a locale can be added from
the database and appear in routing; and the site renders correctly LTR and RTL at every
breakpoint.

### Phase 1 — Content & CMS · ~3 weeks
Admin CRUD for hotels, destinations, room types, rate plans, restaurants, venues, offers,
amenities, pages, and the media library with focal points. Public site: home, hotels index,
hotel detail, destinations, offers, about, contact. SEO: metadata, Open Graph, per-locale
sitemaps, `hreflang`, robots, canonicals, hotel structured data.

**Translation Manager:** locale CRUD from admin, per-entity locale tabs with the English
source shown alongside, completeness reporting, `needs_review` drift detection, JSON/CSV/XLIFF
import and export with a dry-run diff, optional machine pre-fill, the publish gate, and the
`TRANSLATOR` role.

**Done when:** a non-developer can add a third locale from the admin panel, translate the
site, and publish it — with no deploy.

### Phase 2 — Search & availability · ~3 weeks
`PropertyConnector` interface and the simulator connector with failure injection. Inventory
sync, snapshot table, Redis caching, circuit breakers. Group and property search, results
grouped by hotel, the search widget, filters, degraded-property handling.

**Done when:** group-wide search returns correct grouped results across three properties,
and killing one connector degrades that property only.

### Phase 3 — Booking & payment · ~3 weeks
Booking state machine, holds, quote validation, the full checkout stepper, guest details,
extras, review. Payment abstraction plus the Paymob adapter, hosted flow, webhooks,
idempotency. Confirmation email and SMS templated per locale. My Booking lookup, view,
cancel. The `NEEDS_MANUAL_REVIEW` queue and its admin actions.

**Done when:** a guest completes a real payment in a sandbox and receives a confirmation,
and every failure branch in `booking-lifecycle.md` has a passing test — including payment
captured with reservation creation failing.

### Phase 4 — OPERA integration · ~5–6 weeks, **externally gated**
Build `OxiAriConnector` for inventory sync and `OperaOwsConnector` for the transaction —
SOAP client, XML schema mapping, resort-code and rate/room code mapping UI, live re-check
before payment, reservation create/modify/cancel, health monitoring, per-property rollout.
Certification against the hotel's real configuration is part of this, not after it.

**Blocked on** vendor selection and the API questions in `property-integration.md` §8.
Nothing else in the project is blocked by it. Properties can go live one at a time, and a property can launch in
delegated mode and switch to native later by changing one configuration row.

### Phase 5 — Admin dashboards & reporting · ~2 weeks
Group dashboard (bookings, revenue, sources, hotel performance, conversion, cancellation
rate, average booking value, arrivals, departures), per-hotel dashboards, integration health
views, audit log viewer, exports.

### Phase 6 — Hardening & launch · ~2 weeks
Security review and penetration test, load testing on search and booking, accessibility
audit against WCAG 2.2 AA in every enabled locale, RTL and long-string (German) layout QA,
performance budgets green in CI, runbooks, production deployment, monitoring and alerting,
staff training including the Translation Manager.

## Dependency shape

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 6
                            │           │
                            └─────┬─────┘
                                  ▼
                            Phase 4  (externally gated — can run in parallel
                                      once the integration decision lands)
                                  │
                            Phase 5 (parallel with 4)
```

Roughly 15–17 weeks of build to launch with one property live, assuming the integration
decision arrives before Phase 3 ends. If it slips, Phases 5 and 6 continue and the site can
launch in delegated mode without waiting.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| OPERA environment answers drag | Delays the integration only | The simulator connector already carries the whole build, failure branches included |
| ~~OWS not licensed~~ | ~~Checkout loses instant confirmation~~ | **Closed.** OWS is licensed and running. Instant confirmation holds |
| OWS message shapes differ from our assumptions | A wrong namespace returns a fault, not an error: bookings fail and nothing says why | Namespaces and SOAP actions are configuration read from the environment, not constants. Filled from the WSDL the property exports; nothing ships assuming a shape we have not seen |
| No payment provider chosen | Nothing can be charged | The lifecycle, webhook, signature check and idempotency are built and tested behind a `PaymentProvider` seam. Choosing one is an adapter, not a rewrite — but it is paperwork with a lead time, so start it now |
| Two systems writing the same inventory | A direct booking and an OTA booking take the last room | OPERA stays the single source of truth; measure propagation latency to the channel manager rather than assuming it, and size the allotment buffer to it |
| SOAP integration underestimated | The integration overruns | The envelope, WS-Security, fault handling and redaction are written and unit-tested; what remains is mapping against the real configuration and certifying it, which is in scope rather than follow-on work |
| **One shared OPERA behind all three hotels** | A single outage takes the whole group offline, where three installations would have isolated it | ARI is pushed and stored, so search and browsing survive an outage; only reservation creation queues. This is why `InventorySnapshot` is not optional |
| A reservation succeeds while the response is lost | Two reservations for one guest, discovered at check-in | Every retry looks the reservation up by our own reference before creating, and adopts an existing one. Tested against a simulator failure mode built for exactly this |
| ARI sync latency causes oversell | Guest-facing failure and a refund | Allotment buffer, stop-sell threshold, and a mandatory live `quote()` before payment |
| A locale's content lags English at launch | Half-translated site that looks broken and gets indexed as a mixture | The publish gate blocks enabling a locale until UI strings and published content are complete; machine pre-fill plus agency import keeps the review effort tractable across seven languages |
| Translation cost scales with seven locales | Budget overrun, or locales that never launch | Locales are enabled one at a time on their own schedule; English ships alone if needed, and each additional language is an independent decision with no engineering cost |
| No professional photography | Undermines the entire design approach | Flagged now: this design is photography-led, and stock imagery will cap the result well below "world class" |
| Payment provider onboarding | Blocks Phase 3 completion | Start Paymob merchant onboarding during Phase 1 — it is paperwork with a lead time, not engineering |

## Open decisions

1. **Is the OWS component licensed and installed?** The one remaining integration question,
   and the one that decides whether checkout ends with a real confirmation number or with
   "we are confirming your stay". An internal check, since we administer the environment,
   plus an Oracle quote if it is missing.
2. **The real group name.** Two of the three resorts carry Fantazia and one is Sirena, so
   the parent brand is currently a stand-in in the design.
3. **Measured propagation latency** from a direct booking in OPERA to the channel manager.
   Testable on our own environment before launch; it sizes the allotment buffer.
5. Real hotel names, cities, and brand identity — currently placeholders in the seed data,
   changeable from admin without a deploy.
6. **Which locales launch first, and in what order.** English is the default and ships with
   Phase 1. Arabic is built in Phase 0 to prove RTL. The remaining five are a commercial
   decision with no engineering dependency — suggested by inbound market size: German,
   Russian, French, Italian, Spanish.
7. Whether machine pre-fill (DeepL or Google) is acceptable as a first pass before human
   review, and whether an external translation agency will be used.
8. Payment provider confirmation (Paymob assumed) and merchant onboarding start date.
9. Photography: commissioned or stock. This determines the ceiling on visual quality.
