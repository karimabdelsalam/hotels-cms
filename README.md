# Hotels CMS — Egyptian Hotel Group Platform

One group website + one central multi-property booking experience + one OPERA behind it.

This repository is the corporate website, CMS, and central booking platform for a resort
group on the Red Sea coast at **Marsa Alam** — Fantazia Resort, Fantazia Royal, and Sirena
Resort. It is a **multi-property platform from day one**: adding a fourth resort, in this
destination or another, is a configuration and integration task rather than a new software
project.

## Status

**Phase 1 — content site and CMS model.** The public site runs against a real database.
The booking engine and OPERA integration are deliberately last; nothing built so far
assumes them.

Working today: the full public site — bilingual routing with RTL, database-driven
navigation, resorts, experiences, offers, diving, weddings, content pages, and SEO — plus
the admin portal with sign-in, role-based access, per-language content editing, and the
site-section switches.

## Running it

```bash
pnpm install
createdb fantazia                 # or point DATABASE_URL at any Postgres 16
cp .env.example .env
pnpm db:push && pnpm db:seed
pnpm --filter @fantazia/web dev     # http://localhost:3000 -> /en
pnpm --filter @fantazia/admin dev   # http://localhost:3001
```

Dev sign-in for the admin (seeded, development only):

| Account | Password | Sees |
| --- | --- | --- |
| `admin@fantazia.test` | `fantazia-dev` | Every resort, every section |
| `sirena@fantazia.test` | `fantazia-dev` | Sirena Resort only |

The second account exists so the tenancy rules are exercised rather than assumed.

`pnpm db:reset` rebuilds and reseeds. `pnpm db:studio` opens Prisma Studio.

## Layout

```
apps/web          Next.js 15 - public site, App Router, next-intl
apps/admin        Next.js 15 - staff portal, own hostname, noindex
packages/db       Prisma schema, seed, and typed content queries
docs/             Architecture, data model, integration, design, runbooks
docs/design/      Standalone design mockups
```

## Documents

| Document | What it covers |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | System architecture, technology stack, layering, folder structure |
| [`docs/data-model.md`](docs/data-model.md) | Central database schema, ERD, i18n strategy |
| [`docs/property-integration.md`](docs/property-integration.md) | The `PropertyConnector` abstraction, booking modes, OPERA / channel-manager / third-party paths |
| [`docs/booking-lifecycle.md`](docs/booking-lifecycle.md) | Booking and payment state machines, failure handling, idempotency |
| [`docs/api-spec.md`](docs/api-spec.md) | Public, guest, and admin API contracts |
| [`docs/i18n.md`](docs/i18n.md) | Admin-managed locales, translation workflow, routing and SEO for up to 7 languages |
| [`docs/authorization.md`](docs/authorization.md) | Multi-property tenancy, roles, permission matrix, enforcement |
| [`docs/site-structure.md`](docs/site-structure.md) | Page types, the full route map, and the menu system |
| [`docs/opera-provisioning-runbook.md`](docs/opera-provisioning-runbook.md) | **Step-by-step setup for the PMS team** — what to configure, export, and hand back |
| [`docs/design-system.md`](docs/design-system.md) | Design direction, tokens, typography, multi-script and RTL rules, component system |
| [`docs/roadmap.md`](docs/roadmap.md) | Delivery phases, dependencies, risks |

## Key decisions already made

- **Stack:** TypeScript monorepo — Next.js 15 (public site + admin) and NestJS (API,
  booking engine, integrations), PostgreSQL, Prisma, Redis.
- **Languages:** English is the default and source language. Additional locales — up to
  seven — are added, translated, and published from the admin panel with no deploy. RTL is a
  per-locale property, not an Arabic special case.
- **Hotels are data, never code.** Every property, destination, room type, and offer is a
  database entity managed from the admin panel.
- **Homepage sections are feature flags.** `SiteModule` switches each section on, off, and
  into order from admin. Destinations is off today — three resorts, one destination — and
  switches on the day a fourth opens elsewhere.
- **Menus are data, and point at content rather than URLs.** Rename a resort or change its
  slug and every menu follows in every language; an item whose target is unpublished or
  switched off hides itself instead of becoming a broken link.
- **Our own booking engine, on OPERA directly.** The checkout stays inside our design.
  Target: **one multi-property OPERA 5.6 on-premise** installation, with **OXI** feeding
  inventory continuously and **OWS** carrying the transaction. A channel manager stays in
  place for OTA distribution, not for direct booking. We administer the Oracle environment
  ourselves, so interface configuration is in-house rather than queued behind a partner.
- **Cinematic, three colours, motion-led.** Ink, bone, and one sand accent; a video hero
  and scroll-driven motion carry the design rather than a large palette.

## Reference

The information architecture of a hotel-group website (group discovery → property →
direct booking) was studied from rotana.com. Branding, assets, copy, and UI are original.
