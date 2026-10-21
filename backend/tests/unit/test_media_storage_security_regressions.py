"""
Security-review regression tests (post-implementation review of 7ac0f54).

Each test below exists because a probe against the reviewed commit produced a
concrete disclosure or a missing guard. They are deliberately narrow: they
assert what must NOT appear in a payload, because that is the property the
review found broken.

  D-1  `GET /media/storage/status` is unauthenticated, and used to echo the
       raw `StorageProviderNotConfigured` message — which names the bucket
       (and, for local misconfiguration, an absolute filesystem path) — plus
       raw provider exception text.
  D-2  `enforce_storage_environment()` refuses to START production on a
       missing or plain-HTTP CDN, but `create_storage_provider()` did not
       re-check, so any later code path could build a provider that serves
       every product image over HTTP.
  D-3  The S3 adapter translated `get_object` failures but not the
       `Body.read()` stream, the `list_objects` paginator, or the
       `get_metadata` stream fallback, so raw botocore text (endpoint host,
       STS ARN, request id, and anything else in the message) reached the
       caller.
  D-4  Configuration URLs (`MEDIA_CDN_BASE_URL`, an S3 endpoint) may carry
       basic-auth userinfo or a query-string signature; they are now scrubbed
       before being surfaced.

No AWS account, no network, no database.
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.storage import (
    StorageProviderNotConfigured,
    create_storage_provider,
    reset_storage_provider,
    storage_status,
)
from app.storage.environment import (
    public_issue_detail,
    public_warning_summary,
    sanitize_url,
)
from app.storage.s3 import S3StorageProvider

PROTECTED_BUCKET = "pratikshya-media-prod"

#: Fragments of a real botocore error that must never reach a caller.
LEAK_CANARIES = (
    PROTECTED_BUCKET,
    "arn:aws:sts::123456789012:assumed-role",
    "AKIA-leak-canary",
    "request-id=",
)

RAW_BOTOCORE_TEXT = (
    "An error occurred (AccessDenied) when calling the ListObjectsV2 operation: "
    f"https://{PROTECTED_BUCKET}.s3.ap-south-1.amazonaws.com/ "
    "arn:aws:sts::123456789012:assumed-role/PratikshyaMediaRole/i-0abcdef "
    "request-id=TX1234567890ABCDE AKIA-leak-canary"
)


class RawBotocoreError(Exception):
    """Stands in for anything botocore raises with a rich message."""


def _leaking_client(*, head_ok: bool = True):
    """
    An S3 client seam whose operations fail with raw botocore text.

    `head_ok=True` lets `get_metadata` reach its checksum-less stream
    fallback; `head_ok=False` exercises the metadata path itself.
    """

    class _Body:
        def read(self, *args, **kwargs):
            raise RawBotocoreError(RAW_BOTOCORE_TEXT)

        def close(self):
            pass

    class _Paginator:
        def paginate(self, **kwargs):
            raise RawBotocoreError(RAW_BOTOCORE_TEXT)

    class _Client:
        def get_paginator(self, name):
            return _Paginator()

        def get_object(self, **kwargs):
            return {"Body": _Body(), "ContentLength": 4}

        def head_object(self, **kwargs):
            if not head_ok:
                raise RawBotocoreError(RAW_BOTOCORE_TEXT)
            # Succeed, so `get_metadata` reaches its stream fallback.
            return {"ContentLength": 4, "ContentType": "image/png", "Metadata": {}}

        def put_object(self, **kwargs):
            raise RawBotocoreError(RAW_BOTOCORE_TEXT)

        def delete_object(self, **kwargs):
            raise RawBotocoreError(RAW_BOTOCORE_TEXT)

    return _Client()


def _provider(*, head_ok: bool = True) -> S3StorageProvider:
    return S3StorageProvider(
        bucket=PROTECTED_BUCKET,
        region="ap-south-1",
        access_key_id="AKIAFAKEFAKEFAKEFAKE",
        secret_access_key="a-real-looking-secret",
        client=_leaking_client(head_ok=head_ok),
    )


def _cfg(**overrides):
    """
    A duck-typed settings stand-in carrying only what the guards read.

    Used in preference to a real `Settings` where a test needs to override a
    computed property (`local_media_root_path`, `repository_root`) that
    pydantic does not allow to be patched after construction.
    """
    root = Path(tempfile.mkdtemp(prefix="pf-repo-"))
    base = {
        "APP_ENV": "development",
        "STORAGE_PROVIDER": "local",
        "storage_provider_name": "local",
        "AWS_ACCESS_KEY_ID": None,
        "AWS_SECRET_ACCESS_KEY": None,
        "AWS_REGION": "ap-south-1",
        "AWS_BUCKET_NAME": "",
        "AWS_ENDPOINT_URL": None,
        "AWS_S3_SSE_ALGORITHM": "AES256",
        "AWS_S3_SSE_KMS_KEY_ID": None,
        "MEDIA_CDN_BASE_URL": None,
        "media_cdn_base_url": None,
        "MEDIA_PROTECTED_BUCKETS": "",
        "protected_media_buckets": [],
        "MEDIA_TEST_ALLOW_REMOTE_STORAGE": False,
        "MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE": False,
        "MEDIA_RESOLVE_PRODUCT_IMAGES": True,
        "MEDIA_URL_PREFIX": "/media/objects",
        "local_media_root_path": root / "storage" / "media",
        "repository_root": root,
    }
    base.update(overrides)
    if "media_cdn_base_url" not in overrides:
        base["media_cdn_base_url"] = (
            (base["MEDIA_CDN_BASE_URL"] or "").rstrip("/") or None
        )
    if "protected_media_buckets" not in overrides:
        base["protected_media_buckets"] = [
            b.strip() for b in (base["MEDIA_PROTECTED_BUCKETS"] or "").split(",") if b.strip()
        ]
    return type("Cfg", (), base)()


def _prod_settings(**overrides) -> Settings:
    base = dict(
        SECRET_KEY="s" * 40,
        JWT_SECRET_KEY="j" * 40,
        APP_ENV="production",
        STORAGE_PROVIDER="s3",
        AWS_BUCKET_NAME="pratikshya-media-production",
        AWS_REGION="ap-south-1",
        AWS_ACCESS_KEY_ID="AKIAFAKEFAKEFAKEFAKE",
        AWS_SECRET_ACCESS_KEY="a-real-looking-secret",
        MEDIA_PROTECTED_BUCKETS=PROTECTED_BUCKET,
        MEDIA_URL_PREFIX="/media/objects",
    )
    base.update(overrides)
    return Settings(**base)


def _staging_pointed_at_prod_bucket() -> Settings:
    return Settings(
        SECRET_KEY="s" * 40,
        JWT_SECRET_KEY="j" * 40,
        APP_ENV="staging",
        STORAGE_PROVIDER="s3",
        AWS_BUCKET_NAME=PROTECTED_BUCKET,
        AWS_REGION="ap-south-1",
        AWS_ACCESS_KEY_ID="AKIAFAKEFAKEFAKEFAKE",
        AWS_SECRET_ACCESS_KEY="a-real-looking-secret",
        MEDIA_PROTECTED_BUCKETS=PROTECTED_BUCKET,
        MEDIA_URL_PREFIX="/media/objects",
    )


def _media_app() -> TestClient:
    from app.api.v1.media import router as media_router
    from app.core.error_handlers import register_error_handlers

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(media_router, prefix="/api/v1")
    return TestClient(app)


# ===========================================================================
# D-1 — the anonymous status endpoint must disclose nothing
# ===========================================================================


class AnonymousStatusDisclosureTests(unittest.TestCase):
    def setUp(self):
        import app.config as config_module
        import app.storage as storage_module

        self.config_module = config_module
        self.storage_module = storage_module
        self._original_settings = config_module.settings
        # `validate_storage_environment` resolves `app.config.settings` at call
        # time, while the provider factory reads the `app.storage` module
        # global. Both have to agree for a scenario to be meaningful.
        self._config_patch = patch.object(config_module, "settings", self._original_settings)
        self._config_patch.start()
        reset_storage_provider()

    def tearDown(self):
        self._config_patch.stop()
        self.storage_module.settings = self._original_settings
        reset_storage_provider()

    def _use(self, cfg) -> None:
        """Point every consumer of the settings object at `cfg`."""
        self.config_module.settings = cfg
        self.storage_module.settings = cfg
        reset_storage_provider()

    def test_the_bucket_name_is_not_disclosed_when_staging_targets_it(self):
        """
        D-1. `str(StorageProviderNotConfigured)` used to be returned verbatim,
        and the protected-bucket message quotes `AWS_BUCKET_NAME`.
        """
        self._use(_staging_pointed_at_prod_bucket())
        payload = storage_status(include_identifiers=False)
        serialised = json.dumps(payload)

        self.assertFalse(payload["ok"])
        self.assertNotIn(PROTECTED_BUCKET, serialised)
        # The machine-readable code survives — clients still get a diagnosis.
        self.assertEqual(
            payload["detail"].get("code"), "PROTECTED_BUCKET_OUTSIDE_PRODUCTION"
        )
        self.assertIn("error", payload["detail"])

    def test_an_absolute_filesystem_path_is_not_disclosed_in_warnings(self):
        """
        D-1b. Warning messages quote the offending value; the mock-asset
        warning quotes an absolute path under the repository root.
        """
        import tempfile as _tempfile

        root = Path(_tempfile.mkdtemp(prefix="pf-mock-leak-"))
        mock_dir = root / "frontend" / "public" / "images"
        self._use(_cfg(local_media_root_path=mock_dir, repository_root=root))
        payload = storage_status(include_identifiers=False)

        serialised = json.dumps(payload)
        self.assertNotIn(str(root), serialised)
        self.assertNotIn("frontend/public/images", serialised)
        codes = [warning.get("code") for warning in payload["warnings"]]
        self.assertIn("LOCAL_MEDIA_ROOT_IS_MOCK_DIR", codes)
        # The code is published; the message that carried the path is not.
        for warning in payload["warnings"]:
            self.assertNotIn("message", warning)

    def test_raw_provider_text_is_not_disclosed(self):
        """
        D-3, at the HTTP boundary: any exception from the provider is logged
        for operators and replaced by a generic body.
        """
        self._use(_prod_settings(AWS_BUCKET_NAME="pratikshya-media-production"))
        with patch.object(
            self.storage_module, "get_storage_provider", return_value=_provider()
        ):
            payload = storage_status(include_identifiers=False)
        serialised = json.dumps(payload)

        self.assertFalse(payload["ok"])
        for canary in LEAK_CANARIES:
            self.assertNotIn(canary, serialised)

    def test_the_endpoint_itself_discloses_nothing(self):
        """The same guarantees, asserted against the real route."""
        client = _media_app()
        with patch.object(
            self.storage_module,
            "settings",
            _staging_pointed_at_prod_bucket(),
        ):
            reset_storage_provider()
            response = client.get("/api/v1/media/storage/status")

        self.assertEqual(response.status_code, 200)
        for canary in LEAK_CANARIES:
            self.assertNotIn(canary, response.text)

    def test_the_endpoint_is_unauthenticated_and_stays_that_way(self):
        """No credential is required — which is why the redaction matters."""
        client = _media_app()
        response = client.get("/api/v1/media/storage/status")
        self.assertEqual(response.status_code, 200)

    def test_public_issue_detail_never_carries_the_operator_message(self):
        error = StorageProviderNotConfigured(
            f"AWS_BUCKET_NAME '{PROTECTED_BUCKET}' is listed in "
            "MEDIA_PROTECTED_BUCKETS and may only be used when "
            "APP_ENV=production (current: staging)."
        )
        detail = public_issue_detail(error)
        self.assertNotIn(PROTECTED_BUCKET, json.dumps(detail))
        self.assertEqual(
            detail, {"error": "Storage provider is not available."}
        )

        error.public_code = "PROTECTED_BUCKET_OUTSIDE_PRODUCTION"
        self.assertEqual(
            public_issue_detail(error),
            {
                "error": "Storage provider is not available.",
                "code": "PROTECTED_BUCKET_OUTSIDE_PRODUCTION",
            },
        )

    def test_public_warning_summary_drops_the_message(self):
        class Issue:
            level = "warning"
            code = "LOCAL_MEDIA_ROOT_IS_MOCK_DIR"
            message = "/home/user/pfv1/frontend/public/images"

        summary = public_warning_summary(Issue())
        self.assertEqual(summary, {"level": "warning", "code": Issue.code})


# ===========================================================================
# D-2 — the factory must re-check the production CDN rules
# ===========================================================================


class FactoryEnforcesProductionCdnTests(unittest.TestCase):
    """
    `enforce_storage_environment()` runs once, from the app lifespan. The
    factory is the choke point everything else goes through, so it has to
    repeat the two production CDN rules. These tests run under pytest, where
    `classify_environment` reports TEST, so the pytest override is disabled
    on purpose — exactly the seam `ignore_pytest` documents.
    """

    def setUp(self):
        import app.storage.environment as environment_module

        self.environment_module = environment_module
        self._pytest_patch = patch.object(
            environment_module, "is_running_under_pytest", return_value=False
        )
        self._pytest_patch.start()

    def tearDown(self):
        self._pytest_patch.stop()
        reset_storage_provider()

    def test_a_plain_http_cdn_is_refused_at_construction(self):
        cfg = _prod_settings(MEDIA_CDN_BASE_URL="http://cdn.pratikshyafashion.com")
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            create_storage_provider(cfg)
        self.assertIn("https://", str(ctx.exception))
        self.assertEqual(
            getattr(ctx.exception, "public_code", None), "PROD_INSECURE_CDN"
        )

    def test_a_missing_cdn_is_refused_at_construction(self):
        cfg = _prod_settings(MEDIA_CDN_BASE_URL=None)
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            create_storage_provider(cfg)
        self.assertEqual(
            getattr(ctx.exception, "public_code", None), "PROD_MISSING_CDN"
        )

    def test_an_https_cdn_still_builds(self):
        """The guard must not become a blanket refusal of production S3."""
        cfg = _prod_settings(MEDIA_CDN_BASE_URL="https://cdn.pratikshyafashion.com")
        provider = create_storage_provider(cfg)
        self.assertEqual(provider.name, "s3")

    def test_the_diagnosis_is_safe_to_publish_but_the_message_is_not(self):
        cfg = _prod_settings(MEDIA_CDN_BASE_URL="http://cdn.pratikshyafashion.com")
        try:
            create_storage_provider(cfg)
        except StorageProviderNotConfigured as exc:
            detail = public_issue_detail(exc)
        else:  # pragma: no cover - the guard must fire
            self.fail("expected StorageProviderNotConfigured")
        self.assertEqual(detail["code"], "PROD_INSECURE_CDN")
        self.assertNotIn("cdn.pratikshyafashion.com", json.dumps(detail))


# ===========================================================================
# D-3 — the S3 adapter must translate every raw botocore failure
# ===========================================================================


class S3ErrorTranslationTests(unittest.TestCase):
    def test_list_objects_paginator_failure_is_translated(self):
        provider = _provider()
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            list(provider.list_objects(limit=1))
        message = str(ctx.exception)
        for canary in LEAK_CANARIES:
            self.assertNotIn(canary, message)

    def test_get_paginator_itself_failing_is_translated(self):
        """`get_paginator` can raise before `paginate` is ever reached."""

        class Client:
            def get_paginator(self, name):
                raise RawBotocoreError(RAW_BOTOCORE_TEXT)

        provider = S3StorageProvider(
            bucket=PROTECTED_BUCKET,
            region="ap-south-1",
            access_key_id="AKIAFAKEFAKEFAKEFAKE",
            secret_access_key="a-real-looking-secret",
            client=Client(),
        )
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            list(provider.list_objects(limit=1))
        for canary in LEAK_CANARIES:
            self.assertNotIn(canary, str(ctx.exception))

    def test_object_body_read_failure_is_translated(self):
        provider = _provider()
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            provider.get_object("products/PF-1/primary.png")
        message = str(ctx.exception)
        for canary in LEAK_CANARIES:
            self.assertNotIn(canary, message)

    def test_get_metadata_stream_fallback_is_translated(self):
        """
        An object written before checksums were recorded forces a streaming
        SHA-256; that read used to leak too.
        """
        provider = _provider()
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            provider.get_metadata("products/PF-1/primary.png")
        for canary in LEAK_CANARIES:
            self.assertNotIn(canary, str(ctx.exception))

    def test_put_and_delete_failures_are_translated(self):
        provider = _provider()
        for call in (
            lambda: provider.put_object("products/PF-1/a.png", b"x", "image/png"),
            lambda: provider.delete_object("products/PF-1/a.png"),
        ):
            with self.assertRaises(StorageProviderNotConfigured) as ctx:
                call()
            for canary in LEAK_CANARIES:
                self.assertNotIn(canary, str(ctx.exception))

    def test_a_credential_failure_is_not_reported_as_a_missing_object(self):
        """
        Unchanged behaviour, re-asserted here because it is the other half of
        the same translation table: AccessDenied must not look like a 404.
        """
        provider = _provider(head_ok=False)
        with self.assertRaises(StorageProviderNotConfigured):
            provider.object_exists("products/PF-1/primary.png")

    def test_a_missing_object_is_still_reported_as_absent(self):
        """The translation must not turn a 404 into a configuration error."""

        class NotFound(Exception):
            response = {"Error": {"Code": "NoSuchKey"}}

        class Client:
            def head_object(self, **kwargs):
                raise NotFound()

        provider = S3StorageProvider(
            bucket=PROTECTED_BUCKET,
            region="ap-south-1",
            access_key_id="AKIAFAKEFAKEFAKEFAKE",
            secret_access_key="a-real-looking-secret",
            client=Client(),
        )
        self.assertFalse(provider.object_exists("products/PF-1/primary.png"))


# ===========================================================================
# D-4 — configuration URLs must be scrubbed
# ===========================================================================


class UrlSanitisationTests(unittest.TestCase):
    def test_basic_auth_userinfo_is_removed(self):
        self.assertEqual(
            sanitize_url("https://user:hunter2@cdn.example.com"),
            "https://***:***@cdn.example.com",
        )

    def test_query_string_signatures_are_removed(self):
        cleaned = sanitize_url(
            "https://cdn.example.com/a.png?X-Amz-Signature=deadbeef&v=1"
        )
        self.assertNotIn("deadbeef", cleaned)
        self.assertIn("v=1", cleaned)

    def test_plain_urls_are_untouched(self):
        url = "https://cdn.example.com/media"
        self.assertEqual(sanitize_url(url), url)

    def test_empty_values_pass_through(self):
        self.assertIsNone(sanitize_url(None))
        self.assertIsNone(sanitize_url(""))
        self.assertIsNone(sanitize_url("   "))

    def test_an_insecure_cdn_message_does_not_echo_credentials(self):
        from app.storage.environment import validate_storage_environment

        cfg = _prod_settings(
            MEDIA_CDN_BASE_URL="http://user:hunter2@cdn.example.com"
        )
        with patch.object(
            self._environment(), "is_running_under_pytest", return_value=False
        ):
            issues = validate_storage_environment(cfg)
        messages = " ".join(issue.message for issue in issues)
        self.assertIn("PROD_INSECURE_CDN", [issue.code for issue in issues])
        self.assertNotIn("hunter2", messages)

    @staticmethod
    def _environment():
        import app.storage.environment as environment_module

        return environment_module


# ===========================================================================
# The importer must stay local-only
# ===========================================================================


class ImporterCannotReachRemoteStorageTests(unittest.TestCase):
    """
    Re-asserted from the review: `run_migration` refuses a remote provider on
    every combination of its own flags, and the CLI can only ever obtain a
    local one.
    """

    def test_run_migration_refuses_a_remote_provider_every_way(self):
        from app.services.media.local_media_migration import (
            RemoteImportRefused,
            run_migration,
        )

        source = Path(tempfile.mkdtemp(prefix="pf-src-"))
        (source / "a.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 32)

        for kwargs in (
            {},
            {"allow_remote": True},
            {"dry_run": True},
            {"allow_remote": True, "dry_run": True},
        ):
            with self.subTest(**kwargs):
                with self.assertRaises(RemoteImportRefused):
                    run_migration(source, _provider(), **kwargs)

    def test_the_cli_can_only_obtain_a_local_provider(self):
        import inspect

        from app.services.media import migrate_local

        source = inspect.getsource(migrate_local)
        self.assertNotIn("S3StorageProvider", source)
        self.assertIn("LocalStorageProvider", source)


if __name__ == "__main__":
    unittest.main()
