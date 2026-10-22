/**
 * PRATIKSHYA FASHION — Media authorization matrix (Batch 7A).
 *
 * The media surfaces answer "what may this viewer do?" with
 * `resolveMediaAccess`. Until Batch 7A an ADMIN was answered with an
 * unconditional grant, which disagreed with the server: the API authorizes
 * every admin media call through `require_admin_permission(..., "media.view"
 * | "media.upload")`, so a role-limited ADMIN saw controls that could only
 * fail with 403.
 *
 * The corrected contract, asserted here:
 *
 *   signed in as   | authority
 *   ---------------|--------------------------------------------------------
 *   nobody         | nothing
 *   SUPER_ADMIN    | everything (top-level override, `*`)
 *   ADMIN          | whatever its resolved grant list carries — the built-in
 *                  | ADMIN role defaults include media.view/upload/assign/
 *                  | delete, so a default admin is unchanged; a custom-
 *                  | permission admin without those codes gets nothing
 *   EMPLOYEE       | its own grant list (unchanged by Batch 7A)
 *
 * Legacy granular codes satisfy capability checks through the shared
 * implication table (`media.upload` ⇒ media.manage ⇒ upload/assign/edit/
 * manage), which is the same expansion the backend resolver applies.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { resolveMediaAccess } from "../src/services/media/mediaAccess.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESOLVER = "src/services/media/mediaAccess.js";

/** The built-in ADMIN role defaults, exactly as `app/core/rbac.py` lists them. */
const ADMIN_MEDIA_GRANTS = ["media.view", "media.upload", "media.assign", "media.delete"];

const admin = (overrides = {}) => ({
  adminId: "ADM-001",
  name: "A. Administrator",
  status: "ACTIVE",
  accountLevel: "ADMIN",
  permissions: ADMIN_MEDIA_GRANTS,
  ...overrides,
});

const asFlags = (access) => ({
  view: access.canView,
  upload: access.canUpload,
  edit: access.canEdit,
  delete: access.canDelete,
  assign: access.canAssign,
  marketing: access.canManageMarketing,
});

const ALL = { view: true, upload: true, edit: true, delete: true, assign: true, marketing: true };
const NONE = { view: false, upload: false, edit: false, delete: false, assign: false, marketing: false };

// ---------------------------------------------------------------------------
// 1. Signed out
// ---------------------------------------------------------------------------

test("a signed-out visitor holds no media ability", () => {
  assert.deepEqual(asFlags(resolveMediaAccess({})), NONE);
  assert.deepEqual(asFlags(resolveMediaAccess()), NONE);
  assert.equal(resolveMediaAccess({}).actorLabel, "Guest");
});

// ---------------------------------------------------------------------------
// 2. Unrestricted admins — unchanged by Batch 7A
// ---------------------------------------------------------------------------

test("SUPER_ADMIN overrides every media check", () => {
  const access = resolveMediaAccess({
    admin: admin({ adminId: "SA-1", accountLevel: "SUPER_ADMIN", permissions: ["*"] }),
  });
  assert.deepEqual(asFlags(access), ALL);
});

test("an ADMIN holding the wildcard holds every media ability", () => {
  assert.deepEqual(asFlags(resolveMediaAccess({ admin: admin({ permissions: ["*"] }) })), ALL);
});

test("the built-in ADMIN role defaults still unlock the whole media surface", () => {
  // No behavioural change for a normal administrator: media.view/upload/
  // assign/delete is what the backend grants the ADMIN role by default.
  assert.deepEqual(asFlags(resolveMediaAccess({ admin: admin() })), ALL);
});

test("the resolver agrees with the backend's ADMIN media grant list", () => {
  // The defaults the UI is calibrated against must be the ones the server
  // actually writes for the built-in ADMIN role.
  const rbac = readFileSync(path.resolve(HERE, "../../backend/app/core/rbac.py"), "utf8");
  assert.match(
    rbac,
    /"media\.view",\s*"media\.upload",\s*"media\.assign",\s*"media\.delete",/,
    "app/core/rbac.py still grants these codes to a built-in ADMIN"
  );
  assert.deepEqual(asFlags(resolveMediaAccess({ admin: admin({ permissions: ADMIN_MEDIA_GRANTS }) })), ALL);
});

// ---------------------------------------------------------------------------
// 3. Restricted admins — the defect Batch 7A corrects
// ---------------------------------------------------------------------------

test("a custom-permission ADMIN with no media grant holds nothing", () => {
  const access = resolveMediaAccess({
    admin: admin({ permissions: ["products.view", "orders.view", "inventory.view"] }),
  });
  assert.deepEqual(asFlags(access), NONE, "no control the API would refuse");
});

test("a custom-permission ADMIN with only media.view may view and nothing else", () => {
  const access = resolveMediaAccess({ admin: admin({ permissions: ["media.view"] }) });
  assert.deepEqual(asFlags(access), { ...NONE, view: true });
});

test("a custom-permission ADMIN with only media.delete may delete and nothing else", () => {
  const access = resolveMediaAccess({ admin: admin({ permissions: ["media.delete"] }) });
  assert.deepEqual(asFlags(access), { ...NONE, delete: true });
});

test("a legacy media.upload grant expands exactly as the server expands it", () => {
  // media.upload ⇒ media.manage ⇒ {upload, assign, edit, manage}; it is not
  // a view grant and it is not a delete grant.
  const access = resolveMediaAccess({ admin: admin({ permissions: ["media.upload"] }) });
  assert.deepEqual(asFlags(access), {
    view: false,
    upload: true,
    edit: true,
    delete: false,
    assign: true,
    marketing: true,
  });
});

test("a suspended admin is denied even with every media grant", () => {
  const access = resolveMediaAccess({ admin: admin({ status: "SUSPENDED" }) });
  assert.deepEqual(asFlags(access), NONE);
});

test("an admin-shaped object without an adminId is not an authenticated admin", () => {
  // Guards against the old blanket grant: `{ name }` alone is not authority.
  assert.deepEqual(asFlags(resolveMediaAccess({ admin: { name: "A" } })), NONE);
});

// ---------------------------------------------------------------------------
// 4. Employees — unchanged by Batch 7A
// ---------------------------------------------------------------------------

test("an employee with no media grant holds nothing", () => {
  const access = resolveMediaAccess({ employee: { status: "ACTIVE", permissions: [] } });
  assert.deepEqual(asFlags(access), NONE);
});

test("an employee holding media.upload keeps exactly the upload-side abilities", () => {
  const access = resolveMediaAccess({
    employee: { status: "ACTIVE", permissions: ["media.upload"] },
  });
  assert.deepEqual(asFlags(access), {
    view: false,
    upload: true,
    edit: true,
    delete: false,
    assign: true,
    marketing: true,
  });
});

test("an employee holding the view grant may view but not upload", () => {
  const access = resolveMediaAccess({
    employee: { status: "ACTIVE", permissions: ["media.view"] },
  });
  assert.deepEqual(asFlags(access), { ...NONE, view: true });
});

test("an employee with every media grant holds every media ability", () => {
  const access = resolveMediaAccess({
    employee: {
      status: "ACTIVE",
      permissions: ["media.view", "media.upload", "media.edit", "media.delete", "media.assign", "media.manage"],
    },
  });
  assert.deepEqual(asFlags(access), ALL);
});

// ---------------------------------------------------------------------------
// 5. Ordering and shape
// ---------------------------------------------------------------------------

test("an admin session is answered before an employee session", () => {
  const access = resolveMediaAccess({
    admin: admin({ permissions: ["media.view"] }),
    employee: { status: "ACTIVE", permissions: ["media.upload", "media.delete"] },
  });
  assert.deepEqual(asFlags(access), { ...NONE, view: true }, "the admin answer wins");
});

test("the resolver returns the full flag set plus a label for every viewer", () => {
  for (const viewer of [{}, { admin: admin() }, { employee: { status: "ACTIVE", permissions: [] } }]) {
    const access = resolveMediaAccess(viewer);
    for (const flag of ["canView", "canUpload", "canEdit", "canDelete", "canAssign", "canManageMarketing"]) {
      assert.equal(typeof access[flag], "boolean", `${flag} is always a boolean`);
    }
    assert.equal(typeof access.actorLabel, "string");
  }
  assert.equal(resolveMediaAccess({ admin: admin() }).actorLabel, "A. Administrator");
  assert.equal(
    resolveMediaAccess({ employee: { status: "ACTIVE", firstName: "Asha", lastName: "Rao" } }).actorLabel,
    "Asha Rao"
  );
});

// ---------------------------------------------------------------------------
// 6. Static guards on the resolver itself
// ---------------------------------------------------------------------------

test("STATIC: no unconditional admin grant survives in the resolver", () => {
  const source = readFileSync(path.resolve(HERE, "..", RESOLVER), "utf8");
  assert.doesNotMatch(source, /fullGrant/, "the blanket grant object is gone");
  assert.doesNotMatch(
    source,
    /if \(admin\) return \{ \.\.\.\{[^}]*canUpload: true/,
    "an admin is never granted every ability unconditionally"
  );
  assert.match(
    source,
    /const adminGrant = \(admin\) => \(\{/,
    "admin abilities are derived from the capability checks"
  );
  assert.equal(
    (source.match(/hasAdminPermission\(admin, /g) || []).length,
    6,
    "one capability check per media ability"
  );
});

test("STATIC: the resolver still contains no HTTP, storage or React access", () => {
  const source = readFileSync(path.resolve(HERE, "..", RESOLVER), "utf8");
  assert.doesNotMatch(source, /(?<!\.)\bfetch\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|apiClient/);
  assert.doesNotMatch(source, /from [\"']react/);
});
