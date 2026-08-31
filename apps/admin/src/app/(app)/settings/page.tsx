import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { BrandForm } from "./BrandForm";

export default async function SettingsPage() {
  const actor = await requirePermission("content:read");

  const [rows, locales] = await Promise.all([
    prisma.setting.findMany({ where: { key: { startsWith: "brand." } } }),
    prisma.locale.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const asString = (key: string, fallback = "") => {
    const v = value(key);
    return typeof v === "string" ? v : fallback;
  };
  const asMap = (key: string): Record<string, string> => {
    const v = value(key);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      );
    }
    return {};
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="The group's own name and wording. It appears in the header, the footer, every page title, and every email — so it lives here rather than in the code."
      />
      <BrandForm
        name={asString("brand.name", "Fantazia Hotels")}
        wordmark={asString("brand.wordmark", "FANTAZIA")}
        locations={asMap("brand.location")}
        taglines={asMap("brand.tagline")}
        locales={locales.map((l) => ({
          code: l.code,
          nativeName: l.nativeName,
          direction: l.direction,
          isDefault: l.isDefault,
        }))}
        canWrite={actor.permissions.has("content:publish")}
      />
    </>
  );
}
