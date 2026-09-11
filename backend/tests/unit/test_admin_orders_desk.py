"""
Admin consolidation — the admin orders desk runs server-side (HP-4).

GET /admin/orders now carries the desk's filters as real SQL conditions —
payment status, fulfillment stage (mapped to order statuses), created-since
window, order-value band and a q that searches order number OR customer
identity — and returns one grouped status count over the WHOLE order book
so the metric tiles are exact instead of "whatever was on the page".
"""

import importlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover - dialect glue
    return "JSON"


def _order(index, customer_id, *, status="ORDER_CONFIRMED", payment_status="PAID", total=1000, days_ago=0):
    from app.models.orders.order import OrderModel

    return OrderModel(
        order_number=f"PF-ORD-{index:04d}",
        customer_id=customer_id,
        delivery_method="standard",
        payment_method="upi",
        status=status,
        payment_status=payment_status,
        subtotal=total,
        product_discount=0,
        coupon_discount=0,
        shipping_fee=0,
        cod_fee=0,
        total=total,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class AdminOrdersDeskTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.auth.user import UserModel
        from app.models.base import Base

        self._tmp = tempfile.TemporaryDirectory(prefix="pf-admin-orders-")
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
            rhea = UserModel(
                email="rhea@pratikshya.test", full_name="Rhea Kapoor", hashed_password="x",
                user_type="customer", status="ACTIVE", is_verified=True, force_password_change=False,
            )
            arjun = UserModel(
                email="arjun@pratikshya.test", full_name="Arjun Das", hashed_password="x",
                user_type="customer", status="ACTIVE", is_verified=True, force_password_change=False,
            )
            session.add_all([rhea, arjun])
            await session.flush()

            session.add(_order(1, rhea.id, total=1000, days_ago=0))
            session.add(_order(2, rhea.id, status="CANCELLED", payment_status="REFUNDED", total=800, days_ago=2))
            session.add(_order(3, arjun.id, status="DELIVERED", total=25000, days_ago=10))
            session.add(_order(4, arjun.id, status="SHIPPED", payment_status="PENDING", total=300, days_ago=40))
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _list(self, **kwargs):
        import types
        from unittest.mock import AsyncMock, patch

        from app.api.v1.orders import admin_list_orders
        from app.models.auth.user import UserModel

        # Direct coroutine invocation bypasses FastAPI DI, so Query defaults
        # must be supplied as plain values.
        for name in ("status_filter", "customer_id", "q", "payment_status", "fulfillment", "created_since", "value_band"):
            kwargs.setdefault(name, None)
        kwargs.setdefault("page", 1)
        kwargs.setdefault("page_size", 20)

        async with self.Session() as session:
            admin_id = (await session.execute(select(UserModel.id).limit(1))).scalar_one()
            result = await admin_list_orders(
                current_user=types.SimpleNamespace(id="admin-1"), db=session, **kwargs
            )
            return result

    async def test_pagination_totals_and_status_counts(self):
        result = await self._list(page=1, page_size=3)
        self.assertEqual(result.total, 4)
        self.assertEqual(len(result.orders), 3)
        # Status counts describe the WHOLE book, not the page.
        self.assertEqual(result.status_counts.get("ORDER_CONFIRMED"), 1)
        self.assertEqual(result.status_counts.get("CANCELLED"), 1)
        self.assertEqual(result.status_counts.get("DELIVERED"), 1)
        self.assertEqual(result.status_counts.get("SHIPPED"), 1)

    async def test_payment_status_filter(self):
        result = await self._list(payment_status="REFUNDED")
        self.assertEqual(result.total, 1)
        self.assertEqual(result.orders[0].order_number, "PF-ORD-0002")

    async def test_fulfillment_stage_filter_maps_to_statuses(self):
        result = await self._list(fulfillment="SHIPPED")
        self.assertEqual(result.total, 1)
        self.assertEqual(result.orders[0].status, "SHIPPED")

        pending = await self._list(fulfillment="PENDING")
        self.assertEqual(pending.total, 1)
        self.assertEqual(pending.orders[0].status, "ORDER_CONFIRMED")

    async def test_value_band_and_created_since(self):
        high = await self._list(value_band="high")
        self.assertEqual(high.total, 1)
        self.assertEqual(high.orders[0].total, 25000)

        recent = await self._list(created_since=datetime.now(timezone.utc) - timedelta(days=7))
        self.assertEqual(recent.total, 2)  # today's + the 2-day-old one

    async def test_q_matches_order_number_or_customer_identity(self):
        by_number = await self._list(q="PF-ORD-0003")
        self.assertEqual(by_number.total, 1)
        self.assertEqual(by_number.orders[0].order_number, "PF-ORD-0003")

        by_name = await self._list(q="rhea")
        self.assertEqual(by_name.total, 2)

        by_email = await self._list(q="arjun@pratikshya.test")
        self.assertEqual(by_email.total, 2)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
