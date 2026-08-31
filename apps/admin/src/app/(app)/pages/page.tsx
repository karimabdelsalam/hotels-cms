import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { createPage } from "./actions";

export default async function PagesListPage() {
  const actor = await requirePermission("content:read");

  const [pages, locales] = await Promise.all([
    prisma.page.findMany({
      orderBy: { createdAt: "asc" },
      include: { translations: { select: { localeCode: true, title: true, slug: true } } },
    }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  async function add() {
    "use server";
    const id = await createPage();
    redirect(`/pages/${id}`);
  }

  return (
    <>
      <PageHeader
        title="Pages"
        description="Built from the same components the homepage uses, so a new page cannot drift away from the design. A page slug can never shadow a booking route."
        actions={
          actor.permissions.has("content:write") ? (
            <form action={add}>
              <button className="btn btn--pri" type="submit">
                New page
              </button>
            </form>
          ) : null
        }
      />
      <div className="scroller">
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Address</th>
              <th>Translations</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => {
              const en = p.translations.find((t) => t.localeCode === "en");
              const done = locales.filter((l) =>
                p.translations.some((t) => t.localeCode === l.code && t.title.trim()),
              ).length;
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/pages/${p.id}`}>
                      <b>{en?.title ?? p.key}</b>
                    </Link>
                  </td>
                  <td>
                    <code>/en/{en?.slug ?? "—"}</code>
                  </td>
                  <td>
                    <span className={`chip${done === locales.length ? " chip--ok" : " chip--warn"}`}>
                      {done} / {locales.length}
                    </span>
                  </td>
                  <td>
                    <span className={`chip${p.status === "published" ? " chip--ok" : " chip--warn"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="end">
                    <Link className="btn btn--sm" href={`/pages/${p.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        A draft page returns 404 on the site and is absent from the sitemap — it is not an
        orphan that search engines keep serving.
      </p>
    </>
  );
}
