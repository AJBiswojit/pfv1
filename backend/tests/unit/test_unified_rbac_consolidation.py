"""
Unified authentication + 4-level RBAC — hierarchy, delegation and auth pins.

These tests pin the CONTRACT of the consolidation:

  §2   creation matrix (who may create which level) enforced in the backend
  §7   delegation ceiling (grants ⊆ creator's effective set; Super Employee
       can never receive admin-domain authority)
  §6   ONE login endpoint (enumeration-safe) that routes by server-derived
       account level — not four logins, no is_* claims
  §8   one claim surface: `account_level` on the DTO, legacy `roles`/
       `permissions` intact
  §20  legacy granular grants keep working through the compat expansion

Pure unit tests where logic is self-contained (app/core/rbac.py), source
pins where the guarantee is wiring.
"""

import inspect
import unittest

from app.core.exceptions import BusinessLogicException, ForbiddenException

from app.core.rbac import (
    ACCOUNT_LEVEL_ADMIN,
    ACCOUNT_LEVEL_EMPLOYEE,
    ACCOUNT_LEVELS,
    ACCOUNT_LEVEL_SUPER_ADMIN,
    ACCOUNT_LEVEL_SUPER_EMPLOYEE,
    ADMIN_ONLY_CAPABILITIES,
    ALL_CAPABILITIES,
    CREATABLE_LEVELS,
    LEGACY_TO_CAPABILITY,
    can_create,
    can_manage,
    check_delegation,
    expand_effective_permissions,
    normalize_grants,
)

ALL_LEVELS = [
    ACCOUNT_LEVEL_SUPER_ADMIN,
    ACCOUNT_LEVEL_ADMIN,
    ACCOUNT_LEVEL_SUPER_EMPLOYEE,
    ACCOUNT_LEVEL_EMPLOYEE,
]


class CreationMatrixTests(unittest.TestCase):
    """§2 — the matrix lives in the backend; every pair is pinned."""

    EXPECTED = {
            ACCOUNT_LEVEL_SUPER_ADMIN: {ACCOUNT_LEVEL_SUPER_ADMIN, ACCOUNT_LEVEL_ADMIN, ACCOUNT_LEVEL_SUPER_EMPLOYEE, ACCOUNT_LEVEL_EMPLOYEE},
            ACCOUNT_LEVEL_ADMIN: {ACCOUNT_LEVEL_ADMIN, ACCOUNT_LEVEL_SUPER_EMPLOYEE, ACCOUNT_LEVEL_EMPLOYEE},
            ACCOUNT_LEVEL_SUPER_EMPLOYEE: {ACCOUNT_LEVEL_SUPER_EMPLOYEE, ACCOUNT_LEVEL_EMPLOYEE},
            ACCOUNT_LEVEL_EMPLOYEE: set(),
        }

    def test_matrix_exhaustive(self):
        for creator in ALL_LEVELS:
            for target in ALL_LEVELS:
                self.assertEqual(
                    can_create(creator, target),
                    target in self.EXPECTED[creator],
                    f"{creator} -> {target}",
                )

    def test_employee_creates_nothing(self):
        for target in ALL_LEVELS:
            self.assertFalse(can_create(ACCOUNT_LEVEL_EMPLOYEE, target))
        self.assertEqual(CREATABLE_LEVELS[ACCOUNT_LEVEL_EMPLOYEE], set())

    def test_unknown_creator_level_creates_nothing(self):
        for target in ALL_LEVELS:
            self.assertFalse(can_create(None, target))
            self.assertFalse(can_create("AUDITOR", target))

    def test_admin_can_never_create_a_super_admin(self):
        self.assertFalse(can_create(ACCOUNT_LEVEL_ADMIN, ACCOUNT_LEVEL_SUPER_ADMIN))
        self.assertFalse(can_create(ACCOUNT_LEVEL_SUPER_EMPLOYEE, ACCOUNT_LEVEL_ADMIN))


class ManageCeilingTests(unittest.TestCase):
    def test_only_super_admin_touches_super_admin(self):
        for creator in ALL_LEVELS:
            self.assertEqual(
                can_manage(creator, ACCOUNT_LEVEL_SUPER_ADMIN),
                creator == ACCOUNT_LEVEL_SUPER_ADMIN,
            )

    def test_employee_domain_manager_reaches_employee_domain(self):
        self.assertTrue(can_manage(ACCOUNT_LEVEL_SUPER_EMPLOYEE, ACCOUNT_LEVEL_EMPLOYEE))
        self.assertTrue(can_manage(ACCOUNT_LEVEL_SUPER_EMPLOYEE, ACCOUNT_LEVEL_SUPER_EMPLOYEE))
        self.assertFalse(can_manage(ACCOUNT_LEVEL_SUPER_EMPLOYEE, ACCOUNT_LEVEL_ADMIN))

    def test_admin_managers_reach_admin_level_but_not_super(self):
        self.assertTrue(can_manage(ACCOUNT_LEVEL_ADMIN, ACCOUNT_LEVEL_ADMIN))
        self.assertTrue(can_manage(ACCOUNT_LEVEL_ADMIN, ACCOUNT_LEVEL_EMPLOYEE))
        self.assertFalse(can_manage(ACCOUNT_LEVEL_ADMIN, ACCOUNT_LEVEL_SUPER_ADMIN))


class DelegationCeilingTests(unittest.TestCase):
    """§7 — requested grants must sit inside the creator's own authority."""

    def test_super_admin_is_unrestricted_but_level_must_be_known(self):
        check_delegation(
            ACCOUNT_LEVEL_SUPER_ADMIN,
            ACCOUNT_LEVEL_SUPER_EMPLOYEE,
            ["settings.manage", "people.security"],
            set(),
        )
        with self.assertRaises(BusinessLogicException):
            check_delegation(ACCOUNT_LEVEL_SUPER_ADMIN, "REGIONAL_BOSS", [], set())

    def test_creating_a_forbidden_level_is_403(self):
        with self.assertRaises(ForbiddenException):
            check_delegation(
                ACCOUNT_LEVEL_SUPER_EMPLOYEE,
                ACCOUNT_LEVEL_ADMIN,
                ["catalogue.view"],
                {"catalogue.view"},
            )

    def test_admin_can_delegate_only_its_own_capabilities(self):
        check_delegation(
            ACCOUNT_LEVEL_ADMIN,
            ACCOUNT_LEVEL_EMPLOYEE,
            ["catalogue.view"],
            {"catalogue.view", "orders.view"},
        )
        with self.assertRaises(ForbiddenException) as ctx:
            check_delegation(
                ACCOUNT_LEVEL_ADMIN,
                ACCOUNT_LEVEL_EMPLOYEE,
                ["media.delete"],
                {"catalogue.view"},
            )
        self.assertIn("media.delete", str(ctx.exception.message))

    def test_super_employee_never_gains_admin_domain_authority(self):
        # Even if the creator somehow holds settings.manage, a SUPER_EMPLOYEE
        # ceiling intersects the employee-domain capabilities only.
        with self.assertRaises(ForbiddenException):
            check_delegation(
                ACCOUNT_LEVEL_SUPER_EMPLOYEE,
                ACCOUNT_LEVEL_SUPER_EMPLOYEE,
                ["settings.manage"],
                {"settings.manage"},
            )
        self.assertEqual(
            ADMIN_ONLY_CAPABILITIES,
            frozenset({"settings.manage", "people.security"}),
        )

    def test_super_employee_may_delegate_employee_domain_sets(self):
        check_delegation(
            ACCOUNT_LEVEL_SUPER_EMPLOYEE,
            ACCOUNT_LEVEL_EMPLOYEE,
            ["catalogue.view", "product_workflow.review"],
            ["catalogue.view", "product_workflow.review"],
        )

    def test_wildcard_creator_delegates_anything_below_super(self):
        # An ADMIN row that literally holds "*" behaves as the override —
        # the SUPER_ADMIN path above (this is the leak-fix contract: the
        # server-side resolver no longer adds "*" for ADMIN accounts, so in
        # practice only SUPER_ADMIN holds it; the mechanism stays honest).
        check_delegation(
            ACCOUNT_LEVEL_ADMIN,
            ACCOUNT_LEVEL_SUPER_EMPLOYEE,
            list(ALL_CAPABILITIES),
            {"*"},
        )

    def test_legacy_grants_resolve_through_the_ceiling_expansion(self):
        # A creator holding only legacy granular codes can still delegate the
        # capabilities those codes roll up into.
        check_delegation(
            ACCOUNT_LEVEL_ADMIN,
            ACCOUNT_LEVEL_EMPLOYEE,
            ["orders.manage"],
            ["orders.return", "orders.fulfill"],
        )
        # ...but not ones they do not effectively hold.
        with self.assertRaises(ForbiddenException):
            check_delegation(
                ACCOUNT_LEVEL_ADMIN,
                ACCOUNT_LEVEL_EMPLOYEE,
                ["orders.manage"],
                ["returns.manage"],
            )


class ExpansionCompatTests(unittest.TestCase):
    """§20 — bidirectional legacy mapping; both vocabularies check equal."""

    def test_capability_grant_satisfies_legacy_check(self):
        eff = expand_effective_permissions(["catalogue.view"])
        self.assertIn("products.view", eff)
        self.assertIn("catalogue.view", eff)

    def test_legacy_grant_satisfies_capability_check(self):
        eff = expand_effective_permissions(["employees.edit"])
        self.assertIn("people.manage", eff)
        self.assertIn("employees.edit", eff)

    def test_wildcard_is_unbounded_short_circuit(self):
        self.assertEqual(expand_effective_permissions(["*", "anything"]), {"*", "anything"})

    def test_every_capability_maps_to_itself(self):
        for cap in ALL_CAPABILITIES:
            self.assertEqual(LEGACY_TO_CAPABILITY.get(cap), cap)

    def test_normalize_grants_is_idempotent_and_dedupes(self):
        once = normalize_grants(["people.manage", "catalogue.view", "people.manage"])
        twice = normalize_grants(once)
        self.assertEqual(once, twice)
        self.assertEqual(len(once), len(set(once)))


class UnifiedSignInWiringTests(unittest.TestCase):
    """§6 — one canonical staff login; enumeration-safe; routes by level."""

    def test_endpoint_registered_once_on_the_auth_router(self):
        from app.api.v1 import auth as auth_api

        source = inspect.getsource(auth_api)
        self.assertIn('"/staff/sign-in"', source)
        self.assertIn("sign_in_staff", source)

    def test_service_distinguishes_nothing_between_unknown_and_wrong_password(self):
        from app.services.auth.auth_service import AuthService

        source = inspect.getsource(AuthService.sign_in_staff)
        # The SAME message for unknown identifier / customer / wrong password.
        message = "Those credentials don't match a staff account."
        self.assertGreaterEqual(source.count(message), 2)

    def test_surface_is_derived_server_side_from_user_type(self):
        from app.services.auth.auth_service import AuthService

        source = inspect.getsource(AuthService.sign_in_staff)
        self.assertIn('user.user_type == "admin"', source)
        self.assertIn("surface=surface", source)

    def test_dto_carries_one_new_claim_and_the_canonical_fields(self):
        from app.schemas.auth.token import UserDTO

        fields = set(UserDTO.model_fields)
        for expected in ("account_level", "workspace", "business_role", "permissions"):
            self.assertIn(expected, fields)
        # No redundant is_* boolean claims were introduced.
        for leaked in ("is_super_admin", "is_admin", "is_super_employee", "is_employee", "is_staff"):
            self.assertNotIn(leaked, fields)

    def test_workspace_and_level_come_from_the_resolver_not_the_client(self):
        from app.services.auth.auth_service import AuthService

        source = inspect.getsource(AuthService._build_user_dto)
        self.assertIn("resolve_account_level", source)
        self.assertIn("workspace", source)

    def test_staff_router_requires_the_unified_dependency_on_accounts_api(self):
        from app.api.v1 import employees as employees_api

        source = inspect.getsource(employees_api)
        self.assertIn("get_current_account_manager", source)
        self.assertIn("require_staff_permission", source)
        # the no-op permissions PUT got real persistence
        self.assertIn("update_employee_permissions", source)

    def test_capabilities_endpoint_publishes_the_catalogue(self):
        from app.api.v1 import admin as admin_api

        source = inspect.getsource(admin_api)
        self.assertIn('"/capabilities"', source)

        # The app exposes the route under the versioned prefix.
        from app.main import app as main_app

        paths = {getattr(r, "path", "") for r in main_app.routes}
        self.assertTrue(
            any(p.endswith("/auth/staff/sign-in") for p in paths),
            f"staff sign-in route missing in {sorted(p for p in paths if 'auth' in p)}",
        )
        self.assertTrue(any(p.endswith("/admin/capabilities") for p in paths))


class ResolverIntegrityTests(unittest.TestCase):
    """§8 — cached, no N+1; the ADMIN wildcard leak stays fixed."""

    def test_permissions_come_from_the_shared_cached_resolver(self):
        from app.services.auth.auth_service import AuthService

        source = inspect.getsource(AuthService._get_user_roles_and_permissions)
        # Delegated to the dependency resolver (single implementation).
        self.assertIn("from app.dependencies import get_user_roles_and_permissions", source)

    def test_admin_permission_resolution_never_grants_wildcard_by_default(self):
        from app.services.auth.auth_service import AuthService

        source = inspect.getsource(AuthService._get_user_roles_and_permissions)
        # The docstring MAY mention the removed wildcard; the CODE must not.
        code = source.split('"""', 2)[2] if source.count('"""') >= 2 else source
        self.assertNotIn('"*"', code)

    def test_build_dto_derives_level_via_the_single_helper(self):
        from app.services.auth.auth_service import AuthService

        source = inspect.getsource(AuthService._build_user_dto)
        self.assertIn("resolve_account_level", source)

    def test_cache_invalidation_happens_on_every_grant_write(self):
        from app.services.employee import employee_service

        source = inspect.getsource(employee_service)
        writes = ("create_employee", "update_employee", "update_employee_permissions", "assign_role")
        for name in writes:
            fn = getattr(employee_service.EmployeeService, name, None)
            if fn is None:
                continue
            body = inspect.getsource(fn)
            self.assertIn(
                "invalidate_rbac_cache",
                body,
                f"{name} must invalidate the shared rbac cache after writing grants",
            )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
