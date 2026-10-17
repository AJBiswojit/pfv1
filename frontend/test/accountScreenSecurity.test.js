/**
 * Phase 12 · /account/security — the native Aarna security screen.
 *
 * Rendered for real, inside the real AccountProvider, with fetch stubbed. Covers:
 * loading, failed read and retry, the client checks that must stop a request, the
 * backend's own verdict on a password change, the local sign-out that follows a
 * successful change, the session list as the backend returned it, and "sign out
 * everywhere" — whose copy must say that it ends THIS device too.
 */
import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { startHarness, textOf, json, routeFetch, isAccountRead, ACCOUNT_PAYLOAD } from "./helpers/accountScreenHarness.js";

let h;
let Security;
let trees = [];

/* The page's own sign-out delay (1600 ms) plus margin. */
const AFTER_SIGN_OUT_MS = 1800;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  h = await startHarness();
  Security = (await h.load("/src/components/customer/pages/account/Security.jsx")).default;
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
  const tree = await h.render(Security, { path: "/account/security", ...opts });
  trees.push(tree);
  return tree;
};

const field = (tree, name) => h.byName(tree, name)[0];
const fill = (tree, values) =>
  act(async () => {
    for (const [name, value] of Object.entries(values)) field(tree, name).props.onChange({ target: { value } });
  });

const accountOk = () => ({ method: "GET", match: isAccountRead, answer: () => json(200, ACCOUNT_PAYLOAD) });
const passwordAccepted = () => ({
  method: "POST",
  match: (url) => url.includes("/auth/change-password"),
  answer: () => json(200, { message: "Password updated successfully." }),
});

test("while the account read is in flight, no security detail is drawn", async () => {
  h.setPlan(routeFetch([{ method: "GET", match: isAccountRead, answer: () => new Promise(() => {}) }]));
  const tree = await mount();
  assert.match(textOf(tree.toJSON()), /Gathering your security details/);
  assert.equal(h.find(tree, (n) => n.type === "input").length, 0);
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
  assert.match(textOf(tree.toJSON()), /We could not load your security details right now/);
  await act(async () => { h.buttonWith(tree, "Try again").props.onClick(); await new Promise(setImmediate); });
  assert.equal(reads, 2);
  assert.ok(field(tree, "currentPwd"), "the password form is drawn after the retry");
});

test("signed out, the page makes no request and offers no security actions", async () => {
  h.setPlan(routeFetch([accountOk()]));
  const tree = await mount({ signedIn: false });
  assert.match(textOf(tree.toJSON()), /Sign in to manage your security settings/);
  assert.equal(h.requests.length, 0);
});

test("a missing current password is refused before any request is made", async () => {
  h.setPlan(routeFetch([accountOk(), passwordAccepted()]));
  const tree = await mount();
  await fill(tree, { newPwd: "fresh-pass-1", confirmPwd: "fresh-pass-1" });
  await h.submit(tree);
  assert.match(textOf(tree.toJSON()), /Please enter your current password/);
  assert.equal(h.requests.filter((r) => r.method === "POST").length, 0);
});

test("a new password under the backend's six-character minimum is refused before any request", async () => {
  h.setPlan(routeFetch([accountOk(), passwordAccepted()]));
  const tree = await mount();
  await fill(tree, { currentPwd: "old-pass-1", newPwd: "abc", confirmPwd: "abc" });
  await h.submit(tree);
  assert.equal(h.requests.filter((r) => r.method === "POST").length, 0, "the short password never leaves the page");
  assert.match(textOf(tree.toJSON()), /6|least|character/i);
});

test("a mismatched confirmation is refused before any request is made", async () => {
  h.setPlan(routeFetch([accountOk(), passwordAccepted()]));
  const tree = await mount();
  await fill(tree, { currentPwd: "old-pass-1", newPwd: "fresh-pass-1", confirmPwd: "fresh-pass-2" });
  await h.submit(tree);
  assert.equal(h.requests.filter((r) => r.method === "POST").length, 0);
  assert.match(textOf(tree.toJSON()), /match/i);
});

test("a successful change sends the backend contract, shows its verdict, and ends the local session", async () => {
  h.setPlan(routeFetch([accountOk(), passwordAccepted()]));
  const tree = await mount();
  await fill(tree, { currentPwd: "old-pass-1", newPwd: "fresh-pass-1", confirmPwd: "fresh-pass-1" });
  await h.submit(tree);

  const post = h.requests.find((r) => r.method === "POST");
  assert.deepEqual(post.body, { currentPassword: "old-pass-1", newPassword: "fresh-pass-1", confirmPassword: "fresh-pass-1" });
  assert.match(textOf(tree.toJSON()), /Your password has been changed\. Please sign in again\./);
  assert.equal(h.auth.signOutCalls, 0, "the session is not ended before the customer has read the confirmation");

  await wait(AFTER_SIGN_OUT_MS);
  assert.equal(h.auth.signOutCalls, 1, "the local session ends once the backend has revoked it");
  assert.equal(h.location.pathname, "/signin");
});

test("a rejected change shows the backend's own words and ends nothing", async () => {
  h.setPlan(routeFetch([
    accountOk(),
    {
      method: "POST",
      match: (url) => url.includes("/auth/change-password"),
      /* The backend's BusinessLogicException: HTTP 422 with its canonical envelope. */
      answer: () => json(422, { error: { code: "BUSINESS_RULE_VIOLATION", message: "Current password is not correct." } }),
    },
  ]));
  const tree = await mount();
  await fill(tree, { currentPwd: "wrong-pass", newPwd: "fresh-pass-1", confirmPwd: "fresh-pass-1" });
  await h.submit(tree);
  assert.match(textOf(tree.toJSON()), /Current password is not correct\./);
  await wait(AFTER_SIGN_OUT_MS);
  assert.equal(h.auth.signOutCalls, 0, "a refused change does not sign the customer out");
});

test("the signed-in devices are the backend's sessions, with no invented device", async () => {
  h.setPlan(routeFetch([accountOk()]));
  const tree = await mount();
  const text = textOf(tree.toJSON());
  assert.match(text, /Windows PC/);
  assert.match(text, /10\.0\.0\.7/);
  assert.match(text, /This device/);
});

test("with no recorded sessions, the page says so rather than inventing one", async () => {
  h.setPlan(routeFetch([{
    method: "GET",
    match: isAccountRead,
    answer: () => json(200, { ...ACCOUNT_PAYLOAD, security: { activeSessions: [] } }),
  }]));
  const tree = await mount();
  assert.match(textOf(tree.toJSON()), /No other signed-in devices are recorded/);
});

test("the sign-out-everywhere copy says it ends this device too, never 'other devices only'", async () => {
  h.setPlan(routeFetch([accountOk()]));
  const tree = await mount();
  const text = textOf(tree.toJSON());
  assert.match(text, /Individual devices cannot be signed out from here yet/);
  assert.match(text, /ends every session,\s*including this device/);
  assert.equal(/except this one|other devices only/i.test(text), false, "the page must not promise a partial sign-out");
});

test("sign out everywhere ends the local session only after the backend has revoked every session", async () => {
  h.setPlan(routeFetch([
    accountOk(),
    {
      method: "POST",
      match: (url) => url.includes("/customers/me/sessions/revoke-others"),
      answer: () => json(200, { ok: true, revokedCount: 2 }),
    },
  ]));
  const tree = await mount();
  await h.click(tree, "Sign out everywhere");
  assert.equal(h.requests.filter((r) => r.url.includes("revoke-others")).length, 1);
  assert.match(textOf(tree.toJSON()), /signed out on every device/);
  assert.equal(h.auth.signOutCalls, 0);
  await wait(AFTER_SIGN_OUT_MS);
  assert.equal(h.auth.signOutCalls, 1);
  assert.equal(h.location.pathname, "/signin");
});

test("a failed sign out everywhere is reported and signs nobody out", async () => {
  h.setPlan(routeFetch([
    accountOk(),
    {
      method: "POST",
      match: (url) => url.includes("/customers/me/sessions/revoke-others"),
      answer: () => json(500, { detail: "Could not revoke sessions." }),
    },
  ]));
  const tree = await mount();
  await h.click(tree, "Sign out everywhere");
  assert.equal(h.auth.signOutCalls, 0);
  assert.equal(/signed out on every device/.test(textOf(tree.toJSON())), false, "failure is never reported as success");
  await wait(AFTER_SIGN_OUT_MS);
  assert.equal(h.auth.signOutCalls, 0);
});
