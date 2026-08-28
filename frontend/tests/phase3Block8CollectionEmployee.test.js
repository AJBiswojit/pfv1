/**
 * Phase 3 Block 8 — collection and employee product contracts.
 *
 * The tests exercise the real API seam with mocked fetch and static guards for
 * the React/editor paths because this package intentionally has no DOM runner.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildAdminProductPayload,
  apiAdminAssignEmployee,
  apiEmployeeGetProduct,
} from "../src/services/api/productsApi.js";
import { apiAdminAssignCollectionProducts } from "../src/services/api/collectionsApi.js";
import { pickEmployeeEditableFields } from "../src/services/workflow/employeeEditableFields.js";
import { setTokens } from "../src/services/api/apiClient.js";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

let previousFetch;
let previousStorage;

beforeEach(() => {
  previousFetch = globalThis.fetch;
  previousStorage = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage();
  setTokens({ accessToken: "admin-jwt", refreshToken: "admin-refresh" }, "admin");
});

afterEach(() => {
  globalThis.fetch = previousFetch;
  globalThis.localStorage = previousStorage;
});

test("product writes do not carry collection membership, while authored media remains valid", () => {
  const payload = buildAdminProductPayload({
    name: "Banarasi Saree",
    collection: "Legacy label",
    collections: ["Legacy label"],
    image: "authored-cover.jpg",
    hoverImage: "authored-hover.jpg",
    additionalImages: ["authored-gallery.jpg"],
    mediaIds: ["registered-media"],
    primaryMediaId: "registered-media",
    galleryMediaIds: ["registered-media-2"],
  });
  assert.equal("collection" in payload, false);
  assert.equal("collections" in payload, false);
  assert.equal(payload.image, "authored-cover.jpg");
  assert.deepEqual(payload.additionalImages, ["authored-gallery.jpg"]);
  for (const key of ["mediaIds", "primaryMediaId", "galleryMediaIds"]) {
    assert.equal(key in payload, false, `${key} remains R5 Stage 1 read-only`);
  }
});

test("employee payload filtering preserves canonical writable fields and rejects collection ownership locally", () => {
  const payload = pickEmployeeEditableFields({
    name: "Updated",
    category: "cat-1",
    collectionIds: ["col-1"],
    collections: ["Editorial"],
    status: "PUBLISHED",
    mediaIds: ["media-1"],
  });
  assert.deepEqual(payload, { name: "Updated", category: "cat-1" });
});

test("collection assignment uses the admin scope and canonical productIds body", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ collection: { id: "col-1", explicitProductIds: ["P-1"] } });
  };
  const result = await apiAdminAssignCollectionProducts("col-1", ["P-1", "P-2"]);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/admin\/collections\/col-1\/products$/);
  assert.equal(calls[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].options.body), { productIds: ["P-1", "P-2"] });
  assert.equal(calls[0].options.headers.Authorization, "Bearer admin-jwt");
});

test("collection assignment failure stays a failure and preserves canonical status/details", async () => {
  globalThis.fetch = async () => jsonResponse({
    success: false,
    error: {
      code: "BUSINESS_RULE_VIOLATION",
      message: "Unknown product(s): UNKNOWN.",
      details: { field: "productIds", unknown: ["UNKNOWN"] },
    },
  }, 422);
  const result = await apiAdminAssignCollectionProducts("col-1", ["UNKNOWN"]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "BUSINESS_RULE_VIOLATION");
  assert.deepEqual(result.details, { field: "productIds", unknown: ["UNKNOWN"] });
  assert.match(result.error, /Unknown product/);
});

test("employee product read and employee assignment use separate explicit scopes", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/employee/products/")) {
      return jsonResponse({ product: {
        id: "P-1", name: "Assigned Saree", status: "DRAFT", assignedEmployeeId: "EMP-1",
      } });
    }
    return jsonResponse({ product: { id: "P-1", assignedEmployeeId: "EMP-1" } });
  };
  const employeeRead = await apiEmployeeGetProduct("P-1");
  assert.equal(employeeRead.ok, true);
  assert.equal(calls[0].options.headers.Authorization, undefined);

  // Swap only the employee token before the employee-scoped write.
  setTokens({ accessToken: "employee-jwt", refreshToken: "employee-refresh" }, "employee");
  const assignment = await apiAdminAssignEmployee("P-1", "EMP-2");
  assert.equal(assignment.ok, true);
  assert.equal(calls[1].options.headers.Authorization, "Bearer admin-jwt");
  assert.match(calls[1].url, /\/admin\/products\/P-1\/assign$/);
});

test("STATIC: employee route names the safe projection and does not use AdminProduct", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../backend/app/api/v1/products.py", import.meta.url)),
    "utf8",
  );
  const getStart = source.indexOf('"/employee/products/{id}"');
  const patchStart = source.indexOf("@router.patch", getStart);
  const nextRoute = source.indexOf("@router.", patchStart + 1);
  const route = source.slice(getStart, patchStart);
  const patch = source.slice(patchStart, nextRoute);
  assert.match(route, /SingleEmployeeProductResponse/);
  assert.doesNotMatch(route, /get_admin_product/);
  assert.match(patch, /response_model=SingleEmployeeProductResponse/);
});

test("STATIC: collection detail does not render backend-absent SEO fields", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/pages/admin/taxonomy/AdminCollectionDetail.jsx", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(source, /collection\.seo(?:Title|Description)/);
  assert.match(source, /taxonomyRepository\.isProductInCollection\(product, collection\?\.id, collection\)/);
  const taxonomy = readFileSync(
    fileURLToPath(new URL("../src/services/taxonomyRepository.js", import.meta.url)),
    "utf8",
  );
  assert.match(taxonomy, /authoritativeCollection = null/);
  assert.match(taxonomy, /authoritativeCollection \?\? taxonomyRepository\.findCollection/);
});

test("STATIC: collection form sends only fields owned by CollectionCreate/UpdateRequest", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/pages/admin/taxonomy/AdminCollectionForm.jsx", import.meta.url)),
    "utf8",
  );
  const payload = source.slice(source.indexOf("const payload ="), source.indexOf("setSaving", source.indexOf("const payload =")));
  for (const forbidden of ["shortDescription", "seoTitle", "seoDescription", "status:"]) {
    assert.doesNotMatch(payload, new RegExp(`\\b${forbidden.replace(":", "")}\\s*:`));
  }
  assert.match(payload, /heroMediaId/);
  assert.match(payload, /startDate/);
  assert.match(payload, /endDate/);
});
