/**
 * Phase 12 · the four account screens are mounted at their existing paths, inside the
 * same protected block as the other account screens, and the production screens
 * remain on disk as the legacy surface.
 *
 * These are structural checks on the composition root. The behaviour of each screen
 * is covered by its own suite (accountScreen*.test.js).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFileSync(new URL(relative, `file://${ROOT}`), "utf8");

const STOREFRONT = "src/components/aarna/AarnaStorefront.jsx";
const NATIVE = {
  "account/settings": "./pages/account/Settings.jsx",
  "account/security": "./pages/account/Security.jsx",
  "account/preferences": "./pages/account/Preferences.jsx",
  "account/instagram-rewards": "./pages/account/InstagramRewards.jsx",
};

test("each of the four paths is mounted on its native Aarna page", () => {
  const source = read(STOREFRONT);
  for (const [path, file] of Object.entries(NATIVE)) {
    assert.ok(source.includes(`import `) && source.includes(`from "${file}"`), `${file} is imported`);
    assert.match(source, new RegExp(`<Route path="${path}" element=\\{<[A-Za-z]+ />\\} />`), `${path} is routed`);
  }
});

test("the four screens no longer load the production pages", () => {
  const source = read(STOREFRONT);
  for (const production of ["AccountSettings.jsx", "AccountSecurity.jsx", "AccountPreferences.jsx", "InstagramRewards.jsx"]) {
    assert.equal(source.includes(`"../../pages/account/${production}"`), false, `${production} is not imported by the storefront`);
  }
});

test("the four paths sit inside the same ProtectedRoute as the other account screens", () => {
  const source = read(STOREFRONT);
  const guardOpen = source.indexOf("<Route element={<ProtectedRoute />}>");
  const guardedEnd = source.indexOf('<Route path="account/orders/:orderId"');
  assert.ok(guardOpen > 0 && guardedEnd > guardOpen, "the protected block is where it was");
  for (const path of Object.keys(NATIVE)) {
    const at = source.indexOf(`<Route path="${path}"`);
    assert.ok(at > guardOpen && at < guardedEnd, `${path} is guarded`);
  }
});

test("the single-order routes stay open to a guest, as before", () => {
  const source = read(STOREFRONT);
  assert.match(source, /<Route path="account\/orders\/:orderId" element=\{<AccountOrderDetailPage \/>\} \/>/);
});

test("the production screens remain on disk as the legacy surface", () => {
  for (const production of ["AccountSettings.jsx", "AccountSecurity.jsx", "AccountPreferences.jsx", "InstagramRewards.jsx"]) {
    assert.ok(existsSync(new URL(`src/pages/account/${production}`, `file://${ROOT}`)), `${production} is kept`);
  }
});
