# Phase 2D — exact homepage port (`home-page/` → the application)

Status: implemented, off by default, verified. The default storefront is untouched.

---

## 0. What this phase is

Phase 2A/2B/2C built the integrated storefront: the application's own shell, the
Phase 1 editorial hero, and homepage sections built to the approved design's
direction. That work was an *interpretation* of the design — new components in
the application's own idiom, resolved against the application's data.

Phase 2D does something different, and it is the thing the brief asked for:

> **the approved `home-page/` design, carried over file by file, wired to the
> real backend, and mounted behind a switch that is off by default.**

So the port is not a re-implementation. 50 of the design's own files — its
twelve homepage sections, its shell (announcement rail, header, mega menu,
mobile menu, footer), its product card, drawer, quick view, search overlay,
toasts, hooks and utilities — are carried into
`frontend/src/components/aarna/` as *the design's own source*, and its seven
stylesheets are transformed into one scoped sheet. Twenty-four of the 50 files
are byte-for-byte identical. The twenty-six that are not differ by 66 lines
in total, every one of them pinned and reproduced by a build tool, so the
difference cannot drift.

What the port *cannot* carry over is the design's prototype data: a hand-written
sample catalogue, a sample offer, a simulated newsletter, and a cart in
localStorage. Those four modules are **replaced** by boundary adapters that
answer the same questions from this application — the live catalogue, the offer
register, the real cart and wishlist, and an honest "no capability yet" for the
subscription. The design's components never changed to accommodate that: the
adapter keeps the module path and the export names.

Nothing in Phase 2A, 2B or 2C was modified. Phase 2C's composition is still
there, still the reviewable alternative, still off by default.

---

## 1. The port in numbers

| thing | count |
|---|---|
| design files carried over | **50** (24 byte-for-byte · 26 adapted · 66 adapted lines in total) |
| modules replaced by boundary adapters | **4** |
| modules the port adds | **7** (`AarnaStorefront.jsx`, `aarna.css`, `aarna.host.css`, `designFonts.js`, `mock/data/site.js`, `router/index.jsx`, `router/routes.js`) |
| files under `src/components/aarna/` | **61** + 2 suites |
| design stylesheets ported | **7** sheets, 1,158 lines → `aarna.css`, **88,885 bytes**, every selector scoped under `.aan-root` |
| design art plates staged | **63** webp (~4.6 MB) in `public/aarna-design/` |
| new regression tests | **30** (16 fidelity · 14 integration) |

Design sources: `home-page/src/**` (untouched — verified), `home-page/public/images/*.webp`.

---

## 2. The adaptation ledger

Every non-zero row is produced by `frontend/scripts/aarna-port.js`, which is both
the generator and the specification: `node scripts/aarna-port.js --copy` writes
the ported files, `--css` writes the stylesheet, and `--check` fails if the tree
on disk differs from what the tool writes. The count is the number of *design*
lines the port does not carry, and the fidelity suite re-measures it on every run.

The routing rewrite alone accounts for most files: one import line, in every file
that renders a destination. It points `Link`/`NavLink` at the port's own router
(`router/index.jsx`), so the design's URL space is translated in one place
(§4). All other rewrites are listed after the table.

| ported file | lines | rewrite(s) |
|---|---|---|
| `mock/data/content.js` | 23 | `content-facts` |
| `components/shopping/CartDrawer.jsx` | 6 | `routing` + `offer-copy` |
| `components/layout/Footer.jsx` | 5 | `routing` + `footer-facts` |
| `components/ui/NewsletterForm.jsx` | 5 | `newsletter-capability` |
| `components/layout/Layout.jsx` | 2 | `layout-slot` |
| `components/sections/KurtiLookbook.jsx` | 2 | `kurti-curation` |
| `components/sections/SareeLookbook.jsx` | 2 | `routing` + `saree-curation` |
| `components/ui/Logo.jsx` | 2 | `routing` + `logo-plate` |
| `data/index.js` | 2 | `barrel` |
| `components/layout/Header.jsx` | 1 | `routing` |
| `components/navigation/MegaMenu.jsx` | 1 | `routing` |
| `components/navigation/MobileMenu.jsx` | 1 | `routing` |
| `components/product/ProductCard.jsx` | 1 | `routing` |
| `components/sections/BridalCampaign.jsx` | 1 | `routing` |
| `components/sections/CategoryCollage.jsx` | 1 | `routing` |
| `components/sections/Hero.jsx` | 1 | `fetch-priority` |
| `components/sections/JewelleryTheatre.jsx` | 1 | `routing` |
| `components/sections/KidsPlayground.jsx` | 1 | `routing` |
| `components/sections/MensEditorial.jsx` | 1 | `routing` |
| `components/sections/Newsletter.jsx` | 1 | `routing` |
| `components/sections/TrustStrip.jsx` | 1 | `routing` |
| `components/shopping/QuickViewModal.jsx` | 1 | `routing` |
| `components/shopping/SearchOverlay.jsx` | 1 | `routing` |
| `components/ui/ArrowLink.jsx` | 1 | `routing` |
| `components/ui/Button.jsx` | 1 | `routing` |
| `mock/assets/images.js` | 1 | `art-base` |

**What each rewrite does, and why**

| rewrite | what changes | why |
|---|---|---|
| `routing` | `import { Link, NavLink } from 'react-router-dom'` → the port's `router/index.jsx` (other router exports stay) | the design's URLs (`/shop/sarees`, `/pages/our-story`, `/track-order`) are not this application's; the shim translates them (§4). Kept out of the components so the design's markup is untouched. |
| `layout-slot` | `Layout()` renders `{children ?? <Outlet />}` | the application owns routing: the ported page is a child, not a nested route |
| `art-base` | image base `/images/` → `/aarna-design/` | the design's 63 plates are staged in the port's own namespace; the application's media library is never written to |
| `logo-plate` | brand mark `/images/pratikshya-logo.webp` → `/aarna-design/pratikshya-logo.webp` | same file, staged in the port's namespace (the padlock is the design's own supplied artwork) |
| `fetch-priority` | `fetchpriority` → `fetchPriority` | React 19 spells the prop `fetchPriority`; the design is React 18 |
| `offer-copy` | 5 lines of the drawer's offer copy | the design's copy names its sample offer ("Festive Edit"). The ported drawer now prints the register's own figures: `discountLabel` ("15% OFF", "₹500 OFF") and `scopeLabel` (the collection the offer is scoped to). |
| `footer-facts` | 4 lines of the footer's contact block + the signature line | the design's footer prints a placeholder address (`care@…example`), care hours, and "Prototype storefront — sample catalogue, prices and offers". None of it is true of this house: each contact line renders only when the application actually holds the value (its settings record ships empty, so they are omitted), and the signature says only `© <year> <brand>. All rights reserved.` |
| `newsletter-capability` | import + a `live` flag that disables the field and button, and a status line carrying the reason | the application has no subscription capability (no endpoint, list or consent record — §6). A control that cannot work is not offered as if it could; the reference surface substitutes the design's simulated service so the section can still be compared in all four of its states. |
| `saree-curation` | `getByIds(['p02','p01','p14','p17'])` → `getProductsFor('sarees').slice(0, 4)` | the design curated four *sample* pieces by id. Inventing replacements would be inventing merchandise; asking the live catalogue for the first four pieces of the same edit is the same question the design asked its sample data. |
| `kurti-curation` | the same, for the kurti lookbook's pairing fill | as above |
| `barrel` | `data/index.js` re-exports `site` + `announcements` from `mock/data/site.js` | the design's barrel re-exported its prototype `site`; the port's identity module is the boundary (§3) |
| `content-facts` | removes the design's prototype `site` block and sample announcement rail from `mock/data/content.js`; re-points it at `site.js`; replaces the trust strip's care-hours line with the surface that exists | the placeholder address, the care hours, the three links to the social platforms' home pages and the "sample offer details below" line do not ship — §3 |

**Not changed, and deliberately:** the design's `isSample` label on the offer band
(`{promo.isSample && <em>Sample offer</em>}`). It is the design's own honesty
guard. It renders only when the register's record carries the flag, and never for
a live offer. The suite pins it.

**The development-only preview fixtures.** Reviewing the port side by side with
the design needs the design's own sample catalogue somewhere. It lives in
`src/components/storefront/preview/previewAarnaFixtures.js` — one DEV-gated file
whose only importer is the DEV-gated preview surface, and whose data is named for
what it is (`AARNA_PREVIEW_PIECES`, `PREVIEW_AARNA_PROMOTION`,
`PREVIEW_AARNA_NEWSLETTER`). It is not an inventory and not a second catalogue:
it ships in no production module graph (a suite test walks the graph to prove
it), and the production switch has never seen it.

---

## 3. The boundary modules

Every ported component reads its data from a module path that already existed in
the design. Those paths now hold adapters. Each keeps the design's export names —
so no ported component needed a change to accommodate the boundary — and opens
with an `ADAPTED AT THE BOUNDARY` note. A suite test enforces both.

| ported module | the design had | the application answers |
|---|---|---|
| `mock/data/products.js` | 20-odd sample rows with prototype prices, stock and "featured" flags | `getLiveStorefrontProducts()` → `toDesignProduct()`: name, slug, price, `compareAt` (only when genuinely higher), media through `resolveMediaUrl`, badge from the record's own label, the design's five wardrobes derived from the canonical taxonomy path (bridal reads as Women, finishing-touches as Jewellery), the design's vocabulary aliases (`DESIGN_ALIASES`) so its filters keep working, options from sizes (falling back to colours) with per-value availability, `featured = isFeatured \|\| isBestseller`. **Empty is a valid answer.** |
| `mock/data/promotions.js` | one sample offer (`UTSAV15`, `isSample`) | the offer register: `listCustomerVisible()` → the design's promotion shape, percentage offers only (the band's composition is built around a percentage; a fixed-amount offer still applies in the bag). Ledger, code, end date and terms are the register's own text; the CTA destination is resolved from the offer's eligibility through the canonical routing. No active offer → the band renders nothing, exactly as the design does when its own lookup misses. |
| `mock/data/site.js` *(added)* | prototype brand/contact block + 3 sample announcements | the house's record: brand language verbatim; `contact.email`/`hours` `null` until the application holds them; `social: []`; one announcement the shop can stand behind ("delivery · timelines confirmed at checkout" — where they are actually calculated). |
| `services/newsletter.js` | a 900 ms simulated subscription with session storage | `newsletterAvailable()` is `false`; `subscribe()` throws rather than resolve into a fake success; the ported form disables itself and states why. |
| `state/ShopContext.jsx` | a reducer over localStorage with its own discount maths | this application's `CartContext` + `WishlistContext`: the same `useShop()` shape the ported components expect (`lines` keyed by the server's line id, `totals` with the coupon discount, `addToCart/setQty/removeLine/applyPromo/removePromo/toggleWish/isWished`). The design's "Size: M" option label is parsed back into this application's selection, and a rejected add toasts the cart's own message. |
| `router/routes.js` *(added)* | — | the URL translation table (§4) |
| `router/index.jsx` *(added)* | — | `Link`/`NavLink` wrappers that translate before the router sees them |

---

## 4. Routes: the design's URL space → this application's

The design links to `/shop/sarees`, `/shop/the-groom`, `/pages/our-story`,
`/track-order`. This application registers `/women/sarees`, `/men/groom`,
`/about`, `/account/orders`. The translation resolves in this order, and nothing
is guessed:

1. a path the application registers (its navigation manifest + the customer
   routes `App.jsx` declares) — kept as it is;
2. `/shop/<key>` → the **live taxonomy** (`resolveCategoryRoute`,
   `resolveCollectionRoute`): a managed collection named `festive` wins over any
   table in the port;
3. `/shop/<key>` → the documented alias table: `women→/women`, `men→/men`,
   `kids→/kids`, `essentials→/women/essentials`,
   `jewellery→/bridal/finishing-touches/jewellery`, `sarees→/women/sarees`,
   `the-bride→/bridal/the-bride`, `the-groom→/men/groom`, `girls→/kids/girls`,
   `boys→/kids/boys`, `bangles→/bridal/finishing-touches/bangles`,
   `festive→/collections`, … (**36 keys**, all verified against the manifest);
4. `/shop` and `/shop/all` → the shop listing; an unknown `/shop/<key>` →
   **`/shop`**. A real listing, never a 404, never an invented path;
5. `/product/<slug>` → `/product/<id>`, resolved from the live catalogue (the
   application's product route is keyed by id);
6. `/pages/<slug>` → the customer-care route (7 keys): `our-story→/about`,
   `privacy→/privacy`, `terms→/terms`,
   `shipping/returns/authenticity→/contact`; an unmapped key → `/about`;
7. `/track-order` → `/account/orders`;
8. anything else → the customer root.

`undefined` stays `undefined`: a caller with no destination is not given one.

---

## 5. The stylesheet port

`aarna.css` is produced by `scripts/aarna-port.js --css` from the design's seven
sheets, in the design's load order:

```
tokens · base · layout · sections · product · shopping · pages
```

The transform is mechanical and total, and the fidelity suite re-runs it on every
run and compares **byte for byte**:

* every declaration is the design's, character for character;
* `:root` / `html` / `body` → `.aan-root` (the port's root element);
* every other selector is scoped: `.hero` → `.aan-root .hero`,
  `*, *::before` → `.aan-root, .aan-root *, .aan-root::before, .aan-root *::before`;
* `@media` and `@container` blocks are scoped inside, and their conditions are
  carried over unchanged: **37 media queries** (35 width queries across eight
  breakpoints — 379, 479, 599, 719, 899, 1023, 1100, 1199 px — plus
  `hover: hover` / `hover: none` and `prefers-reduced-motion: reduce`) and one
  `@container (max-aspect-ratio: 1 / 1)`;
* the design's two keyframes are renamed (`spin → aan-spin`, `pulse → aan-pulse`)
  together with their `animation:` references, so they cannot collide with the
  host's;
* comments, blank lines and the design's own section banners are preserved.

**`aarna.host.css`** (hand-written, two rules) is the only place a declaration may
differ, and both rules exist because the host loads Tailwind's preflight document-wide:

1. `.aan-root svg { display: inline; vertical-align: baseline }` — preflight sets `svg {
   display: block; vertical-align: middle }`; the design's icons sit in inline
   text and were authored against the browser default;
2. `.aan-root h1…h6 { font-weight: bold }` — preflight sets `font-weight: inherit`; seven
   ported heading classes (`.collage__title`, `.kurti__title`, `.men__title`,
   `.saree__title`, `.bridal__title`, `.bridal__name--dark`, `.jewel__title`)
   leave the weight to the browser, which is what the design's rendering used. A
   scoped port rule (0-2-0) still beats this one (0-1-1).

**Collision audit (static, from the entry graph).** The application's global CSS
is four stylesheets (`index.css` = Tailwind, plus the three 2C sheets). 401 design
class tokens vs 247 application tokens → **5 tokens on both sides**
(`has-mega`, `is-active`, `is-scrolled`, `line-inner`, `line-mask`), and **zero**
application rules target any of them outside a `.pf-` scope, so none can reach a
node inside `.aan-root`. Every ported selector is `.aan-root`-prefixed and there
is no unscoped `:root`/`html`/`body` rule in `aarna.css` — both pinned by the suite.

---

## 6. Integration into the application

* **Mount** — `frontend/src/layouts/CustomerLayout.jsx`, at the customer root
  only: `.aan-root` → `MotionConfig reducedMotion="user"` → the design's
  `UIProvider` → `ShopProvider` (the cart/wishlist adapter) → the design's
  `Layout` → the design's `Home`. No `AnimatePresence`, no page-transition
  wrapper (the ported header is sticky and a transform above it would capture
  it). With the port mounted, the application's own `SiteFooter` and mini-cart
  are suppressed — the port supplies its own, wired to the same store.
* **Switch** — `src/config/storefrontHome.js`: `atelier` (default) · `editorial`
  (2C) · `aarna` (2D). Development: `?home=aarna`. Deployed build:
  `VITE_STOREFRONT_HOME=aarna`. `?home=atelier` always returns a local review to
  the existing homepage. Anything unrecognised resolves to `atelier`. `App.jsx`
  is untouched (byte-identical) and does not know the port exists.
* **Catalogue** — the live storefront catalogue (the same facade every Product
  page and listing uses), through `resolveMediaUrl` for imagery.
* **Cart and wishlist** — the application's own providers: same server lines,
  same coupons, same totals, same wishlist. The ported drawer, cards, bag button
  and quick view are views onto that state, not a second shop.
* **Offers** — the offer register, the same one Phase 2B's band reads.
* **Fonts** — the design sets Cormorant Garamond + Manrope. The design's serif is
  already the application's display family, but the document loads its italics
  only to 400, and Manrope is not loaded at all. `designFonts.js` requests
  exactly the design's families (Cormorant Garamond italics 500/600 + Manrope
  200–800) **when the port mounts** — one idempotent `<link>`, never removed, and
  never on any other route. `index.html` is untouched.
* **Art** — the design's 63 plates, staged in `public/aarna-design/` (its own
  namespace; the application's media library keeps its 238 files untouched, and
  the port references no `/images/` path anywhere).
* **Deep links** — the ported header, mega menu, mobile menu, footer, cards and
  CTAs resolve through §4, so no ported link can land on a 404.

---

## 7. Section-by-section, port against design

Every section below is the design's own file, mounted in the design's own shell,
in the design's own order. "Basis" says how the file travelled; "app seam" says
what it reads from this application.

| # | section | ported from | design root | basis | app seam |
|---|---|---|---|---|---|
| 1 | Hero | `sections/Hero.jsx` | `.hero` | byte-for-byte + `fetch-priority` | art + routes |
| 2 | CategoryCollage | `sections/CategoryCollage.jsx` | `.collage` | routing only | catalogue (counts), art, routes |
| 3 | SareeLookbook | `sections/SareeLookbook.jsx` | `.saree` | routing + live curation | catalogue, art, routes |
| 4 | BridalCampaign | `sections/BridalCampaign.jsx` | `.bridal` | routing only | catalogue (min price), art, routes |
| 5 | JewelleryTheatre | `sections/JewelleryTheatre.jsx` | `.jewel` | routing only | catalogue, art, routes |
| 6 | PromoBanner | `sections/PromoBanner.jsx` | `.promo` | byte-for-byte | offer register + cart |
| 7 | MensEditorial | `sections/MensEditorial.jsx` | `.men` | routing only | catalogue, art, routes |
| 8 | KidsPlayground | `sections/KidsPlayground.jsx` | `.kids` | routing only | catalogue, art, routes |
| 9 | Bestsellers | `sections/Bestsellers.jsx` | `.best` | byte-for-byte | catalogue, art, routes |
| 10 | KurtiLookbook | `sections/KurtiLookbook.jsx` | `.kurti` | live curation | catalogue, art, routes |
| 11 | Newsletter | `sections/Newsletter.jsx` | `.news` | routing only (form: capability-gated) | subscription (gated) |
| 12 | TrustStrip | `sections/TrustStrip.jsx` | `.trust` | routing only | art, routes |

The shell around them is ported the same way: `layout/AnnouncementBar.jsx`,
`layout/Header.jsx` (sticky, mega menu, mobile menu, search, bag, wishlist,
account), `layout/Footer.jsx`, `layout/Layout.jsx`,
`navigation/{MegaMenu,MobileMenu}.jsx`, `product/{ProductCard,Price,OptionSelector,WishlistButton,useAddToBag}`,
`shopping/{CartDrawer,QuickViewModal,SearchOverlay}.jsx`,
`ui/{ArrowLink,Button,InView,Logo,NewsletterForm,Reveal,ScrollToTop,SectionLabel,Toasts}.jsx`.

---

## 8. Rendering evidence (executed, not inferred)

Rendered server-side through the real module graph (Vite `ssrLoadModule`), in both
data modes, plus the production build. No browser is available in this sandbox:
these are the measurements, not screenshots.

* **Production data** (the switch on, no backend answering — the sandbox state):
  38,534 characters of markup, 14 of 15 design section markers present, **0
  product cards** (no catalogue), 18 design plates referenced, **no promo band**
  (no active offer), and **no sample copy anywhere** in the output. This is the
  intended behaviour: empty is a valid answer, and nothing is fabricated to fill
  it.
* **Reference fixtures** (the DEVELOPMENT surface, `?view=aarna`): 96,442
  characters, all 15 markers, **23 product cards** with the design's own sample
  pieces and prices, the offer band with the sample offer it labels as such, the
  newsletter interactive. This is what a reviewer compares against the design.
* **Production build**: `npm run build` exits 0 — `dist/index.html` 3,678.82 kB
  (gzip 1,375.35; before Phase 2D: 3,511.37 / 1,336.29), the 63 plates copied to
  `dist/aarna-design/`, the ported stylesheet inlined, and every ported shell
  marker present (`aan-root`, `announce__track`, `collage__tile--women`,
  `promo__ledger`, `mmenu__col`). The bundle's only `:root`/`html` rules are
  Tailwind's own preflight — `aarna.css` contributes none.
* **Reproduce**: `cd frontend && node scripts/aarna-ssr-report.mjs` (the two
  renders and the build inspection) and `node scripts/aarna-css-audit.mjs` (the
  ownership audit above). Both are standalone evidence tools: they read the real
  module graph, write nothing, ship in no bundle, and can be deleted without
  effect.

---

## 9. Deviations and gaps — what is *not* a literal copy, and why

| # | deviation | why it was necessary | how it behaves now |
|---|---|---|---|
| 1 | the design's sample catalogue is not carried | it is prototype data, and this application has a real catalogue | rails read the live catalogue; empty when it is empty |
| 2 | the design's sample offer (code and figures) is not carried | it is a sample code; publishing it would offer a discount that does not exist | the band reads the register; hidden with no active offer |
| 3 | the newsletter form is disabled with a stated reason | no subscription endpoint, list or consent record exists | the application's own gap, surfaced instead of simulated |
| 4 | the footer's placeholder address, care hours and prototype disclaimer | not true of this house | lines render only when the application holds them; otherwise omitted |
| 5 | the social row is empty | the design's three links point at the platforms' home pages, not this house's profiles | no social row until real profiles are configured |
| 6 | the drawer's offer copy prints the register's own labels | the design's copy named its sample offer | "`CODE` applied — 15% OFF." / "₹500 OFF" |
| 7 | the trust strip's help line names the contact page instead of care hours | the care hours were the sample site's | links to the real `/contact` |
| 8 | `MensEditorial`'s editorial tag | the design names a sample product (`cocoa-bandhgala-ensemble`) that does not exist in this catalogue | the tag renders only when a matching product does; otherwise the section shows without it |
| 9 | the announcement rail shows one line, not three | two of the design's three lines assert a sample offer and care hours | the surviving line is delivery |
| 10 | fonts are requested at mount, from Google Fonts | the design bundled them via `@fontsource`; this project does not add dependencies | one `<link>`, only on the ported page |
| 11 | imagery is staged in `public/aarna-design/` | the application's media library may not be added to or renamed, and these plates are not catalogue media | 63 files, own namespace, reversible |
| 12 | fixed-amount offers do not drive the band | the band's composition is built around a percentage | they still apply in the bag, through the register |
| 13 | account, wishlist and checkout are the application's own screens | the design's `Account`, `Wishlist`, `Checkout`, `TrackOrder` pages are prototype screens over sample data | the ported links land on the real, authenticated pages |

**Capability gaps recorded, not implemented (out of scope):** no newsletter
endpoint; no editorial/CMS source for the design's campaign copy and imagery (it
is carried as approved design content); no per-line offer eligibility model in
the register (the drawer shows the offer's scope label and totals, and the
application's coupon rules remain authoritative).

---

## 10. Tests

Three suites under `src/components/aarna/__tests__/`, 42 tests, no fixtures inside
the port's own graph:

**`aarnaPortParity.test.js` (16) — fidelity**
the port is exactly the design's homepage closure · every copied file IS the
design's file, adapted by exactly the pinned amount · the adaptations are the
documented ones — nothing else moved · every boundary module keeps the design's
export names and declares itself · no boundary module keeps a prototype data
source alive · the catalogue boundary maps the live catalogue and never invents a
product · the port's own modules render the design's page, not a second
application · `aarna.css` is byte-for-byte the transform of the design's seven
sheets · every declaration the design wrote survives, and no others appear ·
every ported selector is scoped, and nothing global survives · the design's media
and container queries, breakpoints and load order are carried over · the host
neutralisation stays tiny, scoped and documented · the design's plate registry is
carried over key for key, and every plate is staged · the application's own media
library is untouched by the port · no ported module addresses a forbidden asset
path or adds a font package · the design's two type families are requested by the
port, and only on its mount.

**`aarnaIntegration.test.js` (14) — integration and isolation**
every destination the design wrote resolves to a route this application registers ·
the route table is this application's own — checked against `App.jsx` and the
manifest · the design's shop vocabulary is translated to the catalogue's own paths ·
the design's information pages and customer paths resolve to the application's own ·
a product link keeps the catalogue's own identity · the translation table only
names routes the application registers · the Phase 2D port is off by default, and
only an explicit request turns it on · the port renders at the customer root only,
and the default home is untouched · the fixtures have exactly one importer, and it
is the DEV-gated surface · the production graph of the port cannot reach the
harness or its fixtures · none of the design's sample copy ships in the port · the
port keeps the application's own truth about the house and the offer · the
catalogue boundary answers from the application, not from a sample · the port
never renders a destination it cannot resolve, and never fetches its own data.

**`aarnaShellIntegrity.test.js` (12) — the shell the customer receives**
every ported shell file is the design's own file, minus the pinned adapter lines ·
the shell asks the host for nothing · the customer root renders the design's shell
once, in the design's order · the application's own header, footer and drawer are
not on this surface · the navbar carries the design's five destinations and its
five controls · every navbar destination is a route this application registers ·
each of the design's four mega panels renders its columns, its plate and only
registered destinations · the footer closes the page, after the last section,
exactly once · the footer renders every group the design declares, on registered
routes · the footer states only what the house can stand behind · the announcement
rail states the house's own line and can be dismissed · the port the shell speaks
to is the one it renders. This suite boots Vite (`ssrLoadModule`) and renders
`CustomerLayout` inside the application's provider stack — see §14 — so it is the
only suite that observes the composed surface rather than the source tree.

Run them with:

```bash
cd frontend
node --import ./scripts/node-loader/register.mjs --test "src/components/aarna/__tests__/*.test.js"
```

---

## 11. Verification gates

| gate | result |
|---|---|
| port tool `--check` | the port matches the design (50 copied files, 88,885 bytes of CSS) |
| Phase 2D suites | **42 / 42 pass** (30 before Phase 2D.1) |
| whole `src/**/__tests__` suite | **186 / 186 pass** (180 at 2D.1, 168 before it; 138 before Phase 2D) |
| integrated shell render (`aarnaShellIntegrity`) | 38,665 characters; one announce/header/nav/main/footer, in order; every destination registered |
| `npm run build` | **exit 0** — 3,678.78 kB / gzip 1,375.33 (last measured, Phase 2D.1) |
| audits (all 20 `qa:*` / `audit:*` scripts) | **19 pass**, plus the known pre-existing `audit:employee-management` failure |
| `home-page/` | untouched (0 changes) |
| `frontend/src/App.jsx`, `AtelierDesign.jsx`, the 2A/2B/2C sheets | untouched |
| application media library | 238 files, unchanged |
| dependencies | `package.json` unchanged; nothing installed |
| dev servers | harness on 5173, application on 5174 — `/`, `/?home=aarna`, `/?home=atelier`, the ported module and the staged plates all answer 200 |

---

## 12. How to review, and how to roll back

```bash
cd frontend && npm ci
npm run dev -- --port 5174            # the application
#   http://localhost:5174/?home=aarna     ← the Phase 2D port
#   http://localhost:5174/?home=atelier   ← the existing homepage (default)
#   http://localhost:5174/?home=editorial ← the Phase 2C composition
npx vite --config vite.preview.config.js --host 0.0.0.0 --port 5173
#   http://localhost:5173/preview.html?view=aarna
#     the reference surface: the ported page with the design's own fixtures,
#     at 1440×900, 834×1112 and 390×844, plus `&embed=1` for a chrome-less frame
```

The reference surface is the comparison tool: it mounts the identical ported page
and substitutes the design's own labelled sample catalogue and offer through the
port's preview seams, so rails, cards, prices, badges and the offer band can be
compared section by section with the design at each width. It renders nothing but
the page in `embed` mode, and it is `import.meta.env.DEV`-gated.

The navbar and the footer on that root are covered in §14: what was measured,
what could not be measured without a browser, and the five-step viewport check.

Rollback is the switch: `?home=atelier` (or an unset/`atelier`
`VITE_STOREFRONT_HOME`) returns every customer route to the existing storefront.
Disabling the port needs no code change; the ported files can then be deleted
wholesale (`src/components/aarna/`, `public/aarna-design/`, the three preview
files' aarna entries, the `aarna` switch value and the `CustomerLayout` arm).

---

## 13. Boundary confirmation

* The default storefront, its shell, its hero and its sections are **unchanged**;
  2C's composition, switch and fallback are **unchanged**.
* `?home=aarna` and `VITE_STOREFRONT_HOME=aarna` are the only ways in; the switch
  is off in every build that does not set the variable.
* No dependency was added, no image in the existing library was added, renamed or
  removed, `home-page/` was not modified, and no mock catalogue, sample offer or
  simulated service ships in a customer's module graph.
* `App.jsx` does not know the port exists.

---

## 14. Phase 2D.1 — the navbar and the footer, verified

Phase 2D.1 asked a narrow question — is the customer's navbar and footer the
design's own, on the integrated root, exactly once and in the right place? — and
answered it by *rendering the surface a browser gets* rather than reading the port.

**What was rendered.** `src/layouts/CustomerLayout.jsx` inside the provider stack
`src/App.jsx` builds (`CheckoutProvider` → `OrderProvider` → `ShoppingProvider` →
`InventoryProvider` → `AccountProvider` → `AuthProvider`), under a `MemoryRouter`
at `/?home=aarna`, with `VITE_STOREFRONT_HOME` defined the way a deployed build
sets it. Production data on the development module graph — i.e. the DOM behind
`/?home=aarna`, minus effects:

| measured on the integrated customer root | result |
|---|---|
| markup | 38,665 characters |
| `.announce` · `header.header` · `nav[aria-label="Primary"]` · `<main id="main">` | one each, in the design's order, after the skip link |
| primary navigation | four disclosure buttons (`Women`, `Men`, `Kids`, `Essentials`) + the `Bridal` link; all five destinations registered |
| navbar controls | `Open menu`, `Search`, `Account`, `Wishlist, 0 items`, `Shopping bag, 0 items` — one of each; four anchors in the header (wordmark, `Bridal`, `Account`, `Wishlist`); search and bag are buttons, so nothing navigates on hover |
| mega panels | all four render their columns (`3 / 2 / 1 / 2`) and their feature plate; 42 anchors, every one registered |
| homepage sections | the design's eleven fixed sections in order (`hero` → `trust`); the promo band appears only when the offer register holds an active offer |
| `<footer class="footer">` | **exactly one**, after `TrustStrip`, and the last block on the page (only the overlay layer follows) |
| footer contents | `__top`/`__brand`/`__lede`/`__desc`/`__news` (form present, disabled, "opens once the subscription service is connected") · `__groups` — the design's four groups plus Contact, 16 links, all registered · `__signature` · `__bottom` (© row, empty `__social`) |
| Contact column | exactly the facts the record holds — the city; the design's placeholder address and care hours are `null`, render no row, and there is no `mailto:` or `tel:` |
| app shell | `pf-shell__header` / `__footer` / `__mobile` / `__announce` — zero; the only host class is the single `pf-shell__surface` canvas wrapper, outside `.aan-root` |
| announcement rail | the house's one line, dismissible, `aria-live="off"` (the design's own attribute) |

**The shell is the design's file.** The six shell files differ from
`home-page/` by exactly the pinned lines below and nothing else — asserted line
for line in the suite, so drift fails rather than passes:

| file | the only difference from the design |
|---|---|
| `AnnouncementBar.jsx`, `Layout.jsx` | `Layout` takes a `children` slot (`{children ?? <Outlet />}`); `AnnouncementBar` is byte-identical |
| `Header.jsx`, `MegaMenu.jsx`, `MobileMenu.jsx` | the `Link`/`NavLink` import comes from the port's router adapter instead of `react-router-dom` |
| `Footer.jsx` | the same import, plus the three `site.contact.*` guards and the copyright row (`All rights reserved.` in place of the prototype line) |

The shell also asks the host for nothing: no `.pf-` token, and every import is
either relative or one of `react`, `react-dom`, `react-router-dom`,
`framer-motion`, `lucide-react`.

**Why the report of a broken navbar and a missing footer does not reproduce.**
Both symptoms are consistent with the *other* surface, not this one:

* **5173 `/preview.html?view=aarna` is a review frame, not the application.**
  Its own sticky chrome sits above a fixed-height, internally-scrolling frame, so
  the ported header starts below the harness's bar and the ported footer sits far
  below the fold of a nested scroller. Nothing in that frame is the customer root.
* **`?home=` is a DEV gate.** A build that does not set
  `VITE_STOREFRONT_HOME=aarna` renders the Atelier homepage, whose navbar and
  footer are the application's own — never the design's.

That is the strongest available explanation and it is stated as a hypothesis: no
browser was available to confirm it (below).

**Limitation, stated plainly.** This tree has no browser and no DOM
implementation — no Chromium/Firefox/WebKit, no `jsdom`, no
Playwright/Puppeteer/happy-dom. **Computed layout was not observed and is not
asserted anywhere**: heights, sticky offsets, breakpoint switches, z-order and
overflow are unverified. The numbers above are DOM structure and stylesheet
facts, not pixels. Pixel parity still needs a human at a viewport; the quickest
check, which also refutes or confirms the diagnosis above:

```js
// on http://localhost:5174/?home=aarna  (the integrated root)
document.querySelectorAll("footer.footer").length   // 1
document.querySelectorAll("header.header").length   // 1
document.querySelectorAll(".aan-root .mega").length // 0 closed, 1 with a panel open
```

1. Load 5174 `/?home=aarna` at 1440, 834 and 390 wide; the announcement bar,
   header, hero and footer must all be present, and the header must stick.
2. Open each of the four nav items — the panel must sit under the header, full
   width, above the page.
3. Scroll to the end — the footer must follow `TrustStrip` and must not be
   duplicated or overlapped.
4. Compare section by section against 5173 `?view=aarna&embed=1` at the same
   widths (the reference surface, with the design's labelled sample catalogue).
5. Repeat at 390 wide with the console open: no horizontal scrollbar on the
   document, and the mobile menu opens from the burger.

---

## 15. Phase 2D.2 — screenshot-guided reproduction, and the four defects it found

Phase 2D.1 could not render anything and said so. This phase could: a real
Chromium (131) was made available inside the sandbox and the integrated page was
inspected at 1440, 1100, 1024, 834, 768, 640 and 390 px — computed styles,
bounding boxes, cascade provenance, hits on the real overlays, document height
and scroll behaviour. **This is the first visual verification in this project.**
Every finding below was observed in that browser, not inferred, and each fix was
re-measured after the change.

### 15.1 What the two screenshots actually showed

Both screenshots are of the **2C surface** (`?home=editorial`) — which is what a
browser gets when the Phase 2D switch is not on. That is why the navbar said
"Collections": `Collections` exists in exactly one place in this repository, the
2A shell's own information architecture (`config/navigationConfig.js`
`primaryNavigation` → `.pf-shell`). The design's own rail is
`Women / Men / Kids / Essentials / Bridal` and contains no such label. The
"Silk" text and the outlined frame belong to the 2B lookbook (`?home=editorial`),
which the ported homepage does not render at all.

So the two surfaces were checked separately, and the fixes were applied to the
surface that had the defect.

### 15.2 Defect 1 — the navbar collision (confirmed, reproduced)

`.pf-shell__left` carried `min-width: 0`, which Project B's header never had. The
`1fr auto 1fr` header grid therefore refused the rail its own width and shrank
the column below the rail's min-content width; the rail is `white-space: nowrap`,
so its tail — the last group — was painted straight across the centred brand.

Measured before the fix, at 1024px: column **324px** for a rail that needs
**347px**; `left 37..361` against `brand 377..647` → the rail's tail painted over
the brand. At 390px: `left 16..294` against `brand 242..358` — "COLLECTIONS" ran
through the logo plate, as in the screenshot.

### 15.3 Defect 2 — the burger never went away (confirmed)

`.pf-shell__burger { display: none }` sits **above** `.pf-shell__icon { display:
inline-flex }` in the same file, and the element has both classes. Equal
specificity, later rule wins: a 40px hamburger was painted beside the rail at
**every** width — another 30px stolen from the left column, and the visible
"cramped and visually unbalanced" look.

The fix is specificity, not a new design: `.pf-shell__icon.pf-shell__burger`
(`display: none` at desktop, `inline-flex` ≤1023px). The rail's own breakpoint is
unchanged (B's): rail + Explore above 1023px, burger below.

Measured after: burger `none` and 0px at 1440/1100/1024; `flex` and 40px at
900/834/768; `flex` 34px at 390. The rail stays on one line down to 1023px.

### 15.4 Defect 3 — the blank framed block above the service strip (confirmed)

`.pf-sec-look__imgwrap` had **no height**, because the frame is drawn out of flow
around the plate and `hasPlate()` was false — the taxonomy desk had filed the
collections but not their covers. `.pf-sec-look__frame` is `position: absolute`
with `top/bottom`, so against its (collapsed) containing block it painted a
**503 × 2px** outline in a 580px blush section: "a large blank blush-colored
section with a partially visible outlined image frame", with the mood line —
"Silk" is one of the fabric collections — under it.

Fixed at the source: the framed column exists only while some mood can fill it,
the section opens on a mood that has a plate, and with none the body takes the
whole row (`--body-only` grid). Re-measured in the same three data states:
covers-none → no frame element, no column, 507px section; the two states with
covers → byte-identical to before (frame 503×670, section 1029px). Nothing was
invented and no approved direction was changed.

### 15.5 Defect 4 — the overlays inside the blurred header (confirmed)

`<header>` carries a `backdrop-filter`. Per CSS Filter Effects that makes the
header a containing block for its `position: fixed` descendants, so the mobile
drawer and the search dim — both children of the header — were sized to the
header's own **56–64px** instead of the viewport. Measured: `.pf-shell__mmenu`
`0,0 351x56` at a 390×844 viewport, `.pf-shell__scrim` `390x56`, and the search
dim `1440x64` at 1440×900. The menu opened, took focus and trapped it — with the
drawer invisible and the page unusable.

Fixed structurally, as in the design's own `Layout`, where the drawer is not a
child of the header: `StorefrontMobileNav` and the dim are now the header's
siblings. The dim also moved from `z-index: -10` to `50` — with no stacking
context of the header as its parent, a negative index would have painted it
behind the page it dims; 50 keeps it under the header's 60.

Measured after: drawer `0,0 351x844` (full viewport), scrim `390x844`, dim
`1440x900` under the header, group walk intact (`Women` open on entry, 668px
panel; clicking `Men` closes it and opens a 380px panel), Escape closes, no
console errors.

### 15.6 The footer (checked, no defect)

At 1440 / 834 / 390 the Aarna footers sit at their own horizontal edges and page
bottom is flush for both surfaces: `document.documentElement.scrollHeight`
matches the footer's bottom exactly (aarna 9793; editorial 2249 / 1758 / 2246,
footer bottom = innerHeight at every width), exactly one `<footer>`, no nested
scroller (`body { overflow-y: auto }`, zero nested scroll containers), and the
burger menu — not a clipped page — is what hides navigation on small screens.
The lookbook fix above removes the *last* blank block that preceded the strip.
This corrects and supersedes §14's "no computed layout was observed" caveat: it
was observed in this phase, and the footer is reachable at the true end.

### 15.7 Files changed in 2D.2

| file | change |
|---|---|
| `shell/storefront-shell.css` | removed the invalid `min-width: 0` from `.pf-shell__left`; `.pf-shell__icon.pf-shell__burger` specificity fix at both breakpoints; repaired the mangled `@media (max-width: 1023px)` block; returned the nav to `display: none` there; split `.pf-shell__explore` into its own rule |
| `shell/StorefrontHeader.jsx` | `StorefrontMobileNav` and the dim render as the header's siblings, not its children |
| `home-sections/SectionLookbook.jsx` | framed column only when a mood has a plate; opens on a mood that has one |
| `home-sections/home-sections.css` | `.pf-sec-look__grid--body-only` for the no-plate state |
| `shell/__tests__/storefrontShell.test.js` | 3 new tests (21 total): the ≤1023px rule integrity + `min-width` constraint, the burger/icon cascade, the overlay containment + z-order |
| `home-sections/__tests__/homeSectionsRender.test.js` | 2 new tests (33 total): the no-cover and cover states of the lookbook |

### 15.8 Gates (executed after the fixes)

| gate | result |
|---|---|
| `node scripts/aarna-port.js --check` | the port matches the design (50 copied files, 88,885 bytes of CSS) |
| whole `src/**/__tests__` suite | **186 / 186 pass** (180 before this phase) |
| `npm run build` | **exit 0** — 3,679.61 kB / gzip 1,375.41 |
| `git diff --check` | clean |
| `home-page/` | untouched (0 changes) |
| 1440 / 1100 / 1024 / 834 / 390 | no overlap, no horizontal overflow, no console errors on either surface |

### 15.9 The reference comparison (the switch is off, so the shell was compared directly)

The screenshots were taken with the switch off, so the repaired 2A shell was
compared against the design's own desktop header (B) rather than against the
ported `.aan-root` header, which is a different, faithful implementation of the
same design. Measured at 1024px: rail `37..384`, brand `400..670`, actions
`686..987`; the spaces and the rail's own `clamp(12px, 1.7vw, 26px)` gaps are the
design's. Five primary groups are this application's information architecture
where B authored four — the one documented adjustment, unchanged from Phase 2A.
