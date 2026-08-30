# Booking & Payment Lifecycle

The single most expensive failure in this system is **money taken without a reservation
created**. Everything below is arranged around making that state impossible to reach
silently, and trivial to recover from when it happens.

## 1. Booking state machine

```
                          ┌─────────┐
                          │  DRAFT  │  hold created, quote snapshot taken
                          └────┬────┘
                               │ guest submits details
                               ▼
                     ┌───────────────────┐
        expiry ◄─────│  PENDING_PAYMENT  │
          │          └─────────┬─────────┘
          │                    │ provider webhook: captured
          ▼                    ▼
     ┌─────────┐        ┌────────────┐        ┌──────────────────┐
     │ EXPIRED │        │    PAID    │───────►│  PAYMENT_FAILED  │
     └─────────┘        └──────┬─────┘        └──────────────────┘
                               │ enqueue CreateReservationJob
                               ▼
                        ┌─────────────┐
                        │ CONFIRMING  │
                        └──┬───────┬──┘
             success       │       │      all retries exhausted
                ┌──────────┘       └──────────┐
                ▼                             ▼
       ┌─────────────────┐        ┌────────────────────────┐
       │    CONFIRMED    │        │  NEEDS_MANUAL_REVIEW   │  ← alerts fire
       └────┬───────┬────┘        └────────────────────────┘
            │       │
            │       └──────────────► MODIFIED ──► CONFIRMED
            │
            ├──► CANCELLED ──► REFUND_PENDING ──► REFUNDED
            ├──► COMPLETED        (after checkout date)
            └──► NO_SHOW
```

For connectors with `instantConfirmation: false` (asynchronous OXI-style reservation
upload), `CONFIRMING` resolves instead to `PENDING_CONFIRMATION`, and a reconciliation job
promotes it to `CONFIRMED` when the external reference arrives. The guest sees "we are
confirming your stay" with our reference, not a false confirmation number.

### The one state that matters

`NEEDS_MANUAL_REVIEW` means **the guest has paid and no reservation exists**. It is not a
generic error bucket. Reaching it triggers:

1. An immediate alert to the reservations team (email + dashboard badge).
2. A guest-facing message that is honest: payment received, confirmation in progress, with
   our reference and a contact route. Never a confirmation number we do not have.
3. A dedicated admin queue with the full connector request/response trail, a **Retry**
   action, a **Create manually and attach reference** action, and a **Refund** action.

An empty `NEEDS_MANUAL_REVIEW` queue is a launch criterion, not a nice-to-have.

## 2. Payment state machine

```
INITIATED ──► REDIRECTED ──► AUTHORIZED ──► CAPTURED ──► SETTLED
    │              │              │             │
    │              ▼              ▼             ▼
    └──────────► FAILED       EXPIRED    REFUND_REQUESTED
                                              │
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                                REFUNDED      PARTIALLY_REFUNDED
```

**The webhook is the source of truth, never the browser redirect.** A guest who closes the
tab after paying must still end with a confirmed booking; a guest who reaches the success
URL without a verified webhook must not. The redirect only decides what page to render.

Every webhook is signature-verified, replay-protected by provider event ID, and processed
idempotently before any state change.

## 3. The reservation creation sequence

This is the ordering the brief calls critical, expanded with the failure branches.

```
1. POST /bookings/validate
   └─ connector.quote()  — live, cache bypassed
   └─ price or availability changed? → return the diff, do not proceed
2. Create Booking (DRAFT) + BookingHold (TTL 15 min) + quote snapshot
3. POST /payments/create with idempotency key = hash(bookingId, amount, attempt)
   └─ redirect guest to the provider's hosted page
4. Webhook: payment captured → Payment CAPTURED, Booking PAID
5. Enqueue CreateReservationJob(bookingId)   — idempotent, at-least-once
6. Job: connector.createReservation()
7. Store external_reservation_id → Booking CONFIRMED → send confirmation
```

### Step 6 is where the care goes

**Before every retry, look before you leap.** The dangerous failure is not a rejected
request — it is a request that *succeeded* while the response was lost. So each attempt
after the first begins with `getReservation()` keyed on our booking reference, which we
send as the external system's guest/booking reference field. If a reservation already
exists, adopt it and confirm. Only if it genuinely does not exist do we create.

Without this, a network timeout produces two reservations for one guest, and the hotel
finds out at check-in.

Retry policy: 5 attempts, exponential backoff with jitter (roughly 2s → 4m), then
`NEEDS_MANUAL_REVIEW`. Retries only on transport and 5xx-class errors. A business rejection
(no availability, invalid rate code) does not retry — it goes straight to review, because
retrying it just produces the same rejection five times more slowly.

## 4. Failure handling matrix

| Failure | Handling |
| --- | --- |
| Rate changed between search and checkout | `validate` returns the price diff; guest explicitly re-confirms the new total before payment |
| Room sold out between search and checkout | Availability re-check fails; offer alternative room types at the same property, then other group properties for the same dates |
| Guest double-clicks **Pay** | Idempotency key on payment creation returns the original payment intent |
| Guest refreshes the payment page | Provider session resumed by payment ID; no second charge is possible |
| Duplicate webhook delivery | Provider event ID uniqueness; second delivery is acknowledged and ignored |
| Payment captured, reservation failed | `NEEDS_MANUAL_REVIEW` + alert + honest guest messaging + admin retry/refund actions |
| Reservation created, response timed out | `getReservation()` by our reference on retry; adopt the existing reservation |
| Connector unreachable during search | Circuit breaker opens; property excluded from results with a logged reason; property page stays browsable with an enquiry CTA |
| Connector unreachable during booking | Booking stays `PAID`, job retries on the schedule above; guest sees confirmation-in-progress |
| Hold expires before payment | `EXPIRED`; guest is returned to search with dates and occupancy preserved |
| Partial multi-room failure | Whole booking is treated as failed; any rooms created externally are rolled back by cancellation, and the booking enters review if rollback fails |

## 5. Idempotency

Three operations are idempotent by key:

| Operation | Key | Window |
| --- | --- | --- |
| Payment creation | `hash(bookingId, amount, currency, attempt)` | 24 h |
| Reservation creation | `bookingId` | until terminal state |
| Webhook processing | provider event ID | 7 days |

The first response for a key is stored and replayed for repeats. **No retry, refresh, or
duplicate delivery may ever create a second charge or a second reservation.**

## 6. Cancellation and modification

Both are capability-gated. A connector that declares `cancellation: false` renders no
cancel button, and the confirmation email routes the guest to the hotel directly instead of
offering an action that will fail.

Cancellation: check policy → compute penalty from the stored `nightly_rates` snapshot and
the `CancellationPolicy` on the rate plan → `connector.cancelReservation()` → on success,
`CANCELLED` and, if refundable, `REFUND_PENDING` → provider refund → `REFUNDED`.

**Order matters.** Cancel externally first, refund second. A refund issued before a failed
external cancellation leaves the hotel holding a room for a guest who is not coming and has
their money back.

## 7. Observability

Every booking attempt carries a `correlation_id` generated at first search and threaded
through every log line, connector call, payment event, webhook, and queue job. Given one
booking reference, the full story must be reconstructable from logs alone.

Metrics tracked from day one:

- Search → booking conversion, per hotel and per locale.
- Connector latency and error rate, per hotel and per operation.
- `NEEDS_MANUAL_REVIEW` count — alerts on any non-zero value.
- Payment success rate and abandonment point.
- Hold expiry rate — a rising number means checkout is too slow or too long.
