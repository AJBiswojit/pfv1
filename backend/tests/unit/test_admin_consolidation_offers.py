"""
Admin consolidation — offers register runs SQL-side (HP-9).

GET /admin/offers previously loaded EVERY coupon and sliced the register in
Python. Now the derived display status, the honesty tiles, the filtered
total and the page itself are computed by the database. These tests run the
real route against a real SQLite session and pin:
  * derived statuses (ACTIVE / SCHEDULED / EXPIRED / ARCHIVED) match the
    documented date/isActive rules,
  * tiles describe the FULL q-filtered register while `total` describes the
    status-filtered register — counts never describe only the page,
  * q matches code OR name, pagination is SQL-side (offset/limit),
  * pageSize is clamped to the 200 ceiling.
"""

import importlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import event, select

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover - dialect glue
    return "JSON"


def _coupon(code, *, name=None, is_active=True, starts_offset=None, expires_offset=None, usage=3):
    from app.models.commerce.coupon import CouponModel

    now = datetime.now(timezone.utc)
    return CouponModel(
        code=code,
        name=name or f"{code} offer",
        description="",
        discount_type="percentage",
        discount_value=10.0,
        minimum_order_value=0,
        starts_at=now + timedelta(days=starts_offset) if starts_offset is not None else now - timedelta(days=1),
        expires_at=now + timedelta(days=expires_offset) if expires_offset is not None else None,
        usage_limit=None,
        usage_count=usage,
        per_customer_limit=None,
        eligible_customer_ids=[],
        eligible_product_ids=[],
        eligible_category_ids=[],
        eligible_collection_ids=[],
        excluded_product_ids=[],
        excluded_category_ids=[],
        is_active=is_active,
    )


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class AdminOffersRegisterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.auth.user import UserModel
        from app.models.base import Base

        self._tmp = tempfile.TemporaryDirectory(prefix="pf-admin-offers-")
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

        async with self.Session() as session:
            session.add(
                UserModel(
                    email="offers-admin@pratikshya.test",
                    full_name="Offers Admin",
                    hashed_password="x",
                    user_type="admin",
                    status="ACTIVE",
                    is_verified=True,
                    force_password_change=False,
                )
            )
            session.add(_coupon("LIVE10"))                                # ACTIVE
            session.add(_coupon("GONE20", is_active=False))               # ARCHIVED
            session.add(_coupon("SOON30", starts_offset=2))               # SCHEDULED
            session.add(_coupon("OLD40", expires_offset=-1))              # EXPIRED
            session.add(_coupon("SUMMER", name="Summer Special"))         # ACTIVE, q by name
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _list(self, **kwargs):
        from app.api.v1.coupons import admin_list_offers
        from app.models.auth.user import UserModel

        async with self.Session() as session:
            admin_id = (await session.execute(select(UserModel.id))).scalar_one()
            with patch("app.api.v1.coupons.require_admin_permission", AsyncMock()):
                return await admin_list_offers(
                    current_user=SimpleNamespace(id=admin_id), db=session, **kwargs
                )

    async def test_derived_statuses_and_tiles_describe_full_register(self):
        result = await self._list()
        self.assertEqual(result["counts"]["total"], 5)
        self.assertEqual(result["counts"]["ACTIVE"], 2)
        self.assertEqual(result["counts"]["ARCHIVED"], 1)
        self.assertEqual(result["counts"]["SCHEDULED"], 1)
        self.assertEqual(result["counts"]["EXPIRED"], 1)
        self.assertEqual(result["lifetimeRedemptions"], 15)
        self.assertEqual(result["total"], 5)

    async def test_status_filter_is_server_side(self):
        result = await self._list(status="ARCHIVED")
        self.assertEqual(result["total"], 1)
        self.assertEqual([o["code"] for o in result["offers"]], ["GONE20"])
        # Tiles still describe the FULL register, not the filtered subset.
        self.assertEqual(result["counts"]["total"], 5)

    async def test_q_matches_code_or_name(self):
        by_code = await self._list(q="summer")
        self.assertEqual(by_code["total"], 1)
        self.assertEqual(by_code["offers"][0]["code"], "SUMMER")

        by_name = await self._list(q="special")
        self.assertEqual(by_name["total"], 1)
        self.assertEqual(by_name["offers"][0]["code"], "SUMMER")

    async def test_pagination_is_sql_side_and_clamped(self):
        page_one = await self._list(page=1, pageSize=2)
        self.assertEqual(len(page_one["offers"]), 2)
        self.assertEqual(page_one["total"], 5)
        page_three = await self._list(page=3, pageSize=2)
        self.assertEqual(len(page_three["offers"]), 1)
        clamped = await self._list(page=1, pageSize=500)
        self.assertEqual(clamped["pageSize"], 200)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
