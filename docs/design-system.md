# Design Direction & System

The reference study of rotana.com informed the **information architecture and component
vocabulary**. Branding, palette, typography, copy, imagery, and layout below are original.

## 1. The direction: colour carries the brand, not photography

An earlier draft proposed an almost achromatic interface where photography supplied all the
colour. That has been rejected, and correctly — it is the safe move, and it makes the site
dependent on a photo shoot that has not happened. **The identity has to hold up in colour,
as a system, before a single photograph is placed.**

So the design is built the other way around: a saturated brand palette, a real graphic
device, and typography with authority. Photography becomes one layer inside that system
rather than the whole of it — and the site looks finished even where an image has not been
shot yet.

### The idea

**Egyptian blue is the oldest synthetic pigment in the world**, manufactured in Egypt around
3000 BC, centuries before anyone else made a colour. That is a genuinely ownable story for
an Egyptian hotel group, and it earns a saturated blue as the **primary ground** — not as an
accent on white. Gold sits against it as fine detail; a warm papyrus is the reading surface.

It gives the group something most hotel sites never get: a colour that is *theirs*, with a
reason behind it that survives being explained out loud.

### What we keep from the reference study, and where we differ

Worth keeping: light-weight serif headlines in sentence case, generous vertical rhythm, a
different shape for every section so the scroll never fatigues, and restraint in the number
of competing calls to action.

| Rotana does | We do | Why |
| --- | --- | --- |
| Almost achromatic; colour only from photos | A saturated brand palette used as ground | A 100-property chain can afford neutrality. A three-hotel group needs to be recognisable in one screenshot |
| No prices anywhere | Prices from the search results onward | We need bookings, not brand awareness. Hiding price adds a step we cannot afford |
| Two-field search, everything else deferred | Three-field surface, full options in a popover | The brief needs rooms, adults, children, child ages, and a promo code — without looking like a 2011 booking form |
| Almost every CTA is an underlined text link | Text links for editorial, real buttons on every booking path | Elegant under-conversion is still under-conversion |
| Hotels behind a carousel | All three properties visible in a grid | They must sell a brand. We must answer "who are these people and where are their hotels" |
| English-first, LTR only | English default, up to seven locales, direction from data | Egypt's inbound market is German, Russian, French, Italian, and Spanish as well as Arabic |

## 2. Palette — Lapis & Gold

Colour is structural here. Deep lapis is a **ground**, used full-bleed for whole sections,
the header, the booking bar, and the footer. Papyrus is the reading surface. Gold is fine
detail — rules, marks, small caps, the primary button. Garnet appears rarely, for dining and
editorial moments.

```css
:root {
  /* Brand grounds */
  --lapis-900: #06203C;   /* footer, deepest bands */
  --lapis-800: #0B3A66;   /* primary brand ground */
  --lapis-600: #17568F;   /* hover, secondary fills */
  --lapis-400: #4A8AC9;   /* links and focus on dark grounds */

  /* Metal */
  --gold-600:  #8A6522;   /* gold text on light grounds — passes AA */
  --gold-500:  #C9A24D;   /* the metallic accent: rules, marks, buttons */
  --gold-300:  #E5CC93;   /* body text and links on lapis */

  /* Reading surfaces */
  --papyrus:   #F7F1E4;   /* light ground */
  --sand:      #ECE1CC;   /* panels, alternating bands */
  --surface:   #FFFFFF;   /* cards on papyrus */

  /* Ink */
  --ink:       #171512;
  --ink-2:     #57503F;
  --ink-3:     #8A8170;
  --on-lapis:  #F3EDE0;   /* body text on lapis grounds */

  /* Secondary accent — dining, editorial. Never a primary button */
  --garnet:    #7C2E3C;
  --garnet-so: #F2E3E2;

  /* Status */
  --ok: #2E6B4C;  --warn: #A66A00;  --danger: #9B2C2C;
}
```

### Contrast rules, because a saturated palette is easy to get wrong

| Combination | Ratio | Allowed for |
| --- | --- | --- |
| `--ink` on `--papyrus` | ~15:1 | Everything |
| `--on-lapis` on `--lapis-800` | ~11:1 | Everything |
| `--gold-300` on `--lapis-800` | ~7:1 | Everything, including body |
| `--gold-500` on `--lapis-800` | ~4.6:1 | Large text, rules, icons — **not body copy** |
| `--gold-600` on `--papyrus` | ~4.8:1 | Small text and links on light grounds |
| `--gold-500` on `--papyrus` | ~2.4:1 | **Decoration only.** Never text |

The last row is the trap. Gold on a light ground looks right and fails contrast; that is why
there are two golds, and why `--gold-500` is a decorative token by rule.

**Gold is rationed, lapis is not.** Lapis is a ground and should be used generously; gold is
detail and should appear a handful of times per screen. Gold everywhere is how a luxury
palette turns gaudy.

**Scrims are tinted lapis, not black.** Text over photography needs a guaranteed 4.5:1, and
a neutral black scrim over a warm image reads as muddy where a lapis one reads as part of
the palette:

```css
--scrim-card: linear-gradient(to top,
                rgba(6,32,60,.90) 0%, rgba(6,32,60,.50) 42%, transparent 78%);
--scrim-hero: linear-gradient(to bottom,
                rgba(6,32,60,.58) 0%, rgba(6,32,60,.20) 40%, rgba(6,32,60,.70) 100%);
```

**Dark mode** keeps lapis and gold and swaps the reading surfaces: papyrus becomes a deep
warm ink, cards become `--lapis-900`, and `--gold-300` carries text. Tokens are reassigned —
never colours defined only inside a media query.

### How much colour, where

Roughly **40% of the homepage's vertical height sits on a lapis ground.** That is what makes
the site read as designed rather than assembled. The alternation is deliberate: lapis for
arrival and for statements, papyrus for reading and comparing, sand for panels that need to
separate without a border, garnet for one or two editorial moments only.

## 3. The graphic device

A brand needs a mark that is not a logo. Ours is a **fine gold lattice** — an eight-pointed
star geometry drawn from Egyptian and Islamic ornament, rendered as hairlines at low opacity
over lapis grounds.

It appears as: a full-bleed texture behind the hero, a band separating major sections, a
watermark inside the footer, and a corner detail on offer cards. It is drawn as an inline
SVG `<pattern>`, so it scales, recolours with tokens, costs nothing to load, and works in
both themes.

This is the piece that makes the site look like it came from a design studio rather than a
template, and it is the reason the design does not collapse without photography.

**Photography, when it arrives**, sits inside this system: full-bleed behind the hero with a
lapis multiply overlay, and as the top half of hotel and destination cards. Where an image
does not exist yet, the slot renders as a lapis-to-gold field with the lattice over it —
which reads as intentional rather than missing.

This is the practical payoff of a colour-led identity: **the site can launch, be reviewed,
and be signed off before the photo shoot.** Good photography will lift it further, but
nothing is waiting on it.

## 4. Typography

The classic high-contrast serif and geometric sans pairing — Bodoni and Futura — is the
canonical typographic signature of fashion and luxury hospitality, and it is the right
register for a group that wants to sit alongside the best in the world.

| Role | Latin | Arabic | Cyrillic |
| --- | --- | --- | --- |
| Display | **Bodoni Moda** 400/500 (variable, optical size) | **Tajawal** 300 | **Jost** 300 |
| Body / UI | **Jost** 300/400/500 | **Tajawal** 400/500 | **Jost** 300/400/500 |

Bodoni Moda gives the headlines authority and a real voice; Jost is a Futura revival that
keeps the interface modern and quiet underneath it. Tajawal is geometric-leaning Arabic that
sits naturally beside Jost — Bodoni has no Arabic counterpart, and forcing a Naskh face
against a didone would look like an accident rather than a pairing.

**Bodoni's hairlines are fragile.** Two rules, not preferences: never below **28px**, and
never lighter than **500 on a lapis ground**. Below that it shimmers and disappears. Jost
carries everything smaller.

Jost has no Arabic and Tajawal no Cyrillic, so Russian falls back to Jost throughout —
acceptable, since Jost's Cyrillic is complete and the display role degrades gracefully to a
geometric sans.

### Scale — fluid, `clamp()`, no breakpoint jumps

| Token | Size | Line height | Face | Use |
| --- | --- | --- | --- | --- |
| `display-xl` | `clamp(2.75rem, 1.6rem + 4vw, 5rem)` | 1.04 | Bodoni 400 | Hero |
| `display-lg` | `clamp(2.25rem, 1.5rem + 3vw, 3.75rem)` | 1.08 | Bodoni 400 | Section statements |
| `heading-1` | `clamp(1.875rem, 1.4rem + 2vw, 2.75rem)` | 1.14 | Bodoni 500 | Page titles |
| `heading-2` | `clamp(1.5rem, 1.2rem + 1.2vw, 2rem)` | 1.20 | Bodoni 500 | Section headings |
| `heading-3` | `1.125rem` | 1.35 | Jost 500 | Card titles — below Bodoni's floor |
| `body-lg` | `1.125rem` | 1.70 | Jost 400 | Intro paragraphs |
| `body` | `1rem` | 1.70 | Jost 400 | Default |
| `body-sm` | `0.875rem` | 1.55 | Jost 400 | Meta, captions |
| `overline` | `0.75rem` | 1.40 | Jost 500 | Eyebrows — **Latin only**, `0.16em` tracking, uppercase |

Measure is capped at **68ch** for Latin body and **62ch** for Arabic. Jost runs optically
small, so body copy is set at 17px rather than 16px on the public site.

### Arabic typographic rules — non-negotiable

These are correctness, not preference. Each is a way Arabic type is commonly broken. They
key off `[lang="ar"]` for script-specific behaviour and `[dir="rtl"]` for layout, so adding
Hebrew or Persian later inherits the layout half automatically.

- **Never apply `letter-spacing` to Arabic.** It is a connected script; tracking visually
  severs the joins. `[lang="ar"] * { letter-spacing: normal !important; }`
- **Never apply `text-transform: uppercase`.** Arabic has no letter case. The `overline`
  token has no Arabic variant — Arabic eyebrows use `body-sm` in `--gold-600` instead.
- **Never use synthetic italic or synthetic bold.** Load real weights only.
- **Arabic runs +4% larger and +0.15 looser in line height** than Latin at the same token.
  Ascenders, descenders, and diacritics need the room.
- **Western numerals (0–9) in every locale, Arabic included.** Egyptian commerce and pricing
  use them, and Eastern Arabic-Indic numerals slow price scanning in a checkout. Prices use
  `font-variant-numeric: tabular-nums`.

```css
[lang="ar"] { --font-scale: 1.04; --lh-adjust: 0.15; letter-spacing: normal; }
```

**German is the other script-level trap.** Compound nouns are long, and
`Zimmerkategorie-Auswahl` will break any button or card title sized to English. Every
component is tested with a +40% string-length locale before it ships; `overflow-wrap:
anywhere` and `hyphens: auto` are set on headings and card titles by default.

## 5. Space, grid, and form

**Spacing** — 4px base: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160`.
Section rhythm: `96px` mobile → `128px` tablet → `160px` desktop. This generosity is the
design; compressing it is the fastest way to make the site look ordinary.

**Grid** — 12 columns, container `max-width: 1440px`, gutter `24px` mobile / `32px`
desktop, page margin `20px` mobile / `48px` desktop / auto beyond `1536px`.

**Radius** — `sm 2px · md 4px · pill 999px`. Deliberately tighter than the earlier draft: on
saturated grounds, soft corners read as consumer software, and sharp ones read as print.
The pill is reserved for the search bar and filter chips.

**Elevation** — almost none. Structure comes from colour, borders, and space.
`--shadow-card: 0 1px 2px rgba(6,32,60,.06), 0 14px 34px rgba(6,32,60,.09)`, applied on
hover rather than at rest — tinted with lapis rather than neutral grey, so shadows sit in
the palette instead of muddying it.

**Motion** — `150ms` micro, `250ms` standard, `400ms` entrance, all
`cubic-bezier(.2,0,0,1)`. Images scale `1.0 → 1.04` on card hover, clipped by the container.
No bounce, no spring, nothing over 400ms. Fully disabled under `prefers-reduced-motion`.

## 6. RTL

Direction comes from `Locale.direction`, not from a language check. Component CSS keys off
`[dir="rtl"]` and never off `[lang="ar"]`, so Hebrew, Persian, or Urdu would need no new
layout work.

Built on **CSS logical properties throughout** — `margin-inline-start`, `padding-inline`,
`inset-inline-end`, `border-inline-start`. No `left`/`right` in component CSS. With that
discipline, `<html dir="rtl">` does most of the work and there is no RTL stylesheet to
maintain.

| Mirrors | Does not mirror |
| --- | --- |
| Page layout and column order | Logos and wordmarks |
| Arrows, chevrons, back and forward icons | Media playback controls (play always points right) |
| Carousel direction and dot order | Numbers, prices, dates, phone numbers |
| Steppers and progress indicators | Photographs and video |
| Drawer and menu entry side | Map controls and map content |
| Text alignment | Social and brand icons |

Every enabled locale is tested at every breakpoint. Two failures are near-universal and are
explicit QA items: **fixed-position elements** (back-to-top, sticky search, toasts) that
keep a hard `right`, and **icon-plus-text buttons** where the icon does not move to the
other side of the label.

## 7. Component vocabulary

Every component is specified against the palette: which ground it sits on, and which of the
two golds it may use.

**Search widget** — the highest-stakes component. The brief requires destination, check-in,
check-out, rooms, adults, children, child ages, and promo code; eight controls in a row
looks like a booking form from 2011. Resolution: a **three-field surface** —
`Destination or hotel` · `Dates` · `Guests & rooms` — plus a quiet `Add promo code` toggle.
Guests & rooms opens a popover with per-room adults, children, and child-age selects. Full
capability, elegant surface. On the homepage it is a white pill floating over the lapis hero
with a `--gold-500` Search button; on inner pages it becomes a compact sticky bar on
`--lapis-800`.

**Hotel card** — stacked: 4:3 image, then name, city, star rating, one line of description,
two or three amenity chips, `from EGP X / night`, and both `Explore` and `Book` actions.
Price is present from the search results onward. Delegated-mode hotels show
`Check availability` instead of `Book`.

**Destination card** — overlay with `--scrim-card`, name and hotel count, 3:4 on mobile and
4:3 on desktop. Sits on a full-bleed lapis band, so the cards read as windows cut into the
brand colour.

**Offer card** — stacked on `--sand`, with validity window, applicable hotels, and the promo
code set in `--gold-600` above a hairline rule. A lattice corner detail marks it as an offer
without needing a badge. Booking-relevant information beats atmosphere here.

**Rate row** — the component that earns the money. Room name, meal plan, occupancy,
cancellation policy in plain language, an expandable per-night price breakdown with taxes
and fees itemised, total, and `Select`. Nothing about the price may require a click to
discover.

**Carousel** — peek of the next card, dots, and arrow buttons. Keyboard-navigable with
visible focus, swipeable, `aria-live` on slide change, direction flipped in RTL. Never
auto-advancing.

**Editorial split** — 50/50 image and text, alternating sides down the page. Dining takes
the one `--garnet` ground on the page; events and the group story stay on papyrus.

**Booking stepper** — Rooms → Guest details → Extras → Review → Payment. Persistent price
summary, sticky on desktop and collapsible on mobile. The total is visible at every step.

## 8. Homepage structure

1. **Hero** — lapis ground with the gold lattice, full-bleed image behind it when one
   exists, positioning line in Bodoni, search widget overlaid. Must answer "an Egyptian
   hotel group" in one second — and be recognisable as *this* group in a screenshot with
   the logo cropped out.
2. **Group statement** — one centred serif line plus a short paragraph. The promise.
3. **Our Hotels** — all three properties as cards in a grid, not a carousel. With three
   hotels, hiding two behind a swipe is a mistake the reference site cannot make and we can.
4. **Destinations** — full-bleed `--lapis-800` band, overlay cards, one per city. The
   page's largest block of brand colour, and the moment it stops looking like a template.
5. **Offers** — on a `--sand` panel, stacked cards, `All offers` link in `--gold-600`.
6. **Dining & Experiences** — editorial split.
7. **Meetings & Events** — editorial split, mirrored, with an RFP call to action.
8. **About the group** — short, with a link to the full story.
9. **Newsletter** — single field, one line of value, explicit consent.
10. **Footer** — hotels, destinations, company, policies, contact, social, language switch.

The language switcher lists only **enabled** locales, by endonym (`Deutsch`, not `German`),
and maps the current page to its equivalent slug in the target locale rather than dropping
the guest on the homepage.

Primary CTA throughout: **Book your stay**. Secondary: **Explore our hotels**.

## 9. Accessibility — WCAG 2.2 AA as a build requirement

- Text contrast ≥ 4.5:1, large text ≥ 3:1, UI boundaries ≥ 3:1. `--ink-tertiary` is
  restricted to large text and decoration by rule, not by memory.
- Visible focus on every interactive element: a `2px` ring with `2px` offset — `--lapis-800`
  on light grounds, `--gold-300` on lapis. Never removed without an equal replacement.
- Full keyboard operation of carousels, date pickers, popovers, and the stepper.
- Date picker has a typed-input fallback. A calendar-only date field excludes screen-reader
  and low-vision users from booking.
- Every image carries locale-appropriate alt text from `MediaAssetTranslation`; decorative
  images are `alt=""`.
- `<html lang>` and `dir` are set per locale on every page, so assistive technology switches
  pronunciation and reading order correctly.
- Touch targets ≥ 44×44px.
- Forms: real `<label>`s, errors tied by `aria-describedby`, never colour alone.
- `prefers-reduced-motion` disables parallax, ken-burns, and entrance animation.

## 10. Performance budgets

Enforced in CI on the homepage, a hotel page, and search results:

| Metric | Budget |
| --- | --- |
| LCP | < 2.0s on 4G |
| CLS | < 0.05 |
| INP | < 200ms |
| Initial JS | < 180KB gzipped |
| Hero image | < 200KB AVIF |

Image discipline does most of this: AVIF with WebP fallback, responsive `srcset`, explicit
`width`/`height` on every image, `fetchpriority="high"` on the hero and lazy loading
everywhere below the fold, and blurhash placeholders so cards never reflow.

Fonts are subset **per script** and preloaded for the active locale only, driven by
`Locale.script`, with `font-display: swap`. A German visitor downloads Latin only; Arabic
and Cyrillic faces are never requested. The translation bundle for the active locale adds
roughly 15–25KB gzipped, so seven locales cost the same on the wire as one.
