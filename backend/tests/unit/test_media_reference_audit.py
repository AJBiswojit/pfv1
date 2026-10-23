"""
S3/CDN production readiness — deletion safety (Phase 5, risks D-1 … D-5).

Before this work, `DELETE /media/objects/{key}` counted only two of the five
reference families that exist in this schema. The two it missed were the
dangerous ones:

  · the LEGACY product image columns (`catalog_product.image`, `.hover_image`,
    `.additional_images`, `.media_ids`, `.primary_media_id`,
    `.gallery_media_ids`) — so deleting an object still shown on a product page
    was allowed;
  · `homepage_section_item.media_asset_id`, whose foreign key is
    `ON DELETE CASCADE` — so deleting the asset row silently removed live
    homepage content.

This suite asserts, against the real ORM models and the real router, that
every reference family blocks a delete and that nothing is ever cascade
removed. It also covers the dry-run orphan report, which reports and never
repairs.

SQLite is used through the same two test-only shims the Phase 6/7 suites use
(JSONB → JSON, `ATTACH DATABASE … AS pratikshya`), so it runs anywhere.
"""

from __future__ import annotations

import importlib
import os
import tempfile
import unittest

from fastapi_cache import FastAPICache
from fastapi_cache.backends import Backend
from sqlalchemy import event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover - dialect glue
    return "JSON"


class PassThroughCacheBackend(Backend):
    async def get_with_ttl(self, key):
        return 0, None

    async def get(self, key):
        return None

    async def set(self, key, value, expire=None):
        return None

    async def clear(self, namespace=None, key=None):
        return 0


importlib.import_module("app.models")  # noqa: E402 — registers every mapped class
from app.config import settings  # noqa: E402
from app.dependencies import get_current_user, get_db, get_optional_user  # noqa: E402
from app.models.auth.user import UserModel  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models.catalog.product import ProductModel  # noqa: E402
from app.models.media.homepage_section import (  # noqa: E402
    HomepageSectionItemModel,
    HomepageSectionModel,
)
from app.models.media.marketing_media import MarketingMediaModel  # noqa: E402
from app.models.media.media_asset import MediaAssetModel  # noqa: E402
from app.models.media.product_media import ProductMediaModel  # noqa: E402
from app.models.rbac.permission import PermissionModel  # noqa: E402
from app.models.rbac.role import RoleModel  # noqa: E402
from app.models.rbac.role_permission import RolePermissionModel  # noqa: E402
from app.models.rbac.user_role import UserRoleModel  # noqa: E402
from app.services.media.media_reference_audit import (  # noqa: E402
    _legacy_predicates,
    audit_object_references,
    orphan_report,
)
from app.storage import get_storage_provider, reset_storage_provider  # noqa: E402

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

PRODUCT_ID = "PF-W-SAR-SIL-0001"
OBJECT_KEY = f"products/{PRODUCT_ID}/cover.png"
LEGACY_IMAGE = f"/images/{OBJECT_KEY}"


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class MediaReferenceAuditCase(unittest.IsolatedAsyncioTestCase):
    """One real database + one real object store per test."""

    async def asyncSetUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-media-audit-")
        self.root = self._tmp.name
        self.main_db = os.path.join(self.root, "main.sqlite")
        self.schema_db = os.path.join(self.root, "pratikshya.sqlite")
        self.media_root = os.path.join(self.root, "media")

        self._saved_root = settings.LOCAL_MEDIA_ROOT
        settings.LOCAL_MEDIA_ROOT = self.media_root
        reset_storage_provider()
        self.provider = get_storage_provider()

        self.engine = create_async_engine(f"sqlite+aiosqlite:///{self.main_db}")
        schema_db = self.schema_db

        @event.listens_for(self.engine.sync_engine, "connect")
        def _attach(dbapi_conn, _record):  # pragma: no cover - driver hook
            cursor = dbapi_conn.cursor()
            cursor.execute(f"ATTACH DATABASE '{schema_db}' AS pratikshya")
            cursor.close()

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        await self._seed()
        self.app = self._build_app()
        from fastapi.testclient import TestClient

        self.client = TestClient(self.app)

    async def asyncTearDown(self):
        reset_storage_provider()
        settings.LOCAL_MEDIA_ROOT = self._saved_root
        FastAPICache.reset()
        await self.engine.dispose()
        self._tmp.cleanup()

    # -- fixtures ------------------------------------------------------------

    async def _seed(self):
        async with self.Session() as session:
            role = RoleModel(name="AUDIT_ADMIN", description="test", is_system=False)
            session.add(role)
            permissions = {}
            for code in ("media.view", "media.upload", "media.delete"):
                permission = PermissionModel(code=code, name=code, category="media", description=code)
                session.add(permission)
                permissions[code] = permission
            await session.flush()
            for code in permissions:
                session.add(RolePermissionModel(role_id=role.id, permission_id=permissions[code].id))

            admin = UserModel(
                email="pf-audit-admin@pratikshyafashon.test",
                full_name="Audit Admin",
                hashed_password="x",
                user_type="admin",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            customer = UserModel(
                email="pf-audit-shopper@pratikshyafashon.test",
                full_name="Shopper",
                hashed_password="x",
                user_type="customer",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            session.add_all([admin, customer])
            await session.flush()
            session.add(UserRoleModel(user_id=admin.id, role_id=role.id))

            session.add(
                ProductModel(
                    id=PRODUCT_ID,
                    product_id=PRODUCT_ID,
                    name="Audit Saree",
                    slug="audit-saree",
                    sku=PRODUCT_ID,
                    price=1000,
                    status="DRAFT",
                    published=False,
                )
            )
            await session.commit()
            self.admin_id = admin.id
            self.customer_id = customer.id

    def _build_app(self):
        from fastapi import FastAPI

        from app.api.v1.media import router as media_router
        from app.core.error_handlers import register_error_handlers

        app = FastAPI()
        register_error_handlers(app)
        FastAPICache.init(backend=PassThroughCacheBackend(), prefix="pf-audit-test")
        app.include_router(media_router, prefix="/api/v1")

        Session = self.Session

        async def _override_get_db():
            async with Session() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

        async def _dep():
            async with Session() as session:
                return (
                    await session.execute(select(UserModel).where(UserModel.id == self.admin_id))
                ).scalars().first()

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = _dep
        app.dependency_overrides[get_optional_user] = _dep
        return app

    # -- helpers -------------------------------------------------------------

    def _run(self, coroutine):
        import asyncio

        return asyncio.get_event_loop().run_until_complete(coroutine)

    def _store_object(self, key: str = OBJECT_KEY, data: bytes = PNG_BYTES) -> None:
        self.provider.put_object(key, data, content_type="image/png")

    def _make_asset(self, key: str = OBJECT_KEY) -> str:
        async def _create():
            async with self.Session() as session:
                row = (
                    await session.execute(
                        select(MediaAssetModel).where(MediaAssetModel.object_key == key)
                    )
                ).scalars().first()
                if row is None:
                    row = MediaAssetModel(
                        object_key=key,
                        storage_provider="local",
                        media_type="image",
                        mime_type="image/png",
                        original_filename=key.rsplit("/", 1)[-1],
                        file_size=len(PNG_BYTES),
                        checksum_sha256="0" * 64,
                        status="uploaded",
                        scope="product",
                    )
                    session.add(row)
                    await session.flush()
                asset_id = row.id
                await session.commit()
                return asset_id

        return self._run(_create())

    def _make_mapping(self, asset_id: str, **overrides) -> None:
        async def _create():
            async with self.Session() as session:
                session.add(
                    ProductMediaModel(
                        product_id=PRODUCT_ID,
                        media_id=asset_id,
                        role=overrides.get("role", "GALLERY"),
                        sort_order=overrides.get("sort_order", 0),
                        is_primary=overrides.get("is_primary", False),
                    )
                )
                await session.commit()

        self._run(_create())

    def _make_homepage_item(self, asset_id: str, slot: str = "lookbook-1") -> str:
        async def _create():
            async with self.Session() as session:
                section = HomepageSectionModel(section_key="sarees", is_active=True, revision=1)
                session.add(section)
                await session.flush()
                item = HomepageSectionItemModel(
                    section_id=section.id,
                    slot_key=slot,
                    content_type="MEDIA",
                    media_asset_id=asset_id,
                    is_active=True,
                    sort_order=0,
                )
                session.add(item)
                await session.flush()
                section_id, item_id = section.id, item.id
                await session.commit()
                return section_id, item_id

        return self._run(_create())

    def _count_homepage_items(self) -> int:
        async def _read():
            async with self.Session() as session:
                return int(
                    (
                        await session.execute(
                            select(HomepageSectionItemModel.media_asset_id).select_from(
                                HomepageSectionItemModel
                            )
                        )
                    ).all()
                    and (
                        await session.execute(select(HomepageSectionItemModel))
                    ).scalars().all()
                    and len((await session.execute(select(HomepageSectionItemModel))).scalars().all())
                )

        return self._run(_read())

    def _count_assets(self) -> int:
        async def _read():
            async with self.Session() as session:
                return len((await session.execute(select(MediaAssetModel))).scalars().all())

        return self._run(_read())

    def _set_product_columns(self, **values) -> None:
        async def _update():
            async with self.Session() as session:
                row = (
                    await session.execute(
                        select(ProductModel).where(ProductModel.id == PRODUCT_ID)
                    )
                ).scalars().first()
                for key, value in values.items():
                    setattr(row, key, value)
                await session.commit()

        self._run(_update())

    def _delete(self, key: str = OBJECT_KEY):
        return self.client.delete(f"/api/v1/media/objects/{key}")

    # -- D-1: legacy product image columns -----------------------------------

    def test_a_legacy_primary_image_reference_blocks_deletion(self):
        self._store_object()
        asset_id = self._make_asset()
        self._set_product_columns(image=LEGACY_IMAGE)

        audit = self._run(audit_object_references_db(self.Session, OBJECT_KEY))
        self.assertGreaterEqual(audit["references"]["productLegacy"], 1)
        self.assertTrue(audit["isReferenced"])

        response = self._delete()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("legacy product image", response.text)
        self.assertEqual(self._count_assets(), 1)
        self.assertTrue(self.provider.object_exists(OBJECT_KEY))

    def test_a_legacy_object_key_reference_blocks_deletion(self):
        """`image` may hold the bare object key rather than an /images/ path."""
        self._store_object()
        self._make_asset()
        self._set_product_columns(image=OBJECT_KEY)
        response = self._delete()
        self.assertEqual(response.status_code, 409, response.text)

    def test_a_canonical_media_url_reference_blocks_deletion(self):
        self._store_object()
        self._make_asset()
        self._set_product_columns(image=f"/api/v1/media/objects/{OBJECT_KEY}")
        response = self._delete()
        self.assertEqual(response.status_code, 409, response.text)

    def test_a_legacy_hover_image_reference_blocks_deletion(self):
        self._store_object()
        self._make_asset()
        self._set_product_columns(hover_image=LEGACY_IMAGE)
        self.assertEqual(self._delete().status_code, 409)

    def test_a_legacy_additional_images_reference_blocks_deletion(self):
        self._store_object()
        self._make_asset()
        self._set_product_columns(additional_images=[LEGACY_IMAGE])
        self.assertEqual(self._delete().status_code, 409)

    def test_legacy_media_id_json_columns_block_deletion(self):
        self._store_object()
        asset_id = self._make_asset()
        self._set_product_columns(media_ids=[asset_id], gallery_media_ids=[asset_id])
        self.assertEqual(self._delete().status_code, 409)

    def test_legacy_primary_media_id_blocks_deletion(self):
        self._store_object()
        asset_id = self._make_asset()
        self._set_product_columns(primary_media_id=asset_id)
        self.assertEqual(self._delete().status_code, 409)

    def test_legacy_json_columns_are_never_compared_with_equality(self):
        """PostgreSQL rejects `jsonb = character varying`.

        The JSON id columns (`additional_images`, `media_ids`,
        `gallery_media_ids`) are JSONB in the migrated schema. SQLite's dynamic
        typing hides the mistake, so this pins the PostgreSQL spelling: the
        audit must render those columns to text instead of comparing them to a
        string. A regression here surfaces as a 503 DATABASE_SCHEMA_ERROR on
        `DELETE /media/objects/{key}` and is misreported as a missing column.
        """
        from sqlalchemy.dialects import postgresql

        dialect = postgresql.dialect()
        needle = "marketing/media1.png"
        for column in (ProductModel.additional_images, ProductModel.media_ids, ProductModel.gallery_media_ids):
            sql = str(_legacy_predicates(column, [needle]).compile(dialect=dialect))
            self.assertNotIn(f"{column.name} = ", sql, sql)
            self.assertIn("LIKE", sql.upper(), sql)

        text_sql = str(_legacy_predicates(ProductModel.image, [needle]).compile(dialect=dialect))
        self.assertIn("image = ", text_sql, "plain text columns keep the cheaper equality form")

    # -- D-2: homepage sections must never be cascade-deleted -----------------

    def test_a_homepage_section_reference_blocks_deletion_and_the_content_survives(self):
        self._store_object()
        asset_id = self._make_asset()
        self._make_homepage_item(asset_id)
        self.assertEqual(self._count_homepage_items(), 1)

        response = self._delete()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("homepage section item", response.text)
        # THE regression: the FK is ON DELETE CASCADE, so a naive delete of the
        # asset row would have taken the homepage item with it.
        self.assertEqual(self._count_homepage_items(), 1)
        self.assertEqual(self._count_assets(), 1)
        self.assertTrue(self.provider.object_exists(OBJECT_KEY))

    # -- D-3: marketing placements -------------------------------------------

    def test_a_marketing_object_key_reference_blocks_deletion(self):
        self._store_object()
        self._make_asset()
        self._run(self._insert_marketing(OBJECT_KEY, None))
        self.assertEqual(self._delete().status_code, 409)

    def test_a_marketing_media_asset_id_reference_blocks_deletion(self):
        """Previously only `object_key` was counted — `media_asset_id` was not."""
        self._store_object()
        asset_id = self._make_asset()
        self._run(self._insert_marketing("hero/some-other.avif", asset_id))
        self.assertEqual(self._delete().status_code, 409)

    def test_a_marketing_mobile_asset_id_reference_blocks_deletion(self):
        self._store_object()
        asset_id = self._make_asset()
        self._run(self._insert_marketing("hero/some-other.avif", None, mobile_asset_id=asset_id))
        self.assertEqual(self._delete().status_code, 409)

    async def _insert_marketing(self, object_key, asset_id, mobile_asset_id=None):
        async with self.Session() as session:
            session.add(
                MarketingMediaModel(
                    placement="HOME_HERO",
                    object_key=object_key,
                    media_asset_id=asset_id,
                    mobile_media_asset_id=mobile_asset_id,
                    sort_order=0,
                    is_active=True,
                )
            )
            await session.commit()

    # -- D-1 (registered mapping) --------------------------------------------

    def test_a_registered_product_media_mapping_blocks_deletion(self):
        self._store_object()
        asset_id = self._make_asset()
        self._make_mapping(asset_id, is_primary=True)
        self.assertEqual(self._delete().status_code, 409)

    # -- happy path -----------------------------------------------------------

    def test_an_unreferenced_object_deletes_cleanly(self):
        self._store_object()
        asset_id = self._make_asset()
        response = self._delete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["deleted"])
        self.assertFalse(self.provider.object_exists(OBJECT_KEY))
        self.assertEqual(self._count_assets(), 0)

    def test_deleting_an_unknown_object_is_404(self):
        response = self._delete("products/PF-W-SAR-SIL-0001/never-there.png")
        self.assertEqual(response.status_code, 404, response.text)

    def test_a_customer_cannot_delete_media(self):
        self._store_object()
        self._make_asset()

        async def _dep():
            async with self.Session() as session:
                return (
                    await session.execute(
                        select(UserModel).where(UserModel.id == self.customer_id)
                    )
                ).scalars().first()

        self.app.dependency_overrides[get_current_user] = _dep
        self.app.dependency_overrides[get_optional_user] = _dep
        # get_current_admin rejects a non-admin before the permission check.
        self.assertNotEqual(self._delete().status_code, 200)
        self.assertTrue(self.provider.object_exists(OBJECT_KEY))

    # -- orphan report (dry run) ---------------------------------------------

    def test_the_orphan_report_lists_unreferenced_assets_and_deletes_nothing(self):
        self._store_object()
        self._make_asset()
        report = self._run(orphan_report_db(self.Session))
        self.assertEqual(report["mode"], "dry-run")
        self.assertFalse(report["deletionPerformed"])
        self.assertEqual(report["counts"]["assetsWithoutReferences"], 1)
        # Nothing was removed by the report itself.
        self.assertEqual(self._count_assets(), 1)
        self.assertTrue(self.provider.object_exists(OBJECT_KEY))

    def test_the_orphan_report_flags_a_stored_object_that_has_no_asset_row(self):
        """The residue of an upload that succeeded and a DB write that failed."""
        self._store_object("products/PF-W-SAR-SIL-0001/orphan.png")
        report = self._run(orphan_report_db(self.Session))
        keys = {item["objectKey"] for item in report["objectsWithoutAssetRows"]}
        self.assertIn("products/PF-W-SAR-SIL-0001/orphan.png", keys)
        self.assertFalse(report["deletionPerformed"])

    def test_the_orphan_report_excludes_referenced_assets(self):
        self._store_object()
        asset_id = self._make_asset()
        self._make_mapping(asset_id)
        report = self._run(orphan_report_db(self.Session))
        self.assertEqual(report["counts"]["assetsWithoutReferences"], 0)

    def test_the_orphan_endpoint_is_admin_only_and_deletes_nothing(self):
        self._store_object()
        self._make_asset()
        response = self.client.get("/api/v1/media/audit/orphans")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertFalse(body["deletionPerformed"])
        self.assertEqual(self._count_assets(), 1)


async def audit_object_references_db(Session, key):
    async with Session() as session:
        return await audit_object_references(session, key)


async def orphan_report_db(Session):
    async with Session() as session:
        return await orphan_report(session)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
