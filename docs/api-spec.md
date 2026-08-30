# API Specification

Three namespaces with different auth and different caching:

| Namespace | Auth | Caching |
| --- | --- | --- |
| `/api/v1/*` | none (public) | CDN + Redis, aggressive |
| `/api/v1/bookings/*`, `/api/v1/payments/*` | session or booking token | never cached |
| `/api/v1/admin/*` | staff JWT + RBAC | never cached |

Conventions: `Accept-Language` or `?locale=` selects any **enabled** locale; an unknown or
disabled code falls back to the default (`en`) rather than erroring. Money is integer minor
units plus an explicit `currency`. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.
Errors follow RFC 9457 `application/problem+json`. Every response carries
`X-Correlation-Id`.

## 1. Content (public, cached)

```http
GET  /api/v1/destinations
GET  /api/v1/destinations/{slug}
GET  /api/v1/hotels?destination=&amenities=&page=
GET  /api/v1/hotels/{slug}
GET  /api/v1/hotels/{slug}/rooms
GET  /api/v1/hotels/{slug}/restaurants
GET  /api/v1/hotels/{slug}/venues
GET  /api/v1/offers?hotel=&destination=
GET  /api/v1/offers/{slug}
GET  /api/v1/pages/{key}
GET  /api/v1/locales                # enabled locales only: code, endonym, direction
```

`GET /api/v1/hotels/{slug}` returns content plus `bookingMode` and `capabilities`, so the
site knows whether to render a native booking CTA or a delegated handoff without a second
request.

## 2. Search & availability

```http
POST /api/v1/search
```
```jsonc
{
  "destination": "cairo",        // or "hotel": "nile-tower", or omitted = all hotels
  "checkIn": "2026-11-12",
  "checkOut": "2026-11-15",
  "rooms": [{ "adults": 2, "children": 1, "childAges": [7] }],
  "promoCode": "AUTUMN25",
  "currency": "EGP",
  "locale": "ar"
}
```

Response groups by hotel, as the brief requires:

```jsonc
{
  "correlationId": "…",
  "nights": 3,
  "results": [
    {
      "hotel": { "slug": "nile-tower", "name": "…", "city": "…", "starRating": 5,
                 "image": {…}, "bookingMode": "native" },
      "lowestNightlyRate": { "amount": 480000, "currency": "EGP" },
      "options": [
        {
          "roomType": { "id": "…", "name": "Deluxe Nile View", "maxOccupancy": 3 },
          "ratePlan": { "id": "…", "name": "Bed & Breakfast", "mealPlan": "BB" },
          "cancellationPolicy": { "type": "free_until", "text": "…", "freeUntil": "2026-11-09" },
          "price": { "roomTotal": 1440000, "taxes": 201600, "fees": 0,
                     "total": 1641600, "currency": "EGP" },
          "nightlyRates": [ { "date": "2026-11-12", "amount": 480000 }, … ],
          "roomsLeft": 3,
          "offerApplied": { "slug": "autumn-escape", "title": "…" }
        }
      ]
    },
    {
      "hotel": { "slug": "coast-resort", "bookingMode": "delegated" },
      "indicativeFrom": { "amount": 390000, "currency": "EGP" },
      "handoffUrl": "https://…?propertyCode=…&checkIn=…"
    }
  ],
  "unavailable": [ { "hotel": "…", "reason": "no_availability" } ],
  "degraded":    [ { "hotel": "…", "reason": "integration_unavailable" } ]
}
```

`degraded` is separate from `unavailable` on purpose. "We could not check" and "there are
no rooms" are different facts, and conflating them hides outages from both the guest and
the dashboard.

```http
POST /api/v1/availability      # single property, deeper detail
GET  /api/v1/search/suggest    # typeahead over destinations + hotels, per locale
```

## 3. Booking

```http
POST /api/v1/bookings/validate     # live quote; returns priceChanged diff if any
POST /api/v1/bookings              # create DRAFT + hold; returns reference + holdExpiresAt
GET  /api/v1/bookings/{reference}  # requires bookingToken or email match
POST /api/v1/bookings/{reference}/cancel
POST /api/v1/bookings/{reference}/lookup   # email + reference → short-lived bookingToken
```

`POST /bookings/validate` returns either `{"valid": true, "quote": {…}}` or
`{"valid": false, "reason": "price_changed", "previous": {…}, "current": {…}}`. The client
must surface a changed price and require explicit re-confirmation. Silently repricing at
checkout is how a booking site earns a chargeback.

All mutating booking endpoints accept `Idempotency-Key`.

## 4. Payments

```http
POST /api/v1/payments/create     # → hosted checkout URL, idempotent
POST /api/v1/payments/verify     # client-side status poll after redirect
POST /api/v1/payments/webhook/{provider}   # signature-verified, the source of truth
```

The webhook endpoint is exempt from CSRF, rate-limited separately, and verifies signature
before parsing a body it will act on.

## 5. Admin

```http
POST   /api/v1/admin/auth/login          # → requires TOTP challenge
POST   /api/v1/admin/auth/totp
POST   /api/v1/admin/auth/refresh

GET    /api/v1/admin/hotels
POST   /api/v1/admin/hotels
PUT    /api/v1/admin/hotels/{id}
POST   /api/v1/admin/hotels/{id}/publish
GET    /api/v1/admin/hotels/{id}/translations/{locale}
PUT    /api/v1/admin/hotels/{id}/translations/{locale}

CRUD   /api/v1/admin/{destinations|room-types|rate-plans|offers|restaurants|venues|pages|media}

# Locales and translations — full contract in i18n.md §8
GET    /api/v1/admin/locales
POST   /api/v1/admin/locales
POST   /api/v1/admin/locales/{code}/enable        # runs the publish gate
GET    /api/v1/admin/translations?locale=&namespace=&status=
POST   /api/v1/admin/translations/import          # dry-run diff, then commit
GET    /api/v1/admin/translations/export?locale=&format=json|csv|xliff
POST   /api/v1/admin/translations/publish

GET    /api/v1/admin/bookings?hotel=&status=&from=&to=
GET    /api/v1/admin/bookings/{id}
POST   /api/v1/admin/bookings/{id}/retry-reservation
POST   /api/v1/admin/bookings/{id}/attach-external-reference
POST   /api/v1/admin/bookings/{id}/refund

GET    /api/v1/admin/integrations
GET    /api/v1/admin/integrations/{hotelId}/health
POST   /api/v1/admin/integrations/{hotelId}/test
POST   /api/v1/admin/integrations/{hotelId}/sync
GET    /api/v1/admin/integrations/{hotelId}/mappings
PUT    /api/v1/admin/integrations/{hotelId}/mappings
GET    /api/v1/admin/integrations/{hotelId}/logs

GET    /api/v1/admin/reports/{overview|revenue|occupancy|sources|conversion}
GET    /api/v1/admin/arrivals?date=
GET    /api/v1/admin/departures?date=

CRUD   /api/v1/admin/users
GET    /api/v1/admin/audit-log
```

Every admin list endpoint is automatically hotel-scoped by the caller's
`UserHotelAccess`. Scoping is applied in the data layer, not the controller — see
`authorization.md`.

`GET /admin/integrations/{hotelId}/health` returns circuit state, last successful sync, error
rate, p95 latency, and the last error summary. It never returns endpoints, credentials, or
credential references.

## 6. Rate limits

| Endpoint group | Limit |
| --- | --- |
| Content reads | 120 / min / IP |
| `POST /search` | 30 / min / IP |
| `POST /bookings*`, `POST /payments/create` | 10 / min / session |
| `POST /bookings/{ref}/lookup` | 5 / 15 min / IP — brute-force surface |
| Admin login | 5 / 15 min / IP, then account lock |
| Webhooks | 600 / min / provider IP range |
