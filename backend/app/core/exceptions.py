from typing import Any, Dict, Optional


class AppException(Exception):
    """Base application exception class."""
    def __init__(
        self,
        message: str,
        status_code: int = 400,
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or "BAD_REQUEST"
        self.details = details or {}
        super().__init__(message)


class NotFoundException(AppException):
    def __init__(self, message: str = "Resource not found", details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, status_code=404, error_code="NOT_FOUND", details=details)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Authentication required", details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, status_code=401, error_code="UNAUTHORIZED", details=details)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Permission denied", details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, status_code=403, error_code="FORBIDDEN", details=details)


class ConflictException(AppException):
    def __init__(self, message: str = "Resource conflict", details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, status_code=409, error_code="CONFLICT", details=details)


class BusinessLogicException(AppException):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, status_code=422, error_code="BUSINESS_RULE_VIOLATION", details=details)


class TooManyRequestsException(AppException):
    def __init__(self, message: str = "Too many requests. Please slow down.", details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, status_code=429, error_code="RATE_LIMIT_EXCEEDED", details=details)
