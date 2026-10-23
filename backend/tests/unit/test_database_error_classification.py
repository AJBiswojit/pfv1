"""
Canonical database error classification (schema vs query vs unavailable).

The media-deletion defect that returned ``503 DATABASE_SCHEMA_ERROR`` was a
PostgreSQL *type* error — ``operator does not exist: jsonb = character
varying`` — that the old substring check (``"does not exist"``) reported as a
missing table or column with migration advice.

These tests pin the classification end to end through the real
``register_error_handlers`` and the canonical envelope:

  * ``undefined_table``   (42P01) → 503 DATABASE_SCHEMA_ERROR + migration advice
  * ``undefined_column``  (42703) → 503 DATABASE_SCHEMA_ERROR + migration advice
  * operator/type error   (42883) → 500 DATABASE_QUERY_ERROR, **no** migration
                                     advice, no SQL or schema names leaked
  * connection failure             → 503 DATABASE_UNAVAILABLE (existing fallback)
  * unrelated DBAPI failure        → 503 DATABASE_UNAVAILABLE (existing fallback)

No database is involved: an isolated FastAPI app raises the SQLAlchemy
exceptions directly.
"""

from __future__ import annotations

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError, OperationalError, ProgrammingError

from app.core.error_handlers import (
    classify_database_error,
    postgres_sqlstate,
    register_error_handlers,
)


class DriverError(Exception):
    """Stand-in for an asyncpg/psycopg2 exception.

    ``sqlstate`` mirrors asyncpg; ``pgcode`` mirrors psycopg2. Passing both is
    harmless — the classifier reads the first one it finds.
    """

    def __init__(self, message: str, sqlstate: str | None = None):
        super().__init__(message)
        if sqlstate is not None:
            self.sqlstate = sqlstate
            self.pgcode = sqlstate


def _programming(message: str, sqlstate: str | None, sql: str = "SELECT 1") -> ProgrammingError:
    return ProgrammingError(sql, {}, DriverError(message, sqlstate))


TABLE_MISSING = _programming(
    'relation "pratikshya.homepage_section" does not exist', "42P01",
    "SELECT * FROM pratikshya.homepage_section",
)
COLUMN_MISSING = _programming(
    'column pratikshya.media_media_asset.title_en does not exist', "42703",
    "SELECT title_en FROM pratikshya.media_media_asset",
)
OPERATOR_MISMATCH = _programming(
    "operator does not exist: jsonb = character varying", "42883",
    "SELECT count(*) FROM pratikshya.catalog_product "
    "WHERE pratikshya.catalog_product.additional_images = $1::VARCHAR",
)
CONNECTION_LOST = OperationalError(
    "SELECT 1", {}, DriverError("connection refused", None)
)
UNRELATED = DBAPIError(
    "SELECT 1", {}, DriverError("could not serialize access due to concurrent update", None)
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()
    register_error_handlers(app)
    router = APIRouter()

    @router.get("/db/table")
    async def missing_table():
        raise TABLE_MISSING

    @router.get("/db/column")
    async def missing_column():
        raise COLUMN_MISSING

    @router.get("/db/operator")
    async def operator_error():
        raise OPERATOR_MISMATCH

    @router.get("/db/connection")
    async def connection_error():
        raise CONNECTION_LOST

    @router.get("/db/unrelated")
    async def unrelated_error():
        raise UNRELATED

    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


def _envelope(response) -> dict:
    body = response.json()
    assert body["success"] is False
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["details"] == {}
    return body["error"]


# --------------------------------------------------------------------------- #
# Schema errors keep their existing classification and advice
# --------------------------------------------------------------------------- #
def test_missing_table_is_a_schema_error(client: TestClient):
    response = client.get("/db/table")
    assert response.status_code == 503
    error = _envelope(response)
    assert error["code"] == "DATABASE_SCHEMA_ERROR"
    assert "alembic upgrade heads" in error["message"]


def test_missing_column_is_a_schema_error(client: TestClient):
    response = client.get("/db/column")
    assert response.status_code == 503
    error = _envelope(response)
    assert error["code"] == "DATABASE_SCHEMA_ERROR"
    assert "alembic upgrade heads" in error["message"]


# --------------------------------------------------------------------------- #
# Operator/type errors are query errors — never schema, never migration advice
# --------------------------------------------------------------------------- #
def test_operator_type_error_is_a_query_error(client: TestClient):
    response = client.get("/db/operator")
    assert response.status_code == 500
    error = _envelope(response)
    assert error["code"] == "DATABASE_QUERY_ERROR"
    assert "alembic" not in error["message"].lower()
    assert "migration" not in error["message"].lower()


def test_query_error_does_not_leak_sql_or_schema_names(client: TestClient):
    payload = client.get("/db/operator").text
    for leaked in ("jsonb", "catalog_product", "SELECT", "character varying",
                   "additional_images", "pratikshya"):
        assert leaked not in payload, f"{leaked!r} leaked into the response"


# --------------------------------------------------------------------------- #
# Unrelated failures keep the existing safe fallback
# --------------------------------------------------------------------------- #
def test_connection_failure_keeps_the_existing_fallback(client: TestClient):
    response = client.get("/db/connection")
    assert response.status_code == 503
    error = _envelope(response)
    assert error["code"] == "DATABASE_UNAVAILABLE"
    assert "PostgreSQL" in error["message"]


def test_unrelated_dbapi_failure_keeps_the_existing_fallback(client: TestClient):
    response = client.get("/db/unrelated")
    assert response.status_code == 503
    error = _envelope(response)
    assert error["code"] == "DATABASE_UNAVAILABLE"


# --------------------------------------------------------------------------- #
# Classifier unit checks (SQLSTATE first, message only as a fallback)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (TABLE_MISSING, "schema"),
        (COLUMN_MISSING, "schema"),
        (OPERATOR_MISMATCH, "query"),
        (CONNECTION_LOST, "unavailable"),
        (UNRELATED, "unavailable"),
        (DriverError("operator does not exist: text = uuid", "42883"), "query"),
        (DriverError('relation "public.x" does not exist'), "schema"),
        (DriverError('column x.y does not exist'), "schema"),
        (DriverError("connection reset by peer"), "unavailable"),
        (DriverError("something else entirely"), "unavailable"),
    ],
)
def test_classification(exc, expected):
    assert classify_database_error(exc) == expected


@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (TABLE_MISSING, "42P01"),
        (COLUMN_MISSING, "42703"),
        (OPERATOR_MISMATCH, "42883"),
        (CONNECTION_LOST, ""),
        (DriverError("nope", "42804"), "42804"),
    ],
)
def test_sqlstate_extraction(exc, expected):
    assert postgres_sqlstate(exc) == expected
