"""
S3/CDN production readiness — the S3 storage adapter.

The adapter is exercised against an IN-MEMORY FAKE boto3 client that is
injected through the provider's `client=` seam. This matters for three
reasons:

  · no AWS account, no network and no credentials are needed, so the suite can
    run anywhere and can never write to a real bucket;
  · the fake can raise the exact boto3 error shapes (ClientError with
    `response.Error.Code`), which is how the error-translation and the
    "credentials failure must not look like 'object missing'" guards are
    verified;
  · every request the adapter makes is captured, so the security parameters
    (server-side encryption, checksum algorithm, conditional write) can be
    asserted rather than assumed.

Covered (docs/PRODUCT_MEDIA_S3_CDN_IMPLEMENTATION_PLAN.md §3.1, gaps S-1…S-8):

    put / get / open / metadata / exists / delete / list
    stable object keys, SSE + checksum parameters, conditional write,
    collision detection, error translation without credential leakage,
    bucket-identifier redaction, bounded listing, cache-control propagation.
"""

from __future__ import annotations

import io
import unittest
from typing import Any, Dict, List, Optional

from app.storage import InvalidObjectKeyError, ObjectMetadata
from app.storage.base import (
    ObjectCollisionError,
    ObjectNotFoundError,
    StorageProviderNotConfigured,
)
from app.storage.s3 import S3StorageProvider

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
AVIF_BYTES = (
    b"\x00\x00\x00\x1c" + b"ftypavif" + b"\x00\x00\x00\x00avifmif1" + b"\x00\x00\x00\x00"
)

KEY = "products/PF-W-SAR-SIL-0001/primary.png"


class FakeS3Error(Exception):
    """Mimics botocore's ClientError shape closely enough for translation."""

    def __init__(self, code: str, status: int = 400, message: str = ""):
        self.response = {
            "Error": {"Code": str(code), "Message": message or str(code)},
            "ResponseMetadata": {"HTTPStatusCode": status},
        }
        super().__init__(f"An error occurred ({code}) when calling the operation: {message or code}")


class FakePaginator:
    def __init__(self, store: Dict[str, bytes]):
        self._store = store

    def paginate(self, Bucket=None, Prefix="", PaginationConfig=None):  # noqa: N803
        max_items = (PaginationConfig or {}).get("MaxItems")
        keys = sorted(k for k in self._store if k.startswith(Prefix or ""))
        if max_items:
            keys = keys[: int(max_items)]
        yield {"Contents": [{"Key": key} for key in keys]}


class FakeS3Client:
    """In-memory stand-in for `boto3.client("s3")`."""

    def __init__(self, *, fail_head_with: Optional[Exception] = None):
        self.store: Dict[str, bytes] = {}
        self.metadata: Dict[str, Dict[str, Any]] = {}
        self.calls: List[Dict[str, Any]] = []
        self.fail_head_with = fail_head_with
        self.exceptions = type("Exceptions", (), {"NoSuchKey": type("NoSuchKey", (Exception,), {})})

    # -- recording helper ---------------------------------------------------
    def _record(self, operation: str, kwargs: Dict[str, Any]) -> None:
        self.calls.append({"operation": operation, **kwargs})

    # -- S3 surface ---------------------------------------------------------
    def put_object(self, **kwargs):
        self._record("put_object", kwargs)
        key = kwargs["Key"]
        if kwargs.get("IfNoneMatch") == "*" and key in self.store:
            raise FakeS3Error("PreconditionFailed", status=409)
        body = kwargs["Body"]
        self.store[key] = body
        self.metadata[key] = dict(kwargs)
        return {"ETag": '"fake-etag"'}

    def get_object(self, **kwargs):
        self._record("get_object", kwargs)
        key = kwargs["Key"]
        if key not in self.store:
            raise FakeS3Error("NoSuchKey", status=404)
        return {"Body": io.BytesIO(self.store[key]), "ContentLength": len(self.store[key])}

    def head_object(self, **kwargs):
        self._record("head_object", kwargs)
        if self.fail_head_with is not None:
            raise self.fail_head_with
        key = kwargs["Key"]
        if key not in self.store:
            raise FakeS3Error("404", status=404)
        stored = self.metadata.get(key, {})
        return {
            "ContentLength": len(self.store[key]),
            "ContentType": stored.get("ContentType") or "application/octet-stream",
            "Metadata": dict(stored.get("Metadata") or {}),
            "ETag": '"fake-etag"',
        }

    def delete_object(self, **kwargs):
        self._record("delete_object", kwargs)
        self.store.pop(kwargs["Key"], None)
        self.metadata.pop(kwargs["Key"], None)
        return {}

    def get_paginator(self, name):
        self._record("get_paginator", {"name": name})
        return FakePaginator(self.store)


def make_provider(**overrides) -> tuple:
    client = overrides.pop("client", None) or FakeS3Client()
    provider = S3StorageProvider(
        bucket=overrides.pop("bucket", "pratikshya-media-staging"),
        region=overrides.pop("region", "ap-south-1"),
        access_key_id=overrides.pop("access_key_id", "AKIAFAKEFAKEFAKEFAKE"),
        secret_access_key=overrides.pop("secret_access_key", "super-secret-value"),
        client=client,
        **overrides,
    )
    return provider, client


# ===========================================================================
# 1. Configuration
# ===========================================================================


class S3ConfigurationTests(unittest.TestCase):
    def test_placeholder_credentials_are_refused(self):
        """A copied-but-unfilled .env must never be mistaken for credentials."""
        for key_id, secret in (
            ("your-access-key", "your-secret-key"),
            ("", "real-looking-secret"),
            (None, None),
            ("AKIAFAKE", "changeme"),
        ):
            with self.subTest(key_id=key_id):
                with self.assertRaises(StorageProviderNotConfigured):
                    S3StorageProvider(
                        bucket="pratikshya-media-staging",
                        region="ap-south-1",
                        access_key_id=key_id,
                        secret_access_key=secret,
                    )

    def test_a_missing_bucket_or_region_is_refused(self):
        with self.assertRaises(StorageProviderNotConfigured):
            S3StorageProvider(
                bucket="",
                region="ap-south-1",
                access_key_id="AKIAFAKE",
                secret_access_key="secret",
            )
        with self.assertRaises(StorageProviderNotConfigured):
            S3StorageProvider(
                bucket="pratikshya-media-staging",
                region="",
                access_key_id="AKIAFAKE",
                secret_access_key="secret",
            )

    def test_real_looking_credentials_are_accepted(self):
        """
        Regression guard for S-9.

        `PLACEHOLDER_CREDENTIAL_PREFIXES` used to end with the empty string,
        and `"anything".startswith("")` is always True — so EVERY credential,
        real ones included, was classified as a placeholder and the S3
        provider could never be constructed at all.
        """
        for key_id, secret in (
            ("AKIAFAKEFAKEFAKEFAKE", "a-real-looking-secret"),
            ("ASIAZZZZZZZZZZZZZZZZ", "another/secret+value="),
            ("local-minio-key", "local-minio-secret"),
        ):
            with self.subTest(key_id=key_id):
                provider, _ = make_provider(
                    access_key_id=key_id, secret_access_key=secret
                )
                self.assertEqual(provider.name, "s3")

    def test_constructing_does_not_import_boto3_or_touch_the_network(self):
        provider, client = make_provider()
        self.assertEqual(client.calls, [])
        self.assertEqual(provider.name, "s3")


# ===========================================================================
# 2. Operations
# ===========================================================================


class S3OperationTests(unittest.TestCase):
    def setUp(self):
        self.provider, self.client = make_provider()

    def test_put_then_get_round_trips_the_exact_bytes(self):
        stored = self.provider.put_object(KEY, PNG_BYTES, content_type="image/png")
        self.assertTrue(stored.created)
        self.assertEqual(stored.key, KEY)
        self.assertEqual(self.provider.get_object(KEY), PNG_BYTES)
        self.assertEqual(stored.metadata.size, len(PNG_BYTES))
        self.assertEqual(stored.metadata.provider, "s3")

    def test_object_keys_are_stable_and_portable(self):
        """The same key the local provider uses, byte for byte."""
        self.provider.put_object(KEY, PNG_BYTES)
        self.assertIn(KEY, self.client.store)
        with self.assertRaises(InvalidObjectKeyError):
            self.provider.put_object("../escape/passwd", PNG_BYTES)
        with self.assertRaises(InvalidObjectKeyError):
            self.provider.put_object("products\\PF-A\\a.png", PNG_BYTES)

    def test_put_sends_server_side_encryption_and_checksum(self):
        self.provider.put_object(KEY, PNG_BYTES)
        call = self.client.calls[-1]
        self.assertEqual(call["operation"], "put_object")
        self.assertEqual(call["ServerSideEncryption"], "AES256")
        self.assertEqual(call["ChecksumAlgorithm"], "SHA256")
        self.assertEqual(call["Bucket"], "pratikshya-media-staging")

    def test_kms_encryption_is_supported(self):
        provider, client = make_provider(
            sse_algorithm="aws:kms", sse_kms_key_id="arn:aws:kms:ap-south-1:1:key/abc"
        )
        provider.put_object(KEY, PNG_BYTES)
        call = client.calls[-1]
        self.assertEqual(call["ServerSideEncryption"], "aws:kms")
        self.assertEqual(call["SSEKMSKeyId"], "arn:aws:kms:ap-south-1:1:key/abc")

    def test_checksum_is_persisted_so_metadata_is_a_head_request(self):
        import hashlib

        expected = hashlib.sha256(PNG_BYTES).hexdigest()
        self.provider.put_object(KEY, PNG_BYTES)
        self.client.calls.clear()
        metadata = self.provider.get_metadata(KEY)
        self.assertEqual(metadata.checksum_sha256, expected)
        self.assertEqual(metadata.size, len(PNG_BYTES))
        # No download: HEAD only.
        self.assertEqual([c["operation"] for c in self.client.calls], ["head_object"])

    def test_metadata_falls_back_to_streaming_when_no_checksum_was_stored(self):
        import hashlib

        # Simulate a pre-existing object written before checksums were kept.
        self.client.store[KEY] = PNG_BYTES
        self.client.metadata[KEY] = {"ContentType": "image/png"}
        expected = hashlib.sha256(PNG_BYTES).hexdigest()
        self.assertEqual(self.provider.get_metadata(KEY).checksum_sha256, expected)

    def test_cache_control_is_propagated_to_the_object(self):
        immutable = "public, max-age=31536000, immutable"
        self.provider.put_object(KEY, PNG_BYTES, cache_control=immutable)
        self.assertEqual(self.client.calls[-1]["CacheControl"], immutable)

    def test_conditional_write_refuses_to_overwrite(self):
        self.provider.put_object(KEY, PNG_BYTES)
        with self.assertRaises(ObjectCollisionError):
            self.provider.put_object(KEY, AVIF_BYTES, expect_absent=True)

    def test_a_normal_write_still_replaces_but_the_service_layer_guards_it(self):
        """The adapter honours the caller; MediaService owns the policy."""
        self.provider.put_object(KEY, PNG_BYTES)
        self.provider.put_object(KEY, AVIF_BYTES)
        self.assertEqual(self.provider.get_object(KEY), AVIF_BYTES)

    def test_open_object_streams_and_exists_reports_truthfully(self):
        self.provider.put_object(KEY, PNG_BYTES)
        self.assertTrue(self.provider.object_exists(KEY))
        stream = self.provider.open_object(KEY)
        try:
            self.assertEqual(stream.read(), PNG_BYTES)
        finally:
            stream.close()
        self.assertFalse(self.provider.object_exists("products/PF-W-SAR-SIL-0001/absent.png"))

    def test_delete_reports_whether_it_removed_something(self):
        self.provider.put_object(KEY, PNG_BYTES)
        self.assertTrue(self.provider.delete_object(KEY))
        self.assertFalse(self.provider.delete_object(KEY))
        self.assertFalse(self.provider.object_exists(KEY))

    def test_missing_object_raises_object_not_found(self):
        with self.assertRaises(ObjectNotFoundError):
            self.provider.get_object("products/PF-A/absent.png")
        with self.assertRaises(ObjectNotFoundError):
            self.provider.get_metadata("products/PF-A/absent.png")
        with self.assertRaises(ObjectNotFoundError):
            self.provider.open_object("products/PF-A/absent.png")

    def test_listing_is_bounded_and_prefix_scoped(self):
        for key in (KEY, "products/PF-W-SAR-SIL-0001/02.png", "hero/hero001.avif"):
            self.provider.put_object(key, PNG_BYTES)
        self.assertEqual(
            list(self.provider.list_objects("products/PF-W-SAR-SIL-0001")),
            ["products/PF-W-SAR-SIL-0001/02.png", KEY],
        )
        self.assertEqual(len(list(self.provider.list_objects(limit=1))), 1)
        self.assertEqual(list(self.provider.list_objects(limit=0)), [])

    def test_content_type_defaults_from_the_validated_key(self):
        self.provider.put_object("products/PF-W-SAR-SIL-0001/a.avif", AVIF_BYTES)
        metadata = self.provider.get_metadata("products/PF-W-SAR-SIL-0001/a.avif")
        self.assertEqual(metadata.content_type, "image/avif")


# ===========================================================================
# 3. Error handling — no leakage, no silent "object missing"
# ===========================================================================


class S3ErrorHandlingTests(unittest.TestCase):
    def test_a_credentials_failure_is_never_reported_as_a_missing_object(self):
        """S-2: the old adapter swallowed every exception → silent overwrite."""
        client = FakeS3Client(fail_head_with=FakeS3Error("AccessDenied", status=403))
        provider, _ = make_provider(client=client)
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            provider.object_exists(KEY)
        self.assertIn("AccessDenied", str(ctx.exception))
        self.assertNotIn("super-secret", str(ctx.exception))

    def test_error_messages_carry_the_s3_code_but_no_boto_text(self):
        client = FakeS3Client(fail_head_with=FakeS3Error("SlowDown", status=503))
        provider, _ = make_provider(client=client)
        with self.assertRaises(StorageProviderNotConfigured) as ctx:
            provider.object_exists(KEY)
        message = str(ctx.exception)
        self.assertIn("SlowDown", message)
        self.assertNotIn("An error occurred", message)
        self.assertNotIn("bucket.s3.amazonaws.com", message)

    def test_the_secret_key_never_appears_in_any_error_message(self):
        provider, _ = make_provider(secret_access_key="super-secret-value")
        for operation in (
            lambda: provider.get_object("products/PF-A/absent.png"),
            lambda: provider.delete_object("products/PF-A/absent.png"),
        ):
            try:
                operation()
            except Exception as exc:  # noqa: BLE001
                self.assertNotIn("super-secret", str(exc))
                self.assertNotIn("AKIAFAKEFAKEFAKEFAKE", str(exc))

    def test_no_such_key_maps_to_object_not_found(self):
        provider, _ = make_provider()
        # `object_exists` answers False — it must NOT raise for a plain miss…
        self.assertFalse(provider.object_exists("products/PF-A/absent.png"))
        # …while the read operations raise.
        with self.assertRaises(ObjectNotFoundError):
            provider.get_object("products/PF-A/absent.png")

    def test_describe_redacts_the_bucket_for_anonymous_status(self):
        provider, _ = make_provider(bucket="pratikshya-media-prod")
        payload = provider.describe()
        self.assertEqual(payload["bucket"], "<redacted>")
        self.assertNotIn("pratikshya-media-prod", str(payload))

    def test_describe_includes_the_bucket_only_when_identifiers_are_requested(self):
        provider, _ = make_provider(bucket="pratikshya-media-prod")
        payload = provider.describe(include_identifiers=True)
        self.assertEqual(payload["bucket"], "pratikshya-media-prod")
        self.assertNotIn("super-secret", str(payload))

    def test_describe_never_leaks_credentials_in_either_mode(self):
        provider, _ = make_provider()
        for include in (False, True):
            serialised = str(provider.describe(include_identifiers=include))
            self.assertNotIn("AKIAFAKEFAKEFAKEFAKE", serialised)
            self.assertNotIn("super-secret", serialised)

    def test_mask_bucket_identifies_without_targeting(self):
        self.assertEqual(
            S3StorageProvider.mask_bucket("pratikshya-media-prod"), "prat…prod"
        )
        self.assertEqual(S3StorageProvider.mask_bucket(""), "")


# ===========================================================================
# 4. URL / CDN behaviour (provider half)
# ===========================================================================


class S3UrlTests(unittest.TestCase):
    def setUp(self):
        from app.config import settings

        self._saved_cdn = settings.MEDIA_CDN_BASE_URL
        self.provider, _ = make_provider()

    def tearDown(self):
        from app.config import settings

        settings.MEDIA_CDN_BASE_URL = self._saved_cdn

    def test_without_a_cdn_the_url_is_the_api_media_route(self):
        from app.config import settings

        settings.MEDIA_CDN_BASE_URL = None
        self.assertEqual(
            self.provider.url_for(KEY), f"/api/v1/media/objects/{KEY}"
        )

    def test_with_a_cdn_the_url_is_the_canonical_cdn_url(self):
        from app.config import settings

        settings.MEDIA_CDN_BASE_URL = "https://cdn.pratikshyafashion.com/"
        self.assertEqual(
            self.provider.url_for(KEY),
            f"https://cdn.pratikshyafashion.com/{KEY}",
        )

    def test_url_for_rejects_an_unusable_key(self):
        with self.assertRaises(InvalidObjectKeyError):
            self.provider.url_for("../../etc/passwd")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
