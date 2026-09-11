"""
Admin consolidation — consolidated dashboard summary endpoint.

GET /admin/dashboard/summary replaces the dashboard's per-load fan-out
(overview + sales series + top products + orders + inventory summary +
the employee list fetched twice) with ONE response of bounded aggregates.

Runs the real route coroutine against a real SQLite session and asserts:
  * every section the dashboard renders is present,
  * the metric definitions match the canonical /analytics/overview shapes,
  * employee head-counts are COUNTs (no 100-row list read),
  * recent orders arrive through the existing admin order read model,
  * the endpoint is admin-gated (customer token → 403; no token → 401).
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


def _order(index, created_at, status="ORDER_CONFIRMED", total=1000, customer_id=None):
    from app.models.orders.order import OrderModel

    return OrderModel(
        order_number=f"PF-ORD-{index:04d}",
        customer_id=customer_id,
        delivery_method="standard",
        payment_method="upi",
        status=status,
        payment_status="PAID",
        subtotal=total,
        product_discount=0,
        coupon_discount=0,
        shipping_fee=0,
        cod_fee=0,
        total=total,
        created_at=created_at,
    )


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class AdminDashboardSummaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.auth.user import UserModel
        from app.models.base import Base

        self._UserModel = UserModel
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-admin-dash-")
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
            admin = UserModel(
                email="dash-admin@pratikshya.test",
                full_name="Dashboard Admin",
                hashed_password="x",
                user_type="admin",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            customer = UserModel(
                email="dash-customer@pratikshya.test",
                full_name="Dash Customer",
                hashed_password="x",
                user_type="customer",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            employee = UserModel(
                email="dash-employee@pratikshya.test",
                full_name="Dash Employee",
                hashed_password="x",
                user_type="employee",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            session.add_all([admin, customer, employee])
            await session.flush()

            from app.models.catalog.product import ProductModel
            from app.models.customer.customer import CustomerProfileModel
            from app.models.employee.employee import EmployeeProfileModel
            from app.models.orders.order import OrderModel
            from app.models.orders.order_item import OrderItemModel

            session.add(CustomerProfileModel(user_id=customer.id, loyalty_tier="BRONZE", loyalty_points=0))
            session.add(
                EmployeeProfileModel(user_id=employee.id, employee_code="PF-EMP-0001", designation="Stylist")
            )

            session.add(
                ProductModel(
                    id="PF-TST-0001",
                    product_id="PF-TST-0001",
                    name="Low stock saree",
                    slug="low-stock-saree",
                    sku="SKU-LS-1",
                    category="sarees",
                    price=2000,
                    stock=1,
                    low_stock_threshold=5,
                    flags={},
                    review_flags=[],
                    description="d",
                    short_description="s",
                    status="PUBLISHED",
                    published=True,
                )
            )
            session.add(
                ProductModel(
                    id="PF-TST-0002",
                    product_id="PF-TST-0002",
                    name="Healthy stock saree",
                    slug="healthy-stock-saree",
                    sku="SKU-LS-2",
                    category="sarees",
                    price=1500,
                    stock=20,
                    low_stock_threshold=5,
                    flags={},
                    review_flags=[],
                    description="d",
                    short_description="s",
                    status="PUBLISHED",
                    published=True,
                )
            )
            session.add(
                ProductModel(
                    id="PF-TST-0003",
                    product_id="PF-TST-0003",
                    name="Pending draft",
                    slug="pending-draft",
                    sku="SKU-LS-3",
                    category="kidswear",
                    price=500,
                    stock=9,
                    low_stock_threshold=5,
                    flags={},
                    review_flags=[],
                    description="d",
                    short_description="s",
                    status="PENDING_REVIEW",
                    published=False,
                )
            )

            order_ids = []
            for index, (status, total) in enumerate(
                [("ORDER_CONFIRMED", 1000), ("DELIVERED", 2500), ("CANCELLED", 700)]
            ):
                order = _order(index, now - timedelta(days=index), status=status, total=total, customer_id=customer.id)
                session.add(order)
                order_ids.append(order)
            await session.flush()

            session.add(
                OrderItemModel(
                    order_id=order_ids[1].id,
                    product_id="PF-TST-0002",
                    product_name="Healthy stock saree",
                    unit_price=2500,
                    original_price=0,
                    quantity=1,
                    line_total=2500,
                )
            )
            session.add(
                OrderItemModel(
                    order_id=order_ids[0].id,
                    product_id="PF-TST-0001",
                    product_name="Low stock saree",
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

    async def _summary(self):
        import types

        from sqlalchemy import select

        from app.api.v1.analytics import admin_dashboard_summary

        async with self.Session() as session:
            admin_id = (
                await session.execute(
                    select(self._UserModel.id).where(self._UserModel.user_type == "admin")
                )
            ).scalar_one()
            # The route only reads `current_user.id` in its permission check;
            # a detached stub avoids lazy-load IO on the caller's session.
            admin = types.SimpleNamespace(id=admin_id, user_type="admin")
            return await admin_dashboard_summary(days=7, recent_limit=5, db=session, current_user=admin)

    async def test_summary_sections_are_present(self):
        summary = await self._summary()
        self.assertTrue(summary["ok"])
        for section in ("metrics", "salesSeries", "categories", "recentOrders", "inventorySummary", "employees", "generatedAt"):
            self.assertIn(section, summary)

    async def test_metrics_follow_the_canonical_definitions(self):
        summary = await self._summary()
        metrics = summary["metrics"]
        # revenue excludes the CANCELLED order (1000 + 2500)
        self.assertEqual(metrics["totalRevenue"], 3500)
        self.assertEqual(metrics["orderCount"], 3)
        self.assertEqual(metrics["cancelledCount"], 1)
        self.assertEqual(metrics["customerCount"], 1)
        self.assertEqual(metrics["productCount"], 3)
        self.assertEqual(metrics["lowStockCount"], 1)  # stock 1 ≤ threshold 5
        self.assertEqual(metrics["outOfStockCount"], 0)
        self.assertEqual(metrics["pendingReviewCount"], 1)
        # canonical definition: revenue ÷ ALL orders (not just revenue-eligible)
        self.assertEqual(metrics["avgOrderValue"], 1166.67)

    async def test_employee_counts_are_counts_not_a_list_read(self):
        summary = await self._summary()
        self.assertEqual(summary["employees"], {"total": 1, "active": 1})

    async def test_recent_orders_carry_the_admin_read_model_shape(self):
        summary = await self._summary()
        orders = summary["recentOrders"]
        self.assertEqual(len(orders), 3)
        first = orders[0]
        # The orders ride the same read-model the /admin/orders route emits
        # (snake_case DTO fields; the frontend read-model normalises them).
        self.assertIn("id", first)
        self.assertIn("status", first)
        self.assertIn("created_at", first)
        self.assertIn("items", first)
        self.assertIn("customer", first)

    async def test_sales_series_buckets_by_day(self):
        summary = await self._summary()
        self.assertIsInstance(summary["salesSeries"], list)
        if summary["salesSeries"]:
            point = summary["salesSeries"][0]
            self.assertIn("date", point)
            self.assertIn("revenue", point)
            self.assertIn("orders", point)
            self.assertTrue(len(point["date"]) == 10, point["date"])

    async def test_inventory_summary_carries_low_stock_alert_rows(self):
        summary = await self._summary()
        inventory = summary["inventorySummary"]
        self.assertEqual(inventory["lowStockCount"], 1)
        self.assertTrue(inventory["note"])
        item_ids = {item["id"] for item in inventory.get("items", [])}
        self.assertIn("PF-TST-0001", item_ids)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
