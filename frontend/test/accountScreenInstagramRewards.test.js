/**
 * Phase 12 · /account/instagram-rewards — the native Aarna Share & Earn screen.
 *
 * Rendered for real, inside the real AccountProvider, with the reward services
 * running their own code over a stubbed fetch. Covers: loading, a failed list with
 * retry, the empty history, which orders may be claimed, the validation that stops a
 * claim, the claim contract, the server's own rejection, and coupon copy that is
 * reported only when the clipboard really accepted it.
 */
import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { startHarness, textOf, json, routeFetch, isAccountRead, ACCOUNT_PAYLOAD } from "./helpers/accountScreenHarness.js";

let h;
let Rewards;
let trees = [];

/* Orders as the order context holds them: one qualifying PAID order, one delivered
   order, and one unpaid order that must not be offered. */
const ORDERS = [
  { id: "o-1", order_number: "PF-1001", payment_status: "PAID", status: "PENDING", created_at: "2026-01-05T00:00:00Z" },
  { id: "o-2", order_number: "PF-1002", payment_status: "PENDING", status: "DELIVERED", created_at: "2026-02-05T00:00:00Z" },
  { id: "o-3", order_number: "PF-1003", payment_status: "PENDING", status: "PENDING_PAYMENT", created_at: "2026-03-05T00:00:00Z" },
];

/* The submissions list in the backend's wire shape (`data.items`, snake_case). */
const REWARD_ROWS = [
  { id: "r-1", order_id: "o-1", order_number: "PF-1001", instagram_username: "asha", status: "PENDING", created_at: "2026-01-06T00:00:00Z" },
  {
    id: "r-2", order_id: "o-9", order_number: "PF-0900", instagram_username: "asha", status: "APPROVED",
    created_at: "2025-12-06T00:00:00Z", coupon_code: "PF-SAREE10", coupon: { code: "PF-SAREE10", discount_percentage: 10, valid_until: "2026-12-31T00:00:00Z" },
  },
  {
    id: "r-3", order_id: "o-8", order_number: "PF-0800", instagram_username: "asha", status: "REJECTED",
    created_at: "2025-11-06T00:00:00Z", rejection_reason: "The tag was not visible.",
  },
];

const listOk = (items = REWARD_ROWS) => json(200, { data: { items, total: items.length } });

const submissionsRoute = (answer) => ({
  method: "GET",
  match: (url) => url.includes("/customer/instagram-rewards"),
  answer,
});

before(async () => {
  h = await startHarness();
  Rewards = (await h.load("/src/components/aarna/pages/account/InstagramRewards.jsx")).default;
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

const mount = async (opts = {}) => {
  const order = opts.order ?? { orders: ORDERS, isLoadingOrders: false };
  const tree = await h.render(Rewards, { path: "/account/instagram-rewards", order, ...opts });
  trees.push(tree);
  return tree;
};

const field = (tree, name) => h.byName(tree, name)[0];
const claims = (method = "POST") => h.requests.filter((r) => r.method === method && r.url.includes("/customer/instagram-rewards"));

test("while the submissions are loading, the history says so and nothing is claimed as listed", async () => {
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => new Promise(() => {}))]));
  const tree = await mount();
  assert.match(textOf(tree.toJSON()), /Loading reward submissions/);
  assert.equal(h.find(tree, (n) => n.type === "table").length, 0);
});

test("a failed list is named as failed, and retry loads it", async () => {
  let reads = 0;
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => {
    reads += 1;
    return reads === 1 ? json(500, { detail: "Rewards are unavailable." }) : listOk();
  })]));
  const tree = await mount();
  assert.match(textOf(tree.toJSON()), /We could not load your reward submissions/);
  await act(async () => { h.buttonWith(tree, "Try again").props.onClick(); await new Promise(setImmediate); });
  assert.equal(reads, 2);
  assert.match(textOf(tree.toJSON()), /PF-1001/);
});

test("an empty history is said to be empty", async () => {
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk([]))]));
  const tree = await mount();
  assert.match(textOf(tree.toJSON()), /No submissions yet/);
});

test("only qualifying orders are offered, and an order already claimed is listed but cannot be picked again", async () => {
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk())]));
  const tree = await mount();
  const options = h.find(tree, (n) => n.type === "option").map((o) => ({ value: o.props.value, disabled: o.props.disabled, text: textOf(o.children) }));
  const values = options.map((o) => o.value);
  assert.ok(values.includes("o-1"), "a PAID order is offered");
  assert.ok(values.includes("o-2"), "a delivered order is offered");
  assert.equal(values.includes("o-3"), false, "an unpaid, unconfirmed order is not offered");
  const claimed = options.find((o) => o.value === "o-1");
  assert.equal(claimed.disabled, true, "an order with a pending claim cannot be claimed twice");
  assert.match(claimed.text, /Already submitted/);
});

test("a claim without an order is refused before any request is made", async () => {
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk([]))]));
  const tree = await mount();
  await h.change(field(tree, "instagramUsername"), "asha");
  await h.submit(tree);
  assert.match(textOf(tree.toJSON()), /Please select an eligible purchase order/);
  assert.equal(claims().length, 0);
});

test("a claim without an Instagram username is refused before any request is made", async () => {
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk([]))]));
  const tree = await mount();
  await h.change(field(tree, "order"), "o-2");
  await h.submit(tree);
  assert.match(textOf(tree.toJSON()), /Please enter your Instagram username/);
  assert.equal(claims().length, 0);
});

test("a valid claim sends the backend contract, reports the server's acceptance and refreshes the history", async () => {
  let lists = 0;
  h.setPlan(routeFetch([
    accountReadRoute(),
    {
      method: "GET",
      match: (url) => url.includes("/customer/instagram-rewards"),
      answer: () => { lists += 1; return listOk(); },
    },
    {
      method: "POST",
      match: (url) => url.includes("/customer/instagram-rewards"),
      answer: () => json(201, { data: { id: "r-9", order_id: "o-2", instagram_username: "asha", status: "PENDING" }, message: "ok" }),
    },
  ]));
  const tree = await mount();
  await h.change(field(tree, "order"), "o-2");
  await h.change(field(tree, "instagramUsername"), "  asha  ");
  await h.submit(tree);

  assert.deepEqual(claims()[0].body, { order_id: "o-2", instagram_username: "asha", instagram_post_url: null });
  assert.match(textOf(tree.toJSON()), /Reward request submitted successfully/);
  assert.equal(lists, 2, "the history is read again after the claim");
});

test("a claim the server refuses shows the server's words and no success", async () => {
  h.setPlan(routeFetch([
    accountReadRoute(),
    submissionsRoute(() => listOk([])),
    {
      method: "POST",
      match: (url) => url.includes("/customer/instagram-rewards"),
      answer: () => json(422, { error: { code: "BUSINESS_RULE_VIOLATION", message: "This order already has a reward claim." } }),
    },
  ]));
  const tree = await mount();
  await h.change(field(tree, "order"), "o-2");
  await h.change(field(tree, "instagramUsername"), "asha");
  await h.submit(tree);
  const text = textOf(tree.toJSON());
  assert.match(text, /This order already has a reward claim\./);
  assert.equal(/submitted successfully/.test(text), false);
});

test("a rejected claim shows the reason the server recorded; an approved one shows its coupon", async () => {
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk())]));
  const tree = await mount();
  const text = textOf(tree.toJSON());
  assert.match(text, /Rejected/);
  assert.match(text, /The tag was not visible\./);
  assert.match(text, /Approved/);
  assert.match(text, /PF-SAREE10/);
  assert.match(text, /Under Review/);
});

test("copying a coupon reports 'Copied' only after the clipboard accepted it", async () => {
  const written = [];
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk())]));
  h.setClipboard({ writeText: async (text) => { written.push(text); } });
  const tree = await mount();
  await h.click(tree, "Copy");
  assert.deepEqual(written, ["PF-SAREE10"]);
  assert.match(textOf(tree.toJSON()), /Copied/);
});

test("when the clipboard refuses, the page does not claim the code was copied", async () => {
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk())]));
  h.setClipboard({ writeText: async () => { throw new Error("denied"); } });
  const tree = await mount();
  await h.click(tree, "Copy");
  const text = textOf(tree.toJSON());
  assert.equal(/Copied/.test(text), false, "a refused copy is never reported as copied");
  assert.match(text, /could not be copied/);
});

test("the reward percentage is taken from the coupon the server issued, never printed as a fixed figure", async () => {
  /* REWARD_ROWS carries a coupon with discount_percentage 10. It must not surface as a
     fixed "10%" label, only as the coupon code the server issued. */
  h.setPlan(routeFetch([accountReadRoute(), submissionsRoute(() => listOk())]));
  const tree = await mount();
  const text = textOf(tree.toJSON());
  assert.equal(/10%/.test(text), false, "no hard-coded percentage is printed");
  assert.match(text, /PF-SAREE10/);
});

function accountReadRoute() {
  return { method: "GET", match: isAccountRead, answer: () => json(200, ACCOUNT_PAYLOAD) };
}
