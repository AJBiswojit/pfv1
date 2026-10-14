# Phase 4 — Customer Shopping Journey & Commerce Integration Audit

**Status: complete.** Eight defects were reproduced in a real browser, the four that were mine to fix are
fixed at their source, four are recorded as non-defects/environmental, and every regression gate passes.
The phase changed **6 files** (5 source + the port tool) and added **1 test suite of 9 tests**.
**Nothing is committed** — the work sits in the working tree on top of PR #37 and the Phase 3 fixes.

| | |
|---|---|
| Surface audited | the ported Aarna storefront (`?home=aarna`) **and** the production app it sits inside: `/product/:idOrSlug`, `/cart`, `/checkout`, `/order-success`, `/account/wishlist`, `/signin`, search, back/forward |
| Changed | `src/utils/shopping.js` · `src/services/offers/offerRepository.js` · `src/context/CartContext.jsx` · `src/components/aarna/state/ShopContext.jsx` · `scripts/aarna-port.js` (+2 rewrites, pins) |
| Added | `tests/phase4ShoppingJourney.test.js` (9 tests) |
| Evidence | `.p4/evidence/` (26 screenshots, 4 BEFORE/AFTER pairs) · `.p4/tools/` (`p4.mjs`, `p4-catalogue.mjs`) |
| Gates | `194/194` src suites · `443` app tests, failure set **identical to PR #37** · `npm run build` ✅ · `audit:frontend-catalog` PASS · `aarna-port --check` exit 0 · `git diff --check` clean |

---

## 1 · Defects reproduced, root cause, fix

### Defect 1 — a guest who applied a coupon took the whole application down
**Reproduced:** as a guest, add a piece and apply a valid code — in the ported bag drawer *and* on the
production `/cart` page. Result: `TypeError: coupon.appliesTo is not a function`, thrown during render,
`<div id="root">` left **empty** (a blank page), and the message the drawer was supposed to show never
appeared.
**Root cause:** `calculateEligibleSubtotal` (`src/utils/shopping.js:172`) called `coupon.appliesTo(...)`,
but **no coupon object in the application ever carried that method** — `grep appliesTo` matched exactly
that one line. A guest's coupon is the code alone (`CartContext.applyCoupon` stores `couponCode`, and the
shape the ported drawer describes is `{ code }`), so every guest coupon render threw.
**Fix:** the rule now lives in one place, `couponCoversProduct(coupon, product)` — a coupon that carries a
predicate decides for itself; a coupon that carries none narrows nothing (the caller must not invent scope
and must not narrow a coupon the server accepted). Pricing itself is unchanged and never invented: the
amount still comes from the coupon's own type/value and, at order time, from the server.

### Defect 2 — no coupon in the application could ever carry an eligibility rule
**Reproduced:** the same crash, plus the fact that a *scoped* offer could not be scoped in the cart at all.
**Root cause:** `toCheckoutCoupon` (`src/services/offers/offerRepository.js`) — the one place an offer
becomes a coupon for the order summary, reached from `data/shopping/coupons.js` and the ported drawer's
`findPromotionByCode` — spread the offer and added `summary`/`validFrom`/`validTo`, but no predicate. The
register's canonical rule (`isProductEligible`: exclusions first, then ALL_PRODUCTS / SPECIFIC_PRODUCTS /
CATEGORY / COLLECTION) lived only in the repository. **This is why defect 1 could not be fixed by "make the
guest coupon carry the method" alone** — no surface had one.
**Fix:** `toCheckoutCoupon` attaches `appliesTo: (product) => isProductEligible(offer, product)`. The
backend stays the pricing authority (coupons are only priced server-side for authenticated carts; the guest
figures are the existing presentation calculation, re-validated at order placement).

### Defect 3 — a piece the catalogue cannot sell was "added to bag"
**Reproduced:** with a piece the backend marks `availability: "unavailable"`, `stock: 0` (a shape the
backend's own DTO emits), clicking the card's `+`, or **Add to Bag** in the quick view, produced the toast
*"Girls Silk Anarkali added to bag · VIEW BAG"* while the bag badge stayed at **0**. No error, no refusal.
**Root cause:** `CartContext.addToCart`'s guest path clamps the requested quantity to `getMaxQuantity`
(zero for an unavailable piece) → the bag is left untouched → and the function then returns
`{ ok: true, message: "Added to your collection." }` regardless. `ShopContext.addToCart` toasts only on
`ok === false`, so the optimistic toast stood as the confirmation.
**Fix:** the guest path refuses a piece whose catalogue ceiling is below one, with the same message the
product page already uses — `{ ok: false, message: "This piece is currently unavailable." }` — and nothing
is written to the bag. The **product page for that piece is already honest** (button disabled, "Currently
unavailable"): only the card and quick-view paths were wrong.

### Defect 4 — the confirmation was unconditional, so it confirmed things that never happened
**Reproduced:** as in defect 3 — the ported `useAddToBag` toast fired before the cart had answered.
**Root cause:** the design's shop answered from local state and always succeeded, so the ported hook could
call `addToCart(...)` and toast unconditionally.
**Fix:** a new ordered port rewrite, `add-to-bag-feedback`, ties the confirmation to the outcome (the
cart's own message is the only thing a refused add shows).

### Defect 5 — the drawer read a Promise as a result: a valid code showed an empty error line
**Reproduced:** applying `UTSAV10` in the ported drawer. The state was invalid **before** the crash fix and
**still invalid after it**: `msg: ""` with class `promo-msg is-err` (an empty line in the error colour),
and the line *"No eligible items in the bag yet"* printed for a guest whose code had just been accepted.
**Root cause (two, in one screenshot):** (a) the design's `onApply` called `applyPromo(code)` without
awaiting — the port's `applyPromo` is a real async call, so `res.ok` was `undefined` for every input;
(b) the drawer's demo note assumed the *client* had priced the coupon, but a guest's coupon discount is
computed by the server at order time — claiming "no eligible items" states a discount verdict the client
never made.
**Fix:** the `promo-feedback` rewrite awaits the register's answer, and the note now depends on
`totals.priced` (a new flag on `CartContext`, threaded through the port's boundary): server-priced cart →
the original line; guest cart → *"The offer is applied — its amount is confirmed when your order is
placed."* Measured after the fix: `msg: "UTSAV10 applied — 10% OFF."`, class `is-ok`, applied chip
`UTSAV10 · 10% OFF` with a working Remove.

### Not defects (recorded so they are not re-opened)
* **The cart page's "Shipping ₹99 / Complimentary" is a client-side rule, not an invented price.**
  `utils/shopping.js` computes guest shipping from the authored defaults / Admin Settings
  (`COMMERCE_DEFAULTS`, `readShippingRules`) and derives shipping from the **coupon-discounted** payable
  subtotal; the order itself is priced server-side. No code path grants a discount.
* **All 40 homepage destinations resolve.** Sampled across every destination family: `/bridal`, `/`,
  `/account` → sign-in gate, `/wishlist` → `/account/wishlist`, `/women/sarees/cotton`, `/about`, `/women`,
  `/men`, `/kids`, `/women/essentials/kurtis-suits`, `/collections/silk-classics`,
  `/collections/festive-sarees`, `/product/katan-silk-saree-ivory`, `/product/banarasi-buti-saree` — **no
  not-found page, no dead link**.
* **The mobile overhang is the design's own edge-peek.** At 390/414 the page's `documentElement.scrollWidth`
  equals the viewport and `window.scrollX` stays 0; the elements whose `getBoundingClientRect().right`
  exceeds the viewport (`.collage__tile` → 404, `.saree__strip` → 444) are clipped by an ancestor, not
  scrollers of their own.
* **`visualVariants` did not reproduce as a defect.** The record shape the checkout reads exposes
  `colors`/`sizes` + `unavailableColors`/`unavailableSizes` (confirmed against
  `backend/app/services/catalog/product_service.py::_to_storefront`), and there is no `visualVariants`
  field in the backend. Re-measured with image-less and 404-plate records present: 0 broken images, 0 page
  errors, 0 empty image slots on the PDP. If a future backend adds `visualVariants`, this needs a fresh
  audit — see §6.

---

## 2 · Files changed, and why

| File | Why |
|---|---|
| `src/utils/shopping.js` | new `couponCoversProduct` guard (defects 1 + 2); `calculateEligibleSubtotal` uses it; exported in the default map |
| `src/services/offers/offerRepository.js` | `toCheckoutCoupon` attaches the register's own `isProductEligible` as `appliesTo` |
| `src/context/CartContext.jsx` | guest add refuses a piece with a zero catalogue ceiling (defect 3); `priced` flag exposed (defect 5) |
| `src/components/aarna/state/ShopContext.jsx` | boundary passes `priced` into the design's `totals` shape |
| `scripts/aarna-port.js` | +2 ordered rewrites (`promo-feedback`, `add-to-bag-feedback`) + re-measured pins for `CartDrawer.jsx` (7→9) and `useAddToBag.js` (0→2) |
| `tests/phase4ShoppingJourney.test.js` | 9 regression tests (below) |

Hand-written modules were edited directly; every CLOSURE (copied) file changed **only** through a named
rewrite and was regenerated with `--copy`, so `--check` stays green.

---

## 3 · The flows actually exercised (headless Chromium 131, real app, real routes)

The backend **cannot run in this sandbox** (no DB; `/api/v1/*` unreachable). Catalogue reads were therefore
answered by request interception with backend-shaped records (`.p4/tools/p4-catalogue.mjs`: 16 records,
canonical taxonomy slugs, real staged plates, snake_case offers), while **every cart, wishlist, coupon,
search, navigation and routing path ran as the application's own production code**. Guest cart/wishlist
persistence, the ported drawer, the context wiring and all routing were exercised for real — no
interception touches `localStorage` or React state.

| Flow | Outcome |
|---|---|
| Card → PDP | `/product/katan-silk-saree-ivory`, heading "Katan Silk Saree in Ivory", price ₹18,900, colour + blouse-size groups, no not-found |
| Card quick-add (sized) | picker `4-5Y` → badge 1 → drawer line "Girls Festive Dress · 4-5Y · 1 · ₹2,400" |
| Quick-add the same product, another variant | **two line identities** (`4-5Y` and `2-3Y`), badge 2 — the backend's `(productId, colour, size)` triple |
| Quick view | opens on the card's piece; **"Please select a size."** inline when Add is pressed with no size; on a sold-out piece it now says "This piece is currently unavailable." and the bag stays 0 |
| Product page of a sold-out piece | "Currently unavailable", Add to Cart **disabled** |
| Option-less piece (`colors: []`, `sizes: []` — contract-valid) | **no picker**, one click adds, badge 1, cart line present |
| Cart page, 3 lines | subtotal ₹23,500 → increment → ₹29,100 → stock ceiling reached (`increaseDisabled: true`) after 5 presses → remove → line gone, subtotal ₹17,900 |
| Empty cart | "Your collection is waiting." empty state, no phantom lines |
| Ported drawer → Proceed to Checkout | `/signin?returnTo=%2Fcheckout` (ProtectedRoute; the customer's bag is untouched) |
| Guest `/checkout`, `/order-success`, `/account/orders` | all three → `/signin?returnTo=…`, real sign-in page, no blank screen |
| Coupon (guest) | `UTSAV10` → `POST /api/v1/offers/validate` → "UTSAV10 applied — 10% OFF.", applied chip, honest amount line, Remove works |
| Search | "silk" → 5 hits with valid hrefs; first hit lands on a real PDP |
| Wishlist (guest) | card heart `aria-pressed false → true`, header badge `Wishlist, 1 items`, `/account/wishlist` renders "Your wishlist." with the saved piece |
| Keyboard / dialogs | drawer opens on Enter, focus lands inside (`Close bag`), stays inside after 12 Tabs, `Escape` closes, focus returns to the bag button, `body.overflow` restored |
| Back / forward | PDP → Back → `/?home=aarna` with the ported homepage and its cards intact |
| Backend down (all endpoints 500) | PDP: "We couldn't load this piece." + Try again + Return to Shop — no blank page |
| Mobile 390 / 414 | home, PDP and cart: no horizontal document overflow, PDP and cart have no overhanging elements |
| Whole run | **0 page errors across all 16 scenarios** |

Screenshots: `.p4/evidence/` — `p4-BEFORE-*` / `p4-AFTER-*` pairs for `10-aarna-coupon-crash`,
`11-cart-coupon-crash`, `12-soldout-card-toast`, `13-soldout-quickview-toast`, plus `01-pdp`, `02/03-drawer`,
`04-soldout-quickview`, `06-checkout-gate`, `07-promo`, `08-pdp-mobile` (390 + 414), `14-soldout-pdp`,
`15-cart-detail`, `16-search-hit`, `17-wishlist`, `18-pdp-api-down`.

---

## 4 · Regression tests added

`frontend/tests/phase4ShoppingJourney.test.js` — **9 tests**, each pinning a defect at its seam, and each
demonstrated failing against the pre-fix code:

| Test | Fails on |
|---|---|
| a coupon that carries only a code prices the cart instead of throwing | pre-fix code: `doesNotThrow` fails with `coupon.appliesTo is not a function` |
| eligibility is asked of the coupon when it has a rule, and never crashes when it does not | pre-fix: no guard at all |
| `toCheckoutCoupon` carries the backend offer model's product rule | pre-fix: no `appliesTo` on the coupon |
| exclusions and unscoped offers keep the register's meaning | pre-fix: no predicate |
| a scoped coupon discounts only the lines it covers | pre-fix: collection scope cannot be applied |
| a piece the catalogue cannot sell is refused … | pre-fix: `addToCart` returned `{ ok: true }` for a zero-ceiling piece |
| a sellable piece is still added, with and without a variant group | guard against over-refusing (passes before and after — it is the counterweight) |
| the card's add confirmation only fires when the add happened | pre-fix `useAddToBag.js` toast is unconditional |
| the bag drawer awaits the register's answer and states the amount honestly | pre-fix: `applyPromo(code)` unawaited, static note |

The last test also pins the wiring across three files (`ShopContext.priced` ← `CartContext.priced` ← the
drawer's note), so the honest-amount behaviour cannot be "fixed" in copy alone.

**Re-measurement, not assertion, was used for every visual claim** (the tenant of this phase): the
BEFORE/AFTER screenshots come from running the same probe against the pre-fix and post-fix code.

---

## 5 · Gates

| Gate | Result |
|---|---|
| `node --import ./scripts/node-loader/register.mjs --test "src/**/__tests__/*.test.js"` | **194 / 194 pass** |
| `npm test` (`tests/*.test.js`) | **443 tests · 421 pass · 21 fail · 1 skipped** — failure set **identical to PR #37** (21 pre-existing/env-only) |
| `tests/phase4ShoppingJourney.test.js` | **9 / 9 pass** (6 of them fail on the pre-fix code) |
| `npm run build` | ✅ `dist/index.html 3,680.37 kB │ gzip 1,375.70 kB` |
| `npm run audit:frontend-catalog` | **PASS** (taxonomy, validation, canonical media, listing routes, scopes, no embedded inventory) |
| `node scripts/aarna-port.js --check` | exit 0 · "the port matches the design (50 copied files, 88885 bytes of CSS)" |
| `git diff --check` | clean |
| Browser | 16 scenarios, 30 viewports/states, **0 page errors** (see §3) |

---

## 6 · Backend dependencies, untested paths, remaining limitations

* **Order placement, payment and the order confirmation page were NOT exercised end-to-end.** They require
  the FastAPI backend (`POST /cart/items`, `POST /payments/sessions`, `POST /orders`, `GET /orders/{id}`),
  which cannot run here (no database). The frontend's own contracts are covered by the existing suites
  (`tests/phase2Checkout.test.js`: identity-only order body, payment-session normalisation, claimable guest
  orders) and the failure paths were driven in the browser (gated routes, PDP error state). No order was
  fabricated and no payment success was simulated — **request interception never answered an order or
  payment endpoint in this phase**.
* **Authenticated cart/wishlist/coupon paths are simulated at the transport layer.** Signed-in behaviour
  (server cart authoritative, coupon server-priced, wishlist server-synced) is exercised by the existing
  suites, not by this phase's browser run; the `priced` flag's authenticated branch (`priced: true`) is
  asserted structurally, not measured, in a browser.
* **The sandbox cannot reach its own preview proxy**, so all browser evidence was driven against
  `localhost:5174`. Google Fonts are blocked, so geometry is fallback-font geometry (no parity claim is
  made from it).
* **Stock ceilings are single-number.** The DTO exposes one `stock`; the cart's ceiling uses it. If the
  backend ever returns per-variant stock (`visualVariants`), the ceiling and the PDP variant map both need a
  fresh audit — reported rather than guessed.
* **Guest shipping is a client-side rule** (`COMMERCE_DEFAULTS` / Admin Settings), unchanged by this phase
  and re-validated server-side at order placement.
* **Not committed.** No commit, push or PR was made. Phase 3's `.p3/` and Phase 4's `.p4/` evidence folders
  are untracked, next to the other phase artifacts.
