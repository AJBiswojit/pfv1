"""
PHASE 7 — DISPOSABLE-POSTGRESQL END-TO-END VERIFICATION
=======================================================

This script is the required "≥1 E2E create → upload → register → assign →
publish → storefront" proof for the Phase 7 product media lifecycle, run
against a REAL schema applied by the REAL Alembic chain on a REAL PostgreSQL
server — while honouring every standing constraint:

  · The PostgreSQL cluster is DISPOSABLE: `pgserver` provisions a private
    cluster in a temporary directory, and it (and its data directory) are
    removed when the run ends. The company database is never touched, never
    connected to, never referenced.
  · `alembic upgrade head` runs against that disposable database ONLY —
    proving the full migration chain (initial schema → m001 schema move →
    p7_media_lifecycle) applies cleanly to a fresh PostgreSQL.
  · STORAGE_PROVIDER stays `local`, rooted in a temporary directory. No AWS,
    no S3, no credentials anywhere.
  · No seeding of production data: the only rows written are the isolated
    test fixtures this run creates inside the disposable cluster.
  · Nothing under frontend/public/images or backend/storage/media is read,
    modified or deleted.

Run it:

    backend/.venv/bin/python backend/scripts/phase7_pg_e2e.py

Exit code 0 = every step passed. The final section prints a structured
PASS/FAIL report per lifecycle step, including HTTP status codes, the
Content-Type the storefront media URL was served with, and the byte-identity
check between the uploaded image and the served bytes.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# ---------------------------------------------------------------------------
# 0. Disposable PostgreSQL — provisioned FIRST, because app modules bind the
#    engine from DATABASE_URL at import time.
# ---------------------------------------------------------------------------

import pgserver  # noqa: E402

_TMP = tempfile.TemporaryDirectory(prefix="pf7-pg-e2e-")
_WORK = Path(_TMP.name)
_PG_DIR = _WORK / "pg"
_MEDIA_ROOT = _WORK / "media-store"
_MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

print("=" * 78)
print("PHASE 7 E2E — disposable PostgreSQL lifecycle verification")
print("=" * 78)
print(f"[0/9] Provisioning disposable PostgreSQL in {(_PG_DIR)} …")
_server = pgserver.get_server(str(_PG_DIR))
_pg_uri = _server.get_uri()  # postgresql://postgres@localhost:<port>/postgres
_async_uri = _pg_uri.replace("postgresql://", "postgresql+asyncpg://", 1)
print(f"      cluster ready: {_pg_uri.rsplit('@', 1)[-1]} (temporary dir cluster)")

# Environment for BOTH the alembic subprocess and the app import below.
os.environ["DATABASE_URL"] = _async_uri
os.environ["STORAGE_PROVIDER"] = "local"
os.environ["LOCAL_MEDIA_ROOT"] = str(_MEDIA_ROOT)
os.environ["APP_ENV"] = "test"

# ---------------------------------------------------------------------------
# 1. Alembic upgrade head — the real migration chain, on disposable PG only
# ---------------------------------------------------------------------------

print("[1/9] alembic upgrade head against the disposable database …")
_migrate = subprocess.run(
    [sys.executable, "-m", "alembic", "upgrade", "head"],
    cwd=BACKEND_DIR,
    env={**os.environ},
    capture_output=True,
    text=True,
)
if _migrate.returncode != 0:
    print(_migrate.stdout)
    print(_migrate.stderr, file=sys.stderr)
    print("FAIL: the migration chain did not apply to a fresh PostgreSQL.", file=sys.stderr)
    sys.exit(1)
_lines = [line for line in _migrate.stdout.splitlines() if "Running upgrade" in line]
for line in _lines:
    print(f"      {line.strip()}")
if not _lines:
    print("      (alembic ran quietly — verifying head revision)")
_head = subprocess.run(
    [sys.executable, "-m", "alembic", "current"],
    cwd=BACKEND_DIR,
    env={**os.environ},
    capture_output=True,
    text=True,
)
print(f"      alembic current: {_head.stdout.strip() or '(unknown)'}")
if "(head)" not in _head.stdout:
    print("FAIL: alembic current is not at head after upgrade.", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# 2. Import the app (imports now bind to the disposable database)
# ---------------------------------------------------------------------------

import importlib  # noqa: E402

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

importlib.import_module("app.models")  # noqa: E402  registers every mapped class
from sqlalchemy import select  # noqa: E402

from app.dependencies import get_current_user  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402  (disposable engine)
from app.models.auth.user import UserModel  # noqa: E402
from app.models.catalog.product import ProductModel  # noqa: E402
from app.models.media.media_asset import MediaAssetModel  # noqa: E402
from app.models.media.product_media import ProductMediaModel  # noqa: E402
from app.models.rbac.permission import PermissionModel  # noqa: E402
from app.models.rbac.role import RoleModel  # noqa: E402
from app.models.rbac.role_permission import RolePermissionModel  # noqa: E402
from app.models.rbac.user_role import UserRoleModel  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from fastapi_cache import FastAPICache  # noqa: E402
from fastapi_cache.backends import Backend  # noqa: E402

from app.api.v1.media import router as media_router  # noqa: E402
from app.api.v1.products import router as products_router  # noqa: E402
from app.core.error_handlers import register_error_handlers  # noqa: E402

# ---------------------------------------------------------------------------
# Test payloads — signature-correct minimal image files (same bytes the unit
# suite pins, so Content-Type detection is pinned too).
# ---------------------------------------------------------------------------

WEBP_BYTES = b"RIFF" + (26).to_bytes(4, "little") + b"WEBPVP8 " + (14).to_bytes(4, "little") + b"\x2f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
AVIF_BYTES = b"\x00\x00\x00\x1c" + b"ftypavif" + b"\x00\x00\x00\x00avifmif1" + b"\x00\x00\x00\x00"
NEW_PRODUCT_ID = "PF-W-TST-E2E-0001"


class PassThroughCacheBackend(Backend):
    async def get_with_ttl(self, key):
        return 0, None

    async def get(self, key):
        return None

    async def set(self, key, value, expire=None):
        return None

    async def clear(self, namespace=None, key=None):
        return 0


STEPS: list[dict] = []


def step(name: str, ok: bool, detail: str = ""):
    STEPS.append({"step": name, "ok": ok, "detail": detail})
    print(f"      {'PASS' if ok else 'FAIL'}  {name}{(' — ' + detail) if detail else ''}")
    if not ok:
        raise AssertionError(f"{name}: {detail}")


def expect(actual, wanted, what):
    if actual != wanted:
        raise AssertionError(f"{what}: expected {wanted!r}, got {actual!r}")


# ---------------------------------------------------------------------------
# 3. Seed the isolated test fixtures (admin with the real RBAC grant graph)
# ---------------------------------------------------------------------------

import asyncio  # noqa: E402


async def seed():
    async with AsyncSessionLocal() as session:
        role = RoleModel(name="P7_E2E_CATALOGUE_ADMIN", description="phase7 e2e", is_system=False)
        session.add(role)
        permissions = {}
        for code in ("products.view", "products.manage", "media.view", "media.upload", "media.delete"):
            permission = PermissionModel(code=code, name=code, category="media", description=code)
            session.add(permission)
            permissions[code] = permission
        await session.flush()
        for code, permission in permissions.items():
            session.add(RolePermissionModel(role_id=role.id, permission_id=permission.id))

        admin = UserModel(
            email="p7-e2e-admin@pratikshyafashon.test",
            full_name="Phase7 E2E Admin",
            hashed_password="x",
            user_type="admin",
            status="ACTIVE",
            is_verified=True,
            force_password_change=False,
        )
        session.add(admin)
        await session.flush()
        session.add(UserRoleModel(user_id=admin.id, role_id=role.id))
        await session.commit()
        return admin.id


def build_app(admin_id: str) -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)
    FastAPICache.init(backend=PassThroughCacheBackend(), prefix="pf7-e2e")
    app.include_router(media_router, prefix="/api/v1")
    app.include_router(products_router, prefix="/api/v1")

    async def _as_admin():
        async with AsyncSessionLocal() as session:
            return (
                await session.execute(select(UserModel).where(UserModel.id == admin_id))
            ).scalars().first()

    # ONLY the authenticated identity is injected. The database session used
    # by every route is the REAL production `get_db` (commit-on-success),
    # bound to the disposable PostgreSQL engine.
    app.dependency_overrides[get_current_user] = _as_admin
    return app


async def probe_rows():
    async with AsyncSessionLocal() as session:
        assets = (await session.execute(select(MediaAssetModel))).scalars().all()
        mappings = (await session.execute(select(ProductMediaModel))).scalars().all()
        product = (
            await session.execute(select(ProductModel).where(ProductModel.id == NEW_PRODUCT_ID))
        ).scalars().first()
    return assets, mappings, product


async def main() -> None:
    admin_id = await seed()
    print(f"[2/9] seeded isolated test admin ({admin_id}) with real RBAC grants")

    app = build_app(admin_id)
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://pf7-e2e.test")

    # ── 3. Admin creates a NEW product through the real API ────────────────
    created = await client.post(
        "/api/v1/admin/products/draft",
        json={
            "id": NEW_PRODUCT_ID,
            "name": "Phase Seven E2E Saree",
            "sku": NEW_PRODUCT_ID,
            "category": "sarees",
            "subcategory": "silk",
            "price": 7500,
            "description": "A real product created through the admin API for the Phase 7 E2E.",
            "brand": "Pratikshya Fashon",
            "gender": "Women",
        },
    )
    expect(created.status_code, 201, "create draft status")
    expect(created.json()["product"]["status"], "DRAFT", "draft status")
    step("create product (draft)", True, "POST /api/v1/admin/products/draft → 201, status DRAFT")

    # ── 4. Upload NEW image bytes (AVIF cover + WebP gallery) ──────────────
    cover_upload = await client.post(
        f"/api/v1/media/products/{NEW_PRODUCT_ID}/objects",
        files={"file": ("e2e-cover.avif", AVIF_BYTES, "image/avif")},
    )
    expect(cover_upload.status_code, 201, "cover upload status")
    cover_key = cover_upload.json()["object"]["key"]
    expect(cover_key, f"products/{NEW_PRODUCT_ID}/e2e-cover.avif", "cover object key")

    angle_upload = await client.post(
        f"/api/v1/media/products/{NEW_PRODUCT_ID}/objects",
        files={"file": ("e2e-angle.webp", WEBP_BYTES, "image/webp")},
    )
    expect(angle_upload.status_code, 201, "angle upload status")
    angle_key = angle_upload.json()["object"]["key"]
    step(
        "upload images to local object storage",
        True,
        f"2 × 201; keys {cover_key}, {angle_key}",
    )

    # ── 5. Register + assign (primary cover + gallery) ─────────────────────
    cover_reg = await client.post(
        "/api/v1/media/register",
        data={
            "object_key": cover_key,
            "product_id": NEW_PRODUCT_ID,
            "role": "COVER",
            "sort_order": "0",
            "is_primary": "true",
        },
    )
    expect(cover_reg.status_code, 201, "cover register status")
    cover_body = cover_reg.json()
    expect(cover_body["assigned"], True, "cover assignment flag")

    angle_reg = await client.post(
        "/api/v1/media/register",
        data={"object_key": angle_key, "product_id": NEW_PRODUCT_ID, "role": "gallery", "sort_order": "1"},
    )
    expect(angle_reg.status_code, 201, "angle register status")
    cover_media_id = cover_body["media"]["id"]
    angle_media_id = angle_reg.json()["media"]["id"]
    step(
        "register objects + assign to product",
        True,
        f"2 × 201; media ids {cover_media_id[:8]}… (COVER, primary), {angle_media_id[:8]}… (gallery)",
    )

    assets, mappings, _ = await probe_rows()
    expect({row.id for row in assets}, {cover_media_id, angle_media_id}, "persisted asset rows")
    expect(len([m for m in mappings if m.product_id == NEW_PRODUCT_ID]), 2, "product-media mapping rows")
    expect(sum(1 for m in mappings if m.product_id == NEW_PRODUCT_ID and m.is_primary), 1, "exactly one primary")
    step(
        "durable rows verified in the disposable database",
        True,
        "2 MediaAsset rows, 2 ProductMedia rows, exactly 1 primary",
    )

    # ── 6. Persist the product's media fields + server re-read ─────────────
    cover_url = f"/api/v1/media/objects/{cover_key}"
    angle_url = f"/api/v1/media/objects/{angle_key}"
    patched = await client.patch(
        f"/api/v1/admin/products/{NEW_PRODUCT_ID}",
        json={
            "mediaIds": [cover_media_id, angle_media_id],
            "primaryMediaId": cover_media_id,
            "galleryMediaIds": [angle_media_id],
            "image": cover_url,
            "additionalImages": [cover_url, angle_url],
        },
    )
    expect(patched.status_code, 200, "product patch status")
    refetched = await client.get(f"/api/v1/admin/products/{NEW_PRODUCT_ID}")
    expect(refetched.status_code, 200, "admin refetch status")
    product = refetched.json()["product"]
    expect(product["image"], cover_url, "refetched image")
    expect(product["additionalImages"], [cover_url, angle_url], "refetched gallery")
    expect(product["primaryMediaId"], cover_media_id, "refetched primary")
    step("save product + server re-read agrees", True, "PATCH → 200, GET → 200 with the registered references")

    media_set = await client.get(f"/api/v1/media/products/{NEW_PRODUCT_ID}/media-set")
    expect(media_set.status_code, 200, "media-set status")
    expect(media_set.json()["mediaRecordsAvailable"], True, "mediaRecordsAvailable")
    expect(media_set.json()["primaryMediaUrl"], cover_url, "primaryMediaUrl")
    expect(
        [item["objectKey"] for item in media_set.json()["mediaItems"]],
        [cover_key, angle_key],
        "registered media-set order",
    )
    step("media-set read model dual-read verified", True, "mediaRecordsAvailable=true, primary-first order")

    # ── 7. Publish through the real gated workflow ─────────────────────────
    submitted = await client.post(f"/api/v1/products/{NEW_PRODUCT_ID}/submit-review")
    expect(submitted.status_code, 200, "submit-review status")
    approved = await client.post(f"/api/v1/admin/products/{NEW_PRODUCT_ID}/approve")
    expect(approved.status_code, 200, "approve status")
    published = await client.post(f"/api/v1/admin/products/{NEW_PRODUCT_ID}/publish")
    expect(published.status_code, 200, "publish status")
    expect(published.json()["product"]["status"], "PUBLISHED", "published status")
    expect(published.json()["product"]["published"], True, "published flag")
    step("submit → approve → publish", True, "3 × 200; status PUBLISHED, published=true")

    # ── 8. Storefront resolves /api/v1/media/objects/... references ────────
    storefront = await client.get(f"/api/v1/products/{NEW_PRODUCT_ID}")
    expect(storefront.status_code, 200, "storefront status")
    detail = storefront.json()["product"]
    expect(detail["image"], cover_url, "storefront image")
    expect(detail["additionalImages"], [cover_url, angle_url], "storefront gallery")
    step("storefront product resolves canonical media URLs", True, f"image = {cover_url}")

    # ── 9. The canonical URLs return the real bytes over HTTP ──────────────
    served_cover = await client.get(cover_url)
    expect(served_cover.status_code, 200, "cover URL status")
    expect(served_cover.headers["content-type"], "image/avif", "cover Content-Type")
    expect(served_cover.content, AVIF_BYTES, "cover byte-identity")

    served_angle = await client.get(angle_url)
    expect(served_angle.status_code, 200, "angle URL status")
    expect(served_angle.headers["content-type"], "image/webp", "angle Content-Type")
    expect(served_angle.content, WEBP_BYTES, "angle byte-identity")
    step(
        "media URLs serve HTTP 200 with exact bytes + Content-Type",
        True,
        "image/avif 200 (= uploaded bytes); image/webp 200 (= uploaded bytes)",
    )


try:
    asyncio.run(main())
except Exception:
    print()
    print("E2E FAILED:")
    traceback.print_exc()
    sys.exit(2)
finally:
    print(f"[x] tearing down the disposable PostgreSQL cluster ({_PG_DIR})")
    try:
        _server.cleanup()
    except Exception:
        pass
    _TMP.cleanup()

print()
print("=" * 78)
print(f"PHASE 7 E2E RESULT: {len(STEPS)}/{len(STEPS)} steps PASSED")
print("=" * 78)
for index, entry in enumerate(STEPS, start=1):
    print(f"  {index}. {entry['step']}: {'PASS' if entry['ok'] else 'FAIL'} — {entry['detail']}")
print()
print("Constraints honored: disposable PostgreSQL only (cluster removed above),")
print("STORAGE_PROVIDER=local in a temporary directory, no AWS/S3, the company")
print("database was never referenced, and no tracked repository file was touched.")
print()
print("E2E PASSED")
