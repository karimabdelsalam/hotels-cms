import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@fantazia/db";
import { requirePermission, assertResortInScope, can } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { ReviewActions } from "./ReviewActions";

const MONEY = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 2 })
    .format(minor / 100);
const DATE = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
const STAMP = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" }).format(d);

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("bookings:read");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      guest: true,
      resort: { include: { translations: { where: { localeCode: "en" } } } },
      rooms: {
        include: {
          roomType: { include: { translations: { where: { localeCode: "en" } } } },
          ratePlan: { include: { translations: { where: { localeCode: "en" } } } },
        },
      },
      payments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!booking) notFound();
  assertResortInScope(actor, booking.resortId);

  // Everything the connector said about this booking attempt, found by the
  // correlation id that threads the whole story together.
  const calls = await prisma.integrationLog.findMany({
    where: { correlationId: booking.correlationId },
    orderBy: { createdAt: "asc" },
  });

  const needsReview = booking.status === "NEEDS_MANUAL_REVIEW";
  const canManage = can(actor, "bookings:manage");

  return (
    <>
      <PageHeader
        title={booking.reference}
        description={`${booking.guest.firstName} ${booking.guest.lastName} · ${booking.resort.translations[0]?.name ?? booking.resort.code}`}
        actions={
          <Link className="btn" href="/bookings">
            All bookings
          </Link>
        }
      />

      {needsReview && (
        <section className="card card--alarm">
          <h2>This guest has paid and no reservation exists</h2>
          <p className="note">
            The money was taken. Nothing is booked in the property system. Until one of the
            actions below is taken, this guest will arrive to no room.
          </p>
        </section>
      )}

      <div className="editor">
        {canManage && (booking.status === "NEEDS_MANUAL_REVIEW" ||
          booking.status === "CONFIRMING" ||
          booking.status === "CONFIRMED" ||
          booking.status === "PENDING_CONFIRMATION") && (
          <ReviewActions
            bookingId={booking.id}
            status={booking.status}
            hasExternalReservation={Boolean(booking.externalReservationId)}
          />
        )}

        <section className="card">
          <h2>The stay</h2>
          <div className="fact-rows">
            <div className="fact-row"><span>Status</span><b>{booking.status}</b></div>
            <div className="fact-row"><span>Dates</span><b>{DATE(booking.checkIn)} → {DATE(booking.checkOut)} ({booking.nights} nights)</b></div>
            <div className="fact-row"><span>Guests</span><b>{booking.adults} adults{booking.children ? `, ${booking.children} children` : ""}</b></div>
            <div className="fact-row"><span>Rooms</span><b>{booking.roomsCount}</b></div>
            <div className="fact-row"><span>Booked</span><b>{STAMP(booking.createdAt)}</b></div>
            {booking.confirmedAt && (
              <div className="fact-row"><span>Confirmed</span><b>{STAMP(booking.confirmedAt)}</b></div>
            )}
            <div className="fact-row">
              <span>OPERA reservation</span>
              <b>{booking.externalReservationId ? <code>{booking.externalReservationId}</code> : "—"}</b>
            </div>
            <div className="fact-row">
              <span>Confirmation number</span>
              <b>{booking.externalConfirmationNumber ? <code>{booking.externalConfirmationNumber}</code> : "—"}</b>
            </div>
            {booking.specialRequests && (
              <div className="fact-row"><span>Requests</span><b>{booking.specialRequests}</b></div>
            )}
          </div>
        </section>

        <section className="card">
          <h2>Guest</h2>
          <div className="fact-rows">
            <div className="fact-row"><span>Name</span><b>{booking.guest.firstName} {booking.guest.lastName}</b></div>
            <div className="fact-row"><span>Email</span><b>{booking.guest.email}</b></div>
            {booking.guest.phone && <div className="fact-row"><span>Phone</span><b>{booking.guest.phone}</b></div>}
            <div className="fact-row"><span>Language</span><b>{booking.locale}</b></div>
          </div>
        </section>

        <section className="card">
          <h2>What was charged</h2>
          <div className="scroller">
            <table>
              <thead>
                <tr><th>Room</th><th>Rate</th><th className="num">Nights</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {booking.rooms.map((room) => (
                  <tr key={room.id}>
                    <td>
                      {room.roomType.translations[0]?.name ?? "—"}
                      {room.quantity > 1 && <span className="hint"> × {room.quantity}</span>}
                    </td>
                    <td>{room.ratePlan.translations[0]?.name ?? room.ratePlan.externalCode ?? "—"}</td>
                    <td className="num">{(room.nightlyRates as { date: string }[]).length}</td>
                    <td className="num">{MONEY(room.roomTotal, booking.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fact-rows">
            <div className="fact-row"><span>Rooms</span><b>{MONEY(booking.roomTotal, booking.currency)}</b></div>
            <div className="fact-row"><span>Taxes</span><b>{MONEY(booking.taxesTotal, booking.currency)}</b></div>
            <div className="fact-row"><span>Fees</span><b>{MONEY(booking.feesTotal, booking.currency)}</b></div>
            <div className="fact-row"><span>Total</span><b>{MONEY(booking.totalAmount, booking.currency)}</b></div>
          </div>

          {/* The per-night breakdown, which is what makes a partial refund or a
              dispute answerable months later. */}
          <details>
            <summary className="hint">Night by night</summary>
            <div className="scroller">
              <table>
                <thead><tr><th>Room</th><th>Night</th><th className="num">Rate</th></tr></thead>
                <tbody>
                  {booking.rooms.flatMap((room) =>
                    (room.nightlyRates as { date: string; minor: number }[]).map((n) => (
                      <tr key={`${room.id}-${n.date}`}>
                        <td>{room.roomType.translations[0]?.name ?? "—"}</td>
                        <td>{n.date}</td>
                        <td className="num">{MONEY(n.minor, booking.currency)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="card">
          <h2>What happened</h2>
          <p className="note">
            Every transition, in order. Correlation id <code>{booking.correlationId}</code>.
          </p>
          <ul className="rows">
            {booking.events.map((event) => (
              <li key={event.id}>
                <span>
                  <b>{event.type}</b>
                  <code>
                    {event.fromStatus ? `${event.fromStatus} → ` : ""}
                    {event.toStatus ?? "—"} · {event.actorType}
                  </code>
                </span>
                <span className="hint">{STAMP(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Connector calls</h2>
          {calls.length === 0 ? (
            <p className="note">Nothing has been sent to the property system for this booking.</p>
          ) : (
            <ul className="rows">
              {calls.map((call) => (
                <li key={call.id} className="menu-item">
                  <div className="menu-row">
                    <span>
                      <b>{call.operation}</b>
                      <code>
                        {call.connector} · {call.status}
                        {call.errorCode ? ` · ${call.errorCode}` : ""}
                        {call.durationMs != null ? ` · ${call.durationMs}ms` : ""}
                      </code>
                    </span>
                    <span className="hint">{STAMP(call.createdAt)}</span>
                  </div>
                  {(call.requestSummary || call.responseSummary) && (
                    <details>
                      <summary className="hint">Message</summary>
                      {/* Already redacted at write time — no credential ever
                          reaches this table, so nothing here can leak one. */}
                      <pre className="trail">
                        {[
                          (call.requestSummary as { body?: string })?.body,
                          (call.responseSummary as { body?: string })?.body,
                        ]
                          .filter(Boolean)
                          .join("\n\n")}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Payments</h2>
          {booking.payments.length === 0 ? (
            <p className="note">No payment has been recorded.</p>
          ) : (
            <div className="scroller">
              <table>
                <thead><tr><th>Provider</th><th>Status</th><th className="num">Amount</th><th>When</th></tr></thead>
                <tbody>
                  {booking.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.provider}{p.last4 ? <span className="hint"> ···{p.last4}</span> : null}</td>
                      <td>{p.status}</td>
                      <td className="num">{MONEY(p.amount, p.currency)}</td>
                      <td>{STAMP(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
