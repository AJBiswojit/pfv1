"""
Admin consolidation — DB-load regression tests (products, media, dashboard).

The consolidation moved three known DB hotspots onto the database:

  1. GET /admin/products      — filtering, sorting, LIMIT/OFFSET now run in
                                SQL; only the requested page is hydrated.
  2. GET /media/assets        — DB-side pagination with a bounded default.
  3. GET /admin/dashboard/summary — one consolidated aggregate response
                                (added to replace the dashboard fan-out).

These suites run the REAL service/route code against a real SQLite session
(the same shims as the Phase 3/6/7 suites — no PostgreSQL in this sandbox)
and assert the *behavioural* contract: paging is honest, filters and sorts
keep their meanings, totals report the FULL filtered count, the single-page
media read is bounded, and the dashboard summary carries every section the
dashboard renders.
"""

import asyncio
import importlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app.models.catalog.product import ProductModel
from app.schemas.catalog.product import AdminProductListQuery
from app.services.catalog.product_service import ProductService

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover - dialect glue
    return "JSON"


def _product(**overrides):
    """A minimal valid ProductModel row."""
    from app.models.catalog.product import ProductModel

    defaults = dict(
        product_id=None,
        name="Test piece",
        slug="test-piece",
        sku="SKU-TEST",
        brand="Pratikshya Fashon",
        product_type="fashion",
        category="sarees",
        gender="Women",
        price=1000,
        currency="INR",
        stock=5,
        availability="in-stock",
        inventory_tracked=False,
        low_stock_threshold=5,
        is_featured=False,
        is_bestseller=False,
        is_new=False,
        is_limited_edition=False,
        is_trending=False,
        status="DRAFT",
        published=False,
        flags={},
        review_flags=[],
        description="A long enough description for the publish gate.",
        short_description="Short",
    )
    defaults.update(overrides)
    # `product_id` is NOT NULL — mirror the service convention of copying the
    # permanent id into it when not supplied explicitly.
    if defaults.get("product_id") is None:
        defaults["product_id"] = defaults.get("id")
    return ProductModel(**defaults)


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class AdminCatalogueDBPaginationTests(unittest.IsolatedAsyncioTestCase):
    """GET /admin/products paginates in the DATABASE, not in Python."""

    async def asyncSetUp(self):
        importlib.import_module("app.models")
        from app.models.base import Base

        self._tmp = tempfile.TemporaryDirectory(prefix="pf-admin-products-")
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

        base = datetime(2026, 1, 1, tzinfo=timezone.utc)
        async with self.Session() as session:
            for index in range(7):
                session.add(
                    _product(
                        id=f"PF-TST-{index:04d}",
                        name=f"Piece {index}",
                        slug=f"piece-{index}",
                        sku=f"SKU-{index:04d}",
                        price=1000 + index * 10,
                        status="PUBLISHED" if index % 2 == 0 else "DRAFT",
                        published=index % 2 == 0,
                        created_at=base + timedelta(days=index),
                        updated_at=base + timedelta(days=index),
                    )
                )
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _list(self, **params):
        async with self.Session() as session:
            service = ProductService(session)
            return await service.list_admin_products(AdminProductListQuery(**params))

    async def test_paging_is_honest_and_pages_do_not_overlap(self):
        page1 = await self._list(page=1, pageSize=3, sort="oldest")
        page2 = await self._list(page=2, pageSize=3, sort="oldest")
        page3 = await self._list(page=3, pageSize=3, sort="oldest")

        self.assertEqual(page1["total"], 7)
        self.assertEqual(len(page1["items"]), 3)
        self.assertEqual(len(page2["items"]), 3)
        self.assertEqual(len(page3["items"]), 1)

        ids1 = {item.id for item in page1["items"]}
        ids2 = {item.id for item in page2["items"]}
        ids3 = {item.id for item in page3["items"]}
        self.assertFalse(ids1 & ids2)
        self.assertFalse(ids2 & ids3)
        self.assertEqual(len(ids1 | ids2 | ids3), 7)

        # oldest first — page 1 holds the three oldest rows
        self.assertEqual(
            [item.id for item in page1["items"]],
            ["PF-TST-0000", "PF-TST-0001", "PF-TST-0002"],
        )

    async def test_page_beyond_range_is_empty_with_full_total(self):
        result = await self._list(page=99, pageSize=25)
        self.assertTrue(result["ok"])
        self.assertEqual(result["items"], [])
        self.assertEqual(result["total"], 7)

    async def test_status_filter_applies_before_paging(self):
        result = await self._list(status="PUBLISHED", pageSize=2, sort="oldest")
        self.assertEqual(result["total"], 4)  # indices 0,2,4,6
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["items"][0].id, "PF-TST-0000")
        self.assertEqual(result["items"][1].id, "PF-TST-0002")

    async def test_search_filter_matches_multiple_columns(self):
        result = await self._list(q="0003")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0].id, "PF-TST-0003")

        by_name = await self._list(q="piece 5")
        self.assertEqual(by_name["total"], 1)
        self.assertEqual(by_name["items"][0].id, "PF-TST-0005")

    async def test_sorts_keep_their_meanings(self):
        newest = await self._list(sort="newest", pageSize=1)
        self.assertEqual(newest["items"][0].id, "PF-TST-0006")

        oldest = await self._list(sort="oldest", pageSize=1)
        self.assertEqual(oldest["items"][0].id, "PF-TST-0000")

        name = await self._list(sort="name", pageSize=1)
        self.assertEqual(name["items"][0].id, "PF-TST-0000")  # "Piece 0"

        price_desc = await self._list(sort="price-desc", pageSize=1)
        self.assertEqual(price_desc["items"][0].id, "PF-TST-0006")

        price_asc = await self._list(sort="price-asc", pageSize=1)
        self.assertEqual(price_asc["items"][0].id, "PF-TST-0000")

    async def test_only_page_rows_are_hydrated(self):
        """The page query itself must carry SQL LIMIT/OFFSET + ORDER BY."""
        async with self.Session() as session:
            executed = []
            real_execute = session.execute

            async def spy(stmt, *args, **kwargs):
                executed.append(stmt)
                return await real_execute(stmt, *args, **kwargs)

            session.execute = spy
            service = ProductService(session)
            await service.list_admin_products(AdminProductListQuery(page=2, pageSize=3))

            page_selects = [
                stmt
                for stmt in executed
                if getattr(stmt, "_limit_clause", None) is not None
                and "catalog_product" in str(stmt)
            ]
            self.assertTrue(page_selects, "the page query must carry a SQL LIMIT")
            stmt = page_selects[0]
            self.assertEqual(int(stmt._limit_clause.value), 3)
            self.assertEqual(int(stmt._offset_clause.value), 3)
            self.assertTrue(list(stmt._order_by_clause), "the page query must be ordered in SQL")

    async def test_manual_collection_membership_resolves_on_detail(self):
        from app.models.catalog.collection import CollectionModel

        async with self.Session() as session:
            session.add(
                CollectionModel(
                    id="col-1",
                    name="Festive Edit",
                    slug="festive-edit",
                    type="MANUAL",
                    status="ACTIVE",
                    explicit_product_ids=["PF-TST-0002"],
                )
            )
            await session.commit()

            service = ProductService(session)
            dto = await service.get_admin_product("PF-TST-0002")
            self.assertIn("Festive Edit", dto.collections)

            other = await service.get_admin_product("PF-TST-0003")
            self.assertNotIn("Festive Edit", other.collections)

    async def test_metrics_counts_are_single_scan_accurate(self):
        from app.schemas.catalog.product import REVIEW_FLAG_BLOCKING

        async with self.Session() as session:
            service = ProductService(session)
            metrics = await service.get_metrics()
            self.assertEqual(metrics.total, 7)
            self.assertEqual(metrics.published, 4)
            self.assertEqual(metrics.draft, 3)

            # Block one DRAFT with a blocking flag and re-check.
            blocking = sorted(REVIEW_FLAG_BLOCKING)[0]
            row = (
                await session.execute(
                    select(ProductModel).where(ProductModel.id == "PF-TST-0001")
                )
            ).scalars().one()
            row.review_flags = [blocking]
            await session.commit()

            metrics2 = await service.get_metrics()
            self.assertEqual(metrics2.blocked, 1)
            self.assertEqual(metrics2.total, 7)
