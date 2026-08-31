import Link from "next/link";
import { prisma } from "@fantazia/db";
import { requirePermission, resortScopeFilter } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

const MONEY = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 })
    .format(minor / 100);

const DATE = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);

/** How a status should read on a badge, and how loudly. */
const TONE: Record<string, { label: string; chip: string }> = {
  DRAFT: { label: "Draft", chip: "" },
  PENDING_PAYMENT: { label: "Awaiting payment", chip: "" },
  EXPIRED: { label: "Expired", chip: "" },
  PAID: { label: "Paid", chip: "chip--warn" },
  PAYMENT_FAILED: { label: "Payment failed", chip: "chip--warn" },
  CONFIRMING: { label: "Confirming", chip: "chip--warn" },
  PENDING_CONFIRMATION: { label: "Awaiting confirmation", chip: "chip--warn" },
  CONFIRMED: { label: "Confirmed", chip: "chip--ok" },
  NEEDS_MANUAL_REVIEW: { label: "Needs review", chip: "chip--danger" },
  MODIFIED: { label: "Modified", chip: "chip--ok" },
  CANCELLED: { label: "Cancelled", chip: "" },
  REFUND_PENDING: { label: "Refund pending", chip: "chip--warn" },
  REFUNDED: { label: "Refunded", chip: "" },
  COMPLETED: { label: "Stayed", chip: "chip--ok" },
  NO_SHOW: { label: "No show", chip: "" },
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const actor = await requirePermission("bookings:read");
  const { status, q } = await searchParams;

  const scope = resortScopeFilter(actor);
  const where = {
    ...(scope ? { resortId: scope.id } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q.toUpperCase() } },
            { guest: { email: { contains: q, mode: "insensitive" as const } } },
            { guest: { lastName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [bookings, review, resorts] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { guest: true, resort: { include: { translations: { where: { localeCode: "en" } } } } },
    }),
    // Counted separately and unfiltered, because this is the number that must
    // be zero and it should not be possible to hide it behind a filter.
    prisma.booking.count({
      where: { ...(scope ? { resortId: scope.id } : {}), status: "NEEDS_MANUAL_REVIEW" },
    }),
    prisma.resort.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Bookings"
        description={
          actor.isGroupWide
            ? `Across all ${resorts} resorts.`
            : "Across the resorts you have access to."
        }
      />

      {review > 0 && (
        <section className="card card--alarm">
          <h2>
            {review} booking{review === 1 ? "" : "s"} need{review === 1 ? "s" : ""} attention
          </h2>
          <p className="note">
            These guests have paid and no reservation exists in the property system. Each one
            is a guest who will arrive to no room unless someone acts.
          </p>
          <div className="btn-row">
            <Link className="btn btn--pri btn--sm" href="/bookings?status=NEEDS_MANUAL_REVIEW">
              Open the queue
            </Link>
          </div>
        </section>
      )}

      <section className="card">
        <form className="filters" method="get">
          <input
            name="q"
            className="inp"
            placeholder="Reference, email or surname"
            defaultValue={q ?? ""}
            aria-label="Search bookings"
          />
          <select name="status" className="inp" defaultValue={status ?? "all"} aria-label="Status">
            <option value="all">Every status</option>
            {Object.entries(TONE).map(([key, t]) => (
              <option key={key} value={key}>
                {t.label}
              </option>
            ))}
          </select>
          <button className="btn btn--sm" type="submit">
            Search
          </button>
        </form>

        {bookings.length === 0 ? (
          <p className="empty">No bookings match.</p>
        ) : (
          <div className="scroller">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Guest</th>
                  <th>Resort</th>
                  <th>Stay</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const tone = TONE[b.status] ?? { label: b.status, chip: "" };
                  return (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/bookings/${b.id}`}>
                          <code>{b.reference}</code>
                        </Link>
                      </td>
                      <td>
                        {b.guest.firstName} {b.guest.lastName}
                        <br />
                        <span className="hint">{b.guest.email}</span>
                      </td>
                      <td>{b.resort.translations[0]?.name ?? b.resort.code}</td>
                      <td>
                        {DATE(b.checkIn)} → {DATE(b.checkOut)}
                        <br />
                        <span className="hint">
                          {b.nights} night{b.nights === 1 ? "" : "s"}, {b.roomsCount} room
                          {b.roomsCount === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="num">{MONEY(b.totalAmount, b.currency)}</td>
                      <td>
                        <span className={`chip ${tone.chip}`}>{tone.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
