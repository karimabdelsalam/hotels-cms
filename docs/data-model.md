# Central Data Model

The central database is the source of truth for **content, guests, offers, and our own
booking records**. It is deliberately *not* the source of truth for external reservation
state — that belongs to the property's system, and we store its reference.

## 1. Internationalisation strategy

**English is the default and source language, and locales are database rows** — see
`i18n.md` for the full locale registry, translation workflow, and admin flow. The schema
below supports up to seven active locales with no migration when one is added.

Translatable content lives in **translation tables**, not JSONB columns.

```
Hotel                     HotelTranslation
─────                     ────────────────
id                  1──∗  hotel_id
code                      locale_code   FK -> Locale.code
city_id                   name
status                    slug          UNIQUE (locale_code, slug)
latitude                  short_description
longitude                 description
...                       meta_title
                          meta_description
```

**Why tables and not JSONB:**

- Slugs must be unique **per locale** and indexed — `/en/hotels/nile-tower` and
  `/ar/hotels/burj-al-nil` are different rows with different SEO value.
- Postgres full-text search needs a per-locale configuration (`english` vs `arabic`
  dictionaries). You cannot index a JSONB blob per language usefully.
- Adding a locale is a data change, not a schema migration — which is the entire premise of
  admin-managed languages.
- Missing translations are visible and queryable, so admin can show a real per-locale
  completeness report and enforce the publish gate, instead of silently rendering English
  into a German page.

Cost: a join on nearly every content read. Accepted — those reads are ISR-cached.

Entities with translations: `Hotel`, `Destination`, `RoomType`, `RatePlan`, `Restaurant`,
`Venue`, `Offer`, `Amenity`, `Page`, `MediaAsset` (alt text), `CancellationPolicy`.

The `Locale` and `TranslationString` tables that govern all of this are specified in
`i18n.md`.

**Non-Latin slugs** (Arabic, Russian) are transliterated to Latin by default and editable in
admin. Percent-encoded non-Latin URLs are legal but hostile to sharing, analytics, and
backlinks.

## 2. Entity relationship overview

```
Destination ──1:∗── Hotel ──1:1── HotelIntegration
                      │
                      ├──1:∗── HotelTranslation
                      ├──1:∗── RoomType ──1:∗── RoomTypeTranslation
                      ├──1:∗── RatePlan ──∗:1── CancellationPolicy
                      │            └──∗:∗── RoomType   (RatePlanRoomType)
                      ├──1:∗── Restaurant
                      ├──1:∗── Venue
                      ├──1:∗── Amenity            (∗:∗ via HotelAmenity)
                      ├──1:∗── TaxRule
                      ├──1:∗── MediaAsset
                      └──1:∗── Offer              (hotel_id nullable = group-wide)

Guest ──1:∗── Booking ──1:∗── BookingRoom ──∗:1── RoomType
                 │                   └──∗:1── RatePlan
                 ├──1:∗── Payment
                 ├──1:∗── BookingEvent          (append-only audit)
                 └──0:1── BookingHold

User ──∗:∗── Role          (UserRole)
  └──∗:∗── Hotel           (UserHotelAccess — scoping)
Role ──∗:∗── Permission    (RolePermission)

Locale ──1:∗── TranslationString        (UI strings — see i18n.md)
  └──1:∗── every *Translation table      (content)

AuditLog, IntegrationLog, IdempotencyKey, InventorySnapshot  (operational)
```

## 3. Content entities

### Destination
`id · code · country · latitude · longitude · hero_media_id · display_order · status`
→ `DestinationTranslation(locale, name, slug, description, meta_title, meta_description)`

Destinations are entities, not an enum on `Hotel`. They own their own landing pages, hero
imagery, and SEO metadata, which the brief requires for organic acquisition.

### Hotel
`id · code · destination_id · star_rating · address · latitude · longitude · phone · email ·
check_in_time · check_out_time · currency · timezone · booking_mode · status ·
hero_media_id · created_at · updated_at`

`booking_mode` (`native` | `delegated`) is stored here and mirrors the connector's declared
capability. It drives the CTA the site renders.

`status`: `draft` | `published` | `archived`. Archived hotels keep their historical
bookings and stay resolvable at their URL with a 410 or a redirect — never a hard delete.

### RoomType
`id · hotel_id · external_code · max_adults · max_children · max_occupancy · size_sqm ·
bed_configuration · display_order · active`
→ translations, → `MediaAsset[]`, → `Amenity[]`

`external_code` is nullable until integration mapping is done, which lets content go live
before the connector exists.

### RatePlan
`id · hotel_id · external_code · meal_plan · cancellation_policy_id · min_stay · max_stay ·
advance_days · is_public · active`
→ translations, ∗:∗ `RoomType`

`is_public: false` covers corporate and negotiated rates reachable only via a corporate
code.

### CancellationPolicy
`id · hotel_id · type ('free_until' | 'non_refundable' | 'partial' | 'custom') ·
free_until_days · free_until_time · penalty_type · penalty_value`
→ translations (the human-readable text shown at checkout)

Policies are per hotel and referenced by rate plan, because the brief is explicit that
properties do not share policies.

### TaxRule
`id · hotel_id · name · type ('percentage' | 'fixed_per_night' | 'fixed_per_stay') · value ·
applies_to ('room' | 'total') · included_in_rate · valid_from · valid_to · active`

**No tax percentage is ever hard-coded.** Where the rate source returns authoritative
taxes, those win and these rules are used only for display estimates before a quote.

### Offer
`id · hotel_id (nullable → group-wide) · promo_code · discount_type · discount_value ·
valid_from · valid_to · booking_window_start/end · stay_window_start/end · min_nights ·
applicable_room_type_ids[] · applicable_rate_plan_ids[] · display_order · active`
→ translations (title, slug, description, terms)

Nullable `hotel_id` is what makes a single offer render on the group homepage and apply
across all properties.

### MediaAsset
`id · hotel_id (nullable) · storage_key · width · height · mime · blurhash · focal_x ·
focal_y · uploaded_by · created_at` → translations (alt text, caption)

`focal_x/focal_y` matter more than they look: every card in the design system crops the same
image to a different aspect ratio, and a face cropped out of frame is the most common way a
hotel site looks cheap.

### Page
`id · key · template · status · published_at` → translations (title, slug, body, SEO)

For About, Contact, Terms, Privacy, Careers — editable without a deploy.

## 4. Booking entities

### BookingHold
`id · hotel_id · session_id · payload (rooms, dates, occupancy) · quote_snapshot ·
expires_at · created_at`

Created when a guest enters checkout. Short TTL (15 minutes). Not an inventory hold in the
property's system unless the connector supports one — it is our own guard against stale
prices and double submission.

### Booking
`id · reference (UNIQUE) · hotel_id · guest_id · status · external_reservation_id ·
external_confirmation_number · check_in · check_out · nights · adults · children ·
child_ages[] · rooms_count · currency · room_total · taxes_total · fees_total ·
total_amount · payment_status · source · locale · promo_code · offer_id · special_requests ·
correlation_id · created_at · confirmed_at · cancelled_at`

`reference` is our human-facing code (e.g. `NLE-8F3K2P`), generated by us and stable.
`external_reservation_id` is the property's, stored verbatim, never regenerated.
`correlation_id` threads every log line for this booking attempt across all services.

### BookingRoom
`booking_id · room_type_id · rate_plan_id · adults · children · child_ages[] · quantity ·
nightly_rates (jsonb) · room_total · guest_name · external_line_id`

`nightly_rates` is stored as a per-date breakdown snapshot, not a single number. Without it
a modification or partial refund six weeks later cannot be priced, and neither can a
dispute be answered.

### BookingEvent (append-only)
`id · booking_id · type · from_status · to_status · actor_type · actor_id · payload ·
correlation_id · created_at`

Every transition is written here. This is what makes a payment/reservation inconsistency
investigable at 2am, and it is the audit trail finance will ask for.

### Payment
`id · booking_id · provider · provider_payment_id · idempotency_key (UNIQUE) · amount ·
currency · status · method · last4 · raw_response (jsonb, redacted) · created_at ·
captured_at`

Never any raw card data. `raw_response` is stored redacted for reconciliation.

### Guest
`id · first_name · last_name · email · phone · country · locale · marketing_consent ·
created_at`

No password at MVP. `email + booking reference` is the "My Booking" key. The table is
already shaped to grow an account and a loyalty membership later.

## 5. Access control entities

### User
`id · email · password_hash (argon2id) · first_name · last_name · totp_secret ·
totp_enabled · status · last_login_at · failed_attempts · locked_until`

### Role / Permission / UserRole / RolePermission / UserHotelAccess

`UserHotelAccess(user_id, hotel_id)` is the scoping table. **A user with zero rows and a
group-level role sees all hotels; a user with rows sees only those hotels.** Details and the
permission matrix are in `authorization.md`.

## 6. Operational entities

### HotelIntegration
`id · hotel_id · integration_type · endpoint · hotel_code · chain_code · environment ·
credential_ref · capabilities (jsonb) · enabled · last_sync_at · sync_status ·
circuit_state · last_error_at · last_error_summary`

`credential_ref` is a pointer into the secret manager — **never the credential**. Nothing in
this table may be serialised into any API response reachable from the public site.

### InventorySnapshot
`hotel_id · room_type_id · rate_plan_id · date · available_count · rate_amount · currency ·
restrictions (jsonb: min_stay, cta, ctd, stop_sell) · source · synced_at`
UNIQUE `(hotel_id, room_type_id, rate_plan_id, date)`

Populated by ARI sync for connectors without live availability. This is what makes fast
group-wide search across three properties possible at all — you cannot fan out live queries
to three OPERA installations on every homepage search and stay under a second.

### IdempotencyKey
`key (PK) · scope · request_hash · response_snapshot · status · created_at · expires_at`

Guards payment creation and reservation creation against double-clicks, refreshes, retries,
and duplicate webhooks.

### IntegrationLog
`id · hotel_id · connector · operation · correlation_id · request_summary ·
response_summary · status · duration_ms · error_code · created_at`

Summaries only, credentials redacted at write time. Surfaced in admin so the reservations
team can see *what* failed without seeing secrets.

### AuditLog
`id · user_id · action · entity_type · entity_id · before (jsonb) · after (jsonb) ·
ip_address · user_agent · created_at`

Every admin mutation. Required by the brief and by any future PCI or finance review.

## 7. Indexing notes

- `HotelTranslation (locale_code, slug)` UNIQUE — the primary public lookup.
- `TranslationString (namespace, key, locale_code)` UNIQUE; plus `(locale_code, status)` for
  the Translation Manager's completeness queries.
- `Booking (reference)` UNIQUE; `Booking (hotel_id, check_in)`; `Booking (status, created_at)`
  for dashboards and arrivals lists.
- `InventorySnapshot (hotel_id, date)` and the composite UNIQUE — search reads hit this
  constantly.
- `Payment (idempotency_key)` UNIQUE; `Payment (provider_payment_id)` for webhook lookup.
- GIN full-text indexes per locale on hotel and destination translations.
- Partial index on `Booking (status) WHERE status = 'NEEDS_MANUAL_REVIEW'` — the exception
  queue must be instant to read; it is the one that costs money when it is slow.

## 8. Money

All amounts are stored as **integer minor units** (piastres) with an explicit currency
column. No floats anywhere in the money path. EGP is the primary currency; the schema
carries currency per hotel and per booking so a second one can be added without migration.
