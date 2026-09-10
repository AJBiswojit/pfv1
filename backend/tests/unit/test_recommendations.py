"""Real ORM + SQLite behavioral/API tests, not PostgreSQL verification.

Fixtures are test-only; recommendation runtime never loads seeded results.
"""
import importlib
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI, Header
from sqlalchemy import event, select, text, delete, inspect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.exc import OperationalError, IntegrityError

import app.models
from app.models.base import Base
from app.models.auth.user import UserModel
from app.models.catalog.product import ProductModel
from app.models.catalog.category import CategoryModel, SubcategoryModel
from app.models.customer.product_interaction import UserProductInteractionModel as Interaction
from app.models.commerce.wishlist import WishlistModel
from app.models.commerce.wishlist_item import WishlistItemModel
from app.models.orders.order import OrderModel
from app.models.orders.order_item import OrderItemModel
from app.services.catalog.recommendation_service import RecommendationService, affinity, now_utc, record_behavior_safely
from app.services.commerce.wishlist_service import WishlistService
from app.dependencies import get_db, get_current_user
from app.core.error_handlers import register_error_handlers
from app.core.exceptions import UnauthorizedException
from app.api.v1.recommendations import router
from app.api.v1.products import router as products_router


@compiles(JSONB, "sqlite")
def jsonb_sqlite(type_, compiler, **kwargs):
    return "JSON"


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite://")
    @event.listens_for(engine.sync_engine, "connect")
    def attach(conn, _):
        conn.execute("ATTACH DATABASE ':memory:' AS pratikshya")
        conn.execute("PRAGMA foreign_keys=ON")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        session.add_all([UserModel(id=f"u{i}", full_name="Test customer", user_type="customer") for i in range(4)])
        session.add(UserModel(id="staff", full_name="Test employee", user_type="employee"))
        session.add_all([CategoryModel(id="silks", slug="silks", name="Silks", status="ACTIVE"),
                         CategoryModel(id="accessory", slug="accessory", name="Accessory", status="ACTIVE"),
                         CategoryModel(id="archived", slug="archived", name="Archived", status="ARCHIVED")])
        session.add(SubcategoryModel(id="subhidden", category_id="silks", name="Hidden", slug="hidden", status="ARCHIVED"))
        await session.flush()
        for pid, changes in {
            "source": {}, "similar": {}, "other": {"fabric": "Cotton"},
            "companion": {"category": "accessory"}, "unpublished": {"published": False},
            "draft": {"status": "DRAFT"}, "archived-product": {"status": "ARCHIVED"},
            "hidden-category": {"category": "archived"}, "hidden-sub": {"subcategory": "subhidden"},
            "out-of-stock": {"stock": 0}, "unavailable": {"availability": "out-of-stock"},
            "other-audience": {"gender": "Kids"},
        }.items():
            values = dict(id=pid, product_id=pid, name=pid, slug=pid, category="silks", gender="Women",
                          fabric="Silk", occasion=["Wedding"], colors=["Red"], patterns=[], stock=5,
                          status="PUBLISHED", published=True, availability="in-stock", price=1000)
            values.update(changes)
            session.add(ProductModel(**values))
        await session.commit()
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db):
    application = FastAPI()
    register_error_handlers(application)
    application.include_router(router, prefix="/api/v1")
    application.include_router(products_router, prefix="/api/v1")
    async def database():
        yield db
    async def identity(authorization: str | None = Header(None)):
        if not authorization:
            raise UnauthorizedException()
        user = await db.get(UserModel, authorization)
        if user is None:
            raise UnauthorizedException()
        return user
    application.dependency_overrides[get_db] = database
    application.dependency_overrides[get_current_user] = identity
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application), base_url="http://test") as http:
        yield http


def ids(items):
    return [p.id for p in items]


async def test_contextual_rank_visibility_and_dedup(db):
    service = RecommendationService(db)
    rows = await service.contextual("source")
    assert ids(rows) == ["similar", "other"]
    assert len(ids(rows)) == len(set(ids(rows)))
    assert ids(await service.contextual("source", "recommended")) == ["similar", "other"]
    assert await service.contextual("source", "complete-the-look") == []


@pytest.mark.parametrize("pid", ["missing", "draft", "unpublished", "archived-product", "hidden-category", "hidden-sub"])
async def test_hidden_or_deleted_source_is_404(client, pid):
    response = await client.get(f"/api/v1/products/{pid}/recommendations")
    assert response.status_code == 404


async def test_new_user_and_insufficient_history(db):
    service = RecommendationService(db)
    assert await service.personal("u0") == []
    assert await service.record("u0", "source", "VIEW")
    assert await service.personal("u0") == []
    assert ids(await service.personal("u0", "because-viewed")) == ["similar", "other"]
    assert await service.record("u0", "other", "VIEW")
    assert ids(await service.personal("u0")) == ["similar"]
    assert await service.personal("u1") == []


async def test_interaction_retry_bucket_and_server_ownership(client, db):
    payload = {"productId": "source", "eventType": "VIEW", "idempotencyKey": "b6077a02-b891-43a3-8fe2-fae9ea73af2e"}
    for _ in range(2):
        response = await client.post("/api/v1/customers/me/product-interactions", json=payload, headers={"Authorization": "u0"})
        assert response.status_code == 200, response.text
    payload.pop("idempotencyKey")
    await client.post("/api/v1/customers/me/product-interactions", json=payload, headers={"Authorization": "u0"})
    events = (await db.execute(select(Interaction))).scalars().all()
    assert len(events) == 1 and events[0].customer_id == "u0"
    assert response.headers["cache-control"] == "private, no-store"
    response = await client.get("/api/v1/customers/me/recommendations?type=because-viewed", headers={"Authorization": "u1"})
    assert response.json()["items"] == []
    assert "customer_id" not in response.text and "dedup_key" not in response.text


@pytest.mark.parametrize("payload", [
    {"productId": "source", "eventType": "PURCHASE"},
    {"productId": "source", "eventType": "WISHLIST"},
    {"productId": "source", "eventType": "VIEW", "customer_id": "u1"},
    {"productId": "source", "eventType": "VIEW", "created_at": "2020-01-01"},
    {"productId": "../private", "eventType": "VIEW"},
    {"productId": "source", "eventType": "VIEW", "idempotencyKey": "not-a-uuid"},
])
async def test_payload_validation(client, payload):
    assert (await client.post("/api/v1/customers/me/product-interactions", json=payload, headers={"Authorization": "u0"})).status_code == 422


@pytest.mark.parametrize("identity, status", [(None, 401), ("staff", 403)])
async def test_customer_scope_required(client, identity, status):
    headers = {"Authorization": identity} if identity else {}
    assert (await client.get("/api/v1/customers/me/recommendations", headers=headers)).status_code == status
    assert (await client.post("/api/v1/customers/me/product-interactions", headers=headers,
        json={"productId": "source", "eventType": "CLICK"})).status_code == status


async def test_api_validation_and_failure(client):
    assert (await client.get("/api/v1/products/source/recommendations?type=anything")).status_code == 422
    assert (await client.get("/api/v1/customers/me/recommendations?limit=100", headers={"Authorization": "u0"})).status_code == 422
    with patch.object(RecommendationService, "personal", AsyncMock(side_effect=OperationalError("private SQL", {}, Exception()))):
        response = await client.get("/api/v1/customers/me/recommendations", headers={"Authorization": "u0"})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "RECOMMENDATIONS_UNAVAILABLE"
        assert "private SQL" not in response.text
    with patch.object(RecommendationService, "contextual", AsyncMock(side_effect=OperationalError("private SQL", {}, Exception()))):
        response = await client.get("/api/v1/products/source/recommendations")
        assert response.status_code == 503


async def test_wishlist_current_state_removal_and_events(db):
    wishlist = WishlistService(db)
    await wishlist.add_product("u0", "source")
    service = RecommendationService(db)
    assert ids(await service.personal("u0")) == ["similar", "other"]
    await wishlist.remove_product("u0", "source")
    assert await service.personal("u0") == []
    events = (await db.execute(select(Interaction.event_type))).scalars().all()
    assert sorted(events) == ["UNWISHLIST", "WISHLIST"]


async def test_failure_isolated_from_business_transaction(db):
    await db.execute(text("DROP TABLE pratikshya.user_product_interactions"))
    await db.commit()
    await WishlistService(db).add_product("u0", "source")
    await db.commit()
    assert (await db.execute(select(WishlistItemModel.product_id))).scalar() == "source"


async def test_stale_history_and_decay(db):
    service = RecommendationService(db)
    await service.record("u0", "source", "VIEW")
    row = (await db.execute(select(Interaction))).scalar_one()
    row.created_at = now_utc() - timedelta(days=181)
    await db.flush()
    assert await service.personal("u0", "because-viewed") == []


async def delivered_pair(db, owner, number, returned=0):
    order = OrderModel(id=number, order_number=number, customer_id=owner, payment_method="cod", status="DELIVERED")
    db.add(order)
    await db.flush()
    for pid in ["source", "companion"]:
        db.add(OrderItemModel(order_id=order.id, product_id=pid, product_name=pid, sku=pid,
                             unit_price=1000, original_price=1000, quantity=1, line_total=1000, returned_quantity=returned))
    await db.flush()


async def test_complement_requires_distinct_customers_delivered_unreturned(db):
    service = RecommendationService(db)
    await delivered_pair(db, "u0", "o0")
    await delivered_pair(db, "u0", "o1")
    await delivered_pair(db, "u1", "o2")
    assert await service.contextual("source", "cart") == []
    await delivered_pair(db, "u2", "o3", returned=1)
    assert await service.contextual("source", "cart") == []
    await delivered_pair(db, "u2", "o4")
    assert ids(await service.contextual("source", "complete-the-look")) == ["companion"]
    # Source purchase gives strong personal affinity; purchased anchors excluded.
    assert "source" not in ids(await service.personal("u0"))
    companion = await db.get(ProductModel, "companion")
    companion.published = False
    await db.flush()
    assert await service.contextual("source", "complete-the-look") == []


async def test_foreign_keys_and_cascade(db):
    service = RecommendationService(db)
    await service.record("u0", "source", "VIEW")
    await db.execute(delete(ProductModel).where(ProductModel.id == "source"))
    await db.flush()
    assert (await db.execute(select(Interaction))).scalars().all() == []
    await service.record("u1", "similar", "VIEW")
    await db.execute(delete(UserModel).where(UserModel.id == "u1"))
    assert (await db.execute(select(Interaction))).scalars().all() == []
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(Interaction(customer_id="missing", product_id="similar", event_type="VIEW", dedup_key="key", event_bucket=0))
            await db.flush()


async def test_migration_upgrade_downgrade_only_behavioral_table(db):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from importlib.util import spec_from_file_location, module_from_spec
    from pathlib import Path
    spec = spec_from_file_location("behavior_migration", Path(__file__).parents[2] / "alembic/versions/d8e9f0a1b2c3_add_product_interactions.py")
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    connection = await db.connection()
    def verify(conn):
        with Operations.context(MigrationContext.configure(conn)):
            migration.downgrade()
            migration.upgrade()
        inspector = inspect(conn)
        assert len(inspector.get_foreign_keys("user_product_interactions", schema="pratikshya")) == 2
        assert len(inspector.get_unique_constraints("user_product_interactions", schema="pratikshya")) == 2
        assert inspector.has_table("audit_activity_log", schema="pratikshya")
    await connection.run_sync(verify)


def test_missing_attributes_never_boost():
    a = ProductModel(gender="Women", category="silks", colors=[], occasion=[], patterns=[])
    b = ProductModel(gender="Women", category="other", colors=[], occasion=[], patterns=[])
    assert affinity(a, b) == 0
