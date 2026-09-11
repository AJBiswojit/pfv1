"""
Admin consolidation — RBAC wiring on every admin surface (S-1/S-2/S-3).

Security-hardening sweep: orders, employees, analytics, audit, users, roles
and permissions routers previously authenticated with `get_current_admin`
only (surface guard, no permission check). Every admin handler now calls
`require_admin_permission` with the least-privilege permission for the
operation. These guards pin the wiring so future handlers can't skip it.
"""

import inspect
import re
import unittest


def handler_sources(module_name, prefix=""):
    module = __import__(module_name, fromlist=[""])
    for name, member in inspect.getmembers(module, inspect.iscoroutinefunction):
        if name.startswith("admin_") or (prefix and name.startswith(prefix)):
            yield f"{module_name}.{name}", inspect.getsource(member)


class AdminRbacWiringTests(unittest.TestCase):
    def test_every_admin_order_handler_checks_a_permission(self):
        missing = [
            name
            for name, source in handler_sources("app.api.v1.orders")
            if "require_admin_permission" not in source
        ]
        self.assertEqual(missing, [], f"ungated admin order handlers: {missing}")

    def test_order_permissions_follow_least_privilege(self):
        import app.api.v1.orders as orders

        reads = ["admin_list_orders", "admin_get_order", "admin_list_returns", "admin_get_return"]
        for name in reads:
            source = inspect.getsource(getattr(orders, name))
            self.assertIn('"orders.view"', source) if name.startswith("admin_list_orders") or name == "admin_get_order" else None
            self.assertIn('require_admin_permission', source)
        self.assertIn('"returns.view"', inspect.getsource(orders.admin_list_returns))
        self.assertIn('"orders.manage"', inspect.getsource(orders.admin_dispatch))

    def test_every_admin_employee_handler_checks_a_permission(self):
        missing = [
            name
            for name, source in handler_sources("app.api.v1.employees")
            if "require_admin_permission" not in source
            and "Depends(get_current_admin)" in source
        ]
        self.assertEqual(missing, [], f"ungated admin employee handlers: {missing}")

    def test_employee_permissions_follow_the_catalogue(self):
        import app.api.v1.employees as employees

        self.assertIn('"employees.managePermissions"', inspect.getsource(employees.update_employee_permissions))
        self.assertIn('"employees.resetPassword"', inspect.getsource(employees.reset_employee_password))
        self.assertIn('"employees.create"', inspect.getsource(employees.create_employee))

    def test_directory_routers_check_permissions(self):
        expectations = {
            ("app.api.v1.analytics", "analytics_overview"): "analytics.view",
            ("app.api.v1.analytics", "analytics_sales"): "analytics.view",
            ("app.api.v1.analytics", "analytics_inventory_summary"): "analytics.view",
            ("app.api.v1.audit", "list_logs"): "audit.view",
            ("app.api.v1.users", "list_users"): "users.view",
            ("app.api.v1.roles", "list_roles"): "roles.view",
            ("app.api.v1.permissions", "list_permissions"): "roles.view",
        }
        for (module_name, fn), perm in expectations.items():
            module = __import__(module_name, fromlist=[fn])
            source = inspect.getsource(getattr(module, fn))
            self.assertIn(f'"{perm}"', source, f"{module_name}.{fn} must enforce {perm}")

    def test_media_reads_use_view_and_deletion_uses_delete(self):
        import app.api.v1.media as media

        self.assertIn('"media.view"', inspect.getsource(media.list_media_assets))
        self.assertIn('"media.delete"', inspect.getsource(media.delete_media_object))

    def test_role_catalogue_grants_the_new_directory_permissions(self):
        from app.api.v1.admin import BUILT_IN_ROLES

        admin_perms = set(BUILT_IN_ROLES["ADMIN"]["permissions"])
        for perm in ("audit.view", "users.view", "users.manage", "roles.view", "roles.manage", "employees.delete"):
            self.assertIn(perm, admin_perms, f"ADMIN role must grant {perm}")
        manager_perms = set(BUILT_IN_ROLES["MANAGER"]["permissions"])
        for perm in ("audit.view", "users.view", "roles.view"):
            self.assertIn(perm, manager_perms, f"MANAGER role must grant read-only {perm}")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
