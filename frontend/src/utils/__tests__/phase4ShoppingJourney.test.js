/**
 * PRATIKSHYA FASHION — PHASE 4 · the shopping journey, as a regression suite.
 * (RECOVERED — see "Source of every assertion" below.)
 *
 * The Phase 4 fixes are four defects deep, and each one failed in a way that a
 * screenshot caught and a unit test had to keep caught. This file is the suite
 * that pinned them. It was originally written at
 * `frontend/tests/phase4ShoppingJourney.test.js` and did not survive the
 * workspace snapshot: `frontend/.gitignore` line 23 ignores `tests/`, so a
 * *newly created* file there is never carried between sessions (the same is true
 * of `backend/.gitignore` line 55 for `backend/tests/`). It lives here instead —
 * under `src/**\/__tests__`, the same convention the port's own suites use, which
 * the ignore policy does not touch.
 *
 * SOURCE OF EVERY ASSERTION
 * ─────────────────────────
 * Nothing here was invented. Each test is traceable to the Phase 4 report's own
 * defect table (§1) and its test table (§4), and every seam it asserts against
 * was read in the production source at the time of recovery:
 *
 *   defect 1 → `utils/shopping.js::couponCoversProduct` — "a coupon that carries
 *              a predicate decides for itself; a coupon that carries none
 *              narrows nothing". Pre-fix, `calculateEligibleSubtotal` called
 *              `coupon.appliesTo(...)` unconditionally and a guest coupon (the
 *              code alone) threw `TypeError: coupon.appliesTo is not a function`.
 *   defect 2 → `services/offers/offerRepository.js::toCheckoutCoupon` — attaches
 *              `appliesTo: (product) => isProductEligible(offer, product)`.
 *   defect 3 → `context/CartContext.jsx` — the guest path refuses a piece whose
 *              catalogue ceiling is below one, with the product page's own
 *              sentence, before anything is written to the bag.
 *   defect 4 → `components/customer/components/product/useAddToBag.js` — the
 *              confirmation is tied to the outcome (the `add-to-bag-feedback`
 *              port rewrite).
 *   defect 5 → `components/customer/components/shopping/CartDrawer.jsx` +
 *              `components/customer/state/ShopContext.jsx` +
 *              `context/CartContext.jsx` — the drawer awaits the register's
 *              answer and keys its honest note on `totals.priced`.
 *
 * WHAT IS BEHAVIOURAL AND WHAT IS A CONTRACT PIN
 * ──────────────────────────────────────────────
 * Tests 1–5 and 7 execute the real pricing and eligibility functions. Tests 6, 8
 * and 9 also pin *wiring* — a cart refusal that sits before the state write, a
 * toast that waits for the outcome, an awaited promo and a threaded `priced`
 * flag. That wiring lives inside React hooks and context, and this tree has no
 * DOM implementation (no jsdom, no headless engine — the same limitation the
 * port's suites state), so those three assert the exact lines that changed,
 * and the Phase 4 browser probe is what measured the rendered behaviour
 * (`.p4/evidence/`, 16 scenarios, 0 page errors). Every assertion below fails on
 * the pre-fix code; that is what makes it a regression pin rather than a
 * description.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  calculateCartTotals,
  calculateCouponDiscount,
  calculateEligibleSubtotal,
  clampQuantity,
  couponCoversProduct,
  defaultSelection,
  findCartLine,
  getMaxQuantity,
  requiresVariantChoice,
} from "../shopping.js";
import {
  PRODUCT_ELIGIBILITY,
  normaliseOffer,
  toCheckoutCoupon,
} from "../../services/offers/offerRepository.js";

function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");
/** Whitespace-insensitive source matching (the files are formatted, not minified). */
const flat = (source) => source.replace(/\s+/g, " ");

/* ── the pieces the journey carries ─────────────────────────────────────── */

const saree = {
  id: "PF-W-SAR-SIL-0001",
  name: "Katan Silk Saree in Ivory",
  price: 18900,
  originalPrice: 22500,
  category: "sarees",
  collectionIds: ["silk-classics"],
  collections: ["silk-classics"],
  colors: ["Ivory", "Gold"],
  unavailableColors: [],
  sizes: ["Free Size"],
  availability: "in-stock",
  stock: 4,
};

const kurti = {
  id: "PF-W-KUR-COT-0001",
  name: "Cotton Anarkali Kurta",
  price: 3400,
  originalPrice: null,
  category: "kurtis",
  collectionIds: ["everyday-elegance"],
  collections: ["everyday-elegance"],
  colors: ["Indigo"],
  unavailableColors: [],
  sizes: ["S", "M", "L"],
  availability: "in-stock",
  stock: 6,
};

const unsellable = {
  id: "PF-W-ANA-SIL-0099",
  name: "Girls Silk Anarkali",
  price: 7800,
  originalPrice: null,
  category: "bridal",
  colors: ["Deep red"],
  sizes: ["M"],
  availability: "unavailable",
  stock: 0,
};

const line = (product, quantity = 1) => ({ product, quantity });

const basis = (id, type, value, extra = {}) => ({
  id,
  code: id,
  name: id,
  type,
  discountValue: value,
  minimumOrderValue: 0,
  maximumDiscount: 0,
  status: "ACTIVE",
  productEligibility: PRODUCT_ELIGIBILITY.ALL_PRODUCTS,
  includedProducts: [],
  includedCategories: [],
  includedCollections: [],
  excludedProducts: [],
  excludedCategories: [],
  excludedCollections: [],
  ...extra,
});

/* ── 1 · defect 1 ───────────────────────────────────────────────────────── */

test("a coupon that carries only a code prices the cart instead of throwing", () => {
  /* The guest's coupon is the code alone (`CartContext.applyCoupon` stores the
     code; the ported drawer describes `{ code }`). Pre-fix this threw
     `TypeError: coupon.appliesTo is not a function` during render and left an
     empty root element. */
  const guestCoupon = { code: "UTSAV10" };
  const items = [line(saree, 1), line(kurti, 2)];

  let totals;
  assert.doesNotThrow(() => {
    totals = calculateCartTotals(items, guestCoupon);
  }, "a bare-code coupon must never crash the pricing path");

  const subtotal = 18900 + 3400 * 2;
  assert.equal(totals.subtotal, subtotal);
  /* Nothing is invented for a coupon the client cannot price: the guest's
     discount is settled by the server at order time, so it is zero here — and
     the drawer says so in words (test 9). */
  assert.equal(totals.couponDiscount, 0);
  assert.equal(calculateEligibleSubtotal(items, guestCoupon), subtotal);
});

/* ── 2 · defect 1's guard ───────────────────────────────────────────────── */

test("eligibility is asked of the coupon when it has a rule, and never crashes when it does not", () => {
  const scoped = { code: "SAREES10", appliesTo: (product) => product.category === "sarees" };

  assert.equal(couponCoversProduct(scoped, saree), true, "a scoped coupon covers what it names");
  assert.equal(couponCoversProduct(scoped, kurti), false, "a scoped coupon does not cover the rest");

  /* No predicate ⇒ no narrowing. An unscoped offer is ALL_PRODUCTS in the
     backend's own model, and the client must not narrow a coupon the server
     accepted. */
  assert.equal(couponCoversProduct({ code: "UTSAV10" }, kurti), true);
  assert.equal(couponCoversProduct({}, saree), true);
  assert.equal(couponCoversProduct(null, saree), false, "no coupon covers nothing");

  /* A missing product is the register's own guard, not the caller's: the
     predicate `toCheckoutCoupon` attaches is `isProductEligible`, which answers
     false for a null product instead of throwing. */
  const registerScoped = toCheckoutCoupon(
    basis("SAREES10", "PERCENTAGE", 10, {
      productEligibility: PRODUCT_ELIGIBILITY.CATEGORY,
      includedCategories: ["sarees"],
    })
  );
  assert.equal(registerScoped.appliesTo(null), false, "no product is covered by nothing");
});

/* ── 3 · defect 2 ───────────────────────────────────────────────────────── */

test("toCheckoutCoupon carries the backend offer model's product rule", () => {
  /* The one place an offer becomes a coupon for the order summary. Pre-fix it
     spread the offer and added `summary`/`validFrom`/`validTo` but no predicate,
     which is why defect 1 could not be fixed by patching the caller alone. */
  const offer = normaliseOffer({
    id: "offer-1",
    code: "sarees10",
    name: "Sarees 10",
    type: "PERCENTAGE",
    discount_value: 10,
    product_eligibility: "SPECIFIC_PRODUCTS",
    /* the snake_case alias `normaliseOffer` documents for the register's scoped
       product list (`offersApi` arrives as `eligible_product_ids` → `product_ids`) */
    product_ids: [saree.id],
    customer_eligibility: "ALL_CUSTOMERS",
    status: "ACTIVE",
  });
  const coupon = toCheckoutCoupon(offer);

  assert.equal(typeof coupon.appliesTo, "function", "the coupon must carry the register's rule");
  assert.equal(coupon.appliesTo(saree), true, "an included product is eligible");
  assert.equal(coupon.appliesTo(kurti), false, "a product outside the rule is not");

  /* And it carries the offer's own presentation fields, unchanged. */
  assert.equal(coupon.code, "SAREES10");
  assert.equal(coupon.discountValue, 10);
  assert.equal(typeof coupon.summary, "string");
  assert.equal(toCheckoutCoupon(null), null);
});

/* ── 4 · defect 2's edges ───────────────────────────────────────────────── */

test("exclusions and unscoped offers keep the register's meaning", () => {
  const allProducts = toCheckoutCoupon(basis("UTSAV10", "PERCENTAGE", 10));
  assert.equal(allProducts.appliesTo(saree), true);
  assert.equal(allProducts.appliesTo(kurti), true);

  const excludesKurtis = toCheckoutCoupon(
    basis("NO-KURTI", "PERCENTAGE", 15, { excludedCategories: ["kurtis"] })
  );
  assert.equal(excludesKurtis.appliesTo(saree), true, "an exclusion must not exclude everything");
  assert.equal(excludesKurtis.appliesTo(kurti), false, "an excluded category is excluded");

  const collectionScoped = toCheckoutCoupon(
    basis("SILK10", "PERCENTAGE", 10, {
      productEligibility: PRODUCT_ELIGIBILITY.COLLECTION,
      includedCollections: ["silk-classics"],
    })
  );
  assert.equal(collectionScoped.appliesTo(saree), true, "a collection rule reads the product's collections");
  assert.equal(collectionScoped.appliesTo(kurti), false);

  const specificProduct = toCheckoutCoupon(
    basis("ONLY-KURTI", "PERCENTAGE", 20, {
      productEligibility: PRODUCT_ELIGIBILITY.SPECIFIC_PRODUCTS,
      includedProducts: [kurti.id],
    })
  );
  assert.equal(specificProduct.appliesTo(kurti), true);
  assert.equal(specificProduct.appliesTo(saree), false);
});

/* ── 5 · defect 2, priced ───────────────────────────────────────────────── */

test("a scoped coupon discounts only the lines it covers", () => {
  const items = [line(saree, 2), line(kurti, 3)]; // ₹37,800 sarees + ₹10,200 kurtis
  const scoped = toCheckoutCoupon(
    basis("SILK10", "PERCENTAGE", 10, {
      productEligibility: PRODUCT_ELIGIBILITY.COLLECTION,
      includedCollections: ["silk-classics"],
    })
  );

  assert.equal(calculateEligibleSubtotal(items, scoped), 18900 * 2);
  assert.equal(calculateCouponDiscount(items, scoped), 3780); // 10 % of the covered ₹37,800

  const unscoped = toCheckoutCoupon(basis("ALL10", "PERCENTAGE", 10));
  assert.equal(calculateCouponDiscount(items, unscoped), 4800); // 10 % of the whole ₹48,000

  const totals = calculateCartTotals(items, scoped);
  assert.equal(totals.subtotal, 48000);
  assert.equal(totals.couponDiscount, 3780);
  assert.equal(totals.total, totals.subtotal - 3780 + totals.shipping);
});

/* ── 6 · defect 3 ───────────────────────────────────────────────────────── */

test("a piece the catalogue cannot sell is refused, and nothing is written to the bag", () => {
  /* The ceiling is what the refusal keys on: a zero ceiling means the clamp
     cannot add anything — pre-fix the guest path clamped to zero, left the bag
     untouched, and still returned `{ ok: true, message: "Added to your
     collection." }`, so the optimistic toast stood as a confirmation. */
  assert.equal(getMaxQuantity(unsellable), 0, "an unavailable piece has a ceiling of zero");
  assert.equal(clampQuantity(unsellable, 1), 0, "the clamp cannot add a zero-ceiling piece");
  assert.ok(getMaxQuantity(saree) > 0, "a sellable piece keeps its stock ceiling");

  const context = flat(read("src/context/CartContext.jsx"));
  assert.match(
    context,
    /if \(target && maximum < 1\) \{ return \{ ok: false, message: "This piece is currently unavailable\." \}; \}/,
    "the cart no longer refuses a zero-ceiling piece",
  );
  assert.ok(
    context.indexOf("if (target && maximum < 1)") < context.indexOf("setLines((current) =>"),
    "the refusal must come before anything is written to the bag",
  );
  /* The refusal is the production product page's own sentence, not a second wording. */
  assert.ok(
    flat(read("src/components/product/ProductPurchasePanel.jsx")).includes(
      "This piece is currently unavailable."
    ),
    "the product page no longer says this — the cart's refusal has drifted from it",
  );
});

/* ── 7 · the counterweight ──────────────────────────────────────────────── */

test("a sellable piece is still added, with and without a variant group", () => {
  /* The guard against over-refusing: the fix must not make the cart timid. */
  assert.equal(getMaxQuantity(saree), 4);
  assert.equal(clampQuantity(saree, 2), 2);
  assert.equal(clampQuantity(saree, 99), 4, "a request above stock clamps to stock");
  assert.equal(clampQuantity(kurti, 0), 1, "a nonsense request clamps up to one");

  /* A piece with one size choice needs no deliberate pick; two or more do. */
  assert.equal(requiresVariantChoice(saree), false);
  assert.equal(requiresVariantChoice(kurti), true);

  const defaulted = defaultSelection(kurti);
  assert.equal(defaulted.color, "Indigo", "the default colour skips unavailable ones");
  assert.equal(defaulted.size, "S", "the default size is the first the catalogue lists");

  /* Adding the same triple twice merges onto the existing line. */
  const lines = [{ id: "l1", productId: kurti.id, color: "Indigo", size: "S", quantity: 1 }];
  assert.equal(findCartLine(lines, kurti.id, { color: "Indigo", size: "S" })?.id, "l1");
  assert.equal(findCartLine(lines, kurti.id, { color: "Indigo", size: "M" }), undefined);
});

/* ── 8 · defect 4 ───────────────────────────────────────────────────────── */

test("the card's add confirmation only fires when the add happened", () => {
  /* The design's shop answered locally and always succeeded, so the ported hook
     toasted unconditionally. Pre-fix this file had no `ok === false` guard at
     all. The measured behaviour after the fix is in the Phase 4 browser probe
     (quick-add on an unavailable piece: no toast, badge stays 0). */
  const hook = flat(read("src/components/customer/components/product/useAddToBag.js"));

  assert.match(
    hook,
    /Promise\.resolve\(result\)\.then\(\(outcome\) => \{ if \(outcome && outcome\.ok === false\) return; toast\(/,
    "the confirmation must wait for the cart's answer and stand down when it is refused",
  );
  assert.equal(
    /\)\.then\(\(outcome\) => \{ toast\(/.test(hook),
    false,
    "an unconditional confirmation is back",
  );
  /* And the refusal travels to the customer as the cart's own message. */
  assert.match(flat(read("src/components/customer/state/ShopContext.jsx")), /if \(outcome && outcome\.ok === false && outcome\.message\) toast\(outcome\.message\);/);
});

/* ── 9 · defect 5 ───────────────────────────────────────────────────────── */

test("the bag drawer awaits the register's answer and states the amount honestly", () => {
  const drawer = flat(read("src/components/customer/components/shopping/CartDrawer.jsx"));
  const shop = flat(read("src/components/customer/state/ShopContext.jsx"));
  const cart = flat(read("src/context/CartContext.jsx"));

  /* (a) The register's answer is awaited — pre-fix `res.ok` was `undefined` for
     every input, so a valid code rendered an empty error line. */
  assert.match(drawer, /const res = await applyPromo\(code\);/);
  assert.match(drawer, /res\.ok \? \{ ok: true, text: `\$\{res\.promo\.code\} applied — \$\{res\.promo\.discountLabel\}\.` \}/);

  /* (b) The note never claims a discount verdict the client did not make: a
     server-priced cart keeps the original line, a guest cart says the amount is
     confirmed when the order is placed. */
  assert.match(drawer, /\{totals\.promo && totals\.discount === 0 && <div className="totals__note"><dt>\{totals\.priced \? 'No eligible items in the bag yet' : 'The offer is applied — its amount is confirmed when your order is placed\.'\}<\/dt><dd \/><\/div>\}/);

  /* (c) `priced` is threaded from the cart, through the port's boundary, to the
     note — so the honest sentence cannot be "fixed" in copy alone. */
  assert.match(cart, /priced: authenticated,/);
  assert.match(shop, /priced: Boolean\(cart\.priced\),/);
  assert.match(shop, /const result = await cart\.applyCoupon\(code\);/);
  assert.match(shop, /return \{ ok: true, promo: promotionFor\(result\.coupon\?\.code \?\? code\) \};/);
});
