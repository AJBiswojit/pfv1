"""
Regression pins for the 2026-09 Auth/RBAC bug-fix pass.

Issue 1 — ACCOUNT CREATION REQUIRES DATE/TIME (422 on joiningDate="")
Issue 2 — EMPLOYEE CONTROL SECTION NOT GROUPED (second permission system)
Issue 3 — SUPER_EMPLOYEE PASSWORD SET → BLANK PAGE (forced-password re-auth)
"""
import inspect
import unittest


class Issue1JoiningDateOptionalTests(unittest.TestCase):
    """Joining date must be optional for every account level."""

    def test_create_request_empty_string_coerced_to_none(self):
        from app.schemas.employee.employee import EmployeeCreateRequest

        req = EmployeeCreateRequest(
            firstName="A", lastName="B", email="a@b.com", joiningDate=""
        )
        self.assertIsNone(req.joiningDate)

    def test_create_request_whitespace_coerced_to_none(self):
        from app.schemas.employee.employee import EmployeeCreateRequest

        req = EmployeeCreateRequest(
            firstName="A", lastName="B", email="a@b.com", joiningDate="   "
        )
        self.assertIsNone(req.joiningDate)

    def test_create_request_omitted_is_none(self):
        from app.schemas.employee.employee import EmployeeCreateRequest

        req = EmployeeCreateRequest(firstName="A", lastName="B", email="a@b.com")
        self.assertIsNone(req.joiningDate)

    def test_create_request_valid_date_preserved(self):
        from app.schemas.employee.employee import EmployeeCreateRequest

        req = EmployeeCreateRequest(
            firstName="A", lastName="B", email="a@b.com", joiningDate="2024-01-15"
        )
        self.assertEqual(str(req.joiningDate), "2024-01-15")

    def test_update_request_empty_string_coerced_to_none(self):
        from app.schemas.employee.employee import EmployeeUpdateRequest

        req = EmployeeUpdateRequest(joiningDate="")
        self.assertIsNone(req.joiningDate)

    def test_schema_exposes_date_field_as_optional(self):
        from app.schemas.employee.employee import EmployeeCreateRequest

        # Field should allow None; the validator must be mode="before" so that
        # an empty string never reaches the date parser (which would 422).
        fields = EmployeeCreateRequest.model_fields
        self.assertIn("joiningDate", fields)
        # Check that a validator is registered for the field
        src = inspect.getsource(EmployeeCreateRequest)
        self.assertIn("_coerce_empty_joining_date", src)
        self.assertIn('mode="before"', src)


class Issue2EmployeeGroupedControlTests(unittest.TestCase):
    """EMPLOYEE must share the SAME grouped control architecture."""

    def test_frontend_employee_pages_use_grouped_catalogue(self):
        # Source pin: the frontend pages must render the capability groups for
        # EMPLOYEE (no second legacy PERMISSION_CATALOGUE branch).
        from pathlib import Path

        repo = Path(__file__).resolve().parents[3]
        create_src = (repo / "frontend/src/pages/admin/employees/AdminEmployeeCreate.jsx").read_text()
        edit_src = (repo / "frontend/src/pages/admin/employees/AdminEmployeeEdit.jsx").read_text()
        detail_src = (repo / "frontend/src/pages/admin/employees/AdminEmployeeDetail.jsx").read_text()

        for src, name in [
            (create_src, "AdminEmployeeCreate.jsx"),
            (edit_src, "AdminEmployeeEdit.jsx"),
            (detail_src, "AdminEmployeeDetail.jsx"),
        ]:
            self.assertIn("const capabilityDriven = true", src, f"{name} must be unified")
            self.assertIn("CAPABILITY_GROUPS", src, f"{name} must use CAPABILITY_GROUPS")
            self.assertNotIn(
                "accountLevel !== ACCOUNT_LEVELS.EMPLOYEE",
                src,
                f"{name} still branches on EMPLOYEE — would keep a second system",
            )

        self.assertIn("catalogue={CAPABILITY_GROUPS}", create_src)
        self.assertIn("Delegated capability set", detail_src)
        self.assertNotIn("Role defaults", detail_src)

    def test_capability_groups_include_people_security(self):
        # The ceiling contract requires that SUPER_EMPLOYEE never receive the
        # admin-domain authorities (settings.manage / people.security) even
        # when the creator “holds” them — PEOPLE group must list the code.
        from app.core.rbac import ALL_CAPABILITIES, ADMIN_ONLY_CAPABILITIES

        self.assertIn("people.security", ALL_CAPABILITIES)
        self.assertIn("people.security", ADMIN_ONLY_CAPABILITIES)
        self.assertIn("settings.manage", ADMIN_ONLY_CAPABILITIES)


class Issue3ForcedPasswordBlankPageTests(unittest.TestCase):
    """Forced-password change must not leave the /employee route blank."""

    def test_change_password_keeps_access_token_for_forced_flow(self):
        from app.services.auth.auth_service import AuthService

        src = inspect.getsource(AuthService.change_password)
        # Must snapshot the flag before hashing and skip the access-token
        # blacklist for the *initial* forced set-password only — other changes
        # (voluntary rotation) must still blacklist the token.
        self.assertIn("was_forced = bool(user.force_password_change)", src)
        self.assertIn("if access_token and not was_forced:", src)
        self.assertIn("was_forced=", src)  # logged with flag

    def test_change_password_still_revokes_refresh_sessions(self):
        from app.services.auth.auth_service import AuthService

        src = inspect.getsource(AuthService.change_password)
        # All DB sessions must be revoked even for the forced flow; only the
        # current access token is kept valid for the re-auth round-trip.
        self.assertIn("UserSessionModel", src)
        self.assertIn("is_revoked = True", src)
        self.assertIn("_blacklist_token", src)
        # The conditional gate applies only to the current access token
        self.assertIn("if access_token and not was_forced:", src)
        # Must still invalidate the RBAC cache after committing
        self.assertIn("invalidate_rbac_cache", src)

    def test_frontend_reauth_after_change_password(self):
        from pathlib import Path

        repo = Path(__file__).resolve().parents[3]
        ctx = (repo / "frontend/src/context/EmployeeAuthContext.jsx").read_text()
        # Must sign back in with the new credential and restore the session
        # before the caller navigates — otherwise the next GET carries a
        # blacklisted JTI and the guard sees an unauthenticated blank.
        self.assertIn("apiSignInStaff", ctx)
        self.assertIn("apiRestoreEmployeeSession", ctx)
        # The old “just clear the local flag” implementation must be gone
        self.assertNotIn(
            "Clear force_password_change flag on the local snapshot", ctx
        )

    def test_change_password_endpoint_is_employee_scoped(self):
        # Both the generic and the employee change-password routes exist but
        # the employee portal uses the employee-scoped one.
        from app.api.v1 import auth as auth_api

        src = inspect.getsource(auth_api)
        self.assertIn('"/change-password"', src)
        self.assertIn('"/employee/change-password"', src)
        self.assertIn("employee_change_password", src)
