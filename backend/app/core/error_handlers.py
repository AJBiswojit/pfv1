from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.core.exceptions import AppException
from app.core.logging import get_logger

logger = get_logger("app.error_handlers")


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
        logger.warning(
            "Validation error path=%s errors=%s",
            request.url.path, exc.errors(),
        )
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request payload or parameters",
                    "details": exc.errors(),
                },
            },
        )

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
