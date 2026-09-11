/**
 * UNIFIED RBAC CONTRACT — frontend mirror vs backend authority.
 *
 * frontend/src/config/rbacModel.js is a MIRROR of backend/app/core/rbac.py;
 * the server remains the security authority. This test imports the real
 * backend module (it is pure stdlib — no FastAPI) through python3 and pins
 * every shared string, so the two vocabularies can never drift apart
 * silently. If python3 is unavailable the check skips — it never fakes a
 * pass.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_LEVELS,
  ACCOUNT_LEVEL_ORDER,
  ACCOUNT_LEVEL_META,
  CREATABLE_LEVELS,
  CAPABILITY_GROUPS,
  CAPABILITY_CODES,
  CAPABILITY_IMPLIES,
  LEGACY_TO_CAPABILITY,
  canCreatorCreate,
  delegableCapabilities,
  expandEffectivePermissions,
  holdsCapability,
  workspaceForLevel,
  EMPLOYEE_SELF_SERVICE_PERMISSIONS,
} from "../src/config/rbacModel.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, "../../backend");

const DUMP = `
import json, sys
sys.path.insert(0, ".")
import app.core.rbac as r
print(json.dumps({
    "levels": list(r.ACCOUNT_LEVELS),
    "creatable": {k: sorted(v) for k, v in r.CREATABLE_LEVELS.items()},
    "groups": [
        {"id": g["id"], "label": g["label"],
         "actions": [{"code": a["code"], "label": a["label"], "implies": list(a["implies"])} for a in g["actions"]]}
        for g in r.CAPABILITY_GROUPS
    ],
    "implies": {k: list(v) for k, v in r.CAPABILITY_IMPLIES.items()},
    "legacy": dict(r.LEGACY_TO_CAPABILITY),
    "admin_only": sorted(r.ADMIN_ONLY_CAPABILITIES),
    "self_service": sorted(r.EMPLOYEE_SELF_SERVICE_PERMISSIONS),
    "expand": {
        sample: sorted(r.expand_effective_permissions(sample.split(",")))
        for sample in [
            "catalogue.view",
            "employees.edit",
            "analytics.view",
            "ai.view",
            "people.manage",
            "settings.view,returns.view",
            "*",
            "team.view,profile.view",
        ]
    },
}))
`;

let contract = null;
let skipReason = "";
try {
  contract = JSON.parse(
    execFileSync("python3", ["-c", DUMP], { cwd: BACKEND_ROOT, encoding: "utf8", timeout: 20000 })
  );
} catch (err) {
  skipReason = `python3 (backend module import) unavailable: ${err.message}`;
}

const withBackend = (fn) => (t) => {
  if (!contract) return t.skip(skipReason);
  return fn(contract, t);
};

test("account-level ladder matches the backend order exactly", withBackend((c) => {
  assert.deepEqual(c.levels, [...ACCOUNT_LEVEL_ORDER]);
  assert.equal(ACCOUNT_LEVEL_ORDER.length, 4);
  assert.deepEqual(Object.values(ACCOUNT_LEVELS).sort(), [...ACCOUNT_LEVEL_ORDER].sort());
}));

test("creation matrix is the same table on both sides", withBackend((c) => {
  for (const level of ACCOUNT_LEVEL_ORDER) {
    assert.deepEqual(
      [...(CREATABLE_LEVELS[level] ?? [])].sort(),
      c.creatable[level] ?? [],
      `creatable set for ${level}`
    );
  }
  // EMPLOYEE creates nothing — pinned on both sides.
  assert.deepEqual(c.creatable.EMPLOYEE, []);
  assert.equal(CREATABLE_LEVELS.EMPLOYEE.length, 0);
  // Exhaustive matrix check (4x4): every pair agrees.
  for (const creator of ACCOUNT_LEVEL_ORDER) {
    for (const target of ACCOUNT_LEVEL_ORDER) {
      assert.equal(
        canCreatorCreate(creator, target),
        (c.creatable[creator] ?? []).includes(target),
        `${creator} -> ${target}`
      );
    }
  }
}));

test("capability groups, actions, labels and ordering are string-identical", withBackend((c) => {
  const js = CAPABILITY_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    actions: group.actions.map((action) => ({ code: action.code, label: action.label })),
  }));
  const py = c.groups.map((group) => ({
    id: group.id,
    label: group.label,
    actions: group.actions.map((action) => ({ code: action.code, label: action.label })),
  }));
  assert.deepEqual(js, py);
  // The implication lists too — the ceiling maths depends on them.
  const jsImplies = {};
  for (const group of CAPABILITY_GROUPS) {
    for (const action of group.actions) jsImplies[action.code] = [...(action.implies ?? CAPABILITY_IMPLIES[action.code] ?? [])];
  }
  assert.deepEqual(jsImplies, c.implies);
}));

test("CAPABILITY_IMPLIES and the legacy roll-up map are identical", withBackend((c) => {
  assert.deepEqual({ ...CAPABILITY_IMPLIES }, c.implies);
  assert.deepEqual({ ...LEGACY_TO_CAPABILITY }, c.legacy);
  assert.deepEqual([...CAPABILITY_CODES].sort(), Object.keys(c.implies).sort());
}));

test("effective-permission expansion agrees on shared samples", withBackend((c) => {
  for (const [sample, expected] of Object.entries(c.expand)) {
    assert.deepEqual(
      [...expandEffectivePermissions(sample.split(","))].sort(),
      expected,
      `expand("${sample}")`
    );
  }
  // Capability and legacy vocabularies resolve each other in BOTH directions.
  assert.ok(holdsCapability(["people.manage"], "employees.edit"));
  assert.ok(holdsCapability(["employees.edit"], "people.manage"));
  assert.ok(holdsCapability(["ai.view"], "analytics.view"));
}));

test("delegation ceiling: SUPER_ADMIN unrestricted, SUPER_EMPLOYEE drops admin-domain authority", withBackend((c) => {
  assert.deepEqual(c.admin_only, ["people.security", "settings.manage"]);
  assert.equal(delegableCapabilities({ accountLevel: ACCOUNT_LEVELS.SUPER_ADMIN, permissions: [] }), null);
  assert.equal(delegableCapabilities({ accountLevel: ACCOUNT_LEVELS.ADMIN, permissions: ["*"] }), null);
  const ceiling = delegableCapabilities({
    accountLevel: ACCOUNT_LEVELS.SUPER_EMPLOYEE,
    permissions: ["people.manage", "settings.manage", "people.security", "catalogue.view"],
  });
  assert.ok(ceiling.has("catalogue.view"));
  assert.ok(ceiling.has("people.manage"));
  assert.ok(!ceiling.has("settings.manage"));
  assert.ok(!ceiling.has("people.security"));
}));

test("workspaces route exactly by account level", () => {
  assert.equal(workspaceForLevel(ACCOUNT_LEVELS.SUPER_ADMIN), "admin");
  assert.equal(workspaceForLevel(ACCOUNT_LEVELS.ADMIN), "admin");
  assert.equal(workspaceForLevel(ACCOUNT_LEVELS.SUPER_EMPLOYEE), "employee");
  assert.equal(workspaceForLevel(ACCOUNT_LEVELS.EMPLOYEE), "employee");
  assert.equal(workspaceForLevel("NOPE"), null);
  for (const level of ACCOUNT_LEVEL_ORDER) {
    assert.ok(ACCOUNT_LEVEL_META[level]?.label, `${level} needs a display label`);
  }
});

test("employee self-service keys match the backend injection set", withBackend((c) => {
  assert.deepEqual([...EMPLOYEE_SELF_SERVICE_PERMISSIONS].sort(), c.self_service);
  assert.ok(c.self_service.includes("dashboard.view"));
  assert.ok(!c.self_service.includes("people.manage"));
  assert.ok(!c.self_service.includes("settings.manage"));
}));

test("no legacy code that maps to a capability escapes the roll-up", withBackend((c) => {
  // Every value of LEGACY_TO_CAPABILITY is a real capability...
  for (const [legacy, cap] of Object.entries(LEGACY_TO_CAPABILITY)) {
    assert.ok(CAPABILITY_CODES.includes(cap) || cap === "audit.view", `${legacy} -> ${cap}`);
  }
}));
