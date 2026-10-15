# Phase 6 — Adopting the Design's Product Detail Page

Phase 6 of the approved migration takes the design's product page
(`home-page/src/pages/Product.jsx`, 103 lines) and makes it the product page the
port actually serves — inside the **existing `?home=aarna` switch**, never as a
re-skin of the production route. The production product page
(`pages/ProductDetail.jsx` and `components/product/*`) is untouched and remains
what every customer without the switch sees.

Two rules governed the work, and both held:

* **the design owns presentation.** The page is the design's file, carried over
  by `scripts/aarna-port.js` and adapted only by named rewrites — 15 of its 103
  lines differ, and every one is in the tool, not in the file.
* **the application owns everything else.** Catalogue, availability, stock,
  prices, cart, wishlist, routing, the 404 and the retryable error state all
  come from the application. No price, stock figure, rating, review count or
  delivery promise is invented anywhere in the port.

| | |
|---|---|
| Design file adopted | `home-page/src/pages/Product.jsx` → ported, pin **15** |
| Second design file carried | `home-page/src/pages/NotFound.jsx` → ported, pin **0** (byte-identical) |
| Switch | extended, not replaced: `config/storefrontHome.js` gains one path predicate |
| Production files changed | `layouts/CustomerLayout.jsx` (the aarna branch), `config/storefrontHome.js`, `scripts/aarna-port.js` |
| Port files changed | `AarnaStorefront.jsx`, `mock/data/products.js`, `pages/Product.jsx` *(new)*, `pages/NotFound.jsx` *(new)* |
| Suites | new `__tests__/aarnaProductPage.test.js` (17); three existing suites re-pinned |
| Dependencies added | none |
| Production default | unchanged; with the switch off nothing in this phase is reachable |

---

## 1 · What the design's page assumed, and what this surface is

The design's product page is written against a synchronous sample catalogue that
is always in memory and always buyable. Four of its assumptions are false here:

| The design assumed | This surface | What Phase 6 does |
|---|---|---|
| `getProductBySlug(slug)` is synchronous; `null` means "no such piece" | the catalogue is fetched after mount; an empty read can mean *still loading*, *unreachable*, or *genuinely absent* | the boundary answers with `{ product, state }` and the page keeps three different states |
| `product/:slug` | this application routes `product/:productId` | the page reads either parameter and the boundary resolves either identifier |
| every piece is buyable, quantity stops at a fixed `10` | availability, stock and a made-to-order limit are real | ceiling comes from the application's own `getMaxQuantity`; an unavailable piece says so and cannot be bagged |
| care, delivery and returns are prototype prose | the catalogue publishes its own copy | the record's `careInstructions`, `deliveryInfo`, `returnInfo`, `details` and `specifications` are rendered; the design's sentences stand in **only** where the catalogue published nothing |

The page also gains one accordion the design had no equivalent for — **Details**
(production's `ProductDetailsAccordion` renders the same two things: the free
`details` text and the `specifications` table) — and keeps the design's other
three (`Fabric & craft`, `Care`, `Delivery & returns`).

### Rewrites, all in `scripts/aarna-port.js`

| # | Rewrite | Lines |
|---|---|---|
| — | routing (`react-router-dom` → the port's shim) | 1 |
| — | catalogue boundary import, identifier resolution | 2 |
| — | the design's `Button` imported for the retry (see §5, finding 1) | 1 |
| — | media fallback on the gallery plate | 1 |
| 4b | real availability, real ceiling, single-value option rule | 2 |
| 5 / 5b / 5c | refusal order, the bagged choice, the chip's chosen value | 3 |
| 6 | the stepper stops at the catalogue's stock, not at ten | 1 |
| 7 | the buy button states what the catalogue states | 1 |
| 9 / 10 / 11 | fabric + craft, care, delivery + returns — from the record | 2 |
| 12 | the Details accordion | 1 |
| 4 | the note slot states real availability, not "sample data" | 1 |
| — | two appended state components (`ProductLoading`, `ProductUnavailable`) | — |

`pages/NotFound.jsx` is carried byte-identical: the design's product page renders
it for an unknown piece, and its only link already reaches the routing shim.

## 2 · The boundary decisions, stated

Three of them are judgement calls, so they are written down rather than buried:

1. **A miss is only a 404 when the catalogue fully loaded.** The store publishes
   `ready`, `partial` and `error`. `partial` means a feed failed and the rows in
   hand are not the whole catalogue — so a lookup that misses there is *not* proof
   the piece does not exist. The port shows the honest unreachable state instead
   of telling a customer a piece does not exist. **The cost, stated plainly:**
   when an unrelated feed failed, a genuine 404 also renders as the error state.
   The production page makes the same choice (it renders a load error, never a
   false 404).
2. **One available option value is preselected.** Production needs no size choice
   for a piece whose only size is "Free Size"
   (`ProductPurchasePanel.jsx::isFreeSizeOnly`); a port may not ask more of a
   customer than the page it stands in for. Two or more values still have to be
   picked, exactly as production requires.
3. **`availabilityCopy` comes from the catalogue, not the inventory dashboard.**
   Production's `availabilityCopy` prefers live inventory (`InventoryContext`,
   tracked stock) and falls back to the catalogue. The ported page reads the
   catalogue record — the same thing production shows for a piece whose inventory
   is not tracked — and the stock ceiling already caps what can be bagged. This is
   deliberately the *narrower* claim, not a second inventory source.

## 3 · The adoption gesture — the route table

`App.jsx` in the design mounted its shell as a layout route and its pages inside
it. The port now mirrors that exactly, using the `Outlet` slot the ported `Layout`
always had:

```jsx
<Routes>
  <Route element={<Layout />}>
    <Route index element={<Home />} />
    <Route path="product/:productId" element={<Product />} />
    <Route path="*" element={<NotFound />} />
  </Route>
</Routes>
```

It is mounted **inside** this application's single `BrowserRouter` — no second
router, no `AnimatePresence` above the sticky header. `CustomerLayout` decides
whether the table is reached at all: `useAarnaHome()` (root) or the new
`useAarnaProduct()` (`/product/:productId`, exactly — `AARNA_PRODUCT_PATH`), both
under the same switch (`?home=aarna` in dev, `VITE_STOREFRONT_HOME=aarna` in a
build). With the switch off, the port is not in the tree.

## 4 · Tests

**New — `src/components/aarna/__tests__/aarnaProductPage.test.js` (17 tests).**
Renders the real composition (the application's own provider stack around
`CustomerLayout`) through Vite SSR at the real path, on three hosts: switch on,
switch on with no catalogue, switch off.

* the switch: off ⇒ the application's own page and nothing of the port; on ⇒ the
  design's page owns the path; homepage and product page do not leak into each other
* the states: an unarrived catalogue renders the design's loading frame and
  invents no name, price or buy button; a fully loaded catalogue with no such
  piece renders the design's 404; a half-loaded catalogue claims nothing; an
  unreachable catalogue renders the error state — **actually rendered**, with its
  retry and return actions (see §5)
* the record: name, description, fabric, craft, availability copy, the four
  accordion titles, the Details section only when the record has details, and
  every long-form field carried to the design's shape
* the rules: `maxQuantity` is the application's own `getMaxQuantity`; the design's
  fixed ten is gone; a single-value option is preselected; an unavailable piece is
  disabled and says why, in the production page's own sentence
* nothing fabricated: no rating, review count or invented delivery promise, in
  the page or the fixtures; the retry is the application's `refreshCatalog`; the
  page fetches nothing itself

**Re-pinned (three existing suites, changes reviewed line by line):**
`aarnaPortParity` closure count 54 → 56, link-rendering files 19 → 20, and the
mount test now asserts the design's route table and forbids a second router;
`aarnaLiveCatalogue` gains the product page's plate to `CATALOGUE_PLATES` (8 rows),
a depth-aware import assertion, and the boundary's import line;
`aarnaIntegration` asserts the product predicate and that only `/product/<id>`
resolves to it.

## 5 · Findings

1. **A real defect in this phase's own work, found by the browser and not by the
   tests.** The error state used the design's `Button` and the ported page had not
   imported it — the branch threw `Button is not defined`, so an unreachable
   catalogue rendered a blank page. It was testable only as *rendered output*;
   the source-level pin passed. Fixed in the port tool (+1 pinned line) and the
   suite now renders the failing state instead of asserting its text.
2. **A fixture was wrong, not the application.** The first browser run showed the
   *production* product page crashing with `Cannot read properties of undefined
   (reading 'includes')` — `ProductPurchasePanel.jsx:193` reading
   `product.unavailableColors`. The backend's product schema always emits
   `unavailableColors`/`unavailableSizes` (`backend/app/schemas/catalog/product.py`,
   Pydantic defaults), so the fixture was the bug. Corrected in
   `.p6/tools/p6-catalogue.mjs`; the production page then rendered its own
   headings with no page errors. **No production change was needed or made.**
3. **The ported page asks for no choice production does not ask for.** Visible in
   the browser, then fixed and pinned (§2, decision 2).
4. **Availability copy is deliberately narrower than production's** (§2,
   decision 3) — recorded so a reviewer does not read it as an oversight.

## 6 · Browser verification (real Chromium 131, real dev server, real bundle)

`cd /tmp/browser && node p6.mjs` → `.p6/evidence/` — **59 readings, 0 false.** No page error in any
scenario; the only console errors anywhere are the five deliberate `500`s in the
catalogue-down scenario, listed with it. The sandbox cannot reach
`fonts.googleapis.com` and those requests are reported separately — the webfont
fallback is what the screenshots show.

The catalogue API is **intercepted** with a backend-shaped fixture — no backend
runs in this sandbox — so every reading below is *the port against a faithful
catalogue*, not against a live server. That distinction is the whole of the
limitation; nothing else about these runs was simulated.

| Reading | Result |
|---|---|
| switch off, same URL | the application's own page, zero `.aan-root`, zero `.pdp` |
| switch on | the design's page, one `.aan-root`, production shell suppressed |
| price | ₹18,900 — ₹22,500 — 16 % off |
| availability | `In stock · Ready to dispatch` |
| gallery | 3 plates, 0 broken, first plate 710×888 |
| accordions, opened | Details (190 chars incl. 4 specifications), Fabric & craft, Care (3 lines), Delivery & returns (delivery + returns) |
| stepper | 5 clicks to the ceiling; stops at 6 = the record's stock; disabled there |
| add to bag | bag 0 → 1, toast "Katan Silk Saree in Ivory added to bag", no page errors |
| unavailable | "Currently unavailable" copy, button disabled, no Details section |
| low stock | "Only a few left" |
| unknown id | the design's 404, no product page |
| catalogue down | the error state with **Try again** and **Return to shop**; after healing the feed and clicking, the piece renders |
| half-loaded catalogue | shown as unreachable, never as a false 404 |
| mobile 390×844 | single column, no horizontal overflow, ADD TO BAG visible, all four accordions readable, footer + related rail intact |
| the port's homepage | still the design's, 11 sections, footer present |

Guest bagging: an unauthenticated visitor's bag is kept by the application itself
(the same on its own product page), so the probe records "no cart request from a
guest bag" as the expected shape rather than a missing call.

## 7 · Gates (all run after the last change)

| Gate | Result |
|---|---|
| aarna suites | **68 / 68** (was 51; +17 new) |
| `src/**/__tests__` | **212 / 212** |
| `npm test` | **434 tests — 412 pass, 21 fail, 1 skipped** — the 21 are the pre-existing guard failures the PR baseline already carries (RBAC/login-routing/media guards, none of them touched by this phase) |
| `npm run build` | ✓ **3,687.50 kB** (gzip 1,377.73) — +0.09 kB on this session's pre-Phase-6 build |
| `audit:frontend-catalog` | PASS |
| `aarna-port --check` | exit 0 — *the port matches the design (52 copied files, 88,885 bytes of CSS)* |
| `git diff --check` | clean |
| browser probe | 59 readings, 0 false |

## 8 · Files changed, exactly

| File | Change |
|---|---|
| `frontend/scripts/aarna-port.js` | closure gains `pages/Product.jsx` (pin 15) and `pages/NotFound.jsx` (pin 0); new `PDP_EDITS` + `PDP_STATES` and the `product-page` rewrite; the media-fallback import is now depth-aware and owns the product page's plate |
| `frontend/src/components/aarna/pages/Product.jsx` | **new** — the design's page, generated by the tool |
| `frontend/src/components/aarna/pages/NotFound.jsx` | **new** — the design's 404, byte-identical |
| `frontend/src/components/aarna/AarnaStorefront.jsx` | mounts the design's route table behind the switch |
| `frontend/src/components/aarna/mock/data/products.js` | availability + copy + ceiling + long-form fields on the design shape; `useCatalogueProduct(slug)`; `retryCatalogue()` |
| `frontend/src/config/storefrontHome.js` | `AARNA_PRODUCT_PATH`, `useAarnaProduct`, `useAarnaStorefront` |
| `frontend/src/layouts/CustomerLayout.jsx` | the aarna branch covers both port paths; `aarnaHome`/`aarnaProduct` → `aarna` |
| `frontend/src/components/aarna/__tests__/aarnaProductPage.test.js` | **new** — 17 tests |
| `frontend/src/components/aarna/__tests__/{aarnaPortParity,aarnaIntegration,aarnaLiveCatalogue}.test.js` | re-pinned as described in §4 |
| `.p6/tools/{p6.mjs,p6-catalogue.mjs}` | the browser probe and its fixture |
| `.p6/evidence/*` | 11 screenshots + `phase6-probe-results.json` |

**Not changed:** `home-page/**` (except read), `pages/ProductDetail.jsx`,
`components/product/*`, any backend file, any migration, any dependency, any
environment variable, and the production default.

### One thing found while checking this, unrelated to Phase 6

`frontend/.gitignore` ignores `tests/` (line 23) and `backend/.gitignore` ignores
`tests/` (line 55), so **newly created** files under those two directories are not
carried by the workspace snapshot. Two deliverables of earlier phases are
therefore missing from the current working tree:

| Missing | What it was | Status of the fixes it covered |
|---|---|---|
| `frontend/tests/phase4ShoppingJourney.test.js` | the 9 Phase-4 regression tests | all four Phase-4 fixes are present and intact (`utils/shopping.js::couponCoversProduct`, `services/offers/offerRepository.js::appliesTo`, the `promo-feedback` / `add-to-bag-feedback` / availability rewrites in `scripts/aarna-port.js`, the `priced` flag); only their *tests* are gone |
| `backend/tests/integration/test_phase5_checkout_contract_flow.py` | the 11 isolated integration tests | the two Phase-5 production fixes are present and intact (`schemas/payments/payment.py` `populate_by_name`, `order_service._find_order_by_number` load options); only the *suite* is gone |

Phase 6's own tests are unaffected — they live under
`src/components/aarna/__tests__/`, which is not ignored. The ignore policy was
deliberately **not** modified (the directive forbids it); both suites should be
re-created in a non-ignored location in a later phase, and Phase 4/5's evidence in
`.p4/` and `.p5/` (present) still documents what they proved.

> **Update (Phase 6 Review, test recovery).** Both suites have since been recovered and re-homed in
> non-ignored locations — `frontend/src/utils/__tests__/phase4ShoppingJourney.test.js` (9 tests, green) and
> `backend/tests_recovery/test_phase5_checkout_contract_flow.py` (11 tests, green; 8/9 and 2/9 fail again
> with the respective fixes reverted). Neither `.gitignore` was touched. See
> `docs/PHASE-6-REVIEW-TEST-RECOVERY.md`.

## 9 · What this does not do

* the design's other seven pages (Shop, Account, Checkout, Wishlist, TrackOrder,
  Info, and the standalone Shop-side 404 use) are still un-ported — later phases,
  one at a time;
* the staff portals remain untouched and still need their own design input;
* no backend is started in this sandbox, so the catalogue in the browser runs was
  intercepted (§6) — the same limitation Phase 5 recorded, and the reason the
  browser readings are labelled as *against a faithful fixture*;
* the ported product page renders the catalogue's availability, not the live
  inventory dashboard (§2, decision 3): the wider claim would need a second data
  source this page does not read.

## 10 · Reproducing

```bash
# unit/SSR
cd frontend
node --import ./scripts/node-loader/register-jsx.mjs --test "src/components/aarna/__tests__/*.test.js"

# the port is exactly what the tool writes
node scripts/aarna-port.js --check

# the browser probe (Chromium lives outside the repo)
cd /tmp/browser && P6_BASE=http://localhost:5174 node p6.mjs   # screenshots → .p6/evidence
```

The dev server for the probe: `cd frontend && npx vite --host 0.0.0.0 --port 5174 --strictPort`,
then open `/product/PF-P6-SAR-SIL-001?home=aarna` (fixture ids) or any real piece
with the switch on.
