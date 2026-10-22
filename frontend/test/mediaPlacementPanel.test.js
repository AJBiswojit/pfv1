/**
 * PRATIKSHYA FASHION — Batch 7: placement panel position + disclosure.
 *
 * Batch 7 moves the EXISTING homepage-placement panel below the registry and
 * puts it in a disclosure that starts open. These tests pin the move and, just
 * as importantly, everything the move must not change:
 *
 *   · the registry (server-backed inventory) is the first content panel after
 *     the eight summary cards, and placement art sits below it;
 *   · the panel is inside `mediaAccess.canUpload` — a session without the
 *     upload grant still sees neither the panel nor an open disclosure;
 *   · the disclosure starts expanded, is keyboard-operable, and collapsing it
 *     HIDES the panel without unmounting it (so a chosen file, a typed object
 *     key or an error message is never discarded);
 *   · the same single panel instance is used — no duplicate, no second state;
 *   · `onRegistered` still bumps `registryRefresh`, which re-reads both the
 *     summary cards and the list;
 *   · the panel's registration API, validation messages and idempotent
 *     "already registered" copy are untouched.
 *
 * No renderer exists in this harness (no DOM, no React), so component order and
 * wiring are asserted against the real sources (`STATIC:`), exactly as the
 * other admin suites do. Behaviour that lives in plain modules is exercised
 * directly.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { resolveMediaAccess } from "../src/services/media/mediaAccess.js";
import { MEDIA_REGISTRY_TABS } from "../src/services/admin/mediaRegistryView.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const LIBRARY = "src/pages/admin/media/AdminMediaLibrary.jsx";
const PANEL = "src/components/admin/media/PlacementAssetPanel.jsx";

/** Index of the first occurrence, or -1. */
const at = (source, needle) => source.indexOf(needle);

// ===========================================================================
// 1. Position: cards → registry → placement
// ===========================================================================

test("the registry is the first content panel after the summary cards", () => {
  const source = read(LIBRARY);

  const cards = at(source, "summaryState.cards.map(");
  const registry = at(source, "<RegisteredMediaPanel");
  const placement = at(source, "<PlacementAssetPanel");

  assert.ok(cards > 0, "the eight cards are still rendered");
  assert.ok(registry > cards, "the registry follows the cards");
  assert.ok(placement > registry, "placement art is BELOW the registry (Batch 7)");
});

test("the placement panel no longer precedes the cards", () => {
  const source = read(LIBRARY);
  const placement = at(source, "<PlacementAssetPanel");
  const cards = at(source, "summaryState.cards.map(");

  assert.ok(placement > cards, "the old above-the-cards position is gone");
});

test("exactly one placement panel and one registry panel are rendered", () => {
  const source = read(LIBRARY);

  assert.equal((source.match(/<PlacementAssetPanel\b/g) || []).length, 1, "no duplicate panel");
  assert.equal((source.match(/<RegisteredMediaPanel\b/g) || []).length, 1, "no duplicate registry");
});

// ===========================================================================
// 2. Disclosure: expanded by default, hides without unmounting
// ===========================================================================

test("the disclosure exists and starts expanded", () => {
  const source = read(LIBRARY);

  assert.match(source, /const \[placementOpen, setPlacementOpen\] = useState\(true\)/);
  assert.match(source, /aria-expanded=\{placementOpen\}/);
  assert.match(source, /aria-controls="placement-art-panel"/);
  assert.match(source, /id="placement-art-panel"/);
  assert.match(source, /Advanced: homepage placement art/);
});

test("collapsing hides the panel instead of unmounting it", () => {
  const source = read(LIBRARY);

  // The body is a class toggle on a wrapper div, not a conditional render.
  assert.match(source, /className=\{placementOpen \? "" : "hidden"\}/);
  assert.doesNotMatch(
    source,
    /placementOpen \?\s*\(\s*<PlacementAssetPanel/,
    "a conditional render would discard a chosen file and its feedback"
  );
  assert.doesNotMatch(source, /placementOpen &&\s*<PlacementAssetPanel/);
});

test("the toggle is a real button outside the panel body", () => {
  const source = read(LIBRARY);
  const toggle = at(source, 'id="placement-art-toggle"');
  const body = at(source, 'id="placement-art-panel"');

  assert.ok(toggle > 0 && body > toggle, "the control precedes and controls the body");
  assert.match(source, /<button[\s\S]{0,300}aria-expanded=\{placementOpen\}/, "keyboard-operable button");
  assert.match(source, /onClick=\{\(\) => setPlacementOpen\(\(open\) => !open\)\}/);
});

// ===========================================================================
// 3. Permission gate preserved
// ===========================================================================

test("the panel is still gated by mediaAccess.canUpload", () => {
  const source = read(LIBRARY);

  assert.match(
    source,
    /\{mediaAccess\.canUpload \? \(\s*<section[\s\S]{0,1200}<PlacementAssetPanel/,
    "the whole disclosure — toggle included — sits inside the gate"
  );
  // The toggle must not be reachable outside the gate.
  const gates = (source.match(/\{mediaAccess\.canUpload \? \(/g) || []).length;
  assert.equal(gates, 2, "header control + placement disclosure, nothing else");
});

test("the house access rules still decide who sees placement actions", () => {
  assert.equal(resolveMediaAccess({}).canUpload, false, "signed out");

  // ADMIN authority mirrors the server's capability check (Batch 7A).
  const fullAdmin = {
    adminId: "ADM-1",
    name: "A",
    status: "ACTIVE",
    accountLevel: "ADMIN",
    permissions: ["media.view", "media.upload", "media.assign", "media.delete"],
  };
  assert.equal(resolveMediaAccess({ admin: fullAdmin }).canUpload, true, "default admin session");

  // A custom-permission ADMIN with no media grants is denied, exactly as
  // `require_admin_permission(..., "media.upload")` would answer with a 403.
  assert.equal(
    resolveMediaAccess({ admin: { ...fullAdmin, adminId: "ADM-2", permissions: ["products.view"] } })
      .canUpload,
    false,
    "role-limited admin without media.upload"
  );

  assert.equal(
    resolveMediaAccess({ employee: { status: "ACTIVE", permissions: [] } }).canUpload,
    false,
    "employee without media.upload"
  );
  assert.equal(
    resolveMediaAccess({ employee: { status: "ACTIVE", permissions: ["media.upload"] } }).canUpload,
    true,
    "employee holding media.upload"
  );
});

// ===========================================================================
// 4. Refresh + registration behaviour preserved
// ===========================================================================

test("onRegistered still bumps the registry refresh token", () => {
  const source = read(LIBRARY);

  assert.match(
    source,
    /<PlacementAssetPanel onRegistered=\{\(\) => setRegistryRefresh\(\(value\) => value \+ 1\)\} \/>/
  );
  assert.match(source, /useMediaSummary\(\{ refreshToken: registryRefresh \}\)/);
  assert.match(source, /<RegisteredMediaPanel refreshToken=\{registryRefresh\}/);
});

test("the panel calls onRegistered after BOTH registration paths", () => {
  const source = read(PANEL);
  const calls = (source.match(/onRegistered\?\.\(\)/g) || []).length;

  assert.equal(calls, 2, "upload-and-register and register-existing both refresh");
});

test("registration still goes through the same two API calls", () => {
  const source = read(PANEL);

  assert.match(source, /import \{ apiRegisterPlacementAsset, apiUploadMediaObject \} from "\.\.\/\.\.\/\.\.\/services\/api\/mediaApi"/);
  assert.match(source, /await apiUploadMediaObject\(file, \{ namespace \}\)/);
  assert.match(source, /await apiRegisterPlacementAsset\(uploaded\.object\.key\)/);
  assert.match(source, /await apiRegisterPlacementAsset\(key\)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/, "no raw HTTP in the panel");
});

test("duplicate registration and validation messages are unchanged", () => {
  const source = read(PANEL);

  assert.match(source, /already registered \(no duplicate created\)/);
  assert.match(source, /Choose an image file first \(JPEG, PNG, WebP or AVIF\)\./);
  assert.match(source, /Enter the full object key, e\.g\. hero\/hero001\.avif/);
  assert.match(source, /Upload failed — the object was not stored, nothing was registered\./);
  assert.match(source, /role=\{feedback\.kind === "error" \? "alert" : "status"\}/, "feedback stays announced");
});

// ===========================================================================
// 5. Panel copy (plan §10) — and nothing else changed
// ===========================================================================

test("the panel title names both placement namespaces", () => {
  const source = read(PANEL);

  assert.match(source, /Homepage placement art \(hero\/ and\s+marketing\/\)/);
});

test("the description says register here, then attach in Homepage Content", () => {
  const source = read(PANEL);
  const description = source.match(/description="([^"]+)"/)?.[1] ?? "";

  assert.match(description, /Register hero\/ and marketing\/ images here/);
  assert.match(description, /then attach them in Homepage Content/);
  assert.match(description, /already in storage/);
});

test("the panel has no new props, handlers or hidden endpoints", () => {
  const source = read(PANEL);

  assert.match(source, /export default function PlacementAssetPanel\(\{ onRegistered \}\)/);
  assert.equal(
    (source.match(/export default function PlacementAssetPanel/g) || []).length,
    1,
    "one component, one export"
  );
  for (const endpoint of ["/media/assets", "/media/assets/summary", "/media/register-placement"]) {
    assert.doesNotMatch(source, new RegExp(endpoint.replace(/\//g, "\\/")), `${endpoint} is not called here`);
  }
});

// ===========================================================================
// 6. Everything else on the page is untouched
// ===========================================================================

test("the eight cards and the six registry tabs are unchanged", () => {
  const source = read(LIBRARY);
  const panel = read("src/components/admin/media/RegisteredMediaPanel.jsx");

  assert.match(source, /summaryState\.cards\.map\(/);
  assert.deepEqual(
    MEDIA_REGISTRY_TABS.map((tab) => tab.id),
    ["ALL", "IMAGES", "VIDEOS", "PRODUCT", "MARKETING", "UNASSIGNED"]
  );
  assert.match(panel, /MEDIA_REGISTRY_TABS\.map\(/);
});

test("Batch 6 terminology and the upload gate are still in place", () => {
  const source = read(LIBRARY);

  assert.match(source, />\s*Homepage Content\s*</);
  assert.match(source, /Upload Product Media/);
  assert.match(source, /\{mediaAccess\.canUpload \? \(\s*<AtelierButton/, "upload button still gated");
});
