import Link from "next/link";
import { prisma } from "@fantazia/db";
import { requireActor, resortScopeFilter, can } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

export default async function Dashboard() {
  const actor = await requireActor();
  const scope = resortScopeFilter(actor);

  const seesBookings = can(actor, "bookings:read");
  const bookingScope = scope ? { resortId: scope.id } : {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [resorts, rooms, offers, experiences, pages, locales, modules, drafts] = await Promise.all([
    prisma.resort.count({ where: scope }),
    prisma.roomType.count(),
    prisma.offer.count({ where: { status: "published" } }),
    prisma.experience.count({ where: { status: "published" } }),
    prisma.page.count(),
    prisma.locale.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.siteModule.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.page.count({ where: { status: "draft" } }),
  ]);

  const enabled = locales.filter((l) => l.isEnabled);
  const off = modules.filter((m) => !m.enabled);

  // Queried separately and only for people who may see bookings, so the
  // dashboard does not do this work for a translator.
  const [needsReview, arriving, leaving, confirmedToday, undelivered] = seesBookings
    ? await Promise.all([
        prisma.booking.count({ where: { ...bookingScope, status: "NEEDS_MANUAL_REVIEW" } }),
        prisma.booking.count({
          where: { ...bookingScope, status: "CONFIRMED", checkIn: { gte: today, lt: tomorrow } },
        }),
        prisma.booking.count({
          where: { ...bookingScope, status: "CONFIRMED", checkOut: { gte: today, lt: tomorrow } },
        }),
        prisma.booking.count({
          where: { ...bookingScope, confirmedAt: { gte: today } },
        }),
        prisma.bookingNotification.count({
          where: { status: "failed", booking: bookingScope },
        }),
      ])
    : [0, 0, 0, 0, 0];

  return (
    <>
      <PageHeader
        title={`Good to see you, ${actor.name.split(" ")[0]}`}
        description={
          actor.isGroupWide
            ? "You have access to every resort."
            : "You have access to your assigned resorts only."
        }
      />

      {/* The first thing on the screen, and only when it is not zero. A guest
          who has paid and has no reservation should not be one click away. */}
      {needsReview > 0 && (
        <section className="card card--alarm">
          <h2>
            {needsReview} booking{needsReview === 1 ? "" : "s"} need
            {needsReview === 1 ? "s" : ""} attention
          </h2>
          <p className="note">
            These guests have paid and no reservation exists in the property system.
          </p>
          <div className="btn-row">
            <Link className="btn btn--pri btn--sm" href="/bookings?status=NEEDS_MANUAL_REVIEW">
              Open the queue
            </Link>
          </div>
        </section>
      )}

      {undelivered > 0 && (
        <section className="card">
          <h2>{undelivered} confirmation{undelivered === 1 ? "" : "s"} could not be sent</h2>
          <p className="note">
            These guests have a booking and no email about it, so they will phone the resort.
            Check the mail settings on the server.
          </p>
        </section>
      )}

      {seesBookings && (
        <div className="stat-row">
          <Stat label="Arriving today" value={arriving} href="/bookings" />
          <Stat label="Leaving today" value={leaving} />
          <Stat label="Booked today" value={confirmedToday} />
          <Stat
            label="Needs attention"
            value={needsReview}
            href="/bookings?status=NEEDS_MANUAL_REVIEW"
          />
        </div>
      )}

      <div className="stat-row">
        <Stat label="Resorts" value={resorts} href="/resorts" />
        <Stat label="Room types" value={rooms} />
        <Stat label="Live offers" value={offers} />
        <Stat label="Experiences" value={experiences} />
        <Stat label="Pages" value={pages} sub={drafts ? `${drafts} draft` : undefined} />
      </div>

      <div className="cards">
        <section className="card">
          <h2>Languages</h2>
          <ul className="rows">
            {locales.map((l) => (
              <li key={l.code}>
                <span>
                  <b>{l.nativeName}</b> <code>{l.code}</code>
                </span>
                <span className={`chip${l.isEnabled ? " chip--ok" : ""}`}>
                  {l.isDefault ? "Default" : l.isEnabled ? "Live" : "Not published"}
                </span>
              </li>
            ))}
          </ul>
          <p className="note">
            {enabled.length} of {locales.length} published. A language goes live once its
            translations are complete — a half-translated site is worse than one language.
          </p>
        </section>

        <section className="card">
          <h2>Site sections</h2>
          <ul className="rows">
            {modules.map((m) => (
              <li key={m.key}>
                <span>
                  <b>{m.key}</b>
                </span>
                <span className={`chip${m.enabled ? " chip--ok" : ""}`}>
                  {m.enabled ? "On" : "Off"}
                </span>
              </li>
            ))}
          </ul>
          <p className="note">
            {off.length ? `${off.map((m) => m.key).join(", ")} switched off. ` : ""}
            <Link href="/modules">Manage sections</Link>
          </p>
        </section>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  href?: string;
}) {
  const body = (
    <>
      <b>{value}</b>
      <span>{label}</span>
      {sub && <em>{sub}</em>}
    </>
  );
  return href ? (
    <Link className="stat" href={href}>
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
