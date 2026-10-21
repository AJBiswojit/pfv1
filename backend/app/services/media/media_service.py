"""
app/services/media/media_service.py — object-storage operations (Phase 6).

`MediaService` is the ONLY service that touches media bytes. It sits between
the API routes and the `app/storage` abstraction, which means the routes
never build a key or a path themselves and the frontend never learns whether
the bytes live on local disk or in S3.

Scope, honestly:
  · OBJECT operations (put / read / metadata / exists / delete / URL) are
    fully implemented on the local provider and are what Phase 6 delivers.
  · MEDIA RECORDS (rows in `media_media_asset`, product↔media mappings in
    `media_product_media`, review rows) remain BLOCKED: those model classes
    declare a table name and no business columns, and Phase 6 is forbidden
    from inventing schema. Nothing here fakes a record — see
    PHASE_6_IMPLEMENTATION_REPORT.md §19.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.core.logging import get_logger
from app.storage import (
    ALLOWED_NAMESPACES,
    InvalidObjectKeyError,
    ObjectCollisionError,
    ObjectMetadata,
    ObjectNotFoundError,
    StorageProvider,
    StoredObject,
    cache_control_for_key,
    content_addressed_product_key,
    content_type_for_key,
    get_storage_provider,
    is_safe_object_key,
    normalize_object_key,
    object_key_for_namespace,
    object_key_from_media_url,
    product_object_key,
    reset_storage_provider,
)
from app.services.media.media_validation import (
    MediaValidationError,
    validate_image_bytes,
)

logger = get_logger("app.services.media")


def _content_addressed_variant(object_key: str, checksum_sha256: str) -> str:
    """
    Content-addressed sibling of an existing object key.

    `hero/banner.avif` → `hero/banner-0123456789ab.avif`. Used for
    non-product namespaces, where the deterministic key has no product id to
    derive from.
    """
    from app.storage.keys import content_addressed_filename, normalize_object_key

    safe_key = normalize_object_key(object_key)
    head, _, leaf = safe_key.rpartition("/")
    leaf = content_addressed_filename(leaf, checksum_sha256)
    return f"{head}/{leaf}" if head else leaf


class MediaService:
    """
    Object-level media operations.

    `db_session` is accepted for signature compatibility with the rest of the
    service layer and for the future media-register work; the object store
    itself is not database-backed.
    """

    def __init__(self, db_session=None, storage: Optional[StorageProvider] = None):
        self.db = db_session
        self._storage = storage

    # -- provider access -----------------------------------------------------

    @property
    def storage(self) -> StorageProvider:
        """Injected provider, or the process-wide configured one."""
        if self._storage is None:
            self._storage = get_storage_provider()
        return self._storage

    # -- key helpers ---------------------------------------------------------

    @staticmethod
    def object_key_for_upload(
        filename: str,
        *,
        namespace: str = "products",
        product_id: Optional[str] = None,
        group: Optional[str] = None,
    ) -> str:
        """
        Deterministic object key for an upload.

        Product media → `products/{PRODUCT_ID}/{filename}`.
        Other namespaces → `{namespace}/{group?}/{filename}`.

        The key is derived from real identity, never from a random temp name,
        so a re-upload of the same asset lands on the same key and can be
        compared by checksum instead of silently duplicated.
        """
        if namespace == "products":
            if not product_id:
                raise InvalidObjectKeyError(
                    "A product id is required for product media uploads."
                )
            return product_object_key(product_id, filename)
        if namespace not in ALLOWED_NAMESPACES:
            raise InvalidObjectKeyError(
                f"Namespace '{namespace}' is not a served media namespace."
            )
        if group:
            return object_key_for_namespace(namespace, group, filename=filename)
        return object_key_for_namespace(namespace, filename=filename)

    @staticmethod
    def coerce_object_key(value: str) -> str:
        """
        Accept either an object key or a previously issued media URL and
        return a validated object key.
        """
        text = str(value or "").strip()
        if not text:
            raise InvalidObjectKeyError("Object key is empty.")
        if "/" in text and not is_safe_object_key(text):
            from_key = object_key_from_media_url(text)
            if from_key:
                return from_key
        return normalize_object_key(text)

    # -- read operations -----------------------------------------------------

    def object_exists(self, key: str) -> bool:
        try:
            return self.storage.object_exists(self.coerce_object_key(key))
        except InvalidObjectKeyError:
            return False

    def object_metadata(self, key: str) -> ObjectMetadata:
        return self.storage.get_metadata(self.coerce_object_key(key))

    def read_object(self, key: str) -> tuple[bytes, str]:
        """Return `(bytes, content_type)`. Raises ObjectNotFoundError."""
        safe_key = self.coerce_object_key(key)
        data = self.storage.get_object(safe_key)
        return data, content_type_for_key(safe_key)

    def open_object(self, key: str):
        """Stream handle for the media route's `FileResponse`."""
        return self.storage.open_object(self.coerce_object_key(key))

    def object_url(self, key: str) -> str:
        """Canonical application-level (or CDN) URL for an object key."""
        from app.storage import build_media_url

        return build_media_url(self.coerce_object_key(key))

    def list_objects(self, prefix: str = "") -> List[str]:
        safe_prefix = ""
        if prefix:
            safe_prefix = normalize_object_key(
                f"{str(prefix).strip().strip('/')}/x"
            ).rsplit("/", 1)[0]
        return list(self.storage.list_objects(safe_prefix))

    # -- write operations ----------------------------------------------------

    def store_image(
        self,
        *,
        filename: str,
        data: bytes,
        namespace: str = "products",
        product_id: Optional[str] = None,
        group: Optional[str] = None,
        object_key: Optional[str] = None,
        replace_existing: bool = False,
    ) -> Dict[str, Any]:
        """
        Validate and store one image.

        Returns a JSON-safe descriptor: object key, canonical URL, size,
        content type, SHA-256 and whether this call created the object.

        Collision policy (never a silent overwrite):
          · an existing object with IDENTICAL bytes → reported as already
            present, nothing is written (this is what makes re-runs safe);
          · an existing object with DIFFERENT bytes and `replace_existing`
            False → `ObjectCollisionError` (HTTP 409). Nothing is written;
          · an existing object with DIFFERENT bytes and `replace_existing`
            True → the new bytes are written to a NEW CONTENT-ADDRESSED key
            (`products/{ID}/{stem}-{sha256[:12]}.{ext}`), never onto the old
            one. The old object and its asset row survive as history, and no
            browser or CDN cache can serve the new art under the old URL.
            The response then carries `replacedKey` / `replacedFromKey`.

        Cache policy: a content-addressed key is immutable and is stored with
        `Cache-Control: public, max-age=31536000, immutable`; every other key
        keeps a short revalidating TTL because an administrator may replace it.
        """
        validated = validate_image_bytes(filename, data)
        safe_key = (
            self.coerce_object_key(object_key)
            if object_key
            else self.object_key_for_upload(
                filename,
                namespace=namespace,
                product_id=product_id,
                group=group,
            )
        )
        replaced_from: Optional[str] = None

        if self.storage.object_exists(safe_key):
            existing = self.storage.get_metadata(safe_key)
            if existing.checksum_sha256 == validated.checksum_sha256:
                return {
                    "key": safe_key,
                    "url": self.storage.url_for(safe_key),
                    "created": False,
                    "alreadyExists": True,
                    "size": validated.size,
                    "contentType": validated.content_type,
                    "checksumSha256": validated.checksum_sha256,
                    "cacheControl": cache_control_for_key(safe_key),
                }
            if not replace_existing:
                raise ObjectCollisionError(
                    "A different object already exists at this key. Nothing was "
                    "overwritten.",
                    key=safe_key,
                )
            replaced_from = safe_key
            safe_key = (
                content_addressed_product_key(product_id, filename, validated.checksum_sha256)
                if namespace == "products" and product_id
                else _content_addressed_variant(safe_key, validated.checksum_sha256)
            )

        stored: StoredObject = self.storage.put_object(
            safe_key,
            data,
            content_type=validated.content_type,
            cache_control=cache_control_for_key(safe_key),
        )
        logger.info(
            "Media object stored provider=%s key=%s size=%s sha256=%s%s",
            getattr(self.storage, "name", "unknown"),
            safe_key,
            validated.size,
            validated.checksum_sha256[:12],
            f" replaced_from={replaced_from}" if replaced_from else "",
        )
        return {
            "key": stored.key,
            "url": stored.url,
            "created": True,
            "alreadyExists": False,
            "size": validated.size,
            "contentType": validated.content_type,
            "checksumSha256": validated.checksum_sha256,
            "cacheControl": cache_control_for_key(stored.key),
            "replaced": replaced_from is not None,
            "replacedKey": stored.key if replaced_from else None,
            "replacedFromKey": replaced_from,
        }

    def delete_object(self, key: str) -> bool:
        """
        Delete an object from the store.

        Deliberately narrow: this removes ONE explicitly named object. There
        is no garbage collection and no cascade — Phase 6 never deletes an
        object merely because a UI list changed, and never touches the
        original `frontend/public/images` assets.
        """
        safe_key = self.coerce_object_key(key)
        deleted = self.storage.delete_object(safe_key)
        if deleted:
            logger.info("Media object deleted key=%s", safe_key)
        return deleted

    # -- status --------------------------------------------------------------

    @staticmethod
    def storage_status(*, include_identifiers: bool = False) -> Dict[str, Any]:
        """
        Non-secret provider summary (see `app.storage.storage_status`).

        `include_identifiers` un-redacts the S3 bucket name; only an
        authenticated staff-facing call path may set it, because the public
        status payload must not disclose a private bucket's identity.
        """
        from app.storage import storage_status as _status

        return _status(include_identifiers=include_identifiers)


__all__ = [
    "MediaService",
    "MediaValidationError",
    "ObjectCollisionError",
    "ObjectNotFoundError",
    "reset_storage_provider",
]
