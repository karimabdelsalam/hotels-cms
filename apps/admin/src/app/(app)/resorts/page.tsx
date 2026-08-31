import Link from "next/link";
import { prisma } from "@fantazia/db";
import { requirePermission, resortScopeFilter } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

export default async function ResortsPage() {
  const actor = await requirePermission("content:read");
  const scope = resortScopeFilter(actor);

  const [resorts, locales] = await Promise.all([
    prisma.resort.findMany({
      where: scope,
      orderBy: { displayOrder: "asc" },
      include: {
        translations: { select: { localeCode: true, name: true } },
        _count: { select: { roomTypes: true } },
      },
    }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Resorts"
        description={
          actor.isGroupWide
            ? "All resorts in the group."
            : "The resorts you have been given access to."
        }
      />
      <div className="scroller">
        <table>
          <thead>
            <tr>
              <th>Resort</th>
              <th>Code</th>
              <th className="num">Rooms</th>
              <th>Translations</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {resorts.map((r) => {
              const name =
                r.translations.find((t) => t.localeCode === "en")?.name ??
                r.translations[0]?.name ??
                r.code;
              const done = locales.filter((l) =>
                r.translations.some((t) => t.localeCode === l.code && t.name.trim()),
              ).length;
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/resorts/${r.id}`}>
                      <b>{name}</b>
                    </Link>
                  </td>
                  <td>
                    <code>{r.code}</code>
                  </td>
                  <td className="num">{r._count.roomTypes}</td>
                  <td>
                    <span className={`chip${done === locales.length ? " chip--ok" : " chip--warn"}`}>
                      {done} / {locales.length}
                    </span>
                  </td>
                  <td>
                    <span className={`chip${r.status === "published" ? " chip--ok" : ""}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="end">
                    <Link className="btn btn--sm" href={`/resorts/${r.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {resorts.length === 0 && (
        <p className="empty">No resorts are in your scope. Ask an administrator for access.</p>
      )}
    </>
  );
}
