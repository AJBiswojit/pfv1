/**
 * PRATIKSHYA FASHION — Batch 6: media registry labels and terminology.
 *
 * Batch 6 changes wording only. These tests pin exactly that:
 *
 *   · the media-library header reads "Homepage Content" (same destination) and
 *     "Upload Product Media" (same destination, still permission-gated);
 *   · the upload page is titled "Upload Product Media" and describes product
 *     images only — no video promise, no Product/Marketing destination switch;
 *   · the shared upload form no longer claims marketing has "no backend API
 *     yet"; the copy now points at the placement panel and says marketing art
 *     is never auto-promoted. Its marketing branch and defaults are untouched,
 *     because other portals still use them;
 *   · the six server-backed tabs, their filters, the eight summary cards, the
 *     permission gate and the placement panel are unchanged by this batch;
 *   · the Homepage Content page still calls itself "Homepage Content Control
 *     Center".
 *
 * No renderer exists in this harness, so component wording is asserted against
 * the real source files (`STATIC:`), as in the other admin suites.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  MEDIA_REGISTRY_TABS,
  buildMediaCardModels,
  buildMediaListParams,
} from "../src/services/admin/mediaRegistryView.js";
import { resolveMediaAccess } from "../src/services/media/mediaAccess.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const LIBRARY = "src/pages/admin/media/AdminMediaLibrary.jsx";
const UPLOAD = "src/pages/admin/media/AdminMediaUpload.jsx";
const FORM = "src/components/media/MediaUploadForm.jsx";
const HOMEPAGE = "src/pages/admin/media/AdminMarketingMedia.jsx";

// ===========================================================================
// 1. Media-library header
// ===========================================================================

test("the header link reads Homepage Content and keeps its destination", () => {
  const source = read(LIBRARY);

  assert.match(source, /to=\{`\$\{prefix\}\/media\/marketing`\}/, "destination unchanged");
  assert.match(source, />\s*Homepage Content\s*</);
  assert.doesNotMatch(source, />\s*Marketing Media\s*</, "the old desk name is gone from the header");
});

test("the header button reads Upload Product Media and keeps its destination", () => {
  const source = read(LIBRARY);

  assert.match(source, /to=\{`\$\{prefix\}\/media\/upload`\}/, "destination unchanged");
  assert.match(source, /Upload Product Media/);
  assert.doesNotMatch(source, />\s*\+ Upload Media\s*</, "the old label is gone");
});

test("the upload button is still permission-gated", () => {
  const source = read(LIBRARY);
  const gate = source.slice(source.indexOf("{mediaAccess.canUpload ? ("));

  assert.match(gate, /Upload Product Media/, "the header control is inside its gate");
  // Batch 7 wrapped the placement panel in a disclosure; the gate still owns it.
  assert.equal(
    (source.match(/\{mediaAccess\.canUpload \? \(/g) || []).length,
    2,
    "one gate for the header control, one for the placement panel"
  );
  assert.match(
    source,
    /\{mediaAccess\.canUpload \? \(\s*<section[\s\S]{0,1200}<PlacementAssetPanel/,
    "placement panel still gated"
  );

  assert.equal(resolveMediaAccess({}).canUpload, false);
  // Admin authority is capability-based: the built-in ADMIN role default
  // (media.view/upload/assign/delete) keeps the upload control.
  assert.equal(
    resolveMediaAccess({
      admin: {
        adminId: "ADM-1",
        name: "A",
        status: "ACTIVE",
        accountLevel: "ADMIN",
        permissions: ["media.view", "media.upload", "media.assign", "media.delete"],
      },
    }).canUpload,
    true
  );
  assert.equal(
    resolveMediaAccess({ employee: { status: "ACTIVE", permissions: ["media.upload"] } }).canUpload,
    true
  );
});

// ===========================================================================
// 2. Upload page
// ===========================================================================

test("the upload page is titled Upload Product Media", () => {
  const source = read(UPLOAD);

  assert.match(source, /title="Upload Product Media"/);
  assert.doesNotMatch(source, /title="Upload Media"/, "the old title is gone");
});

test("the upload description promises product images only — no video", () => {
  const source = read(UPLOAD);
  const description = source.match(/description="([^"]+)"/)?.[1] ?? "";

  assert.ok(description.length > 0, "the page keeps a description");
  assert.match(description, /product/i, "names the product destination");
  assert.match(description, /images?/i, "names images");
  assert.match(description, /published/i, "states when it becomes visible");
  assert.doesNotMatch(description, /video/i, "no video promise");
  assert.doesNotMatch(source, /image and video/i);
});

test("the admin upload page fixes the scope to product and hides the switch", () => {
  const source = read(UPLOAD);

  assert.match(source, /import \{ MEDIA_SCOPES \} from "\.\.\/\.\.\/\.\.\/config\/mediaTypes"/);
  assert.match(source, /initialScope=\{MEDIA_SCOPES\.PRODUCT\}/);
  assert.match(source, /allowScopeChange=\{false\}/);
  assert.match(source, /portalType="admin"/);
  assert.match(source, /onSuccessRedirect=\{`\$\{prefix\}\/media`\}/);
});

// ===========================================================================
// 3. Shared upload form — copy only
// ===========================================================================

test("the stale 'no backend API yet' sentence is gone", () => {
  assert.doesNotMatch(read(FORM), /no backend API yet/i);
});

test("the marketing note points at the placement panel and denies auto-promotion", () => {
  const source = read(FORM);
  const start = source.indexOf(" Marketing placement art is registered");
  assert.ok(start > 0, "the marketing note exists");
  const note = source.slice(start, start + 400);

  assert.match(note, /Homepage placement art panel/, "names where marketing art is registered");
  assert.match(note, /never promoted automatically/i, "states the promotion rule");
  assert.doesNotMatch(note, /no backend API yet/i);
});

test("the shared marketing branch and its defaults are untouched", () => {
  const source = read(FORM);

  assert.match(source, /allowScopeChange = true,/, "default still true for other callers");
  assert.match(source, /initialScope = MEDIA_SCOPES\.PRODUCT,/);
  assert.match(source, /\{allowScopeChange && canManageMarketing \? \(/, "the switch still exists behind its guard");
  assert.match(source, /setScope\(MEDIA_SCOPES\.MARKETING\)/, "marketing destination still selectable");
  assert.match(source, /scope === MEDIA_SCOPES\.MARKETING \? \([\s\S]{0,400}Assign Marketing Media/);
});

test("the employee upload page keeps its own props", () => {
  const source = read("src/pages/employee/EmployeeMediaUpload.jsx");

  assert.match(source, /portalType="employee"/);
  assert.doesNotMatch(source, /allowScopeChange=\{false\}/, "only the admin page pins the scope");
});

// ===========================================================================
// 4. Batch 5 behaviour preserved
// ===========================================================================

test("the six server-backed tabs and their filters are unchanged", () => {
  assert.deepEqual(
    MEDIA_REGISTRY_TABS.map((tab) => [tab.id, tab.params]),
    [
      ["ALL", {}],
      ["IMAGES", { mediaType: "image" }],
      ["VIDEOS", { mediaType: "video" }],
      ["PRODUCT", { scopeFilter: "product", assigned: true }],
      ["MARKETING", { placement: true }],
      ["UNASSIGNED", { unassigned: true }],
    ]
  );
  assert.deepEqual(buildMediaListParams("MARKETING", { page: 1, pageSize: 24 }), {
    page: 1,
    pageSize: 24,
    q: "",
    placement: true,
  });
});

test("the eight summary cards keep their order, labels and honest values", () => {
  const cards = buildMediaCardModels({
    status: "ready",
    summary: {
      total: 10,
      images: 10,
      videos: 0,
      productMapped: 4,
      marketing: 5,
      unassigned: 1,
      largeFiles: 0,
      sameByteCopies: { assets: 0, groups: 0 },
    },
  });

  assert.deepEqual(cards.map((card) => card.label), [
    "Total Media",
    "Images",
    "Videos",
    "Product Media",
    "Marketing Media",
    "Unassigned",
    "Large Files",
    "Same-byte copies",
  ]);
  assert.deepEqual(cards.map((card) => card.value), ["10", "10", "0", "4", "5", "1", "0", "0"]);

  // The "Registered" wording lives in the registry panel, never in the data.
  const panel = read("src/components/admin/media/RegisteredMediaPanel.jsx");
  assert.match(panel, />\s*Registered\s*</);
  assert.doesNotMatch(panel, /asset\.status\s*=\s*"Registered"/, "display label only");
});

test("the Homepage Content page keeps its own title", () => {
  assert.match(read(HOMEPAGE), /title="Homepage Content Control Center"/);
});
