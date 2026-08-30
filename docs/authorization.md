# Multi-Property Tenancy & Authorization

## 1. The scoping model

Every property is logically isolated. Isolation is expressed by one table:

```
UserHotelAccess(user_id, hotel_id)
```

Resolution rule:

- A user whose role is **group-level** (`SUPER_ADMIN`, `GROUP_ADMIN`) and who has **no** rows
  in `UserHotelAccess` → scope is **all hotels**.
- Any other user → scope is exactly the hotels listed in their rows. Zero rows means zero
  access, not all access.

Single-tenant database with row-level scoping, not a database per hotel. Three properties
under one owner sharing one content model, one booking engine, and one reporting surface do
not justify the operational cost of schema-per-tenant — and group-wide search across
separate schemas would be a permanent tax on the platform's core feature.

## 2. Roles

| Role | Scope | Purpose |
| --- | --- | --- |
| `SUPER_ADMIN` | group | Platform owner. User management, integrations, all settings |
| `GROUP_ADMIN` | group | Business owner. All hotels, all content, all reports; no user or integration credential management |
| `HOTEL_ADMIN` | hotel(s) | Full control of assigned properties only |
| `RESERVATION_AGENT` | hotel(s) | Bookings: view, modify, cancel, refund, resolve exceptions. No content |
| `CONTENT_MANAGER` | hotel(s) or group | Content, media, offers, SEO. No bookings, no guest data |
| `TRANSLATOR` | group | Translation Manager and entity translation tabs only. No bookings, no guests, no pricing, no publishing |
| `FINANCE` | group | Payments, refunds, revenue reports. Read-only on bookings |
| `READ_ONLY` | hotel(s) or group | Dashboards and reports only |

## 3. Permission matrix

`—` none · `R` read · `W` create/update · `X` execute action

| Resource | SUPER | GROUP | HOTEL | AGENT | CONTENT | TRANS | FINANCE | READ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hotels (content) | RW | RW | RW | R | RW | — | R | R |
| Destinations | RW | RW | R | — | RW | — | — | R |
| Room types | RW | RW | RW | R | RW | — | — | R |
| Rate plans | RW | RW | RW | R | R | — | R | R |
| Offers | RW | RW | RW | R | RW | — | R | R |
| Media | RW | RW | RW | — | RW | — | — | R |
| Pages / SEO | RW | RW | R | — | RW | — | — | R |
| Content translations | RW | RW | RW | — | RW | RW | — | R |
| UI strings | RW | RW | — | — | RW | RW | — | — |
| Locale registry | RWX | RWX | — | — | — | R | — | R |
| Locale enable/publish | X | X | — | — | — | — | — | — |
| Bookings | RWX | RW | RW | RWX | — | — | R | R |
| Booking refunds | X | X | X | X | — | — | X | — |
| Reservation exceptions | X | X | X | X | — | — | — | — |
| Guest personal data | R | R | R | R | — | — | R | — |
| Payments | R | R | R | R | — | — | RX | — |
| Integrations (config) | RWX | R | R | — | — | — | — | — |
| Integration health/logs | R | R | R | R | — | — | — | R |
| Integration credentials | W | — | — | — | — | — | — | — |
| Users & roles | RWX | R | — | — | — | — | — | — |
| Reports | R | R | R | R | — | — | R | R |
| Audit log | R | R | R | — | — | — | R | — |

Two entries carry most of the weight. **Integration credentials are writable by
`SUPER_ADMIN` only and readable by no one** — they can be replaced, never retrieved.
**`CONTENT_MANAGER` has no access to guest personal data**, which keeps the largest and most
frequently-onboarded role outside the personal-data boundary entirely.

`TRANSLATOR` exists for the same reason at a smaller scale. Running seven locales means
giving accounts to outside translation agencies, and a role that can read and write text but
cannot see a booking, a guest, a rate, or a report is the difference between that being
routine and being a risk. Translators also cannot enable or publish a locale — writing the
words and deciding a language goes live are separate jobs.

## 4. Enforcement — three layers

Defence in depth, because a single forgotten `where` clause is a cross-property data leak.

**Layer 1 — Route guard.** A NestJS guard reads the required permission from a decorator
and rejects at the edge.

```ts
@RequirePermission('bookings:write')
@Patch('bookings/:id')
```

**Layer 2 — Resource scope guard.** For any route carrying a hotel-bound resource, the
guard resolves that resource's `hotel_id` and asserts it is inside the caller's scope
before the handler runs.

**Layer 3 — Query-layer scoping (the one that actually saves you).** A Prisma client
extension reads the request-scoped tenancy context and injects
`hotel_id IN (:scope)` into every query on a hotel-scoped model.

```ts
prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, args, query }) {
        const scope = tenancyContext.get();
        if (isHotelScoped(model) && !scope.isGroupWide) {
          args.where = { AND: [args.where ?? {}, { hotelId: { in: scope.hotelIds } }] };
        }
        return query(args);
      }
    }
  }
});
```

A developer who forgets a filter in a new admin endpoint still cannot read another
property's data. Public site queries run through a separate unscoped client that can only
reach published content — the two clients are distinct injectables so the wrong one cannot
be reached by accident.

## 5. Guest authentication

No guest accounts at MVP.

**My Booking** = booking reference + the email on the booking → a short-lived (30 min),
single-purpose signed token scoped to that one booking. Rate-limited at 5 attempts per 15
minutes per IP, because reference + email is a guessable pair at scale and this is the only
public endpoint that returns personal data.

`Guest` already exists as its own entity, so accounts, saved preferences, and loyalty
membership are additive later rather than a migration of the booking table.

## 6. Staff authentication

- Argon2id password hashing.
- **Mandatory TOTP 2FA** for `SUPER_ADMIN`, `GROUP_ADMIN`, `HOTEL_ADMIN`, and `FINANCE`.
- Access token 15 min, refresh token 7 days, rotating with reuse detection.
- Account lock after 5 failed attempts; unlock is an audited admin action.
- Optional IP allowlist on the admin hostname.
- Every mutation writes to `AuditLog` with before/after state, actor, IP, and user agent.

## 7. What is never exposed

- OPERA, channel-manager, and payment credentials — not in any API response, not in logs,
  not in error messages, not in integration health output.
- Another property's bookings, guests, rates, or reports, to any hotel-scoped user.
- Guest personal data to `CONTENT_MANAGER`, `TRANSLATOR`, or `READ_ONLY`.
- Internal `hotel_id`, connector type, or endpoint on any public endpoint.
