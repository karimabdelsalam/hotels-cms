import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { createOffer } from "./actions";

export default async function OffersPage() {
  const actor = await requirePermission("content:read");

  const [offers, locales] = await Promise.all([
    prisma.offer.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        translations: { select: { localeCode: true, title: true } },
        resort: { include: { translations: { select: { localeCode: true, name: true } } } },
      },
    }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  async function addOffer() {
    "use server";
    const id = await createOffer();
    redirect(`/offers/${id}`);
  }

  return (
    <>
      <PageHeader
        title="Offers"
        description="An offer with no resort applies group-wide — it shows on the homepage and at every resort."
        actions={
          actor.permissions.has("content:write") ? (
            <form action={addOffer}>
              <button className="btn btn--pri" type="submit">
                New offer
              </button>
            </form>
          ) : null
        }
      />
      <div className="scroller">
        <table>
          <thead>
            <tr>
              <th>Offer</th>
              <th>Code</th>
              <th>Applies at</th>
              <th>Translations</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => {
              const title =
                o.translations.find((t) => t.localeCode === "en")?.title ??
                o.translations[0]?.title ??
                "Untitled";
              const done = locales.filter((l) =>
                o.translations.some((t) => t.localeCode === l.code && t.title.trim()),
              ).length;
              const where = o.resort
                ? (o.resort.translations.find((t) => t.localeCode === "en")?.name ?? o.resort.code)
                : "All resorts";
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/offers/${o.id}`}>
                      <b>{title}</b>
                    </Link>
                  </td>
                  <td>{o.promoCode ? <code>{o.promoCode}</code> : "—"}</td>
                  <td>{where}</td>
                  <td>
                    <span className={`chip${done === locales.length ? " chip--ok" : " chip--warn"}`}>
                      {done} / {locales.length}
                    </span>
                  </td>
                  <td>
                    <span className={`chip${o.status === "published" ? " chip--ok" : ""}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="end">
                    <Link className="btn btn--sm" href={`/offers/${o.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {offers.length === 0 && <p className="empty">No offers yet.</p>}
    </>
  );
}
