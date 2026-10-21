"""
S3/CDN production readiness — environment separation (Phase 1).

The failure modes this suite exists to prevent:

  · a developer `.env` copied into staging silently pointing at the
    PRODUCTION bucket;
  · a test run inheriting a production `.env` and uploading fixtures into
    production storage;
  · a production deploy that forgot `STORAGE_PROVIDER=s3` and quietly wrote
    customer uploads to an ephemeral local directory.

Everything here is pure configuration inspection — no AWS call, no database
and no filesystem write.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.config import settings
from app.storage import (
    StorageProviderNotConfigured,
    create_storage_provider,
    reset_storage_provider,
)
from app.storage.environment import (
    PRODUCTION,
    STAGING,
    TEST,
    DEVELOPMENT,
    classify_environment,
    enforce_storage_environment,
    fatal_issues,
    is_running_under_pytest,
    validate_storage_environment,
)


def _settings(**overrides):
    """A lightweight stand-in for Settings carrying only what the guards read."""
    base = {
        "APP_ENV": "development",
        "STORAGE_PROVIDER": "local",
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
        "local_media_root_path": Path(tempfile.gettempdir()) / "pf-storage",
        "repository_root": Path(tempfile.gettempdir()) / "pf-repo",
    }
    base.update(overrides)
    if "media_cdn_base_url" not in overrides:
        base["media_cdn_base_url"] = (base["MEDIA_CDN_BASE_URL"] or "").rstrip("/") or None
    if "protected_media_buckets" not in overrides:
        raw = base["MEDIA_PROTECTED_BUCKETS"] or ""
        base["protected_media_buckets"] = [b.strip() for b in raw.split(",") if b.strip()]
    return type("Cfg", (), base)()


PROD_SECRETS = {
    "SECRET_KEY": "s" * 40,
    "JWT_SECRET_KEY": "j" * 40,
}


# ===========================================================================
# 1. Environment classification
# ===========================================================================


class EnvironmentClassificationTests(unittest.TestCase):
    def test_app_env_is_the_authority(self):
        for value, expected in (
            ("development", DEVELOPMENT),
            ("staging", STAGING),
            ("prod", PRODUCTION),
            ("production", PRODUCTION),
            ("test", TEST),
            ("pytest", TEST),
            ("", DEVELOPMENT),
        ):
            with self.subTest(value=value):
                # ignore_pytest: assert the APP_ENV mapping itself; the pytest
                # override is covered by the next test.
                self.assertEqual(
                    classify_environment(value, ignore_pytest=True), expected
                )

    def test_a_pytest_run_is_always_the_test_environment(self):
        """A developer with APP_ENV=production in their shell must not be able
        to reach a real bucket by running the suite."""
        self.assertTrue(is_running_under_pytest())
        self.assertEqual(classify_environment("production"), TEST)


# ===========================================================================
# 2. Production guards
# ===========================================================================


class ProductionGuardTests(unittest.TestCase):
    def test_production_refuses_local_storage(self):
        issues = validate_storage_environment(
            _settings(
                APP_ENV="production",
                STORAGE_PROVIDER="local",
                MEDIA_CDN_BASE_URL="https://cdn.example.com",
            ),
            ignore_pytest=True,
        )
        codes = [i.code for i in fatal_issues(issues)]
        self.assertIn("PROD_LOCAL_STORAGE", codes)

    def test_production_requires_a_cdn(self):
        issues = validate_storage_environment(
            _settings(APP_ENV="production", STORAGE_PROVIDER="s3", AWS_BUCKET_NAME="prod-bucket"),
            ignore_pytest=True,
        )
        codes = [i.code for i in fatal_issues(issues)]
        self.assertIn("PROD_MISSING_CDN", codes)

    def test_production_rejects_an_insecure_cdn(self):
        issues = validate_storage_environment(
            _settings(
                APP_ENV="production",
                STORAGE_PROVIDER="s3",
                AWS_BUCKET_NAME="prod-bucket",
                MEDIA_CDN_BASE_URL="http://cdn.example.com",
            ),
            ignore_pytest=True,
        )
        codes = [i.code for i in fatal_issues(issues)]
        self.assertIn("PROD_INSECURE_CDN", codes)

    def test_a_valid_production_configuration_has_no_fatal_issues(self):
        cfg = _settings(
            APP_ENV="production",
            STORAGE_PROVIDER="s3",
            AWS_BUCKET_NAME="pratikshya-media-prod",
            AWS_ACCESS_KEY_ID="AKIAFAKEFAKEFAKEFAKE",
            AWS_SECRET_ACCESS_KEY="a-real-looking-secret",
            AWS_REGION="ap-south-1",
            MEDIA_CDN_BASE_URL="https://cdn.pratikshyafashion.com",
            MEDIA_PROTECTED_BUCKETS="pratikshya-media-prod",
        )
        self.assertEqual(fatal_issues(validate_storage_environment(cfg, ignore_pytest=True)), [])

    def test_enforce_raises_with_an_actionable_message(self):
        cfg = _settings(APP_ENV="production", STORAGE_PROVIDER="local")
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            enforce_storage_environment(cfg, ignore_pytest=True)
        message = str(ctx.exception)
        self.assertIn("PROD_LOCAL_STORAGE", message)
        self.assertIn("STORAGE_PROVIDER=s3", message)


# ===========================================================================
# 3. Protected buckets / test isolation
# ===========================================================================


class BucketProtectionTests(unittest.TestCase):
    def test_the_production_bucket_cannot_be_used_outside_production(self):
        cfg = _settings(
            APP_ENV="staging",
            STORAGE_PROVIDER="s3",
            AWS_BUCKET_NAME="pratikshya-media-prod",
            AWS_ACCESS_KEY_ID="AKIAFAKE",
            AWS_SECRET_ACCESS_KEY="secret",
            MEDIA_PROTECTED_BUCKETS="pratikshya-media-prod",
        )
        codes = [i.code for i in fatal_issues(validate_storage_environment(cfg, ignore_pytest=True))]
        self.assertIn("PROTECTED_BUCKET_OUTSIDE_PRODUCTION", codes)

    def test_the_factory_refuses_to_build_that_provider(self):
        """The guard sits in create_storage_provider — the single choke point."""
        cfg = _settings(
            APP_ENV="staging",
            STORAGE_PROVIDER="s3",
            AWS_BUCKET_NAME="pratikshya-media-prod",
            AWS_ACCESS_KEY_ID="AKIAFAKE",
            AWS_SECRET_ACCESS_KEY="secret",
            MEDIA_PROTECTED_BUCKETS="pratikshya-media-prod",
        )
        with self.assertRaises(StorageProviderNotConfigured):
            create_storage_provider(cfg)

    def test_a_staging_bucket_is_fine_in_staging(self):
        cfg = _settings(
            APP_ENV="staging",
            STORAGE_PROVIDER="s3",
            AWS_BUCKET_NAME="pratikshya-media-staging",
            AWS_ACCESS_KEY_ID="AKIAFAKE",
            AWS_SECRET_ACCESS_KEY="secret",
            MEDIA_PROTECTED_BUCKETS="pratikshya-media-prod",
        )
        self.assertEqual(fatal_issues(validate_storage_environment(cfg, ignore_pytest=True)), [])


class AutomatedTestIsolationTests(unittest.TestCase):
    """The one that matters most: a test must never reach a real bucket."""

    def test_a_test_environment_may_not_select_s3(self):
        cfg = _settings(
            APP_ENV="test",
            STORAGE_PROVIDER="s3",
            AWS_BUCKET_NAME="pratikshya-media-staging",
            AWS_ACCESS_KEY_ID="AKIAFAKE",
            AWS_SECRET_ACCESS_KEY="secret",
        )
        codes = [i.code for i in fatal_issues(validate_storage_environment(cfg, ignore_pytest=True))]
        self.assertIn("REMOTE_STORAGE_IN_TESTS", codes)

    def test_the_factory_refuses_s3_while_pytest_is_running(self):
        # `PYTEST_CURRENT_TEST` is set by pytest itself, so classify_environment
        # already reports TEST regardless of APP_ENV.
        cfg = _settings(
            APP_ENV="production",
            STORAGE_PROVIDER="s3",
            AWS_BUCKET_NAME="pratikshya-media-prod",
            AWS_ACCESS_KEY_ID="AKIAFAKEFAKEFAKEFAKE",
            AWS_SECRET_ACCESS_KEY="a-real-looking-secret",
            MEDIA_CDN_BASE_URL="https://cdn.pratikshyafashion.com",
        )
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            create_storage_provider(cfg)
        self.assertIn("Automated tests may not use a real S3 bucket", str(ctx.exception))

    def test_the_opt_in_still_allows_a_deliberate_remote_soak_test(self):
        cfg = _settings(
            APP_ENV="test",
            STORAGE_PROVIDER="s3",
            AWS_BUCKET_NAME="pratikshya-media-staging",
            AWS_ACCESS_KEY_ID="AKIAFAKE",
            AWS_SECRET_ACCESS_KEY="secret",
            MEDIA_TEST_ALLOW_REMOTE_STORAGE=True,
        )
        codes = [i.code for i in fatal_issues(validate_storage_environment(cfg, ignore_pytest=True))]
        self.assertNotIn("REMOTE_STORAGE_IN_TESTS", codes)


# ===========================================================================
# 4. Development must keep working with no AWS at all
# ===========================================================================


class DevelopmentConfigurationTests(unittest.TestCase):
    def test_development_with_local_storage_has_no_fatal_issues(self):
        cfg = _settings(APP_ENV="development", STORAGE_PROVIDER="local")
        self.assertEqual(fatal_issues(validate_storage_environment(cfg, ignore_pytest=True)), [])

    def test_the_real_process_settings_are_a_valid_development_configuration(self):
        """No .env is committed, so the running process must be clean."""
        issues = validate_storage_environment(settings)
        self.assertEqual(fatal_issues(issues), [])
        self.assertEqual(classify_environment(settings.APP_ENV), TEST)  # under pytest

    def test_the_local_store_root_is_inside_the_repository(self):
        root = settings.local_media_root_path
        self.assertTrue(root.is_absolute())
        self.assertTrue(root.is_relative_to(settings.repository_root))

    def test_the_mock_asset_directory_is_flagged_as_an_upload_destination(self):
        mock_dir = settings.repository_root / "frontend" / "public" / "images"
        cfg = _settings(
            APP_ENV="development",
            STORAGE_PROVIDER="local",
            local_media_root_path=mock_dir / "products",
            repository_root=settings.repository_root,
        )
        codes = [i.code for i in validate_storage_environment(cfg, ignore_pytest=True)]
        self.assertIn("LOCAL_MEDIA_ROOT_IS_MOCK_DIR", codes)


# ===========================================================================
# 5. Mock assets survive everything
# ===========================================================================


class MockAssetPreservationTests(unittest.TestCase):
    MOCK_DIR = Path(__file__).resolve().parents[3] / "frontend" / "public" / "images"

    @unittest.skipUnless(MOCK_DIR.is_dir(), "mock asset library not present")
    def test_the_mock_library_is_still_complete_and_unmodified(self):
        expected = {
            "auth/pratikshya-auth-desktop.webp",
            "auth/pratikshya-auth-mobile.webp",
        }
        present = {
            str(p.relative_to(self.MOCK_DIR)).replace("\\", "/")
            for p in self.MOCK_DIR.rglob("*")
            if p.is_file()
        }
        self.assertTrue(expected.issubset(present))
        self.assertGreaterEqual(len(present), 200)

    @unittest.skipUnless(MOCK_DIR.is_dir(), "mock asset library not present")
    def test_the_importer_excludes_application_chrome_from_the_media_store(self):
        """Auth-screen art is Vite public/ chrome, not catalogue media."""
        from app.services.media.local_media_migration import (
            NON_MEDIA_SOURCE_DIRECTORIES,
            discover_source_files,
        )

        self.assertIn("auth", NON_MEDIA_SOURCE_DIRECTORIES)
        discovered = discover_source_files(self.MOCK_DIR)
        names = {str(p.relative_to(self.MOCK_DIR)).replace("\\", "/") for p in discovered}
        self.assertNotIn("auth/pratikshya-auth-desktop.webp", names)
        self.assertGreater(len(names), 0)
        # The excluded files are still on disk — nothing was moved or deleted.
        self.assertTrue((self.MOCK_DIR / "auth" / "pratikshya-auth-desktop.webp").is_file())


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
