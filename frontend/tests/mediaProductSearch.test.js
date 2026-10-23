/**
 * PRATIKSHYA FASHION — product search for the upload surface.
 *
 * The picker on /super-admin/media/upload used to read a session cache once and
 * never again: a cold page could show an empty list, and an older product could
 * not be found at all. It now asks the catalogue endpoint the admin desk
 * already uses (`GET /admin/products`, which supports `q`, `page`, `pageSize`
 * and returns the FULL filtered `total`).
 *
 * This suite pins:
 *   · the request the adapter builds (query + paging, no invented parameters);
 *   · the response mapping the picker depends on (items + total, honest empty);
 *   · the hook's own guarantees (debounce, stale-answer discard, paging, off
 *     switch for portals with no product list);
 *   · the picker's ARIA combobox contract and its honesty about SKUs.
 *
 * No new endpoint, no new service, no new dependency.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { apiAdminListProducts } from "../src/services/api/productsApi.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SELECTOR = read("src/components/media/MediaProductSelector.jsx");
const HOOK = read("src/hooks/useAdminProductSearch.js");

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const captureFetch = (responder = () => jsonResponse({ products: [], total: 0 })) => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return responder(String(url), options);
  };
  return calls;
};

// ===========================================================================
// 1. The request
// ===========================================================================

test("the search asks the existing admin catalogue endpoint with q and paging", async () => {
  const calls = captureFetch(() =>
    jsonResponse({ products: [{ id: "PF-1", name: "Sari" }], total: 431, page: 2, pageSize: 20 })
  );

  await apiAdminListProducts({ q: "sari", page: 2, pageSize: 20, sort: "newest" });

  const url = new URL(calls[0].url, "https://frontend.invalid");
  assert.equal(url.pathname, "/api/v1/admin/products");
  assert.equal(url.searchParams.get("q"), "sari");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("pageSize"), "20");
});

test("the search never invents a query when none was typed", async () => {
  const calls = captureFetch(() => jsonResponse({ products: [], total: 0 }));
  await apiAdminListProducts({ page: 1, pageSize: 20 });
  const url = new URL(calls[0].url, "https://frontend.invalid");
  assert.equal(url.searchParams.get("q"), null);
});

test("the full filtered total is surfaced, not the length of the page", async () => {
  captureFetch(() =>
    jsonResponse({
      products: [{ id: "PF-1", name: "Sari" }, { id: "PF-2", name: "Kurta" }],
      total: 431,
    })
  );
  const result = await apiAdminListProducts({ page: 1, pageSize: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.total, 431, "the picker needs the real count to say 'showing X of Y'");
});

test("an empty result is an honest empty, not an error", async () => {
  captureFetch(() => jsonResponse({ products: [], total: 0 }));
  const result = await apiAdminListProducts({ q: "nothing-matches-this" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
});

test("a failed search surfaces the server's message so the picker can offer a retry", async () => {
  captureFetch(() => jsonResponse({ detail: "Catalogue temporarily unavailable." }, 503));
  const result = await apiAdminListProducts({ q: "sari" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Catalogue temporarily unavailable/);
});

// ===========================================================================
// 2. The hook's guarantees
// ===========================================================================

test("the hook debounces typed input before it becomes a request", () => {
  assert.match(HOOK, /useEffect\(\(\) => \{\s*const timer = setTimeout\(\(\) => setDebounced\(query\.trim\(\)\), debounceMs\);/);
  assert.match(HOOK, /return \(\) => clearTimeout\(timer\);/);
  assert.match(HOOK, /PRODUCT_SEARCH_DEBOUNCE_MS = 300/);
  assert.match(HOOK, /PRODUCT_SEARCH_PAGE_SIZE = 20/);
});

test("the hook discards a stale response rather than showing an older query's rows", () => {
  assert.match(HOOK, /const requestId = requestIdRef\.current \+ 1;/);
  assert.match(HOOK, /requestId !== requestIdRef\.current\) return;/);
  assert.match(HOOK, /mountedRef\.current = false/);
});

test("the hook pages forward and reports whether more rows exist", () => {
  assert.match(HOOK, /const loadMore = useCallback\(\(\) => \{/);
  assert.match(HOOK, /setPage\(nextPage\);/);
  assert.match(HOOK, /load\(nextPage, \{ append: true \}\);/);
  assert.match(HOOK, /const hasMore = total != null \? items\.length < total : false;/);
});

test("the hook can be switched off for portals with no product list", () => {
  assert.match(HOOK, /enabled = true/);
  assert.match(HOOK, /if \(!enabled\) return;/);
});

test("the hook reuses the existing adapter and adds no new service", () => {
  assert.match(HOOK, /import \{ apiAdminListProducts \} from "\.\.\/services\/api\/productsApi";/);
  assert.ok(!/apiClient\.(get|post)\(/.test(HOOK), "no ad-hoc HTTP in the hook");
});

// ===========================================================================
// 3. The picker
// ===========================================================================

test("the picker is a real ARIA combobox", () => {
  assert.match(SELECTOR, /role="combobox"/);
  assert.match(SELECTOR, /aria-expanded=\{isOpen\}/);
  assert.match(SELECTOR, /aria-controls=\{listboxId\}/);
  assert.match(SELECTOR, /aria-autocomplete="list"/);
  assert.match(SELECTOR, /aria-activedescendant=\{activeOptionId\}/);
  assert.match(SELECTOR, /role="listbox"/);
  assert.match(SELECTOR, /role="option"/);
  assert.match(SELECTOR, /aria-selected=\{selected\}/);
});

test("the picker handles the full keyboard set", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape", "Tab"]) {
    assert.match(SELECTOR, new RegExp(`event\\.key === "${key}"`), `${key} must be handled`);
  }
  assert.match(SELECTOR, /document\.addEventListener\("pointerdown"/, "outside click closes the list");
});

test("the picker announces its result count and offers a retry on error", () => {
  assert.match(SELECTOR, /role="status" aria-live="polite"/);
  assert.match(SELECTOR, /aria-busy=\{isLoading \|\| undefined\}/);
  assert.match(SELECTOR, /Try again/);
  assert.match(SELECTOR, /search\.retry/);
});

test("the picker states the real SKU or says it is unavailable — never a fabricated one", () => {
  assert.match(SELECTOR, /SKU unavailable/);
  assert.match(SELECTOR, /row\.sku \? \(/);
  assert.doesNotMatch(SELECTOR, /sku:\s*`?PF-/i, "no generated SKU may be displayed");
});

test("the picker shows status and warns before media is added to an archived product", () => {
  assert.match(SELECTOR, /getProductStatusLabel/);
  assert.match(SELECTOR, /selectedProduct\.status === "ARCHIVED"/);
  assert.match(SELECTOR, /will not appear on the storefront/);
});

test("the picker offers server search for admins and the register for the employee portal", () => {
  assert.match(SELECTOR, /productSource = "admin-search"/);
  assert.match(SELECTOR, /useAdminProductSearch\(\{ enabled: isServerSource \}\)/);
  assert.match(SELECTOR, /The employee portal has no catalogue list/);
});

test("the picker stays compatible with its other caller (AdminMediaProductMapping)", () => {
  assert.match(SELECTOR, /selectedProductId/);
  assert.match(SELECTOR, /onSelectProduct\?\.\(row\.id, row\)/);
  assert.match(SELECTOR, /disabled = false/);
  assert.match(SELECTOR, /error = null/);
});
