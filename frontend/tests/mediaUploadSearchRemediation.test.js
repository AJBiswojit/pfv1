/**
 * PRATIKSHYA FASHION — MEDIA-UPLOAD-031/032/033 remediation regressions.
 *
 * MEDIA-UPLOAD-031 — THE ACTUAL FAILURE
 * -------------------------------------
 * On the dev server (React StrictMode) the assigned-product search sent its
 * request, the server answered 200 with products, and the picker STILL spun
 * forever. Root cause: `useAdminProductSearch` (and `MediaUploadForm`) kept a
 * `mountedRef` that was initialised to `true` and only ever flipped to
 * `false` in an effect CLEANUP. StrictMode runs every effect as
 * setup → cleanup → setup on the first mount, so after the simulated unmount
 * the ref stayed `false` for the rest of the session and the stale-response
 * guard (`if (!mountedRef.current …) return;`) discarded every response —
 * including the ones from requests issued after the remount. Production
 * builds (no double-invocation) were unaffected, which is why only the
 * localhost:5173 surface showed the stuck spinner.
 *
 * The behavioural tests below mount the REAL hook and the REAL selector under
 * `<StrictMode>` through react-test-renderer (already a devDependency) with a
 * stubbed `fetch`. Before the fix they fail with status stuck at "loading";
 * with the fix they observe loading → ready / empty / error honestly.
 *
 * MEDIA-UPLOAD-032 — the "DURABLE MEDIA PIPELINE ACTIVE" banner is gone from
 * the live form; no "Phase 7" / "object store" copy reaches operators.
 *
 * MEDIA-UPLOAD-033 — the footer actions: burgundy primary plate, subordinate
 * gold-hairline Cancel, sticky bar, explicit padding, double-submit guard.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { StrictMode, act } from "react";
import { create } from "react-test-renderer";
import { createServer } from "vite";

const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT;

let vite;
let useAdminProductSearch;
let MediaProductSelector;

/* The selector only touches `document` while its popup is open (outside-click
   dismissal + scroll-into-view). A minimal stub keeps react-test-renderer
   happy without pulling in a DOM implementation. */
const documentStub = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: () => null,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const productRow = (id, name, sku) => ({
  id,
  name,
  sku,
  category: "womenswear",
  status: "PUBLISHED",
  price: 12000,
});

/** Install a fetch stub; returns the call log and a responder swap hook. */
const installFetch = (responder) => {
  const calls = [];
  const state = { responder };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return state.responder(String(url), options);
  };
  return { calls, setResponder: (next) => { state.responder = next; } };
};

const textOf = (node) => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.children);
};

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.document = documentStub;
  vite = await createServer({
    root: new URL("..", import.meta.url).pathname,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  useAdminProductSearch = (
    await vite.ssrLoadModule("/src/hooks/useAdminProductSearch.js")
  ).default;
  MediaProductSelector = (
    await vite.ssrLoadModule("/src/components/media/MediaProductSelector.jsx")
  ).default;
});

after(async () => {
  await vite?.close();
  globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct;
  delete globalThis.document;
  delete globalThis.fetch;
});

beforeEach(() => {
  localStorageClear();
});

const localStorageClear = () => {
  /* apiClient reads tokens through a try/catch; nothing to clear in node. */
};

/* =========================================================================== */
/* 1. The hook under StrictMode — the exact reported failure                  */
/* =========================================================================== */

function HookHarness({ capture }) {
  const search = useAdminProductSearch();
  capture(search);
  return null;
}

test("031: a StrictMode remount no longer discards the server's answer (stuck spinner)", async () => {
  const fetchStub = installFetch(async () => {
    await sleep(30); // keep the request genuinely in flight for the first paint
    return jsonResponse({ products: [productRow("PF-W-0042", "Banarasi Silk Sari", "PF-W-0042")], total: 1 });
  });

  let latest = null;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(StrictMode, null, React.createElement(HookHarness, { capture: (s) => { latest = s; } }))
    );
  });
  assert.equal(latest.status, "loading", "the first paint is honestly in-flight");

  await act(async () => { await sleep(60); });

  assert.equal(fetchStub.calls.length >= 1, true, "a search request really was sent");
  const url = new URL(fetchStub.calls.at(-1).url, "https://frontend.invalid");
  assert.equal(url.pathname, "/api/v1/admin/products");

  assert.equal(latest.status, "ready", "loading must clear once the server answers");
  assert.equal(latest.items.length, 1);
  assert.equal(latest.items[0].sku, "PF-W-0042");
  assert.equal(latest.total, 1);

  await act(async () => { renderer.unmount(); });
});

test("031: a typed SKU debounces into a q request and replaces the rows", async () => {
  const fetchStub = installFetch((url) => {
    const q = new URL(url, "https://frontend.invalid").searchParams.get("q");
    if (q === "PF-W-0042") {
      return jsonResponse({ products: [productRow("PF-W-0042", "Banarasi Silk Sari", "PF-W-0042")], total: 1 });
    }
    return jsonResponse({ products: [productRow("PF-K-0007", "Cotton Kurta", "PF-K-0007")], total: 1 });
  });

  let latest = null;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(StrictMode, null, React.createElement(HookHarness, { capture: (s) => { latest = s; } }))
    );
  });
  await act(async () => { await sleep(40); });
  assert.equal(latest.status, "ready");

  await act(async () => { latest.setQuery("PF-W-0042"); });
  await act(async () => { await sleep(340); }); // 300ms debounce + response

  const url = new URL(fetchStub.calls.at(-1).url, "https://frontend.invalid");
  assert.equal(url.searchParams.get("q"), "PF-W-0042");
  assert.equal(latest.status, "ready");
  assert.equal(latest.items[0].name, "Banarasi Silk Sari");

  await act(async () => { renderer.unmount(); });
});

test("031: a no-match query is an honest empty, not an error and not a spinner", async () => {
  installFetch(() => jsonResponse({ products: [], total: 0 }));
  let latest = null;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(StrictMode, null, React.createElement(HookHarness, { capture: (s) => { latest = s; } }))
    );
  });
  await act(async () => { await sleep(40); });
  assert.equal(latest.status, "ready");
  assert.deepEqual(latest.items, []);
  assert.equal(latest.total, 0);
  assert.equal(latest.isLoading, false);
  await act(async () => { renderer.unmount(); });
});

test("031: a failed request surfaces as error with the server message, and retry recovers", async () => {
  const fetchStub = installFetch(() =>
    jsonResponse({ detail: "Catalogue temporarily unavailable." }, 503)
  );
  let latest = null;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(StrictMode, null, React.createElement(HookHarness, { capture: (s) => { latest = s; } }))
    );
  });
  await act(async () => { await sleep(40); });
  assert.equal(latest.status, "error");
  assert.match(latest.error, /Catalogue temporarily unavailable/);
  assert.equal(latest.isLoading, false, "loading must clear on failure too");

  fetchStub.setResponder(() =>
    jsonResponse({ products: [productRow("PF-W-0042", "Banarasi Silk Sari", "PF-W-0042")], total: 1 })
  );
  await act(async () => { latest.retry(); });
  await act(async () => { await sleep(20); });
  assert.equal(latest.status, "ready");
  assert.equal(latest.items.length, 1);
  await act(async () => { renderer.unmount(); });
});

test("031: a slow stale response can never overwrite a newer query's rows", async () => {
  const fetchStub = installFetch((url) => {
    const q = new URL(url, "https://frontend.invalid").searchParams.get("q");
    if (q === "slow") return sleep(120).then(() => jsonResponse({ products: [productRow("OLD", "Stale Row", "OLD")], total: 1 }));
    return jsonResponse({ products: [productRow("NEW", "Fresh Row", "NEW")], total: 1 });
  });
  let latest = null;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(StrictMode, null, React.createElement(HookHarness, { capture: (s) => { latest = s; } }))
    );
  });
  await act(async () => { await sleep(40); });

  await act(async () => { latest.setQuery("slow"); });
  await act(async () => { await sleep(320); });   // debounce fires the slow request
  await act(async () => { latest.setQuery("new"); });
  await act(async () => { await sleep(340); });   // debounce fires the fast request
  assert.equal(latest.items[0].id, "NEW");
  await act(async () => { await sleep(150); });   // the slow answer lands late…
  assert.equal(latest.items[0].id, "NEW", "…and must be discarded");
  void fetchStub;
  await act(async () => { renderer.unmount(); });
});

/* =========================================================================== */
/* 2. The selector under StrictMode — what the operator actually sees         */
/* =========================================================================== */

const renderSelector = async (props = {}) => {
  const onSelectProduct = (...args) => { onSelectProduct.calls.push(args); };
  onSelectProduct.calls = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StrictMode,
        null,
        React.createElement(MediaProductSelector, { onSelectProduct, ...props })
      )
    );
  });
  return { renderer, onSelectProduct };
};

const openPopup = async (renderer) => {
  const input = renderer.root.findByProps({ id: "product-search-input" });
  await act(async () => { input.props.onFocus(); });
  return input;
};

test("031: the opened picker shows server rows with name + SKU after a StrictMode remount", async () => {
  installFetch(() =>
    jsonResponse({
      products: [productRow("PF-W-0042", "Banarasi Silk Sari", "PF-W-0042")],
      total: 1,
    })
  );
  const { renderer } = await renderSelector();
  const input = await openPopup(renderer);
  await act(async () => { await sleep(40); });

  const tree = textOf(renderer.toJSON());
  assert.match(tree, /Banarasi Silk Sari/);
  assert.match(tree, /PF-W-0042/);
  assert.ok(!/Searching the catalogue/.test(tree), "no perpetual spinner once the server answered");
  assert.equal(input.props["aria-busy"], undefined);
  await act(async () => { renderer.unmount(); });
});

test("031: keyboard selection works — ArrowDown then Enter chooses the row", async () => {
  installFetch(() =>
    jsonResponse({ products: [productRow("PF-W-0042", "Banarasi Silk Sari", "PF-W-0042")], total: 1 })
  );
  const { renderer, onSelectProduct } = await renderSelector();
  const input = await openPopup(renderer);
  await act(async () => { await sleep(40); });

  await act(async () => { input.props.onKeyDown({ key: "ArrowDown", preventDefault: () => {} }); });
  await act(async () => { input.props.onKeyDown({ key: "Enter", preventDefault: () => {} }); });
  assert.equal(onSelectProduct.calls.length, 1);
  assert.equal(onSelectProduct.calls[0][0], "PF-W-0042");
  await act(async () => { renderer.unmount(); });
});

test("031: Escape closes the popup without selecting anything", async () => {
  installFetch(() =>
    jsonResponse({ products: [productRow("PF-W-0042", "Banarasi Silk Sari", "PF-W-0042")], total: 1 })
  );
  const { renderer, onSelectProduct } = await renderSelector();
  const input = await openPopup(renderer);
  await act(async () => { await sleep(40); });
  assert.match(textOf(renderer.toJSON()), /Banarasi Silk Sari/);
  await act(async () => { input.props.onKeyDown({ key: "Escape", preventDefault: () => {} }); });
  assert.ok(!/Banarasi Silk Sari/.test(textOf(renderer.toJSON())));
  assert.equal(onSelectProduct.calls.length, 0);
  await act(async () => { renderer.unmount(); });
});

test("031: no match renders the empty state, and a 503 renders the error with a working retry", async () => {
  const fetchStub = installFetch(() => jsonResponse({ detail: "Catalogue down." }, 503));
  const { renderer } = await renderSelector();
  const input = await openPopup(renderer);
  await act(async () => { await sleep(40); });
  let tree = textOf(renderer.toJSON());
  assert.match(tree, /Catalogue down/);
  assert.match(tree, /Try again/);

  fetchStub.setResponder(() => jsonResponse({ products: [], total: 0 }));
  const retryButton = renderer.root.findAll(
    (node) => node.type === "button" && /Try again/.test(textOf(node))
  )[0];
  await act(async () => { retryButton.props.onClick(); });
  await act(async () => { await sleep(20); });
  tree = textOf(renderer.toJSON());
  assert.match(tree, /No products in the catalogue yet/);
  void input;
  await act(async () => { renderer.unmount(); });
});

/* =========================================================================== */
/* 3. Source guards — the fix and the surface remediation                     */
/* =========================================================================== */

const HOOK = readFileSync(new URL("../src/hooks/useAdminProductSearch.js", import.meta.url), "utf8");
const FORM = readFileSync(new URL("../src/components/media/MediaUploadForm.jsx", import.meta.url), "utf8");

test("031: both mount guards re-arm on setup so StrictMode cannot freeze them", () => {
  for (const [name, source] of [["hook", HOOK], ["form", FORM]]) {
    assert.match(source, /mountedRef\.current = true;/, `${name} re-arms the guard on setup`);
    assert.match(source, /mountedRef\.current = false;/, `${name} still flips on real unmount`);
    assert.match(
      source,
      /useEffect\(\(\) => \{\s*mountedRef\.current = true;\s*return \(\) => \{\s*mountedRef\.current = false;\s*\};\s*\}, \[\]\);/,
      `${name} guard is one setup/cleanup pair`
    );
  }
});

test("032: the live form no longer shows the pipeline banner or its internals", () => {
  assert.ok(!/UPLOAD_NOTICE/.test(FORM), "banner copy is not imported by the live form");
  assert.ok(!/DURABLE MEDIA PIPELINE ACTIVE/.test(FORM));
  assert.ok(!/Phase 7/.test(FORM), "no phase numbering for operators");
  assert.ok(!/object store/.test(FORM), "no storage internals for operators");
  assert.ok(!/<details/.test(FORM), "the disclosure banner markup is gone");
});

test("033: the footer carries the burgundy primary and a subordinate outline Cancel", () => {
  const footer = FORM.slice(FORM.indexOf("{/* Submission Actions"));
  assert.match(footer, /bg-pf-burgundy/);
  assert.match(footer, /text-pf-ivory/);
  assert.match(footer, /border-pf-border-strong/);
  assert.match(footer, /sticky bottom-0/);
  assert.match(footer, /focus-visible:outline-pf-gold-deep/);
  assert.ok(!/bg-ink text-ivory hover:bg-cocoa/.test(footer), "the off-system primary override is gone");
  assert.ok(!/size="sm"/.test(footer), "the non-existent Atelier size is gone from the footer");
});

test("033: submission stays single-write and double-submit stays blocked", () => {
  assert.match(FORM, /const handleSubmit = async \(event\) => \{\s*event\.preventDefault\(\);\s*if \(busy\) return;/);
  assert.ok(!/\/media\/register/.test(FORM), "no redundant register call from this page");
});
