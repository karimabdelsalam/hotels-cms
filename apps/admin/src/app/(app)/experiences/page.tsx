import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { createExperience } from "./actions";

export default async function ExperiencesListPage() {
  const actor = await requirePermission("content:read");

  const [rows, locales] = await Promise.all([
    prisma.experience.findMany({
      orderBy: { displayOrder: "asc" },
      include: { translations: { select: { localeCode: true, name: true } } },
    }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  async function add() {
    "use server";
    const id = await createExperience();
    redirect(`/experiences/${id}`);
  }

  return (
    <>
      <PageHeader
        title="Experiences"
        description="What the coast is for. These fill the slot the Destinations section vacated."
        actions={
          actor.permissions.has("content:write") ? (
            <form action={add}>
              <button className="btn btn--pri" type="submit">
                New experience
              </button>
            </form>
          ) : null
        }
      />
      <div className="scroller">
        <table>
          <thead>
            <tr>
              <th>Experience</th>
              <th>Category</th>
              <th>Translations</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const name =
                x.translations.find((t) => t.localeCode === "en")?.name ??
                x.translations[0]?.name ??
                x.code;
              const done = locales.filter((l) =>
                x.translations.some((t) => t.localeCode === l.code && t.name.trim()),
              ).length;
              return (
                <tr key={x.id}>
                  <td>
                    <Link href={`/experiences/${x.id}`}>
                      <b>{name}</b>
                    </Link>
                  </td>
                  <td>{x.category}</td>
                  <td>
                    <span className={`chip${done === locales.length ? " chip--ok" : " chip--warn"}`}>
                      {done} / {locales.length}
                    </span>
                  </td>
                  <td>
                    <span className={`chip${x.status === "published" ? " chip--ok" : ""}`}>
                      {x.status}
                    </span>
                  </td>
                  <td className="end">
                    <Link className="btn btn--sm" href={`/experiences/${x.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
