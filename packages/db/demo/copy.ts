/**
 * Demo copy, English and Arabic.
 *
 * Written rather than machine-filled, and written for Marsa Alam specifically:
 * the house reef, the wadi behind the coast, the Red Sea light. Generic resort
 * copy ("a haven of tranquillity") tells nobody anything and reads the same on
 * every hotel site in the world.
 *
 * The Arabic is written, not translated. A translated brochure reads like a
 * translated brochure; these are the same facts said the way an Arabic speaker
 * would say them.
 *
 * All of it is placeholder until the group supplies its own — the names,
 * counts and distances here are invented and marked as such in the seed's
 * output.
 */

export type Copy = { en: string; ar: string };

export const RESORTS: Record<
  string,
  {
    tagline: Copy;
    short: Copy;
    long: Copy;
  }
> = {
  FANRES: {
    tagline: {
      en: "Where the reef begins at the shoreline",
      ar: "حيث تبدأ الشعاب من حافة الشاطئ",
    },
    short: {
      en: "A low-built resort on a quiet stretch of Marsa Alam coast, with a house reef you can reach without a boat.",
      ar: "منتجع منخفض البناء على شريط هادئ من ساحل مرسى علم، بشعاب مرجانية تصلها سيرًا دون قارب.",
    },
    long: {
      en: `Fantazia Resort sits on a shallow bay where the coral starts a few metres from the sand. Nothing here is more than three storeys, so the buildings stay below the palm line and the sea stays visible from almost everywhere.

The house reef is the reason most guests come back. It runs the length of the property and drops away gradually, which makes it as good for a first snorkel as for a morning dive — you walk in from the beach, and within twenty metres you are over hard coral and reef fish. The dive centre keeps tanks at the jetty and runs two boats a day out to the offshore sites.

Away from the water the resort is deliberately quiet. Three pools, one of them shaded through the afternoon; a spa built into the rock at the back of the site; and enough distance between the rooms that you rarely hear your neighbours. The evening is unhurried — dinner runs late, the bar stays open, and nobody organises anything you have to join.

Marsa Alam airport is roughly an hour south. Transfers meet every flight.`,
      ar: `يقع منتجع فانتازيا على خليج ضحل تبدأ فيه الشعاب المرجانية على بُعد أمتار قليلة من الرمل. لا يتجاوز أي مبنى هنا ثلاثة طوابق، فتبقى المباني تحت خط النخيل ويظل البحر مرئيًا من كل مكان تقريبًا.

الشعاب المنزلية هي سبب عودة معظم النزلاء. تمتد بطول المنتجع وتنحدر تدريجيًا، ما يجعلها مناسبة لأول تجربة سنوركل كما هي مناسبة لغطسة صباحية — تدخل من الشاطئ، وخلال عشرين مترًا تكون فوق مرجان صلب وأسماك الشعاب. مركز الغوص يحتفظ بالأسطوانات عند الرصيف ويسيّر قاربين يوميًا إلى المواقع البعيدة.

بعيدًا عن الماء، المنتجع هادئ بقصد. ثلاثة مسابح، أحدها مظلل طوال فترة الظهيرة؛ ومنتجع صحي مبني داخل الصخر في مؤخرة الموقع؛ ومسافات بين الغرف تكفي لألا تسمع جيرانك. المساء غير مستعجل — العشاء يمتد، والبار يبقى مفتوحًا، ولا أحد ينظّم شيئًا عليك أن تشارك فيه.

مطار مرسى علم على بُعد ساعة تقريبًا جنوبًا، والاستقبال في انتظار كل رحلة.`,
    },
  },

  FANROY: {
    tagline: {
      en: "Adults only, and very little to do",
      ar: "للكبار فقط، وقليل جدًا مما يجب فعله",
    },
    short: {
      en: "The quietest of the three. Adults only, swim-up suites, and a stretch of beach that stays empty.",
      ar: "الأهدأ بين الثلاثة. للكبار فقط، أجنحة بمسابح خاصة، وشاطئ يبقى خاليًا.",
    },
    long: {
      en: `Fantazia Royal was built for people who want less rather than more. It takes adults only, it has fewer rooms than either of its neighbours, and its beach is long enough that you can walk for ten minutes and see nobody.

The suites are the point. Most open onto the pool directly — you step out of the room into the water — and the upper ones look down the coast rather than into another building. Every one has an outdoor shower and a shaded terrace that stays usable in August.

There is a restaurant, a bar, a spa, and a small library nobody expected to be used and which is used constantly. There is no entertainment programme, no scheduled activities, and no announcements. The dive centre at Fantazia Resort is a five-minute buggy ride along the shore, and guests here use it freely.

It is the most expensive of the three and the least busy, which are the same fact stated twice.`,
      ar: `بُني فانتازيا رويال لمن يريد أقل لا أكثر. يستقبل الكبار فقط، وغرفه أقل من جاريه، وشاطئه طويل بما يكفي لتمشي عشر دقائق دون أن ترى أحدًا.

الأجنحة هي جوهر المكان. معظمها يفتح على المسبح مباشرة — تخرج من الغرفة إلى الماء — والعلوية منها تطل على امتداد الساحل لا على مبنى آخر. لكل جناح دُش خارجي وتراس مظلل يظل صالحًا للاستخدام في أغسطس.

هناك مطعم وبار ومنتجع صحي ومكتبة صغيرة لم يتوقع أحد أن تُستخدم، وتُستخدم باستمرار. لا يوجد برنامج ترفيهي ولا أنشطة مجدولة ولا إعلانات. مركز الغوص في منتجع فانتازيا على بُعد خمس دقائق بعربة كهربائية على طول الشاطئ، ونزلاؤنا يستخدمونه بحرية.

هو الأغلى بين الثلاثة والأقل ازدحامًا، وهما الحقيقة نفسها قيلت مرتين.`,
    },
  },

  SIRENA: {
    tagline: {
      en: "Built around the dive centre",
      ar: "مبني حول مركز الغوص",
    },
    short: {
      en: "The diving resort. Tanks at dawn, a jetty you can giant-stride off, and a kitchen that understands a surface interval.",
      ar: "منتجع الغوص. أسطوانات عند الفجر، ورصيف تقفز منه مباشرة، ومطبخ يفهم فترات الراحة بين الغطسات.",
    },
    long: {
      en: `Sirena Resort is organised around the water in a way the other two are not. The dive centre is the first building you reach from the lobby, the compressor runs from five in the morning, and breakfast opens early enough that nobody misses a boat.

The jetty reaches past the reef flat into fifteen metres, which means shore dives here are proper dives rather than shallow swims. Elphinstone is under an hour by boat in good weather, and the local sites — the wall north of the property, the seagrass bay to the south where turtles feed — are ten minutes.

Rooms are simpler than at the other two resorts and the resort makes no apology for it: most guests are here for six days of diving and want somewhere comfortable to sleep, a hot shower, and space to hang a wetsuit. The suites at the north end are larger and quieter for anyone who wants both.

The kitchen keeps food available between the dive schedules rather than only at fixed hours, which sounds minor and is the thing repeat guests mention most.`,
      ar: `منتجع سيرينا منظّم حول الماء بطريقة لا تشبه المنتجعين الآخرين. مركز الغوص هو أول مبنى تصل إليه من البهو، والضاغط يعمل من الخامسة صباحًا، والإفطار يفتح مبكرًا بما يكفي ألا يفوت أحدًا قارب.

يمتد الرصيف إلى ما بعد مسطح الشعاب حتى عمق خمسة عشر مترًا، ما يجعل الغوص من الشاطئ هنا غوصًا حقيقيًا لا سباحة سطحية. إلفنستون على بُعد أقل من ساعة بالقارب في الطقس الجيد، والمواقع القريبة — الجدار شمال المنتجع، وخليج الأعشاب البحرية جنوبًا حيث ترعى السلاحف — على بُعد عشر دقائق.

الغرف أبسط مما هي عليه في المنتجعين الآخرين، والمنتجع لا يعتذر عن ذلك: معظم النزلاء هنا لستة أيام من الغوص، ويريدون مكانًا مريحًا للنوم، ودُشًا ساخنًا، ومساحة لتعليق بدلة الغوص. الأجنحة في الطرف الشمالي أوسع وأهدأ لمن يريد الاثنين معًا.

المطبخ يبقي الطعام متاحًا بين جداول الغوص لا في ساعات ثابتة فقط، وهو أمر يبدو صغيرًا وهو أكثر ما يذكره النزلاء العائدون.`,
    },
  },
};

export const ROOMS: Record<string, { description: Copy }> = {
  "Garden Room": {
    description: {
      en: "Ground floor, opening onto planted garden rather than a corridor. Quiet, shaded through the afternoon, and a two-minute walk from the beach.",
      ar: "في الطابق الأرضي، تفتح على حديقة مزروعة لا على ممر. هادئة، مظللة طوال فترة الظهيرة، وعلى بُعد دقيقتين سيرًا من الشاطئ.",
    },
  },
  "Sea View Room": {
    description: {
      en: "Upper floor with an unbroken view down the bay. The balcony is deep enough to sit out on properly, and faces the sunrise over the reef.",
      ar: "في طابق علوي بإطلالة متصلة على الخليج. الشرفة عميقة بما يكفي للجلوس فيها فعلًا، وتواجه شروق الشمس فوق الشعاب.",
    },
  },
  "Family Suite": {
    description: {
      en: "Two rooms and a door between them, which is the part that matters. Sleeps five, with a bath as well as a shower and a terrace big enough for a cot.",
      ar: "غرفتان وباب بينهما، وهو الجزء المهم. تتسع لخمسة، وفيها بانيو إضافة إلى الدُش، وتراس يتسع لسرير طفل.",
    },
  },
  "Deluxe Room": {
    description: {
      en: "Larger than the standard rooms, with a seating area that is genuinely usable and a terrace facing the water.",
      ar: "أوسع من الغرف العادية، بمنطقة جلوس قابلة للاستخدام فعلًا وتراس يواجه الماء.",
    },
  },
  "Swim-up Suite": {
    description: {
      en: "Step from the terrace straight into the pool. Adults only, screened from the path, with an outdoor shower and a day bed under shade.",
      ar: "تخرج من التراس إلى المسبح مباشرة. للكبار فقط، محجوبة عن الممر، بدُش خارجي وسرير نهاري تحت الظل.",
    },
  },
  "Reef Room": {
    description: {
      en: "Closest to the dive centre, with a rinse tank outside the door and somewhere to hang a wetsuit that is not the bathroom.",
      ar: "الأقرب إلى مركز الغوص، بحوض شطف خارج الباب ومكان لتعليق بدلة الغوص غير الحمام.",
    },
  },
  "Jetty Suite": {
    description: {
      en: "At the north end, furthest from the compressor and nearest the wall. Larger, quieter, and still ninety seconds from the tanks.",
      ar: "في الطرف الشمالي، الأبعد عن الضاغط والأقرب إلى الجدار. أوسع وأهدأ، وما زالت على بُعد تسعين ثانية من الأسطوانات.",
    },
  },
};

export const RESTAURANTS: {
  resortCode: string;
  cuisine: string;
  dressCode: string;
  openingHours: string;
  /// One slug for every language. Arabic gets a Latin one too — an Arabic slug
  /// is percent-encoded into unreadability the moment it is shared.
  slug: string;
  name: Copy;
  description: Copy;
}[] = [
  {
    resortCode: "FANRES",
    cuisine: "Egyptian and Levantine",
    dressCode: "Casual",
    openingHours: "07:00–10:30, 12:30–15:00, 19:00–22:30",
    slug: "sagia",
    name: { en: "Sagia", ar: "ساقية" },
    description: {
      en: "The main restaurant, open to the sea on three sides. Bread comes out of a wood oven all day, and the mezze counter is rebuilt for every service rather than topped up.",
      ar: "المطعم الرئيسي، مفتوح على البحر من ثلاث جهات. الخبز يخرج من فرن الحطب طوال اليوم، وطاولة المزّة تُعاد من جديد كل وجبة لا تُستكمل.",
    },
  },
  {
    resortCode: "FANRES",
    cuisine: "Seafood",
    dressCode: "Smart casual",
    openingHours: "19:00–23:00, closed Mondays",
    slug: "blue-hour",
    name: { en: "Blue Hour", ar: "الساعة الزرقاء" },
    description: {
      en: "On the jetty, twelve tables, and whatever the boats brought in. Booking is essential in season and the last sitting is the one to take.",
      ar: "على الرصيف، اثنتا عشرة طاولة، وما جاءت به القوارب. الحجز ضروري في الموسم، والجلسة الأخيرة هي التي تستحق.",
    },
  },
  {
    resortCode: "FANROY",
    cuisine: "Mediterranean",
    dressCode: "Smart casual",
    openingHours: "07:30–10:30, 19:30–22:30",
    slug: "almaz",
    name: { en: "Almaz", ar: "ألماز" },
    description: {
      en: "One room, one menu that changes weekly, and no buffet. Dinner is served rather than collected, which is the whole idea.",
      ar: "قاعة واحدة، وقائمة تتغير أسبوعيًا، ولا بوفيه. العشاء يُقدَّم لا يُجمَع، وهذه هي الفكرة كلها.",
    },
  },
  {
    resortCode: "SIRENA",
    cuisine: "International",
    dressCode: "Casual",
    openingHours: "05:30–23:00",
    slug: "surface-interval",
    name: { en: "The Surface Interval", ar: "فترة السطح" },
    description: {
      en: "Open from before the first boat until after the night dive. Hot food at every hour a diver might want it, which no schedule can predict.",
      ar: "مفتوح من قبل أول قارب حتى بعد الغطسة الليلية. طعام ساخن في كل ساعة قد يحتاجها غطاس، وهو ما لا يتنبأ به جدول.",
    },
  },
];

export const EXPERIENCES: Record<string, { short: Copy; long: Copy }> = {
  diving: {
    short: {
      en: "Two boats a day, a house reef you can walk into, and instructors who have been here long enough to know where the turtles feed.",
      ar: "قاربان يوميًا، وشعاب منزلية تدخلها سيرًا، ومدربون قضوا هنا ما يكفي ليعرفوا أين ترعى السلاحف.",
    },
    long: {
      en: `The diving is the reason this stretch of coast has a reputation. The reef runs almost unbroken along the shore, which means you can dive from the beach on a day the boats stay in, and the offshore sites are close enough that a morning trip is a morning rather than a day.

Courses run from first-time try-dives in the pool through to divemaster. Equipment is serviced on site and nitrox is available at every level. If you are certified and want no instruction at all, that is fine too — sign the paperwork, take a buddy, and walk in.`,
      ar: `الغوص هو سبب سمعة هذا الشريط من الساحل. تمتد الشعاب شبه متصلة بمحاذاة الشاطئ، ما يعني أنك تستطيع الغوص من الشاطئ في يوم تبقى فيه القوارب راسية، والمواقع البعيدة قريبة بما يكفي لتكون الرحلة الصباحية صباحًا لا يومًا كاملًا.

الدورات تبدأ من الغطسة التجريبية الأولى في المسبح وحتى مستوى مساعد المدرب. المعدات تُصان في الموقع، والنيتروكس متاح في كل المستويات. وإن كنت حاصلًا على رخصة ولا تريد أي إرشاد، فهذا مقبول أيضًا — وقّع الأوراق، خذ رفيقًا، وادخل الماء.`,
    },
  },
};

/** Long-form page bodies, keyed by the page's key in the seed. */
export const PAGES: Record<string, { title: Copy; body: Copy }> = {
  about: {
    title: { en: "About the group", ar: "عن المجموعة" },
    body: {
      en: `Fantazia Hotels runs three resorts on the same stretch of the Marsa Alam coast, within a few minutes of one another. They share a dive centre, a transfer service and a reservations team, and almost nothing else — each was built for a different kind of stay, and we have resisted every suggestion to make them more alike.

We are a small group and intend to stay one. Everything here is run by people who live on this coast, and the reef in front of the properties is the same reef our staff dive on their days off. That is not a marketing line; it is the reason the house reef is in the condition it is in.`,
      ar: `تدير فانتازيا للفنادق ثلاثة منتجعات على الشريط نفسه من ساحل مرسى علم، تفصل بينها دقائق. تتشارك مركز غوص وخدمة انتقالات وفريق حجوزات، ولا تكاد تتشارك شيئًا آخر — بُني كل منها لنوع مختلف من الإقامة، وقاومنا كل اقتراح بجعلها أكثر تشابهًا.

نحن مجموعة صغيرة وننوي أن نبقى كذلك. كل شيء هنا يديره أناس يعيشون على هذا الساحل، والشعاب أمام المنتجعات هي الشعاب نفسها التي يغوص فيها موظفونا في أيام إجازاتهم. هذه ليست عبارة تسويقية؛ إنها سبب بقاء الشعاب المنزلية على حالها.`,
    },
  },
  contact: {
    title: { en: "Contact", ar: "اتصل بنا" },
    body: {
      en: `Reservations answer between 08:00 and 22:00 Cairo time, every day, in Arabic and English.

For an existing booking, quote your reference — it begins with FNT — and we can find it immediately. For anything else, tell us your dates and how many of you there are, and we will tell you honestly which of the three suits you, including when the answer is none of them.`,
      ar: `يجيب فريق الحجوزات بين الثامنة صباحًا والعاشرة مساءً بتوقيت القاهرة، كل يوم، بالعربية والإنجليزية.

لحجز قائم، اذكر رقمك المرجعي — يبدأ بـ FNT — وسنجده فورًا. ولأي أمر آخر، أخبرنا بتواريخك وعددكم، وسنقول لك بصدق أي المنتجعات الثلاثة يناسبك، بما في ذلك حين تكون الإجابة لا أحد منها.`,
    },
  },
};
