/**
 * Phase 12 · /account/preferences — the native Aarna style-preferences screen.
 *
 * The notes are device-local by design (the store's own BACKEND_GAP): the suite
 * proves that they are saved under the customer's scope on this device, that no
 * account request is made, that the page says so, and that a signed-out visitor
 * cannot be told a save happened.
 */
import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { startHarness, textOf } from "./helpers/accountScreenHarness.js";

let h;
let Preferences;
let getStylePreferences;
let STYLE_PREFERENCES_STORAGE_KEY;
let trees = [];

before(async () => {
  h = await startHarness();
  Preferences = (await h.load("/src/components/customer/pages/account/Preferences.jsx")).default;
  ({ getStylePreferences, STYLE_PREFERENCES_STORAGE_KEY } = await h.load("/src/services/customer/stylePreferences.js"));
  /* The chip options are the catalogue's own distinct values. The store is given one
     normalised product through its own snapshot writer, the same one hydration uses. */
  const catalogStore = await h.load("/src/services/catalog/catalogStore.js");
  catalogStore.applyCatalogSnapshot({
    products: [{ id: "p-1", slug: "silk-festive", name: "Silk festive saree", fabric: "Silk", occasion: ["Festive"], colors: ["Red"] }],
  });
});

after(async () => {
  await h?.teardown();
});

beforeEach(() => {
  h.installStubs();
  /* The device store reads and writes `window.localStorage`, so the stub is given a
     window of its own for the length of each test. */
  globalThis.window = { localStorage: globalThis.localStorage, dispatchEvent: () => true };
  trees = [];
});

afterEach(async () => {
  for (const tree of trees) act(() => tree.unmount());
  delete globalThis.window;
});

const mount = async (opts) => {
  const tree = await h.render(Preferences, { path: "/account/preferences", ...opts });
  trees.push(tree);
  return tree;
};

test("the page says the notes stay on this device and are not stored on the account", async () => {
  const tree = await mount();
  const text = textOf(tree.toJSON());
  assert.match(text, /saved on this device only/);
  assert.match(text, /not stored on your account yet/);
  for (const legend of ["Preferred categories", "Preferred fabrics", "Preferred occasions", "Preferred colours"]) {
    assert.match(text, new RegExp(legend), `${legend} is offered`);
  }
  assert.equal(h.requests.filter((r) => r.method !== "GET").length, 0, "rendering the page writes nothing to the account");
});

test("a chosen option is saved under this customer's scope on this device, with no network request", async () => {
  const tree = await mount();
  const options = h.find(tree, (n) => n.type === "button" && n.props["aria-pressed"] !== undefined && n.props.name === "fabrics");
  assert.ok(options.length > 0, "the fabric options come from the catalogue");
  const pick = options[0];
  const label = textOf(pick.children);

  await act(async () => { pick.props.onClick(); });
  await h.submit(tree);

  assert.match(textOf(tree.toJSON()), /saved to this device/);
  assert.equal(h.requests.filter((r) => r.method !== "GET").length, 0, "style notes never reach the backend");
  const saved = getStylePreferences("cust-1");
  assert.deepEqual(saved.fabrics, [label], "the choice is stored for this customer");
});

test("a saved choice is shown again when the page is opened again", async () => {
  const first = await mount();
  const options = h.find(first, (n) => n.type === "button" && n.props["aria-pressed"] !== undefined && n.props.name === "fabrics");
  const label = textOf(options[0].children);
  await act(async () => { options[0].props.onClick(); });
  await h.submit(first);

  const again = await mount();
  const reopened = h.find(again, (n) => n.type === "button" && n.props.name === "fabrics" && textOf(n.children) === label)[0];
  assert.equal(reopened.props["aria-pressed"], true);
});

test("a refused device write is reported as a failure, never as saved", async () => {
  const tree = await mount();
  const options = h.find(tree, (n) => n.type === "button" && n.props["aria-pressed"] !== undefined && n.props.name === "fabrics");
  await act(async () => { options[0].props.onClick(); });
  globalThis.window.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  await h.submit(tree);
  const text = textOf(tree.toJSON());
  assert.equal(/have been saved|saved to this device/.test(text), false, "a refused write is never reported as saved");
  assert.match(text, /could not be saved on this device/);
});

test("signed out, saving is unavailable and nothing is written or confirmed", async () => {
  const tree = await mount({ signedIn: false });
  const text = textOf(tree.toJSON());
  assert.match(text, /Sign in to keep style notes/);
  const save = h.buttonWith(tree, "Save Preferences");
  assert.equal(save.props.disabled, true, "the save is disabled when there is no customer to keep the notes for");

  await h.submit(tree);
  assert.equal(/saved to this device/.test(textOf(tree.toJSON())), false, "no save is claimed");
  assert.equal(h.storage().has(STYLE_PREFERENCES_STORAGE_KEY), false, "no style notes are written to the device");
});
