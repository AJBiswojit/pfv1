# Phase 2B — homepage content sections (preview-only)

Phase 2B ports the sections that sit **below the hero** in the approved
`home-page/` design (`frontend/` architecture, Project B's visual direction),
builds them against the application's **existing** services, and adds one
preview surface that shows the whole homepage in one document.

Nothing was mounted in the running application: `App.jsx` is byte-identical and
still serves the live homepage on `/`.

---

## 1. Files created and modified

### Created — `frontend/src/components/storefront/home-sections/`

| File | Lines | What it is |
| --- | ---: | --- |
| `HomeSections.jsx` | 69 | The composer: the ten sections in the approved order, plus the `source` seam only the preview harness uses. |
| `SectionCategories.jsx` | 77 | 02 · the four-department collage. |
| `SectionSareeEdits.jsx` | 97 | 03 · saree edits (plate + vertical word + strip + numbered edits + rail). |
| `SectionBridalPair.jsx` | 120 | 04 · the bridal spread (bride panel, arch inset, groom inset). |
| `SectionFinishingTouches.jsx` | 148 | 05 · the dark jewellery theatre with its filter row and focus stage. |
| `SectionOffer.jsx` | 147 | 06 · the offer band (live offer register, copy-to-clipboard code). |
| `SectionMensEdit.jsx` | 79 | 07 · menswear editorial + chip row + rail + floating tag. |
| `SectionKidsEdit.jsx` | 105 | 08 · kids collage, sticker, chips, two-up rail. |
| `SectionProductRail.jsx` | 86 | 09 · the bestsellers rail with department filters. |
| `SectionLookbook.jsx` | 143 | 10 · the collection lookbook (fabric/editorial collections). |
| `SectionServiceStrip.jsx` | 65 | 12 · the service strip — content-source gated, empty in production today. |
| `SectionProducts.jsx` | 52 | The shared product rail: existing `ProductCard`, existing covers, existing wishlist. |
| `sectionPlate.jsx` | 48 | The one image primitive (`PratikshyaImage` wrapper) + `hasPlate()`. |
| `sectionData.js` | 537 | The models: `SECTION_COPY` (B's approved copy) + nine builders over the app's own services. |
| `home-sections.css` | 1,973 | All geometry, `.pf-sec*` only, variables scoped on `.pf-sec`. |
| `__tests__/homeSectionsRender.test.js` | 569 | 30 tests (see §6). |

### Created — preview harness

| File | Lines | What it is |
| --- | ---: | --- |
| `preview/HomePreview.jsx` | 325 | `?view=home`: the full composition, review chrome, device frames. |
| `preview/previewSectionFixtures.js` | 472 | The labelled 2B fixtures (19 real plates, 14 sample product rows, sample offer, sample service copy). |

### Modified (additive, existing files)

| File | Change |
| --- | --- |
| `preview/main.jsx` | Adds the `home` view; the dispatch still falls through to the hero. One line, on purpose: the 2A suite pins that expression. |
| `preview/previewFixtures.js` | `PREVIEW_FIXTURE_LABEL` now names the Phase 2B samples too. No other line touched. |

Tracked-file diff is unchanged at **5 files / 232 insertions** (Phase 1's
tokens); every 2B and 2A file is untracked/new. `git diff --check` exits 0.

---

## 2. What the source actually contains, and the order it was built in

Project B's `home-page/src/pages/Home.jsx` renders twelve sections. They were
read first, then implemented:

| # | Source section | Phase 2B treatment |
| ---: | --- | --- |
| 01 | `Hero` | Phase 1 — untouched (`storefront/home/HeroEditorial`) |
| 02 | `CategoryCollage` | `SectionCategories` |
| 03 | `SareeLookbook` | `SectionSareeEdits` |
| 04 | `BridalCampaign` | `SectionBridalPair` |
| 05 | `JewelleryTheatre` | `SectionFinishingTouches` |
| 06 | `PromoBanner` | `SectionOffer` |
| 07 | `MensEditorial` | `SectionMensEdit` |
| 08 | `KidsPlayground` | `SectionKidsEdit` |
| 09 | `Bestsellers` | `SectionProductRail` |
| 10 | `KurtiLookbook` | `SectionLookbook` |
| 11 | `Newsletter` | **NOT BUILT** — no backend capability (§4) |
| 12 | `TrustStrip` | `SectionServiceStrip` (content-source gated) |

No section was invented to lengthen the page.

---

## 3. Real data sources — what each section reads

Every section reads the application's own seams; `sectionData.js` is the only
place that touches data, and it reads nothing else.

| Section | Model | Services reused |
| --- | --- | --- |
| 02 collage | `buildCategoryTiles` | `data/catalog/taxonomy` departments, `taxonomyRepository.findCategory`, `resolveCategoryCover`, `getLiveStorefrontProducts` for the live counts |
| 03 saree | `buildSareeSection` | `taxonomyRepository.findCategory("sarees")` + `activeSubcategories` (the edits), `resolveCategoryCover`, live products in `category: "sarees"` |
| 04 bridal | `buildBridalSection` | canonical `the-bride` / `groom` categories, `resolveCategoryCover`, "from ₹…" derived from live prices only |
| 05 finishing | `buildFinishingSection` | canonical `finishing-touches` + its subcategories as the filter row, `resolveCategoryCover`, live products |
| 06 offer | `buildOfferSection` | `offerRepository.listCustomerVisible()`, `formatOfferDiscount`, `describeEligibility`, `resolveFestiveCampaignImage`, `resolveCategoryRoute` for the CTA |
| 07 men | `buildMensSection` | the `men` department + subcategory routes, `resolveCategoryCover`, live products; the floating tag is the first live menswear piece, linked by `productHref` |
| 08 kids | `buildKidsSection` | the `kids` department + categories, `resolveCategoryCover`, live products |
| 09 rail | `buildRailSection` | `selectNewArrivalProducts` (the catalogue's own deterministic selection) + the departments actually present in the live catalogue as filters |
| 10 lookbook | `buildLookbookSection` | `taxonomyRepository.activeCollections()` (fabric collections first) + `resolveCollectionCover` + `isProductInCollection` |
| 12 service strip | none | renders only when a content source supplies items — no such source exists today |

Products render through the **existing** rail (`SectionProducts`): the Atelier
`ProductCard`, `useProductCovers` (canonical media set), `productHref`
(`/product/{id}`) and `useWishlist`. No second cart, wishlist, pricing or
catalogue path was introduced; add-to-cart stays in the existing cart drawer.

**Empty is a valid answer.** Each builder returns `null`/`[]` when its source
has nothing, and the section renders nothing at all: no fallback copy, no
placeholder product, no invented campaign.

### Routes

Every destination comes from the canonical routing helpers
(`categoryHref`, `collectionHref`, `resolveCategoryRoute`) or the taxonomy's own
`path` values. `/about`, `/contact`, `/privacy` and `/terms` are declared in
`navigationConfig.standalonePages` but are **not** `App.jsx` routes, so B's
trust strip could not link to them; the 2B fixtures keep those items static
(§5) rather than sending a customer to the not-found page.

---

## 4. Missing backend capability discovered (not implemented, per scope)

1. **Newsletter (section 11).** There is no subscribe endpoint, no service and
   no contract. The section is deliberately absent: a form that posted nowhere
   would be a dead control, and inventing the API is out of scope.
2. **Service / trust copy (section 12).** The application has no content source
   for service copy — the marketing placement register models media only. The
   strip is therefore data-driven and renders **nothing** in production until a
   managed source exists.
3. **No jewellery department.** The taxonomy has no jewellery department, so
   B's jewellery theatre maps onto `Bridal → Finishing Touches` (bangles and
   bridal jewellery), which is where those products actually live.
4. **No verified sales ranking.** The backend exposes no sales/bestseller
   signal. The rail uses `selectNewArrivalProducts` (featured → recency →
   real photography) and prints B's own honest note on the section rather than
   implying a ranking.
5. **No client-side coupon application.** Coupons are validated at checkout by
   the server (`apiValidateOfferCode`). B's "apply code" control would be a
   second commerce path, so the offer section instead exposes a real,
   supported action — copying the code — and states that the code is applied at
   checkout.
6. **No kurti-only lookbook source.** B's lookbook is kurti-led; this catalogue
   has no kurti collection rule, so the section uses the real collection
   records (fabric collections first) with their own names, descriptions,
   covers and counts.

---

## 5. Preview

**URL:** https://5173-idzjznx3prddkmwldi6wh.e2b.app/

| Surface | URL | What it shows |
| --- | --- | --- |
| **Full homepage (2B)** | **`/`** (the default), `/?view=home`, or `/preview.html?view=home` | announcement bar → 2A header → hero → the ten 2B sections |
| Hero (Phase 1) | `/?view=hero` or `/preview.html?view=hero` | the Phase 1.5 hero preview, unchanged |
| Shell (Phase 2A) | `/?view=shell` or `/preview.html?view=shell` | the Phase 2A shell preview, unchanged |
| Framed viewport | add `&embed=1` | the composition alone, for the device frames |
| Data source | `&data=fixture` / `&data=auto` | labelled samples / backend-first |
| The live application | `/app` | untouched |

**Start:**

```
cd frontend && npx vite --config vite.preview.config.js --host 0.0.0.0 --port 5173
```

### 5.1 Preview routing fix (after the first review)

The first pass made the new surfaces reachable only through a query string
(`?view=shell`, `?view=home`), which is exactly what the live preview panel
cannot supply: it opens the port **root** inside a frame with **no address
bar**. A reviewer opening the preview therefore landed on the hero-only
surface and saw none of the Phase 2A/2B work.

Two preview-only changes fixed it — no component under review was touched:

| File | Change |
| --- | --- |
| `…/preview/main.jsx` | A URL that names no `view` now opens the full composition (`DEFAULT_VIEW = "home"`). The dispatch line itself is byte-identical, so the 2A suite's pinned expression still holds, and `?view=hero` still renders the hero preview. |
| `…/preview/PreviewViewSwitcher.jsx` (new) | The three surfaces as links, rendered in each surface's review chrome, so they are one click apart **inside** the panel. `embed=1` surfaces do not render it. |

`preview/vite-preview-server.mjs` was **not** changed in the end: it rewrites
paths only, and the surface is chosen client-side from the browser's own URL —
injecting a query string server-side would not have changed what renders. It is
back to its pinned Phase 1.6 state.

### The fixture contract

The preview supplies **data only**; every component is the real one. In
`data=fixture` mode (`auto` uses it until the backend answers) the badge reads
*"Preview fixture — canonical hero content, home-page campaign copy and the
labelled Phase 2B section samples. **NOT live backend data**"*, and
`data-home-surface="preview-fixture"` marks the surface in the DOM.

* Fixture plates are **real photography from this repository**, addressed by
  object key through the canonical media seam (`mediaObjectUrl` →
  `/api/v1/media/objects/…`). One landscape plate (`hero-jewellery-tall.webp`)
  exists only in `home-page/` and is served through the preview-only
  `/__preview-assets/` namespace.
* Fixture product rows carry a **real product id and real taxonomy labels**
  (both read from the asset path) and **no price**, with a visible `Sample`
  badge — a fixture card can therefore never be mistaken for a live catalogue
  record.
* The offer fixture is labelled **Sample offer** on the section itself.
* Fixtures live in `preview/` only: no production module imports them (asserted
  by the suite), so they cannot reach the storefront.

**No backend request is made in `data=fixture` mode**; `auto` hydrates the live
catalogue and swaps the fixtures out the moment the API answers.

### How to review

1. Open `/?view=home` — scroll once, top to bottom: 02 collage, 03 saree,
   04 bridal, 05 finishing touches, 06 offer, 07 menswear, 08 kids, 09
   bestsellers, 10 collection lookbook, 12 service strip.
2. Click through the review chrome: **Desktop 1280 / Tablet 834 / Mobile 390**
   (real device iframes) and **Responsive width**.
3. Switch **Data → Preview fixture / Auto** and watch the badge and the
   catalogue status change.
4. Try the real interactions: the collage tiles, the saree edit list, the
   kids chips, the department filters on the rail, the collection selector in
   the lookbook, focusing a jewellery tile (the dark stage paints that piece),
   `Copy code` on the offer, and the wishlist heart on any product card.

---

## 6. Verification

### Tests

| Suite | Result |
| --- | --- |
| **New:** `home-sections/__tests__/homeSectionsRender.test.js` | **30 / 30 pass** |
| New suites total (`src/**/__tests__`, run under the node loader) | **121 / 121 pass** (91 before Phase 2B: shell 17, preview 12, heroEditorialRender 16, heroModel 29, designSystem 17) |
| Bare `npm test` (the repo's own glob) | **434 tests, 412 pass, 21 fail, 1 skipped** — byte-identical to the recorded baseline; no new failures |
| `tests/brandLockup.test.js` | 5 / 5 |
| `tests/phase6LocalMediaFlow.test.js` | 7 pass / 1 fail — the known pre-existing failure (reads the absent `../pratikshya-backend/app/config.py`) |

What the 30 new tests pin: the approved order and the absence of invented
sections; the empty-backend contract (no image-led section, no `<img>`, no
invented destination); every fixture destination resolving to a real route;
product cards on `/product/{id}`; alt text on every rendered image and an
accessible name on every image-led link; lazy plates with exactly one eager
section opener; the data seams named explicitly; no `fetch`, no `localStorage`,
no second cart; the fixtures staying inside `preview/`; `App.jsx` and
`main.jsx` never importing the sections; the stylesheet being `.pf-sec*`-only
with no element/`:root`/`!important`/universal selectors; every used class
existing; reduced motion; the three copy-only fallbacks; the two gutter clamps
that keep a bleed off the page; and the hero/shell previews still resolving
their own views.

### Build

`npm run build` → **EXIT 0**, `dist/index.html` 3,407.91 kB (gzip 1,312.07 kB)
— the same as the Phase 2A build to within 0.03 kB, because nothing new is
reachable from `index.html`. `dist/index.html` contains **0** occurrences of
`pf-sec`, `HomeSections`, `HomePreview`, `pf-shell`, `StorefrontHeader`.

### Audits and QA

All 20 `audit:*` / `qa:*` scripts were run: **19 exit 0**; the single failure is
the pre-existing `audit:employee-management`, unchanged from the Phase 1
baseline.

### Preview probes (server-side)

Live dev server, HTTP 200 for `/`, `/?view=shell`, `/?view=home`,
`/preview.html?view=home&embed=1&data=fixture`, `/app`, `/index.html`; every new
module and the stylesheet transform serve 200; the media object mapping returns
`image/avif` and the preview-asset mapping `image/webp`.

### Rendered evidence (server-side render of the real components)

Full composition, fixture mode: **79,580 chars · 1 announcement rail · 1
header · 5 nav items · 92 `.pf-hero` nodes · exactly one root each of collage /
saree / bridal / jewel / offer / men / kids / best / look / trust · 29 product
links · 48 images · 0 iframes · `data-home-surface="preview-fixture"` present ·
no `/images/` literal · no legacy hero marker.**

Sections alone: fixture mode 69,678 chars / 46 images / 54 links; **empty
backend 5,216 chars / 0 images / 3 roots** (the copy-led sections only).

### Browser verification — honest limitation

**No browser or headless browser exists in this environment, so the page was
never opened in one.** The evidence above is documents, HTTP probes and
server-side renders of the real components; it is *not* pixel verification.
Layout, overflow and animation behaviour at each breakpoint should be confirmed
once by a human in the live preview before this work is integrated.

---

## 7. Decisions, deviations and honest notes

1. **Newsletter skipped, recorded** (§4.1) — the only source section not built.
2. **Departments, not collages of four arbitrary tiles.** B's collage tiles
   (women / men / kids / essentials) became the canonical departments
   women / bridal / men / kids, because "essentials" is a subcategory here, not
   a department.
3. **Jewellery theatre → Finishing Touches** (§4.3); **kurti lookbook →
   collection stories** (§4.6); **bestsellers → deterministic selection with
   B's own honesty note** (§4.4); **apply-code → copy-code** (§4.5).
4. **Empty-state behaviour is deliberately asymmetric.** Image-led sections
   (collage, bridal, jewellery, offer, rail, lookbook) disappear entirely when
   their plates cannot resolve; copy-led sections (saree, menswear, kids,
   service) keep their headings, routes and chips and simply drop the plates,
   with a `--copy-only` layout so a missing plate cannot leave a dead column.
   `hasPlate()` in `sectionPlate.jsx` is the single rule.
5. **The service strip is empty in production** until a content source exists —
   it is *not* hard-coded marketing copy.
6. **Accessibility.** Plates are decorative (`alt=""`) unless they are a tile's
   content, in which case the taxonomy name/`aria-label` carries the meaning;
   product cards keep their product name. Filter rows follow the application's
   own pressed-button pattern (`role="group"` + `aria-pressed`), not tab
   semantics without panels. Every plate is `loading="lazy"` +
   `decoding="async"` except the one that opens the finishing-touches stage.
   Focus-visible outlines come from the existing `.pf-sec a/button:focus-visible`
   rule.
7. **Reduced motion.** Reveals use the design-system primitives
   (`FadeUp`/`MaskReveal`), which already short-circuit under
   `prefers-reduced-motion`; the framer-motion touches (the rail underline, the
   lookbook cross-fade, the jewel stage change) read `useReducedMotion()` and
   render statically when motion is reduced. One CSS block removes all image
   transitions.
8. **Two geometry values were ADJUSTED** (both marked in the stylesheet) so a
   bleed cannot push a horizontal scrollbar onto the page at the narrowest
   widths: the jewel stage's outward margin and the lookbook frame's outward
   offset are now capped at the page gutter, which leaves every desktop width
   exactly as Project B drew it. Sections whose decoration bleeds (saree,
   bridal, offer, kids) clip it, and the jewel section — whose stage is sticky
   — must not clip, so it is clamped instead.
9. **CSS is namespaced and scoped.** Every selector is `.pf-sec*`, every custom
   property is declared inside `.pf-sec`, no `:root`/element/universal/`!important`,
   no `@import`, no Tailwind literal in the new JSX. Admin, Super Admin and
   Employee portals cannot be reached from this file.
10. **Not verified here:** any real backend data. With no database the live
    path renders the empty state (evidence in §6); the sections were never seen
    against a seeded API.

---

## 8. Boundary confirmation

* `frontend/src/App.jsx` — **byte-identical**; `/` still renders `AtelierDesign`,
  the catch-all still renders `NotFound`. No route was added, removed or
  remounted, and `HomeSections` is imported by no production module.
* `AtelierDesign.jsx`, `HeroCarousel.jsx`, the Phase 2A shell and the Phase 1
  hero — not modified.
* No change to auth, RBAC, route guards, API clients, services, Admin /
  Super-Admin / Employee portals, cart, checkout, payment, order, inventory,
  backend, database or migrations. The tracked diff is still the five Phase 1
  design-token files.
* No manifest, lockfile, `vite.config.js`, `index.html`, `.env` or ignore-policy
  edit; no dependency installed; no file or image renamed, moved or deleted;
  no Project B stylesheet imported; no `/images/*` literal in production code.
* No newsletter, marketing API, product-placement curation or other new backend
  capability was implemented.
* Nothing was committed or pushed.

---

## 9. Stop condition

Phase 2B is complete as specified: the homepage content sections exist in the
approved order, on the application's own architecture, reviewable in one
preview surface together with the hero and the 2A shell, and the live homepage
is untouched.

**Recommended next phase (not started):** Phase 2C — integrate `HomeSections`
below the hero behind a controlled switch, which first needs (a) a real backend
and seeded media so the sections can be seen with live data, (b) a decision on
the newsletter capability, (c) a managed content source for the service strip
and the section headings, and (d) a human pass over the preview at desktop /
tablet / mobile to confirm layout before the live homepage changes.
