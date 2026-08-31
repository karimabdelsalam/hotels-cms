import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { Toggle } from "@/components/Toggle";
import { setModuleEnabled } from "./actions";

const DESCRIPTIONS: Record<string, string> = {
  hero: "The opening screen and its search bar.",
  manifesto: "The group statement below the hero.",
  resorts: "The three resorts on the homepage, and the /resorts index.",
  reef: "The house reef panel, and the /diving page.",
  stats: "The figures band.",
  experiences: "The experiences rail, and the /experiences pages.",
  offers: "Offer cards, and the /offers pages.",
  weddings: "Weddings and events, with the enquiry form.",
  destinations:
    "Off: three resorts share one destination, so the section earns nothing. Switch on when a resort opens elsewhere — the pages and data are already here.",
  newsletter: "The sign-up band above the footer.",
};

export default async function ModulesPage() {
  await requirePermission("modules:write");
  const modules = await prisma.siteModule.findMany({ orderBy: { displayOrder: "asc" } });

  return (
    <>
      <PageHeader
        title="Site sections"
        description="Every section of the site is a switch, not code. Turning one off also removes it from navigation, sitemaps, and hreflang, so nothing half-enabled reaches search results."
      />
      <div className="list">
        {modules.map((m) => (
          <div className="row" key={m.key}>
            <div className="row-main">
              <b>{m.key}</b>
              <p>{DESCRIPTIONS[m.key] ?? "—"}</p>
            </div>
            <Toggle
              checked={m.enabled}
              label={`Enable ${m.key}`}
              onToggle={async (next) => {
                "use server";
                await setModuleEnabled(m.key, next);
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
