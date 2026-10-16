/**
 * The customer account now belongs entirely to Aarna: its native account pages
 * are mounted by AarnaStorefront, while the former production customer pages
 * are no longer part of the application route tree.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFileSync(new URL(relative, `file://${ROOT}`), "utf8");

const STOREFRONT = "src/components/aarna/AarnaStorefront.jsx";
const NATIVE = {
  "account/settings": ["./pages/account/Settings.jsx", "AccountSettings"],
  "account/security": ["./pages/account/Security.jsx", "AccountSecurity"],
  "account/preferences": ["./pages/account/Preferences.jsx", "AccountPreferences"],
  "account/instagram-rewards": ["./pages/account/InstagramRewards.jsx", "InstagramRewards"],
};
const LEGACY = ["AccountSettings.jsx", "AccountSecurity.jsx", "AccountPreferences.jsx", "InstagramRewards.jsx"];

test("each migrated account path is mounted on its native Aarna page", () => {
  const source = read(STOREFRONT);
  for (const [route, [file, component]] of Object.entries(NATIVE)) {
    assert.ok(source.includes(`from "${file}"`), `${file} is imported`);
    assert.match(source, new RegExp(`<Route path="${route}" element=\\{<${component} \/>\\} \/>`), `${route} is routed`);
  }
});

test("the outer route tree does not import test-retained legacy pages", () => {
  const source = read(STOREFRONT);
  const app = read("src/App.jsx");
  for (const production of LEGACY) {
    assert.equal(source.includes(`../../pages/account/${production}`), false, `${production} is not imported by Aarna`);
    assert.equal(app.includes(`pages/account/${production}`), false, `${production} is not imported by App`);
    /* These four modules remain solely because the Aarna account shell test
       SSR-imports them for comparison; none is reachable through a customer route. */
    assert.ok(existsSync(new URL(`src/pages/account/${production}`, `file://${ROOT}`)), `${production} remains a test-only comparison fixture`);
  }
});

test("the four screens remain inside the same ProtectedRoute as other account pages", () => {
  const source = read(STOREFRONT);
  const guardOpen = source.indexOf("<Route element={<ProtectedRoute />}>");
  const guardedEnd = source.indexOf('<Route path="account/orders/:orderId"');
  assert.ok(guardOpen > 0 && guardedEnd > guardOpen, "the protected block is present");
  for (const route of Object.keys(NATIVE)) {
    const at = source.indexOf(`<Route path="${route}"`);
    assert.ok(at > guardOpen && at < guardedEnd, `${route} is guarded`);
  }
});

test("the single-order routes stay open to a guest", () => {
  const source = read(STOREFRONT);
  assert.match(source, /<Route path="account\/orders\/:orderId" element=\{<AccountOrderDetailPage \/>\} \/>/);
});

test("the outer application delegates customer paths to the Aarna customer layout", () => {
  const app = read("src/App.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\/account"/);
  assert.doesNotMatch(app, /<Route path="\/shop"/);
});
