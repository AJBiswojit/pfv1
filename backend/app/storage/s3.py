"""
app/storage/s3.py — production S3 adapter.

This is the provider a staging or production deployment runs on. Its method
set mirrors `LocalStorageProvider` one-for-one — put / get / open / delete /
exists / metadata / url / list — which is the whole point of
`StorageProvider`: switching `STORAGE_PROVIDER` from `local` to `s3` changes
nothing in the product, media or frontend layers.

Security posture
----------------
  · `boto3` is imported LAZILY, inside `_require_client()`. Importing this
    module performs no AWS call and costs nothing.
  · Credentials are never logged, never serialised and never appear in an
    error message. `describe()` redacts the bucket name unless the caller is
    an authenticated administrator-facing path.
  · Objects are written with server-side encryption and a SHA-256 checksum,
    and the bucket is expected to be private behind CloudFront OAC.
  · Placeholder values shipped in `.env.example` count as "not configured",
    so a copied-but-unfilled `.env` cannot be mistaken for real credentials.

Correctness posture
-------------------
  · A write never silently overwrites different bytes: `expect_absent=True`
    uses the S3 conditional-write header (`If-None-Match: *`), and
    `MediaService.store_image` additionally compares checksums before writing.
  · `object_exists` distinguishes "the object is absent" from "S3 could not be
    reached". The previous implementation swallowed every exception and
    returned False, which turned a transient credentials/network failure into
    "no object here" — and therefore into a silent overwrite of real art.
  · Errors are translated into the storage error vocabulary with a sanitised
    message. boto3 exception text (which can contain ARNs, request ids and
    endpoint hostnames) is never surfaced to a caller.

Object keys are used verbatim as S3 object names — the same
`products/{PRODUCT_ID}/{filename}` convention the local provider uses.
"""

from __future__ import annotations

from typing import Any, BinaryIO, Dict, Iterator, Optional

from app.storage.base import (
    ObjectCollisionError,
    ObjectMetadata,
    ObjectNotFoundError,
    StorageProvider,
    StorageProviderNotConfigured,
    StoredObject,
)
from app.storage.keys import normalize_object_key
from app.storage.local import content_type_for_key, sha256_bytes, sha256_stream
from app.storage.urls import build_media_url

#: Marker values shipped in `.env.example`. Treated as "not configured" so a
#: copied-but-unfilled `.env` cannot be mistaken for real credentials.
#:
#: NOTE: this tuple must NOT contain the empty string. `"".join(...)` aside,
#: `"anything".startswith("")` is always True, which used to make every
#: credential — real ones included — count as a placeholder and therefore made
#: the S3 provider impossible to construct even with valid keys.
PLACEHOLDER_CREDENTIAL_PREFIXES = ("your-", "changeme", "placeholder")

#: S3 error codes that mean "there is no object at this key".
_NOT_FOUND_CODES = frozenset({"404", "NoSuchKey", "NotFound", "NoSuchVersion"})

#: Metadata header the provider stores the content checksum in, so
#: `get_metadata()` can answer from a HEAD request instead of downloading the
#: object again.
CHECKSUM_METADATA_KEY = "sha256"


def _is_placeholder(value: Optional[str]) -> bool:
    text = (value or "").strip()
    if not text:
        return True
    lowered = text.lower()
    return any(lowered.startswith(prefix) for prefix in PLACEHOLDER_CREDENTIAL_PREFIXES)


class S3StorageProvider(StorageProvider):
    """
    S3-compatible object storage.

    Configuration contract (see `.env.example`; credentials come from the
    deployment platform — a workload role where available):

        STORAGE_PROVIDER=s3
        AWS_BUCKET_NAME=…
        AWS_REGION=…
        AWS_ACCESS_KEY_ID=…            (or a workload role / instance profile)
        AWS_SECRET_ACCESS_KEY=…        (or a workload role / instance profile)
        MEDIA_CDN_BASE_URL=https://cdn.example.com
        AWS_S3_SSE_ALGORITHM=AES256    (or aws:kms + AWS_S3_SSE_KMS_KEY_ID)
    """

    name = "s3"

    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        access_key_id: Optional[str],
        secret_access_key: Optional[str],
        endpoint_url: Optional[str] = None,
        sse_algorithm: Optional[str] = None,
        sse_kms_key_id: Optional[str] = None,
        client: Optional[Any] = None,
    ):
        self._bucket = (bucket or "").strip()
        self._region = (region or "").strip()
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._endpoint_url = (endpoint_url or "").strip() or None
        self._sse_algorithm = (sse_algorithm or "AES256").strip() or "AES256"
        self._sse_kms_key_id = (sse_kms_key_id or "").strip() or None
        # `client` is the dependency-injection seam used by the test-suite: it
        # lets the adapter be exercised without AWS access or network.
        self._client = client

        missing = [
            label
            for label, ok in (
                ("AWS_BUCKET_NAME", bool(self._bucket)),
                ("AWS_REGION", bool(self._region)),
                ("AWS_ACCESS_KEY_ID", not _is_placeholder(self._access_key_id)),
                ("AWS_SECRET_ACCESS_KEY", not _is_placeholder(self._secret_access_key)),
            )
            if not ok
        ]
        if missing:
            raise StorageProviderNotConfigured(
                "STORAGE_PROVIDER=s3 was selected but the S3 configuration is "
                "incomplete: " + ", ".join(missing) + ". "
                "Development runs on STORAGE_PROVIDER=local, which needs no AWS "
                "credentials. Credentials must be injected by the deployment "
                "platform (workload role or secret manager), never committed."
            )

    # -- internals -----------------------------------------------------------

    def _require_client(self):
        """Lazily import boto3 and build the client once."""
        if self._client is not None:
            return self._client
        try:
            import boto3  # noqa: PLC0415 — intentionally lazy
        except ImportError as exc:  # pragma: no cover - boto3 is in requirements
            raise StorageProviderNotConfigured(
                "boto3 is not installed; the S3 provider cannot start."
            ) from exc
        self._client = boto3.client(
            "s3",
            region_name=self._region,
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
            endpoint_url=self._endpoint_url,
        )
        return self._client

    @staticmethod
    def _not_found(key: str) -> ObjectNotFoundError:
        return ObjectNotFoundError("Object not found in S3.", key=key)

    @staticmethod
    def _error_code(exc: Exception) -> str:
        """The S3/boto error code for `exc`, or `""` when it has none."""
        response = getattr(exc, "response", None) or {}
        error = response.get("Error") or {}
        code = error.get("Code") or getattr(exc, "response", {}).get("HTTPStatusCode") or ""
        if code:
            return str(code)
        for attribute in ("Code", "error_code"):
            value = getattr(exc, attribute, None)
            if value:
                return str(value)
        return ""

    def _sse_kwargs(self) -> Dict[str, str]:
        kwargs = {"ServerSideEncryption": self._sse_algorithm}
        if self._sse_algorithm.lower() == "aws:kms" and self._sse_kms_key_id:
            kwargs["SSEKMSKeyId"] = self._sse_kms_key_id
        return kwargs

    def _head(self, key: str) -> Dict[str, Any]:
        client = self._require_client()
        try:
            return client.head_object(Bucket=self._bucket, Key=key)
        except Exception as exc:  # noqa: BLE001 - translated below
            code = self._error_code(exc)
            if code in _NOT_FOUND_CODES or "NoSuchKey" in type(exc).__name__:
                raise self._not_found(key) from None
            label = f" (S3 error: {code})" if code else ""
            raise StorageProviderNotConfigured(
                f"Could not read object metadata from S3{label}."
            ) from None

    # -- provider interface --------------------------------------------------

    def put_object(
        self,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        *,
        expect_absent: bool = False,
        cache_control: Optional[str] = None,
    ) -> StoredObject:
        """
        Write `data` at `key`.

        `expect_absent=True` requests an S3 conditional write, so a
        pre-existing object raises `ObjectCollisionError` instead of being
        overwritten.
        """
        safe_key = normalize_object_key(key)
        client = self._require_client()
        resolved_type = content_type or content_type_for_key(safe_key)
        checksum = sha256_bytes(data)
        stored_metadata = dict(metadata or {})
        # Persisted so `get_metadata()` can answer from a HEAD request.
        stored_metadata.setdefault(CHECKSUM_METADATA_KEY, checksum)
        kwargs: Dict[str, Any] = dict(
            Bucket=self._bucket,
            Key=safe_key,
            Body=data,
            ContentType=resolved_type,
            Metadata=stored_metadata,
            ChecksumAlgorithm="SHA256",
            **self._sse_kwargs(),
        )
        if cache_control:
            kwargs["CacheControl"] = cache_control
        if expect_absent:
            kwargs["IfNoneMatch"] = "*"
        try:
            client.put_object(**kwargs)
        except Exception as exc:  # noqa: BLE001 - translated below
            code = self._error_code(exc)
            if code in ("PreconditionFailed", "ConditionalRequestConflict", "409"):
                raise ObjectCollisionError(
                    "A different object already exists at this key. Nothing was "
                    "overwritten.",
                    key=safe_key,
                ) from None
            label = f" (S3 error: {code})" if code else ""
            raise StorageProviderNotConfigured(
                f"Could not write the object to S3{label}."
            ) from None
        object_metadata = ObjectMetadata(
            key=safe_key,
            size=len(data),
            content_type=resolved_type,
            checksum_sha256=checksum,
            provider=self.name,
        )
        return StoredObject(
            key=safe_key,
            url=build_media_url(safe_key),
            metadata=object_metadata,
            created=True,
            checksum_sha256=checksum,
        )

    def get_object(self, key: str) -> bytes:
        safe_key = normalize_object_key(key)
        client = self._require_client()
        try:
            response = client.get_object(Bucket=self._bucket, Key=safe_key)
        except Exception as exc:  # noqa: BLE001 - translated below
            code = self._error_code(exc)
            if code in _NOT_FOUND_CODES or "NoSuchKey" in type(exc).__name__:
                raise self._not_found(safe_key) from None
            label = f" (S3 error: {code})" if code else ""
            raise StorageProviderNotConfigured(f"Could not read the object from S3{label}.") from None
        body = response["Body"]
        try:
            try:
                return body.read()
            except Exception as exc:  # noqa: BLE001 - translated below
                # A download can fail PART WAY THROUGH (connection reset,
                # checksum mismatch). That raise happens outside `get_object`,
                # so it must be translated here too or a raw botocore message —
                # which embeds the endpoint host, the assumed-role ARN and the
                # request id — would reach the caller.
                code = self._error_code(exc)
                if code in _NOT_FOUND_CODES or "NoSuchKey" in type(exc).__name__:
                    raise self._not_found(safe_key) from None
                label = f" (S3 error: {code})" if code else ""
                raise StorageProviderNotConfigured(
                    f"Could not read the object body from S3{label}."
                ) from None
        finally:
            close = getattr(body, "close", None)
            if close:
                try:
                    close()
                except Exception:  # pragma: no cover - never mask the real error
                    pass

    def open_object(self, key: str) -> BinaryIO:
        safe_key = normalize_object_key(key)
        client = self._require_client()
        try:
            response = client.get_object(Bucket=self._bucket, Key=safe_key)
        except Exception as exc:  # noqa: BLE001 - translated below
            code = self._error_code(exc)
            if code in _NOT_FOUND_CODES or "NoSuchKey" in type(exc).__name__:
                raise self._not_found(safe_key) from None
            label = f" (S3 error: {code})" if code else ""
            raise StorageProviderNotConfigured(f"Could not open the object from S3{label}.") from None
        return response["Body"]

    def delete_object(self, key: str) -> bool:
        safe_key = normalize_object_key(key)
        try:
            self._head(safe_key)
        except ObjectNotFoundError:
            return False
        client = self._require_client()
        try:
            client.delete_object(Bucket=self._bucket, Key=safe_key)
        except Exception as exc:  # noqa: BLE001 - translated below
            code = self._error_code(exc)
            label = f" (S3 error: {code})" if code else ""
            raise StorageProviderNotConfigured(f"Could not delete the object from S3{label}.") from None
        return True

    def object_exists(self, key: str) -> bool:
        safe_key = normalize_object_key(key)
        try:
            self._head(safe_key)
            return True
        except ObjectNotFoundError:
            return False

    def get_metadata(self, key: str) -> ObjectMetadata:
        safe_key = normalize_object_key(key)
        head = self._head(safe_key)
        stored = (head.get("Metadata") or {}) or {}
        checksum = str(stored.get(CHECKSUM_METADATA_KEY) or "").strip().lower()
        if len(checksum) != 64:
            # Pre-existing object written before checksums were recorded: fall
            # back to streaming it once. Costly, but correctness wins and this
            # path disappears after the first re-upload.
            stream = self.open_object(safe_key)
            try:
                try:
                    checksum = sha256_stream(stream)
                except Exception as exc:  # noqa: BLE001 - translated below
                    # Mid-download failure: translate before the raw botocore
                    # text (endpoint / ARN / request id) can escape.
                    code = self._error_code(exc)
                    if code in _NOT_FOUND_CODES or "NoSuchKey" in type(exc).__name__:
                        raise self._not_found(safe_key) from None
                    label = f" (S3 error: {code})" if code else ""
                    raise StorageProviderNotConfigured(
                        f"Could not read the object body from S3{label}."
                    ) from None
            finally:
                close = getattr(stream, "close", None)
                if close:
                    try:
                        close()
                    except Exception:  # pragma: no cover - never mask the real error
                        pass
        last_modified = head.get("LastModified")
        return ObjectMetadata(
            key=safe_key,
            size=int(head.get("ContentLength") or 0),
            content_type=head.get("ContentType") or content_type_for_key(safe_key),
            checksum_sha256=checksum,
            last_modified=last_modified.isoformat() if last_modified else None,
            etag=(head.get("ETag") or "").strip('"') or None,
            provider=self.name,
        )

    def url_for(self, key: str) -> str:
        return build_media_url(key)

    def list_objects(self, prefix: str = "", limit: Optional[int] = None) -> Iterator[str]:
        if limit is not None and limit <= 0:
            return
        config: Dict[str, Any] = {"MaxItems": int(limit)} if limit is not None else {}
        try:
            # `get_paginator` is INSIDE the guard: it can raise on its own
            # (unknown operation, credential failure) and its message would
            # otherwise carry the raw endpoint/ARN text.
            client = self._require_client()
            paginator = client.get_paginator("list_objects_v2")
            pages = paginator.paginate(
                Bucket=self._bucket, Prefix=prefix or "", PaginationConfig=config or None
            )
            emitted = 0
            for page in pages:
                for entry in page.get("Contents", []) or []:
                    yield entry["Key"]
                    emitted += 1
                    if limit is not None and emitted >= limit:
                        return
        except Exception as exc:  # noqa: BLE001 - translated below
            code = self._error_code(exc)
            label = f" (S3 error: {code})" if code else ""
            raise StorageProviderNotConfigured(f"Could not list objects in S3{label}.") from None

    def describe(self, *, include_identifiers: bool = False) -> Dict[str, Any]:
        """
        Safe description.

        Credentials are never part of this payload and never logged. The bucket
        NAME is redacted unless `include_identifiers` is set, because
        `GET /media/storage/status` is reachable without authentication and a
        private bucket's identity is operational detail, not public contract.
        """
        from app.storage.urls import cdn_base_url

        return {
            "provider": self.name,
            "bucket": self._bucket if include_identifiers else "<redacted>",
            "region": self._region,
            "serverSideEncryption": self._sse_algorithm,
            "cdnConfigured": bool(cdn_base_url()),
        }

    @staticmethod
    def mask_bucket(bucket: str) -> str:
        """`pratikshya-media-prod` → `prat…prod` — enough to identify, not to target."""
        text = (bucket or "").strip()
        if len(text) <= 8:
            return text[:2] + "…" if text else ""
        return f"{text[:4]}…{text[-4:]}"


__all__ = ["S3StorageProvider", "CHECKSUM_METADATA_KEY", "PLACEHOLDER_CREDENTIAL_PREFIXES"]
