"""
Workforce profile loading — MissingGreenlet regression tests.

Production bug: `GET /api/v1/employee/leave` and `/api/v1/employee/performance`
(and the attendance self-routes that share the same path) loaded the signed-in
``UserModel`` through the auth dependency WITHOUT eager-loading its 1:1
``employee_profile`` relationship. ``WorkforceService._profile_for_user`` then
read ``user.employee_profile`` directly, which triggered a synchronous
lazy-load inside an async session — SQLAlchemy's ``greenlet_spawn`` was never
called, so it raised ``MissingGreenlet``.

This suite pins the fix against a real SQLAlchemy async session (SQLite, like
the other Phase-6 ORM suites) so the failure mode is exercised for real:

  1. ``_profile_for_user`` resolves the profile WITHOUT ever lazy-loading,
     including from a bare ``UserModel`` (the exact production scenario);
  2. the auth dependency eager-loads ``employee_profile`` via ``selectinload``;
  3. the employee leave and performance endpoints work for both EMPLOYEE and
     SUPER_EMPLOYEE accounts;
  4. no ``MissingGreenlet`` surfaces (a 200 — not a 500 — proves it);
  5. cross-employee data isolation is preserved (each account sees only its own
     leave requests and performance reviews).

WHY SQLITE: no PostgreSQL server is reachable in this environment. The real
declarative models run against SQLite with the same ``ATTACH DATABASE ... AS
pratikshya`` shim used by the rest of the suite. Only the six tables this path
touches are created, so no Postgres-specific DDL is compiled.
"""

import os
import tempfile
import unittest
from datetime import date, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

import importlib

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None

# Importing any model submodule imports the `app.models` package __init__,
# which registers every mapped class on `Base.metadata`.
importlib.import_module("app.models")  # noqa: E402

from app.core.error_handlers import register_error_handlers  # noqa: E402
from app.core.exceptions import NotFoundException  # noqa: E402
from app.dependencies import get_current_user, get_db  # noqa: E402
from app.models.admin.setting import SettingModel  # noqa: E402
from app.models.auth.user import UserModel  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models.employee.attendance import AttendanceModel  # noqa: E402
from app.models.employee.employee import EmployeeProfileModel  # noqa: E402
from app.models.employee.leave import LeaveModel  # noqa: E402
from app.models.employee.performance import PerformanceModel  # noqa: E402
from app.services.employee import workforce_rules as rules  # noqa: E402
from app.services.employee.workforce_service import WorkforceService  # noqa: E402


# Only the tables the workforce path touches are created, so no Postgres-only
# DDL (e.g. catalog JSONB columns) is ever compiled on SQLite.
_NEEDED_TABLES = [
    "pratikshya.users",
    "pratikshya.employee_profiles",
    "pratikshya.employee_leave",
    "pratikshya.employee_performance",
    "pratikshya.employee_attendance",
    "pratikshya.admin_setting",
]


def _user(email: str, full_name: str, account_level: str) -> UserModel:
    return UserModel(
        email=email,
        full_name=full_name,
        hashed_password="x",
        user_type="employee",
        account_level=account_level,
        status="ACTIVE",
        is_verified=True,
        force_password_change=False,
    )


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed (pip install -r requirements.txt)")
class WorkforceSqliteTestCase(unittest.IsolatedAsyncioTestCase):
    """One real async database per test, seeded with two isolated employees."""

    async def asyncSetUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-workforce-")
        self.main_db = os.path.join(self._tmp.name, "main.sqlite")
        self.schema_db = os.path.join(self._tmp.name, "pratikshya.sqlite")

        self.engine = create_async_engine(f"sqlite+aiosqlite:///{self.main_db}")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _attach(dbapi_conn, _record):  # pragma: no cover - driver hook
            cursor = dbapi_conn.cursor()
            cursor.execute(f"ATTACH DATABASE '{self.schema_db}' AS pratikshya")
            cursor.close()

        tables = [Base.metadata.tables[name] for name in _NEEDED_TABLES]
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, tables=tables)

        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        await self._seed()

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _seed(self):
        async with self.Session() as session:
            alice = _user("alice@pf.test", "Alice Employee", "EMPLOYEE")
            bob = _user("bob@pf.test", "Bob Supervisor", "SUPER_EMPLOYEE")
            session.add_all([alice, bob])
            await session.flush()

            alice_profile = EmployeeProfileModel(
                user_id=alice.id,
                employee_code="PF-0001",
                designation="Associate",
                department="Sales",
            )
            bob_profile = EmployeeProfileModel(
                user_id=bob.id,
                employee_code="PF-0002",
                designation="Supervisor",
                department="Sales",
            )
            # An employee account with NO profile — must yield a 404, never a
            # fabricated/empty profile.
            ghost = _user("ghost@pf.test", "Ghost Employee", "EMPLOYEE")
            session.add_all([alice_profile, bob_profile, ghost])
            await session.flush()

            session.add(
                LeaveModel(
                    employee_id=alice_profile.id,
                    leave_type="CASUAL",
                    start_date=date(2026, 1, 5),
                    end_date=date(2026, 1, 6),
                    days=2,
                    reason="family event",
                    status="PENDING",
                    requested_at=datetime.utcnow(),
                )
            )
            session.add(
                LeaveModel(
                    employee_id=bob_profile.id,
                    leave_type="SICK",
                    start_date=date(2026, 2, 1),
                    end_date=date(2026, 2, 1),
                    days=1,
                    reason="flu",
                    status="APPROVED",
                    requested_at=datetime.utcnow(),
                )
            )

            session.add(
                PerformanceModel(
                    employee_id=alice_profile.id,
                    review_date=date(2026, 1, 31),
                    rating=4,
                    review_period="MONTHLY",
                    reviewer_id=bob.id,
                    comments="solid month",
                )
            )
            session.add(
                PerformanceModel(
                    employee_id=bob_profile.id,
                    review_date=date(2026, 2, 28),
                    rating=5,
                    review_period="MONTHLY",
                    comments="excellent",
                )
            )

            session.add(
                AttendanceModel(
                    employee_id=alice_profile.id,
                    attendance_date=rules.day_of(rules.store_now()),
                    status="PRESENT",
                )
            )

            await session.commit()

            self.alice_id = alice.id
            self.bob_id = bob.id
            self.ghost_id = ghost.id

    # -- helpers -------------------------------------------------------------

    async def _bare_user(self, user_id: str) -> UserModel:
        """Load a UserModel the way the pre-fix auth dependency did: bare."""
        async with self.Session() as session:
            return (
                await session.execute(select(UserModel).where(UserModel.id == user_id))
            ).scalars().first()

    def _build_app(self) -> FastAPI:
        from app.api.v1.leave import router as leave_router
        from app.api.v1.performance import router as performance_router

        app = FastAPI()
        register_error_handlers(app)
        app.include_router(leave_router, prefix="/api/v1")
        app.include_router(performance_router, prefix="/api/v1")

        Session = self.Session

        async def _override_get_db():
            async with Session() as session:
                yield session

        app.dependency_overrides[get_db] = _override_get_db
        return app

    def _set_current_user(self, app: FastAPI, user_id: str) -> None:
        """Override the auth dependency with a BARE (non-eager-loaded) user —
        exactly the shape that used to trigger the lazy-load in production."""

        Session = self.Session

        async def _dep():
            async with Session() as session:
                return (
                    await session.execute(select(UserModel).where(UserModel.id == user_id))
                ).scalars().first()

        app.dependency_overrides[get_current_user] = _dep


# ===========================================================================
# 1. Relationship loading — no lazy-load, eager-load, or explicit load
# ===========================================================================

class ProfileLoadingTests(WorkforceSqliteTestCase):
    async def test_profile_for_user_resolves_a_bare_user_without_lazy_load(self):
        user = await self._bare_user(self.alice_id)
        # Precondition: the relationship is genuinely NOT loaded, so the
        # service really must resolve it through the async session.
        self.assertIn("employee_profile", sa_inspect(user).unloaded)

        async with self.Session() as session:
            profile = await WorkforceService(session)._profile_for_user(user)

        self.assertEqual(profile.employee_code, "PF-0001")
        self.assertEqual(profile.user_id, self.alice_id)

    async def test_auth_dependency_eager_loads_employee_profile(self):
        async with self.Session() as session:
            user = await get_current_user(claims={"sub": self.alice_id}, db=session)

        # The profile was pulled in the same query plan (selectinload), so it is
        # available immediately — reading it performs no additional IO.
        self.assertNotIn("employee_profile", sa_inspect(user).unloaded)
        self.assertEqual(user.employee_profile.employee_code, "PF-0001")

    async def test_profile_for_user_reuses_an_already_loaded_relationship(self):
        async with self.Session() as session:
            user = (
                await session.execute(
                    select(UserModel)
                    .where(UserModel.id == self.alice_id)
                    .options(selectinload(UserModel.employee_profile))
                )
            ).scalars().first()
            self.assertNotIn("employee_profile", sa_inspect(user).unloaded)

            profile = await WorkforceService(session)._profile_for_user(user)

        self.assertEqual(profile.employee_code, "PF-0001")

    async def test_missing_profile_raises_not_found_not_fabricated(self):
        async with self.Session() as session:
            user = (
                await session.execute(
                    select(UserModel).where(UserModel.id == self.ghost_id)
                )
            ).scalars().first()
            with self.assertRaises(NotFoundException):
                await WorkforceService(session)._profile_for_user(user)

    async def test_attendance_today_uses_the_same_profile_path(self):
        user = await self._bare_user(self.alice_id)
        async with self.Session() as session:
            record = await WorkforceService(session).today(user)
        self.assertIsNotNone(record)
        self.assertEqual(record["employeeId"], "PF-0001")


# ===========================================================================
# 2. Endpoint contract — leave + performance for EMPLOYEE and SUPER_EMPLOYEE
# ===========================================================================

class WorkforceEndpointTests(WorkforceSqliteTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.app = self._build_app()
        self.client = TestClient(self.app)

    async def asyncTearDown(self):
        await super().asyncTearDown()

    def test_employee_leave_endpoint_returns_own_requests(self):
        self._set_current_user(self.app, self.alice_id)
        response = self.client.get("/api/v1/employee/leave")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["employeeId"], "PF-0001")
        self.assertEqual(body["items"][0]["leaveType"], "CASUAL")

    def test_super_employee_leave_endpoint_returns_own_requests(self):
        self._set_current_user(self.app, self.bob_id)
        response = self.client.get("/api/v1/employee/leave")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["employeeId"], "PF-0002")
        self.assertEqual(body["items"][0]["leaveType"], "SICK")

    def test_employee_performance_endpoint_returns_own_reviews(self):
        self._set_current_user(self.app, self.alice_id)
        response = self.client.get("/api/v1/employee/performance")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["reviews"]), 1)
        self.assertEqual(body["reviews"][0]["employeeId"], "PF-0001")
        self.assertEqual(body["reviews"][0]["rating"], 4)

    def test_super_employee_performance_endpoint_returns_own_reviews(self):
        self._set_current_user(self.app, self.bob_id)
        response = self.client.get("/api/v1/employee/performance")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["reviews"]), 1)
        self.assertEqual(body["reviews"][0]["employeeId"], "PF-0002")
        self.assertEqual(body["reviews"][0]["rating"], 5)

    def test_cross_employee_data_isolation(self):
        # Alice (EMPLOYEE) must never see Bob's (SUPER_EMPLOYEE) rows.
        self._set_current_user(self.app, self.alice_id)
        leave = self.client.get("/api/v1/employee/leave").json()
        performance = self.client.get("/api/v1/employee/performance").json()
        self.assertEqual(
            [item["employeeId"] for item in leave["items"]], ["PF-0001"]
        )
        self.assertEqual(
            [item["employeeId"] for item in performance["reviews"]], ["PF-0001"]
        )

        # And vice versa.
        self._set_current_user(self.app, self.bob_id)
        leave = self.client.get("/api/v1/employee/leave").json()
        performance = self.client.get("/api/v1/employee/performance").json()
        self.assertEqual(
            [item["employeeId"] for item in leave["items"]], ["PF-0002"]
        )
        self.assertEqual(
            [item["employeeId"] for item in performance["reviews"]], ["PF-0002"]
        )

    def test_no_missing_greenlet_on_either_surface(self):
        """A MissingGreenlet would surface as a 500 via the generic handler;
        both endpoints must return 200 for both account levels."""
        for user_id in (self.alice_id, self.bob_id):
            self._set_current_user(self.app, user_id)
            for path in ("/api/v1/employee/leave", "/api/v1/employee/performance"):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200, f"{path} as {user_id}")
                self.assertNotIn("greenlet", response.text.lower())


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
