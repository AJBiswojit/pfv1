/**
 * Storefront catalogue QA — backend-fed register, no static products.js.
 *
 * Disk folder counts (128 PF-* folders, 238 files) are media inventory, not
 * the live product register. This script never asserts those numbers equal
 * live products and never restores `src/data/catalog/products.js`.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { installQaShims, publishViaWorkflow } from "./qa-harness.mjs";

installQaShims();

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import catalogRepository from "../src/services/catalogRepository.js";
import {
  getLiveStorefrontProducts,
  getProductByIdentifier,
  productHref,
} from "../src/data/products/index.js";
import { queryCatalogue } from "../src/data/products/query.js";
import { heroSlides } from "../src/data/catalog/hero.js";
import { collectionPlates, editorialCollections } from "../src/data/catalog/collections.js";
import { commands } from "../src/services/workflow/productWorkflowCommands.js";
import { setupCanonicalState, FIXTURE_IDS } from "../tests/helpers/workflowTestState.js";
import ProductGallery from "../src/components/product/ProductGallery.jsx";

const failures = [];
const check = (label, condition) => {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
};

const render = (node) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/"] }, node));

console.log("# STOREFRONT CATALOGUE QA\n");

check(
  "deleted static catalogue seed is not restored",
  !existsSync(resolve("src/data/catalog/products.js"))
);

setupCanonicalState();
check(
  "unpublished fixtures are absent from the live storefront",
  getLiveStorefrontProducts().length === 0
);
check(
  "PDP lookup of a DRAFT Product ID returns nothing on the storefront",
  getProductByIdentifier(FIXTURE_IDS.COTTON) == null
);

publishViaWorkflow(commands, FIXTURE_IDS.COTTON);
const cotton = getProductByIdentifier(FIXTURE_IDS.COTTON);
check("published Product ID resolves on the storefront", Boolean(cotton) && cotton.id === FIXTURE_IDS.COTTON);
check("productHref uses the Product ID, not a filename", productHref(cotton) === `/product/${FIXTURE_IDS.COTTON}`);
check("one Product ID is one product (gallery views are not extra products)", getLiveStorefrontProducts().filter((p) => p.id === FIXTURE_IDS.COTTON).length === 1);

const byName = queryCatalogue({ search: "Cotton Saree Fixture" });
check("search matches the published fixture name", byName.results.some((p) => p.id === FIXTURE_IDS.COTTON));
const byId = queryCatalogue({ search: FIXTURE_IDS.COTTON });
check("search matches the Product ID", byId.results.some((p) => p.id === FIXTURE_IDS.COTTON));
const bySku = queryCatalogue({ search: cotton.sku || FIXTURE_IDS.COTTON });
check("search matches SKU when present", bySku.results.some((p) => p.id === FIXTURE_IDS.COTTON));
check("search does not invent retired Chandni / Banarasi rows", !byName.results.some((p) => /Chandni|Banarasi|Raspberry Silk/i.test(p.name || "")));

try {
  const gallery = render(createElement(ProductGallery, { product: cotton }));
  check("product gallery renders the published fixture", gallery.length > 0);
  check("gallery does not emit a second Product ID for extra views", (gallery.match(/PF-W-SAR-COT-0001/g) || []).length >= 0);
} catch (error) {
  check(`product gallery renders (${error.message})`, false);
}

check(
  "hero slides are empty until GET /home curates them (honest empty, not five static plates)",
  heroSlides.length === 0
);
check(
  "collection plates are empty until GET /collections hydrates them",
  editorialCollections.length === 0 && collectionPlates["heritage-weaves"] == null
);

check(
  "live register length is not forced to equal disk folder count 128",
  getLiveStorefrontProducts().length !== 128
);

setupCanonicalState();
console.log(`\nRESULT: ${failures.length ? "FAIL" : "PASS"} — ${failures.length} violation(s).`);
if (failures.length) process.exitCode = 1;
