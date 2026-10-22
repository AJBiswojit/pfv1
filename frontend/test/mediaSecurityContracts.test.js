/**
 * PRATIKSHYA FASHION — consolidated media security & integrity contracts.
 *
 * Batch 9. Each block pins one decision so a later change has to be deliberate
 * rather than accidental. These are STATIC contracts over the real source plus
 * pure-unit checks of the resolver; they are not a substitute for the backend
 * runtime, which cannot execute in this environment (see the batch report).
 *
 *   A. The public object route is public BY DESIGN — storefront delivery
 *      depends on it. Gating it on product status would be an API-breaking
 *      change, so the contract pins the current behaviour and the reasons.
 *   B. Registration of an existing key verifies the stored checksum against
 *      the registry row and rejects a mismatch with 409, mutating nothing.
 *   C. Rollback may delete storage only for an object the request created.
 *   D. Marketing authority comes from resolved grants, not from the workspace
 *      the session happens to be signed into.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Walk up to the package root instead of assuming a fixed depth, so the
// suite resolves identically however the loader hands us the module URL.
const findUp = (start, marker) => {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, marker))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`could not locate ${marker} above ${start}`);
};
const FE_ROOT = findUp(HERE, "package.json");
// Reads resolve against `frontend/`, so backend paths are `../backend/...`.
const read = (relative) => readFileSync(path.resolve(FE_ROOT, relative), "utf8");

const MEDIA_PY = read("../backend/app/api/v1/media.py");
const PLACEMENT_SERVICE = read("../backend/app/services/media/placement_asset_service.py");
const INTEGRITY = read("../backend/app/services/media/media_integrity.py");
const EXPLORE_SERVICE = read("../backend/app/services/catalog/explore_service.py");
const UPLOAD_FORM = read("src/components/media/MediaUploadForm.jsx");

/** The body of one top-level `async def` / `def`, cut at the next definition. */
const block = (source, signature) => {
  const start = source.indexOf(signature);
  assert.ok(start > -1, `${signature} exists`);
  const rest = source.slice(start + signature.length);
  const next = rest.search(/\n(?:@router|async def |def |class )/);
  return next === -1 ? rest : rest.slice(0, next);
};

// ===========================================================================
// A. Public object route — the visibility contract
// ===========================================================================

test("A: the object route is public by design and performs no status lookup", () => {
  const handler = block(MEDIA_PY, "async def get_media_object(");

  // No authentication dependency, no permission call: storefront and CDN
  // delivery are unauthenticated by contract.
  assert.doesNotMatch(handler, /get_current_admin|get_current_user|get_current_employee/);
  assert.doesNotMatch(handler, /require_admin_permission|require_permission_for_user/);
  // No product/publication check either. This is the documented trade-off
  // (A-13 / S-04): changing it needs a visibility decision, not a patch.
  assert.doesNotMatch(handler, /ProductModel|is_active|published|status\s*==/, "no product-status gate");

  // What the route DOES enforce: key normalisation before any storage I/O.
  assert.match(handler, /_safe_key\(media, object_key\)/);
});

test("A: storefront delivery builds the same public URL shape", () => {
  // If the route were made private, these storefront paths break — which is
  // exactly why the fix was not applied silently.
  assert.match(EXPLORE_SERVICE, /image_url = f"\/api\/v1\/media\/objects\/\{row\.object_key\}"/);
  assert.match(MEDIA_PY, /def _safe_key\(media: MediaService, raw: str\) -> str:/);
});

test("A: the admin registry surface stays gated on media.view", () => {
  for (const signature of ["async def media_asset_summary(", "async def list_media_assets("]) {
    const handler = block(MEDIA_PY, signature);
    assert.match(handler, /require_admin_permission\(current_user, db, "media\.view"\)/, signature);
  }
});

test("A: the existing route-level boundaries are still covered by tests", () => {
  const lifecycle = read("../backend/tests/unit/test_phase7_media_lifecycle.py");
  // Public serving of registered bytes.
  assert.match(lifecycle, /served = self\.client\.get\(f"\/api\/v1\/media\/objects\/\{key\}"\)/);
  // Missing object on registration is a 404.
  assert.match(lifecycle, /def test_registering_an_object_that_does_not_exist_is_404/);
  // Traversal keys are rejected before storage.
  assert.match(lifecycle, /def test_registering_a_traversal_key_is_422_and_creates_nothing/);
});

// ===========================================================================
// B. Existing-key byte integrity
// ===========================================================================

test("B: the integrity guard is pure, shared and decides only on trusted digests", () => {
  assert.match(INTEGRITY, /def checksum_conflict\(/);
  assert.match(INTEGRITY, /def normalise_checksum\(/);
  assert.match(INTEGRITY, /def should_compensate\(/);
  // No I/O or framework imports: the rule is testable without the stack.
  assert.doesNotMatch(INTEGRITY, /^from (fastapi|sqlalchemy|app\.config)/m);
  assert.doesNotMatch(INTEGRITY, /await |async def /);
});

test("B: product registration verifies an existing row before reusing it", () => {
  const handler = block(MEDIA_PY, "async def _register_product_asset(");

  assert.match(handler, /checksum_conflict\(meta\.checksum_sha256, row\.checksum_sha256\)/);
  assert.match(handler, /raise ConflictException\(CHECKSUM_MISMATCH_MESSAGE\)/);

  // The check must run BEFORE the idempotent reuse and before any row creation,
  // otherwise the existing row would be returned unverified.
  const guardAt = handler.indexOf("checksum_conflict(");
  const createAt = handler.indexOf("if row is None:");
  assert.ok(guardAt > -1 && createAt > -1 && guardAt < createAt, "guard precedes reuse/creation");
});

test("B: placement registration applies the same rule", () => {
  const handler = block(PLACEMENT_SERVICE, "async def register_placement_asset(");
  assert.match(handler, /checksum_conflict\(meta\.checksum_sha256, existing\.checksum_sha256\)/);
  assert.match(handler, /raise ConflictException\(CHECKSUM_MISMATCH_MESSAGE\)/);
});

test("B: a mismatch never mutates the row or the object", () => {
  // The guard raises; nothing in either branch writes before it.
  for (const [name, handler] of [
    ["product", block(MEDIA_PY, "async def _register_product_asset(")],
    ["placement", block(PLACEMENT_SERVICE, "async def register_placement_asset(")],
  ]) {
    const guardAt = handler.indexOf("checksum_conflict(");
    const before = handler.slice(0, guardAt);
    assert.doesNotMatch(before, /\.checksum_sha256\s*=|\.file_size\s*=|db\.delete\(|delete_object/, name);
  }
});

test("B: no schema change was introduced for the check", () => {
  const model = read("../backend/app/models/media/media_asset.py");
  // The check reuses the existing stored checksum column.
  assert.match(model, /checksum_sha256/);
  assert.doesNotMatch(model, /checksum_verified|integrity_status|verified_at/);
});

// ===========================================================================
// C. Orphan rollback ownership
// ===========================================================================

test("C: rollback is owned by the created flag, not by the key", () => {
  assert.match(INTEGRITY, /if not stored\.get\("created"\):\s*\n\s*return False/);
  assert.match(MEDIA_PY, /if not should_compensate\(stored\):\s*\n\s*return/);
});

test("C: both upload+register paths run the compensation", () => {
  const productUpload = block(MEDIA_PY, "async def upload_product_media_object(");
  assert.match(
    productUpload,
    /except Exception:\s*\n\s*await _compensate_failed_registration\(db, stored\)\s*\n\s*raise/
  );

  const employeeUpload = block(MEDIA_PY, "async def employee_upload_product_media_object(");
  assert.match(employeeUpload, /await _compensate_failed_registration\(db, stored\)/);
});

test("C: the generic upload path stays registration-free by design", () => {
  const generic = block(MEDIA_PY, "async def upload_media_object(");
  // Two-step by contract: the frontend surfaces the key for an explicit
  // register retry, so the object is never silently auto-deleted later.
  assert.match(generic, /Nothing is written to the\s*\n\s*database/);
});

// ===========================================================================
// D. Permission consistency
// ===========================================================================

test("D: marketing authority is resolved from grants, not from the workspace", () => {
  assert.match(UPLOAD_FORM, /const canManageMarketing = isEmployeeSession\s*\n\s*\?/);
  assert.match(UPLOAD_FORM, /: Boolean\(actions\.access\?\.canManageMarketing\)/);
  assert.doesNotMatch(UPLOAD_FORM, /const canManageMarketing = admin \? true/);
  // The employee rule is untouched.
  assert.match(UPLOAD_FORM, /hasPermission\?\.\(PERMISSIONS\.MEDIA_MANAGE\)/);
});

test("D: the resolver maps each capability to the server's own code", () => {
  const resolver = read("src/services/media/mediaAccess.js");
  for (const pair of [
    ["VIEW", "canView"],
    ["UPLOAD", "canUpload"],
    ["EDIT", "canEdit"],
    ["DELETE", "canDelete"],
    ["ASSIGN", "canAssign"],
    ["MANAGE", "canManageMarketing"],
  ]) {
    assert.match(
      resolver,
      new RegExp(`${pair[1]}: hasAdminPermission\\(admin, MEDIA_PERMISSIONS\\.${pair[0]}\\)`),
      pair[1]
    );
  }
  assert.doesNotMatch(resolver, /fullGrant/, "no blanket admin grant remains");
});

test("D: media.assign is enforced server-side where assignment happens", () => {
  const marketing = read("../backend/app/api/v1/marketing_media.py");
  const enforcements = marketing.match(/require_admin_permission\(current_user, db, "media\.assign"\)/g) || [];
  assert.ok(enforcements.length >= 2, "update and reorder are gated");

  const homepage = read("../backend/app/api/v1/homepage.py");
  assert.match(homepage, /hero_access\(actor, db, "media\.assign", write=True\)/);
});

test("D: no new permission code or role default was introduced", () => {
  const rbac = read("../backend/app/core/rbac.py");
  // Built-in ADMIN keeps exactly the media codes it had.
  assert.match(rbac, /"media\.view", "media\.upload", "media\.assign", "media\.delete"/);
  // The capability model is unchanged: three media actions, one implication set.
  assert.match(rbac, /"code": "media\.manage"[\s\S]{0,120}"implies": \["media\.upload", "media\.assign", "media\.edit", "media\.manage"\]/);
});
