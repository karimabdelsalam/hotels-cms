# Hotels CMS — Egyptian Hotel Group Platform

One group website + one central multi-property booking experience + multiple property
management/distribution systems behind it.

This repository is the corporate website, CMS, and central booking platform for a hotel
group operating in Egypt. It is a **multi-property platform from day one** — adding a
fourth hotel is a configuration and integration task, not a new software project.

## Status

**Phase 0 — Architecture & design direction.** No application code yet. The documents in
`docs/` are the deliverable currently under review.

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
- **Distribution is pluggable.** The booking path is a per-hotel configuration behind one
  `PropertyConnector` interface. Confirmed target: **one multi-property OPERA 5.6
  on-premise** installation with OXI licensed, reached through a channel manager
  (SiteMinder, STAAH, or SmartHOTEL). No network access to the hotel is required on that
  path.
- **Colour carries the identity, not photography.** A saturated Lapis & Gold palette and a
  gold lattice graphic device, so the site is complete and reviewable before the photo
  shoot.

## Reference

The information architecture of a hotel-group website (group discovery → property →
direct booking) was studied from rotana.com. Branding, assets, copy, and UI are original.
