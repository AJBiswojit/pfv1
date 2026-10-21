"""
app/storage/environment.py — storage environment separation and safety guards.

Why this module exists
----------------------
The object store is the one subsystem where a wrong environment variable can
destroy or expose real data:

  · a developer `.env` copied into staging would otherwise point the process
    at the PRODUCTION bucket;
  · a test run that inherits a production `.env` would upload test fixtures
    into production storage;
  · a production deployment that forgot to set `STORAGE_PROVIDER=s3` would
    silently write customer uploads to an ephemeral local directory and then
    lose them.

So every provider construction and every process startup passes through this
module. It never performs I/O and never contacts AWS — it is pure
configuration inspection, which is what makes it safe to run at import time
and inside tests.

Environments
------------
    development   local provider; no AWS credentials needed or expected
    test          automated tests; remote storage refused unless opted in
    staging       real S3 in a DEDICATED staging bucket
    production    real S3 + CDN; local storage is a hard error

Nothing here provisions infrastructure, and nothing here migrates the
development mock asset library anywhere.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.storage.base import StorageProviderNotConfigured

#: `APP_ENV` values understood as "automated tests are running".
TEST_ENVIRONMENTS = frozenset({"test", "testing", "pytest", "ci"})

#: Environments that are allowed to talk to a real bucket.
REMOTE_CAPABLE_ENVIRONMENTS = frozenset({"staging", "production"})

DEVELOPMENT = "development"
TEST = "test"
STAGING = "staging"
PRODUCTION = "production"


@dataclass(frozen=True)
class StorageConfigurationIssue:
    """One actionable configuration problem."""

    #: "error" blocks startup; "warning" is advisory only.
    level: str
    code: str
    message: str

    def as_dict(self) -> dict:
        return {"level": self.level, "code": self.code, "message": self.message}


def is_running_under_pytest() -> bool:
    """True when a pytest run is in progress (set by pytest itself)."""
    return bool(os.environ.get("PYTEST_CURRENT_TEST"))


def classify_environment(app_env: Optional[str] = None, *, ignore_pytest: bool = False) -> str:
    """
    Resolve the effective deployment environment.

    `APP_ENV` is the authority, but a pytest run is ALWAYS treated as the test
    environment regardless of `APP_ENV`, because a developer running the suite
    locally must never be able to reach a real bucket by leaving
    `APP_ENV=production` in their shell.

    `ignore_pytest=True` disables that override. It exists so the test-suite can
    assert what the guards WOULD do in production; no application code path may
    ever pass it.
    """
    if not ignore_pytest and is_running_under_pytest():
        return TEST
    from app.config import settings

    raw = (app_env if app_env is not None else getattr(settings, "APP_ENV", "development") or "")
    text = str(raw).strip().lower()
    if text in TEST_ENVIRONMENTS:
        return TEST
    if text in {"prod", "production"}:
        return PRODUCTION
    if text in {"stage", "staging"}:
        return STAGING
    return DEVELOPMENT


def _is_placeholder(value: Optional[str]) -> bool:
    """`.env.example` marker values that mean "not configured"."""
    text = (value or "").strip()
    if not text:
        return True
    return text.lower().startswith(("your-", "changeme", "placeholder"))


def validate_storage_environment(
    active_settings=None, *, ignore_pytest: bool = False
) -> List[StorageConfigurationIssue]:
    """
    Inspect the storage configuration and return every problem found.

    Pure function — no I/O, no AWS call. Safe to run from tests, from the
    readiness endpoint and from application startup.

    `ignore_pytest` is forwarded to `classify_environment` and, like there, is
    for tests only.
    """
    from app.config import settings

    cfg = active_settings or settings
    env = classify_environment(getattr(cfg, "APP_ENV", None), ignore_pytest=ignore_pytest)
    provider = (getattr(cfg, "STORAGE_PROVIDER", "local") or "local").strip().lower()
    issues: List[StorageConfigurationIssue] = []

    def add(level: str, code: str, message: str) -> None:
        issues.append(StorageConfigurationIssue(level, code, message))

    # ── Production must never run on ephemeral local storage ───────────────
    if env == PRODUCTION and provider != "s3":
        add(
            "error",
            "PROD_LOCAL_STORAGE",
            "APP_ENV=production requires STORAGE_PROVIDER=s3. Local storage is "
            "filesystem-backed and would not survive a restart or a horizontal "
            "scale-out. Set STORAGE_PROVIDER=s3 together with AWS_REGION, "
            "AWS_BUCKET_NAME and credentials (preferably a workload role).",
        )

    # ── Production must serve images through the CDN ───────────────────────
    if env == PRODUCTION:
        cdn = (getattr(cfg, "media_cdn_base_url", None) or "").strip()
        if not cdn:
            add(
                "error",
                "PROD_MISSING_CDN",
                "APP_ENV=production requires MEDIA_CDN_BASE_URL (for example "
                "https://cdn.pratikshyafashion.com). Without it every product "
                "image is served by the API process instead of CloudFront.",
            )
        elif not cdn.lower().startswith("https://"):
            add(
                "error",
                "PROD_INSECURE_CDN",
                f"MEDIA_CDN_BASE_URL must be an https:// origin in production "
                f"(got '{sanitize_url(cdn)}'). Product images must never be "
                f"delivered over plain HTTP.",
            )

    # ── S3 selected: the configuration must be complete and real ───────────
    if provider == "s3":
        missing = [
            label
            for label, ok in (
                ("AWS_BUCKET_NAME", bool((getattr(cfg, "AWS_BUCKET_NAME", "") or "").strip())),
                ("AWS_REGION", bool((getattr(cfg, "AWS_REGION", "") or "").strip())),
                ("AWS_ACCESS_KEY_ID", not _is_placeholder(getattr(cfg, "AWS_ACCESS_KEY_ID", None))),
                (
                    "AWS_SECRET_ACCESS_KEY",
                    not _is_placeholder(getattr(cfg, "AWS_SECRET_ACCESS_KEY", None)),
                ),
            )
            if not ok
        ]
        if missing:
            add(
                "error",
                "S3_MISSING_CONFIG",
                "STORAGE_PROVIDER=s3 was selected but the S3 configuration is "
                "incomplete or still holds .env.example placeholders: "
                + ", ".join(missing)
                + ". Credentials must be injected by the deployment platform "
                "(workload role or secret manager) — never committed.",
            )

        bucket = (getattr(cfg, "AWS_BUCKET_NAME", "") or "").strip()
        protected = [name.lower() for name in (getattr(cfg, "protected_media_buckets", None) or [])]
        if bucket and bucket.lower() in protected and env != PRODUCTION:
            add(
                "error",
                "PROTECTED_BUCKET_OUTSIDE_PRODUCTION",
                f"AWS_BUCKET_NAME '{bucket}' is listed in MEDIA_PROTECTED_BUCKETS "
                f"and may only be used when APP_ENV=production (current: {env}). "
                f"Point this environment at its own bucket.",
            )

        if env == TEST and not getattr(cfg, "MEDIA_TEST_ALLOW_REMOTE_STORAGE", False):
            add(
                "error",
                "REMOTE_STORAGE_IN_TESTS",
                "Automated tests may not use a real S3 bucket. Refusing to build "
                "a remote storage provider while pytest is running. Set "
                "MEDIA_TEST_ALLOW_REMOTE_STORAGE=1 only for a deliberate, "
                "supervised staging soak test.",
            )

        if env == DEVELOPMENT:
            add(
                "warning",
                "REMOTE_STORAGE_IN_DEVELOPMENT",
                "STORAGE_PROVIDER=s3 is active in a development environment. "
                "Development is expected to run on the local provider with no "
                "AWS credentials; uploads will write to a real bucket.",
            )

    # ── Local provider: root sanity ────────────────────────────────────────
    if provider == "local":
        from pathlib import Path

        root = getattr(cfg, "local_media_root_path", None)
        if root is not None:
            root = Path(root)
            mock_dir = Path(getattr(cfg, "repository_root", Path.cwd())) / "frontend" / "public" / "images"
            try:
                inside_mock = root == mock_dir or root.is_relative_to(mock_dir)
            except AttributeError:  # pragma: no cover - Python < 3.9
                inside_mock = str(root).startswith(str(mock_dir))
            if inside_mock:
                add(
                    "error" if env == PRODUCTION else "warning",
                    "LOCAL_MEDIA_ROOT_IS_MOCK_DIR",
                    f"LOCAL_MEDIA_ROOT resolves inside the development mock asset "
                    f"directory ({mock_dir}). The mock library is served by the "
                    f"frontend from public/images and must never be used as the "
                    f"upload destination. Use 'storage/media' (or a dedicated "
                    f"persistent volume) instead.",
                )
            repo = Path(getattr(cfg, "repository_root", Path.cwd()))
            try:
                inside_repo = root == repo or root.is_relative_to(repo)
            except AttributeError:  # pragma: no cover - Python < 3.9
                inside_repo = str(root).startswith(str(repo))
            if not inside_repo:
                add(
                    "warning",
                    "LOCAL_STORAGE_OUTSIDE_REPO",
                    "LOCAL_MEDIA_ROOT resolves outside the repository, so the "
                    "development object store is not portable across machines.",
                )

    return issues


def fatal_issues(issues: List[StorageConfigurationIssue]) -> List[StorageConfigurationIssue]:
    return [issue for issue in issues if issue.level == "error"]


def enforce_storage_environment(
    active_settings=None, *, ignore_pytest: bool = False
) -> List[StorageConfigurationIssue]:
    """
    Raise on any fatal storage misconfiguration. Called from application
    startup (and available to operational checks).
    """
    issues = validate_storage_environment(active_settings, ignore_pytest=ignore_pytest)
    fatal = fatal_issues(issues)
    if fatal:
        detail = "\n  - ".join(f"[{i.code}] {i.message}" for i in fatal)
        raise StorageProviderNotConfigured(
            f"\n\n{'=' * 70}\n"
            f"STORAGE CONFIGURATION INVALID — refusing to start.\n\n  - {detail}\n"
            f"{'=' * 70}\n"
        )
    return issues


_URL_CREDENTIAL_RE = re.compile(r"//[^/@\s]*:[^/@\s]*@")
_QUERY_SECRET_RE = re.compile(
    r"(?i)\b([^=&;\s]*(?:signature|sig|token|key|secret|password|credential)"
    r"[^=&;\s]*)=[^&;\s]*"
)


def sanitize_url(value: Optional[str]) -> Optional[str]:
    """
    Strip anything credential-shaped out of a URL before it is logged or
    returned from an endpoint.

    Operators legitimately configure MinIO / VPC-endpoint URLs of the form
    `https://user:pass@host`, and signed CDN URLs carry a query-string
    signature. Neither belongs in a status payload, a log line, or an error
    raised up through FastAPI.
    """
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = _URL_CREDENTIAL_RE.sub("//***:***@", text)
    if "?" in text:
        base, _, query = text.partition("?")
        replacement = r"\1=***"
        text = f"{base}?{_QUERY_SECRET_RE.sub(replacement, query)}"
    return text


#: Issue codes that must stop the provider from being CONSTRUCTED, not merely
#: stop the process from starting. Startup validation
#: (`enforce_storage_environment`) covers every fatal issue already, but it
#: runs once from `app.main`'s lifespan; anything that builds a provider
#: later — a worker, a management command, a lazily-initialised singleton —
#: would otherwise bypass it. The two CDN codes are here for exactly that
#: reason: `enforce_storage_environment` refuses to *start* production on a
#: missing or plain-HTTP CDN, and this refuses to *serve images* through one.
FACTORY_BLOCKING_CODES = (
    "REMOTE_STORAGE_IN_TESTS",
    "PROTECTED_BUCKET_OUTSIDE_PRODUCTION",
    "PROD_INSECURE_CDN",
    "PROD_MISSING_CDN",
)


def assert_remote_storage_permitted(active_settings=None) -> None:
    """
    Guard every construction of a remote (S3) provider.

    Called from `create_storage_provider()` — the single factory the whole
    application uses — so no test or process can reach a real bucket by
    accident. Raises `StorageProviderNotConfigured` with an actionable message.

    The raised exception carries `public_code`, which is SAFE to return to an
    unauthenticated caller, and `detail` (the full message), which is not: the
    full message names the bucket. `GET /media/storage/status` is reachable
    anonymously, so it must report the code only.
    """
    from app.config import settings

    cfg = active_settings or settings
    provider = (getattr(cfg, "STORAGE_PROVIDER", "local") or "local").strip().lower()
    if provider != "s3":
        return
    for issue in validate_storage_environment(cfg):
        if issue.code in FACTORY_BLOCKING_CODES:
            error = StorageProviderNotConfigured(issue.message)
            error.public_code = issue.code  # type: ignore[attr-defined]
            raise error


def public_error_code(exc: BaseException) -> Optional[str]:
    """The safe-to-disclose code for a storage error, or None when unknown."""
    return getattr(exc, "public_code", None)


def public_issue_detail(exc: BaseException) -> Dict[str, Any]:
    """
    Render a storage error for an UNAUTHENTICATED response.

    Configuration messages are written for operators and legitimately name the
    bucket, the region, the CDN origin or an absolute filesystem path. None of
    that may reach an anonymous caller, so only the machine-readable code
    survives here; the admin-only `/media/storage/readiness` endpoint carries
    the full text.
    """
    detail: Dict[str, Any] = {"error": "Storage provider is not available."}
    code = public_error_code(exc)
    if code:
        detail["code"] = code
    return detail


def public_warning_summary(issue: "StorageConfigurationIssue") -> Dict[str, Any]:
    """
    Reduce a validation warning to the parts that are safe to publish.

    Warning messages quote the offending value — an absolute `LOCAL_MEDIA_ROOT`
    path, a bucket name. Fine in a log or an admin view, not fine on an
    anonymous endpoint.
    """
    return {"level": issue.level, "code": issue.code}


def public_issue_detail(exc: BaseException) -> Dict[str, Any]:
    """
    `detail` block for an UNAUTHENTICATED response.

    Storage configuration messages are written for operators: they name the
    bucket, the region, the CDN origin and absolute filesystem paths. That is
    exactly what `GET /media/storage/status` must never disclose, because it
    is reachable without a session. The machine-readable code is enough for a
    client to branch on; the admin-only `/media/storage/readiness` endpoint
    carries the full text for whoever is allowed to see it.
    """
    detail: Dict[str, Any] = {"error": "Storage provider is not available."}
    code = public_error_code(exc)
    if code:
        detail["code"] = code
    return detail


def public_warning_summary(issue: "StorageConfigurationIssue") -> Dict[str, Any]:
    """
    Reduce a validation warning to the parts that are safe to publish.

    Warning messages quote the offending value — an absolute `LOCAL_MEDIA_ROOT`
    path, a bucket name — which is fine in a log or an admin view and not fine
    on an anonymous endpoint.
    """
    return {"level": issue.level, "code": issue.code}


__all__ = [
    "DEVELOPMENT",
    "FACTORY_BLOCKING_CODES",
    "PRODUCTION",
    "STAGING",
    "TEST",
    "TEST_ENVIRONMENTS",
    "StorageConfigurationIssue",
    "assert_remote_storage_permitted",
    "classify_environment",
    "enforce_storage_environment",
    "fatal_issues",
    "is_running_under_pytest",
    "public_error_code",
    "public_issue_detail",
    "public_warning_summary",
    "public_issue_detail",
    "public_warning_summary",
    "sanitize_url",
    "validate_storage_environment",
]
