/**
 * Seed — Fantazia Hotels & Resorts, Marsa Alam.
 *
 * Three real resorts, one destination. Everything here is a database row, so
 * names, copy, rates, and structure are all editable from admin later.
 *
 * Copy and figures are placeholders pending the group's own content.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EN = "en";
const AR = "ar";

async function main() {
  console.log("Seeding…");

  // ---------- locales ----------
  await db.locale.upsert({
    where: { code: EN },
    update: {},
    create: {
      code: EN, name: "English", nativeName: "English", direction: "ltr",
      script: "latin", isDefault: true, isEnabled: true, displayOrder: 0,
    },
  });
  await db.locale.upsert({
    where: { code: AR },
    update: {},
    create: {
      code: AR, name: "Arabic", nativeName: "العربية", direction: "rtl",
      script: "arabic", isDefault: false, isEnabled: true,
      fallbackCode: EN, displayOrder: 1,
    },
  });
  // Ready but not enabled — they appear once translation passes the publish gate.
  for (const [i, l] of [
    ["de", "German", "Deutsch", "latin"],
    ["ru", "Russian", "Русский", "cyrillic"],
    ["fr", "French", "Français", "latin"],
  ].entries()) {
    await db.locale.upsert({
      where: { code: l[0]! },
      update: {},
      create: {
        code: l[0]!, name: l[1]!, nativeName: l[2]!, direction: "ltr",
        script: l[3]!, isEnabled: false, fallbackCode: EN, displayOrder: 2 + i,
      },
    });
  }

  // ---------- site modules ----------
  const modules: [string, boolean, number][] = [
    ["hero", true, 0],
    ["manifesto", true, 1],
    ["resorts", true, 2],
    ["reef", true, 3],
    ["stats", true, 4],
    ["experiences", true, 5],
    ["offers", true, 6],
    ["weddings", true, 7],
    // Off: three resorts in one destination, so the section earns nothing.
    // The Destination entities exist and wait for a fourth resort elsewhere.
    ["destinations", false, 8],
    ["newsletter", false, 9],
  ];
  for (const [key, enabled, displayOrder] of modules) {
    await db.siteModule.upsert({
      where: { key }, update: {}, create: { key, enabled, displayOrder },
    });
  }

  // ---------- destination ----------
  const marsaAlam = await db.destination.upsert({
    where: { code: "MARSA_ALAM" },
    update: {},
    create: {
      code: "MARSA_ALAM", country: "EG", latitude: 25.0657, longitude: 34.8901,
      displayOrder: 0, status: "published",
      translations: {
        create: [
          {
            localeCode: EN, name: "Marsa Alam", slug: "marsa-alam",
            description:
              "The clearest water on the Egyptian coast, and almost none of the crowd that finds it.",
            metaTitle: "Marsa Alam — Fantazia Hotels & Resorts",
            metaDescription:
              "Three resorts on one stretch of Red Sea coast at Marsa Alam, with a house reef forty metres from the beach.",
          },
          {
            localeCode: AR, name: "مرسى علم", slug: "marsa-alam-ar",
            description: "أصفى مياه على الساحل المصري، وبلا زحام يُذكر.",
            metaTitle: "مرسى علم — فنادق ومنتجعات فانتازيا",
          },
        ],
      },
    },
  });

  // ---------- amenities ----------
  const amenityDefs: [string, string, string][] = [
    ["house_reef", "House reef", "شعاب أمام الفندق"],
    ["all_inclusive", "All inclusive", "شامل كليًا"],
    ["half_board", "Half board", "نصف إقامة"],
    ["dive_centre", "Dive centre", "مركز غوص"],
    ["family_pools", "Family pools", "حمامات سباحة عائلية"],
    ["swim_up", "Swim-up suites", "أجنحة بمسبح خاص"],
    ["spa", "Spa", "سبا"],
    ["kids_club", "Kids club", "نادي الأطفال"],
    ["jetty", "Jetty access", "رصيف بحري"],
    ["private_beach", "Private beach", "شاطئ خاص"],
  ];
  const amenityIds: Record<string, string> = {};
  for (const [i, [code, en, ar]] of amenityDefs.entries()) {
    const a = await db.amenity.upsert({
      where: { code }, update: {},
      create: {
        code, displayOrder: i,
        translations: { create: [{ localeCode: EN, name: en }, { localeCode: AR, name: ar }] },
      },
    });
    amenityIds[code] = a.id;
  }

  // ---------- resorts ----------
  const resortDefs = [
    {
      code: "FANRES", order: 0, stars: 5, fromRateMinor: 390000,
      amenities: ["house_reef", "all_inclusive", "family_pools", "private_beach"],
      en: {
        name: "Fantazia Resort", slug: "fantazia-resort",
        tagline: "The original house on the bay",
        short: "Wide gardens, a long beach, and the shortest walk to the reef of the three.",
        desc: "The first of the three, and still the one closest to the water. Gardens run the length of the beach, and the house reef begins forty metres from the last sunbed.",
      },
      ar: {
        name: "منتجع فانتازيا", slug: "fantazia-resort-ar",
        tagline: "البيت الأول على الخليج",
        short: "حدائق واسعة وشاطئ طويل، وأقصر طريق إلى الشعاب بين الثلاثة.",
      },
    },
    {
      code: "FANROY", order: 1, stars: 5, fromRateMinor: 540000,
      amenities: ["swim_up", "all_inclusive", "spa", "private_beach"],
      en: {
        name: "Fantazia Royal", slug: "fantazia-royal",
        tagline: "Quieter, and larger-roomed",
        short: "Swim-up suites, a longer pool, and dinner served later.",
        desc: "The sister house next door, built for people who want the same sea with fewer people in it. Suites open onto their own stretch of pool.",
      },
      ar: {
        name: "فانتازيا رويال", slug: "fantazia-royal-ar",
        tagline: "أهدأ، وغرف أوسع",
        short: "أجنحة بمسبح خاص، ومسبح أطول، وعشاء يُقدَّم في وقت متأخر.",
      },
    },
    {
      code: "SIRENA", order: 2, stars: 5, fromRateMinor: 430000,
      amenities: ["dive_centre", "jetty", "half_board", "house_reef"],
      en: {
        name: "Sirena Resort", slug: "sirena-resort",
        tagline: "Built around the dive centre",
        short: "A jetty straight onto the drop-off, and tanks filled before sunrise.",
        desc: "The dive base of the group. The jetty reaches past the shallows to the drop-off, so the first dive of the day needs no boat and no transfer.",
      },
      ar: {
        name: "منتجع سيرينا", slug: "sirena-resort-ar",
        tagline: "مبني حول مركز الغوص",
        short: "رصيف يصل مباشرة إلى حافة الشعاب، وأسطوانات جاهزة قبل الشروق.",
      },
    },
  ];

  const resortIds: Record<string, string> = {};
  for (const r of resortDefs) {
    const resort = await db.resort.upsert({
      where: { code: r.code },
      update: {},
      create: {
        code: r.code, destinationId: marsaAlam.id, starRating: r.stars,
        latitude: 25.0657, longitude: 34.8901, currency: "EGP",
        displayOrder: r.order, status: "published", fromRateMinor: r.fromRateMinor,
        translations: {
          create: [
            {
              localeCode: EN, name: r.en.name, slug: r.en.slug, tagline: r.en.tagline,
              shortDescription: r.en.short, description: r.en.desc,
              metaTitle: `${r.en.name} — Marsa Alam`,
              metaDescription: r.en.short,
            },
            {
              localeCode: AR, name: r.ar.name, slug: r.ar.slug, tagline: r.ar.tagline,
              shortDescription: r.ar.short,
            },
          ],
        },
        amenities: { create: r.amenities.map((c) => ({ amenityId: amenityIds[c]! })) },
      },
    });
    resortIds[r.code] = resort.id;
  }

  // ---------- room types ----------
  const roomDefs: [string, string, string, string, number, number, number][] = [
    ["FANRES", "Garden Room", "غرفة على الحديقة", "garden-room", 2, 1, 390000],
    ["FANRES", "Sea View Room", "غرفة بإطلالة بحرية", "sea-view-room", 2, 2, 470000],
    ["FANRES", "Family Suite", "جناح عائلي", "family-suite", 2, 3, 640000],
    ["FANROY", "Deluxe Room", "غرفة ديلوكس", "deluxe-room", 2, 1, 540000],
    ["FANROY", "Swim-up Suite", "جناح بمسبح خاص", "swim-up-suite", 2, 2, 820000],
    ["SIRENA", "Reef Room", "غرفة الشعاب", "reef-room", 2, 1, 430000],
    ["SIRENA", "Jetty Suite", "جناح الرصيف", "jetty-suite", 2, 2, 690000],
  ];
  for (const [i, [resortCode, en, ar, slug, adults, children, rate]] of roomDefs.entries()) {
    const resortId = resortIds[resortCode]!;
    const existing = await db.roomType.findFirst({
      where: { resortId, translations: { some: { localeCode: EN, slug } } },
    });
    if (existing) continue;
    await db.roomType.create({
      data: {
        resortId, maxAdults: adults, maxChildren: children,
        maxOccupancy: adults + children, displayOrder: i, fromRateMinor: rate,
        translations: {
          create: [
            { localeCode: EN, name: en, slug },
            { localeCode: AR, name: ar, slug: `${slug}-ar` },
          ],
        },
      },
    });
  }

  // ---------- experiences ----------
  const expDefs = [
    ["HOUSE_REEF", "water", "The house reef", "house-reef", "Snorkel from the beach, any hour",
      "شعاب الفندق", "غطس من الشاطئ في أي وقت"],
    ["DOLPHIN_HOUSE", "water", "Dolphin house", "dolphin-house", "A boat day out to Sataya",
      "بيت الدلافين", "رحلة بحرية إلى ساتايا"],
    ["WADI_DESERT", "desert", "Wadi & desert", "wadi-desert", "Wadi El Gemal, and a night of stars",
      "الوادي والصحراء", "وادي الجمال، وليلة تحت النجوم"],
    ["SUNSET_SAIL", "water", "Sunset sail", "sunset-sail", "Two hours, no engine",
      "إبحار الغروب", "ساعتان بلا محرك"],
  ];
  for (const [i, [code, category, en, slug, summary, arName, arSummary]] of expDefs.entries()) {
    await db.experience.upsert({
      where: { code: code! }, update: {},
      create: {
        code: code!, category: category!, displayOrder: i, status: "published",
        translations: {
          create: [
            { localeCode: EN, name: en!, slug: slug!, summary: summary! },
            { localeCode: AR, name: arName!, slug: `${slug}-ar`, summary: arSummary! },
          ],
        },
      },
    });
  }

  // ---------- offers ----------
  const offerDefs = [
    ["REEF7", "Stay a week, dive for free", "reef-week", "Seven nights or more",
      "Book seven nights at any of the three and the house-reef dive package is included, tanks and guide.",
      "أسبوع إقامة، وغوص مجاني", "سبع ليالٍ أو أكثر"],
    ["DIRECT15", "Book direct, save 15%", "direct-15", "Year-round",
      "Fifteen per cent below every other channel, and a room held for you until four on the day you leave.",
      "احجز مباشرة ووفّر ١٥٪", "طوال العام"],
    ["FAMILY", "Kids stay free", "kids-free", "May to September",
      "Two children under twelve stay and eat free in your room, with the kids club open through the summer.",
      "الأطفال ضيوفنا", "من مايو إلى سبتمبر"],
  ];
  for (const [i, [promo, en, slug, validity, desc, arTitle, arValidity]] of offerDefs.entries()) {
    const existing = await db.offer.findFirst({
      where: { translations: { some: { localeCode: EN, slug: slug! } } },
    });
    if (existing) continue;
    await db.offer.create({
      data: {
        promoCode: promo, resortId: null, displayOrder: i, status: "published",
        translations: {
          create: [
            { localeCode: EN, title: en!, slug: slug!, summary: desc!, validityLabel: validity! },
            { localeCode: AR, title: arTitle!, slug: `${slug}-ar`, validityLabel: arValidity! },
          ],
        },
      },
    });
  }

  // ---------- content pages ----------
  const pageDefs: [string, string, string, string, boolean][] = [
    ["about", "About the group", "about", "من نحن", true],
    ["contact", "Contact", "contact", "اتصل بنا", true],
    ["careers", "Careers", "careers", "الوظائف", true],
    ["terms", "Terms & conditions", "terms", "الشروط والأحكام", true],
    ["privacy", "Privacy", "privacy", "الخصوصية", true],
    ["cancellation-policy", "Cancellation policy", "cancellation-policy", "سياسة الإلغاء", true],
    ["press", "Press", "press", "الأخبار", false],
  ];
  for (const [key, title, slug, arTitle, published] of pageDefs) {
    await db.page.upsert({
      where: { key }, update: {},
      create: {
        key, status: published ? "published" : "draft",
        publishedAt: published ? new Date() : null,
        translations: {
          create: [
            { localeCode: EN, title, slug, blocks: [{ type: "richText", props: { html: `<p>${title}</p>` } }] },
            { localeCode: AR, title: arTitle, slug: `${slug}-ar`, blocks: [] },
          ],
        },
      },
    });
  }

  // ---------- menus ----------
  const aboutPage = await db.page.findUnique({ where: { key: "about" } });
  const contactPage = await db.page.findUnique({ where: { key: "contact" } });
  const cancelPage = await db.page.findUnique({ where: { key: "cancellation-policy" } });
  const privacyPage = await db.page.findUnique({ where: { key: "privacy" } });

  const primary = await db.menu.upsert({
    where: { key: "primary" }, update: {},
    create: { key: "primary", name: "Primary navigation", maxDepth: 1 },
  });
  await db.menuItem.deleteMany({ where: { menuId: primary.id } });

  const resortsParent = await db.menuItem.create({
    data: { menuId: primary.id, position: 0, targetType: "route", route: "/resorts" },
  });
  let pos = 1;
  for (const code of ["FANRES", "FANROY", "SIRENA"]) {
    await db.menuItem.create({
      data: {
        menuId: primary.id, parentId: resortsParent.id, position: pos++,
        targetType: "resort", resortId: resortIds[code]!,
      },
    });
  }
  for (const route of ["/diving", "/experiences", "/offers", "/weddings"]) {
    await db.menuItem.create({
      data: { menuId: primary.id, position: pos++, targetType: "route", route },
    });
  }
  if (aboutPage) {
    await db.menuItem.create({
      data: { menuId: primary.id, position: pos++, targetType: "page", pageId: aboutPage.id },
    });
  }

  const utility = await db.menu.upsert({
    where: { key: "utility" }, update: {},
    create: { key: "utility", name: "Utility bar", maxDepth: 0 },
  });
  await db.menuItem.deleteMany({ where: { menuId: utility.id } });
  await db.menuItem.create({
    data: { menuId: utility.id, position: 0, targetType: "route", route: "/my-booking" },
  });
  if (contactPage) {
    await db.menuItem.create({
      data: { menuId: utility.id, position: 1, targetType: "page", pageId: contactPage.id },
    });
  }

  const footerC = await db.menu.upsert({
    where: { key: "footer_c" }, update: {},
    create: { key: "footer_c", name: "Footer — Support", maxDepth: 0 },
  });
  await db.menuItem.deleteMany({ where: { menuId: footerC.id } });
  let fpos = 0;
  await db.menuItem.create({
    data: { menuId: footerC.id, position: fpos++, targetType: "route", route: "/my-booking" },
  });
  for (const p of [contactPage, cancelPage, privacyPage]) {
    if (p) {
      await db.menuItem.create({
        data: { menuId: footerC.id, position: fpos++, targetType: "page", pageId: p.id },
      });
    }
  }

  // ---------- roles & permissions ----------
  const permissions: [string, string][] = [
    ["content:read", "View content"],
    ["content:write", "Create and edit content"],
    ["content:publish", "Publish content"],
    ["translations:write", "Edit translations"],
    ["locales:manage", "Add and enable languages"],
    ["menus:write", "Edit navigation menus"],
    ["modules:write", "Switch site sections on and off"],
    ["media:write", "Upload and manage media"],
    ["users:manage", "Manage staff accounts and roles"],
    ["audit:read", "Read the audit log"],
  ];
  for (const [key, description] of permissions) {
    await db.permission.upsert({ where: { key }, update: {}, create: { key, description } });
  }

  const roles: [string, string, string, string[]][] = [
    ["SUPER_ADMIN", "Super admin", "group", permissions.map((p) => p[0])],
    ["GROUP_ADMIN", "Group admin", "group",
      ["content:read", "content:write", "content:publish", "translations:write",
       "locales:manage", "menus:write", "modules:write", "media:write", "audit:read"]],
    ["RESORT_ADMIN", "Resort admin", "resort",
      ["content:read", "content:write", "media:write"]],
    ["CONTENT_MANAGER", "Content manager", "group",
      ["content:read", "content:write", "content:publish", "translations:write",
       "menus:write", "media:write"]],
    ["TRANSLATOR", "Translator", "group", ["content:read", "translations:write"]],
    ["READ_ONLY", "Read only", "resort", ["content:read"]],
  ];
  for (const [key, name, scope, perms] of roles) {
    await db.role.upsert({
      where: { key }, update: {},
      create: {
        key, name, scope,
        permissions: { create: perms.map((permissionKey) => ({ permissionKey })) },
      },
    });
  }

  console.log("Seeded:");
  console.log(`  locales      ${await db.locale.count()} (2 enabled)`);
  console.log(`  destinations ${await db.destination.count()}`);
  console.log(`  resorts      ${await db.resort.count()}`);
  console.log(`  room types   ${await db.roomType.count()}`);
  console.log(`  experiences  ${await db.experience.count()}`);
  console.log(`  offers       ${await db.offer.count()}`);
  console.log(`  pages        ${await db.page.count()}`);
  console.log(`  menu items   ${await db.menuItem.count()}`);
  console.log(`  modules      ${await db.siteModule.count()} (destinations off)`);
  console.log(`  roles        ${await db.role.count()}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
