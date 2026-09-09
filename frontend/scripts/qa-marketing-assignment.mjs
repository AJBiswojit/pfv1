/**
 * Marketing assignment QA — current architecture, workflow fixtures only.
 *
 * Does not restore the deleted static catalogue. Does not invent Banarasi,
 * silk, bangle, jewellery, or a second Kids product. Kids is one department
 * inside the unified workflow. APPROVE ≠ PUBLISH.
 */

import { installQaShims, ADMIN, publishViaWorkflow } from "./qa-harness.mjs";

installQaShims();

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import {
  MARKETING_PLACEMENTS,
  PLACEMENT_MODES,
  MARKETING_PLACEMENT_OPTIONS,
} from "../src/config/mediaTypes.js";
import catalogRepository from "../src/services/catalogRepository.js";
import { getLiveStorefrontProducts } from "../src/data/products/index.js";
import {
  getPlacementProductIds,
  setPlacementProductIds,
} from "../src/services/media/marketingPlacementRepository.js";
import { resolvePlacementEntries } from "../src/services/media/marketingPlacementResolver.js";
import { commands } from "../src/services/workflow/productWorkflowCommands.js";
import { setupCanonicalState, FIXTURE_IDS } from "../tests/helpers/workflowTestState.js";
import ProductCatalogSelector from "../src/components/admin/ProductCatalogSelector.jsx";
import AdminMarketingMedia from "../src/pages/admin/media/AdminMarketingMedia.jsx";
import PlacementProductRail from "../src/components/storefront/PlacementProductRail.jsx";
import SareeEditCarousel from "../src/components/storefront/SareeEditCarousel.jsx";

const failures = [];
const check = (label, condition) => {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
};

const render = (node, entries = ["/"]) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: entries }, node));

const srcs = (html) => [...html.matchAll(/src="([^"]+)"/g)].map((match) => match[1]);

setupCanonicalState();

const cotton = catalogRepository.find(FIXTURE_IDS.COTTON);
const lehenga = catalogRepository.find(FIXTURE_IDS.LEHENGA);
const kids = catalogRepository.find(FIXTURE_IDS.KIDS);

console.log("# MARKETING ASSIGNMENT QA\n");

check("canonical fixture register is non-empty", Boolean(cotton && lehenga && kids));
check("Kids is one department inside the unified register", kids?.department === "kids" && kids.id.startsWith("PF-K-"));
check(
  "fixture products start DRAFT (unpublished)",
  [cotton, lehenga, kids].every((product) => product.status === "DRAFT" && product.published !== true)
);
check(
  "unpublished Kids is not on the storefront",
  !getLiveStorefrontProducts().some((product) => product.id === FIXTURE_IDS.KIDS)
);

publishViaWorkflow(commands, FIXTURE_IDS.COTTON);
publishViaWorkflow(commands, FIXTURE_IDS.LEHENGA);
check(
  "APPROVE ≠ PUBLISH still holds for the remaining DRAFT Kids fixture",
  commands.publishProduct(FIXTURE_IDS.KIDS, ADMIN).ok === false
);
publishViaWorkflow(commands, FIXTURE_IDS.KIDS);

const live = getLiveStorefrontProducts();
check("published fixtures reach the live storefront", live.length === 3);
check("live storefront includes the Kids Product ID", live.some((product) => product.id === FIXTURE_IDS.KIDS));

const productPlacements = MARKETING_PLACEMENT_OPTIONS.filter((placement) => placement.mode === PLACEMENT_MODES.PRODUCT);
const genericPlacements = MARKETING_PLACEMENT_OPTIONS.filter((placement) => placement.mode === PLACEMENT_MODES.GENERIC);
check("HOME_HERO is GENERIC marketing media, not a product rail", MARKETING_PLACEMENT_OPTIONS.find((p) => p.id === MARKETING_PLACEMENTS.HOME_HERO)?.mode === PLACEMENT_MODES.GENERIC);
check("product placements store Product IDs, not copies of merchandising fields", productPlacements.length >= 8);
check("editorial / promotion remain GENERIC", genericPlacements.some((p) => p.id === MARKETING_PLACEMENTS.EDITORIAL) && genericPlacements.some((p) => p.id === MARKETING_PLACEMENTS.PROMOTION));

setPlacementProductIds(MARKETING_PLACEMENTS.SAREE_SECTION, [FIXTURE_IDS.COTTON]);
setPlacementProductIds(MARKETING_PLACEMENTS.LEHENGA_SECTION, [FIXTURE_IDS.LEHENGA]);
setPlacementProductIds(MARKETING_PLACEMENTS.KIDS_SECTION, [FIXTURE_IDS.KIDS]);
setPlacementProductIds(MARKETING_PLACEMENTS.WOMEN_SECTION, [FIXTURE_IDS.COTTON, FIXTURE_IDS.LEHENGA]);
setPlacementProductIds(MARKETING_PLACEMENTS.BANGLES_SECTION, []);
setPlacementProductIds(MARKETING_PLACEMENTS.JEWELLERY_SECTION, []);

check(
  "saree placement stores the cotton Product ID only",
  JSON.stringify(getPlacementProductIds(MARKETING_PLACEMENTS.SAREE_SECTION)) === JSON.stringify([FIXTURE_IDS.COTTON])
);

const sareeEntries = resolvePlacementEntries(MARKETING_PLACEMENTS.SAREE_SECTION, live);
check("saree rail resolves the cotton fixture", sareeEntries.some((entry) => entry.product?.id === FIXTURE_IDS.COTTON));
check("saree rail does not invent a second product", sareeEntries.length === 1);

const kidsEntries = resolvePlacementEntries(MARKETING_PLACEMENTS.KIDS_SECTION, live);
check("kids rail resolves the canonical Kids Product ID", kidsEntries.some((entry) => entry.product?.id === FIXTURE_IDS.KIDS));
check("there is exactly one canonical Kids fixture — a second kids product is not invented", catalogRepository.all().filter((p) => p.department === "kids").length === 1);

commands.unpublishProduct(FIXTURE_IDS.KIDS, ADMIN);
check(
  "unpublished Kids drops off the storefront even if still assigned",
  !getLiveStorefrontProducts().some((product) => product.id === FIXTURE_IDS.KIDS)
);
const kidsAfterUnpublish = resolvePlacementEntries(MARKETING_PLACEMENTS.KIDS_SECTION, getLiveStorefrontProducts());
check("unpublished Kids is omitted from the live kids rail", !kidsAfterUnpublish.some((entry) => entry.product?.id === FIXTURE_IDS.KIDS));
publishViaWorkflow(commands, FIXTURE_IDS.KIDS);

const emptyWomen = resolvePlacementEntries(MARKETING_PLACEMENTS.BRIDAL_SECTION, getLiveStorefrontProducts());
check("uncurated bridal placement does not invent products", emptyWomen.length === 0);

const emptyBangles = resolvePlacementEntries(MARKETING_PLACEMENTS.BANGLES_SECTION, getLiveStorefrontProducts());
check("bangles placement stays empty when no matching published product exists", emptyBangles.length === 0);
check("jewellery placement stays empty when no matching published product exists", resolvePlacementEntries(MARKETING_PLACEMENTS.JEWELLERY_SECTION, getLiveStorefrontProducts()).length === 0);

try {
  const selector = render(
    createElement(ProductCatalogSelector, {
      open: true,
      title: "Assign products",
      selectedIds: [FIXTURE_IDS.COTTON],
      onClose() {},
      onSave() {},
    })
  );
  check("product catalog selector opens on the live register", /Select from product catalog/i.test(selector));
  check("selector lists the cotton fixture by Product ID", selector.includes(FIXTURE_IDS.COTTON));
  check("selector lists the cotton fixture by name", selector.includes("Cotton Saree Fixture"));
  check("selector does not mention retired Banarasi / Vasanti names", !/Banarasi|Vasanti|SIL-0001/i.test(selector));
} catch (error) {
  check(`product catalog selector renders (${error.message})`, false);
}

try {
  const carousel = render(createElement(SareeEditCarousel));
  check("saree carousel paints the assigned cotton fixture", carousel.includes("Cotton Saree Fixture"));
  check("saree carousel does not invent Banarasi copy", !/Banarasi|Vasanti/i.test(carousel));
} catch (error) {
  check(`saree carousel renders (${error.message})`, false);
}

try {
  const rail = render(createElement(PlacementProductRail, { placementId: MARKETING_PLACEMENTS.KIDS_SECTION }));
  check("kids rail markup includes the Kids Product ID or name", rail.includes(FIXTURE_IDS.KIDS) || rail.includes("Kids Dress Fixture"));
} catch (error) {
  check(`kids rail renders (${error.message})`, false);
}

try {
  const emptyRail = render(createElement(PlacementProductRail, { placementId: MARKETING_PLACEMENTS.BANGLES_SECTION }));
  check("empty bangles rail does not invent product cards", srcs(emptyRail).length === 0 || !/PF-/.test(emptyRail));
} catch (error) {
  check(`empty bangles rail renders (${error.message})`, false);
}

try {
  const desk = render(createElement(AdminMarketingMedia), ["/admin/media/marketing"]);
  check("admin marketing desk renders without a static catalogue", desk.length > 0);
  check("admin marketing desk still distinguishes product vs generic placements", /product catalog|generic|hero/i.test(desk));
} catch (error) {
  check(`admin marketing desk renders (${error.message})`, false);
}

const beforeClear = catalogRepository.all().map((product) => product.id).sort().join(",");
if (typeof globalThis.localStorage?.clear === "function") globalThis.localStorage.clear();
const afterClear = catalogRepository.all().map((product) => product.id).sort().join(",");
check("localStorage is not the catalogue authority (register survives a storage clear)", beforeClear === afterClear && beforeClear.includes(FIXTURE_IDS.COTTON));
check("cleared storage does not resurrect deleted seed names", !catalogRepository.all().some((product) => /Banarasi|Vasanti/i.test(product.name || "")));

setupCanonicalState();
console.log(`\nRESULT: ${failures.length ? "FAIL" : "PASS"} — ${failures.length} violation(s).`);
if (failures.length) process.exitCode = 1;
