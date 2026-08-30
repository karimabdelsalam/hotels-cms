# Architecture

## 1. Guiding constraints

Four constraints drive every decision below.

1. **Multi-property from day one.** Nothing may assume a single hotel, a shared room-type
   catalogue, or identical policies. Adding Hotel D is configuration.
2. **The distribution backend is not yet decided.** It may be a channel manager, OPERA
   directly, or a third-party booking engine — and it may differ per hotel. The
   architecture must not bet on one.
3. **SEO is a primary revenue channel.** Group site, destination pages, hotel pages, and
   offer landing pages must all be independently indexable, server-rendered, and fast.
4. **English default, up to seven admin-managed locales.** Languages are database rows, not
   a constant in the source. Adding one is a content operation with no deploy. RTL is a
   per-locale property, so Arabic needs no special case and Hebrew or Persian would need no
   new work. This is a content, routing, data-model, and layout concern simultaneously, so
   it is designed in rather than bolted on. See `i18n.md`.

## 2. System layers

```
                         Guest (web, mobile web)
                                   │
                    ┌──────────────┴──────────────┐
                    │      apps/web  (Next.js)    │   SSR / ISR, i18n, SEO
                    │  public site + booking flow │
                    └──────────────┬──────────────┘
                                   │  HTTPS (BFF route handlers)
                                   ▼
          ┌────────────────────────────────────────────────┐
          │              apps/api  (NestJS)                │
          │                                                │
          │  content │ search │ booking │ payments │ auth   │
          │  reporting │ notifications │ integrations       │
          └───────┬──────────────┬─────────────────┬───────┘
                  │              │                 │
        ┌─────────▼──────┐ ┌─────▼──────┐ ┌────────▼─────────┐
        │  PostgreSQL    │ │   Redis    │ │ Property         │
        │  central DB    │ │ cache +    │ │ Integration      │
        │                │ │ BullMQ     │ │ Layer            │
        └────────────────┘ └────────────┘ └────────┬─────────┘
                                                   │
                             ┌─────────────────────┼─────────────────────┐
                             ▼                     ▼                     ▼
                    ChannelManagerConnector  OperaOwsConnector   DelegatedBEConnector
                             │                     │                     │
                             ▼                     ▼                     ▼
                    Channel Manager          Hotel OPERA 5.6      Third-party booking
                    (SiteMinder/D-EDGE/…)    (on-premise, VPN)    engine (redirect)
                             │                     │
                             └──────► Hotel A / B / C OPERA ◄────┘

                    ┌──────────────────────────┐
                    │  apps/admin  (Next.js)   │  separate deploy, IP-restricted
                    │  group + hotel dashboards│
                    └──────────────┬───────────┘
                                   └──────────► apps/api (admin namespace)
```

### Why the API is a separate deployable

The single strongest reason: **OPERA 5.6 is on-premise.** Reaching it means a long-lived
process inside a network that has site-to-site VPN or private links to each hotel. That is
not a serverless workload. Separating `apps/api` also gives us:

- Queues and scheduled ARI syncs that must survive between HTTP requests.
- Integration credentials that never sit in the same process as public page rendering.
- Independent scaling: content traffic is spiky and cacheable; booking traffic is not.
- The option to later extract a connector into an on-premise gateway per hotel without
  touching the booking engine.

The public site still talks to the API through Next.js route handlers acting as a thin
BFF, so the browser never holds an API credential and we keep one origin.

### Why admin is a separate app

`apps/admin` is its own Next.js application on its own hostname. It can be IP-restricted
or put behind a VPN without affecting the public site, it carries a separate cookie/session
scope, and none of its bundle or dependency surface ships to guests.

## 3. Technology stack

| Concern | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | Shared types between web, admin, and API; cached task graph |
| Public site | Next.js 15 (App Router), React 19 | SSR/ISR for SEO, streaming, per-route caching |
| Admin | Next.js 15 (App Router), React 19 | Same toolchain and design system, separate deploy |
| Styling | Tailwind CSS v4 + CSS custom properties | Logical properties make RTL nearly free; tokens live in CSS |
| i18n | `next-intl` + ICU MessageFormat | Locale routing and `dir` handling; catalogues are compiled from the database, not shipped as static files |
| API | NestJS 11 | Module boundaries and DI match the layering the brief asks for; strategy pattern for connectors is native |
| Database | PostgreSQL 16 | Relational integrity for bookings, JSONB where useful, strong full-text |
| ORM | Prisma | Typed client shared across apps; migrations; extension hook for tenancy filtering |
| Cache / queues | Redis + BullMQ | Short-lived ARI cache, idempotency keys, rate limits, retryable reservation jobs |
| Object storage | S3-compatible (R2 / MinIO) | Media library; signed uploads from admin |
| Images | Next/Image + upstream optimizer | AVIF/WebP, responsive sets, LQIP placeholders |
| Auth (staff) | Passport JWT + argon2 + TOTP | Access/refresh tokens, mandatory 2FA for admin roles |
| Auth (guest) | Reference + email magic link | No guest accounts at MVP; upgradeable to full accounts for loyalty |
| Payments | Provider abstraction, Paymob first | Egyptian market coverage, hosted/tokenised flow only |
| Validation | Zod, shared package | One schema drives API validation, forms, and types |
| Observability | pino + OpenTelemetry + Sentry | Correlation ID per booking attempt end to end |
| Testing | Vitest, supertest, Playwright | Unit, API contract, and booking-flow e2e |
| Deploy | Docker images, Compose → Kubernetes | API must sit near the VPN; web/admin portable |

### Deliberate non-choices

- **No dedicated search engine.** Three properties do not justify Elasticsearch. Postgres
  full-text with per-locale configurations is sufficient and reversible.
- **No headless CMS SaaS.** Content is tightly coupled to bookable entities (room types,
  rate plans, offers). Splitting them across two systems creates a sync problem worse than
  the admin UI it saves.
- **No microservices.** One API with strict module boundaries. Boundaries are enforced by
  lint rules and module imports, not by network calls we would have to operate.

## 4. Module boundaries inside the API

Each module owns its tables and exposes a service interface. Cross-module access goes
through services, never through another module's repository.

| Module | Owns | Must not |
| --- | --- | --- |
| `content` | Hotels, destinations, rooms, restaurants, venues, offers, pages, media | Know anything about OPERA or payments |
| `i18n` | Locale registry, UI string catalogue, translation workflow, bundle compilation | Contain any hard-coded list of languages |
| `search` | Group and property availability search, result assembly, cache reads | Write bookings |
| `booking` | Holds, booking records, lifecycle state machine, idempotency | Call connectors directly (goes via `reservation`) |
| `reservation` | Orchestrates external reservation create/modify/cancel, retries, reconciliation | Handle HTTP requests |
| `payments` | Payment provider abstraction, webhooks, refunds | Know which PMS a hotel uses |
| `integrations` | `PropertyConnector` implementations, credentials, health, ARI sync | Contain booking business rules |
| `auth` | Staff users, roles, sessions, guest lookup tokens | Be bypassed by any admin route |
| `reporting` | Read-model aggregation for dashboards | Write to operational tables |
| `notifications` | Email/SMS/WhatsApp templates and dispatch | Decide when a booking is confirmed |

The rule that keeps this honest: **no OPERA-, channel-manager-, or provider-specific type
may appear outside `integrations` and `payments`.** Everything else speaks the normalised
domain model.

## 5. Folder structure

```
hotels-cms/
├── apps/
│   ├── web/                        # Public multi-locale site
│   │   ├── app/
│   │   │   ├── [locale]/
│   │   │   │   ├── (marketing)/    # home, about, contact, destinations
│   │   │   │   ├── hotels/[slug]/  # property pages + rooms, dining, events
│   │   │   │   ├── offers/[slug]/
│   │   │   │   ├── search/         # group + property availability results
│   │   │   │   ├── book/           # rooms → guest → extras → review → pay
│   │   │   │   └── my-booking/     # lookup, view, cancel
│   │   │   ├── api/                # BFF route handlers (server-only)
│   │   │   ├── sitemap.ts
│   │   │   └── robots.ts
│   │   ├── components/
│   │   ├── messages/               # en.json — SOURCE catalogue of keys only;
│   │   │                           #   other locales are compiled from the database
│   │   └── lib/
│   ├── admin/                      # Staff portal
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── dashboard/          # group and per-hotel
│   │   │   ├── hotels/             # content management
│   │   │   ├── bookings/
│   │   │   ├── offers/
│   │   │   ├── integrations/       # mapping + health
│   │   │   ├── media/
│   │   │   ├── translations/       # locale registry + Translation Manager
│   │   │   └── users/
│   │   └── components/
│   └── api/                        # NestJS
│       └── src/
│           ├── modules/
│           │   ├── content/
│           │   ├── i18n/           # locales, strings, import/export, bundles
│           │   ├── search/
│           │   ├── booking/
│           │   ├── reservation/
│           │   ├── payments/
│           │   │   └── providers/  # paymob/, mock/
│           │   ├── integrations/
│           │   │   ├── connectors/ # channel-manager/, opera-ows/, delegated/, mock/
│           │   │   ├── ari-sync/
│           │   │   └── health/
│           │   ├── auth/
│           │   ├── reporting/
│           │   └── notifications/
│           ├── common/             # guards, interceptors, filters, tenancy
│           └── main.ts
├── packages/
│   ├── db/                         # Prisma schema, migrations, seed, client
│   ├── contracts/                  # Zod schemas + inferred types (shared)
│   ├── ui/                         # Design system components and tokens
│   ├── i18n/                       # Locale resolution, ICU formatters, RTL helpers
│   └── config/                     # eslint, tsconfig, tailwind presets
├── docs/
└── infra/                          # Dockerfiles, compose, k8s manifests
```

## 6. Caching strategy

| Layer | What | TTL | Invalidation |
| --- | --- | --- | --- |
| CDN | Marketing pages, images, static assets | long | Deploy + on-demand purge on publish |
| ISR | Hotel, destination, offer pages | 5 min | Tag-based revalidation on content publish |
| Redis | Availability and rates per hotel/date-range/occupancy | 3–10 min, per connector | ARI push, manual flush, booking creation |
| Redis | Compiled translation bundles, one per locale | until publish | String edit or locale publish; versioned by hash |
| Redis | Idempotency keys | 24 h | Expiry only |
| Postgres | Nothing cached; source of truth for bookings and content | — | — |

**The non-negotiable rule:** the cache serves discovery and browsing. Before a reservation
is created, availability and price are re-validated live against the connector. A cached
price is never the price the guest pays.

## 7. Failure posture

Every connector call is wrapped in the same envelope: timeout, bounded retries with
exponential backoff and jitter, a circuit breaker per hotel, and structured logging with a
correlation ID. When a property's integration is open-circuit:

- Search **excludes** that property and records why, rather than showing it as sold out.
- The property page stays fully browsable and switches its CTA to an enquiry form.
- Admin integration health shows the breaker state and the last error, with credentials
  redacted.

One property being down never degrades the group site.

## 8. Security posture

- HTTPS only; HSTS; secure, `SameSite=Lax`, HTTP-only cookies.
- Integration and payment credentials in a secret manager, encrypted at rest, never in the
  central DB in plaintext and never serialised to any API response.
- Admin: mandatory TOTP 2FA, IP allowlist option, short sessions, full audit log.
- Public API: per-IP and per-session rate limits, stricter on search and booking creation.
- Payments: hosted/tokenised flow only. No card data touches our infrastructure or logs.
- Webhooks: signature verification and replay protection before any state change.
- Prisma tenancy extension enforces hotel scoping at the query layer so a forgotten filter
  in a controller cannot leak another property's data.
