# Design Direction & System

The reference study of rotana.com informed the **information architecture and component
vocabulary**. Branding, palette, typography, copy, imagery, and layout below are original.

## 1. What we learned from the reference, and where we deliberately differ

The reference does five things worth keeping:

1. **Photography carries all the colour.** The interface itself is almost achromatic, so
   the imagery never competes with the UI. This is the single biggest lever on perceived
   quality, and it is free.
2. **Light-weight serif headlines in sentence case.** Not uppercase, not bold. Restraint
   reads as expensive.
3. **Generous vertical rhythm.** Sections breathe. Whitespace is the luxury signal.
4. **Every section has a different shape.** Overlay carousel, then a light panel with
   stacked cards, then portrait cards, then an editorial split. Variety prevents the
   scroll-fatigue that kills long marketing pages.
5. **A single prominent booking surface**, and only one solid button on the entire page.

And four places where we must **not** follow it:

| Reference behaviour | Ours | Why |
| --- | --- | --- |
| No prices anywhere | Prices from the search results onward | A three-hotel group needs bookings, not brand awareness. Hiding price adds a step we cannot afford |
| Two-field search, rest deferred | Three-field surface, full options in a popover | The brief requires rooms, adults, children, child ages, and promo code. They must fit without looking like an airline form |
| Almost every CTA is an underlined text link | Text links for editorial, real buttons on every booking path | Elegant under-conversion is still under-conversion |
| English-first, LTR only | English default, up to seven locales, direction driven by data | Egypt's inbound market is German, Russian, French, Italian, and Spanish as well as Arabic |

One more difference by necessity: the reference is a 100+ property chain, so its homepage
sells a *brand*. Ours has three hotels, so its homepage must immediately answer **"who are
these people and where are their hotels"** — group positioning above the fold, and all three
properties visible without a carousel.

## 2. Palette — "Limestone & Nile"

Egyptian without the cliché. Warm limestone neutrals, a deep Nile teal for action, brass as
a rare accent. No pyramids, no gold gradients, no papyrus.

```css
:root {
  /* Ground */
  --bg-canvas:     #FBF9F5;   /* warm limestone */
  --bg-surface:    #FFFFFF;
  --bg-subtle:     #F2EEE7;   /* section panels */
  --bg-inverse:    #1A1815;

  /* Ink */
  --ink-primary:   #1A1815;   /* 15.8:1 on canvas */
  --ink-secondary: #57514A;   /*  7.4:1 on canvas */
  --ink-tertiary:  #8A837A;   /*  3.6:1 — large text and decoration only */
  --ink-inverse:   #FBF9F5;

  /* Line */
  --line-subtle:   #EBE5DB;
  --line-default:  #DFD8CC;
  --line-strong:   #C4BAA9;

  /* Action */
  --accent:        #0E4F4A;   /* Nile teal — 8.9:1 on white */
  --accent-hover:  #0A3D39;
  --accent-soft:   #E6EFED;
  --accent-ink:    #FFFFFF;

  /* Rare accent — loyalty marks, dividers, editorial rules. Never a button */
  --brass:         #A67C3D;
  --brass-soft:    #F5EDE0;

  /* Status */
  --success:       #2F6B4F;
  --warning:       #A66A00;
  --danger:        #9B2C2C;
  --info:          #2B5A7E;

  /* Scrim — guarantees 4.5:1 for text over photography */
  --scrim-card:  linear-gradient(to top,
                   rgba(20,18,15,.86) 0%, rgba(20,18,15,.46) 42%, transparent 78%);
  --scrim-hero:  linear-gradient(to bottom,
                   rgba(20,18,15,.52) 0%, rgba(20,18,15,.16) 34%,
                   rgba(20,18,15,.10) 62%, rgba(20,18,15,.60) 100%);
}
```

**The accent is rationed.** Primary buttons, links, focus rings, active states. Nothing
else. A page where the teal appears four times looks considered; one where it appears
twenty looks like a template.

**The scrim tokens are not decoration.** Every card in this system puts text over a
photograph, and a photograph is not a contrast-guaranteed background. White text on an
unscrimmed image is the most common accessibility failure on hotel websites.

Dark mode is defined for the admin portal and honoured on the public site via
`prefers-color-scheme`, with the same tokens reassigned — never with colours defined only
inside the media query.

## 3. Typography

The system must hold up across three scripts — Latin, Arabic, and Cyrillic — because the
locale set can reach seven. Font families are declared **per script**, resolved from
`Locale.script`, so adding Russian is a data change and not a typographic redesign.

| Role | Latin | Arabic | Cyrillic |
| --- | --- | --- | --- |
| Display | **Newsreader** 300/400 (variable, optical size) | **IBM Plex Sans Arabic** 300 | **Newsreader** 300/400 |
| Body / UI | **IBM Plex Sans** 400/500 | **IBM Plex Sans Arabic** 400/500 | **IBM Plex Sans** 400/500 |

Newsreader and IBM Plex Sans both carry full Cyrillic, so Russian needs no third family —
only an additional subset. **Only the active locale's script is loaded.**

Newsreader is a transitional serif with real light weights and optical sizing — elegant at
64px without the over-familiarity of Playfair. IBM Plex Sans and IBM Plex Sans Arabic are a
designed superfamily, so weights, metrics, and rhythm actually match across scripts.

**An honest limitation:** there is no open-licence Arabic face that mirrors a light Latin
serif's voice. Setting Arabic display in a refined light sans is the standard solution for
premium multilingual brands in the region, and it looks intentional rather than compromised.
If the brand budget allows, a commercial Arabic display face (29LT, TPTQ Arabic) is the
upgrade path and slots in by changing one token.

### Scale — fluid, `clamp()`, no breakpoint jumps

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `display-xl` | `clamp(2.75rem, 1.6rem + 4vw, 5rem)` | 1.06 | Hero |
| `display-lg` | `clamp(2.25rem, 1.5rem + 3vw, 3.75rem)` | 1.10 | Section statements |
| `heading-1` | `clamp(1.875rem, 1.4rem + 2vw, 2.75rem)` | 1.15 | Page titles |
| `heading-2` | `clamp(1.5rem, 1.2rem + 1.2vw, 2rem)` | 1.20 | Section headings |
| `heading-3` | `1.25rem` | 1.30 | Card titles |
| `body-lg` | `1.125rem` | 1.65 | Intro paragraphs |
| `body` | `1rem` | 1.65 | Default |
| `body-sm` | `0.875rem` | 1.55 | Meta, captions |
| `overline` | `0.75rem` | 1.40 | Eyebrows — **Latin only**, `0.12em` tracking, uppercase |

Measure is capped at **68ch** for Latin body and **62ch** for Arabic.

### Arabic typographic rules — non-negotiable

These are correctness, not preference. Each one is a way Arabic type is commonly broken.
They key off `[lang="ar"]` for script-specific behaviour and `[dir="rtl"]` for layout, so
adding Hebrew or Persian later inherits the layout half automatically.

- **Never apply `letter-spacing` to Arabic.** Arabic is a connected script; tracking
  visually severs the joins. `[lang="ar"] * { letter-spacing: normal !important; }`
- **Never apply `text-transform: uppercase`.** Arabic has no letter case. The `overline`
  token has no Arabic variant — Arabic eyebrows use `body-sm` at `--ink-tertiary` instead.
- **Never use synthetic italic or synthetic bold.** Load real weights only.
- **Arabic runs +4% larger and +0.15 looser in line height** than Latin at the same token.
  Ascenders, descenders, and diacritics need the room, and the Arabic apparent size sits
  smaller at identical `font-size`.
- **Western numerals (0–9) in every locale, Arabic included.** Egyptian commerce, pricing,
  and phone numbers use them; Eastern Arabic-Indic numerals in a checkout would read as
  archaic and slow price scanning. Prices use `font-variant-numeric: tabular-nums` so digits
  align in columns.

```css
[lang="ar"] { --font-scale: 1.04; --lh-adjust: 0.15; letter-spacing: normal; }
```

**German is the other script-level trap.** Compound nouns are long, and
`Zimmerkategorie-Auswahl` will break any button or card title sized to English. Every
component is tested with a +40% string-length locale before it ships; `overflow-wrap:
anywhere` and `hyphens: auto` are set on headings and card titles by default.

## 4. Space, grid, and form

**Spacing** — 4px base: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160`.
Section rhythm: `96px` mobile → `128px` tablet → `160px` desktop. This generosity is the
design; compressing it is the fastest way to make the site look ordinary.

**Grid** — 12 columns, container `max-width: 1440px`, gutter `24px` mobile / `32px`
desktop, page margin `20px` mobile / `48px` desktop / auto beyond `1536px`.

**Radius** — `sm 4px · md 8px · lg 12px · pill 999px`. Restrained by intent. The pill is
reserved for the search bar and filter chips; a page of rounded rectangles reads as a SaaS
dashboard, not a hotel.

**Elevation** — almost none. Structure comes from borders and space.
`--shadow-card: 0 1px 2px rgba(26,24,21,.05), 0 12px 32px rgba(26,24,21,.06)`, applied on
hover rather than at rest.

**Motion** — `150ms` micro, `250ms` standard, `400ms` entrance, all
`cubic-bezier(.2,0,0,1)`. Images scale `1.0 → 1.04` on card hover, clipped by the container.
No bounce, no spring, nothing over 400ms. Fully disabled under `prefers-reduced-motion`.

## 5. RTL

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

## 6. Component vocabulary

**Search widget** — the highest-stakes component. The brief requires destination, check-in,
check-out, rooms, adults, children, child ages, and promo code; eight controls in a row
looks like a booking form from 2011. Resolution: a **three-field surface** —
`Destination or hotel` · `Dates` · `Guests & rooms` — plus a quiet `Add promo code` toggle.
Guests & rooms opens a popover with per-room adults, children, and child-age selects. Full
capability, elegant surface. On the homepage it is a pill floating over the hero; on inner
pages it becomes a compact sticky bar.

**Hotel card** — stacked: 4:3 image, then name, city, star rating, one line of description,
two or three amenity chips, `from EGP X / night`, and both `Explore` and `Book` actions.
Price is present from the search results onward. Delegated-mode hotels show
`Check availability` instead of `Book`.

**Destination card** — overlay with `--scrim-card`, name and hotel count, 3:4 on mobile and
4:3 on desktop.

**Offer card** — stacked, with validity window, applicable hotels, and the promo code
visible. Booking-relevant information beats atmosphere here.

**Rate row** — the component that earns the money. Room name, meal plan, occupancy,
cancellation policy in plain language, an expandable per-night price breakdown with taxes
and fees itemised, total, and `Select`. Nothing about the price may require a click to
discover.

**Carousel** — peek of the next card, dots, and arrow buttons. Keyboard-navigable with
visible focus, swipeable, `aria-live` on slide change, direction flipped in RTL. Never
auto-advancing.

**Editorial split** — 50/50 image and text, alternating sides down the page, for dining,
events, and group story.

**Booking stepper** — Rooms → Guest details → Extras → Review → Payment. Persistent price
summary, sticky on desktop and collapsible on mobile. The total is visible at every step.

## 7. Homepage structure

1. **Hero** — full-bleed image or muted video, group positioning line, search widget
   overlaid. Must answer "an Egyptian hotel group" within one second.
2. **Group statement** — one centred serif line plus a short paragraph. The promise.
3. **Our Hotels** — all three properties as cards in a grid, not a carousel. With three
   hotels, hiding two behind a swipe is a mistake the reference site cannot make and we can.
4. **Destinations** — overlay cards, one per city.
5. **Offers** — on a `--bg-subtle` panel, stacked cards, `All offers` link.
6. **Dining & Experiences** — editorial split.
7. **Meetings & Events** — editorial split, mirrored, with an RFP call to action.
8. **About the group** — short, with a link to the full story.
9. **Newsletter** — single field, one line of value, explicit consent.
10. **Footer** — hotels, destinations, company, policies, contact, social, language switch.

The language switcher lists only **enabled** locales, by endonym (`Deutsch`, not `German`),
and maps the current page to its equivalent slug in the target locale rather than dropping
the guest on the homepage.

Primary CTA throughout: **Book your stay**. Secondary: **Explore our hotels**.

## 8. Accessibility — WCAG 2.2 AA as a build requirement

- Text contrast ≥ 4.5:1, large text ≥ 3:1, UI boundaries ≥ 3:1. `--ink-tertiary` is
  restricted to large text and decoration by rule, not by memory.
- Visible focus on every interactive element: `2px` `--accent` ring with `2px` offset. Never
  removed without an equal replacement.
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

## 9. Performance budgets

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
