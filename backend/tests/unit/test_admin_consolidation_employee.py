"""
Admin consolidation — EmployeeService deduplication (D-7).

The service file defined `EmployeeService` TWICE; the second definition
silently shadowed the first (~470 dead lines, different allowed-status
vocabularies). The shadowed first class was the only one carrying
`update_employee_permissions` — so `PUT /admin/employees/{id}/permissions`
(a live, frontend-called endpoint) raised AttributeError at runtime.
The dedupe keeps ONE class with the permissions method ported in.
"""

import unittest


class EmployeeServiceDedupTests(unittest.TestCase):
    def test_exactly_one_definition_with_the_permissions_method(self):
        import inspect

        import app.services.employee.employee_service as module

        definitions = [
            name for name, member in inspect.getmembers(module, inspect.isclass)
            if name == "EmployeeService" and member.__module__ == module.__name__
        ]
        source = inspect.getsource(module)
        self.assertEqual(
            source.count("class EmployeeService:"),
            1,
            "EmployeeService must be defined exactly once",
        )
        self.assertEqual(len(definitions), 1)

        from app.services.employee.employee_service import EmployeeService

        self.assertTrue(
            hasattr(EmployeeService, "update_employee_permissions"),
            "the live class must carry the permissions update (the shadowed "
            "copy used to own it, breaking PUT /admin/employees/{id}/permissions)",
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
