# OPERA / OXI Provisioning Runbook

**For the PMS team.** Everything the booking platform needs from the OPERA 5.6 environment,
step by step, with what to hand back at each stage.

Written as **outcomes and data**, not as click paths. The exact screens and field names vary
by patch level, and the team knows the system — so each step states what must be true when
it is done, and what to send us. Verify specifics against Oracle's documentation for the
installed version rather than against anything assumed here.

**Scope:** one multi-property OPERA 5.6 on-premise installation, three resorts, our OXI
interface running alongside the existing channel-manager interface.

---

## Stage 0 — What is being built, in one picture

```
        ┌──────────── continuous, asynchronous ────────────┐
        │                                                  │
   OPERA 5.6  ──── OXI (our interface) ────►  InventorySnapshot
   CAI·ALX·RSG      rates · availability          (our database)
        ▲            · restrictions                    │
        │                                              ▼
        │                                       website search
        │                                       (never touches OPERA)
        │
        └──── OWS (synchronous) ◄──── checkout
              live price re-check, then create reservation,
              confirmation number returns in the same call
```

Two interfaces, two jobs. **OXI keeps our prices and availability current. OWS carries the
transaction while the guest waits.** Search reads our own database, so the website stays
fast and keeps working if OPERA is down; only new bookings queue.

---

## Stage 1 — Environment facts

Collect and send:

| # | Item | Notes |
| --- | --- | --- |
| 1.1 | OPERA version and exact patch level | Determines which interface schema versions apply |
| 1.2 | Chain code | |
| 1.3 | Resort codes for all three properties, with names | e.g. Fantazia Resort, Fantazia Royal, Sirena Resort |
| 1.4 | Base currency per resort | Expecting EGP |
| 1.5 | Timezone and business-day rollover time | Affects date handling on arrivals and ARI |
| 1.6 | OXI server version, and the interfaces configured today | Including the channel manager's |
| 1.7 | Application server topology | Which host runs OPERA, which runs OXI, which would run OWS |

---

## Stage 2 — OWS: settled

**Confirmed by the property team: OWS is licensed and running.** This was the one open
decision and it is closed, in the best possible way.

It settles the architecture: OXI keeps availability and rates current, OWS carries the
transaction and returns a confirmation number in the same call. The guest sees a real PMS
confirmation number at the end of checkout, not "we are confirming your stay" — which
converts better and stops the calls to the resort that the alternative generates.

`instantConfirmation: true` is therefore honest for all three resorts, and the code assumes
it. OXI stays read-only for us: with OWS present there is no reason for two write paths into
the same reservation table.

### What we still need from you at this stage

**2.1 — Export the WSDL** for each deployed OWS service (Reservation, Availability,
Information at minimum). This is not a formality. The service names, SOAP actions and
namespace versions differ between OPERA releases, and our connector reads them from
configuration rather than assuming them, precisely so that nobody discovers a wrong
namespace in production. A wrong namespace comes back as a fault, not an error — the
booking simply fails, and nothing anywhere says why.

Send: the `.wsdl` files, or the URLs we can fetch them from inside the network.

**2.2 — The internal service endpoint.** The base URL our application server will POST to.
Internal address, not published to the internet.

**2.3 — A service account** with permission to read availability and to create, read and
cancel reservations, scoped to the three resort codes and nothing else. Send the username
and password by whatever channel you use for credentials — never in the same message as the
endpoint, and never in a ticket.

We store a *pointer* to that credential, never the credential itself. It lives in the
server's environment, named by the `credentialRef` on the integration row.

---

## Stage 3 — A dedicated OXI interface for the booking platform

**3.1** Create a **separate interface definition** for the booking platform. It must not
share the channel manager's interface — separate ID, separate subscriptions, separate logs.
Suggested name: `WEBBE` or similar, whatever fits your conventions.

**3.2** Confirm both interfaces can run concurrently against the same resorts, and send us
the interface ID and its configured direction(s).

**3.3** Confirm the delivery mechanism for messages — how OXI hands messages to an external
system in this installation, and what our endpoint has to accept.

**3.4** Create a **dedicated service account** for the interface. Least privilege: only what
the subscribed message types require. Never a shared or personal login. Credentials go
through the agreed secure channel — never email, chat, or a ticket body.

---

## Stage 4 — Message subscriptions

Subscribe our interface to these, for all three resort codes.

### Outbound from OPERA to us — continuous

| Data | Why we need it |
| --- | --- |
| **Rate amounts** — by rate code, room type, date | Prices shown on the website |
| **Availability / inventory** — rooms available by room type and date | What the website can sell |
| **Restrictions** — minimum stay, closed to arrival, closed to departure, stop sell | So we never offer a stay the resort will not accept |
| **Rate code and room type configuration** changes | Keeps our mapping tables from going stale |

Send a **full initial synchronisation** for a rolling window of at least **400 days** from
today, then incremental updates on change.

### Inbound to OPERA from us

| Data | Condition |
| --- | --- |
| **Reservation create / modify / cancel** | **Only if OWS is unavailable.** If OWS is present, bookings go over OWS and OXI stays read-only for us — simpler, and no risk of two write paths |
| **Guest profile** | Attached to the reservation. Confirm whether profiles should be created by us or matched by OPERA |

**4.1 — Confirm which of these the interface supports at this patch level**, and flag
anything that cannot be subscribed.

---

## Stage 5 — Test environment

**5.1** A test property or test environment mirroring the three production resort codes,
with representative room types, rate codes, and inventory.

**5.2** Our interface configured there **first**. Nothing is pointed at production until the
Stage 8 tests pass.

**5.3** Confirm test data can be reset, so a failed run does not leave phantom reservations.

**5.4** Send us the test resort codes and credentials.

---

## Stage 6 — Configuration exports for mapping

Our database holds its own entities and maps them to OPERA's codes. **Nothing is guessed** —
every code is mapped explicitly and verified. Export per resort, as CSV or Excel:

### 6.1 Room types
`code · description · max adults · max children · max occupancy · bed configuration ·
number of rooms · active`

### 6.2 Rate codes
`code · description · market segment · source code · currency · meal plan or package ·
public or negotiated · begin and end dates · minimum and maximum stay · active`

Mark clearly **which rate codes the website is allowed to sell.** This is the most important
column in the whole export — selling a negotiated corporate rate publicly is a real revenue
loss, and it is exactly the kind of thing that is discovered late.

### 6.3 Packages
`code · description · price · posting rhythm · included in rate or added`

### 6.4 Cancellation and deposit rules
`policy code · description · free-cancellation window · penalty basis and value ·
deposit required · which rate codes carry it`

Needed in **plain guest-facing language too**, in English and Arabic, because it is shown at
checkout and must match what the resort will actually enforce.

### 6.5 Taxes and service charges
`name · type (percentage or fixed) · value · applied per night or per stay ·
included in the rate or added on top · which resorts`

State explicitly whether the rate amounts arriving over OXI are **tax-inclusive or
tax-exclusive**. A wrong assumption here means every price on the website is wrong.

### 6.6 Market segment and source codes

**Create a dedicated source (and market segment if your reporting needs it) for the website
channel**, distinct from OTA and walk-in. Without it, direct-booking revenue cannot be
reported separately — which is the main commercial reason for building this.

Send the codes to use.

### 6.7 Reservation defaults for prepaid web bookings
`reservation type to use · guarantee type · payment method code for a prepaid online
payment · whether the deposit is posted by us or by the resort`

### 6.8 Confirmation number format
Format and length, so we store and display it correctly.

---

## Stage 7 — Connectivity and security

**7.1** Network path between our application and the OXI/OWS endpoints. In order of how
easily these are usually approved:

| Option | What it means |
| --- | --- |
| **Outbound-only gateway** | A small service inside the hotel network holds the OPERA connection and dials out to us over mTLS. Nothing inbound to open |
| **Colocation** | Our application runs in the same datacentre. No tunnel at all |
| **Site-to-site VPN** | Standard IPsec tunnel between both networks |
| Public exposure | **Not acceptable.** The PMS holds guest identity and payment data |

Since the same team administers both sides, pick whichever fits your topology and tell us —
this is usually the longest item on a project like this and here it should not be.

**7.2** Fixed internal hostnames or IPs for the endpoints, and any firewall rules needed.

**7.3** Credential handover through the agreed secure channel. They are stored in a secret
manager on our side and never appear in the application database, logs, or any API response.

**7.4** TLS certificates for the endpoints, and who renews them.

---

## Stage 8 — Acceptance tests

Run together on the test environment. Each has a pass condition; none is subjective.

| # | Test | Passes when |
| --- | --- | --- |
| 8.1 | Initial ARI sync | All three resorts' rates, availability, and restrictions arrive for the full 400-day window, and our totals reconcile against an OPERA report |
| 8.2 | Rate change propagates | A rate amount changed in OPERA appears in our database. **Record the elapsed time** |
| 8.3 | Availability change propagates | Selling a room in OPERA decrements our availability. Record the time |
| 8.4 | Stop sell honoured | A date closed in OPERA becomes unsellable on the website |
| 8.5 | Minimum stay honoured | A 3-night minimum blocks a 2-night search result |
| 8.6 | Create a reservation | Appears in OPERA with the correct resort, room type, rate code, dates, occupancy, **source code**, guest profile, and total |
| 8.7 | Confirmation number returns | Present on our booking record. Note whether it returned synchronously (OWS) or later (OXI) |
| 8.8 | Modify | Date and occupancy change reflects in OPERA |
| 8.9 | Cancel | Reflects in OPERA, and the room returns to availability |
| 8.10 | **Duplicate protection** | The same booking submitted twice, and a retry after a simulated timeout, produce **exactly one** reservation |
| 8.11 | Multi-room booking | Two rooms in one booking create correctly |
| 8.12 | **Oversell window** | Measure the time from a direct booking landing in OPERA to the channel manager reducing OTA availability. **This number sizes our allotment buffer** |
| 8.13 | Interface coexistence | Our interface and the channel manager's run together for 48 hours with no message loss or conflict in either log |
| 8.14 | Recovery | OXI stopped for 30 minutes, then restarted: queued messages are delivered and our data reconciles with no manual repair |

Test 8.12 is the one that protects the resort from selling the same room twice. It cannot be
estimated — it has to be measured.

---

## Stage 9 — Handover checklist

| | Item | Stage |
| --- | --- | --- |
| ☐ | Version, patch level, chain code, resort codes, currency, timezone | 1 |
| ☑ | OWS outcome — **licensed and running** (confirmed by the property team) | 2 |
| ☐ | WSDL exports for the deployed OWS services | 2 |
| ☐ | Internal OWS endpoint URL | 2 |
| ☐ | Service account scoped to the three resort codes | 2 |
| ☐ | Dedicated OXI interface created, ID sent | 3 |
| ☐ | Service account created, credentials sent securely | 3 |
| ☐ | Message subscriptions confirmed, unsupported types flagged | 4 |
| ☐ | Test environment ready, codes and credentials sent | 5 |
| ☐ | Room types export, all three resorts | 6.1 |
| ☐ | Rate codes export, **with the website-sellable column** | 6.2 |
| ☐ | Packages export | 6.3 |
| ☐ | Cancellation and deposit rules, technical **and** guest-facing wording | 6.4 |
| ☐ | Taxes and service charges, **with inclusive/exclusive stated** | 6.5 |
| ☐ | Website source and market segment codes created | 6.6 |
| ☐ | Reservation type, guarantee type, payment method for prepaid | 6.7 |
| ☐ | Confirmation number format | 6.8 |
| ☐ | Network path agreed, endpoints and firewall rules | 7 |
| ☐ | All Stage 8 tests passed, **with 8.2, 8.3 and 8.12 timings recorded** | 8 |

---

## Stage 10 — Sequencing

Stages 1, 2, and 6 can start immediately and in parallel — none depends on our code being
ready, and the exports in Stage 6 are the longest lead item because they need someone who
knows the rate configuration.

```
Stage 1 ─┐
Stage 2 ─┼──► Stage 3 ──► Stage 4 ──► Stage 5 ──► Stage 8 ──► production cutover
Stage 6 ─┘                              ▲
Stage 7 ────────────────────────────────┘
```

**Nothing here blocks development, and this is not a promise — it is already true.** The
website, the booking engine, the payment flow and the admin are built and tested end to end
against a simulator that stands in for OPERA: search, hold, checkout, payment, reservation,
confirmation, and the failure branches including a reservation that succeeds while the
response is lost. Switching a resort to OWS is a row in `integration_environments` and a set
of environment variables — no code changes.

**The two items worth starting today** are the WSDL and endpoint export (Stage 2) and the rate-code
export with the sellable column marked (Stage 6.2). One decides the shape of checkout; the
other is the item most likely to be late.
