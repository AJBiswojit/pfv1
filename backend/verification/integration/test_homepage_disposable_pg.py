"""OPT-IN PostgreSQL migration/persistence acceptance. NEVER uses DATABASE_URL.

No target was provided in the implementation sandbox: this test must SKIP.
An operator must separately provision/authorize the exact disposable target at
l1a2b3c4d5e1. Do not run historical migrations or stamp a target to satisfy this.
Required DB comment: pfv1:homepage:disposable:p3hp20261016a.
"""
import importlib.util
import os
from pathlib import Path
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from alembic.migration import MigrationContext
from alembic.operations import Operations

PARENT = "l1a2b3c4d5e1"
REVISION = "p3hp20261016a"
MARKER = "pfv1:homepage:disposable:p3hp20261016a"


def verified_target():
    """Read-only connection is the FIRST contact with a supplied target."""
    raw = os.environ.get("HOMEPAGE_DISPOSABLE_TEST_URL")
    if not raw:
        pytest.skip("No explicitly identified disposable PostgreSQL target; no database connection attempted")
    expected = os.environ.get("HOMEPAGE_DISPOSABLE_TEST_DATABASE", "")
    url = make_url(raw)
    if (os.environ.get("HOMEPAGE_DISPOSABLE_TEST_APPROVED") != "YES" or
        url.get_backend_name() != "postgresql" or url.host not in ("localhost", "127.0.0.1", "::1") or
        url.database != expected or not re.fullmatch(r"pfv1_homepage_disposable_[a-z0-9_]+", expected)):
        pytest.fail("STOP: target is not explicitly approved/named as a local disposable homepage test database")
    import psycopg2
    # Enforce read-only from startup, not just after opening a default session.
    conn = psycopg2.connect(url.set(drivername="postgresql").render_as_string(hide_password=False), options="-c default_transaction_read_only=on", connect_timeout=5)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT current_database(), current_user, inet_server_addr()::text, inet_server_port(), current_setting('transaction_read_only'), shobj_description(oid, 'pg_database') FROM pg_database WHERE datname=current_database()")
            identity = cursor.fetchone()
            if not identity or identity[0] != expected or identity[4] != "on" or identity[5] != MARKER:
                pytest.fail("STOP: read-only target identity/disposable marker verification failed")
            cursor.execute("SELECT version_num FROM pratikshya.pratikshya_alembic_version")
            if cursor.fetchall() != [(PARENT,)]:
                pytest.fail("STOP: target is not at expected parent revision; no upgrade/downgrade/stamp permitted")
            cursor.execute("SELECT to_regclass('pratikshya.homepage_section'), to_regclass('pratikshya.homepage_section_item'), to_regclass('pratikshya.users'), to_regclass('pratikshya.catalog_product'), to_regclass('pratikshya.media_media_asset')")
            shape = cursor.fetchone()
            if shape[:2] != (None, None) or not all(shape[2:]):
                pytest.fail("STOP: target schema drift; no database mutation permitted")
            print(f"Verified disposable identity (read-only): database={identity[0]}, user={identity[1]}, server={identity[2]}:{identity[3]}, revision={PARENT}")
            return url.set(drivername="postgresql+asyncpg"), identity
    finally:
        conn.rollback()
        conn.close()


@pytest.mark.asyncio
async def test_verified_postgres_upgrade_persistence_downgrade_reupgrade():
    url, identity = verified_target()
    # Imports below do not initialize schema or seed anything.
    from app.schemas.media.homepage import SectionWrite, ItemCreate, ReorderDTO, RevisionDTO
    from app.services.media.homepage_content_service import HomepageContentService
    path = Path(__file__).resolve().parents[2] / "alembic/versions/p3hp20261016a_homepage_sections.py"
    spec = importlib.util.spec_from_file_location("homepage_pg_revision", path)
    revision = importlib.util.module_from_spec(spec); spec.loader.exec_module(revision)
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def migrate(up, expected):
        async with engine.begin() as conn:
            actual = (await conn.execute(text("SELECT current_database(), current_user, inet_server_addr()::text, inet_server_port(), shobj_description(oid, 'pg_database') FROM pg_database WHERE datname=current_database()"))).one()
            assert tuple(actual) == (*identity[:4], MARKER), "STOP: target identity changed"
            current = (await conn.execute(text("SELECT version_num FROM pratikshya.pratikshya_alembic_version FOR UPDATE"))).scalars().all()
            assert current == [expected], "STOP: revision changed"
            def apply(sync):
                # Only this exact revision; bypass online env.py's schema DDL.
                with Operations.context(MigrationContext.configure(sync)):
                    (revision.upgrade if up else revision.downgrade)()
            await conn.run_sync(apply)
            await conn.execute(text("UPDATE pratikshya.pratikshya_alembic_version SET version_num=:next WHERE version_num=:previous"), {"next": REVISION if up else PARENT, "previous": expected})

    async def legacy_fingerprints():
        async with engine.connect() as conn:
            return {table: (await conn.execute(text(f"SELECT count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM pratikshya.{table} t"))).one() for table in ("media_marketing_media", "catalog_product", "media_media_asset", "media_product_media", "users")}

    try:
        before = await legacy_fingerprints()
        await migrate(True, PARENT)
        # Real ORM/service writes, followed by fresh-session reads. Grant resolver
        # mocked only here: real DB-backed RBAC is NOT claimed by this test.
        actor = SimpleNamespace(id=None, user_type="admin")
        async def write(operation, payload, item_id=None):
            async with sessions() as db:
                return (await HomepageContentService(db).write("trust", operation, payload, actor, item_id))["section"]
        with patch("app.services.media.homepage_content_service.grant", new=AsyncMock()):
            section = await write("configure", SectionWrite(expectedRevision=0))
            section = await write("create", ItemCreate(expectedRevision=1, slotKey="delivery", contentType="TEXT", title="Delivery", isActive=True))
            first = section["items"][0]["id"]
            section = await write("create", ItemCreate(expectedRevision=2, slotKey="help", contentType="TEXT", title="Help", isActive=True))
            second = next(r["id"] for r in section["items"] if r["id"] != first)
            await write("configure", SectionWrite(expectedRevision=3, isActive=True))
            await write("reorder", ReorderDTO(expectedRevision=4, slotKey="trust-items", contentType="TEXT", itemIds=[second, first]))
            async with sessions() as db:
                public = await HomepageContentService(db).content(public=True)
                trust = next(s for s in public["sections"] if s["key"] == "trust")
                assert [r["id"] for r in trust["items"]] == [second, first]
            await write("delete", RevisionDTO(expectedRevision=5), second)
            await write("configure", SectionWrite(expectedRevision=6, isActive=False))
            await write("delete", RevisionDTO(expectedRevision=7), first)
            await write("configure", SectionWrite(expectedRevision=8, isActive=True))
            async with sessions() as db:
                trust = next(s for s in (await HomepageContentService(db).content(public=True))["sections"] if s["key"] == "trust")
                assert trust["configured"] and trust["state"] == "empty" and trust["items"] == []
        await migrate(False, REVISION)
        async with engine.connect() as conn:
            assert (await conn.execute(text("SELECT to_regclass('pratikshya.homepage_section')"))).scalar() is None
        await migrate(True, PARENT)
        assert await legacy_fingerprints() == before
        async with sessions() as db:
            assert all(s["state"] == "missing" for s in (await HomepageContentService(db).content(public=True))["sections"][1:])
    finally:
        # No automatic historical migration, database drop or cleanup on failure.
        await engine.dispose()
