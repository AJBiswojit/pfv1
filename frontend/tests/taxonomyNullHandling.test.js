/**
 * Regression: optional taxonomy lookups must not crash when the catalog
 * snapshot is empty or the referenced category/collection is absent.
 *
 * SareeEditCarousel / BrideGroomEdit call resolveCategoryRoute("sarees")
 * (and similar ids) on first paint, before hydrateCatalog finishes — and
 * also when the backend simply has no matching ACTIVE row. The routing
 * layer must return null so the UI can skip the item, never invent an id.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTaxonomyRecord } from "../src/services/taxonomyRepository.js";
import {
  categoryHref,
  collectionHref,
  resolveCategoryRoute,
  resolveCollectionRoute,
} from "../src/services/taxonomyRouting.js";

test("normalizeTaxonomyRecord returns null for missing records instead of reading .id", () => {
  assert.equal(normalizeTaxonomyRecord(null, "category"), null);
  assert.equal(normalizeTaxonomyRecord(undefined, "category"), null);
  assert.equal(normalizeTaxonomyRecord(null, "collection"), null);
  assert.equal(normalizeTaxonomyRecord(undefined), null);
});

test("normalizeTaxonomyRecord does not invent an id for an empty object without one", () => {
  const normalized = normalizeTaxonomyRecord({ name: "Sarees", slug: "sarees", status: "ACTIVE" }, "category");
  assert.equal(normalized.id, undefined);
  assert.equal(normalized.slug, "sarees");
});

test("categoryHref and collectionHref skip null records without fabricating a route", () => {
  assert.equal(categoryHref(null), null);
  assert.equal(categoryHref(undefined), null);
  assert.equal(collectionHref(null), null);
  assert.equal(collectionHref(undefined), null);
});

test("resolveCategoryRoute returns null for a missing optional lookup", () => {
  assert.equal(resolveCategoryRoute(null), null);
  assert.equal(resolveCategoryRoute(""), null);
  assert.equal(resolveCategoryRoute("__missing-taxonomy-record__"), null);
  assert.equal(resolveCollectionRoute("__missing-taxonomy-record__"), null);
});

test("a real ACTIVE category still resolves through canonical routing", () => {
  const href = categoryHref({
    id: "sarees",
    name: "Sarees",
    slug: "sarees",
    status: "ACTIVE",
  });
  assert.equal(href, "/women/sarees");
});
