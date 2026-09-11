"""Staff sign-in against the account-level users schema.

These tests prove the login failure mode (SELECT of ``users.account_level``)
is gone once the columns exist, and that the existing staff entry point
keeps working for a seeded admin:

  * an existing admin row can be loaded when account_level exists
  * staff sign-in no longer crashes with a missing-column error
  * existing admin authentication still works
  * account_level is returned/resolved correctly
  * legacy users are not deleted
  * invalid credentials still fail normally
  * account-level restrictions remain enforced
"""

from __future__ import annotations

import importlib
import importlib.util
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import event, inspect as sa_inspect, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None
TEST_PASSWORD = "SeededAdminPass1!"
_TEST_HASH = None


def _hashed_password() -> str:
    global _TEST_HASH
    if _TEST_HASH is None:
        from app.core.security import hash_password

        _TEST_HASH = hash_password(TEST_PASSWORD)
    return _TEST_HASH


def _backend_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "alembic" / "versions").is_dir():
            return parent
    raise RuntimeError("backend/alembic/versions not found from test path")


BACKEND_ROOT = _backend_root()
R1_PATH = BACKEND_ROOT / "alembic" / "versions" / "r1a2b3c4d5e6_add_account_level_columns.py"


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover - dialect glue
    return "JSON"


def _load_r1():
    spec = importlib.util.spec_from_file_location("r1_account_level_columns", R1_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class StaffSignInAccountLevelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.auth.user import UserModel
        from app.models.base import Base
        from app.models.employee.employee import EmployeeProfileModel
        from app.models.rbac.role import RoleModel
        from app.models.rbac.user_role import UserRoleModel

        self._UserModel = UserModel
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-staff-signin-")
        self.main_db = os.path.join(self._tmp.name, "main.sqlite")
        self.schema_db = os.path.join(self._tmp.name, "pratikshya.sqlite")
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{self.main_db}")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _attach(dbapi_conn, _record):  # pragma: no cover - driver hook
            cursor = dbapi_conn.cursor()
            cursor.execute(f"ATTACH DATABASE '{self.schema_db}' AS pratikshya")
            cursor.close()

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)

        self.password = TEST_PASSWORD
        hashed = _hashed_password()
        now = datetime.now(timezone.utc)

        async with self.Session() as session:
            super_admin = UserModel(
                email="seeded-super@pratikshya.test",
                full_name="Seeded Super Admin",
                hashed_password=hashed,
                user_type="admin",
                account_level="SUPER_ADMIN",
                permission_mode="role",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
                created_at=now,
                updated_at=now,
            )
            admin = UserModel(
                email="seeded-admin@pratikshya.test",
                full_name="Seeded Admin",
                hashed_password=hashed,
                user_type="admin",
                account_level="ADMIN",
                permission_mode="role",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
                created_at=now,
                updated_at=now,
            )
            employee = UserModel(
                email="seeded-employee@pratikshya.test",
                full_name="Seeded Employee",
                hashed_password=hashed,
                user_type="employee",
                account_level="EMPLOYEE",
                permission_mode="role",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
                created_at=now,
                updated_at=now,
            )
            customer = UserModel(
                email="seeded-customer@pratikshya.test",
                full_name="Seeded Customer",
                hashed_password=hashed,
                user_type="customer",
                account_level=None,
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
                created_at=now,
                updated_at=now,
            )
            session.add_all([super_admin, admin, employee, customer])
            await session.flush()

            sa_role = RoleModel(
                name="SUPER_ADMIN",
                description="system",
                is_system=True,
            )
            admin_role = RoleModel(
                name="ADMIN",
                description="system",
                is_system=True,
            )
            session.add_all([sa_role, admin_role])
            await session.flush()
            session.add(UserRoleModel(user_id=super_admin.id, role_id=sa_role.id))
            session.add(UserRoleModel(user_id=admin.id, role_id=admin_role.id))
            session.add(
                EmployeeProfileModel(
                    user_id=employee.id,
                    employee_code="PF-EMP-0001",
                    designation="Stylist",
                )
            )
            self.super_admin_id = super_admin.id
            self.admin_id = admin.id
            self.employee_id = employee.id
            self.customer_id = customer.id
            await session.commit()

        self._user_count_before = 4

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _sign_in(self, identifier: str, password: str):
        from app.schemas.auth.login import StaffLoginRequest
        from app.services.auth.auth_service import AuthService

        async with self.Session() as session:
            service = AuthService(session)
            return await service.sign_in_staff(
                StaffLoginRequest(identifier=identifier, password=password)
            )

    async def test_existing_admin_row_loads_when_account_level_exists(self):
        UserModel = self._UserModel
        async with self.Session() as session:
            user = (
                await session.execute(
                    select(UserModel).where(UserModel.email == "seeded-admin@pratikshya.test")
                )
            ).scalar_one()
            self.assertEqual(user.account_level, "ADMIN")
            self.assertEqual(user.permission_mode, "role")
            self.assertIsNone(user.custom_permissions)
            self.assertEqual(user.hashed_password is not None, True)

    async def test_staff_sign_in_does_not_raise_missing_column(self):
        from sqlalchemy.exc import ProgrammingError, OperationalError

        try:
            resp = await self._sign_in("seeded-admin@pratikshya.test", self.password)
        except (ProgrammingError, OperationalError) as exc:
            self.fail(f"staff sign-in crashed with a SQL column error: {exc}")
        self.assertTrue(resp.ok)
        self.assertIsNotNone(resp.admin)
        self.assertEqual(resp.admin.account_level, "ADMIN")
        self.assertEqual(resp.admin.accountLevel, "ADMIN")
        self.assertEqual(resp.admin.workspace, "admin")

    async def test_existing_super_admin_authentication_still_works(self):
        resp = await self._sign_in("seeded-super@pratikshya.test", self.password)
        self.assertTrue(resp.ok)
        self.assertEqual(resp.admin.account_level, "SUPER_ADMIN")
        self.assertEqual(resp.admin.workspace, "admin")
        self.assertIn("SUPER_ADMIN", resp.admin.roles)

    async def test_account_level_is_resolved_from_the_column(self):
        from app.dependencies import resolve_account_level

        UserModel = self._UserModel
        async with self.Session() as session:
            admin = (
                await session.execute(select(UserModel).where(UserModel.id == self.admin_id))
            ).scalar_one()
            employee = (
                await session.execute(select(UserModel).where(UserModel.id == self.employee_id))
            ).scalar_one()
            self.assertEqual(resolve_account_level(admin, ["ADMIN"]), "ADMIN")
            self.assertEqual(resolve_account_level(employee, []), "EMPLOYEE")

    async def test_legacy_users_are_not_deleted_by_sign_in(self):
        await self._sign_in("seeded-admin@pratikshya.test", self.password)
        UserModel = self._UserModel
        async with self.Session() as session:
            count = (
                await session.execute(select(UserModel.id))
            ).scalars().all()
            self.assertEqual(len(count), self._user_count_before)
            ids = set(count)
            self.assertEqual(
                ids,
                {self.super_admin_id, self.admin_id, self.employee_id, self.customer_id},
            )

    async def test_invalid_credentials_still_fail_normally(self):
        from app.core.exceptions import UnauthorizedException

        with self.assertRaises(UnauthorizedException) as wrong:
            await self._sign_in("seeded-admin@pratikshya.test", "DefinitelyWrongPass1!")
        self.assertEqual(wrong.exception.message, "Those credentials don't match a staff account.")

        with self.assertRaises(UnauthorizedException) as unknown:
            await self._sign_in("nobody@pratikshya.test", self.password)
        self.assertEqual(unknown.exception.message, "Those credentials don't match a staff account.")

        with self.assertRaises(UnauthorizedException) as customer:
            await self._sign_in("seeded-customer@pratikshya.test", self.password)
        self.assertEqual(customer.exception.message, "Those credentials don't match a staff account.")

    async def test_account_level_restrictions_remain_enforced(self):
        from app.core.exceptions import ForbiddenException
        from app.core.rbac import (
            ACCOUNT_LEVEL_ADMIN,
            ACCOUNT_LEVEL_EMPLOYEE,
            ACCOUNT_LEVEL_SUPER_ADMIN,
            can_create,
        )
        from app.dependencies import get_current_account_manager, require_super_admin_user

        self.assertFalse(can_create(ACCOUNT_LEVEL_ADMIN, ACCOUNT_LEVEL_SUPER_ADMIN))
        self.assertFalse(can_create(ACCOUNT_LEVEL_EMPLOYEE, ACCOUNT_LEVEL_ADMIN))
        self.assertTrue(can_create(ACCOUNT_LEVEL_SUPER_ADMIN, ACCOUNT_LEVEL_ADMIN))

        UserModel = self._UserModel
        async with self.Session() as session:
            admin = (
                await session.execute(select(UserModel).where(UserModel.id == self.admin_id))
            ).scalar_one()
            employee = (
                await session.execute(select(UserModel).where(UserModel.id == self.employee_id))
            ).scalar_one()
            super_admin = (
                await session.execute(select(UserModel).where(UserModel.id == self.super_admin_id))
            ).scalar_one()

            await require_super_admin_user(super_admin, session)
            with self.assertRaises(ForbiddenException):
                await require_super_admin_user(admin, session)

            await get_current_account_manager(admin, session)
            with self.assertRaises(ForbiddenException):
                await get_current_account_manager(employee, session)


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class StaffSignInMissingColumnRecoveryTests(unittest.IsolatedAsyncioTestCase):
    """Reproduce the UndefinedColumnError on a pre-migration users table, then recover."""

    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.auth.user import UserModel
        from app.models.base import Base

        self._UserModel = UserModel
        self.password = TEST_PASSWORD
        self.hashed = _hashed_password()
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-staff-drift-")
        self.main_db = os.path.join(self._tmp.name, "main.sqlite")
        self.schema_db = os.path.join(self._tmp.name, "pratikshya.sqlite")
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{self.main_db}")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _attach(dbapi_conn, _record):  # pragma: no cover - driver hook
            cursor = dbapi_conn.cursor()
            cursor.execute(f"ATTACH DATABASE '{self.schema_db}' AS pratikshya")
            cursor.close()

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Simulate the real-PostgreSQL drift: users exists, the three
            # account-level columns do not.
            for column in ("custom_permissions", "permission_mode", "account_level"):
                await conn.execute(text(f"ALTER TABLE pratikshya.users DROP COLUMN {column}"))

        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        now = datetime.now(timezone.utc).isoformat()
        async with self.engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    INSERT INTO pratikshya.users (
                        id, created_at, updated_at, email, full_name,
                        hashed_password, user_type, status, is_verified,
                        force_password_change
                    ) VALUES (
                        'legacy-admin', :now, :now,
                        'legacy-admin@pratikshya.test', 'Legacy Admin',
                        :hashed, 'admin', 'ACTIVE', 1, 0
                    )
                    """
                ),
                {"now": now, "hashed": self.hashed},
            )

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def test_orm_select_fails_without_account_level_then_recovers(self):
        from sqlalchemy.exc import OperationalError, ProgrammingError

        UserModel = self._UserModel
        async with self.Session() as session:
            with self.assertRaises((OperationalError, ProgrammingError)) as ctx:
                await session.execute(select(UserModel))
            self.assertIn("account_level", str(ctx.exception).lower())

        apply = _load_r1().apply_account_level_columns
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda sync_conn: apply(sync_conn))

        async with self.Session() as session:
            user = (
                await session.execute(
                    select(UserModel).where(UserModel.email == "legacy-admin@pratikshya.test")
                )
            ).scalar_one()
            self.assertEqual(user.id, "legacy-admin")
            self.assertEqual(user.account_level, "ADMIN")
            self.assertEqual(user.hashed_password, self.hashed)

        from app.schemas.auth.login import StaffLoginRequest
        from app.services.auth.auth_service import AuthService

        async with self.Session() as session:
            service = AuthService(session)
            resp = await service.sign_in_staff(
                StaffLoginRequest(
                    identifier="legacy-admin@pratikshya.test",
                    password=self.password,
                )
            )
        self.assertTrue(resp.ok)
        self.assertEqual(resp.admin.account_level, "ADMIN")

        async with self.engine.connect() as conn:
            cols = await conn.run_sync(
                lambda sync_conn: {
                    c["name"] for c in sa_inspect(sync_conn).get_columns("users", schema="pratikshya")
                }
            )
        self.assertIn("account_level", cols)
        self.assertIn("permission_mode", cols)
        self.assertIn("custom_permissions", cols)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
