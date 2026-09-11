"""
Admin consolidation — the AI Business Assistant is REAL.

POST /ai/business/ask answers from the database through bounded read-only
queries. The mandate it satisfies:
  * authenticated (admin + analytics.view) — customer tokens get 403,
  * the request never accepts business data from the client,
  * figures are real (canonical analytics definitions),
  * empty registers yield truthful NO_DATA answers, never placeholders,
  * unreadable questions yield guidance, not invented insight.
"""

import importlib
import os
import tempfile
import types
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


def _order(index, customer_id, *, status="ORDER_CONFIRMED", total=1000, days_ago=1):
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
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )


def _product(pid, name, *, stock=20, threshold=5, category="sarees", price=1000):
    from app.models.catalog.product import ProductModel

    return ProductModel(
        id=pid, product_id=pid, name=name, slug=name.lower().replace(" ", "-"),
        sku=f"SKU-{pid}", category=category, price=price, stock=stock,
        low_stock_threshold=threshold, flags={}, review_flags=[],
        description="d", short_description="s", status="PUBLISHED", published=True,
    )


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class AdminAiAssistantTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.auth.user import UserModel
        from app.models.base import Base

        self._tmp = tempfile.TemporaryDirectory(prefix="pf-admin-ai-")
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
            customer = UserModel(
                email="ai-customer@pratikshya.test", full_name="Rhea Kapoor", hashed_password="x",
                user_type="customer", status="ACTIVE", is_verified=True, force_password_change=False,
            )
            admin = UserModel(
                email="ai-admin@pratikshya.test", full_name="AI Admin", hashed_password="x",
                user_type="admin", status="ACTIVE", is_verified=True, force_password_change=False,
            )
            session.add(customer)
            session.add(admin)
            await session.flush()
            # Provision the RBAC directory so the no-role fallback is CLOSED,
            # and give the ADMIN identity a real role grant with
            # analytics.view. The customer keeps no roles → denied.
            from app.models.rbac.permission import PermissionModel
            from app.models.rbac.role import RoleModel
            from app.models.rbac.role_permission import RolePermissionModel
            from app.models.rbac.user_role import UserRoleModel

            role = RoleModel(name="ADMIN", description="test", is_system=False)
            perm = PermissionModel(code="analytics.view", name="analytics.view", category="analytics")
            session.add_all([role, perm])
            await session.flush()
            session.add(RolePermissionModel(role_id=role.id, permission_id=perm.id))
            session.add(UserRoleModel(user_id=admin.id, role_id=role.id))
            await session.flush()
            session.add(_product("PF-TST-0001", "Kanjivaram saree", stock=2, threshold=5))
            session.add(_product("PF-TST-0002", "Silk dupatta", stock=30, threshold=5))
            session.add(_order(1, customer.id, total=1500))
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _ask(self, question, preset="LAST_30", user_type="admin", extra_payload=None):
        from app.api.v1.ai_assistant import AiBusinessAskRequest, ask_business_assistant
        from app.models.auth.user import UserModel

        async with self.Session() as session:
            user = (
                await session.execute(select(UserModel).where(UserModel.user_type == user_type).limit(1))
            ).scalars().one()
            body = {"question": question, "preset": preset}
            body.update(extra_payload or {})
            payload = AiBusinessAskRequest(**body)
            return await ask_business_assistant(payload, current_user=user, db=session)

    async def test_summary_answers_from_real_database_figures(self):
        result = await self._ask("Give me the business summary")
        self.assertTrue(result["ok"])
        answer = result["response"]
        self.assertEqual(answer["type"], "BUSINESS_SUMMARY")
        self.assertIn("₹1,500", answer["text"])
        self.assertIn("database", answer["source"].lower())
        metric_labels = {m["label"] for m in answer["metrics"]}
        self.assertIn("Revenue", metric_labels)

    async def test_low_stock_question_lists_real_products(self):
        result = await self._ask("Which products are low in stock?")
        answer = result["response"]
        self.assertEqual(answer["type"], "INVENTORY_INSIGHT")
        row_labels = [row["label"] for row in answer["rows"]]
        self.assertIn("Kanjivaram saree", row_labels)
        self.assertNotIn("Silk dupatta", row_labels)

    async def test_empty_register_yields_truthful_no_data(self):
        # A 7-day window on an order placed 30 days back has nothing to show.
        from app.models.orders.order import OrderModel

        async with self.Session() as session:
            order = (await session.execute(select(OrderModel).limit(1))).scalars().one()
            order.created_at = datetime.now(timezone.utc) - timedelta(days=30)
            await session.commit()
        result = await self._ask("How are sales?", preset="LAST_7")
        self.assertEqual(result["response"]["type"], "NO_DATA")
        self.assertIn("no orders", result["response"]["text"].lower())

    async def test_unclear_question_gets_guidance_not_fabrication(self):
        result = await self._ask("What is the meaning of life?")
        answer = result["response"]
        self.assertEqual(answer["type"], "NO_DATA")
        self.assertIn("couldn't map", answer["headline"].lower())

    async def test_customer_payload_keys_are_ignored(self):
        # The old mock accepted a client-side order snapshot; the real
        # endpoint ignores any extra keys — data only flows one way.
        smuggled = [{"id": "fake", "total": 9_999_999, "status": "ORDER_CONFIRMED"}]
        result = await self._ask(
            "Give me the business summary", extra_payload={"orders": smuggled, "sql": "DROP TABLE users"}
        )
        answer = result["response"]
        self.assertNotIn("9,999,999", answer["text"])

    async def test_customer_token_is_forbidden(self):
        from app.core.exceptions import ForbiddenException

        with self.assertRaises(ForbiddenException):
            await self._ask("Give me the business summary", user_type="customer")

    async def test_question_length_is_bounded(self):
        from pydantic import ValidationError

        from app.api.v1.ai_assistant import AiBusinessAskRequest

        with self.assertRaises(ValidationError):
            AiBusinessAskRequest(question="x" * 501)

    def test_topic_resolution_covers_the_admin_vocabulary(self):
        from app.api.v1.ai_assistant import resolve_topic

        self.assertEqual(resolve_topic("Which products are low in stock?"), "INVENTORY")
        self.assertEqual(resolve_topic("How are returns trending?"), "RETURNS")
        self.assertEqual(resolve_topic("Restock priorities"), "RESTOCK")
        self.assertEqual(resolve_topic("hello there"), "UNCLEAR")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
