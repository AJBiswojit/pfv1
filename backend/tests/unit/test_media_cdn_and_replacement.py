"""
S3/CDN production readiness — CDN delivery, replacement safety and mock-asset
protection (Phases 3, 4 and 5).

Covered:

  · `MEDIA_CDN_BASE_URL` is the single CDN source of truth, and the dead
    `CDN_BASE_URL` setting is gone;
  · cache policy: content-addressed keys are immutable, mutable keys are not;
  · object keys stay stable, and a replacement lands on a NEW
    content-addressed key so no browser or CDN cache can serve stale art;
  · identical re-uploads are recognised, not rewritten;
  · the mock asset library can never be imported into a remote bucket;
  · a failed database registration rolls its object back instead of leaving an
    unmanaged object behind;
  · image dimension / decompression-bomb validation.
"""

from __future__ import annotations

import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

importlib.import_module("app.models")  # registers every mapped class

from app.config import settings  # noqa: E402
from app.models.auth.user import UserModel  # noqa: E402
from app.models.catalog.product import ProductModel  # noqa: E402
from app.models.media.media_asset import MediaAssetModel  # noqa: E402
from app.models.rbac.permission import PermissionModel  # noqa: E402
from app.models.rbac.role import RoleModel  # noqa: E402
from app.models.rbac.role_permission import RolePermissionModel  # noqa: E402
from app.models.rbac.user_role import UserRoleModel  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.dependencies import get_current_user, get_db, get_optional_user  # noqa: E402
from app.services.media.media_service import MediaService  # noqa: E402
from app.services.media.media_validation import (  # noqa: E402
    DIMENSION_NOT_DECODABLE,
    DIMENSION_OK,
    MediaValidationError,
    image_geometry,
    validate_image_bytes,
)
from app.storage import (  # noqa: E402
    LocalStorageProvider,
    ObjectCollisionError,
    create_storage_provider,
    get_storage_provider,
    reset_storage_provider,
)
from app.storage.keys import (  # noqa: E402
    content_addressed_product_key,
    is_content_addressed_key,
    product_object_key,
)
from app.storage.urls import (  # noqa: E402
    IMMUTABLE_CACHE_CONTROL,
    MUTABLE_CACHE_CONTROL,
    build_media_url,
    cache_control_for_key,
    is_media_url,
    object_key_from_media_url,
)

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
AVIF_BYTES = (
    b"\x00\x00\x00\x1c" + b"ftypavif" + b"\x00\x00\x00\x00avifmif1" + b"\x00\x00\x00\x00"
)

PRODUCT_ID = "PF-W-SAR-SIL-0001"
KEY = f"products/{PRODUCT_ID}/cover.png"


# ===========================================================================
# 1. CDN configuration — one source of truth
# ===========================================================================


class CdnConfigurationTests(unittest.TestCase):
    def setUp(self):
        self._saved = settings.MEDIA_CDN_BASE_URL

    def tearDown(self):
        settings.MEDIA_CDN_BASE_URL = self._saved

    def test_the_dead_cdn_base_url_setting_is_gone(self):
        """`CDN_BASE_URL` was declared but read by nothing — a trap."""
        self.assertFalse(hasattr(settings, "CDN_BASE_URL"))

    def test_without_a_cdn_the_url_is_the_api_media_route(self):
        settings.MEDIA_CDN_BASE_URL = None
        self.assertEqual(build_media_url(KEY), f"/api/v1/media/objects/{KEY}")

    def test_with_a_cdn_the_url_is_the_canonical_cdn_url(self):
        settings.MEDIA_CDN_BASE_URL = "https://cdn.pratikshyafashion.com/"
        self.assertEqual(build_media_url(KEY), f"https://cdn.pratikshyafashion.com/{KEY}")

    def test_the_cdn_url_shape_is_recognised_both_ways(self):
        settings.MEDIA_CDN_BASE_URL = "https://cdn.pratikshyafashion.com"
        url = build_media_url(KEY)
        self.assertTrue(is_media_url(url))
        self.assertEqual(object_key_from_media_url(url), KEY)
        # And the API-route shape still resolves when no CDN is configured.
        settings.MEDIA_CDN_BASE_URL = None
        self.assertEqual(object_key_from_media_url(build_media_url(KEY)), KEY)

    def test_an_unusable_key_never_becomes_a_url(self):
        from app.storage import InvalidObjectKeyError

        with self.assertRaises(InvalidObjectKeyError):
            build_media_url("../../etc/passwd")


# ===========================================================================
# 2. Cache policy
# ===========================================================================


class CachePolicyTests(unittest.TestCase):
    def test_a_content_addressed_key_is_immutable(self):
        key = content_addressed_product_key(PRODUCT_ID, "cover.png", "a" * 64)
        self.assertEqual(cache_control_for_key(key), IMMUTABLE_CACHE_CONTROL)

    def test_a_mutable_key_revalidates(self):
        self.assertEqual(cache_control_for_key(KEY), MUTABLE_CACHE_CONTROL)
        self.assertIn("must-revalidate", MUTABLE_CACHE_CONTROL)

    def test_key_recognition(self):
        self.assertTrue(
            is_content_addressed_key(content_addressed_product_key(PRODUCT_ID, "cover.png", "b" * 64))
        )
        self.assertFalse(is_content_addressed_key(KEY))
        self.assertFalse(is_content_addressed_key("products/PF-A/not-a-digest.png"))
        self.assertFalse(is_content_addressed_key("products/PF-A/../etc/passwd"))

    def test_the_content_addressed_key_is_deterministic_and_legal(self):
        first = content_addressed_product_key(PRODUCT_ID, "cover.png", "c" * 64)
        second = content_addressed_product_key(PRODUCT_ID, "cover.png", "c" * 64)
        self.assertEqual(first, second)
        self.assertTrue(first.startswith(f"products/{PRODUCT_ID}/"))
        self.assertNotEqual(
            first, content_addressed_product_key(PRODUCT_ID, "cover.png", "d" * 64)
        )
        # Still a legal object key, so it survives the normal key validation.
        from app.storage import normalize_object_key

        self.assertEqual(normalize_object_key(first), first)


# ===========================================================================
# 3. Replacement semantics
# ===========================================================================


class MediaServiceReplacementTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-replace-")
        self.root = Path(self._tmp.name) / "media"
        self.provider = LocalStorageProvider(self.root)
        self.service = MediaService(None, storage=self.provider)

    def tearDown(self):
        self._tmp.cleanup()

    def test_the_first_write_uses_the_stable_deterministic_key(self):
        stored = self.service.store_image(
            filename="cover.png", data=PNG_BYTES, product_id=PRODUCT_ID
        )
        self.assertEqual(stored["key"], product_object_key(PRODUCT_ID, "cover.png"))
        self.assertTrue(stored["created"])

    def test_an_identical_reupload_is_recognised_and_not_rewritten(self):
        first = self.service.store_image(
            filename="cover.png", data=PNG_BYTES, product_id=PRODUCT_ID
        )
        second = self.service.store_image(
            filename="cover.png", data=PNG_BYTES, product_id=PRODUCT_ID
        )
        self.assertFalse(second["created"])
        self.assertTrue(second["alreadyExists"])
        self.assertEqual(first["key"], second["key"])

    def test_different_bytes_are_refused_without_an_explicit_replace(self):
        self.service.store_image(filename="cover.png", data=PNG_BYTES, product_id=PRODUCT_ID)
        with self.assertRaises(ObjectCollisionError):
            self.service.store_image(filename="cover.png", data=AVIF_BYTES, product_id=PRODUCT_ID)
        # The original bytes are untouched.
        self.assertEqual(self.provider.get_object(KEY), PNG_BYTES)

    def test_a_replacement_lands_on_a_new_content_addressed_key(self):
        original = self.service.store_image(
            filename="cover.png", data=PNG_BYTES, product_id=PRODUCT_ID
        )
        replacement = self.service.store_image(
            filename="cover.png",
            data=AVIF_BYTES,
            product_id=PRODUCT_ID,
            replace_existing=True,
        )
        self.assertTrue(replacement["replaced"])
        self.assertNotEqual(original["key"], replacement["key"])
        self.assertEqual(replacement["replacedFromKey"], original["key"])
        self.assertTrue(is_content_addressed_key(replacement["key"]))
        # Both objects exist: the old one is a recovery copy, not a casualty.
        self.assertTrue(self.provider.object_exists(original["key"]))
        self.assertTrue(self.provider.object_exists(replacement["key"]))
        self.assertEqual(self.provider.get_object(replacement["key"]), AVIF_BYTES)
        self.assertEqual(self.provider.get_object(original["key"]), PNG_BYTES)

    def test_the_replacement_is_served_with_an_immutable_cache_policy(self):
        self.service.store_image(filename="cover.png", data=PNG_BYTES, product_id=PRODUCT_ID)
        replacement = self.service.store_image(
            filename="cover.png", data=AVIF_BYTES, product_id=PRODUCT_ID, replace_existing=True
        )
        self.assertEqual(replacement["cacheControl"], IMMUTABLE_CACHE_CONTROL)
        self.assertEqual(cache_control_for_key(replacement["key"]), IMMUTABLE_CACHE_CONTROL)

    def test_object_keys_stay_stable_across_a_fresh_provider(self):
        """The key must not depend on which provider instance wrote it."""
        key = product_object_key(PRODUCT_ID, "cover.avif")
        self.assertEqual(key, "products/PF-W-SAR-SIL-0001/cover.avif")
        other = LocalStorageProvider(Path(self._tmp.name) / "media2")
        self.assertEqual(
            MediaService(None, storage=other).object_key_for_upload(
                "cover.avif", product_id=PRODUCT_ID
            ),
            key,
        )

    def test_the_content_type_comes_from_the_bytes_not_the_filename(self):
        stored = self.service.store_image(
            filename="cover.png", data=AVIF_BYTES, product_id=PRODUCT_ID
        )
        self.assertEqual(stored["contentType"], "image/avif")


# ===========================================================================
# 4. The media route honours the cache policy
# ===========================================================================


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class MediaRouteCacheTests(unittest.TestCase):
    def setUp(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from app.api.v1.media import router as media_router
        from app.core.error_handlers import register_error_handlers

        self._tmp = tempfile.TemporaryDirectory(prefix="pf-route-cache-")
        self._saved_root = settings.LOCAL_MEDIA_ROOT
        settings.LOCAL_MEDIA_ROOT = str(Path(self._tmp.name) / "media")
        reset_storage_provider()
        self.provider = get_storage_provider()

        app = FastAPI()
        register_error_handlers(app)
        app.include_router(media_router, prefix="/api/v1")
        self.client = TestClient(app)

    def tearDown(self):
        reset_storage_provider()
        settings.LOCAL_MEDIA_ROOT = self._saved_root
        self._tmp.cleanup()

    def _put(self, key, data):
        from app.services.media.media_service import MediaService

        MediaService(None, storage=self.provider).store_image(
            filename=key.rsplit("/", 1)[-1],
            data=data,
            namespace="products",
            product_id=PRODUCT_ID,
            object_key=key,
        )

    def test_a_mutable_object_revalidates(self):
        self._put(KEY, PNG_BYTES)
        response = self.client.get(f"/api/v1/media/objects/{KEY}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], MUTABLE_CACHE_CONTROL)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_an_immutable_object_is_cached_for_a_year(self):
        key = content_addressed_product_key(PRODUCT_ID, "cover.png", "e" * 64)
        self._put(key, PNG_BYTES)
        response = self.client.get(f"/api/v1/media/objects/{key}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], IMMUTABLE_CACHE_CONTROL)


# ===========================================================================
# 5. Mock assets may never be uploaded to a remote bucket
# ===========================================================================


class MockAssetProtectionTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-mock-src-")
        self.source = Path(self._tmp.name) / "images"
        (self.source / "products" / PRODUCT_ID).mkdir(parents=True)
        (self.source / "products" / PRODUCT_ID / "primary.png").write_bytes(PNG_BYTES)
        (self.source / "auth").mkdir(parents=True)
        (self.source / "auth" / "screen.webp").write_bytes(PNG_BYTES)
        self._saved_flag = settings.MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE

    def tearDown(self):
        settings.MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE = self._saved_flag
        self._tmp.cleanup()

    def test_the_importer_refuses_a_remote_provider(self):
        from app.services.media.local_media_migration import (
            RemoteImportRefused,
            run_migration,
        )
        from app.storage.s3 import S3StorageProvider

        remote = S3StorageProvider(
            bucket="pratikshya-media-staging",
            region="ap-south-1",
            access_key_id="AKIAFAKEFAKEFAKEFAKE",
            secret_access_key="a-real-looking-secret",
        )
        with self.assertRaises(RemoteImportRefused) as ctx:
            run_migration(self.source, remote)
        self.assertIn("DEVELOPMENT MOCK", str(ctx.exception))

    def test_the_refusal_can_only_be_lifted_by_both_a_flag_and_a_setting(self):
        from app.services.media.local_media_migration import (
            RemoteImportRefused,
            run_migration,
        )
        from app.storage.s3 import S3StorageProvider

        remote = S3StorageProvider(
            bucket="pratikshya-media-staging",
            region="ap-south-1",
            access_key_id="AKIAFAKEFAKEFAKEFAKE",
            secret_access_key="a-real-looking-secret",
        )
        # Flag alone is not enough…
        with self.assertRaises(RemoteImportRefused):
            run_migration(self.source, remote, allow_remote=True)
        # …and the setting alone is not enough.
        settings.MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE = True
        with self.assertRaises(RemoteImportRefused):
            run_migration(self.source, remote)

    def test_the_importer_still_works_against_the_local_provider(self):
        from app.services.media.local_media_migration import run_migration

        target = LocalStorageProvider(Path(self._tmp.name) / "store")
        report = run_migration(self.source, target, dry_run=True)
        self.assertEqual(report.counts["planned"], 1)
        self.assertEqual(report.counts["invalid"], 0)

    def test_application_chrome_is_never_imported_as_media(self):
        from app.services.media.local_media_migration import (
            discover_source_files,
            run_migration,
        )

        names = {
            str(p.relative_to(self.source)).replace("\\", "/")
            for p in discover_source_files(self.source)
        }
        self.assertNotIn("auth/screen.webp", names)
        # …and it is still on disk afterwards.
        self.assertTrue((self.source / "auth" / "screen.webp").is_file())

        target = LocalStorageProvider(Path(self._tmp.name) / "store2")
        run_migration(self.source, target)
        self.assertFalse(target.object_exists("auth/screen.webp"))


# ===========================================================================
# 6. Upload validation hardening
# ===========================================================================


class ImageValidationTests(unittest.TestCase):
    def setUp(self):
        self._saved_pixels = settings.MAX_IMAGE_PIXELS
        self._saved_side = settings.MAX_IMAGE_DIMENSION_PX

    def tearDown(self):
        settings.MAX_IMAGE_PIXELS = self._saved_pixels
        settings.MAX_IMAGE_DIMENSION_PX = self._saved_side

    def test_a_decodable_image_reports_its_geometry(self):
        width, height, reason = image_geometry(PNG_BYTES)
        self.assertEqual(reason, DIMENSION_OK)
        self.assertEqual((width, height), (1, 1))

    def test_an_oversized_declared_dimension_is_rejected(self):
        settings.MAX_IMAGE_DIMENSION_PX = 4
        settings.MAX_IMAGE_PIXELS = 0
        from PIL import Image
        import io

        buffer = io.BytesIO()
        Image.new("RGB", (64, 64)).save(buffer, format="PNG")
        with self.assertRaises(MediaValidationError) as ctx:
            validate_image_bytes("big.png", buffer.getvalue())
        self.assertIn("longest side", str(ctx.exception))

    def test_a_decompression_bomb_is_rejected(self):
        settings.MAX_IMAGE_PIXELS = 1000
        settings.MAX_IMAGE_DIMENSION_PX = 0
        from PIL import Image
        import io

        buffer = io.BytesIO()
        Image.new("RGB", (200, 200)).save(buffer, format="PNG")
        with self.assertRaises(MediaValidationError) as ctx:
            validate_image_bytes("bomb.png", buffer.getvalue())
        self.assertIn("decompression bomb", str(ctx.exception))

    def test_avif_is_not_rejected_when_the_body_cannot_be_decoded(self):
        """
        `AVIF_BYTES` carries the right brand but is not a decodable image.

        AVIF itself IS decodable now (`pillow-avif-plugin`, pinned in
        requirements.txt) — see `test_media_avif_validation.py` for real-AVIF
        coverage. This case is a malformed file, and a malformed file must
        still be accepted on its magic-byte signature: the geometry check is
        skipped, not fatal. That is deliberate — the size ceiling and the
        signature check still apply, and rejecting the house's dominant format
        because one file is corrupt would be a regression.
        """
        result = validate_image_bytes("cover.avif", AVIF_BYTES)
        self.assertEqual(result.content_type, "image/avif")
        self.assertIn(result.dimension_check, (DIMENSION_OK, DIMENSION_NOT_DECODABLE))

    def test_a_disguised_file_is_still_rejected(self):
        with self.assertRaises(MediaValidationError):
            validate_image_bytes("cover.png", b"not an image at all")


# ===========================================================================
# 7. Upload succeeded / database failed → the object is rolled back
# ===========================================================================


@unittest.skipUnless(HAS_AIOSQLITE, "aiosqlite is not installed")
class UploadCompensationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from sqlalchemy import event
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from sqlalchemy.ext.compiler import compiles

        @compiles(JSONB, "sqlite")
        def _jsonb_on_sqlite(type_, compiler, **kw):  # pragma: no cover
            return "JSON"

        self._tmp = tempfile.TemporaryDirectory(prefix="pf-compensate-")
        self.root = self._tmp.name
        main_db = os.path.join(self.root, "main.sqlite")
        schema_db = os.path.join(self.root, "pratikshya.sqlite")

        self._saved_root = settings.LOCAL_MEDIA_ROOT
        settings.LOCAL_MEDIA_ROOT = os.path.join(self.root, "media")
        reset_storage_provider()
        self.provider = get_storage_provider()

        self.engine = create_async_engine(f"sqlite+aiosqlite:///{main_db}")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _attach(dbapi_conn, _record):  # pragma: no cover
            cursor = dbapi_conn.cursor()
            cursor.execute(f"ATTACH DATABASE '{schema_db}' AS pratikshya")
            cursor.close()

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)

        from app.api.v1.media import router as media_router
        from app.core.error_handlers import register_error_handlers

        app = FastAPI()
        register_error_handlers(app)
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

        app.dependency_overrides[get_db] = _override_get_db
        self.app = app
        # raise_server_exceptions=False: the compensation test asserts on the
        # 500 response body and on the store afterwards, so the simulated
        # failure must not propagate out of TestClient.
        self.client = TestClient(app, raise_server_exceptions=False)

    async def asyncTearDown(self):
        reset_storage_provider()
        settings.LOCAL_MEDIA_ROOT = self._saved_root
        await self.engine.dispose()
        self._tmp.cleanup()

    async def _seed(self):
        from sqlalchemy import select

        async with self.Session() as session:
            role = RoleModel(name="COMP_ADMIN", description="test", is_system=False)
            session.add(role)
            permission = PermissionModel(
                code="media.upload", name="media.upload", category="media", description="x"
            )
            session.add(permission)
            await session.flush()
            session.add(RolePermissionModel(role_id=role.id, permission_id=permission.id))
            admin = UserModel(
                email="pf-comp-admin@pratikshyafashon.test",
                full_name="Comp Admin",
                hashed_password="x",
                user_type="admin",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            session.add(admin)
            await session.flush()
            session.add(UserRoleModel(user_id=admin.id, role_id=role.id))
            session.add(
                ProductModel(
                    id=PRODUCT_ID,
                    product_id=PRODUCT_ID,
                    name="Compensation Saree",
                    slug="compensation-saree",
                    sku=PRODUCT_ID,
                    price=1000,
                    status="DRAFT",
                    published=False,
                )
            )
            await session.commit()
            admin_id = admin.id

        async def _dep():
            async with self.Session() as session:
                return (
                    await session.execute(select(UserModel).where(UserModel.id == admin_id))
                ).scalars().first()

        self.app.dependency_overrides[get_current_user] = _dep
        self.app.dependency_overrides[get_optional_user] = _dep

    async def test_a_failed_registration_rolls_the_object_back(self):
        """
        Storage is written before the database rows. If the DB half fails, the
        object must not be left behind: it would be invisible to the product,
        billed for, and only findable by a manual bucket sweep.
        """
        await self._seed()

        with patch(
            "app.api.v1.media._commit_and_invalidate_product_media",
            new=AsyncMock(side_effect=RuntimeError("simulated database failure")),
        ):
            response = self.client.post(
                f"/api/v1/media/products/{PRODUCT_ID}/objects",
                files={"file": ("cover.png", PNG_BYTES, "image/png")},
            )
            self.assertEqual(response.status_code, 500, response.text)

        self.assertFalse(
            self.provider.object_exists(KEY),
            "a failed registration must not leave an unmanaged object behind",
        )

    async def test_a_successful_upload_keeps_its_object(self):
        await self._seed()
        response = self.client.post(
            f"/api/v1/media/products/{PRODUCT_ID}/objects",
            files={"file": ("cover.png", PNG_BYTES, "image/png")},
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertTrue(self.provider.object_exists(KEY))

    async def test_an_unknown_product_never_writes_an_object(self):
        await self._seed()
        response = self.client.post(
            "/api/v1/media/products/PF-W-NOPE-9999/objects",
            files={"file": ("cover.png", PNG_BYTES, "image/png")},
        )
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(list(self.provider.list_objects()), [])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
