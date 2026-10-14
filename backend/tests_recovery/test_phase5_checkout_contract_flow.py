"""Phase 5 — checkout contract flow, against the real application (RECOVERED).

WHAT THIS FILE IS
─────────────────
This is the Phase 5 isolated integration suite, re-created because the original
file did not survive the workspace snapshot: ``backend/.gitignore`` line 55
ignores ``tests/``, so a *newly created* file under ``backend/tests/`` is never
carried between sessions (the same is true of ``frontend/.gitignore`` line 23
for ``frontend/tests/``).  It is recovered from, and faithful to, these sources —
no assertion here was invented without one of them behind it:

  1. ``docs/PHASE-5-BACKEND-CONTRACT-CHECKOUT-AUDIT.md`` §6 lists all **11 tests
     by name** with a one-line statement of what each proves, and §4 documents
     the two production defects they pin ("revert proof: tests 6 and 10 fail").
  2. ``.p5/evidence/integration-BEFORE-fixes.txt`` and ``-AFTER-fixes.txt`` carry
     the original run's own output — the test-class name ``CheckoutContractFlow``,
     the two failing node ids, and the two exact failure messages
     (``500 != 201`` and ``403 != 200``).
  3. The production code itself, read at the time of recovery: the shipping and
     COD rules (``orders/order_service.py::_compute_shipping`` /
     ``_compute_cod_fee`` and ``commerce/cart_service.py::get_totals``), the
     order-creation rules (``place_order``), the payment contract
     (``payments/payment_service.py``, ``api/v1/payments.py``) and the field
     names each response schema emits.
  4. ``tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py`` —
     the repository's existing real-router harness, whose DB/bootstrap idiom this
     file follows (production ``app.main:app``, throwaway SQLite attached as the
     ``pratikshya`` schema, only ``get_db`` and the authenticated user injected).

WHERE IT IS
───────────
``backend/tests_recovery/`` — a directory neither ``.gitignore`` mentions, so a
recovered suite can never be lost to the ignore policy again (``backend/.gitignore``
line 55 ignores ``tests/``; ``frontend/.gitignore`` line 23 ignores ``frontend/tests/``).
That is exactly how both original suites disappeared: they were created inside an
ignored directory and never entered a snapshot.  Neither ignore file was touched.

This path is deliberately **outside** ``pyproject.toml``'s ``testpaths = ["tests"]``,
so a bare ``pytest`` run does not pick it up and no project configuration was
edited.  Run it by path:

    cd backend && DATABASE_URL="postgresql+asyncpg://postgres:password@localhost:5432/pratikshya_fashion" \
      python -m pytest tests_recovery/test_phase5_checkout_contract_flow.py

The pre-existing Phase 3 harness (``tests/integration/test_phase3_step11c_...``) is
untouched production test infrastructure and stays where it is.

WHAT IT DOES AND DOES NOT PROVE
───────────────────────────────
Real application, real router graph, real schemas, real services, real SQL
(SQLite).  Injected: the database session and the authenticated user.  Stubbed:
the Razorpay SDK only (no network, no credentials) — ``_build_razorpay_client``
is replaced with an in-process fake, and ``settings.RAZORPAY_KEY_SECRET`` is set
to a local test string so the HMAC path can be exercised honestly.  This is
therefore NOT end-to-end: no live gateway, no PostgreSQL, no real capture.  The
signature check, the amount cross-check and the ownership rules are the
production ones; the gateway's answers are the fake's.
"""

from __future__ import annotations

import hashlib
import hmac
import importlib
import os
import tempfile
import unittest
import uuid
from typing import Any, Dict, Optional

from fastapi.testclient import TestClient
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from sqlalchemy import event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app.config import settings
from app.dependencies import get_current_user, get_db, get_optional_user
from app.main import app as production_app
from app.models.auth.user import UserModel
from app.models.base import Base
from app.models.catalog.product import ProductModel
from app.models.commerce.coupon import CouponModel
from app.models.orders.order import OrderModel
from app.models.payments.payment_session import PaymentSessionModel
from app.services.payments import payment_service

# The models declare a PostgreSQL schema; the SQLite harness attaches a second
# file under that name, exactly as the Phase 3 flow suite does.
SCHEMA_NAME = "pratikshya"

# A local string, not a credential: nothing here talks to Razorpay.
TEST_SECRET = "phase5-test-secret-not-a-real-key"

FREE_SHIPPING_THRESHOLD = 5000
FLAT_SHIPPING_FEE = 99
EXPRESS_SHIPPING_FEE = 199
COD_FEE = 49

# The storefront's own checkout payload shape (frontend `utils/checkout.js`
# `buildPlaceOrderRequest`): camelCase keys, no amounts of any kind.
ADDRESS = {
    "fullName": "Aparna Biswojit",
    "phone": "9876543210",
    "addressLine": "12 Buxi Bazaar",
    "landmark": "Near the old bridge",
    "city": "Cuttack",
    "state": "Odisha",
    "pincode": "753001",
    "type": "Home",
}


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover - dialect glue
    return "JSON"


class FakeRazorpayClient:
    """The Razorpay SDK, in process. Records what production asked it to do."""

    def __init__(self, calls: Dict[str, Any]) -> None:
        self.calls = calls

    # client.order.create(data=...)
    def create(self, data=None):
        payload = dict(data or {})
        self.calls["order_create"] = payload
        self.calls["last_amount"] = payload.get("amount")
        self.calls["serial"] += 1
        razorpay_order_id = f"order_TEST{self.calls['serial']:04d}"
        self.calls["last_razorpay_order_id"] = razorpay_order_id
        return {
            "id": razorpay_order_id,
            "amount": payload.get("amount"),
            "currency": "INR",
            "status": "created",
        }

    # client.payment.fetch(payment_id)
    def fetch(self, payment_id):
        self.calls["payment_fetch"] = payment_id
        return {
            "id": payment_id,
            "order_id": self.calls["last_razorpay_order_id"],
            "amount": self.calls["last_amount"],
            "currency": "INR",
            "status": "captured",
        }

    @property
    def order(self):
        return self

    @property
    def payment(self):
        return self


class CheckoutContractFlow(unittest.IsolatedAsyncioTestCase):
    """The checkout contract, driven through the production application."""

    async def asyncSetUp(self) -> None:
        if importlib.util.find_spec("aiosqlite") is None:  # pragma: no cover
            self.skipTest("aiosqlite is not installed")

        importlib.import_module("app.models")

        self._tmp = tempfile.TemporaryDirectory(prefix="pf5-contract-")
        self.main_db = os.path.join(self._tmp.name, "main.sqlite")
        self.schema_db = os.path.join(self._tmp.name, "pratikshya.sqlite")

        self.engine = create_async_engine(f"sqlite+aiosqlite:///{self.main_db}")
        schema_db = self.schema_db

        @event.listens_for(self.engine.sync_engine, "connect")
        def _attach(dbapi_conn, _record):  # pragma: no cover - driver hook
            cursor = dbapi_conn.cursor()
            cursor.execute(f"ATTACH DATABASE '{schema_db}' AS {SCHEMA_NAME}")
            cursor.close()

        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)

        # ── Gateway stub, and the local test secret the HMAC path needs ───────
        self.gateway_calls: Dict[str, Any] = {"serial": 0}
        self._saved_key_id = settings.RAZORPAY_KEY_ID
        self._saved_key_secret = settings.RAZORPAY_KEY_SECRET
        settings.RAZORPAY_KEY_ID = "rzp_test_phase5key"
        settings.RAZORPAY_KEY_SECRET = TEST_SECRET

        self._saved_build_client = payment_service._build_razorpay_client
        payment_service._build_razorpay_client = lambda: FakeRazorpayClient(self.gateway_calls)

        await self._seed_catalogue_and_users()

        # ── Production app, with only the DB and identity injected ────────────
        self._saved_overrides = production_app.dependency_overrides.copy()
        production_app.dependency_overrides[get_db] = self._override_get_db
        production_app.dependency_overrides[get_current_user] = self._override_current_user
        production_app.dependency_overrides[get_optional_user] = self._override_optional_user
        FastAPICache.init(backend=InMemoryBackend(), prefix="pf5-contract")
        self.client = TestClient(production_app, raise_server_exceptions=False)

    async def asyncTearDown(self) -> None:
        FastAPICache.reset()
        payment_service._build_razorpay_client = self._saved_build_client
        settings.RAZORPAY_KEY_ID = self._saved_key_id
        settings.RAZORPAY_KEY_SECRET = self._saved_key_secret
        production_app.dependency_overrides.clear()
        production_app.dependency_overrides.update(self._saved_overrides)
        await self.engine.dispose()
        self._tmp.cleanup()

    # ── Wiring ────────────────────────────────────────────────────────────────

    async def _override_get_db(self):
        """The production dependency's own semantics: commit, roll back, close.

        A non-committing override is what produced the original harness's
        misleading ``404 Order not found``; these two lines are the whole reason
        the flow below can be trusted.
        """
        async with self.Session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    async def _override_current_user(self):
        """Whoever the test has signed in — a customer, or nobody at all.

        `get_current_user` is what `get_current_customer` builds on (cart, order
        reads, order history). It is NOT what `POST /orders` reads: that route
        takes `get_optional_user`, which resolves the bearer token itself, so
        both have to be injected for the authenticated checkout to be the one
        under test rather than the guest path.
        """
        actor = getattr(self, "actor", None)
        if actor is None:
            from app.core.exceptions import AuthenticationException

            raise AuthenticationException("Not authenticated.")
        return actor

    async def _override_optional_user(self):
        """The same identity for the routes that treat auth as optional."""
        return getattr(self, "actor", None)

    async def _seed_catalogue_and_users(self) -> None:
        async with self.Session() as session:
            # `product_id` mirrors the primary key (ProductModel's own comment):
            # both are set, because the column is NOT NULL with no default.
            self.product = ProductModel(
                id="PF5-SAR-0001",
                product_id="PF5-SAR-0001",
                name="Katan Silk Saree in Ivory",
                slug="phase5-katan-silk-saree-ivory",
                sku="PF5-SAR-01",
                category="sarees",
                price=2500,
                original_price=2500,
                stock=4,
                availability="in-stock",
                status="PUBLISHED",
                published=True,
                image="/images/products/women/sarees/silk/PF-W-SAR-SIL-0001/primary.avif",
            )
            self.scarce_product = ProductModel(
                id="PF5-SAR-0002",
                product_id="PF5-SAR-0002",
                name="Scarce Banarasi Saree",
                slug="phase5-scarce-banarasi-saree",
                sku="PF5-SAR-02",
                category="sarees",
                price=2500,
                original_price=2500,
                stock=1,
                availability="in-stock",
                status="PUBLISHED",
                published=True,
            )
            self.coupon = CouponModel(
                code="UTSAV10",
                name="Utsav 10",
                discount_type="percentage",
                discount_value=10,
                minimum_order_value=0,
                is_active=True,
            )
            # One signed-in shopper per test: a fresh customer id per test means
            # the cart cache (keyed on customer id) can never bleed between them.
            self.owner = UserModel(
                email=f"phase5-owner-{uuid.uuid4().hex[:8]}@pratikshyafashion.test",
                full_name="Phase Five Owner",
                hashed_password="x",
                user_type="customer",
                status="ACTIVE",
                is_verified=True,
                phone="9876543210",
                force_password_change=False,
            )
            self.other = UserModel(
                email="other-shopper@pratikshyafashion.test",
                full_name="Other Shopper",
                hashed_password="x",
                user_type="customer",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            session.add_all([self.product, self.scarce_product, self.coupon, self.owner, self.other])
            await session.commit()
            self.actor = self.owner

    # ── Helpers ───────────────────────────────────────────────────────────────

    def as_owner(self) -> None:
        self.actor = self.owner

    def as_other_customer(self) -> None:
        self.actor = self.other

    def as_guest(self) -> None:
        self.actor = None

    def add_to_cart(self, quantity: int = 1, product_id: Optional[str] = None):
        product_id = product_id or self.product.id
        response = self.client.post(
            "/api/v1/cart/items",
            json={"productId": product_id, "color": "Ivory", "size": "Free", "quantity": quantity},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response

    def totals(self, **params):
        query = {"deliveryMethod": "standard", "paymentMethod": "online", **params}
        response = self.client.get("/api/v1/cart/totals", params=query)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def order_body(self, quantity: int = 1, **overrides) -> Dict[str, Any]:
        body = {
            "items": [
                {
                    "productId": self.product.id,
                    "color": "Ivory",
                    "size": "Free",
                    "quantity": quantity,
                }
            ],
            "customer": {
                "firstName": "Aparna",
                "lastName": "Biswojit",
                "email": "aparna@pratikshyafashion.test",
                "phone": "9876543210",
            },
            "address": dict(ADDRESS),
            "deliveryMethod": "standard",
            "paymentMethod": "upi",
            "couponCode": None,
            "customerNote": None,
            "idempotencyKey": f"chk-{uuid.uuid4().hex[:24]}",
        }
        body.update(overrides)
        return body

    def place_order(self, quantity: int = 1, **overrides):
        return self.client.post("/api/v1/orders", json=self.order_body(quantity, **overrides))

    async def product_stock(self, product_id: Optional[str] = None) -> int:
        async with self.Session() as session:
            row = await session.get(ProductModel, product_id or self.product.id)
            return int(row.stock or 0)

    async def order_rows(self) -> list:
        async with self.Session() as session:
            result = await session.execute(select(OrderModel))
            return list(result.scalars().all())

    async def session_rows(self) -> list:
        async with self.Session() as session:
            result = await session.execute(select(PaymentSessionModel))
            return list(result.scalars().all())

    def create_session(self, order_id: str, **overrides):
        """The storefront's own session payload (`paymentsApi.js`): the API layer
        maps camelCase to these snake_case keys and the backend accepts both."""
        body = {
            "order_id": order_id,
            "payment_method": "upi",
            "idempotency_key": f"pay-{uuid.uuid4().hex[:24]}",
            "guest_email": None,
        }
        body.update(overrides)
        return self.client.post("/api/v1/payments/session", json=body)

    async def _placed_order(self, **overrides):
        placed = self.place_order(**overrides)
        self.assertEqual(placed.status_code, 201, placed.text)
        return placed.json()["order"]

    # ── 1 · cart totals ───────────────────────────────────────────────────────

    def test_cart_totals_apply_the_documented_shipping_and_cod_rules(self):
        """₹99 standard / ₹199 express / ₹0 + ₹49 COD — and no client-supplied total."""
        self.add_to_cart()

        standard = self.totals(deliveryMethod="standard", paymentMethod="online")
        self.assertEqual(standard["subtotal"], 2500)
        self.assertEqual(standard["shipping"], FLAT_SHIPPING_FEE)
        self.assertEqual(standard["cod_fee"], 0)
        self.assertEqual(standard["total"], 2500 + FLAT_SHIPPING_FEE)

        express = self.totals(deliveryMethod="express", paymentMethod="online")
        self.assertEqual(express["shipping"], EXPRESS_SHIPPING_FEE)
        self.assertEqual(express["total"], 2500 + EXPRESS_SHIPPING_FEE)

        normal_cod = self.totals(deliveryMethod="normal", paymentMethod="cod")
        self.assertEqual(normal_cod["shipping"], 0)
        self.assertEqual(normal_cod["cod_fee"], COD_FEE)
        self.assertEqual(normal_cod["total"], 2500 + COD_FEE)

        # A query-string amount is not part of the contract and cannot move it.
        forged = self.totals(deliveryMethod="standard", paymentMethod="online", total=1)
        self.assertEqual(forged["total"], 2500 + FLAT_SHIPPING_FEE)

    def test_cart_totals_are_free_at_the_threshold(self):
        """Standard shipping is complimentary at exactly ₹5,000."""
        self.add_to_cart(quantity=2)  # 2 × ₹2,500

        at_threshold = self.totals(deliveryMethod="standard", paymentMethod="online")
        self.assertEqual(at_threshold["subtotal"], FREE_SHIPPING_THRESHOLD)
        self.assertEqual(at_threshold["shipping"], 0)
        self.assertEqual(at_threshold["total"], FREE_SHIPPING_THRESHOLD)

        # Express is never free, however large the basket.
        express = self.totals(deliveryMethod="express", paymentMethod="online")
        self.assertEqual(express["shipping"], EXPRESS_SHIPPING_FEE)

    # ── 2 · order creation ────────────────────────────────────────────────────

    def test_place_order_ignores_client_supplied_amounts(self):
        """Forged amounts are not even read; the stored total is the server's."""
        body = self.order_body()
        body.update({"total": 1, "subtotal": 1, "discount": 9999, "couponDiscount": 9999})

        response = self.client.post("/api/v1/orders", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        order = response.json()["order"]

        self.assertEqual(order["subtotal"], 2500)
        self.assertEqual(order["shipping_fee"], FLAT_SHIPPING_FEE)
        self.assertEqual(order["coupon_discount"], 0)
        self.assertEqual(order["total"], 2500 + FLAT_SHIPPING_FEE)
        self.assertEqual(order["status"], "PENDING_PAYMENT")
        self.assertEqual(order["payment_status"], "PENDING_PAYMENT")

    def test_place_order_recomputes_the_coupon_authoritatively(self):
        """The coupon is revalidated and the discount recomputed server-side."""
        placed = self.place_order(couponCode="UTSAV10")
        self.assertEqual(placed.status_code, 201, placed.text)
        order = placed.json()["order"]

        self.assertEqual(order["coupon_code"], "UTSAV10")
        self.assertEqual(order["coupon_discount"], 250)            # 10 % of ₹2,500
        self.assertEqual(order["subtotal"], 2500)
        self.assertEqual(order["shipping_fee"], FLAT_SHIPPING_FEE)  # ₹2,250 < threshold
        self.assertEqual(order["total"], 2250 + FLAT_SHIPPING_FEE)  # ₹2,349

    async def test_out_of_stock_is_refused_and_stock_is_not_touched(self):
        """A quantity beyond stock is a client error, and no stock moves."""
        body = self.order_body()
        body["items"][0]["productId"] = self.scarce_product.id
        body["items"][0]["quantity"] = 3  # stock is 1

        response = self.client.post("/api/v1/orders", json=body)

        self.assertLess(response.status_code, 500, "a stock refusal must not be a server error")
        self.assertGreaterEqual(response.status_code, 400)
        self.assertEqual(await self.product_stock(self.scarce_product.id), 1)
        self.assertEqual(await self.order_rows(), [], "a refused order was persisted")

    # ── 3 · idempotency (Defect 2 pin) ────────────────────────────────────────

    async def test_a_replayed_attempt_returns_the_same_order(self):
        """Retrying a checkout attempt returns the original order, one decrement.

        Phase 5 Defect 2: `_find_order_by_number` loaded the order without its
        relationships, so the replay branch raised `MissingGreenlet` (HTTP 500)
        instead of returning the existing order. With the fix it returns the same
        id and order_number, and the stock is decremented exactly once.
        """
        stock_before = await self.product_stock()
        key = f"chk-replay-{uuid.uuid4().hex[:20]}"
        body = self.order_body(idempotencyKey=key)

        first = self.client.post("/api/v1/orders", json=body)
        self.assertEqual(first.status_code, 201, first.text)
        first_order = first.json()["order"]

        second = self.client.post("/api/v1/orders", json=body)
        self.assertEqual(second.status_code, 201, second.text)
        second_order = second.json()["order"]

        self.assertEqual(second_order["id"], first_order["id"])
        self.assertEqual(second_order["order_number"], first_order["order_number"])
        self.assertEqual(second_order["total"], first_order["total"])
        self.assertEqual(len(await self.order_rows()), 1, "the replay created a second order")
        self.assertEqual(await self.product_stock(), stock_before - 1, "stock moved more than once")

    # ── 4 · payment session ───────────────────────────────────────────────────

    async def test_payment_session_charges_the_order_total(self):
        """The gateway is asked for the order's authoritative total, in paise."""
        self.as_owner()
        order = await self._placed_order()

        key = f"pay-{uuid.uuid4().hex[:24]}"
        created = self.create_session(order["id"], idempotency_key=key)
        self.assertEqual(created.status_code, 201, created.text)
        session = created.json()

        self.assertTrue(session["ok"])
        self.assertEqual(session["amount_paise"], order["total"] * 100)
        self.assertEqual(session["status"], "CREATED")
        self.assertEqual(self.gateway_calls["order_create"]["amount"], order["total"] * 100)
        self.assertEqual(self.gateway_calls["order_create"]["currency"], "INR")

        # Resuming with the same idempotency key is not a second session.
        resumed = self.create_session(order["id"], idempotency_key=key)
        self.assertEqual(resumed.status_code, 201, resumed.text)
        self.assertEqual(resumed.json()["session_id"], session["session_id"])
        self.assertEqual(len(await self.session_rows()), 1, "a resumed session was duplicated")

    # ── 5 · signature verification ────────────────────────────────────────────

    async def _order_with_session(self):
        """One authenticated order, one payment session, one gateway order."""
        self.as_owner()
        order = await self._placed_order()
        self.assertEqual(order["total"], 2500 + FLAT_SHIPPING_FEE)
        created = self.create_session(order["id"])
        self.assertEqual(created.status_code, 201, created.text)
        return order, created.json()

    async def test_a_bad_signature_never_marks_the_order_paid(self):
        """A forged signature is rejected (422) and the order stays unpaid."""
        order, session = await self._order_with_session()

        response = self.client.post(
            "/api/v1/payments/verify",
            json={
                "razorpay_order_id": session["razorpay_order_id"],
                "razorpay_payment_id": "pay_FORGED000001",
                "razorpay_signature": "0" * 64,
                "guest_email": None,
            },
        )
        self.assertEqual(response.status_code, 422, response.text)

        async with self.Session() as db:
            row = await db.get(OrderModel, order["id"])
            self.assertEqual(row.payment_status, "PENDING_PAYMENT")
            self.assertNotEqual(row.status, "ORDER_CONFIRMED")

    async def test_a_configured_signature_is_accepted_and_marks_the_order_paid(self):
        """A signature computed with the configured secret completes the payment."""
        order, session = await self._order_with_session()

        payment_id = "pay_TEST00000001"
        message = f"{session['razorpay_order_id']}|{payment_id}".encode("utf-8")
        signature = hmac.new(TEST_SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()

        response = self.client.post(
            "/api/v1/payments/verify",
            json={
                "razorpay_order_id": session["razorpay_order_id"],
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
                "guest_email": None,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["paymentStatus"], "PAID")
        self.assertEqual(body["orderStatus"], "ORDER_CONFIRMED")

        async with self.Session() as db:
            row = await db.get(OrderModel, order["id"])
            self.assertEqual(row.payment_status, "PAID")
            self.assertEqual(row.status, "ORDER_CONFIRMED")

    # ── 6 · guest cancellation (Defect 1 pin) ─────────────────────────────────

    async def test_cancelling_a_session_accepts_the_guest_email_the_storefront_sends(self):
        """The guest email the storefront actually sends must be honoured.

        Phase 5 Defect 1: `CancelSessionRequest` aliased the field to camelCase
        without `populate_by_name`, so the `guest_email` key the storefront's API
        layer sends was silently dropped, the ownership check saw no guest email
        at all, and every guest cancellation was rejected with 403. With the fix
        the request is accepted (200) and the row is CANCELLED.
        """
        self.as_guest()
        guest_email = "guest-shopper@pratikshyafashion.test"
        body = self.order_body()
        body["customer"]["email"] = guest_email

        placed = self.client.post("/api/v1/orders", json=body)
        self.assertEqual(placed.status_code, 201, placed.text)
        order = placed.json()["order"]
        self.assertEqual(order["guest_email"], guest_email)

        created = self.create_session(order["id"], guest_email=guest_email)
        self.assertEqual(created.status_code, 201, created.text)
        session = created.json()

        # The snake_case spelling is the one the storefront sends.
        cancel = self.client.post(
            f"/api/v1/payments/session/{session['session_id']}/cancel",
            json={"reason": "Changed my mind", "guest_email": guest_email},
        )
        self.assertEqual(cancel.status_code, 200, cancel.text)
        self.assertEqual(cancel.json()["status"], "CANCELLED")

        async with self.Session() as db:
            row = await db.get(PaymentSessionModel, session["session_id"])
            self.assertEqual(row.status, "CANCELLED")

    # ── 7 · ownership ─────────────────────────────────────────────────────────

    async def test_order_retrieval_is_owner_only(self):
        """The owner reads their order; a different shopper cannot."""
        self.as_owner()
        order = await self._placed_order()

        mine = self.client.get(f"/api/v1/orders/{order['id']}")
        self.assertEqual(mine.status_code, 200, mine.text)
        self.assertEqual(mine.json()["order"]["id"], order["id"])

        self.as_other_customer()
        theirs = self.client.get(f"/api/v1/orders/{order['id']}")
        # 403 is the documented answer; 404 is equally honest (it reveals nothing).
        self.assertIn(theirs.status_code, (403, 404), theirs.text)
