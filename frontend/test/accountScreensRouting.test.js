/**
 * The customer account now belongs entirely to the customer storefront: its native account pages
 * are mounted by CustomerStorefront, while the former production customer pages
 * are no longer part of the application route tree.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFileSync(new URL(relative, `file://${ROOT}`), "utf8");

const STOREFRONT = "src/components/customer/CustomerStorefront.jsx";
const CUSTOMER_ACCOUNT = "src/components/customer/pages/account/Overview.jsx";
const DESIGN_REFERENCE_ACCOUNT = "../home-page/src/pages/Account.jsx";
const NATIVE = {
  "account/settings": ["./pages/account/Settings.jsx", "AccountSettings"],
  "account/security": ["./pages/account/Security.jsx", "AccountSecurity"],
  "account/preferences": ["./pages/account/Preferences.jsx", "AccountPreferences"],
  "account/instagram-rewards": ["./pages/account/InstagramRewards.jsx", "InstagramRewards"],
};
const REMOVED_LEGACY = ["AccountSettings.jsx", "AccountSecurity.jsx", "AccountPreferences.jsx", "InstagramRewards.jsx"];

test("each migrated account path is mounted on its native customer page", () => {
  const source = read(STOREFRONT);
  for (const [route, [file, component]] of Object.entries(NATIVE)) {
    assert.ok(source.includes(`from "${file}"`), `${file} is imported`);
    assert.match(source, new RegExp(`<Route path="${route}" element=\\{<${component} \/>\\} \/>`), `${route} is routed`);
  }
});

test("The customer storefront keeps server-backed account ownership while the home-page prototype remains device-local", () => {
  const storefront = read(CUSTOMER_ACCOUNT);
  const designReference = read(DESIGN_REFERENCE_ACCOUNT);
  assert.match(storefront, /useAccount\(\)/, "the active account reads the application's account context");
  assert.match(designReference, /load\(KEY, null\)/, "the untouched home-page prototype remains a local demo");
  assert.equal(read("src/App.jsx").includes("home-page/"), false, "the prototype was imported into the production application");
});

test("legacy account pages are retired and the customer storefront owns their canonical routes", () => {
  const source = read(STOREFRONT);
  const app = read("src/App.jsx");
  for (const page of REMOVED_LEGACY) {
    assert.equal(source.includes(`../../pages/account/${page}`), false, `${page} is not imported by the customer storefront`);
    assert.equal(app.includes(`pages/account/${page}`), false, `${page} is not imported by App`);
    assert.equal(existsSync(new URL(`src/pages/account/${page}`, `file://${ROOT}`)), false, `${page} was retired`);
  }
  assert.ok(existsSync(new URL("src/pages/auth/StaffLogin.jsx", `file://${ROOT}`)), "StaffLogin remains available");
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

test("the outer application delegates customer paths to the customer layout", () => {
  const app = read("src/App.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\/account"/);
  assert.doesNotMatch(app, /<Route path="\/shop"/);
});
