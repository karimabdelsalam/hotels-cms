# Site Structure, Pages & Menus

The homepage mockup links to anchors on itself, which is correct for a one-page design
review and wrong for a website. This document sets out the real page structure, and the
menu system that controls how a visitor moves through it.

## 1. Two kinds of page

| | **System pages** | **Content pages** |
| --- | --- | --- |
| Examples | Resort detail, rooms, offers index, search results, checkout, My Booking | About, Contact, Careers, Terms, Privacy, a landing page for a campaign |
| Route | Fixed pattern, driven by an entity slug | `/{locale}/{slug}` — the editor chooses |
| Built by | Developers, once | Editors, any time, from admin |
| Content | Entity fields plus a flexible block area | Blocks only |
| Can be deleted | No — they are part of the product | Yes |

Both are addressable, indexable, translatable, and menu-linkable. The distinction matters
only because a system page cannot be deleted out from under the booking flow.

**Content pages are block-based**, not a single rich-text field. The editor composes a page
from the same components the homepage uses — hero, editorial split, card grid, rail, stats,
gallery, FAQ, contact form, rich text. This is what stops the site drifting into a
collection of pages that each look slightly different.

## 2. Route map

Every route is locale-prefixed, per `i18n.md`.

```
/{locale}/                                  Home
/{locale}/resorts                           All resorts
/{locale}/resorts/{resort}                  Resort detail
/{locale}/resorts/{resort}/rooms            Room types at that resort
/{locale}/resorts/{resort}/rooms/{room}     Room type detail
/{locale}/resorts/{resort}/dining           Restaurants & bars
/{locale}/resorts/{resort}/facilities       Facilities & services
/{locale}/resorts/{resort}/gallery          Gallery
/{locale}/offers                            All offers
/{locale}/offers/{offer}                    Offer detail + eligible resorts
/{locale}/experiences                       Experiences index
/{locale}/experiences/{experience}          Experience detail
/{locale}/diving                            The house reef & dive centre
/{locale}/weddings                          Weddings
/{locale}/meetings                          Meetings & events + RFP form
/{locale}/destinations                      Module — off today
/{locale}/destinations/{destination}        Module — off today
/{locale}/search                            Availability results
/{locale}/book/{step}                       rooms · guest · extras · review · payment
/{locale}/booking/{reference}               Confirmation
/{locale}/my-booking                        Lookup, view, cancel
/{locale}/contact                           Contact
/{locale}/{slug}                            Content pages — catch-all, last in the router
```

The catch-all is matched **last**, so a content page can never shadow a system route. An
editor who creates a page with the slug `offers` gets a validation error naming the clash,
rather than silently breaking the offers index.

## 3. The menu system

Menus are data. Four menus ship, each addressable by key:

| Key | Where |
| --- | --- |
| `primary` | Main navigation |
| `utility` | Thin bar above — My Booking, phone, language |
| `footer_a` · `footer_b` · `footer_c` | Footer columns |

### Data model

```
Menu
  id · key · name · max_depth

MenuItem
  id · menu_id · parent_id (nullable — one level of nesting) · position
  target_type   'page' | 'resort' | 'room_type' | 'offer' | 'experience'
              | 'destination' | 'route' | 'url' | 'anchor'
  target_id     nullable — FK to the target entity
  url           nullable — only for target_type 'url'
  anchor        nullable — e.g. '#offers', for a section on the page it points at
  open_new_tab · visibility · icon

MenuItemTranslation
  menu_item_id · locale_code · label
```

### Three behaviours that make this better than a URL list

**1. Items point at entities, not at URLs.** A menu item linking to Fantazia Royal stores
that resort's id. Rename it, change its slug, or translate it into German, and every menu
in every locale follows automatically. A stored URL would silently 404. Only
`target_type: 'url'` stores a literal address, and that is reserved for genuinely external
links.

**2. Labels fall back to the target's own title.** An item with no `label` shows the
resort's or page's translated title. Override it only when the menu needs shorter wording
than the page title. This is what stops menus going stale in six languages at once.

**3. Items self-hide when their target cannot be shown.** If a page is unpublished, an
offer expires, a resort is archived, or a `SiteModule` is switched off, the item disappears
from the rendered menu — and admin shows it greyed with the reason. **No menu item ever
renders as a broken link.**

That third rule is what connects menus to the module flags: Destinations is off today, so a
Destinations menu item would simply not render, in any locale, without anyone having to
remember to remove it.

### Localisation

One menu structure, translated labels. The same items appear in every locale, so the site
does not have a different information architecture in German than in English — which is
what happens when each locale gets its own menu tree, and it is unmaintainable past two
languages.

Where a locale genuinely needs a different item, `visibility` carries a locale filter rather
than forking the whole menu.

## 4. Admin: the menu builder

A two-panel screen, the pattern people already know from WordPress:

- **Left — add items.** Tabbed by source: Pages, Resorts, Rooms, Offers, Experiences,
  System routes, Custom link. Multi-select, then **Add to menu**.
- **Right — the structure.** Drag to reorder, drag right to nest one level, expand an item
  to edit its label, open-in-new-tab, and visibility. Remove with an undo.
- **Above** — the menu being edited, and the locale whose labels are showing.
- **Below** — a live preview of the rendered navigation.

Rules the builder enforces:

- Maximum one level of nesting on `primary`; footer menus are flat. Depth limits are a
  design decision, not a preference — a three-level dropdown on a resort site is a usability
  failure, so the tool does not offer one.
- An item whose target is unpublished is shown greyed with the reason, not hidden, so the
  editor understands why it will not render.
- Reordering and nesting are keyboard-operable, not drag-only.
- Changes are staged and saved explicitly. Navigation is too visible to save on every drag.
- Every save writes to `AuditLog`, and the previous structure can be restored.

## 5. Navigation for a single-destination group

The current configuration, with three resorts in one destination:

```
primary       Resorts ▾ ── Fantazia Resort
                        ├─ Fantazia Royal
                        ├─ Sirena Resort
                        └─ Compare all
              The Reef
              Experiences
              Offers
              Weddings
              About

utility       My Booking · Contact · +20 … · language switcher
```

No Destinations item, because the module is off. When a fourth resort opens in another
destination, the module is switched on and a Destinations item is added — the routes and
entities are already there.

## 6. SEO consequences

Every route above is server-rendered with its own metadata, canonical, and `hreflang` set
across enabled locales. Resort, offer, and experience pages carry structured data. Content
pages inherit a default metadata template that the editor can override per locale.

Menus feed breadcrumbs, so the trail is generated from the real structure rather than
maintained separately.

**A page that is unpublished, or belongs to a module that is off, is excluded from the
sitemap and returns 404** — it does not linger as an orphan that search engines keep
serving.
