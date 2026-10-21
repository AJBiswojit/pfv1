"""
app/storage — the single object-storage abstraction (Phase 6).

    StorageProvider
        ├── LocalStorageProvider   ← development / test (no AWS credentials)
        └── S3StorageProvider      ← staging / production (S3 + CloudFront)

Callers use `get_storage_provider()` and nothing else. Switching providers
is a `STORAGE_PROVIDER` configuration change; no service, route or frontend
module has to know which one is active.

Which provider may be active in which environment — and the guards that stop
a test or a staging deploy from ever touching the production bucket — lives
in `app/storage/environment.py`.
"""

from __future__ import annotations

from typing import Optional

from app.config import settings
from app.storage.base import (
    InvalidObjectKeyError,
    ObjectCollisionError,
    ObjectMetadata,
    ObjectNotFoundError,
    StorageError,
    StorageProvider,
    StorageProviderNotConfigured,
    StoredObject,
)
from app.storage.keys import (
    ALLOWED_NAMESPACES,
    NAMESPACE_COLLECTIONS,
    NAMESPACE_HERO,
    NAMESPACE_MARKETING,
    NAMESPACE_PRODUCTS,
    NAMESPACE_UPLOADS,
    content_addressed_product_key,
    is_content_addressed_key,
    is_safe_object_key,
    normalize_object_key,
    object_key_for_namespace,
    product_object_key,
    sanitize_filename,
    sanitize_key_segment,
    validate_product_id,
)
from app.storage.local import (
    LocalStorageProvider,
    content_type_for_key,
    sha256_bytes,
    sha256_file,
    sha256_stream,
)
from app.storage.s3 import S3StorageProvider
from app.storage.environment import (
    assert_remote_storage_permitted,
    classify_environment,
    enforce_storage_environment,
    is_running_under_pytest,
    public_error_code,
    public_issue_detail,
    public_warning_summary,
    sanitize_url,
    validate_storage_environment,
)
from app.storage.urls import (
    build_media_url,
    cache_control_for_key,
    is_media_url,
    media_url_prefix,
    object_key_from_media_url,
)

__all__ = [
    # errors
    "StorageError",
    "ObjectNotFoundError",
    "InvalidObjectKeyError",
    "StorageProviderNotConfigured",
    "ObjectCollisionError",
    # value objects / interface
    "StorageProvider",
    "ObjectMetadata",
    "StoredObject",
    # providers
    "LocalStorageProvider",
    "S3StorageProvider",
    # keys
    "ALLOWED_NAMESPACES",
    "NAMESPACE_PRODUCTS",
    "NAMESPACE_COLLECTIONS",
    "NAMESPACE_HERO",
    "NAMESPACE_MARKETING",
    "NAMESPACE_UPLOADS",
    "normalize_object_key",
    "is_safe_object_key",
    "sanitize_filename",
    "sanitize_key_segment",
    "validate_product_id",
    "product_object_key",
    "object_key_for_namespace",
    "content_addressed_product_key",
    "is_content_addressed_key",
    # urls
    "build_media_url",
    "cache_control_for_key",
    "is_media_url",
    "media_url_prefix",
    "object_key_from_media_url",
    # hashing / content type
    "content_type_for_key",
    "sha256_bytes",
    "sha256_file",
    "sha256_stream",
    # factory
    "get_storage_provider",
    "reset_storage_provider",
    "create_storage_provider",
    "storage_status",
    # environment separation / guards
    "assert_remote_storage_permitted",
    "classify_environment",
    "enforce_storage_environment",
    "is_running_under_pytest",
    "public_error_code",
    "public_issue_detail",
    "public_warning_summary",
    "sanitize_url",
    "validate_storage_environment",
]


_PROVIDER_CACHE: Optional[StorageProvider] = None


def create_storage_provider(active_settings=None) -> StorageProvider:
    """
    Build a provider from settings. No caching — used by tests and by the
    migration CLI, which may point at a different root than the app.
    """
    cfg = active_settings or settings
    provider_name = (
        cfg.storage_provider_name
        if hasattr(cfg, "storage_provider_name")
        else str(getattr(cfg, "STORAGE_PROVIDER", "local") or "local").strip().lower()
    )

    if provider_name == "local":
        # Defence in depth: `enforce_storage_environment()` already refuses to
        # START a production process on local storage, and this guard stops any
        # later code path from constructing one anyway.
        if classify_environment(getattr(cfg, "APP_ENV", None)) == "production":
            raise StorageProviderNotConfigured(
                "APP_ENV=production requires STORAGE_PROVIDER=s3. Local storage "
                "is filesystem-backed and would not survive a restart or a "
                "horizontal scale-out."
            )
        return LocalStorageProvider(cfg.local_media_root_path)

    if provider_name == "s3":
        # Refuse before touching boto3 when this process must not reach a real
        # bucket (automated tests, or a production bucket named in
        # MEDIA_PROTECTED_BUCKETS while APP_ENV is not production).
        assert_remote_storage_permitted(cfg)
        # Raises StorageProviderNotConfigured until real credentials exist.
        return S3StorageProvider(
            bucket=getattr(cfg, "AWS_BUCKET_NAME", "") or "",
            region=getattr(cfg, "AWS_REGION", "") or "",
            access_key_id=getattr(cfg, "AWS_ACCESS_KEY_ID", None),
            secret_access_key=getattr(cfg, "AWS_SECRET_ACCESS_KEY", None),
            endpoint_url=getattr(cfg, "AWS_ENDPOINT_URL", None),
            sse_algorithm=getattr(cfg, "AWS_S3_SSE_ALGORITHM", "AES256"),
            sse_kms_key_id=getattr(cfg, "AWS_S3_SSE_KMS_KEY_ID", None),
        )

    raise StorageProviderNotConfigured(
        f"Unknown STORAGE_PROVIDER '{provider_name}'. Supported: 'local', 's3'."
    )


def get_storage_provider() -> StorageProvider:
    """Process-wide provider instance, built once from settings."""
    global _PROVIDER_CACHE
    if _PROVIDER_CACHE is None:
        _PROVIDER_CACHE = create_storage_provider()
    return _PROVIDER_CACHE


def reset_storage_provider() -> None:
    """
    Drop the cached provider.

    Used by tests that change `LOCAL_MEDIA_ROOT` / `STORAGE_PROVIDER` and by
    any future configuration reload.
    """
    global _PROVIDER_CACHE
    _PROVIDER_CACHE = None


def storage_status(*, include_identifiers: bool = False) -> dict:
    """
    Non-secret storage summary for `GET /media/storage/status`.

    Includes the provider name, whether it is usable, the application-level
    URL prefix, and whether a CDN is configured. Never credentials, never an
    absolute filesystem path. The S3 bucket name is redacted unless
    `include_identifiers` is set, which only an authenticated
    administrator-facing call path may do — this endpoint is reachable
    anonymously.
    """
    import logging as _logging

    provider_name = settings.storage_provider_name
    environment = classify_environment(getattr(settings, "APP_ENV", None))
    # This endpoint is reachable anonymously. Warning messages quote the
    # offending value — an absolute LOCAL_MEDIA_ROOT path, a bucket name — so
    # the public payload carries the code only; the message stays available to
    # the admin-only readiness endpoint.
    warnings = [
        issue.as_dict() if include_identifiers else public_warning_summary(issue)
        for issue in validate_storage_environment()
        if issue.level == "warning"
    ]
    _unavailable = {
        "ok": False,
        "provider": provider_name,
        "environment": environment,
        "configured": False,
        "urlPrefix": media_url_prefix(),
        "cdnConfigured": bool(settings.media_cdn_base_url),
        "namespaces": list(ALLOWED_NAMESPACES),
        "resolveProductImages": bool(settings.MEDIA_RESOLVE_PRODUCT_IMAGES),
        "identifiersIncluded": bool(include_identifiers),
        "warnings": warnings,
    }
    try:
        provider = get_storage_provider()
        detail = provider.describe(include_identifiers=include_identifiers)
        # Warn on startup if the store has no objects — this almost always
        # means a fresh environment where assets haven't been seeded yet.
        # Bounded: a status probe must never list a whole production bucket.
        has_objects = next(provider.list_objects(limit=1), None) is not None
        if not has_objects:
            _logging.getLogger(__name__).warning(
                "Storage provider '%s' contains no objects. "
                "Run `python -m app.services.media.migrate_local` to seed assets.",
                provider_name,
            )
        return {
            "ok": True,
            "provider": provider_name,
            "environment": environment,
            "configured": True,
            "detail": detail,
            "urlPrefix": media_url_prefix(),
            "cdnConfigured": bool(settings.media_cdn_base_url),
            "namespaces": list(ALLOWED_NAMESPACES),
            "resolveProductImages": bool(settings.MEDIA_RESOLVE_PRODUCT_IMAGES),
            "assetsPresent": has_objects,
            "identifiersIncluded": bool(include_identifiers),
            "warnings": warnings,
        }
    except StorageProviderNotConfigured as exc:
        # `str(exc)` names the bucket / region / CDN origin. Anonymous callers
        # get the machine-readable code and nothing else.
        return dict(_unavailable, detail=public_issue_detail(exc))
    except Exception as exc:  # noqa: BLE001 - an anonymous probe must not 500
        # A live provider can raise anything at all here (an S3 client error, a
        # network failure, a credential chain problem). The raw text routinely
        # contains the endpoint host, an STS ARN and a request id, so it is
        # logged for operators and never returned.
        _logging.getLogger(__name__).warning(
            "Storage status probe failed; returning a redacted payload: %s",
            type(exc).__name__,
        )
        return dict(
            _unavailable, detail={"error": "Storage provider is not available."}
        )
