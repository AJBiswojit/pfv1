/**
 * Department listing QA — Aarna route + navigation scope + query engine.
 *
 * Aarna department listings are GET /products-backed. Without a backend the
 * React page is empty/error; that is honest. This script does not persist
 * PUBLISHED without workflow, and does not require 128 live products.
 */

import { installQaShims, publishViaWorkflow } from "./qa-harness.mjs";

installQaShims();

import { readFileSync } from "node:fs";

import { departments } from "../src/data/catalog/taxonomy.js";
import { resolveNavigationScope } from "../src/data/products/taxonomy.js";
import { queryCatalogue } from "../src/data/products/query.js";
import { getLiveStorefrontProducts } from "../src/data/products/index.js";
import catalogRepository from "../src/services/catalogRepository.js";
import { commands } from "../src/services/workflow/productWorkflowCommands.js";
import { setupCanonicalState, FIXTURE_IDS } from "../tests/helpers/workflowTestState.js";

const failures = [];
const check = (label, condition) => {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
};



console.log("# DEPARTMENT LISTINGS QA\n");

setupCanonicalState();
publishViaWorkflow(commands, FIXTURE_IDS.COTTON);
publishViaWorkflow(commands, FIXTURE_IDS.LEHENGA);
publishViaWorkflow(commands, FIXTURE_IDS.KIDS);

const live = getLiveStorefrontProducts();
check("workflow-published fixtures are the live storefront (not a persisted PUBLISHED shortcut)", live.length === 3);
check("Kids is a department, not a side catalogue", catalogRepository.find(FIXTURE_IDS.KIDS)?.department === "kids");

for (const department of departments) {
  const scope = resolveNavigationScope(`/${department.id}`);
  check(`/${department.id} resolves a navigation scope`, Boolean(scope?.filters?.department === department.id || scope?.filters));
}

const women = queryCatalogue({ scopeFilters: { department: "women" } });
const kids = queryCatalogue({ scopeFilters: { department: "kids" } });
const men = queryCatalogue({ scopeFilters: { department: "men" } });
const bridal = queryCatalogue({ scopeFilters: { department: "bridal" } });

check("women listing is only women fixtures", women.results.length === 2 && women.results.every((p) => p.department === "women"));
check("kids listing is only the Kids fixture", kids.results.length === 1 && kids.results[0].id === FIXTURE_IDS.KIDS);
check("men listing is honestly empty (no invented menswear)", men.results.length === 0);
check("bridal listing is honestly empty (no invented bridal products)", bridal.results.length === 0);
check(
  "department totals sum to the live register",
  women.total + kids.total + men.total + bridal.total === live.length
);

const collections = queryCatalogue({ scopeFilters: { curated: true } });
check(
  "collections is a curation, not a second copy of the catalogue",
  collections.total < live.length || live.length === 0
);

const sarees = queryCatalogue({ scopeFilters: { department: "women", category: "sarees" } });
check("sarees subcategory listing is only the cotton fixture", sarees.results.length === 1 && sarees.results[0].id === FIXTURE_IDS.COTTON);

const storefrontRoutes = readFileSync(new URL("../src/components/aarna/AarnaStorefront.jsx", import.meta.url), "utf8");
const listingPage = readFileSync(new URL("../src/components/aarna/pages/Shop.jsx", import.meta.url), "utf8");
check("Aarna owns the shop and department listing route", storefrontRoutes.includes('<Route path="shop" element={<Shop mode="shop" />} />') && storefrontRoutes.includes('<Route path="*" element={<Shop mode="navigation" />} />'));
check("Aarna listings use the shared live catalogue query", listingPage.includes("useCatalogueQuery") && listingPage.includes("useCatalog()"));
check("Aarna listings do not show not-found copy for a valid scope", !/is no longer in the collection/i.test(listingPage));

setupCanonicalState();
console.log(`\nRESULT: ${failures.length ? "FAIL" : "PASS"} — ${failures.length} violation(s).`);
if (failures.length) process.exitCode = 1;
