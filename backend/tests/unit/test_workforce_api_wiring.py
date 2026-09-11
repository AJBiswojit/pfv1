"""
Workforce API wiring pins (controlled-extension pass).

Same source-inspection convention as `test_admin_consolidation_rbac`: every
new mutation surface must authenticate through the SHARED dependency layer,
carry the right capability code, and the legacy admin attendance handlers
must not regress into `employees.edit`-only guards (the 4×-duplicated
permission line that shipped before this pass is pinned away forever here).
"""

import inspect
import re
import unittest


def handler_names(module_name):
    module = __import__(module_name, fromlist=[""])
    return {
        name: inspect.getsource(member)
        for name, member in inspect.getmembers(module, inspect.isfunction)
    }


class AttendanceSelfRoutesTests(unittest.TestCase):
    def test_punch_routes_use_employee_identity_and_capability_codes(self):
        src = handler_names("app.api.v1.attendance")
        check_in = src["employee_check_in"]
        check_out = src["employee_check_out"]
        self.assertIn("get_current_employee", check_in)
        self.assertIn("get_current_employee", check_out)
        self.assertIn('"attendance.checkin"', check_in)
        self.assertIn('"attendance.checkout"', check_out)
        # Identity is never a request parameter on self routes.
        self.assertNotIn("employee_id", check_in)
        self.assertNotIn("employee_id", check_out)

    def test_history_and_today_are_self_scoped(self):
        src = handler_names("app.api.v1.attendance")
        for name in ("employee_attendance_history", "employee_attendance_today"):
            self.assertIn("get_current_employee", src[name], name)
        self.assertIn("get_current_account_manager", src["admin_attendance_day"])
        self.assertIn('"attendance.view"', src["admin_attendance_day"])


class LeaveRoutesTests(unittest.TestCase):
    def test_leave_route_authorization(self):
        src = handler_names("app.api.v1.leave")
        self.assertIn("get_current_employee", src["request_leave"])
        self.assertIn('"leave.create"', src["request_leave"])
        self.assertIn("get_current_account_manager", src["admin_list_leave"])
        self.assertIn('"leave.view"', src["admin_list_leave"])
        # The decision route defers to the service so the SELF-REVIEW ban and
        # any-of reviewer check run in one place:
        self.assertIn("get_current_account_manager", src["admin_decide_leave"])
        self.assertIn("decide_leave", src["admin_decide_leave"])

    def test_service_blocks_self_review_and_validates_transitions(self):
        from app.services.employee import workforce_service as ws

        service_src = inspect.getsource(ws.WorkforceService.decide_leave)
        self.assertIn("cannot review your own leave request", service_src)
        self.assertIn("validate_leave_transition", service_src)
        self.assertIn("validate_review_note", service_src)
        cancel_src = inspect.getsource(ws.WorkforceService.cancel_leave)
        self.assertIn("Only a pending request can be cancelled", cancel_src)

    def test_leave_is_bounded(self):
        from app.services.employee import workforce_service as ws

        self.assertLessEqual(ws.MAX_LEAVE_DAYS, 60)
        self.assertLessEqual(ws.MAX_PAGE_SIZE, 100)


class AdminAttendanceGuardTests(unittest.TestCase):
    """The pre-existing employees.py attendance block had FOUR copies of
    `employees.edit` (and never `attendance.*`). Pinned fixed."""

    def setUp(self):
        self.src = handler_names("app.api.v1.employees")

    def test_create_attendance_guard(self):
        body = self.src["create_attendance"]
        # the 4x-duplicated literal AND the employees.edit-only gate are gone;
        # attendance.correct leads, employees.edit remains an accepted alias
        # for the consolidated Admin role (any-of, single call).
        self.assertEqual(body.count('require_admin_permission(admin, db, "employees.edit")'), 0)
        self.assertIn("require_staff_permission_any(admin, db, \"attendance.correct\", \"employees.edit\")", body)
        self.assertIn("get_current_account_manager", body)
        self.assertIn("actor=admin", body)

    def test_list_update_delete_guards(self):
        self.assertIn('"attendance.view", "employees.view"', self.src["list_attendance"])
        self.assertIn('"attendance.correct", "employees.edit"', self.src["update_attendance"])
        self.assertIn('"attendance.manage", "employees.edit"', self.src["delete_attendance"])
        for name in ("list_attendance", "update_attendance", "delete_attendance"):
            self.assertIn("get_current_account_manager", self.src[name], name)

    def test_service_create_attendance_is_an_upsert(self):
        from app.services.employee.employee_service import EmployeeService

        body = inspect.getsource(EmployeeService.create_attendance)
        self.assertIn("existing", body)
        self.assertIn("uq_employee_attendance_employee_date", body)


class DenialAuditTests(unittest.TestCase):
    def test_capability_refusals_write_to_the_one_journal(self):
        import app.dependencies as deps

        denial_helper = inspect.getsource(deps._audit_permission_denial)
        self.assertIn("record_detached", denial_helper)
        for fn in (deps.require_permission_for_user, deps.require_admin_permission):
            body = inspect.getsource(fn)
            self.assertIn("_audit_permission_denial", fn.__name__ and body, fn.__name__)

    def test_no_credentials_can_reach_the_diary(self):
        from app.services.audit.audit_service import redact

        clean = redact({"password": "x", "user": {"token": "t", "keep": 1}})
        self.assertEqual(clean["password"], "[redacted]")
        self.assertEqual(clean["user"]["token"], "[redacted]")
        self.assertEqual(clean["user"]["keep"], 1)


class RouterRegistrationTests(unittest.TestCase):
    def test_workforce_routers_are_registered(self):
        from app.api.v1.router import api_router

        paths = {getattr(r, "path", "") for r in api_router.routes}
        for expected in (
            "/employee/attendance/check-in",
            "/employee/attendance/check-out",
            "/employee/attendance/today",
            "/employee/attendance",
            "/admin/attendance/day",
            "/employee/leave",
            "/employee/leave/{leave_id}/cancel",
            "/admin/leave",
            "/admin/leave/{leave_id}/decision",
            "/employee/performance",
            "/admin/performance",
            "/admin/performance/{performance_id}",
        ):
            self.assertIn(expected, paths)

    def test_legacy_notifications_router_is_gone(self):
        import os

        self.assertFalse(os.path.exists("app/api/v1/notifications.py"))
        from app.api.v1 import router as router_module

        self.assertNotIn("notifications_router", inspect.getsource(router_module))


class LeaveModelTests(unittest.TestCase):
    def test_model_and_migration_head(self):
        from app.models.employee import LeaveModel
        from app.models.base import Base

        table = Base.metadata.tables["pratikshya.employee_leave"]
        self.assertEqual({c.name for c in table.primary_key}, {"id"})
        cols = set(table.columns.keys())
        for expected in (
            "employee_id", "leave_type", "start_date", "end_date", "days",
            "reason", "status", "requested_at", "reviewed_at", "reviewed_by", "review_note",
        ):
            self.assertIn(expected, cols)
        # employee_attendance guard lives on its own table:
        att = Base.metadata.tables["pratikshya.employee_attendance"]
        self.assertTrue(
            any(
                i.unique and [c.name for c in i.columns] == ["employee_id", "attendance_date"]
                for i in att.indexes
            ),
            "unique (employee_id, attendance_date) index missing on the model",
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
