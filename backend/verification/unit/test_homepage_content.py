"""Database-free homepage contracts. No SQLite or PostgreSQL connections.

Fake sessions prove orchestration/denial paths, not SQL durability or locking.
Offline Alembic renders SQL strings only; it never imports alembic/env.py.
"""
import ast
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, Mock, patch

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable, CreateIndex

import app.models
from app.api.v1.homepage import router, hero_row
from app.core.exceptions import AppException, BusinessLogicException, ConflictException, ForbiddenException, NotFoundException
from app.dependencies import get_db, get_current_admin, get_current_employee, get_current_user
from app.models.media.homepage_section import HomepageSectionModel as Section, HomepageSectionItemModel as Item
from app.schemas.catalog.product import StorefrontProduct
from app.schemas.media.homepage import REGISTRY, GROUPS, ItemCreate, ItemPatch, SectionWrite, ReorderDTO, HeroCreate, safe_cta
from app.schemas.media.marketing import MarketingMediaCreate, MarketingMediaUpdate
from app.services.media.homepage_content_service import HomepageContentService, asset_projection, registered_asset, safe_product, grant
from app.services.media.marketing_media_service import MarketingMediaService

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def forbid_connections(monkeypatch):
    # Fail closed if a supposedly database-free regression accidentally connects.
    import sqlalchemy.engine
    import asyncpg
    import psycopg2
    def blocked(*args, **kwargs):
        raise AssertionError("Database connection forbidden in this suite")
    monkeypatch.setattr(sqlalchemy.engine.Engine, "connect", blocked)
    monkeypatch.setattr(asyncpg, "connect", blocked)
    monkeypatch.setattr(psycopg2, "connect", blocked)


def result(rows):
    return NS(scalars=lambda: NS(all=lambda: rows, first=lambda: rows[0] if rows else None))


def session():
    return NS(execute=AsyncMock(), add=Mock(), flush=AsyncMock(), commit=AsyncMock(), rollback=AsyncMock(), delete=AsyncMock(), refresh=AsyncMock())


def item(kind="TEXT", **values):
    defaults = dict(id="entry", section_id="section", slot_key="intro", content_type=kind, sort_order=0, is_active=True, title="Saved copy", eyebrow=None, subtitle=None, cta_label=None, cta_href=None, alt_text=None, media_asset_id=None, product_id=None)
    defaults.update(values)
    return Item(**defaults)


@pytest.mark.parametrize("bad", ["https://example.com", "javascript:alert(1)", "data:x", "blob:x", "//example.com", "/%2fexample.com", "/%5cevil", "/%252fevil", "/x\n", "/hello world"])
def test_unsafe_cta(bad):
    with pytest.raises(ValueError): safe_cta(bad)


@pytest.mark.parametrize("value", [None, "", "/products", "/products?category=sarees", "/pages/returns#policy"])
def test_safe_cta(value):
    assert safe_cta(value) == value


@pytest.mark.parametrize("extra", [{"price": 1}, {"published": True}, {"objectKey": "hero/guessed.avif"}, {"product": {"id": "fake"}}, {"image": "data:x"}, {"isActive": None}])
def test_extra_and_null_rejected(extra):
    with pytest.raises(ValidationError): ItemCreate(expectedRevision=1, slotKey="intro", contentType="TEXT", title="Copy", **extra)


@pytest.mark.parametrize("kind,refs", [("MEDIA", {}), ("PRODUCT", {}), ("TEXT", {"productId": "genuine"}), ("PRODUCT", {"productId": "genuine", "title": "Price override"}), ("TEXT", {"title": ""}), ("MEDIA", {"mediaAssetId": "real", "productId": "real"})])
def test_reference_shape(kind, refs):
    with pytest.raises(ValidationError): ItemCreate(expectedRevision=1, slotKey="intro", contentType=kind, **refs)


def test_registry_and_defaults():
    assert len(REGISTRY) == 11 and "hero" not in REGISTRY
    assert ItemCreate(expectedRevision=1, slotKey="products", contentType="PRODUCT", productId="KID-007").is_active is False
    assert SectionWrite(expectedRevision=0).is_active is False
    assert len(REGISTRY["trust"]) == 5
    assert GROUPS[("sarees", "lookbook", "MEDIA")] == ("lookbook-1", "lookbook-2", "lookbook-3")


def test_immutable_patch_and_hero_scope():
    for key in ("slotKey", "contentType", "sectionId", "sortOrder"):
        with pytest.raises(ValidationError): ItemPatch(expectedRevision=1, **{key: "other"})
    with pytest.raises(ValidationError): HeroCreate(mediaAssetId="real", placement="EDITORIAL")


def test_ddl_models_and_offline_upgrade_downgrade():
    path = ROOT / "alembic/versions/p3hp20261016a_homepage_sections.py"
    spec = importlib.util.spec_from_file_location("homepage_revision", path)
    migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
    assert migration.down_revision == "l1a2b3c4d5e1"
    buf = io.StringIO()
    ctx = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": buf})
    with Operations.context(ctx):
        migration.upgrade(); migration.downgrade(); migration.upgrade()
    sql = buf.getvalue()
    assert sql.count("CREATE TABLE pratikshya.homepage_section (") == 2
    assert sql.index("DROP TABLE pratikshya.homepage_section_item") < sql.index("DROP TABLE pratikshya.homepage_section;")
    assert "INSERT " not in sql and "UPDATE " not in sql and "ALTER TABLE" not in sql
    assert "ON DELETE CASCADE" in sql and "ON DELETE SET NULL" in sql
    for model in (Section, Item):
        ddl = str(CreateTable(model.__table__).compile(dialect=postgresql.dialect()))
        assert f"CREATE TABLE pratikshya.{model.__tablename__}" in ddl
        for constraint in model.__table__.constraints:
            if constraint.name: assert constraint.name in sql
        for index in model.__table__.indexes:
            assert index.name in sql
    singleton = next(i for i in Item.__table__.indexes if i.name == "uq_homepage_singleton_slot")
    assert "WHERE content_type <> 'PRODUCT'" in str(CreateIndex(singleton).compile(dialect=postgresql.dialect()))


def test_migration_graph_one_new_head():
    revisions = {}
    for path in (ROOT / "alembic/versions").glob("*.py"):
        values = {}
        for node in ast.parse(path.read_text()).body:
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                for target in node.targets if isinstance(node, ast.Assign) else [node.target]:
                    if isinstance(target, ast.Name) and target.id in ("revision", "down_revision"):
                        values[target.id] = ast.literal_eval(node.value)
        if "revision" in values:
            assert values["revision"] not in revisions
            revisions[values["revision"]] = values.get("down_revision")
    refs = {v for p in revisions.values() for v in (p if isinstance(p, tuple) else (p,)) if v}
    assert refs <= revisions.keys()
    heads = revisions.keys() - refs
    assert len(heads) == 1, f"exactly one migration head, found {sorted(heads)}"
    # The head advances whenever a later additive revision is merged
    # (p3hp20261016a → w3b4c5d6e7f8 adds the marketing mobile asset column).
    # Update this constant only together with a reviewed revision.
    assert heads == {"w3b4c5d6e7f8"}


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["TEXT", "MEDIA", "PRODUCT"])
async def test_missing_foreign_entry_rollback(kind):
    db = session(); service = HomepageContentService(db)
    service.section = AsyncMock(return_value=Section(id="section", section_key="sarees", revision=1))
    service.items = AsyncMock(return_value=[])
    with patch("app.services.media.homepage_content_service.grant", new=AsyncMock()):
        with pytest.raises(NotFoundException):
            await service.write("sarees", "patch", ItemPatch(expectedRevision=1, title="Changed"), NS(id="actor", user_type="admin"), "foreign")
    db.commit.assert_not_awaited(); db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_stale_revision_and_incomplete_reorder():
    for operation, payload in [("configure", SectionWrite(expectedRevision=0)), ("reorder", ReorderDTO(expectedRevision=1, slotKey="products", contentType="PRODUCT", itemIds=["foreign"]))]:
        db = session(); service = HomepageContentService(db)
        service.section = AsyncMock(return_value=Section(id="section", section_key="sarees", revision=1))
        service.items = AsyncMock(return_value=[item("PRODUCT", slot_key="products", title=None, product_id="real")])
        with patch("app.services.media.homepage_content_service.grant", new=AsyncMock()):
            with pytest.raises(ConflictException): await service.write("sarees", operation, payload, NS(id="actor", user_type="admin"))
        db.commit.assert_not_awaited(); db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_text_save_and_reorder_orchestration():
    db = session(); service = HomepageContentService(db)
    section = Section(id="section", section_key="trust", revision=1, is_active=True)
    rows = [item(slot_key="delivery", id="a"), item(slot_key="help", id="b", sort_order=1)]
    service.section = AsyncMock(return_value=section); service.items = AsyncMock(return_value=rows)
    service.get = AsyncMock(return_value={"key": "trust", "revision": 2})
    with patch("app.services.media.homepage_content_service.grant", new=AsyncMock()):
        response = await service.write("trust", "reorder", ReorderDTO(expectedRevision=1, slotKey="trust-items", contentType="TEXT", itemIds=["b", "a"]), NS(id="actor", user_type="employee"))
    assert response["section"]["revision"] == section.revision == 2
    assert [r.sort_order for r in rows] == [1, 0]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_section_activation_checks_media_authority_before_publish():
    db = session(); service = HomepageContentService(db)
    section = Section(id="section", section_key="men", revision=1, is_active=False)
    service.section = AsyncMock(return_value=section)
    service.items = AsyncMock(return_value=[item("MEDIA", title=None, media_asset_id="asset", slot_key="campaign")])
    async def permissions(actor, db, *codes):
        if "media.assign" in codes: raise ForbiddenException()
    with patch("app.services.media.homepage_content_service.grant", side_effect=permissions):
        with pytest.raises(ForbiddenException): await service.write("men", "configure", SectionWrite(expectedRevision=1, isActive=True), NS(id="actor", user_type="employee"))
    assert not section.is_active
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [True, False])
async def test_live_product_filter_and_inactive_states(public):
    db = session()
    sections = [Section(id="s", section_key="sarees", revision=2, is_active=True), Section(id="n", section_key="newsletter", revision=1, is_active=False)]
    rows = [item("PRODUCT", id="p", section_id="s", slot_key="products", title=None, product_id="unpublished"), item(section_id="n")]
    db.execute.side_effect = [result(sections), result(rows)]
    with patch("app.services.media.homepage_content_service.ProductService.homepage_products_by_ids", new=AsyncMock(return_value={})) as lookup:
        data = await HomepageContentService(db).content(public=public)
    assert len(data["sections"]) == 12
    sarees = next(s for s in data["sections"] if s["key"] == "sarees")
    newsletter = next(s for s in data["sections"] if s["key"] == "newsletter")
    assert newsletter["state"] == "inactive"
    if public:
        assert sarees["state"] == "empty" and sarees["items"] == [] and newsletter["items"] == []
    else: assert sarees["items"][0]["warning"] == "product_not_public"
    lookup.assert_awaited_once_with(["unpublished"])


@pytest.mark.asyncio
async def test_missing_has_no_get_side_write():
    db = session(); db.execute.side_effect = [result([]), result([])]
    data = await HomepageContentService(db).content(public=True)
    assert all(s["state"] == "missing" and s["configured"] is False for s in data["sections"][1:])
    db.add.assert_not_called(); db.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("override", [{"status": "deleted"}, {"mime_type": "video/mp4"}, {"object_key": "../bad"}, {"media_type": "video"}])
async def test_invalid_assets_never_public(override):
    values = dict(id="asset", object_key="hero/registered.avif", status="uploaded", media_type="image", mime_type="image/avif"); values.update(override)
    assert await asset_projection(session(), NS(**values)) is None


@pytest.mark.asyncio
async def test_missing_object_and_storage_outage_are_different():
    asset = NS(id="asset", object_key="hero/registered.avif", status="uploaded", media_type="image", mime_type="image/avif")
    with patch("app.services.media.homepage_content_service.MediaService.object_exists", return_value=False):
        assert await asset_projection(session(), asset) is None
    with patch("app.services.media.homepage_content_service.MediaService.object_exists", side_effect=RuntimeError("offline")):
        with pytest.raises(AppException) as error: await asset_projection(session(), asset)
        assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_registered_identity_must_match_key():
    db = session(); db.execute.return_value = result([NS(id="asset", object_key="hero/actual.avif")])
    with pytest.raises(BusinessLogicException): await registered_asset(db, "asset", "hero/fabricated.avif")


def test_inline_product_media_suppressed_not_replaced():
    data = safe_product(StorefrontProduct(id="real", name="Real", image="data:image/x", hoverImage="blob:x", additionalImages=["blob:bad", "/api/v1/media/objects/hero/real.avif"]))
    assert data["image"] == data["hoverImage"] == ""
    assert data["additionalImages"] == ["/api/v1/media/objects/hero/real.avif"]


@pytest.mark.asyncio
async def test_legacy_copy_update_does_not_require_re_registration():
    db = session(); service = MarketingMediaService(db)
    row = NS(id="legacy", placement="HOME_HERO", object_key="hero/legacy.avif", media_asset_id=None, title="Old")
    service.get_by_id = AsyncMock(return_value=row)
    with patch("app.services.media.homepage_content_service.registered_asset", new=AsyncMock()) as validate:
        await service.update("legacy", MarketingMediaUpdate(title="Changed"))
    validate.assert_not_awaited(); db.commit.assert_awaited_once()
    assert row.title == "Changed"


@pytest.mark.asyncio
async def test_new_hero_key_requires_registered_asset():
    db = session(); db.execute.return_value = result([])
    with pytest.raises(BusinessLogicException): await MarketingMediaService(db).create(MarketingMediaCreate(objectKey="hero/guessed.avif"))
    db.add.assert_not_called(); db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_entering_hero_from_other_placement_is_validated():
    db = session(); service = MarketingMediaService(db)
    row = NS(id="legacy", placement="EDITORIAL", object_key="hero/legacy.avif", media_asset_id=None)
    service.get_by_id = AsyncMock(return_value=row)
    with patch("app.services.media.homepage_content_service.registered_asset", new=AsyncMock(side_effect=BusinessLogicException("Unregistered"))):
        with pytest.raises(BusinessLogicException): await service.update("legacy", MarketingMediaUpdate(placement="HOME_HERO"))
    assert row.placement == "EDITORIAL"; db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_employee_hero_cannot_reach_nonhero_id():
    service = NS(get_by_id=AsyncMock(return_value=NS(placement="EDITORIAL")))
    with pytest.raises(NotFoundException): await hero_row(service, "foreign")


@pytest.mark.asyncio
async def test_grant_is_not_customer_type_boundary_bypass():
    with pytest.raises(ForbiddenException): await grant(NS(user_type="customer"), session(), "marketing.view")


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_type,guard", [("employee", get_current_admin), ("admin", get_current_employee), ("customer", get_current_admin), ("customer", get_current_employee)])
async def test_real_workspace_guards(actor_type, guard):
    with pytest.raises(ForbiddenException): await guard(NS(user_type=actor_type))


def test_routes_have_explicit_workspace_dependencies():
    assert len(router.routes) == 20
    for route in router.routes:
        calls = {d.call for d in route.dependant.dependencies}
        assert (get_current_employee if route.path.startswith('/employee/') else get_current_admin) in calls


def test_public_home_legacy_fields_retained():
    from app.schemas.catalog.explore import HomeResponse
    aliases = {f.alias or name for name, f in HomeResponse.model_fields.items()}
    assert aliases == {"ok", "heroSlides", "newArrivals", "categories", "sareeEdit", "brideGroomEdit", "celebrationEdit", "saleBanner", "homepageContent"}

@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["SUSPENDED", "DEACTIVATED", "INACTIVE"])
async def test_current_user_status_denied_before_homepage(status):
    db = session(); db.execute.return_value = result([NS(id="staff", status=status)])
    with pytest.raises(ForbiddenException): await get_current_user({"sub": "staff"}, db)
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_canonical_grant_engine_admin_employee_wildcard_and_unassigned():
    from app.core.rbac import expand_effective_permissions
    from app import dependencies
    for actor_type in ("admin", "employee"):
        actor = NS(id="actor", user_type=actor_type, account_level="ADMIN" if actor_type == "admin" else "EMPLOYEE")
        for raw, succeeds in [(["marketing.view"], False), (["marketing.view", "marketing.manage"], True), (["*"], True)]:
            resolved = list(expand_effective_permissions(raw))
            with patch.object(dependencies, "get_user_roles_and_permissions", new=AsyncMock(return_value=(["EDITOR"], resolved))):
                if succeeds: await grant(actor, session(), "marketing.view", "marketing.manage")
                else:
                    with pytest.raises(ForbiddenException): await grant(actor, session(), "marketing.view", "marketing.manage")
    actor = NS(id="unassigned", user_type="admin", account_level=None, custom_permissions=None)
    db = session(); db.execute.return_value = NS(scalar_one=lambda: 1)
    with patch.object(dependencies, "get_user_roles_and_permissions", new=AsyncMock(return_value=([], []))):
        with pytest.raises(ForbiddenException): await grant(actor, db, "marketing.view")
    with patch.object(dependencies, "get_user_roles_and_permissions", new=AsyncMock(return_value=([], []))):
        await grant(NS(id="super", user_type="admin", account_level="SUPER_ADMIN"), session(), "marketing.manage")


@pytest.mark.parametrize("actor_type,prefix,permissions,method,path,body,expected", [
    ("employee", "admin", ["*"], "get", "/sections", None, 403),
    ("admin", "employee", ["*"], "get", "/sections", None, 403),
    ("customer", "admin", ["*"], "put", "/sections/men", {"expectedRevision": 0}, 403),
    ("customer", "employee", ["*"], "get", "/sections", None, 403),
    ("employee", "employee", [], "get", "/sections", None, 403),
    ("admin", "admin", [], "get", "/sections", None, 403),
    ("employee", "employee", ["marketing.view"], "put", "/sections/men", {"expectedRevision": 0}, 403),
    ("employee", "employee", ["marketing.view"], "post", "/sections/men/items", {"expectedRevision": 1,"contentType":"TEXT","slotKey":"intro","title":"Copy"}, 403),
    ("employee", "employee", ["marketing.view", "marketing.manage"], "post", "/hero/items", {"mediaAssetId":"asset"}, 403),
    ("employee", "employee", ["marketing.view", "marketing.manage", "media.view", "media.assign"], "delete", "/hero/items/other", None, 403),
    ("employee", "employee", ["marketing.view"], "get", "/media-assets", None, 403),
    ("employee", "employee", ["marketing.view"], "get", "/sections", None, 200),
    ("admin", "admin", ["marketing.view"], "get", "/sections", None, 200),
])
def test_http_workspace_grants_no_forbidden_mutation(actor_type, prefix, permissions, method, path, body, expected):
    from fastapi.responses import JSONResponse
    from app.core.rbac import expand_effective_permissions
    from app import dependencies
    db = session()
    db.execute.side_effect = AssertionError("Unauthorized DB access")
    actor = NS(id="actor", user_type=actor_type, account_level="ADMIN" if actor_type == "admin" else "EMPLOYEE")
    application = FastAPI(); application.include_router(router, prefix="/api/v1")
    application.dependency_overrides[get_db] = lambda: db
    application.dependency_overrides[get_current_user] = lambda: actor
    @application.exception_handler(AppException)
    async def errors(request, error):
        return JSONResponse({"error": {"code": error.error_code, "message": error.message}}, status_code=error.status_code)
    resolved = list(expand_effective_permissions(permissions))
    with patch.object(dependencies, "get_user_roles_and_permissions", new=AsyncMock(return_value=(["EDITOR"], resolved))), patch.object(HomepageContentService, "content", new=AsyncMock(return_value={"sections": []})):
        with TestClient(application) as client:
            response = client.request(method, f"/api/v1/{prefix}/homepage{path}", **({"json": body} if body else {}))
    assert response.status_code == expected
    db.add.assert_not_called(); db.commit.assert_not_awaited(); db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_fresh_product_projection_does_not_call_cached_detail():
    from app.services.catalog.product_service import ProductService
    from app.models.catalog.product import ProductModel
    db = session(); product = NS(id="real", category="sarees", subcategory="active")
    db.execute.return_value = result([product])
    service = ProductService(db)
    service._visibility_maps = AsyncMock(return_value=({"sarees": "ACTIVE"}, {"active": "ACTIVE"}))
    service._registered_media_map = AsyncMock(return_value={})
    service._collection_membership_names = AsyncMock(return_value={})
    service._subcategory_name_map = AsyncMock(return_value={})
    service._to_storefront = Mock(return_value=StorefrontProduct(id="real", price=1234))
    service.get_storefront_product = AsyncMock(side_effect=AssertionError("Cached detail is not an eligibility gate"))
    projected = await service.homepage_products_by_ids(["real"])
    assert projected["real"].price == 1234
    sql = str(db.execute.call_args.args[0].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "catalog_product.id IN ('real')" in sql and "catalog_product.status = 'PUBLISHED'" in sql and "catalog_product.published IS true" in sql
    service.get_storefront_product.assert_not_awaited()
    assert not service._taxonomy_visible(product, {"sarees": "ARCHIVED"}, {})
    assert service._taxonomy_visible(product, {}, {})  # deliberate legacy compatibility

@pytest.mark.asyncio
@pytest.mark.parametrize("hero_state", ["active", "inactive", "missing", "unavailable"])
@pytest.mark.parametrize("new_available", [True, False])
async def test_additive_home_preserves_existing_hero_semantics(hero_state, new_available):
    from contextlib import asynccontextmanager
    from app.services.catalog.explore_service import ExploreService
    from app.schemas.catalog.explore import HeroSlide
    from app.schemas.media.homepage import HomepageContentPublic
    db = session()
    @asynccontextmanager
    async def nested():
        yield
    db.begin_nested = nested
    service = ExploreService(db)
    active = HeroSlide(id="real-hero", image="/api/v1/media/objects/hero/real.avif")
    # STEP-2: no canonical fallback — zero active rows (missing/inactive) and a
    # failed read (unavailable) all resolve to an honest empty hero list.
    service._build_hero_slides_from_db = AsyncMock(return_value=[active] if hero_state == "active" else [])
    service._select_products = AsyncMock(return_value=[])
    service._build_category_cards = AsyncMock(return_value=[])
    public = {"version": 1, "status": "ready", "sections": [{"key": "hero", "source": "heroSlides", "state": "delegated"}, *[{"key": k, "source": "legacy", "state": "missing", "configured": False, "items": []} for k in REGISTRY]]}
    extension = AsyncMock(return_value=public) if new_available else AsyncMock(side_effect=RuntimeError("new schema unavailable"))
    with patch.object(HomepageContentService, "content", new=extension):
        home = await service.get_home()
    assert [slide.id for slide in home.hero_slides] == (["real-hero"] if hero_state == "active" else [])
    assert home.homepage_content.status == ("ready" if new_available else "unavailable")
    assert len(home.homepage_content.sections) == 12
    assert home.saree_edit.id == "saree-edit" and home.sale_banner.id == "sale-banner"


def test_public_dto_forbids_audit_leakage():
    from app.schemas.media.homepage import PublicItem
    with pytest.raises(ValidationError): PublicItem(id="row", slotKey="intro", contentType="TEXT", sortOrder=0, createdBy="private-user")

@pytest.mark.asyncio
async def test_unknown_empty_reorder_cannot_create_arbitrary_slot():
    db = session(); service = HomepageContentService(db)
    service.section = AsyncMock(return_value=Section(id="section", section_key="men", revision=1))
    service.items = AsyncMock(return_value=[])
    with patch("app.services.media.homepage_content_service.grant", new=AsyncMock()):
        with pytest.raises(BusinessLogicException): await service.write("men", "reorder", ReorderDTO(expectedRevision=1, slotKey="invented", contentType="PRODUCT", itemIds=[]), NS(id="actor", user_type="admin"))
    db.commit.assert_not_awaited(); db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_public_inactive_media_does_not_contact_storage():
    db = session(); db.execute.side_effect = [result([Section(id="s", section_key="men", revision=1, is_active=False)]), result([item("MEDIA", section_id="s", slot_key="campaign", title=None, media_asset_id="asset")])]
    with patch("app.services.media.homepage_content_service.asset_projection", new=AsyncMock(side_effect=AssertionError("Inactive media must not contact storage"))):
        data = await HomepageContentService(db).content(public=True)
    men = next(s for s in data["sections"] if s["key"] == "men")
    assert men["state"] == "inactive" and not men["items"]


@pytest.mark.asyncio
async def test_missing_tables_on_staff_read_report_unavailable():
    from app.api.v1.homepage import read_section_content
    from sqlalchemy.exc import SQLAlchemyError
    db = session()
    with patch.object(HomepageContentService, "content", new=AsyncMock(side_effect=SQLAlchemyError("missing table"))):
        with pytest.raises(AppException) as error: await read_section_content(db)
    assert error.value.status_code == 503
    db.rollback.assert_awaited_once()

@pytest.mark.asyncio
async def test_unknown_stored_slot_is_warning_not_public_renderer_input():
    db = session(); db.execute.side_effect = [result([Section(id="s", section_key="trust", revision=1, is_active=True)]), result([item(section_id="s", slot_key="unknown-icon")])]
    data = await HomepageContentService(db).content(public=True)
    trust = next(s for s in data["sections"] if s["key"] == "trust")
    assert trust["state"] == "empty" and trust["items"] == []
