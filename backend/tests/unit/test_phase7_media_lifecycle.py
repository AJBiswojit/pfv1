"""
Phase 7 — REAL product + media lifecycle, verified end to end.

The Phase 6 suites proved the OBJECT half (storage, signatures, resolver,
RBAC on the object routes). This suite proves the Phase 7 DURABLE RECORD half
and the complete NEW-PRODUCT lifecycle against the real routers, the real
ORM models and a real database session:

    create product (draft)
      → upload image bytes (AVIF + WebP, signature-validated)
      → register objects → MediaAsset rows
      → assign them to the product → ProductMedia rows (primary + gallery)
      → read model: media-set, admin & storefront projections resolve the
        registered records to canonical /media/objects/... URLs
      → submit → approve → publish
      → storefront serves the canonical URL and the URL serves the real bytes

  · MediaAsset registration — verified metadata persisted from the object.
  · ProductMedia assignment — primary/cover uniqueness is enforced in the
    service (assigning a new primary demotes the incumbent).
  · Authorization — the real users/roles/permissions graph: customers and
    employees cannot reach the admin media surface; an admin without
    media.upload cannot register; an employee can edit only the products
    assigned to them and cannot edit another employee's product.
  · Media resolution — product → media reference → MediaAsset → object_key
    → /api/v1/media/objects/... → correct Content-Type and exact bytes.
  · Local storage — keys are derived from real product identity; provider
    independent (the same code path selects S3 by configuration later).
  · Invalid media — wrong bytes rejected (422), unknown object rejected on
    registration (404), traversal keys rejected (422).
  · AVIF and WebP uploads round-trip as their true content types.

WHY SQLITE
----------
As in `test_phase6_media_db.py`, this suite keeps the API/ORM behaviour checks
on SQLite via the two test-only shims (JSONB → JSON compile,
`ATTACH DATABASE … AS pratikshya`) so it runs anywhere, with no server.

The PostgreSQL half is covered separately and runs whenever a local server is
configured:
  · `backend/tests/unit/test_media_schema_integrity.py` — the real PK/FK/unique
    constraints, enforced by PostgreSQL, plus model↔schema parity.
  · `backend/scripts/media_lifecycle_pg_e2e.py` — the disposable-database
    `alembic upgrade head` + full lifecycle E2E.
Both are provided by `backend/app/testing/local_postgres.py`, which refuses to
run against anything but the local `pratikshya_local` database.
"""

import asyncio
import importlib
import os
import tempfile
import unittest

from fastapi_cache import FastAPICache
from fastapi_cache.backends import Backend
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB

HAS_AIOSQLITE = importlib.util.find_spec("aiosqlite") is not None


# ---------------------------------------------------------------------------
# Test-only dialect shim (production code is not modified)
# ---------------------------------------------------------------------------

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


importlib.import_module("app.models")  # noqa: E402  registers every mapped class
from app.config import settings  # noqa: E402
from app.dependencies import get_current_user, get_db, get_optional_user  # noqa: E402
from app.models.auth.user import UserModel  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models.catalog.category import CategoryModel, SubcategoryModel  # noqa: E402
from app.models.catalog.product import ProductModel  # noqa: E402
from app.models.employee.employee import EmployeeProfileModel  # noqa: E402
from app.models.media.media_asset import MediaAssetModel  # noqa: E402
from app.models.media.product_media import ProductMediaModel  # noqa: E402
from app.models.rbac.permission import PermissionModel  # noqa: E402
from app.models.rbac.role import RoleModel  # noqa: E402
from app.models.rbac.role_permission import RolePermissionModel  # noqa: E402
from app.models.rbac.user_role import UserRoleModel  # noqa: E402
from app.storage import get_storage_provider, reset_storage_provider  # noqa: E402
from app.services.media.product_media_resolver import clear_resolution_cache  # noqa: E402

# ---------------------------------------------------------------------------
# Real test payloads — signature-correct minimal image files
# ---------------------------------------------------------------------------

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
WEBP_BYTES = b"RIFF" + (26).to_bytes(4, "little") + b"WEBPVP8 " + (14).to_bytes(4, "little") + b"\x2f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
AVIF_BYTES = b"\x00\x00\x00\x1c" + b"ftypavif" + b"\x00\x00\x00\x00avifmif1" + b"\x00\x00\x00\x00"

SEED_PRODUCT_ID = "PF-W-SAR-SIL-0001"
LEGACY_IMAGE = f"/images/products/{SEED_PRODUCT_ID}/primary.avif"
NEW_PRODUCT_ID = "PF-W-TST-NEW-0001"
# Authoritative taxonomy rows the product writes are validated against.
SEED_CATEGORY_ID = "cat-p7-sarees"
SEED_SUBCATEGORY_ID = "cat-p7-sarees-silk"


@unittest.skipUnless(
    HAS_AIOSQLITE, "aiosqlite is not installed (pip install -r requirements.txt)"
)
class Phase7LifecycleCase(unittest.IsolatedAsyncioTestCase):
    """One real database + one real object store per test."""

    async def asyncSetUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="pf7-db-")
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

        reset_storage_provider()
        clear_resolution_cache()

    async def asyncTearDown(self):
        clear_resolution_cache()
        reset_storage_provider()
        settings.LOCAL_MEDIA_ROOT = self._saved_root
        FastAPICache.reset()
        await self.engine.dispose()
        self._tmp.cleanup()

    # -- fixtures ------------------------------------------------------------

    async def _seed(self):
        async with self.Session() as session:
            # Fine-grained roles NOT in BUILT_IN_ROLES, so the built-in
            # vocabulary fallback cannot quietly grant anything.
            catalogue_role = RoleModel(name="P7_CATALOGUE_ADMIN", description="test", is_system=False)
            view_role = RoleModel(name="P7_VIEW_ONLY", description="test", is_system=False)
            staff_role = RoleModel(name="P7_STYLISTX", description="test", is_system=False)
            session.add_all([catalogue_role, view_role, staff_role])

            permission_codes = (
                "products.view", "products.manage",
                "media.view", "media.upload", "media.delete",
            )
            permissions = {}
            for code in permission_codes:
                permission = PermissionModel(code=code, name=code, category="media", description=code)
                session.add(permission)
                permissions[code] = permission
            await session.flush()

            def grant(role, *codes):
                for code in codes:
                    session.add(
                        RolePermissionModel(role_id=role.id, permission_id=permissions[code].id)
                    )

            grant(catalogue_role, "products.view", "products.manage", "media.view", "media.upload", "media.delete")
            grant(view_role, "media.view")
            grant(staff_role, "products.manage")

            admin = UserModel(
                email="p7-admin@pratikshyafashon.test",
                full_name="Phase7 Admin",
                hashed_password="x",
                user_type="admin",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            viewer = UserModel(
                email="p7-viewer@pratikshyafashon.test",
                full_name="Phase7 Viewer",
                hashed_password="x",
                user_type="admin",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            customer = UserModel(
                email="p7-shopper@pratikshyafashon.test",
                full_name="Shopper",
                hashed_password="x",
                user_type="customer",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            employee1 = UserModel(
                email="p7-stylist-one@pratikshyafashon.test",
                full_name="Stylist One",
                hashed_password="x",
                user_type="employee",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            employee2 = UserModel(
                email="p7-stylist-two@pratikshyafashon.test",
                full_name="Stylist Two",
                hashed_password="x",
                user_type="employee",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
            )
            session.add_all([admin, viewer, customer, employee1, employee2])
            await session.flush()

            session.add(UserRoleModel(user_id=admin.id, role_id=catalogue_role.id))
            session.add(UserRoleModel(user_id=viewer.id, role_id=view_role.id))
            session.add(UserRoleModel(user_id=employee1.id, role_id=staff_role.id))
            session.add(UserRoleModel(user_id=employee2.id, role_id=staff_role.id))

            session.add_all([
                EmployeeProfileModel(user_id=employee1.id, employee_code="P7-EMP-001", designation="Stylist"),
                EmployeeProfileModel(user_id=employee2.id, employee_code="P7-EMP-002", designation="Stylist"),
            ])

            # The authoritative taxonomy the products below live under.
            # Phase 3 validates every product write against these rows, so a
            # create/patch that names `sarees` / `silk` must find them here.
            session.add(
                CategoryModel(
                    id=SEED_CATEGORY_ID,
                    name="Sarees",
                    slug="sarees",
                    status="ACTIVE",
                )
            )
            session.add(
                SubcategoryModel(
                    id=SEED_SUBCATEGORY_ID,
                    category_id=SEED_CATEGORY_ID,
                    name="Silk",
                    slug="silk",
                    status="ACTIVE",
                )
            )

            # A legacy product (legacy authored image only, no registered
            # records) and a product assigned to employee 1.
            session.add(
                ProductModel(
                    id=SEED_PRODUCT_ID,
                    product_id=SEED_PRODUCT_ID,
                    name="Banarasi Silk Saree",
                    slug="banarasi-silk-saree",
                    sku=SEED_PRODUCT_ID,
                    category="sarees",
                    subcategory="silk",
                    price=5000,
                    original_price=6000,
                    stock=3,
                    availability="in-stock",
                    status="PUBLISHED",
                    published=True,
                    image=LEGACY_IMAGE,
                    additional_images=[LEGACY_IMAGE],
                    assigned_employee_id="P7-EMP-001",
                )
            )
            session.add(
                ProductModel(
                    id="PF-W-TST-OTH-0002",
                    product_id="PF-W-TST-OTH-0002",
                    name="Other Employee Product",
                    slug="p7-other-employee-product",
                    sku="PF-W-TST-OTH-0002",
                    category="sarees",
                    price=2500,
                    description="A product that belongs to another employee.",
                    status="DRAFT",
                    published=False,
                    assigned_employee_id="P7-EMP-002",
                )
            )
            await session.commit()

            self.admin_id = admin.id
            self.viewer_id = viewer.id
            self.customer_id = customer.id
            self.employee1_id = employee1.id
            self.employee2_id = employee2.id

    def _build_app(self):
        from fastapi import FastAPI

        from app.api.v1.media import router as media_router
        from app.api.v1.products import router as products_router
        from app.core.error_handlers import register_error_handlers

        app = FastAPI()
        register_error_handlers(app)
        FastAPICache.init(backend=PassThroughCacheBackend(), prefix="pf7-test")
        app.include_router(media_router, prefix="/api/v1")
        app.include_router(products_router, prefix="/api/v1")

        Session = self.Session

        async def _override_get_db():
            # Mirrors production `get_db` exactly: commit on success so
            # writes from earlier requests are visible to later ones.
            async with Session() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

        # Only the session and the authenticated identity are injected. Every
        # route (media upload/register, products, storefront, RBAC joins)
        # executes for real against the seeded rows.
        app.dependency_overrides[get_db] = _override_get_db
        self._set_current_user(app, self.admin_id)
        return app

    def _set_current_user(self, app, user_id: str):
        Session = self.Session

        async def _dep():
            async with Session() as session:
                return (
                    await session.execute(select(UserModel).where(UserModel.id == user_id))
                ).scalars().first()

        # Both auth dependencies: routes that REQUIRE a session and routes
        # that optionally read one (the public media-set staff gate) must see
        # the same simulated actor.
        app.dependency_overrides[get_current_user] = _dep
        app.dependency_overrides[get_optional_user] = _dep

    def as_anonymous(self):
        """No session at all — both auth dependencies fall back to real

        behaviour (no Authorization header ⇒ no current user)."""
        self.app.dependency_overrides.pop(get_current_user, None)
        self.app.dependency_overrides.pop(get_optional_user, None)

    # -- actors ---------------------------------------------------------------

    def as_admin(self):
        self._set_current_user(self.app, self.admin_id)

    def as_view_only_admin(self):
        self._set_current_user(self.app, self.viewer_id)

    def as_customer(self):
        self._set_current_user(self.app, self.customer_id)

    def as_employee1(self):
        self._set_current_user(self.app, self.employee1_id)

    def as_employee2(self):
        self._set_current_user(self.app, self.employee2_id)

    # -- db probes (test-side assertions, not the code under test) ------------

    def _run(self, coroutine):
        return asyncio.get_event_loop().run_until_complete(coroutine)

    def asset_rows(self):
        async def _read():
            async with self.Session() as session:
                return (await session.execute(select(MediaAssetModel))).scalars().all()

        return self._run(_read())

    def mapping_rows(self, product_id=None):
        async def _read():
            async with self.Session() as session:
                stmt = select(ProductMediaModel)
                if product_id:
                    stmt = stmt.where(ProductMediaModel.product_id == product_id)
                return (await session.execute(stmt)).scalars().all()

        return self._run(_read())

    def product_row(self, product_id):
        async def _read():
            async with self.Session() as session:
                return (
                    await session.execute(
                        select(ProductModel).where(ProductModel.id == product_id)
                    )
                ).scalars().first()

        return self._run(_read())

    # -- lifecycle helpers ----------------------------------------------------

    def upload(self, product_id, name, data, content_type):
        return self.client.post(
            f"/api/v1/media/products/{product_id}/objects",
            files={"file": (name, data, content_type)},
        )

    def register(self, object_key, product_id=None, role="gallery", sort_order=0, is_primary=False):
        form = {"object_key": object_key, "role": role, "sort_order": str(sort_order)}
        if product_id:
            form["product_id"] = product_id
        if is_primary:
            form["is_primary"] = "true"
        return self.client.post("/api/v1/media/register", data=form)

    def create_draft(self, product_id=NEW_PRODUCT_ID, **overrides):
        payload = {
            "id": product_id,
            "name": "Phase Seven Test Saree",
            "sku": product_id,
            "category": "sarees",
            "subcategory": "silk",
            "price": 7500,
            "description": "A real product created through the admin API for Phase 7.",
            "brand": "Pratikshya Fashon",
            "gender": "Women",
        }
        payload.update(overrides)
        return self.client.post("/api/v1/admin/products/draft", json=payload)


# ===========================================================================
# MediaAsset registration + local storage
# ===========================================================================

class MediaAssetRegistrationTests(Phase7LifecycleCase):
    def test_upload_then_register_creates_a_verified_asset_row(self):
        self.as_admin()
        upload = self.upload(SEED_PRODUCT_ID, "cover.png", PNG_BYTES, "image/png")
        self.assertEqual(upload.status_code, 201, upload.text)
        key = upload.json()["object"]["key"]
        self.assertEqual(key, f"products/{SEED_PRODUCT_ID}/cover.png")

        response = self.register(key)
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["media"]["objectKey"], key)
        self.assertEqual(
            body["media"]["url"], f"/api/v1/media/objects/products/{SEED_PRODUCT_ID}/cover.png"
        )
        self.assertFalse(body["assigned"])

        rows = self.asset_rows()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row.object_key, key)
        self.assertEqual(row.mime_type, "image/png")
        self.assertEqual(row.file_size, len(PNG_BYTES))
        self.assertEqual(row.storage_provider, "local")
        self.assertEqual(row.status, "uploaded")
        self.assertEqual(len(row.checksum_sha256), 64)
        # The object really is in the local store and served from it.
        self.assertTrue(self.provider.object_exists(key))
        served = self.client.get(f"/api/v1/media/objects/{key}")
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served.content, PNG_BYTES)
        self.assertEqual(served.headers["content-type"], "image/png")

    def test_registration_is_idempotent_by_object_key(self):
        self.as_admin()
        key = self.upload(SEED_PRODUCT_ID, "cover.png", PNG_BYTES, "image/png").json()["object"]["key"]
        first = self.register(key)
        second = self.register(key)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json()["media"]["id"], second.json()["media"]["id"])
        self.assertEqual(len(self.asset_rows()), 1)

    def test_registering_an_object_that_does_not_exist_is_404(self):
        self.as_admin()
        response = self.register(f"products/{SEED_PRODUCT_ID}/never-uploaded.png")
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(len(self.asset_rows()), 0)

    def test_registering_a_traversal_key_is_422_and_creates_nothing(self):
        self.as_admin()
        response = self.client.post(
            "/api/v1/media/register",
            data={"object_key": "../../etc/passwd"},
        )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(len(self.asset_rows()), 0)

    def test_upload_rejects_bytes_that_are_not_an_image(self):
        self.as_admin()
        response = self.upload(SEED_PRODUCT_ID, "notes.png", b"PK\x03\x04definitely zip", "image/png")
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.asset_rows(), [])

    def test_avif_upload_round_trips_as_image_avif(self):
        self.as_admin()
        response = self.upload(SEED_PRODUCT_ID, "look.avif", AVIF_BYTES, "image/avif")
        self.assertEqual(response.status_code, 201, response.text)
        key = response.json()["object"]["key"]
        self.assertEqual(response.json()["object"]["contentType"], "image/avif")
        served = self.client.get(f"/api/v1/media/objects/{key}")
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served.headers["content-type"], "image/avif")
        self.assertEqual(served.content, AVIF_BYTES)

    def test_webp_upload_round_trips_as_image_webp(self):
        self.as_admin()
        response = self.upload(SEED_PRODUCT_ID, "look.webp", WEBP_BYTES, "image/webp")
        self.assertEqual(response.status_code, 201, response.text)
        key = response.json()["object"]["key"]
        self.assertEqual(response.json()["object"]["contentType"], "image/webp")
        served = self.client.get(f"/api/v1/media/objects/{key}")
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served.headers["content-type"], "image/webp")
        self.assertEqual(served.content, WEBP_BYTES)


# ===========================================================================
# ProductMedia assignment + primary/cover behaviour
# ===========================================================================

class ProductMediaAssignmentTests(Phase7LifecycleCase):
    def _registered(self, name="one.png", data=PNG_BYTES, ctype="image/png"):
        key = self.upload(SEED_PRODUCT_ID, name, data, ctype).json()["object"]["key"]
        return key, self.register(key, SEED_PRODUCT_ID)

    def test_register_with_product_creates_the_association(self):
        self.as_admin()
        key, response = self._registered()
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertTrue(body["assigned"])
        self.assertEqual(body["assignment"]["productId"], SEED_PRODUCT_ID)
        self.assertEqual(body["assignment"]["role"], "gallery")

        mappings = self.mapping_rows(SEED_PRODUCT_ID)
        self.assertEqual(len(mappings), 1)
        self.assertEqual(mappings[0].role, "gallery")
        self.assertFalse(mappings[0].is_primary)

    def test_media_set_reports_registered_items_primary_first(self):
        self.as_admin()
        key1, _ = self._registered("one.png")
        # second object: same bytes, different key — a distinct object.
        self.provider.put_object(f"products/{SEED_PRODUCT_ID}/two.png", PNG_BYTES, "image/png")
        key2 = f"products/{SEED_PRODUCT_ID}/two.png"
        response2 = self.register(key2, SEED_PRODUCT_ID, sort_order=1, is_primary=True)
        self.assertEqual(response2.status_code, 201, response2.text)

        response = self.client.get(f"/api/v1/media/products/{SEED_PRODUCT_ID}/media-set")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["mediaRecordsAvailable"])
        self.assertEqual(len(body["mediaItems"]), 2)
        self.assertEqual(body["mediaItems"][0]["objectKey"], key2, "primary must lead")
        self.assertTrue(body["mediaItems"][0]["isPrimary"])
        self.assertEqual(
            body["primaryMediaUrl"],
            f"/api/v1/media/objects/{key2}",
        )
        # Legacy half keeps resolving for compatibility.
        self.assertEqual(body["mediaIds"], body.get("mediaIds", []))

    def test_assigning_a_new_primary_demotes_the_incumbent(self):
        self.as_admin()
        key1, _ = self._registered("one.png")
        self.assertEqual(
            self.register(key1, SEED_PRODUCT_ID, role="COVER", is_primary=True).status_code, 201
        )
        self.provider.put_object(f"products/{SEED_PRODUCT_ID}/two.png", PNG_BYTES, "image/png")
        self.register(f"products/{SEED_PRODUCT_ID}/two.png", SEED_PRODUCT_ID, is_primary=True)

        mappings = sorted(self.mapping_rows(SEED_PRODUCT_ID), key=lambda m: m.role)
        primaries = [m for m in self.mapping_rows(SEED_PRODUCT_ID) if m.is_primary]
        self.assertEqual(len(primaries), 1, "a product must never hold two primaries")
        self.assertEqual(primaries[0].media_id, self.asset_rows()[-1].id)
        self.assertEqual(len(mappings), 2)

    def test_reregistering_updates_role_and_sort_order_in_place(self):
        self.as_admin()
        key, _ = self._registered()
        updated = self.register(key, SEED_PRODUCT_ID, role="detail", sort_order=3, is_primary=True)
        self.assertEqual(updated.status_code, 201)
        body = updated.json()
        self.assertEqual(body["assignment"]["role"], "detail")
        self.assertEqual(body["assignment"]["sortOrder"], 3)
        self.assertTrue(body["assignment"]["isPrimary"])
        # No duplicates.
        self.assertEqual(len(self.mapping_rows(SEED_PRODUCT_ID)), 1)
        self.assertEqual(len(self.asset_rows()), 1)

    def test_registered_assets_are_listed_for_the_library(self):
        self.as_admin()
        self._registered()
        response = self.client.get("/api/v1/media/assets")
        self.assertEqual(response.status_code, 200)
        items = response.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["objectKey"], f"products/{SEED_PRODUCT_ID}/one.png")
        self.assertTrue(items[0]["url"].startswith("/api/v1/media/objects/"))


# ===========================================================================
# Authorization — the real RBAC graph decides
# ===========================================================================

class MediaAuthorizationTests(Phase7LifecycleCase):
    def _key(self):
        return f"products/{SEED_PRODUCT_ID}/unauthorized.png"

    def test_customer_cannot_upload_or_register(self):
        self.as_customer()
        upload = self.upload(SEED_PRODUCT_ID, "unauthorized.png", PNG_BYTES, "image/png")
        self.assertEqual(upload.status_code, 403, upload.text)
        registered = self.register(self._key())
        self.assertEqual(registered.status_code, 403, registered.text)
        self.assertEqual(self.asset_rows(), [])

    def test_admin_without_media_upload_permission_cannot_register(self):
        # The viewer can read but holds no media.upload grant.
        self.as_admin()
        key = self.upload(SEED_PRODUCT_ID, "authorized.png", PNG_BYTES, "image/png").json()["object"]["key"]
        self.as_view_only_admin()
        denied = self.register(key, SEED_PRODUCT_ID)
        self.assertEqual(denied.status_code, 403, denied.text)
        denied_upload = self.upload(SEED_PRODUCT_ID, "denied.png", PNG_BYTES, "image/png")
        self.assertEqual(denied_upload.status_code, 403, denied_upload.text)
        # The privileged admin's upload auto-registered exactly one asset
        # (the /products/.../objects route uploads + registers atomically).
        # The viewer's denied attempts must have added NOTHING — neither to
        # the asset table nor to the product-media mapping table.
        remaining_keys = [row.object_key for row in self.asset_rows()]
        self.assertEqual(remaining_keys, [key])
        self.assertEqual(len(self.mapping_rows(SEED_PRODUCT_ID)), 1)
        # Reads moved to the least-privilege media.view grant (admin
        # consolidation): this viewer HAS media.view, so the register is
        # listable — but writes stay denied.
        self.assertEqual(self.client.get("/api/v1/media/assets").status_code, 200)

    def test_employee_token_cannot_reach_the_admin_media_surface(self):
        self.as_employee1()
        upload = self.upload(SEED_PRODUCT_ID, "staff.png", PNG_BYTES, "image/png")
        # get_current_admin refuses non-admin identities regardless of roles.
        self.assertEqual(upload.status_code, 403, upload.text)
        self.assertEqual(self.register(f"products/{SEED_PRODUCT_ID}/staff.png").status_code, 403)

    def test_public_media_reads_stay_open_and_registered_reads_are_public(self):
        # Registered read model is public exactly like the object bytes.
        self.as_admin()
        self._upload_and_assign()
        self.as_customer()
        response = self.client.get(f"/api/v1/media/products/{SEED_PRODUCT_ID}/media-set")
        self.assertEqual(response.status_code, 200)

    def _upload_and_assign(self):
        key = self.upload(SEED_PRODUCT_ID, "shared.png", PNG_BYTES, "image/png").json()["object"]["key"]
        self.register(key, SEED_PRODUCT_ID)


class EmployeeProductWorkflowTests(Phase7LifecycleCase):
    """Existing RBAC + product-assignment rules — never broadened by media."""

    def test_assigned_employee_can_patch_their_own_product(self):
        self.as_employee1()
        response = self.client.patch(
            f"/api/v1/employee/products/{SEED_PRODUCT_ID}",
            json={"name": "Updated by the assigned stylist"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            self.product_row(SEED_PRODUCT_ID).name, "Updated by the assigned stylist"
        )

    def test_unassigned_employee_cannot_modify_another_employees_product(self):
        self.as_employee1()  # assigned to SEED_PRODUCT_ID, not to the other one
        response = self.client.patch(
            "/api/v1/employee/products/PF-W-TST-OTH-0002",
            json={"name": "Must never land"},
        )
        self.assertEqual(response.status_code, 403, response.text)
        self.assertNotEqual(self.product_row("PF-W-TST-OTH-0002").name, "Must never land")

    def test_unassigned_employee_cannot_submit_anothers_product_for_review(self):
        self.as_employee1()
        response = self.client.post("/api/v1/products/PF-W-TST-OTH-0002/submit-review")
        self.assertEqual(response.status_code, 403, response.text)

    def test_customer_cannot_touch_the_employee_product_surface(self):
        self.as_customer()
        response = self.client.patch(
            f"/api/v1/employee/products/{SEED_PRODUCT_ID}", json={"name": "nope"}
        )
        self.assertEqual(response.status_code, 403, response.text)


# ===========================================================================
# Registered-media read model through the product projections
# ===========================================================================

class RegisteredMediaReadModelTests(Phase7LifecycleCase):
    def _publish_seed_with_registered_media(self):
        """Register two assets on the seed product: primary + gallery."""
        self.as_admin()
        cover_key = self.upload(SEED_PRODUCT_ID, "cover.avif", AVIF_BYTES, "image/avif").json()["object"]["key"]
        angle_key = self.upload(SEED_PRODUCT_ID, "angle.webp", WEBP_BYTES, "image/webp").json()["object"]["key"]
        self.register(cover_key, SEED_PRODUCT_ID, role="COVER", sort_order=0, is_primary=True)
        self.register(angle_key, SEED_PRODUCT_ID, role="gallery", sort_order=1)
        return cover_key, angle_key

    def test_admin_projection_prefers_registered_records(self):
        cover_key, angle_key = self._publish_seed_with_registered_media()
        response = self.client.get(f"/api/v1/admin/products/{SEED_PRODUCT_ID}")
        self.assertEqual(response.status_code, 200, response.text)
        product = response.json()["product"]
        # The registered COVER association is the read model's cover, even
        # though the product row still carries the legacy authored image.
        self.assertEqual(product["image"], f"/api/v1/media/objects/{cover_key}")
        self.assertEqual(
            product["additionalImages"],
            [f"/api/v1/media/objects/{cover_key}", f"/api/v1/media/objects/{angle_key}"],
        )
        cover_asset = [row for row in self.asset_rows() if row.object_key == cover_key][0]
        self.assertEqual(product["primaryMediaId"], cover_asset.id)

    def test_storefront_projection_resolves_registered_records(self):
        cover_key, angle_key = self._publish_seed_with_registered_media()
        response = self.client.get(f"/api/v1/products/{SEED_PRODUCT_ID}")
        self.assertEqual(response.status_code, 200, response.text)
        product = response.json()["product"]
        self.assertEqual(product["image"], f"/api/v1/media/objects/{cover_key}")
        self.assertIn(f"/api/v1/media/objects/{angle_key}", product["additionalImages"])

    def test_products_without_registered_records_are_untouched(self):
        response = self.client.get(f"/api/v1/products/{SEED_PRODUCT_ID}")
        self.assertEqual(response.status_code, 200, response.text)
        product = response.json()["product"]
        # Legacy dual-read: the object was never put in this test's store, so
        # the legacy reference itself survives unresolved (compatibility).
        self.assertEqual(product["image"], LEGACY_IMAGE)


# ===========================================================================
# THE acceptance test — full NEW product lifecycle through the real API
# ===========================================================================

class FullNewProductLifecycleTests(Phase7LifecycleCase):
    def test_create_upload_register_assign_save_publish_storefront_serves_bytes(self):
        self.as_admin()

        # ── 1. Admin creates a NEW product through the real API ────────────
        created = self.create_draft()
        self.assertEqual(created.status_code, 201, created.text)
        product = created.json()["product"]
        self.assertEqual(product["status"], "DRAFT")

        # ── 2. Upload NEW image bytes (AVIF + WebP) through the storage API ─
        cover_upload = self.upload(NEW_PRODUCT_ID, "atelier-cover.avif", AVIF_BYTES, "image/avif")
        self.assertEqual(cover_upload.status_code, 201, cover_upload.text)
        cover_key = cover_upload.json()["object"]["key"]
        self.assertEqual(cover_key, f"products/{NEW_PRODUCT_ID}/atelier-cover.avif")

        angle_upload = self.upload(NEW_PRODUCT_ID, "atelier-angle.webp", WEBP_BYTES, "image/webp")
        self.assertEqual(angle_upload.status_code, 201, angle_upload.text)
        angle_key = angle_upload.json()["object"]["key"]

        # ── 3. Register both objects as durable media assets ───────────────
        cover_reg = self.register(cover_key, NEW_PRODUCT_ID, role="COVER", sort_order=0, is_primary=True)
        self.assertEqual(cover_reg.status_code, 201, cover_reg.text)
        angle_reg = self.register(angle_key, NEW_PRODUCT_ID, role="gallery", sort_order=1)
        self.assertEqual(angle_reg.status_code, 201, angle_reg.text)
        cover_media_id = cover_reg.json()["media"]["id"]
        angle_media_id = angle_reg.json()["media"]["id"]

        # Real rows, not fabricated ids.
        self.assertEqual({row.id for row in self.asset_rows()}, {cover_media_id, angle_media_id})
        self.assertEqual(len(self.mapping_rows(NEW_PRODUCT_ID)), 2)

        # ── 4. Persist the product with the media references ───────────────
        cover_url = f"/api/v1/media/objects/{cover_key}"
        angle_url = f"/api/v1/media/objects/{angle_key}"
        patched = self.client.patch(
            f"/api/v1/admin/products/{NEW_PRODUCT_ID}",
            json={
                "mediaIds": [cover_media_id, angle_media_id],
                "primaryMediaId": cover_media_id,
                "galleryMediaIds": [angle_media_id],
                "image": cover_url,
                "additionalImages": [cover_url, angle_url],
            },
        )
        self.assertEqual(patched.status_code, 200, patched.text)

        # ── 5. Refetch from the server — the read model must agree ─────────
        refetched = self.client.get(f"/api/v1/admin/products/{NEW_PRODUCT_ID}")
        self.assertEqual(refetched.status_code, 200)
        product = refetched.json()["product"]
        self.assertEqual(product["image"], cover_url)
        self.assertEqual(product["additionalImages"], [cover_url, angle_url])
        self.assertEqual(product["primaryMediaId"], cover_media_id)
        self.assertEqual(product["mediaIds"], [cover_media_id, angle_media_id])

        media_set = self.client.get(f"/api/v1/media/products/{NEW_PRODUCT_ID}/media-set")
        self.assertTrue(media_set.json()["mediaRecordsAvailable"])
        self.assertEqual(media_set.json()["primaryMediaUrl"], cover_url)
        self.assertEqual(
            [item["objectKey"] for item in media_set.json()["mediaItems"]],
            [cover_key, angle_key],
        )

        # ── 6. Publish through the real gated workflow ─────────────────────
        submitted = self.client.post(f"/api/v1/products/{NEW_PRODUCT_ID}/submit-review")
        self.assertEqual(submitted.status_code, 200, submitted.text)
        approved = self.client.post(f"/api/v1/admin/products/{NEW_PRODUCT_ID}/approve")
        self.assertEqual(approved.status_code, 200, approved.text)
        published = self.client.post(f"/api/v1/admin/products/{NEW_PRODUCT_ID}/publish")
        self.assertEqual(published.status_code, 200, published.text)
        self.assertEqual(published.json()["product"]["status"], "PUBLISHED")
        self.assertTrue(published.json()["product"]["published"])

        # ── 7. Storefront serves the canonical media URL ───────────────────
        storefront = self.client.get(f"/api/v1/products/{NEW_PRODUCT_ID}")
        self.assertEqual(storefront.status_code, 200, storefront.text)
        detail = storefront.json()["product"]
        self.assertEqual(detail["image"], cover_url)
        self.assertEqual(detail["additionalImages"], [cover_url, angle_url])

        # ── 8. The canonical URL returns the real image over HTTP ──────────
        served_cover = self.client.get(cover_url)
        self.assertEqual(served_cover.status_code, 200)
        self.assertEqual(served_cover.headers["content-type"], "image/avif")
        self.assertEqual(served_cover.content, AVIF_BYTES)

        served_angle = self.client.get(angle_url)
        self.assertEqual(served_angle.status_code, 200)
        self.assertEqual(served_angle.headers["content-type"], "image/webp")
        self.assertEqual(served_angle.content, WEBP_BYTES)

    def test_registered_media_alone_satisfies_the_publish_gate_and_read_model(self):
        """No legacy `image` column at all: ProductMedia rows carry the cover."""
        self.as_admin()
        self.assertEqual(self.create_draft().status_code, 201)
        cover_upload = self.upload(NEW_PRODUCT_ID, "only-cover.avif", AVIF_BYTES, "image/avif")
        cover_key = cover_upload.json()["object"]["key"]
        registration = self.register(cover_key, NEW_PRODUCT_ID, role="COVER", is_primary=True)
        cover_media_id = registration.json()["media"]["id"]

        patched = self.client.patch(
            f"/api/v1/admin/products/{NEW_PRODUCT_ID}",
            json={"mediaIds": [cover_media_id], "primaryMediaId": cover_media_id},
        )
        self.assertEqual(patched.status_code, 200, patched.text)

        issues = self.client.get(f"/api/v1/admin/products/{NEW_PRODUCT_ID}/publish-issues")
        self.assertEqual(issues.status_code, 200)
        self.assertNotIn(
            "At least one cover image is required before publishing.",
            issues.json()["issues"],
        )

        self.client.post(f"/api/v1/products/{NEW_PRODUCT_ID}/submit-review")
        self.client.post(f"/api/v1/admin/products/{NEW_PRODUCT_ID}/approve")
        published = self.client.post(f"/api/v1/admin/products/{NEW_PRODUCT_ID}/publish")
        self.assertEqual(published.status_code, 200, published.text)

        storefront = self.client.get(f"/api/v1/products/{NEW_PRODUCT_ID}")
        self.assertEqual(storefront.status_code, 200, storefront.text)
        cover_url = f"/api/v1/media/objects/{cover_key}"
        # The only route this URL could have taken is
        # product → ProductMedia → MediaAsset → object_key → canonical URL.
        self.assertEqual(storefront.json()["product"]["image"], cover_url)
        self.assertEqual(self.client.get(cover_url).content, AVIF_BYTES)


# ═══════════════════════════════════════════════════════════════════════════
# BATCH 1 — homepage RBAC (Track A), placement registration (Track B)
# and legacy-column image registration (Track E)
#
# Same harness philosophy as the rest of this module: the REAL routers,
# guards, services and object store on a disposable SQLite file + temp media
# root. The homepage, marketing and explore routers are mounted alongside
# the media/products routers so the public /home contract is exercised for
# real.
# ═══════════════════════════════════════════════════════════════════════════


@unittest.skipUnless(
    HAS_AIOSQLITE, "aiosqlite is not installed (pip install -r requirements.txt)"
)
class _HomepageBatchCase(Phase7LifecycleCase):
    """Phase 7 fixtures + homepage authority actors and routers.

    Extra actors (server-side truth, never frontend claims):
      · hp_admin        — admin carrying a bare built-in ADMIN role row with
                          NO permission rows, i.e. exactly the role-mode
                          fallback path production ADMIN accounts use.
      · hp_super        — admin with account_level SUPER_ADMIN (wildcard).
      · hp_custom       — custom-mode admin holding media.view+media.upload
                          only: proves custom accounts are NOT silently
                          elevated by the built-in ADMIN change.
      · hp_employee_*   — employees with no grant / marketing.view only /
                          marketing.view+manage (homepage stays opt-in).
    """

    async def asyncSetUp(self):
        await super().asyncSetUp()
        self._mount_batch_routers()

    async def _seed(self):
        await super()._seed()
        async with self.Session() as session:
            builtin_admin_role = RoleModel(
                name="ADMIN", description="built-in role row (fallback source)", is_system=True
            )
            session.add(builtin_admin_role)
            await session.flush()

            def _user(email, name, user_type, **extra):
                user = UserModel(
                    email=email,
                    full_name=name,
                    hashed_password="x",
                    user_type=user_type,
                    status="ACTIVE",
                    is_verified=True,
                    force_password_change=False,
                    **extra,
                )
                session.add(user)
                return user

            hp_admin = _user("p7-hp-admin@pratikshya.test", "Homepage Admin", "admin")
            hp_super = _user(
                "p7-hp-super@pratikshya.test", "Homepage Super", "admin",
                account_level="SUPER_ADMIN",
            )
            hp_custom = _user(
                "p7-hp-custom@pratikshya.test", "Custom Admin", "admin",
                permission_mode="custom",
                custom_permissions=["media.view", "media.upload"],
            )
            hp_plain = _user("p7-hp-plain@pratikshya.test", "Plain Employee", "employee")
            hp_view = _user(
                "p7-hp-view@pratikshya.test", "View Employee", "employee",
                permission_mode="custom", custom_permissions=["marketing.view"],
            )
            hp_editor = _user(
                "p7-hp-editor@pratikshya.test", "Editor Employee", "employee",
                permission_mode="custom",
                custom_permissions=["marketing.view", "marketing.manage"],
            )
            hp_uploader = _user(
                "p7-hp-uploader@pratikshya.test", "Uploader Employee", "employee",
                permission_mode="custom",
                custom_permissions=["media.upload"],
            )
            await session.flush()
            session.add(UserRoleModel(user_id=hp_admin.id, role_id=builtin_admin_role.id))
            await session.commit()

            self.hp_admin_id = hp_admin.id
            self.hp_super_id = hp_super.id
            self.hp_custom_id = hp_custom.id
            self.hp_plain_id = hp_plain.id
            self.hp_view_id = hp_view.id
            self.hp_editor_id = hp_editor.id
            self.hp_uploader_id = hp_uploader.id

    def _mount_batch_routers(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from app.api.v1.explore import router as explore_router
        from app.api.v1.homepage import router as homepage_router
        from app.api.v1.marketing_media import router as marketing_router
        from app.api.v1.media import employee_router as employee_media_router
        from app.api.v1.media import router as media_router
        from app.api.v1.products import router as products_router
        from app.core.error_handlers import register_error_handlers

        app = FastAPI()
        register_error_handlers(app)
        FastAPICache.init(backend=PassThroughCacheBackend(), prefix="pf7-batch1-test")
        for router in (products_router, media_router, employee_media_router, homepage_router, marketing_router, explore_router):
            app.include_router(router, prefix="/api/v1")

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
        self.client = TestClient(app)
        self.as_hp_admin()

    # -- batch actors -----------------------------------------------------------

    def as_hp_admin(self):
        self._set_current_user(self.app, self.hp_admin_id)

    def as_hp_super(self):
        self._set_current_user(self.app, self.hp_super_id)

    def as_hp_custom(self):
        self._set_current_user(self.app, self.hp_custom_id)

    def as_hp_plain_employee(self):
        self._set_current_user(self.app, self.hp_plain_id)

    def as_hp_view_employee(self):
        self._set_current_user(self.app, self.hp_view_id)

    def as_hp_editor_employee(self):
        self._set_current_user(self.app, self.hp_editor_id)

    def as_hp_uploader_employee(self):
        self._set_current_user(self.app, self.hp_uploader_id)

    # -- batch helpers -----------------------------------------------------------

    def employee_upload(self, product_id, name, data, content_type, **form):
        return self.client.post(
            f"/api/v1/employee/media/products/{product_id}/objects",
            files={"file": (name, data, content_type)},
            data=form,
        )

    def employee_register(self, object_key, product_id, **form):
        return self.client.post(
            "/api/v1/employee/media/register",
            data={"object_key": object_key, "product_id": product_id, **form},
        )

    def upload_namespace(self, name, data, content_type, namespace, **form):
        return self.client.post(
            "/api/v1/media/objects",
            files={"file": (name, data, content_type)},
            data={"namespace": namespace, **form},
        )

    def register_placement(self, object_key, **form):
        return self.client.post(
            "/api/v1/media/register-placement",
            data={"object_key": object_key, **form},
        )

    def plant_object(self, object_key, data):
        """Put bytes straight into the temp media root (the local provider's
        storage), bypassing the upload route — how pre-existing art arrives."""
        path = os.path.join(self.media_root, *object_key.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
        return object_key

    def configure_trust(self, workspace, expected_revision, active=True):
        return self.client.put(
            f"/api/v1/{workspace}/homepage/sections/trust",
            json={"expectedRevision": expected_revision, "isActive": active},
        )

    def marketing_rows(self):
        async def _read():
            from app.models.media.marketing_media import MarketingMediaModel

            async with self.Session() as session:
                return (await session.execute(select(MarketingMediaModel))).scalars().all()

        return self._run(_read())

    def _set_product_status(self, status, published=False):
        async def _go():
            async with self.Session() as session:
                product = (
                    await session.execute(select(ProductModel).where(ProductModel.id == SEED_PRODUCT_ID))
                ).scalars().first()
                product.status = status
                product.published = published
                await session.commit()

        self._run(_go())

    def _draft(self):
        self._set_product_status("DRAFT", published=False)


class HomepageRbacTests(_HomepageBatchCase):
    """Track A — ADMIN manages the homepage; employees stay opt-in."""

    def test_builtin_admin_reads_and_manages_homepage_sections(self):
        self.as_hp_admin()
        listing = self.client.get("/api/v1/admin/homepage/sections")
        self.assertEqual(listing.status_code, 200, listing.text)

        created = self.configure_trust("admin", 0)
        self.assertEqual(created.status_code, 201, created.text)

        updated = self.configure_trust("admin", 1)
        self.assertEqual(updated.status_code, 200, updated.text)

    def test_super_admin_retains_full_homepage_control(self):
        self.as_hp_super()
        self.assertEqual(self.client.get("/api/v1/admin/homepage/sections").status_code, 200)
        self.assertEqual(self.configure_trust("admin", 0).status_code, 201)

    def test_employee_without_marketing_grant_cannot_read_or_write(self):
        self.as_hp_plain_employee()
        read = self.client.get("/api/v1/employee/homepage/sections")
        self.assertEqual(read.status_code, 403, read.text)
        detail = self.client.get("/api/v1/employee/homepage/sections/trust")
        self.assertEqual(detail.status_code, 403, detail.text)
        write = self.configure_trust("employee", 0)
        self.assertEqual(write.status_code, 403, write.text)

    def test_employee_view_grant_reads_but_cannot_manage(self):
        self.as_hp_view_employee()
        self.assertEqual(self.client.get("/api/v1/employee/homepage/sections").status_code, 200)
        write = self.configure_trust("employee", 0)
        self.assertEqual(write.status_code, 403, write.text)

    def test_employee_with_view_and_manage_grant_can_write(self):
        self.as_hp_editor_employee()
        self.assertEqual(self.client.get("/api/v1/employee/homepage/sections").status_code, 200)
        self.assertEqual(self.configure_trust("employee", 0).status_code, 201)

    def test_custom_mode_admin_is_not_silently_elevated(self):
        self.as_hp_custom()
        read = self.client.get("/api/v1/admin/homepage/sections")
        self.assertEqual(read.status_code, 403, read.text)
        write = self.configure_trust("admin", 0)
        self.assertEqual(write.status_code, 403, write.text)
        # …but their explicit media grants keep working (view-only in picker).
        self.assertEqual(self.client.get("/api/v1/media/assets").status_code, 200)


class PlacementAssetRegistrationTests(_HomepageBatchCase):
    """Track B — the allowlisted hero/marketing registration path."""

    def test_admin_uploads_and_registers_a_hero_object(self):
        self.as_admin()
        uploaded = self.upload_namespace("hero-extra.png", PNG_BYTES, "image/png", "hero")
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        key = uploaded.json()["object"]["key"]

        registered = self.register_placement(key)
        self.assertEqual(registered.status_code, 201, registered.text)
        self.assertTrue(registered.json()["created"])
        self.assertEqual(registered.json()["media"]["objectKey"], key)

        asset = [row for row in self.asset_rows() if row.object_key == key]
        self.assertEqual(len(asset), 1)
        self.assertEqual(asset[0].scope, "marketing")
        self.assertEqual(asset[0].mime_type, "image/png")

    def test_a_registered_placement_asset_appears_in_the_picker_library(self):
        # RegisteredMediaPicker lists GET /media/assets — placement art must
        # surface there alongside product art (that is the picker every
        # homepage MEDIA slot and the hero editor reads).
        self.as_admin()
        self.plant_object("hero/hero-picker.avif", AVIF_BYTES)
        registered = self.register_placement("hero/hero-picker.avif")
        self.assertEqual(registered.status_code, 201, registered.text)
        listing = self.client.get("/api/v1/media/assets")
        self.assertEqual(listing.status_code, 200, listing.text)
        keys = [item["objectKey"] for item in listing.json()["items"]]
        self.assertIn("hero/hero-picker.avif", keys)

    def test_duplicate_registration_is_an_idempotent_noop(self):
        self.as_admin()
        self.plant_object("hero/hero-dup.avif", AVIF_BYTES)
        first = self.register_placement("hero/hero-dup.avif")
        self.assertEqual(first.status_code, 201, first.text)
        self.assertTrue(first.json()["created"])

        second = self.register_placement("hero/hero-dup.avif")
        self.assertEqual(second.status_code, 201, second.text)
        self.assertFalse(second.json()["created"])
        self.assertEqual(
            [row.id for row in self.asset_rows() if row.object_key == "hero/hero-dup.avif"].__len__(), 1
        )

    def test_the_allowlist_rejects_products_and_uploads_namespaces(self):
        self.as_admin()
        product_object = self.upload_namespace(
            "cover.png", PNG_BYTES, "image/png", "products", productId=SEED_PRODUCT_ID
        )
        self.assertEqual(product_object.status_code, 201, product_object.text)
        rejected = self.register_placement(product_object.json()["object"]["key"])
        self.assertEqual(rejected.status_code, 422, rejected.text)

        uploads_object = self.upload_namespace("loose.png", PNG_BYTES, "image/png", "uploads")
        self.assertEqual(uploads_object.status_code, 201, uploads_object.text)
        rejected_uploads = self.register_placement(uploads_object.json()["object"]["key"])
        self.assertEqual(rejected_uploads.status_code, 422, rejected_uploads.text)
        self.assertEqual(self.asset_rows(), [])

    def test_employees_are_rejected_regardless_of_grants(self):
        # Track C policy: the placement registry is ADMIN-only. Employees may
        # never register hero/marketing assets — not with media.upload, not
        # with media.upload + marketing.manage. The employee upload scope is
        # strictly products/ (existing non-archived products), so this pin
        # must survive every future employee-permission broadening.
        self._run(self._grant_employee_upload())
        self.as_hp_editor_employee()  # marketing.view+manage + media.upload now
        self.plant_object("hero/employee-attempt.avif", AVIF_BYTES)
        denied = self.register_placement("hero/employee-attempt.avif")
        self.assertEqual(denied.status_code, 403, denied.text)
        # No write happened through any fallback.
        self.assertEqual(self.asset_rows(), [])

    async def _grant_employee_upload(self):
        async with self.Session() as session:
            editor = (
                await session.execute(select(UserModel).where(UserModel.id == self.hp_editor_id))
            ).scalars().first()
            editor.custom_permissions = ["marketing.view", "marketing.manage", "media.upload"]
            await session.commit()

    def test_registering_a_missing_object_is_404(self):
        self.as_admin()
        response = self.register_placement("hero/definitely-missing.avif")
        self.assertEqual(response.status_code, 404, response.text)

    def test_non_image_content_is_rejected(self):
        self.as_admin()
        self.plant_object("hero/notes.txt", b"definitely not an image")
        rejected = self.register_placement("hero/notes.txt")
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertEqual(self.asset_rows(), [])

    def test_mislabelled_extension_registers_the_true_content_type(self):
        # Real seed art is mislabelled (.avif name, JPEG/PNG bytes) — the
        # sniffed content type, never the extension, is what gets stored.
        self.as_admin()
        self.plant_object("hero/hero001.avif", PNG_BYTES)
        registered = self.register_placement("hero/hero001.avif")
        self.assertEqual(registered.status_code, 201, registered.text)
        self.assertEqual(registered.json()["media"]["mimeType"], "image/png")

    def test_view_only_admin_cannot_register_placement(self):
        self.as_view_only_admin()
        response = self.register_placement("hero/whatever.avif")
        self.assertEqual(response.status_code, 403, response.text)

    def test_employee_token_cannot_reach_the_placement_route(self):
        self.as_hp_plain_employee()
        response = self.register_placement("hero/whatever.avif")
        self.assertEqual(response.status_code, 403, response.text)


class RetiredMarketingPlacementTests(_HomepageBatchCase):
    """B-06: retired placement writes are closed without disturbing reads/cleanup."""
    RETIRED = ("SAREE_SECTION", "BRIDAL_SECTION", "JEWELLERY_SECTION", "PROMOTION", "GROOM_SECTION", "KIDS_SECTION")
    MESSAGE = "This placement is retired. Homepage sections are managed under Homepage sections."

    def _seed_retired_row(self, placement, n):
        async def _seed():
            from app.models.media.marketing_media import MarketingMediaModel
            async with self.Session() as session:
                row = MarketingMediaModel(placement=placement, object_key=f"marketing/retired-{n}.png", title="Existing", is_active=True)
                session.add(row); await session.commit(); return row.id
        return self._run(_seed())

    def test_every_retired_placement_rejects_create_edit_and_activation_but_allows_deactivate_delete(self):
        self.as_admin()
        for n, placement in enumerate(self.RETIRED):
            created = self.client.post("/api/v1/admin/marketing/media", json={
                "placement": placement, "objectKey": f"marketing/new-retired-{n}.png", "title": "x"})
            self.assertEqual(created.status_code, 422, created.text)
            self.assertEqual(created.json()["error"]["message"], self.MESSAGE)

            row_id = self._seed_retired_row(placement, n)
            listed = self.client.get("/api/v1/admin/marketing/media", params={"placement": placement})
            self.assertEqual(listed.status_code, 200, listed.text)
            self.assertEqual([item["id"] for item in listed.json()["items"]], [row_id])
            reorder = self.client.put("/api/v1/admin/marketing/media/reorder", json={"placement": placement, "items": [{"id": row_id, "sortOrder": 9}]})
            self.assertEqual(reorder.status_code, 422, reorder.text)
            self.assertEqual(reorder.json()["error"]["message"], self.MESSAGE)
            for payload in ({"title": "changed"}, {"isActive": True}, {"isActive": False, "title": "changed"}):
                rejected = self.client.patch(f"/api/v1/admin/marketing/media/{row_id}", json=payload)
                self.assertEqual(rejected.status_code, 422, rejected.text)
                self.assertEqual(rejected.json()["error"]["message"], self.MESSAGE)
            deactivated = self.client.patch(f"/api/v1/admin/marketing/media/{row_id}", json={"isActive": False})
            self.assertEqual(deactivated.status_code, 200, deactivated.text)
            self.assertFalse(deactivated.json()["isActive"])
            deleted = self.client.delete(f"/api/v1/admin/marketing/media/{row_id}")
            self.assertIn(deleted.status_code, (200, 204), deleted.text)
            self.assertEqual(self.client.get("/api/v1/admin/marketing/media", params={"placement": placement}).json()["items"], [])

    def test_home_hero_crud_reorder_and_public_reads_remain_unchanged(self):
        self.as_admin()
        uploaded = self.upload_namespace("hero-b06-unchanged.png", PNG_BYTES, "image/png", "hero")
        key = uploaded.json()["object"]["key"]
        asset = self.register_placement(key).json()["media"]["id"]
        made = self.client.post("/api/v1/admin/marketing/media", json={
            "placement": "HOME_HERO", "objectKey": key, "mediaAssetId": asset, "title": "Hero unchanged", "ctaHref": "/shop"})
        self.assertEqual(made.status_code, 201, made.text)
        row = made.json()
        edited = self.client.patch(f"/api/v1/admin/marketing/media/{row['id']}", json={"title": "Edited"})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["title"], "Edited")
        active = self.client.patch(f"/api/v1/admin/marketing/media/{row['id']}", json={"isActive": True})
        self.assertEqual(active.status_code, 200, active.text)
        reorder = self.client.put("/api/v1/admin/marketing/media/reorder", json={"placement": "HOME_HERO", "items": [{"id": row['id'], "sortOrder": 7}]})
        self.assertEqual(reorder.status_code, 200, reorder.text)
        public = self.client.get("/api/v1/marketing/placements/HOME_HERO")
        self.assertEqual(public.status_code, 200, public.text)
        self.assertEqual([item["id"] for item in public.json()["items"]], [row["id"]])
        self.assertIn(key, public.json()["items"][0]["url"])
        self.assertIn(self.client.delete(f"/api/v1/admin/marketing/media/{row['id']}").status_code, (200, 204))


class HeroPipelineTests(_HomepageBatchCase):
    """Track B — registered art flows into hero creation AND the public /home."""

    def _registered_hero_asset(self):
        uploaded = self.upload_namespace("hero-live.png", PNG_BYTES, "image/png", "hero")
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        key = uploaded.json()["object"]["key"]
        registered = self.register_placement(key)
        self.assertEqual(registered.status_code, 201, registered.text)
        return key, registered.json()["media"]["id"]

    def test_create_activate_and_read_back_through_home(self):
        self.as_admin()
        key, asset_id = self._registered_hero_asset()

        created = self.client.post(
            "/api/v1/admin/marketing/media",
            json={
                "placement": "HOME_HERO",
                "objectKey": key,
                "mediaAssetId": asset_id,
                "title": "Batch One Hero",
                "subtitle": "Registered placement art",
                "ctaLabel": "Shop",
                "ctaHref": "/shop",
                "sortOrder": 0,
                "isActive": True,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)

        home = self.client.get("/api/v1/home")
        self.assertEqual(home.status_code, 200, home.text)
        slides = home.json()["heroSlides"]
        self.assertEqual(len(slides), 1)
        self.assertIn(key, slides[0]["image"])
        self.assertEqual(slides[0]["title"], "Batch One Hero")
        self.assertEqual(home.json()["homepageContent"]["status"], "ready")

    def test_authored_hero_alt_text_is_exposed_through_home(self):
        """B-07 (partial): the authored altText rides /home; an unauthored
        slide still carries the field, empty — backward compatible."""
        self.as_admin()
        key, asset_id = self._registered_hero_asset()
        created = self.client.post(
            "/api/v1/admin/marketing/media",
            json={
                "placement": "HOME_HERO",
                "objectKey": key,
                "mediaAssetId": asset_id,
                "title": "Alt Hero",
                "ctaHref": "/shop",
                "altText": "Banarasi campaign plate",
                "sortOrder": 0,
                "isActive": True,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        plain_uploaded = self.upload_namespace("hero-plain.png", PNG_BYTES, "image/png", "hero")
        plain = self.register_placement(plain_uploaded.json()["object"]["key"])
        self.assertEqual(plain.status_code, 201, plain.text)
        created_plain = self.client.post(
            "/api/v1/admin/marketing/media",
            json={
                "placement": "HOME_HERO",
                "objectKey": plain_uploaded.json()["object"]["key"],
                "mediaAssetId": plain.json()["media"]["id"],
                "title": "Plain Hero",
                "ctaHref": "/shop",
                "sortOrder": 1,
                "isActive": True,
            },
        )
        self.assertEqual(created_plain.status_code, 201, created_plain.text)

        home = self.client.get("/api/v1/home")
        self.assertEqual(home.status_code, 200, home.text)
        slides = home.json()["heroSlides"]
        self.assertEqual(len(slides), 2)
        self.assertEqual(slides[0]["altText"], "Banarasi campaign plate")
        self.assertEqual(slides[1]["altText"], "", "unauthored slides keep the empty-alt contract")
        self.assertEqual(slides[0]["mobileImage"], "")
        self.assertEqual(slides[1]["mobileImage"], "")

    def test_mobile_variant_create_update_clear_and_home_projection(self):
        self.as_admin()
        hero_key, hero_asset = self._registered_hero_asset()
        mobile_upload = self.upload_namespace("hero-mobile.png", PNG_BYTES, "image/png", "hero")
        mobile_key = mobile_upload.json()["object"]["key"]
        mobile_asset = self.register_placement(mobile_key).json()["media"]["id"]
        created = self.client.post("/api/v1/admin/marketing/media", json={
            "placement": "HOME_HERO", "objectKey": hero_key, "mediaAssetId": hero_asset,
            "mobileMediaAssetId": mobile_asset, "title": "Mobile hero", "ctaHref": "/shop", "isActive": True})
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["mobileMediaAssetId"], mobile_asset)
        changed = self.client.patch(f"/api/v1/admin/marketing/media/{created.json()['id']}", json={"mobileMediaAssetId": mobile_asset})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["mobileMediaAssetId"], mobile_asset)
        home = self.client.get("/api/v1/home")
        self.assertEqual(home.status_code, 200, home.text)
        self.assertIn(mobile_key, home.json()["heroSlides"][0]["mobileImage"])

        cleared = self.client.patch(f"/api/v1/admin/marketing/media/{created.json()['id']}", json={"mobileMediaAssetId": None})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        home_without_variant = self.client.get("/api/v1/home")
        self.assertEqual(home_without_variant.json()["heroSlides"][0]["mobileImage"], "")

    def test_mobile_variant_rejects_unregistered_and_wrong_namespace_assets(self):
        self.as_admin()
        hero_key, hero_asset = self._registered_hero_asset()
        unregistered = self.client.post("/api/v1/admin/marketing/media", json={
            "placement": "HOME_HERO", "objectKey": hero_key, "mediaAssetId": hero_asset,
            "mobileMediaAssetId": "not-a-registered-id", "ctaHref": "/shop"})
        self.assertEqual(unregistered.status_code, 422, unregistered.text)

        self.plant_object("uploads/mobile-wrong-namespace.png", PNG_BYTES)
        async def _seed_wrong_namespace():
            from app.models.media.media_asset import MediaAssetModel
            async with self.Session() as session:
                asset = MediaAssetModel(object_key="uploads/mobile-wrong-namespace.png", storage_provider="local",
                    media_type="image", mime_type="image/png", original_filename="mobile.png", file_size=len(PNG_BYTES),
                    checksum_sha256="a" * 64, status="uploaded", scope="marketing")
                session.add(asset); await session.commit(); return asset.id
        wrong_asset = self._run(_seed_wrong_namespace())
        wrong_namespace = self.client.post("/api/v1/admin/marketing/media", json={
            "placement": "HOME_HERO", "objectKey": hero_key, "mediaAssetId": hero_asset,
            "mobileMediaAssetId": wrong_asset, "ctaHref": "/shop"})
        self.assertEqual(wrong_namespace.status_code, 422, wrong_namespace.text)
        normal = self.client.post("/api/v1/admin/marketing/media", json={
            "placement": "HOME_HERO", "objectKey": hero_key, "mediaAssetId": hero_asset, "ctaHref": "/shop"})
        self.assertEqual(normal.status_code, 201, normal.text)
        wrong_update = self.client.patch(f"/api/v1/admin/marketing/media/{normal.json()['id']}", json={"mobileMediaAssetId": wrong_asset})
        self.assertEqual(wrong_update.status_code, 422, wrong_update.text)

    def test_hero_creation_without_a_registered_asset_fails_safely(self):
        self.as_admin()
        uploaded = self.upload_namespace("hero-unregistered.png", PNG_BYTES, "image/png", "hero")
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        key = uploaded.json()["object"]["key"]

        rejected = self.client.post(
            "/api/v1/admin/marketing/media",
            json={"placement": "HOME_HERO", "objectKey": key, "title": "No asset", "sortOrder": 0},
        )
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertEqual(self.marketing_rows(), [])
        home = self.client.get("/api/v1/home")
        self.assertEqual(home.json()["heroSlides"], [])


class SeedMarketingHeroScriptTests(_HomepageBatchCase):
    """Track B — the repaired seeder: registration first, truthful counts."""

    def _load_script(self):
        import importlib.util
        from pathlib import Path

        path = Path(__file__).parents[2] / "scripts" / "seed_marketing_hero.py"
        spec = importlib.util.spec_from_file_location("seed_marketing_hero_script", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_dry_run_registers_nothing_and_reports_failures_accurately(self):
        module = self._load_script()
        self.plant_object("hero/hero001.avif", PNG_BYTES)
        # hero/hero999.avif deliberately NOT planted → must count as FAILED.
        entries = [
            ("hero/hero001.avif", "One", "", "", "/shop", 0),
            ("hero/hero999.avif", "Missing", "", "", "/shop", 1),
        ]
        lines = []

        async def _run():
            async with self.Session() as session:
                return await module.seed_hero_entries(session, entries=entries, apply=False, out=lines.append)

        summary = self._run(_run())
        self.assertEqual(summary["mode"], "DRY-RUN")
        self.assertEqual(summary["would_create"], 1)
        self.assertEqual(summary["assets_registered"], 1)
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["failures"][0][0], "hero/hero999.avif")
        # A dry run persists nothing at all.
        self.assertEqual(self.asset_rows(), [])
        self.assertEqual(self.marketing_rows(), [])
        self.assertTrue(any("DRY-RUN" in line for line in lines))

    def test_apply_creates_entries_and_reruns_idempotently(self):
        module = self._load_script()
        self.plant_object("hero/hero001.avif", PNG_BYTES)
        self.plant_object("hero/hero002.avif", PNG_BYTES)
        entries = [
            ("hero/hero001.avif", "One", "", "", "/shop", 0),
            ("hero/hero002.avif", "Two", "", "", "/shop", 1),
        ]

        async def _run_apply():
            async with self.Session() as session:
                return await module.seed_hero_entries(session, entries=entries, apply=True, out=lambda line: None)

        first = self._run(_run_apply())
        self.assertEqual(first["created"], 2)
        self.assertEqual(first["failed"], 0)
        rows = self.marketing_rows()
        self.assertEqual(len(rows), 2)
        self.assertEqual(sorted(row.sort_order for row in rows), [0, 1])
        self.assertEqual(len(self.asset_rows()), 2)

        second = self._run(_run_apply())
        self.assertEqual(second["created"], 0)
        self.assertEqual(second["skipped_existing"], 2)
        self.assertEqual(len(self.marketing_rows()), 2)
        self.assertEqual(len(self.asset_rows()), 2)  # no duplicate assets either


class LegacyImageRegistrationTests(_HomepageBatchCase):
    """Track E — legacy column references become registered product media."""

    async def _write_reference(self, product_id, **columns):
        async with self.Session() as session:
            product = (
                await session.execute(select(ProductModel).where(ProductModel.id == product_id))
            ).scalars().first()
            for column, value in columns.items():
                setattr(product, column, value)
            await session.commit()

    def _run_registration(self, apply, product_limit=None):
        from app.services.media.legacy_image_registration import register_legacy_product_images

        async def _go():
            async with self.Session() as session:
                report = await register_legacy_product_images(session, apply=apply, product_limit=product_limit)
                if apply:
                    await session.commit()
                return report

        return self._run(_go())

    def _fixtures(self):
        # The seeded legacy product references /images/products/<id>/primary.avif
        # in BOTH `image` and `additional_images` (dedup check). One planted
        # object is verifiable; the rest exercise every skip reason.
        self.plant_object(f"products/{SEED_PRODUCT_ID}/primary.avif", PNG_BYTES)
        self.plant_object(f"products/{SEED_PRODUCT_ID}/gallery02.png", PNG_BYTES)
        self._run(
            self._write_reference(
                SEED_PRODUCT_ID,
                image=f"/images/products/{SEED_PRODUCT_ID}/primary.avif",
                hover_image="https://cdn.example.com/stolen.jpg",
                additional_images=["products/NOPE/missing.png", f"products/{SEED_PRODUCT_ID}/gallery02.png"],
            )
        )

    def test_a_legacy_registered_image_flows_picker_section_and_home(self):
        # The acceptance chain, API level: register the legacy column image →
        # it appears in the homepage media picker (GET /media/assets) → it
        # saves into a section MEDIA slot → it renders in /home homepageContent.
        key = f"products/{SEED_PRODUCT_ID}/collage.avif"
        self.plant_object(key, PNG_BYTES)
        self._run(self._write_reference(SEED_PRODUCT_ID, image=f"/images/products/{SEED_PRODUCT_ID}/collage.avif"))
        report = self._run_registration(apply=True)
        self.assertEqual(report["registered"], 1, report)
        asset = [row for row in self.asset_rows() if row.object_key == key]
        self.assertEqual(len(asset), 1)
        asset_id = asset[0].id

        # 1. The registered-media picker (every homepage MEDIA slot reads it).
        self.as_hp_admin()
        listing = self.client.get("/api/v1/media/assets")
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertIn(key, {item["objectKey"] for item in listing.json()["items"]})

        # 2. Save it into the categories collage "women" MEDIA slot.
        configured = self.client.put(
            "/api/v1/admin/homepage/sections/categories",
            json={"expectedRevision": 0, "isActive": True},
        )
        self.assertEqual(configured.status_code, 201, configured.text)
        created = self.client.post(
            "/api/v1/admin/homepage/sections/categories/items",
            json={
                "slotKey": "women",
                "contentType": "MEDIA",
                "mediaAssetId": asset_id,
                "expectedRevision": 1,
                "isActive": True,
                "altText": "Legacy collage image",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)

        # 3. The public assembled homepage carries the project item + media.
        self.as_customer()
        home = self.client.get("/api/v1/home")
        self.assertEqual(home.status_code, 200, home.text)
        sections = {s["key"]: s for s in home.json()["homepageContent"]["sections"]}
        categories = sections["categories"]
        self.assertEqual(categories["state"], "ready")
        media = [i for i in categories["items"] if i["slotKey"] == "women" and i["contentType"] == "MEDIA"]
        self.assertEqual(len(media), 1, categories["items"])
        self.assertEqual(media[0]["media"]["objectKey"], key)
        self.assertEqual(media[0]["media"]["altText"], "Legacy collage image")

    def test_dry_run_registers_nothing_but_reports_the_plan(self):
        self._fixtures()
        report = self._run_registration(apply=False)
        self.assertEqual(report["mode"], "DRY-RUN")
        self.assertEqual(report["would_register"], 2, report)
        self.assertEqual(report["skipped"]["external-url"], 1)
        self.assertEqual(report["skipped"]["missing-object"], 1, report)
        self.assertEqual(self.asset_rows(), [])
        self.assertEqual(self.mapping_rows(), [])
        self.assertTrue(any(s["objectKey"] == f"products/{SEED_PRODUCT_ID}/primary.avif" for s in report["samples"]))

    def test_apply_registers_additively_and_is_idempotent(self):
        self._fixtures()
        before = self.product_row(SEED_PRODUCT_ID)
        report = self._run_registration(apply=True)
        self.assertEqual(report["registered"], 2, report)
        self.assertEqual(report["assets_created"], 2)
        self.assertEqual(report["mappings_created"], 2)

        assets = {row.object_key: row for row in self.asset_rows()}
        self.assertIn(f"products/{SEED_PRODUCT_ID}/primary.avif", assets)
        mapping = self.mapping_rows(SEED_PRODUCT_ID)
        self.assertEqual(len(mapping), 2)
        for row in mapping:
            self.assertFalse(row.is_primary, "Track E never claims primacy")
            self.assertEqual(row.role, "GALLERY")
        for asset in assets.values():
            self.assertEqual(asset.scope, "product")

        # Product columns are never rewritten.
        after = self.product_row(SEED_PRODUCT_ID)
        self.assertEqual(after.image, before.image)
        self.assertEqual(after.additional_images, before.additional_images)

        again = self._run_registration(apply=True)
        self.assertEqual(again["registered"], 0, again)
        self.assertEqual(again["skipped"]["already-registered"], 2)
        self.assertEqual(len(self.asset_rows()), 2)
        self.assertEqual(len(self.mapping_rows()), 2)

    def test_unmapped_references_are_skipped_not_guessed(self):
        self._run(
            self._write_reference(
                SEED_PRODUCT_ID,
                image="/static/non-catalog/file.png",   # absolute server path: not ours
                hover_image="",
                additional_images=["/9ppt/../escape.png"],  # traversal → no usable key
            )
        )
        report = self._run_registration(apply=True)
        self.assertEqual(report["registered"], 0, report)
        self.assertEqual(report["skipped"]["not-an-object-reference"], 2, report)
        self.assertEqual(self.asset_rows(), [])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()


class EmployeeProductMediaTests(_HomepageBatchCase):
    """Track C — employee upload/register: products/ only, explicit media.upload.

    Employee-lane writes are further hardened: DRAFT / PENDING_REVIEW only
    (PUBLISHED and ARCHIVED are admin territory), never primary.
    """

    def test_employee_without_media_upload_is_403_on_both_routes(self):
        self.as_hp_plain_employee()
        denied_upload = self.employee_upload(SEED_PRODUCT_ID, "x.png", PNG_BYTES, "image/png")
        self.assertEqual(denied_upload.status_code, 403, denied_upload.text)
        self.plant_object(f"products/{SEED_PRODUCT_ID}/plain.png", PNG_BYTES)
        denied_register = self.employee_register(f"products/{SEED_PRODUCT_ID}/plain.png", SEED_PRODUCT_ID)
        self.assertEqual(denied_register.status_code, 403, denied_register.text)
        self.assertEqual(self.asset_rows(), [])

    def test_upload_with_grant_registers_and_maps_the_product(self):
        self._draft()  # employee lane: only DRAFT / PENDING_REVIEW is writable
        self.as_hp_uploader_employee()
        uploaded = self.employee_upload(
            SEED_PRODUCT_ID, "team-shot.png", PNG_BYTES, "image/png", role="gallery"
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        key = uploaded.json()["object"]["key"]
        self.assertTrue(key.startswith(f"products/{SEED_PRODUCT_ID}/"), key)

        assets = [row for row in self.asset_rows() if row.object_key == key]
        self.assertEqual(len(assets), 1)
        self.assertEqual(assets[0].scope, "product")
        self.assertEqual(assets[0].uploaded_by, self.hp_uploader_id)
        mappings = self.mapping_rows(SEED_PRODUCT_ID)
        self.assertEqual(len(mappings), 1)
        self.assertEqual(mappings[0].media_id, assets[0].id)

        # Registered product media is immediately listable in the picker.
        listing = self.client.get("/api/v1/media/assets")
        self.assertEqual(listing.status_code, 403, listing.text)  # admin surface stays closed
        # …but the STAFF read model resolves the assignment: the media-set is
        # public for PUBLISHED products only, so this DRAFT read rides on the
        # employee's own media.upload session (1A staff gate).
        media_set = self.client.get(f"/api/v1/media/products/{SEED_PRODUCT_ID}/media-set")
        self.assertEqual(media_set.status_code, 200, media_set.text)
        keys = {item["objectKey"] for item in media_set.json()["mediaItems"]}
        self.assertIn(key, keys)

    def test_register_by_key_is_idempotent_and_never_reshapes_the_mapping(self):
        self._draft()
        self.as_hp_uploader_employee()
        key = f"products/{SEED_PRODUCT_ID}/reuse.png"
        self.plant_object(key, PNG_BYTES)
        first = self.employee_register(key, SEED_PRODUCT_ID, role="gallery")
        self.assertEqual(first.status_code, 201, first.text)
        media_id = first.json()["media"]["id"]
        # Re-registering the same key is idempotent — and MUST NOT touch the
        # existing mapping's role / sort order / primary flag.
        second = self.employee_register(key, SEED_PRODUCT_ID, role="detail", sort_order=9)
        self.assertEqual(second.status_code, 201, second.text)
        self.assertEqual(second.json()["media"]["id"], media_id)
        self.assertEqual(len([row for row in self.asset_rows() if row.object_key == key]), 1)
        mapping = self.mapping_rows(SEED_PRODUCT_ID)[0]
        self.assertEqual(mapping.role, "gallery")  # caller's own casing, unchanged
        self.assertEqual(mapping.sort_order, 0)
        self.assertFalse(mapping.is_primary)

    def test_register_only_binds_keys_inside_the_product_namespace(self):
        self._draft()
        self.as_hp_uploader_employee()
        outside = [
            "hero/hero001.avif",
            "marketing/campaign.avif",
            f"products/OTHER-PRODUCT/{SEED_PRODUCT_ID}.png",
            "uploads/loose.png",
        ]
        for index, key in enumerate(outside):
            self.plant_object(key, PNG_BYTES)
            denied = self.employee_register(key, SEED_PRODUCT_ID)
            self.assertEqual(denied.status_code, 422, (key, denied.text))
        self.assertEqual(self.asset_rows(), [])

    def test_archived_products_reject_employee_upload_and_register(self):
        async def _archive():
            async with self.Session() as session:
                product = (
                    await session.execute(select(ProductModel).where(ProductModel.id == SEED_PRODUCT_ID))
                ).scalars().first()
                product.status = "ARCHIVED"
                await session.commit()

        self._run(_archive())
        self.as_hp_uploader_employee()
        denied_upload = self.employee_upload(SEED_PRODUCT_ID, "dead.png", PNG_BYTES, "image/png")
        self.assertEqual(denied_upload.status_code, 422, denied_upload.text)
        self.plant_object(f"products/{SEED_PRODUCT_ID}/dead.png", PNG_BYTES)
        denied_register = self.employee_register(f"products/{SEED_PRODUCT_ID}/dead.png", SEED_PRODUCT_ID)
        self.assertEqual(denied_register.status_code, 422, denied_register.text)
        self.assertEqual(self.asset_rows(), [])

    def test_unknown_product_is_a_clean_404(self):
        self.as_hp_uploader_employee()
        missing_upload = self.employee_upload("PF-LONG-GONE-0001", "x.png", PNG_BYTES, "image/png")
        self.assertEqual(missing_upload.status_code, 404, missing_upload.text)
        missing_register = self.employee_register(f"products/PF-LONG-GONE-0001/x.png", "PF-LONG-GONE-0001")
        self.assertEqual(missing_register.status_code, 404, missing_register.text)

    def test_media_upload_grant_does_not_extend_to_homepage_or_placements(self):
        # Decision pin: media.upload ≠ homepage editing AND ≠ placement
        # registration, even for employees who upload all day.
        self.as_hp_uploader_employee()
        placement = self.register_placement("hero/nope.avif")
        self.assertEqual(placement.status_code, 403, placement.text)
        homepage_write = self.configure_trust("employee", 0)
        self.assertEqual(homepage_write.status_code, 403, homepage_write.text)

    def test_employee_routes_still_validate_role_and_key(self):
        self._draft()
        self.as_hp_uploader_employee()
        key = f"products/{SEED_PRODUCT_ID}/role-check.png"
        self.plant_object(key, PNG_BYTES)
        bad_role = self.employee_register(key, SEED_PRODUCT_ID, role="definitely-not-a-role")
        self.assertEqual(bad_role.status_code, 422, bad_role.text)
        missing = self.employee_register(f"products/{SEED_PRODUCT_ID}/not-there.png", SEED_PRODUCT_ID)
        self.assertEqual(missing.status_code, 404, missing.text)
        self.assertEqual(self.asset_rows(), [])

    def test_admin_surface_still_rejects_employee_tokens(self):
        # No route migration leaked: the admin upload/register paths keep
        # their hard employee denial.
        self.as_hp_uploader_employee()
        admin_upload = self.upload(SEED_PRODUCT_ID, "nope.png", PNG_BYTES, "image/png")
        self.assertEqual(admin_upload.status_code, 403, admin_upload.text)
        admin_register = self.register(f"products/{SEED_PRODUCT_ID}/nope.png")
        self.assertEqual(admin_register.status_code, 403, admin_register.text)


    # ── Employee write hardening: DRAFT/PENDING_REVIEW only, never primary,
    #    and the employee lane never reshapes an existing mapping. ──────────

    def test_employee_primary_flag_is_rejected_on_both_routes(self):
        self._draft()
        self.as_hp_uploader_employee()
        denied_upload = self.employee_upload(
            SEED_PRODUCT_ID, "cover-grab.png", PNG_BYTES, "image/png",
            is_primary="true", role="cover",
        )
        self.assertEqual(denied_upload.status_code, 422, denied_upload.text)
        key = f"products/{SEED_PRODUCT_ID}/planted.png"
        self.plant_object(key, PNG_BYTES)
        denied_register = self.employee_register(key, SEED_PRODUCT_ID, is_primary="true")
        self.assertEqual(denied_register.status_code, 422, denied_register.text)
        for response in (denied_upload, denied_register):
            self.assertIn("administrator sets the primary image", response.text)
        # Nothing reached storage registration or mapping tables.
        self.assertEqual(self.asset_rows(), [])
        self.assertEqual(self.mapping_rows(SEED_PRODUCT_ID), [])

    def test_published_products_reject_employee_upload_and_register(self):
        # The seeded product is PUBLISHED — the hardening blocks BOTH routes.
        product = self.product_row(SEED_PRODUCT_ID)
        self.assertEqual(product.status, "PUBLISHED")
        self.as_hp_uploader_employee()
        denied_upload = self.employee_upload(SEED_PRODUCT_ID, "live.png", PNG_BYTES, "image/png")
        self.assertEqual(denied_upload.status_code, 422, denied_upload.text)
        key = f"products/{SEED_PRODUCT_ID}/live.png"
        self.plant_object(key, PNG_BYTES)
        denied_register = self.employee_register(key, SEED_PRODUCT_ID)
        self.assertEqual(denied_register.status_code, 422, denied_register.text)
        for response in (denied_upload, denied_register):
            self.assertIn("DRAFT or PENDING_REVIEW", response.text)
        self.assertEqual(self.asset_rows(), [])

    def test_draft_and_pending_review_products_accept_employee_writes(self):
        self.as_hp_uploader_employee()
        for status in ("DRAFT", "PENDING_REVIEW"):
            self._set_product_status(status, published=False)
            uploaded = self.employee_upload(
                SEED_PRODUCT_ID, f"{status.lower().replace('_', '-')}.png", PNG_BYTES, "image/png"
            )
            self.assertEqual(uploaded.status_code, 201, (status, uploaded.text))
            key = uploaded.json()["object"]["key"]
            # Register-by-key of an existing object works in both states too.
            planted = f"products/{SEED_PRODUCT_ID}/again-{status.lower()}.png"
            self.plant_object(planted, PNG_BYTES)
            registered = self.employee_register(planted, SEED_PRODUCT_ID)
            self.assertEqual(registered.status_code, 201, (status, registered.text))

    def test_employee_re_register_leaves_admin_primary_and_flags_untouched(self):
        self._draft()
        # Admin lane: two images, the first explicitly PRIMARY.
        self.as_admin()
        first = self.client.post(
            f"/api/v1/media/products/{SEED_PRODUCT_ID}/objects",
            files={"file": ("admin-cover.png", PNG_BYTES, "image/png")},
            data={"role": "cover", "is_primary": "true", "sort_order": "2"},
        )
        self.assertEqual(first.status_code, 201, first.text)
        cover_key = first.json()["object"]["key"]
        second_upload = self.client.post(
            f"/api/v1/media/products/{SEED_PRODUCT_ID}/objects",
            files={"file": ("admin-side.png", PNG_BYTES, "image/png")},
            data={"role": "gallery", "sort_order": "5"},
        )
        self.assertEqual(second_upload.status_code, 201, second_upload.text)
        side_key = second_upload.json()["object"]["key"]
        before = {m.media_id: (m.role, m.sort_order, m.is_primary) for m in self.mapping_rows(SEED_PRODUCT_ID)}

        # Employee re-registers the SAME keys trying to reshape them.
        self.as_hp_uploader_employee()
        self.assertTrue(cover_key.startswith(f"products/{SEED_PRODUCT_ID}/"))
        reshaped = self.employee_register(cover_key, SEED_PRODUCT_ID, role="detail", sort_order=99)
        self.assertEqual(reshaped.status_code, 201, reshaped.text)
        reshaped_side = self.employee_register(side_key, SEED_PRODUCT_ID, role="detail", sort_order=1)
        self.assertEqual(reshaped_side.status_code, 201, reshaped_side.text)

        after = {m.media_id: (m.role, m.sort_order, m.is_primary) for m in self.mapping_rows(SEED_PRODUCT_ID)}
        self.assertEqual(after, before, "employee re-register must not change role/sort_order/is_primary")
        primaries = [m for m in self.mapping_rows(SEED_PRODUCT_ID) if m.is_primary]
        self.assertEqual(len(primaries), 1)

    def test_admin_still_sets_rotates_and_reshapes_primary_unchanged(self):
        # Pin the unchanged admin contract in the same revision: the admin
        # register route keeps demoting + updating mappings in place.
        self._draft()
        self.as_admin()
        first = self.client.post(
            f"/api/v1/media/products/{SEED_PRODUCT_ID}/objects",
            files={"file": ("a.png", PNG_BYTES, "image/png")},
            data={"is_primary": "true"},
        )
        self.assertEqual(first.status_code, 201, first.text)
        key_a = first.json()["object"]["key"]
        second = self.client.post(
            f"/api/v1/media/products/{SEED_PRODUCT_ID}/objects",
            files={"file": ("b.png", PNG_BYTES, "image/png")},
            data={"role": "gallery"},
        )
        self.assertEqual(second.status_code, 201, second.text)
        key_b = second.json()["object"]["key"]

        rotated = self.register(key_b, SEED_PRODUCT_ID, role="cover", is_primary=True)
        self.assertEqual(rotated.status_code, 201, rotated.text)
        mappings = self.mapping_rows(SEED_PRODUCT_ID)
        by_key = {}
        for row in self.asset_rows():
            mapping = next((m for m in mappings if m.media_id == row.id), None)
            if mapping:
                by_key[row.object_key] = mapping
        self.assertFalse(by_key[key_a].is_primary, "old primary must be demoted by the admin register")
        self.assertTrue(by_key[key_b].is_primary, "admin-set primary must win")
        self.assertEqual(by_key[key_b].role, "cover")


class ProductMediaSetVisibilityTests(_HomepageBatchCase):
    """Batch 2 / 1A — the public media-set never leaks unpublished product media.

    Anonymous and customer callers see the set for PUBLISHED products only;
    any other status answers exactly like a missing product (same 404
    envelope, no existence leak). Staff holding a server-side session —
    any admin, or an employee granted media.view / media.upload — may read
    the set for any product status.
    """

    async def asyncSetUp(self):
        await super().asyncSetUp()
        # An employee whose ONLY media grant is media.view (read-only lane).
        async with self.Session() as session:
            viewer_emp = UserModel(
                email="p7-mediaview@pratikshya.test",
                full_name="Media View Stylist",
                hashed_password="x",
                user_type="employee",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
                permission_mode="custom",
                custom_permissions=["media.view"],
            )
            session.add(viewer_emp)
            await session.commit()
            self.media_view_employee_id = viewer_emp.id
        # One registered item on the seed product (PUBLISHED at this point)
        # so every successful read carries a non-empty mediaItems list.
        self.as_admin()
        self.vis_key = f"products/{SEED_PRODUCT_ID}/vis-gate.png"
        self.plant_object(self.vis_key, PNG_BYTES)
        registered = self.register(self.vis_key, SEED_PRODUCT_ID, role="GALLERY")
        assert registered.status_code == 201, registered.text

    def _media_set(self):
        return self.client.get(f"/api/v1/media/products/{SEED_PRODUCT_ID}/media-set")

    def _assert_404_hides_everything(self, response):
        self.assertEqual(response.status_code, 404, response.text)
        self.assertNotIn("mediaItems", response.text)
        self.assertNotIn(self.vis_key, response.text)

    # ── public contract ───────────────────────────────────────────────────

    def test_anonymous_gets_the_set_for_a_published_product(self):
        self.as_anonymous()  # seed product is PUBLISHED + published=True
        response = self._media_set()
        self.assertEqual(response.status_code, 200, response.text)
        keys = {item["objectKey"] for item in response.json()["mediaItems"]}
        self.assertIn(self.vis_key, keys)

    def test_anonymous_draft_is_indistinguishable_from_a_missing_product(self):
        self._draft()
        self.as_anonymous()
        draft = self._media_set()
        missing = self.client.get("/api/v1/media/products/NOSUCH-NOPE-0000/media-set")
        self.assertEqual(missing.status_code, 404)
        self._assert_404_hides_everything(draft)
        # Same envelope, same message template — existence is not leaked.
        self.assertEqual(
            draft.text.replace(SEED_PRODUCT_ID, "NOSUCH-NOPE-0000"), missing.text
        )

    def test_anonymous_404_for_pending_review_and_archived_products(self):
        self.as_anonymous()
        self._set_product_status("PENDING_REVIEW", published=False)
        self._assert_404_hides_everything(self._media_set())
        self._set_product_status("ARCHIVED", published=False)
        self._assert_404_hides_everything(self._media_set())

    def test_published_flag_off_hides_the_set_even_at_status_published(self):
        # The storefront DTO gate is status AND the published flag — the
        # media-set mirrors both halves.
        self._set_product_status("PUBLISHED", published=False)
        self.as_anonymous()
        self._assert_404_hides_everything(self._media_set())

    def test_customer_session_gets_the_public_contract(self):
        self._draft()
        self.as_customer()  # a session, but not staff
        self._assert_404_hides_everything(self._media_set())
        self._set_product_status("PUBLISHED", published=True)
        self.assertEqual(self._media_set().status_code, 200)

    # ── staff lane (server-side session only) ─────────────────────────────

    def test_employee_with_media_upload_reads_the_draft_set(self):
        self._draft()
        self.as_hp_uploader_employee()
        response = self._media_set()
        self.assertEqual(response.status_code, 200, response.text)
        keys = {item["objectKey"] for item in response.json()["mediaItems"]}
        self.assertIn(self.vis_key, keys)

    def test_employee_with_media_view_reads_the_draft_set(self):
        self._draft()
        self._set_current_user(self.app, self.media_view_employee_id)
        response = self._media_set()
        self.assertEqual(response.status_code, 200, response.text)
        keys = {item["objectKey"] for item in response.json()["mediaItems"]}
        self.assertIn(self.vis_key, keys)

    def test_employee_without_any_media_grant_gets_404_for_draft(self):
        self._draft()
        self.as_hp_plain_employee()  # employee session, zero media grants
        self._assert_404_hides_everything(self._media_set())

    def test_any_admin_reads_the_set_for_any_status(self):
        self._draft()
        self.as_admin()
        response = self._media_set()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn(
            self.vis_key, {item["objectKey"] for item in response.json()["mediaItems"]}
        )
        # A read-only admin (media.view only) and ARCHIVED status included.
        self.as_view_only_admin()
        self._set_product_status("ARCHIVED", published=False)
        self.assertEqual(self._media_set().status_code, 200)


class RegisteredAssetFilterTests(_HomepageBatchCase):
    """Batch 2 / 1B (B-11) — registered-media library search, scope and mime
    filters for the admin list and the employee picker page.

    Scope vocabulary truth: stored scope is {product, marketing}; ``hero``
    is the hero/ namespace of the marketing scope. Defaults stay byte-
    identical to the pre-filter page (no params ⇒ unfiltered newest-first).
    """

    async def asyncSetUp(self):
        await super().asyncSetUp()
        # An employee able to open the picker: marketing.view + media.view.
        async with self.Session() as session:
            picker_emp = UserModel(
                email="p7-picker@pratikshya.test",
                full_name="Picker Stylist",
                hashed_password="x",
                user_type="employee",
                status="ACTIVE",
                is_verified=True,
                force_password_change=False,
                permission_mode="custom",
                custom_permissions=["marketing.view", "media.view"],
            )
            session.add(picker_emp)
            await session.commit()
            self.picker_employee_id = picker_emp.id
        self.as_admin()
        self.product_keys = []
        for name, data in (("cover-photo.png", PNG_BYTES), ("detail-weave.avif", AVIF_BYTES)):
            key = f"products/{SEED_PRODUCT_ID}/{name}"
            self.plant_object(key, data)
            registered = self.register(key, SEED_PRODUCT_ID, role="GALLERY")
            assert registered.status_code == 201, registered.text
            self.product_keys.append(key)
        self.hero_key = "hero/summer-launch.png"
        self.plant_object(self.hero_key, PNG_BYTES)
        hero = self.register_placement(self.hero_key)
        assert hero.status_code == 201, hero.text
        self.marketing_key = "marketing/festive-edit.webp"
        self.plant_object(self.marketing_key, WEBP_BYTES)
        placement = self.register_placement(self.marketing_key)
        assert placement.status_code == 201, placement.text

    # ── admin list (GET /media/assets) ────────────────────────────────────

    def test_default_page_is_unchanged_and_carries_picker_context(self):
        self.as_admin()
        listing = self.client.get("/api/v1/media/assets")
        self.assertEqual(listing.status_code, 200, listing.text)
        body = listing.json()
        self.assertEqual(body["total"], 4)
        self.assertEqual(len(body["items"]), 4)
        by_key = {item["objectKey"]: item for item in body["items"]}
        self.assertEqual(by_key[self.product_keys[0]]["scope"], "product")
        self.assertEqual(by_key[self.product_keys[0]]["productName"], "Banarasi Silk Saree")
        self.assertEqual(by_key[self.product_keys[0]]["productSku"], SEED_PRODUCT_ID)
        self.assertEqual(by_key[self.hero_key]["scope"], "marketing")
        self.assertIsNone(by_key[self.hero_key]["productName"])
        self.assertIsNone(by_key[self.marketing_key]["productSku"])

    def test_q_matches_object_key_and_filename(self):
        self.as_admin()
        listing = self.client.get("/api/v1/media/assets", params={"q": "detail-weave"})
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual([item["objectKey"] for item in listing.json()["items"]], [self.product_keys[1]])
        self.assertEqual(listing.json()["total"], 1)

    def test_q_matches_owning_product_name_and_sku(self):
        self.as_admin()
        by_name = self.client.get("/api/v1/media/assets", params={"q": "Banarasi"})
        self.assertEqual(by_name.status_code, 200, by_name.text)
        self.assertEqual(
            {item["objectKey"] for item in by_name.json()["items"]}, set(self.product_keys)
        )
        by_sku = self.client.get("/api/v1/media/assets", params={"q": SEED_PRODUCT_ID})
        self.assertEqual(
            {item["objectKey"] for item in by_sku.json()["items"]}, set(self.product_keys)
        )

    def test_scope_filter_separates_product_hero_and_marketing_art(self):
        self.as_admin()
        product = self.client.get("/api/v1/media/assets", params={"scope": "product"})
        self.assertEqual(product.status_code, 200, product.text)
        self.assertEqual({item["objectKey"] for item in product.json()["items"]}, set(self.product_keys))
        hero = self.client.get("/api/v1/media/assets", params={"scope": "hero"})
        self.assertEqual([item["objectKey"] for item in hero.json()["items"]], [self.hero_key])
        marketing = self.client.get("/api/v1/media/assets", params={"scope": "marketing"})
        self.assertEqual([item["objectKey"] for item in marketing.json()["items"]], [self.marketing_key])

    def test_mime_filter_matches_exactly(self):
        self.as_admin()
        listing = self.client.get("/api/v1/media/assets", params={"mime": "image/png"})
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(
            {item["objectKey"] for item in listing.json()["items"]},
            {self.product_keys[0], self.hero_key},
        )

    def test_empty_result_is_a_clean_page_not_an_error(self):
        self.as_admin()
        listing = self.client.get("/api/v1/media/assets", params={"q": "no-such-thing-anywhere"})
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(listing.json()["items"], [])
        self.assertEqual(listing.json()["total"], 0)

    def test_unknown_scope_is_a_canonical_422(self):
        self.as_admin()
        rejected = self.client.get("/api/v1/media/assets", params={"scope": "banner"})
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertIn("scope", rejected.text)
        self.assertIn("marketing", rejected.text)

    def test_q_length_is_capped(self):
        self.as_admin()
        rejected = self.client.get("/api/v1/media/assets", params={"q": "x" * 121})
        self.assertEqual(rejected.status_code, 422, rejected.text)
        accepted = self.client.get("/api/v1/media/assets", params={"q": "x" * 120})
        self.assertEqual(accepted.status_code, 200, accepted.text)

    def test_like_wildcards_in_q_match_literally(self):
        """'%' and '_' in the search text are LITERALS (ESCAPE '\\'), never
        LIKE wildcards — otherwise "100%" would return the whole library."""
        async def _rename_other_product():
            async with self.Session() as session:
                product = (
                    await session.execute(
                        select(ProductModel).where(ProductModel.id == "PF-W-TST-OTH-0002")
                    )
                ).scalars().first()
                product.name = "100% Silk_Kurta Wonder"
                await session.commit()

        self._run(_rename_other_product())
        key = "products/PF-W-TST-OTH-0002/percent-cover.png"
        self.plant_object(key, PNG_BYTES)
        self.as_admin()
        registered = self.register(key, "PF-W-TST-OTH-0002", role="GALLERY")
        self.assertEqual(registered.status_code, 201, registered.text)

        for query in ("_", "%", "100%", "Silk_K"):
            listing = self.client.get("/api/v1/media/assets", params={"q": query})
            self.assertEqual(listing.status_code, 200, listing.text)
            self.assertEqual(
                [item["objectKey"] for item in listing.json()["items"]],
                [key],
                f"q={query!r} must match the literal product name only",
            )

    def test_pagination_survives_filtering(self):
        self.as_admin()
        listing = self.client.get("/api/v1/media/assets", params={"q": SEED_PRODUCT_ID, "pageSize": 1, "page": 2})
        self.assertEqual(listing.status_code, 200, listing.text)
        body = listing.json()
        self.assertEqual(body["total"], 2)
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["page"], 2)

    def test_read_stays_on_media_view_and_employees_stay_off_the_admin_list(self):
        self.as_view_only_admin()  # media.view grant only
        self.assertEqual(self.client.get("/api/v1/media/assets", params={"q": "Banarasi"}).status_code, 200)
        self.as_hp_plain_employee()
        self.assertEqual(self.client.get("/api/v1/media/assets").status_code, 403)

    # ── employee picker page (GET /employee/homepage/media-assets) ───────

    def test_employee_picker_supports_the_same_filters_and_context(self):
        self._set_current_user(self.app, self.picker_employee_id)
        everything = self.client.get("/api/v1/employee/homepage/media-assets")
        self.assertEqual(everything.status_code, 200, everything.text)
        self.assertEqual(everything.json()["total"], 4)
        by_name = self.client.get("/api/v1/employee/homepage/media-assets", params={"q": "Banarasi"})
        self.assertEqual(by_name.status_code, 200, by_name.text)
        items = by_name.json()["items"]
        self.assertEqual({item["objectKey"] for item in items}, set(self.product_keys))
        self.assertEqual(items[0]["scope"], "product")
        self.assertEqual(items[0]["productName"], "Banarasi Silk Saree")
        self.assertEqual(items[0]["productSku"], SEED_PRODUCT_ID)
        hero = self.client.get("/api/v1/employee/homepage/media-assets", params={"scope": "hero"})
        self.assertEqual([item["objectKey"] for item in hero.json()["items"]], [self.hero_key])
        rejected = self.client.get("/api/v1/employee/homepage/media-assets", params={"scope": "banner"})
        self.assertEqual(rejected.status_code, 422, rejected.text)

    def test_employee_picker_keeps_its_permission_gate(self):
        self.as_hp_plain_employee()
        denied = self.client.get("/api/v1/employee/homepage/media-assets")
        self.assertEqual(denied.status_code, 403, denied.text)

    def test_searching_a_product_name_finds_a_legacy_registered_image(self):
        """End-to-end (1B): register the product's legacy column image through
        the legacy registration script, then the picker search by product
        name finds that image."""
        from app.services.media.legacy_image_registration import register_legacy_product_images

        key = f"products/{SEED_PRODUCT_ID}/legacy-cover.avif"
        self.plant_object(key, PNG_BYTES)

        async def _write_reference():
            async with self.Session() as session:
                product = (
                    await session.execute(select(ProductModel).where(ProductModel.id == SEED_PRODUCT_ID))
                ).scalars().first()
                product.image = f"/images/products/{SEED_PRODUCT_ID}/legacy-cover.avif"
                await session.commit()

        self._run(_write_reference())

        async def _register():
            async with self.Session() as session:
                report = await register_legacy_product_images(session, apply=True)
                await session.commit()
                return report

        report = self._run(_register())
        self.assertEqual(report["registered"], 1, report)

        self.as_admin()
        found = self.client.get("/api/v1/media/assets", params={"q": "Banarasi"})
        self.assertEqual(found.status_code, 200, found.text)
        keys = {item["objectKey"] for item in found.json()["items"]}
        self.assertIn(key, keys)


class MarketingCtaWriteValidationTests(_HomepageBatchCase):
    """Batch 2 / 2D (B-13) — site-relative-only CTAs on marketing-media writes.

    The write lanes (create AND update) enforce the same `safe_cta` rule the
    homepage sections use. Existing rows are never re-validated, rejected or
    rewritten on read — the rule is write-only.
    """

    def _seed_legacy_row_with_external_cta(self):
        """A pre-B-13 row, inserted directly (bypassing write validation),
        exactly like a row that pre-dates the rule."""
        async def _go():
            from app.models.media.marketing_media import MarketingMediaModel

            async with self.Session() as session:
                row = MarketingMediaModel(
                    placement="HOME_HERO",
                    object_key="hero/legacy-external.png",
                    title="Legacy external CTA",
                    cta_label="Old campaign",
                    cta_href="https://external.example/landing",
                    sort_order=99,
                    is_active=False,
                )
                session.add(row)
                await session.commit()
                return row.id

        return self._run(_go())

    def test_create_with_an_external_cta_is_rejected(self):
        self.as_admin()
        for bad in ("https://external.example/x", "//external.example", "https://example.shop/ok-looking"):
            rejected = self.client.post(
                "/api/v1/admin/marketing/media",
                json={
                    "placement": "HOME_HERO",
                    "objectKey": "hero/whatever.png",
                    "ctaLabel": "Go",
                    "ctaHref": bad,
                },
            )
            self.assertEqual(rejected.status_code, 422, f"{bad}: {rejected.text}")
        self.assertEqual(self.marketing_rows(), [], "a rejected CTA must persist nothing")

    def test_create_with_a_site_relative_cta_still_passes(self):
        self.as_admin()
        key, asset_id = self._hoisted_hero_asset() if False else (None, None)
        uploaded = self.upload_namespace("cta-ok.png", PNG_BYTES, "image/png", "hero")
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        key = uploaded.json()["object"]["key"]
        registered = self.register_placement(key)
        self.assertEqual(registered.status_code, 201, registered.text)
        created = self.client.post(
            "/api/v1/admin/marketing/media",
            json={
                "placement": "HOME_HERO",
                "objectKey": key,
                "mediaAssetId": registered.json()["media"]["id"],
                "ctaLabel": "Shop",
                "ctaHref": "/shop?silk=1",
                "isActive": False,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)

    def test_update_with_an_external_cta_is_rejected_but_the_row_is_untouched(self):
        row_id = self._seed_legacy_row_with_external_cta()
        self.as_admin()
        rejected = self.client.patch(
            f"/api/v1/admin/marketing/media/{row_id}",
            json={"ctaHref": "https://new-external.example/promo"},
        )
        self.assertEqual(rejected.status_code, 422, rejected.text)
        rows = self.marketing_rows()
        self.assertEqual(rows[0].cta_href, "https://external.example/landing",
                         "a rejected update must not rewrite the row")

    def test_existing_invalid_rows_are_still_served_on_read(self):
        """Write-only enforcement: pre-existing invalid CTAs are neither
        rejected nor rewritten when read back (list + /home projection)."""
        row_id = self._seed_legacy_row_with_external_cta()
        # Put the object in storage so the /home builder accepts the row, and
        # activate it so it projects.
        self.plant_object("hero/legacy-external.png", PNG_BYTES)

        async def _activate():
            from app.models.media.marketing_media import MarketingMediaModel

            async with self.Session() as session:
                row = (await session.execute(select(MarketingMediaModel).where(MarketingMediaModel.id == row_id))).scalars().first()
                row.is_active = True
                await session.commit()

        self._run(_activate())
        self.as_admin()
        listing = self.client.get("/api/v1/admin/marketing/media", params={"placement": "HOME_HERO"})
        self.assertEqual(listing.status_code, 200, listing.text)
        item = next(row for row in listing.json()["items"] if row["id"] == row_id)
        self.assertEqual(item["ctaHref"], "https://external.example/landing",
                         "reads never rewrite existing rows")
        home = self.client.get("/api/v1/home")
        self.assertEqual(home.status_code, 200, home.text)
        self.assertTrue(any(slide["href"] == "https://external.example/landing" for slide in home.json()["heroSlides"]),
                        "the /home projection serves pre-existing rows as stored")
