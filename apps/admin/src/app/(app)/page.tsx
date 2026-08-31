import Link from "next/link";
import { prisma } from "@fantazia/db";
import { requireActor, resortScopeFilter } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

export default async function Dashboard() {
  const actor = await requireActor();
  const scope = resortScopeFilter(actor);

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
