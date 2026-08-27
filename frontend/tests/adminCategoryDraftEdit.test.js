/**
 * PRATIKSHYA FASHON — Admin category edit: DRAFT records must load.
 *
 * Regression for the bug where opening
 *   /admin/categories/{id}/edit
 * on a DRAFT category rendered "Category not found." while the form was
 * still populated with default-looking values (status ACTIVE).
 *
 * Root cause pinned here: the edit desk resolved the record from the
 * STOREFRONT catalog snapshot, which is hydrated from
 *   GET /categories?status=ACTIVE
 * so DRAFT/ARCHIVED rows are structurally absent from it.
 *
 * The rules this suite locks:
 *   · There is an admin detail read (GET /admin/categories/{id}) with no
 *     status filter, and it returns the record's REAL lifecycle state.
 *   · A missing record is a real 404; a transport failure is a real error —
 *     neither is ever turned into a populated form.
 *   · Nothing defaults a category's status to ACTIVE.
 *   · The storefront list read still asks for status=ACTIVE.
 *   · The edit page never reads the ACTIVE-only snapshot (findCategory) and
 *     shows an explicit loading state before the server answers.
 */

import test, { after, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";

import {
  apiAdminGetCategory,
  apiAdminListCategories,
  apiAdminUpdateCategory,
  apiListCategories,
  buildCategoryPayload,
} from "../src/services/api/categoriesApi.js";
import taxonomyRepository from "../src/services/taxonomyRepository.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRAFT_ID = "28664436-3307-4174-87ca-21fbe3c3775b";

// ---------------------------------------------------------------------------
// Harness (same shape as the Phase 3/4/5 suites)
// ---------------------------------------------------------------------------

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mockFetch = (responder) => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = await responder(String(url), options);
    if (next instanceof Response) return next;
    return jsonResponse(next ?? {});
  };
  return calls;
};

const realFetch = globalThis.fetch;

beforeEach(() => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  window.localStorage = storage;
  window.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);
  storage.setItem("pf_admin_access_token", "admin-token-for-tests");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
  delete globalThis.localStorage;
});

// The server record used across the cases — a DRAFT category, exactly the
// shape GET /admin/categories/{id} returns.
const draftRecord = {
  id: DRAFT_ID,
  name: "Sarees",
  slug: "sarees",
  description: "",
  status: "DRAFT",
  sort_order: 100,
  featured: false,
};

const activeRecord = { ...draftRecord, id: "cat-active", name: "Kidswear", slug: "kidswear", status: "ACTIVE" };

// ---------------------------------------------------------------------------
// CASE 1 + 2 — admin detail read resolves any lifecycle status
// ---------------------------------------------------------------------------

test("CASE 1 — the admin detail read returns a DRAFT category with its real status", async () => {
  const calls = mockFetch(async (url) => {
    assert.ok(url.includes(`/admin/categories/${DRAFT_ID}`), `unexpected URL: ${url}`);
    assert.ok(!url.includes("status="), "the admin detail read must not filter by status");
    return { ok: true, category: draftRecord };
  });

  const result = await apiAdminGetCategory(DRAFT_ID);

  assert.equal(result.ok, true);
  assert.equal(result.category.id, DRAFT_ID);
  assert.equal(result.category.name, "Sarees");
  assert.equal(result.category.slug, "sarees");
  assert.equal(result.category.status, "DRAFT", "the DRAFT status survives the read verbatim");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method ?? "GET", "GET", "loading a category never writes");
});

test("CASE 2 — the admin detail read returns an ACTIVE category unchanged", async () => {
  mockFetch(async () => ({ ok: true, category: activeRecord }));
  const result = await apiAdminGetCategory(activeRecord.id);
  assert.equal(result.ok, true);
  assert.equal(result.category.status, "ACTIVE");
});

test("CASE 3 — taxonomyRepository.loadCategory feeds the edit desk the server record", async () => {
  mockFetch(async (url) => {
    assert.ok(url.includes("/admin/categories/"), "the desk loader uses the admin endpoint");
    return { ok: true, category: draftRecord };
  });

  const result = await taxonomyRepository.loadCategory(DRAFT_ID);

  assert.equal(result.ok, true);
  assert.equal(result.category.name, "Sarees");
  assert.equal(result.category.slug, "sarees");
  assert.equal(result.category.status, "DRAFT", "the form is populated from the server status, not a default");
});

// ---------------------------------------------------------------------------
// CASE 4 — storefront filtering is untouched
// ---------------------------------------------------------------------------

test("CASE 4 — the storefront list still asks for status=ACTIVE, the admin list does not", async () => {
  const calls = mockFetch(async (url) =>
    url.includes("/admin/categories")
      ? { ok: true, items: [draftRecord, activeRecord] }
      : { items: [activeRecord] });

  const storefront = await apiListCategories();
  const adminList = await apiAdminListCategories();

  assert.match(calls[0].url, /\/categories\?status=ACTIVE/, "storefront discovery keeps its ACTIVE filter");
  assert.deepEqual(storefront.items.map((c) => c.status), ["ACTIVE"], "no DRAFT leaks into the storefront list");
  assert.ok(!calls[1].url.includes("status="), "the admin list is unfiltered by default");
  assert.deepEqual(adminList.items.map((c) => c.status).sort(), ["ACTIVE", "DRAFT"]);
});

// ---------------------------------------------------------------------------
// CASE 5 — no silent promotion to ACTIVE
// ---------------------------------------------------------------------------

test("CASE 5 — a category with no status is never defaulted to ACTIVE", async () => {
  mockFetch(async () => ({ ok: true, category: { id: "cat-x", name: "X", slug: "x" } }));
  const result = await apiAdminGetCategory("cat-x");
  assert.equal(result.ok, true);
  assert.notEqual(result.category.status, "ACTIVE", "a missing status must not masquerade as ACTIVE");
  assert.ok(!result.category.status, "an absent lifecycle state stays absent");
});

test("CASE 5b — loading a DRAFT category issues no write and no activation call", async () => {
  const calls = mockFetch(async () => ({ ok: true, category: draftRecord }));
  await taxonomyRepository.loadCategory(DRAFT_ID);
  const writes = calls.filter((c) => (c.options.method ?? "GET") !== "GET");
  assert.equal(writes.length, 0, "opening the edit page must never mutate the record");
  assert.ok(!calls.some((c) => c.url.includes("/activate")), "no implicit DRAFT → ACTIVE promotion");
});

// ---------------------------------------------------------------------------
// CASE 6 + 7 — honest failure states
// ---------------------------------------------------------------------------

test("CASE 6 — an unknown category id produces a real 404, not a blank record", async () => {
  mockFetch(async () => jsonResponse({ ok: false, error: { message: "Category 'nope' not found." } }, 404));
  const result = await taxonomyRepository.loadCategory("nope");
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.category, undefined, "no fabricated category travels with a 404");
});

test("CASE 7 — a transport failure surfaces as an error, never as a populated form", async () => {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  const result = await taxonomyRepository.loadCategory(DRAFT_ID);
  assert.equal(result.ok, false);
  assert.notEqual(result.status, 404, "a network failure must not be reported as not-found");
  assert.equal(result.category, undefined);
});

// ---------------------------------------------------------------------------
// Source contract — the edit desk cannot regress to the ACTIVE-only snapshot
// ---------------------------------------------------------------------------

test("the admin category desks load from the server, never from the ACTIVE-only snapshot", () => {
  const form = readFileSync(join(ROOT, "src/pages/admin/taxonomy/AdminCategoryForm.jsx"), "utf8");
  const detail = readFileSync(join(ROOT, "src/pages/admin/taxonomy/AdminCategoryDetail.jsx"), "utf8");

  for (const [name, source] of [["edit form", form], ["detail desk", detail]]) {
    assert.doesNotMatch(source, /taxonomyRepository\.findCategory\(/, `${name} must not read the ACTIVE-only snapshot`);
    assert.match(source, /taxonomyRepository\.loadCategory\(/, `${name} loads through the admin detail read`);
    assert.match(source, /Loading category/, `${name} shows an explicit loading state`);
    assert.match(source, /Number\(result\.status\) === 404/, `${name} says "not found" only for a real 404`);
  }
  assert.doesNotMatch(form, /Sarees/, "no hardcoded category name in the edit desk");
  assert.doesNotMatch(form, /status:\s*TAXONOMY_STATUS\.ACTIVE/, "the edit draft never defaults to ACTIVE");
});

// ---------------------------------------------------------------------------
// Render contract — first paint is "loading", not "not found" + fake values
// ---------------------------------------------------------------------------

let vite;
let AdminCategoryForm;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  AdminCategoryForm = (await vite.ssrLoadModule("/src/pages/admin/taxonomy/AdminCategoryForm.jsx")).default;
});

after(async () => { await vite?.close(); });

test("the edit page's first paint is a loading state — no not-found, no fabricated values", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      StaticRouter,
      { location: `/admin/categories/${DRAFT_ID}/edit` },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/admin/categories/:categoryId/edit",
          element: React.createElement(AdminCategoryForm),
        }),
      ),
    ),
  );

  assert.match(html, /Loading category/, "the desk reports that it is loading");
  assert.doesNotMatch(html, /Category not found/, "not-found is never shown before the server answered");
  assert.doesNotMatch(html, /<form/, "no form — and therefore no fake values — while the record is unknown");
  assert.doesNotMatch(html, /ACTIVE/, "no invented lifecycle state is rendered");
});

// ---------------------------------------------------------------------------
// Saving a DRAFT category — the write must actually reach the columns
// ---------------------------------------------------------------------------

test("the admin write maps the desk draft onto the columns the API accepts", () => {
  const payload = buildCategoryPayload({
    name: "Sarees",
    slug: "sarees",
    sortOrder: "40",
    bannerMediaId: "med-1",
    seoTitle: "Sarees",
    seoDescription: "House sarees",
    featured: true,
    status: "DRAFT",
  });

  assert.equal(payload.sort_order, 40, "sortOrder reaches sort_order (it used to be dropped)");
  assert.equal(payload.banner_media_id, "med-1");
  assert.equal(payload.seo_title, "Sarees");
  assert.equal(payload.seo_description, "House sarees");
  assert.equal(payload.featured, true);
  assert.ok(!("status" in payload), "lifecycle is not a field write — activate/archive own it");
  assert.ok(!("sortOrder" in payload) && !("bannerMediaId" in payload), "no camelCase keys leak to the API");
});

test("saving an edited DRAFT category PATCHes it without touching its status", async () => {
  const calls = mockFetch(async () => ({ ok: true, category: { ...draftRecord, name: "Sarees & Drapes" } }));

  const result = await apiAdminUpdateCategory(DRAFT_ID, {
    name: "Sarees & Drapes",
    slug: "sarees",
    sortOrder: 40,
    status: "DRAFT",
  });

  assert.equal(result.ok, true);
  assert.equal(result.category.status, "DRAFT", "the record stays DRAFT after an edit");
  assert.equal(calls[0].options.method, "PATCH");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.name, "Sarees & Drapes");
  assert.equal(body.sort_order, 40);
  assert.ok(!("status" in body), "a save never promotes DRAFT → ACTIVE");
});

test("the edit desk exposes the real status read-only plus the server's lifecycle transitions", () => {
  const form = readFileSync(join(ROOT, "src/pages/admin/taxonomy/AdminCategoryForm.jsx"), "utf8");
  assert.doesNotMatch(form, /<select[^>]*value=\{draft\.status\}/, "status is not an editable form field");
  assert.match(form, /existing\.status/, "the desk renders the status the server returned");
  assert.match(form, /taxonomyRepository\.activateCategory/, "DRAFT → ACTIVE goes through the activate endpoint");
  assert.match(form, /taxonomyRepository\.archiveCategory/);
});

test("CASE 3b — the edit form draft is built from the server record, with nothing invented", async () => {
  const { draftFromCategory } = await vite.ssrLoadModule("/src/pages/admin/taxonomy/AdminCategoryForm.jsx");
  mockFetch(async () => ({ ok: true, category: draftRecord }));

  const loaded = await taxonomyRepository.loadCategory(DRAFT_ID);
  const draft = draftFromCategory(loaded.category);

  assert.equal(draft.name, "Sarees", "Name = the server name");
  assert.equal(draft.slug, "sarees", "Slug = the server slug");
  assert.equal(loaded.category.status, "DRAFT", "Status = DRAFT, exactly as stored");
  assert.ok(!("status" in draft), "status is not an editable draft field");
  assert.equal(draft.sortOrder, 100);
  assert.equal(draft.featured, false);
});
