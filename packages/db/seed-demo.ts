/**
 * Demo content: images and copy, so the site can be judged with something in it.
 *
 * Two rules govern this file.
 *
 * Everything it writes is marked. Images carry `isPlaceholder`, so "how many
 * placeholders are still live" has an answer rather than needing a hunt. Demo
 * content has a habit of surviving into production and a hotel group launching
 * on generated gradients is a bad day.
 *
 * It goes in through the real pipelines. Images are stored with `storeImage`,
 * which means the same four widths, the same WebP and AVIF derivatives, the
 * same EXIF stripping and the same inline placeholder as an upload — so this
 * exercises the media path rather than working around it.
 *
 *   pnpm --filter @fantazia/db seed:demo
 *   pnpm --filter @fantazia/db seed:demo -- --clear   # take it all back out
 */
import { prisma } from "./src/index";
import { storeImage, deleteMedia } from "@fantazia/media/store";
import { makePlaceholder, makeRoomPlaceholder } from "./demo/images";
import { RESORTS, ROOMS, RESTAURANTS, EXPERIENCES, PAGES } from "./demo/copy";

const CLEAR = process.argv.includes("--clear");

/** Stores one generated image and records it, flagged. */
async function placeholder(subject: string, alt: { en: string; ar: string }, room = false) {
  const existing = await prisma.mediaAsset.findFirst({
    where: { originalName: `placeholder-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.jpg` },
  });
  if (existing) return existing;

  const file = room ? await makeRoomPlaceholder(subject) : await makePlaceholder(subject);
  const stored = await storeImage(file);

  return prisma.mediaAsset.create({
    data: {
      storageKey: stored.storageKey,
      mime: stored.mime,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      placeholder: stored.placeholder,
      originalName: file.originalName,
      isPlaceholder: true,
      // The alt text says what it is. A screen reader should never be told a
      // gradient is a photograph of a reef, and this is what an editor sees in
      // the library when deciding what still needs replacing.
      translations: {
        create: [
          { localeCode: "en", alt: `Placeholder — replace with photography of ${alt.en}` },
          { localeCode: "ar", alt: `صورة مؤقتة — استبدلها بتصوير ${alt.ar}` },
        ],
      },
    },
  });
}

async function clearDemo() {
  const assets = await prisma.mediaAsset.findMany({ where: { isPlaceholder: true } });
  for (const asset of assets) {
    await deleteMedia(asset.storageKey).catch(() => undefined);
  }
  const { count } = await prisma.mediaAsset.deleteMany({ where: { isPlaceholder: true } });
  await prisma.restaurant.deleteMany({});
  console.log(`Removed ${count} placeholder image(s) and every demo restaurant.`);
  console.log("Written copy is left in place — it is on the resorts themselves, not separable.");
}

async function main() {
  if (CLEAR) {
    await clearDemo();
    await prisma.$disconnect();
    return;
  }

  const resorts = await prisma.resort.findMany({
    include: { roomTypes: { include: { translations: { where: { localeCode: "en" } } } } },
  });
  if (resorts.length === 0) throw new Error("Seed the content first: pnpm db:seed");

  const locales = (await prisma.locale.findMany({ where: { code: { in: ["en", "ar"] } } })).map((l) => l.code);
  let images = 0;

  /* ---------- resorts: hero, gallery, and real copy ---------- */
  for (const resort of resorts) {
    const copy = RESORTS[resort.code];
    if (!copy) {
      console.log(`  ${resort.code}: no copy written for this code — skipped`);
      continue;
    }

    const hero = await placeholder(`${resort.code} hero`, {
      en: `${resort.code} seen from the beach`,
      ar: `${resort.code} من الشاطئ`,
    });
    images++;

    await prisma.resort.update({ where: { id: resort.id }, data: { heroMediaId: hero.id } });

    // Four gallery images each, so the layout is exercised with more than one.
    for (const [index, what] of ["pool", "beach", "reef", "terrace"].entries()) {
      const asset = await placeholder(`${resort.code} ${what}`, {
        en: `the ${what} at ${resort.code}`,
        ar: `${what} في ${resort.code}`,
      });
      images++;
      await prisma.resortMedia.upsert({
        where: { resortId_mediaId: { resortId: resort.id, mediaId: asset.id } },
        update: { displayOrder: index },
        create: { resortId: resort.id, mediaId: asset.id, displayOrder: index },
      });
    }

    for (const locale of locales) {
      const key = locale === "ar" ? "ar" : "en";
      await prisma.resortTranslation.update({
        where: { resortId_localeCode: { resortId: resort.id, localeCode: locale } },
        data: {
          tagline: copy.tagline[key],
          shortDescription: copy.short[key],
          description: copy.long[key],
        },
      });
    }

    /* ---------- rooms ---------- */
    for (const room of resort.roomTypes) {
      const name = room.translations[0]?.name;
      const roomCopy = name ? ROOMS[name] : undefined;

      const asset = await placeholder(`${resort.code} ${name ?? room.id}`, {
        en: `${name ?? "the room"} at ${resort.code}`,
        ar: `${name ?? "الغرفة"} في ${resort.code}`,
      }, true);
      images++;
      await prisma.roomTypeMedia.upsert({
        where: { roomTypeId_mediaId: { roomTypeId: room.id, mediaId: asset.id } },
        update: {},
        create: { roomTypeId: room.id, mediaId: asset.id, displayOrder: 0 },
      });

      if (!roomCopy) continue;
      for (const locale of locales) {
        const key = locale === "ar" ? "ar" : "en";
        await prisma.roomTypeTranslation.updateMany({
          where: { roomTypeId: room.id, localeCode: locale },
          data: { description: roomCopy.description[key] },
        });
      }
    }
  }

  /* ---------- restaurants, of which there were none ---------- */
  let restaurants = 0;
  for (const [index, entry] of RESTAURANTS.entries()) {
    const resort = resorts.find((r) => r.code === entry.resortCode);
    if (!resort) continue;

    const existing = await prisma.restaurantTranslation.findFirst({
      where: { localeCode: "en", name: entry.name.en, restaurant: { resortId: resort.id } },
      select: { restaurantId: true },
    });
    if (existing) continue;

    const hero = await placeholder(`restaurant ${entry.name.en}`, {
      en: `${entry.name.en}, the restaurant`,
      ar: `مطعم ${entry.name.ar}`,
    });
    images++;

    await prisma.restaurant.create({
      data: {
        resortId: resort.id,
        cuisine: entry.cuisine,
        dressCode: entry.dressCode,
        openingHours: entry.openingHours,
        heroMediaId: hero.id,
        displayOrder: index,
        status: "published",
        translations: {
          create: locales.map((locale) => {
            const key = locale === "ar" ? "ar" : "en";
            return {
              localeCode: locale,
              name: entry.name[key],
              // Latin slug in both languages: Arabic in a URL becomes
              // percent-encoded gibberish the moment anyone shares it.
              slug: locale === "ar" ? `${entry.slug}-ar` : entry.slug,
              description: entry.description[key],
            };
          }),
        },
      },
    });
    restaurants++;
  }

  /* ---------- experiences and pages ---------- */
  for (const experience of await prisma.experience.findMany({
    include: { translations: { where: { localeCode: "en" } } },
  })) {
    const slug = experience.translations[0]?.slug ?? "";
    const copy = EXPERIENCES[slug] ?? EXPERIENCES.diving!;

    if (!experience.heroMediaId) {
      const asset = await placeholder(`experience ${slug || experience.id}`, {
        en: slug || "the experience",
        ar: slug || "التجربة",
      });
      images++;
      await prisma.experience.update({ where: { id: experience.id }, data: { heroMediaId: asset.id } });
    }

    for (const locale of locales) {
      const key = locale === "ar" ? "ar" : "en";
      await prisma.experienceTranslation.updateMany({
        where: { experienceId: experience.id, localeCode: locale },
        data: { summary: copy.short[key], description: copy.long[key] },
      });
    }
  }

  for (const offer of await prisma.offer.findMany()) {
    if (offer.heroMediaId) continue;
    const asset = await placeholder(`offer ${offer.id.slice(-6)}`, {
      en: "the offer", ar: "العرض",
    });
    images++;
    await prisma.offer.update({ where: { id: offer.id }, data: { heroMediaId: asset.id } });
  }

  let pages = 0;
  for (const [key, copy] of Object.entries(PAGES)) {
    const page = await prisma.page.findFirst({ where: { key } });
    if (!page) continue;
    for (const locale of locales) {
      const lang = locale === "ar" ? "ar" : "en";
      await prisma.pageTranslation.updateMany({
        where: { pageId: page.id, localeCode: locale },
        data: {
          title: copy.title[lang],
          blocks: [{ type: "prose", text: copy.body[lang] }] as never,
        },
      });
    }
    pages++;
  }

  const total = await prisma.mediaAsset.count({ where: { isPlaceholder: true } });
  console.log(`\n  ${images} images placed (${total} placeholders in the library)`);
  console.log(`  ${restaurants} restaurants added`);
  console.log(`  ${pages} pages rewritten`);
  console.log(`  copy rewritten for ${Object.keys(RESORTS).length} resorts, in English and Arabic`);
  console.log(`\n  Everything above is PLACEHOLDER. The names, distances and dive sites are`);
  console.log(`  invented. Replace before launch — the images are flagged in the library and`);
  console.log(`  'pnpm --filter @fantazia/db seed:demo -- --clear' takes them all back out.\n`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
