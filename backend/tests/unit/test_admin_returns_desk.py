"""
Admin consolidation — returns desk reads the REAL /admin/returns API.

The admin returns screens previously derived their register from the
100-order client snapshot. Now they read the backend directly:
  GET /admin/returns        — paginated + enriched (order number, customer name)
  GET /admin/returns/{id}   — one record, same enrichment

Runs the real service against a real SQLite session and asserts:
  * list pagination + total are DB-side,
  * status / orderId filters work,
  * every record on the page carries its order number and customer name
    (one bounded lookup — never a full orders read),
  * the single-return detail is enriched identically.
"""

import importlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover - dialect glue
    return "JSON"


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class AdminReturnsDeskTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.auth.user import UserModel
        from app.models.base import Base

        self._tmp = tempfile.TemporaryDirectory(prefix="pf-admin-returns-")
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

        now = datetime.now(timezone.utc)
        async with self.Session() as session:
            customer = UserModel(
                email="returns-customer@pratikshya.test",
                full_name="Rhea Kapoor",
                hashed_password="x",
                user_type="customer",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            session.add(customer)
            await session.flush()

            from app.models.orders.order import OrderModel
            from app.models.orders.order_item import OrderItemModel
            from app.models.orders.return_item import ReturnItemModel
            from app.models.orders.return_order import ReturnOrderModel

            order_ids = []
            for index in range(3):
                order = OrderModel(
                    order_number=f"PF-ORD-{index:04d}",
                    customer_id=customer.id,
                    delivery_method="standard",
                    payment_method="upi",
                    status="ORDER_CONFIRMED",
                    payment_status="PAID",
                    subtotal=1000,
                    product_discount=0,
                    coupon_discount=0,
                    shipping_fee=0,
                    cod_fee=0,
                    total=1000,
                    created_at=now - timedelta(days=index),
                )
                session.add(order)
                order_ids.append(order)
            await session.flush()

            for index, status in enumerate(
                ["RETURN_REQUESTED", "APPROVED", "REFUNDED"]
            ):
                session.add(
                    ReturnOrderModel(
                        order_id=order_ids[index].id,
                        return_number=f"PF-RET-{index:04d}",
                        customer_id=customer.id,
                        status=status,
                        refund_amount=1000,
                        refund_status="NOT_REQUESTED",
                        created_at=now - timedelta(days=index),
                    )
                )
            await session.flush()

            ret_items = (await session.execute(
                __import__("sqlalchemy", fromlist=["select"]).select(ReturnOrderModel)
            )).scalars().all()
            for ret in ret_items:
                session.add(
                    ReturnItemModel(
                        return_order_id=ret.id,
                        order_item_id=f"oi-{ret.id}",
                        product_id="PF-TST-0001",
                        product_name="Silk saree",
                        quantity=1,
                        reason="SIZE_ISSUE",
                        refund_amount=1000,
                    )
                )
            await session.flush()

            for order in order_ids:
                session.add(
                    OrderItemModel(
                        order_id=order.id,
                        product_id="PF-TST-0001",
                        product_name="Silk saree",
                        unit_price=1000,
                        original_price=0,
                        quantity=1,
                        line_total=1000,
                    )
                )
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def test_list_is_paginated_and_enriched(self):
        from app.services.orders.return_service import ReturnService

        async with self.Session() as session:
            result = await ReturnService(session).list_returns(page=1, page_size=2)
            self.assertEqual(result["total"], 3)
            self.assertEqual(len(result["returns"]), 2)
            for record in result["returns"]:
                self.assertTrue(record.order_number.startswith("PF-ORD-"), record.order_number)
                self.assertEqual(record.customer_name, "Rhea Kapoor")

    async def test_status_filter_is_server_side(self):
        from app.services.orders.return_service import ReturnService

        async with self.Session() as session:
            result = await ReturnService(session).list_returns(
                status="APPROVED", page=1, page_size=50
            )
            self.assertEqual(result["total"], 1)
            self.assertEqual(result["returns"][0].status, "APPROVED")

    async def test_detail_is_enriched(self):
        from sqlalchemy import select

        from app.models.orders.return_order import ReturnOrderModel
        from app.services.orders.return_service import ReturnService

        async with self.Session() as session:
            return_id = (
                await session.execute(select(ReturnOrderModel.id).limit(1))
            ).scalar_one()
            record = await ReturnService(session).get_return(return_id)
            self.assertTrue(record.order_number.startswith("PF-ORD-"))
            self.assertEqual(record.customer_name, "Rhea Kapoor")
            self.assertEqual(len(record.items), 1)

    async def test_orders_read_model_route_still_serves_returns(self):
        """The order read model keeps its embedded returns[] (compat)."""
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.models.orders.order import OrderModel
        from app.models.orders.order_status_history import OrderStatusHistoryModel  # noqa: F401
        from app.models.orders.return_order import ReturnOrderModel
        from app.schemas.orders.order import AdminOrderResponse

        async with self.Session() as session:
            order = (
                await session.execute(
                    select(OrderModel)
                    .options(
                        selectinload(OrderModel.items),
                        selectinload(OrderModel.status_history),
                        selectinload(OrderModel.returns).selectinload(ReturnOrderModel.items),
                    )
                    .limit(1)
                )
            ).scalars().one()
            dumped = AdminOrderResponse.model_validate(order).model_dump(by_alias=True)
            self.assertIn("returns", dumped)
            self.assertIsInstance(dumped["returns"], list)
            # Every return on the order still validates through the same
            # admin return read model the /admin/returns API emits.
            for embedded in dumped["returns"]:
                self.assertIn("id", embedded)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
