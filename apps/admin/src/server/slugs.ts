import "server-only";
import { prisma } from "@fantazia/db";
import { RESERVED_SLUGS } from "@/lib/slug";

type Owner =
  | { kind: "resort"; id: string }
  | { kind: "offer"; id: string }
  | { kind: "experience"; id: string }
  | { kind: "page"; id: string };

/**
 * Slugs are unique per locale across every content type, because they all share
 * one URL space. Checked here so an editor gets a plain sentence rather than a
 * database constraint error.
 *
 * Returns an error message, or null when the slug is free.
 */
export async function checkSlugAvailable(
  localeCode: string,
  slug: string,
  owner: Owner,
): Promise<string | null> {
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is a reserved address. Choose another slug.`;
  }

  const [resort, offer, experience, page] = await Promise.all([
    prisma.resortTranslation.findFirst({
      where: {
        localeCode,
        slug,
        ...(owner.kind === "resort" ? { NOT: { resortId: owner.id } } : {}),
      },
      select: { id: true },
    }),
    prisma.offerTranslation.findFirst({
      where: {
        localeCode,
        slug,
        ...(owner.kind === "offer" ? { NOT: { offerId: owner.id } } : {}),
      },
      select: { id: true },
    }),
    prisma.experienceTranslation.findFirst({
      where: {
        localeCode,
        slug,
        ...(owner.kind === "experience" ? { NOT: { experienceId: owner.id } } : {}),
      },
      select: { id: true },
    }),
    prisma.pageTranslation.findFirst({
      where: {
        localeCode,
        slug,
        ...(owner.kind === "page" ? { NOT: { pageId: owner.id } } : {}),
      },
      select: { id: true },
    }),
  ]);

  if (resort) return `That slug is already used by a resort in this language.`;
  if (offer) return `That slug is already used by an offer in this language.`;
  if (experience) return `That slug is already used by an experience in this language.`;
  if (page) return `That slug is already used by a page in this language.`;
  return null;
}
