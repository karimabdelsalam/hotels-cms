# Delivery Roadmap

## The organising principle

**Everything through Phase 4 is built against the mock connector.** The website, booking
engine, payment flow, and admin portal can be complete and demo-ready before a single
decision is made about channel managers, OPERA licensing, or VPN access.

This matters because the integration decision is the one thing genuinely outside our
control — it depends on hotel IT, vendor contracts, and Oracle licensing. Sequencing it
first would idle the project for weeks. Sequencing it late costs nothing, because the
`PropertyConnector` interface is the same either way.

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
`PropertyConnector` interface and the mock connector with failure injection. Inventory
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

### Phase 4 — Real property integration · ~3–4 weeks, **externally gated**
Build `ChannelManagerConnector` against the selected vendor. Resort-code and rate/room code
mapping UI, ARI push ingestion, two-stage confirmation with reconciliation, health
monitoring, per-property rollout.

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
| Vendor selection drags | Delays Phase 4 only | Mock connector unblocks everything else; delegated mode is a working launch path |
| CM contract excludes a direct-booking API | The checkout becomes the vendor's UI, not ours — the design stops at the Book button | Make it a selection criterion between SiteMinder, STAAH, and SmartHOTEL rather than a discovery after signing |
| **One shared OPERA behind all three hotels** | A single outage takes the whole group offline, where three installations would have isolated it | ARI is pushed and stored, so search and browsing survive an outage; only reservation creation queues. This is why `InventorySnapshot` is not optional |
| OPERA confirmation number never arrives over OXI | Guest holds a confirmed booking the hotel cannot see | Reconciliation job flags any booking missing its PMS number past a threshold, as an admin queue |
| ARI sync latency causes oversell | Guest-facing failure and a refund | Allotment buffer, stop-sell threshold, and a mandatory live `quote()` before payment |
| A locale's content lags English at launch | Half-translated site that looks broken and gets indexed as a mixture | The publish gate blocks enabling a locale until UI strings and published content are complete; machine pre-fill plus agency import keeps the review effort tractable across seven languages |
| Translation cost scales with seven locales | Budget overrun, or locales that never launch | Locales are enabled one at a time on their own schedule; English ships alone if needed, and each additional language is an independent decision with no engineering cost |
| No professional photography | Undermines the entire design approach | Flagged now: this design is photography-led, and stock imagery will cap the result well below "world class" |
| Payment provider onboarding | Blocks Phase 3 completion | Start Paymob merchant onboarding during Phase 1 — it is paperwork with a lead time, not engineering |

## Open decisions

1. **Which channel manager, and does the contract include a booking-engine / connectivity
   API for third-party direct booking** — as distinct from their own hosted booking engine?
   The single highest-value question in the project: it decides whether the checkout is ours
   or the vendor's.
2. **Are reservation modification and cancellation available through that API**, or only
   creation? Sets the capability flags and whether guests can self-serve.
3. **How are direct-channel rate plans scoped**, separately from OTA rates?
4. **Is multi-property supported on one CM account**, with all three resort codes under one
   set of credentials?
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
