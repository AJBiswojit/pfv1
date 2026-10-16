/**
 * Phase 12 · /account/settings — the native Aarna communication-settings screen.
 *
 * Rendered for real, inside the real AccountProvider, with the network stubbed at
 * fetch. Covers: loading, the server's values (never placeholder defaults), a failed
 * read with a working retry, a save that waits for the backend, a rejected save that
 * claims nothing, discard, and the signed-out case that makes no request.
 */
import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { startHarness, textOf, json, routeFetch, isAccountRead, ACCOUNT_PAYLOAD } from "./helpers/accountScreenHarness.js";

let h;
let Settings;
let trees = [];

before(async () => {
  h = await startHarness();
  Settings = (await h.load("/src/components/aarna/pages/account/Settings.jsx")).default;
});

after(async () => {
  await h?.teardown();
});

beforeEach(() => {
  h.installStubs();
  trees = [];
});

afterEach(async () => {
  for (const tree of trees) act(() => tree.unmount());
});

const mount = async (opts) => {
  const tree = await h.render(Settings, { path: "/account/settings", ...opts });
  trees.push(tree);
  return tree;
};

const box = (tree, name) => h.byName(tree, name)[0];

const accountOk = () => ({ method: "GET", match: isAccountRead, answer: () => json(200, ACCOUNT_PAYLOAD) });

test("while the account read is in flight, no switch is drawn as the customer's choice", async () => {
  h.setPlan(routeFetch([{ method: "GET", match: isAccountRead, answer: () => new Promise(() => {}) }]));
  const tree = await mount();
  const text = textOf(tree.toJSON());
  assert.match(text, /Gathering your preferences/);
  assert.equal(h.find(tree, (n) => n.type === "input" && n.props.type === "checkbox").length, 0,
    "no switch is drawn before the server has answered");
});

test("the switches show the server's preferences, not the placeholder defaults", async () => {
  h.setPlan(routeFetch([accountOk()]));
  const tree = await mount();
  assert.equal(box(tree, "orderUpdates").props.checked, true);
  assert.equal(box(tree, "smsNotifications").props.checked, true);
  assert.equal(box(tree, "promotionalUpdates").props.checked, false, "the server said false");
  assert.equal(box(tree, "stylingInvitations").props.checked, false, "the server said false");
});

test("a failed read is named as failed, and retry re-reads the account", async () => {
  let reads = 0;
  h.setPlan(routeFetch([{
    method: "GET",
    match: isAccountRead,
    answer: () => {
      reads += 1;
      return reads === 1 ? json(500, { detail: "Server error" }) : json(200, ACCOUNT_PAYLOAD);
    },
  }]));
  const tree = await mount();
  assert.match(textOf(tree.toJSON()), /We could not load your preferences right now/);
  assert.equal(h.find(tree, (n) => n.type === "input" && n.props.type === "checkbox").length, 0,
    "no switches are drawn from a failed read");

  await h.click(tree, "Try again");
  assert.equal(reads, 2, "retry issues exactly one more account read");
  assert.equal(box(tree, "orderUpdates").props.checked, true);
});

test("a save waits for the backend and reports only the server's answer", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  h.setPlan(routeFetch([
    accountOk(),
    {
      method: "PATCH",
      match: (url) => url.includes("/customers/me/preferences"),
      answer: () => pending,
    },
  ]));
  const tree = await mount();

  await h.change(box(tree, "smsNotifications"), false);
  await h.submit(tree);

  const during = textOf(tree.toJSON());
  assert.match(during, /Saving Preferences/, "the button shows the save in flight");
  assert.equal(h.buttonWith(tree, "Saving Preferences").props.disabled, true, "the save cannot be sent twice");
  assert.equal(/have been saved/.test(during), false, "nothing is confirmed before the backend answers");

  const patch = h.requests.find((r) => r.method === "PATCH");
  assert.deepEqual(patch.body, {
    emailNotifications: false,
    smsNotifications: false,
    promotionalUpdates: false,
    orderUpdates: true,
    stylingInvitations: false,
  }, "the PATCH carries all five server fields, with only the customer's change");

  await act(async () => {
    release(json(200, { preferences: { ...ACCOUNT_PAYLOAD.preferences, sms_notifications: false } }));
    await new Promise(setImmediate);
  });
  await h.flush();
  assert.match(textOf(tree.toJSON()), /Your communication preferences have been saved\./);
  assert.equal(box(tree, "smsNotifications").props.checked, false, "the form takes the server's canonical answer");
});

test("a rejected save is reported, nothing is shown as saved, and the choice is kept", async () => {
  h.setPlan(routeFetch([
    accountOk(),
    {
      method: "PATCH",
      match: (url) => url.includes("/customers/me/preferences"),
      answer: () => json(500, { detail: "Preferences are temporarily unavailable." }),
    },
  ]));
  const tree = await mount();

  await h.change(box(tree, "promotionalUpdates"), true);
  await h.submit(tree);

  const text = textOf(tree.toJSON());
  assert.equal(/have been saved/.test(text), false, "a failed save is never reported as saved");
  assert.match(text, /temporarily unavailable|could not be saved|Preferences/i);
  assert.equal(box(tree, "promotionalUpdates").props.checked, true, "the customer's unsaved choice stays on screen");
});

test("discard restores the saved preferences without another request", async () => {
  h.setPlan(routeFetch([accountOk()]));
  const tree = await mount();
  await h.toggle(box(tree, "orderUpdates"));
  assert.equal(box(tree, "orderUpdates").props.checked, false);

  await h.click(tree, "Discard changes");
  assert.equal(box(tree, "orderUpdates").props.checked, true);
  assert.equal(h.requests.filter((r) => r.method === "PATCH").length, 0);
  assert.equal(h.requests.length, 1, "only the account read was made");
});

test("signed out, the page offers no preferences and makes no request", async () => {
  h.setPlan(routeFetch([accountOk()]));
  const tree = await mount({ signedIn: false });
  assert.match(textOf(tree.toJSON()), /Sign in to see your preferences/);
  assert.equal(h.find(tree, (n) => n.type === "input" && n.props.type === "checkbox").length, 0);
  assert.equal(h.requests.length, 0);
});
