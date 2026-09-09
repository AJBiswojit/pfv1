/**
 * Navigation editorial QA — MegaMenu plates from the live register.
 *
 * An empty plate is valid when nothing is eligible. An unrelated department's
 * photograph must never be borrowed. Node stubs Vite `import.meta.glob`.
 */

import { installQaShims, publishViaWorkflow } from "./qa-harness.mjs";

installQaShims();

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { primaryNavigation } from "../src/config/navigationConfig.js";
import MegaMenu from "../src/components/shell/MegaMenu.jsx";
import {
  resolveNavigationEditorialImage,
  resetNavigationEditorialCache,
} from "../src/services/media/navigationEditorialMedia.js";
import { commands } from "../src/services/workflow/productWorkflowCommands.js";
import { setupCanonicalState, FIXTURE_IDS } from "../tests/helpers/workflowTestState.js";
import { getLiveStorefrontProducts } from "../src/data/products/index.js";

const failures = [];
const check = (label, condition) => {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
};

const renderMenu = () =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/"] },
      createElement(MegaMenu, { id: "qa-megamenu", group: primaryNavigation[0], onNavigate() {} })
    )
  );

const departmentOf = (src) => {
  const match = String(src || "").match(/\/images\/products\/([^/]+)\//);
  return match ? match[1] : null;
};

console.log("# NAVIGATION EDITORIAL QA\n");

setupCanonicalState();
resetNavigationEditorialCache();

const draftPlates = primaryNavigation.map((group) => ({
  id: group.id,
  plate: resolveNavigationEditorialImage(group),
}));
check(
  "DRAFT fixtures do not become shoppable navigation plates",
  draftPlates.every((entry) => entry.plate?.source !== "PUBLISHED_PRODUCT_MEDIA")
);

publishViaWorkflow(commands, FIXTURE_IDS.COTTON);
publishViaWorkflow(commands, FIXTURE_IDS.LEHENGA);
publishViaWorkflow(commands, FIXTURE_IDS.KIDS);
resetNavigationEditorialCache();

const live = getLiveStorefrontProducts();
check("published fixtures are live before editorial resolution", live.length === 3);

const used = new Map();
for (const group of primaryNavigation) {
  const plate = resolveNavigationEditorialImage(group);
  if (!plate) {
    check(`${group.id} may keep an empty plate when nothing is eligible`, true);
    continue;
  }
  const owner = plate.departmentId || plate.collectionId || group.id;
  const folder = departmentOf(plate.src);
  if (folder && ["women", "men", "bridal", "kids"].includes(folder)) {
    check(`${group.id} plate stays inside its own department folder`, folder === group.id || group.id === "collections");
  }
  if (used.has(plate.src)) {
    check(`${group.id} does not reuse ${used.get(plate.src)}'s plate`, false);
  } else {
    used.set(plate.src, group.id);
    check(`${group.id} plate is unique among menus that have one`, true);
  }
  void owner;
}

try {
  const html = renderMenu();
  check("MegaMenu renders under the Node QA loader", html.length > 0);
  check("MegaMenu still lists department destinations", /women|kids|bridal|men/i.test(html));
} catch (error) {
  check(`MegaMenu renders (${error.message})`, false);
}

setupCanonicalState();
resetNavigationEditorialCache();
console.log(`\nRESULT: ${failures.length ? "FAIL" : "PASS"} — ${failures.length} violation(s).`);
if (failures.length) process.exitCode = 1;
