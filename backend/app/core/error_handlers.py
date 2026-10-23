from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import AppException
from app.core.logging import get_logger

logger = get_logger("app.error_handlers")


def _json_safe(value):
    """Coerce a value to JSON-serialisable primitives.

    `RequestValidationError.errors()` embeds live exception objects inside
    ``ctx.error`` whenever a validator raises (e.g. the ``ValueError`` raised
    by a lifecycle-key blocker or an id regex validator). Handing those
    objects straight to ``JSONResponse`` makes the 422 handler itself raise
    ``TypeError``, which ``ServerErrorMiddleware`` then turns into a 500.
    Walking the payload here keeps every field-level detail (``loc``, ``msg``,
    ``type``, ``input``, ``ctx``, ``url``) while reducing non-primitives to
    their string form so the envelope is always renderable.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_json_safe(item) for item in value]
    # Everything else — ValueError, enum members, arbitrary objects — becomes
    # its readable representation so the field-level detail is never lost.
    return str(value)


_HTTP_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    408: "REQUEST_TIMEOUT",
    409: "CONFLICT",
    410: "GONE",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMIT_EXCEEDED",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}


# --------------------------------------------------------------------------- #
# Database failure classification
# --------------------------------------------------------------------------- #
#
# PostgreSQL reports three very different situations through the same DBAPI
# exception family:
#
#   * the schema object is absent       → undefined_table (42P01) /
#                                         undefined_column (42703): the client
#                                         needs the migration advice;
#   * the query itself is invalid       → undefined_function (42883) for
#                                         "operator does not exist", datatype
#                                         mismatch (42804), no implicit cast
#                                         (42846), ambiguous function (42725):
#                                         valid schema, broken query — a
#                                         migration cannot help;
#   * the server is unreachable         → connection class 08 / server shutdown
#                                         57P01-57P03.
#
# Matching on the phrase "does not exist" alone (the previous behaviour)
# classified "operator does not exist: jsonb = character varying" as a missing
# column and told operators to run migrations — which is what disguised the
# media-deletion defect.
_SCHEMA_SQLSTATES = {"42P01": "table", "42703": "column"}
_QUERY_SQLSTATES = {"42883", "42804", "42846", "42725", "42P18"}
_CONNECTION_SQLSTATES = {
    "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
    "57P01", "57P02", "57P03",
}


def postgres_sqlstate(exc: BaseException) -> str:
    """The five-character SQLSTATE of a wrapped DBAPI exception, if any.

    asyncpg exposes ``sqlstate``; psycopg2 exposes ``pgcode``. Only the wrapped
    driver exception is inspected — SQLAlchemy's own attributes are not a
    reliable source and may be absent.
    """
    for candidate in (getattr(exc, "orig", None), exc):
        if candidate is None:
            continue
        for attr in ("sqlstate", "pgcode"):
            value = getattr(candidate, attr, None)
            if isinstance(value, str) and len(value) == 5:
                return value.upper()
    return ""


def classify_database_error(exc: BaseException) -> str:
    """Return ``"schema"``, ``"query"`` or ``"unavailable"`` for a DB error.

    ``"schema"`` keeps the historical migration advice; ``"query"`` is a
    server-side query defect and must never tell the client to migrate;
    ``"unavailable"`` preserves the existing connection-failure response.
    """
    state = postgres_sqlstate(exc)
    if state in _SCHEMA_SQLSTATES:
        return "schema"
    if state in _QUERY_SQLSTATES:
        return "query"
    if state in _CONNECTION_SQLSTATES:
        return "unavailable"

    text = str(exc).lower()
    # Order matters: "operator does not exist" also contains "does not exist".
    if "operator does not exist" in text:
        return "query"
    if "undefined_table" in text or "undefined_column" in text:
        return "schema"
    if "relation" in text and "does not exist" in text:
        return "schema"
    if "column" in text and "does not exist" in text:
        return "schema"
    if state == "" and any(
        marker in text
        for marker in ("connection", "could not connect", "server closed",
                       "connection refused", "terminating connection", "timeout")
    ):
        return "unavailable"
    return "unavailable"


def register_error_handlers(app: FastAPI) -> None:
    """Register custom exception handlers on FastAPI instance."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        # Log 5xx errors as ERROR, 4xx as WARNING (expected business errors)
        if exc.status_code >= 500:
            logger.error(
                "AppException status=%s code=%s path=%s message=%s",
                exc.status_code, exc.error_code, request.url.path, exc.message,
            )
        else:
            logger.warning(
                "AppException status=%s code=%s path=%s message=%s",
                exc.status_code, exc.error_code, request.url.path, exc.message,
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": exc.error_code,
                    "message": exc.message,
                    "details": exc.details,
                },
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        details = _json_safe(exc.errors())
        logger.warning(
            "Validation error path=%s errors=%s",
            request.url.path, details,
        )
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request payload or parameters",
                    "details": details,
                },
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        if exc.status_code >= 500:
            logger.error(
                "HTTPException status=%s path=%s detail=%s",
                exc.status_code, request.url.path, exc.detail,
            )
        else:
            logger.warning(
                "HTTPException status=%s path=%s detail=%s",
                exc.status_code, request.url.path, exc.detail,
            )
        code = _HTTP_STATUS_CODES.get(exc.status_code, f"HTTP_{exc.status_code}")
        message = str(exc.detail) if exc.detail else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": code,
                    "message": message,
                    "details": {},
                },
            },
        )

    try:
        from sqlalchemy.exc import DBAPIError, OperationalError

        @app.exception_handler(OperationalError)
        @app.exception_handler(DBAPIError)
        async def db_connection_exception_handler(request: Request, exc: Exception):
            kind = classify_database_error(exc)
            if kind == "schema":
                status_code = 503
                code = "DATABASE_SCHEMA_ERROR"
                message = "A required database table or column is missing. Please run: alembic upgrade heads"
            elif kind == "query":
                # The schema is intact; the statement is not. Migration advice
                # would be wrong, and the raw SQL must never reach the client.
                status_code = 500
                code = "DATABASE_QUERY_ERROR"
                message = "A database query failed while processing this request. The failure has been logged."
            else:
                status_code = 503
                code = "DATABASE_UNAVAILABLE"
                message = "Database connection failed. Please ensure PostgreSQL is running."
            # Full detail stays in the server log (with the SQL); the response
            # carries only the code, a fixed sentence and an empty details map.
            logger.error(
                "Database error path=%s method=%s kind=%s state=%s: %s",
                request.url.path, request.method, kind,
                postgres_sqlstate(exc) or "-", str(exc),
            )
            return JSONResponse(
                status_code=status_code,
                content={
                    "success": False,
                    "error": {
                        "code": code,
                        "message": message,
                        "details": {},
                    },
                },
            )
    except ImportError:
        pass

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.error(
            "Unhandled exception path=%s method=%s error=%s",
            request.url.path, request.method, str(exc),
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred. Please try again later.",
                    "details": {},
                },
            },
        )
