"""Storage ↔ registry integrity guards shared by the media registration paths.

The registry row is a *snapshot* of the stored object at registration time:
``mime_type``, ``file_size`` and ``checksum_sha256`` are copied from
``MediaService.object_metadata`` and never refreshed afterwards. Two
registration paths — ``_register_product_asset`` (``POST /media/register``,
the product upload paths, the employee register-by-key path) and
``_register_placement_asset`` (``POST /media/register-placement``) — are
idempotent by object key: re-registering a key returns the existing row
instead of creating a second one.

Idempotency is the correct behaviour only while the object at that key still
holds the bytes the row describes. If an object is replaced out-of-band at the
same key (a manual bucket copy, a restore, a future writer that bypasses
``MediaService.store_image``), a silent reuse publishes a row whose MIME type,
size and checksum no longer match the bytes the store will serve. The guards
below close that gap without touching schema, storage or the idempotent path.

Design rules:

  · **Verification only, never mutation.** A disagreement rejects the
    registration; it never rewrites the row, never overwrites the object and
    never deletes anything. The operator resolves it by re-uploading under a
    fresh key.
  · **Both sides must be present.** A row or provider without a checksum is
    *unverifiable*, not *wrong*: legacy rows and providers whose metadata
    carries no digest keep working exactly as before. Absence never blocks.
  · **No client input.** Both digests come from the server (the stored
    object's metadata and the row the server itself wrote). A checksum
    supplied by a caller is never consulted here, so it can never be used as
    proof of integrity.
  · **Pure functions.** No database, no storage, no I/O — so the rules can be
    unit-tested without the dependency stack.

Compensation rule (S-07, orphaned objects):

  ``should_compensate`` answers whether a stored-object descriptor describes an
  object *this request created*. Compensation removes storage only for objects
  that did not exist before the operation; an object that was already present
  (``created`` false — the identical-bytes idempotent path) is never deleted,
  because another record may already reference it.
"""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

#: Message used when a key's stored bytes disagree with its registry row. It
#: names no storage internals (bucket, path, ETag) — only the two identities
#: the operator needs: the key and the fact that a decision is required.
CHECKSUM_MISMATCH_MESSAGE = (
    "The stored object no longer matches its registry record "
    "(checksum mismatch). Nothing was changed. Re-upload the file under a "
    "new key, then register the new object."
)


def normalise_checksum(value: Optional[str]) -> str:
    """Case- and whitespace-insensitive form of a stored digest.

    Providers differ on hex casing; surrounding whitespace appears in imported
    data. Comparisons must not fail on either.
    """
    if not value:
        return ""
    return str(value).strip().lower()


def is_sha256_hex(value: Optional[str]) -> bool:
    """Whether a value is a well-formed SHA-256 digest (64 hex characters).

    Only such a value is treated as a *trusted* digest. Providers that return
    a different digest (an MD5 ETag, a truncated hash) or no digest at all are
    unverifiable, not wrong — comparing them would reject legitimate
    re-registration of unchanged bytes.
    """
    normalised = normalise_checksum(value)
    if len(normalised) != 64:
        return False
    return all(character in "0123456789abcdef" for character in normalised)


def checksum_conflict(
    stored_checksum: Optional[str],
    registered_checksum: Optional[str],
) -> bool:
    """True only when two well-formed SHA-256 digests disagree.

    ``False`` means "no conflict *established*", not "verified": a missing or
    non-SHA-256 digest on either side is unverifiable and is deliberately not
    a conflict.
    """
    if not is_sha256_hex(stored_checksum) or not is_sha256_hex(registered_checksum):
        return False
    return normalise_checksum(stored_checksum) != normalise_checksum(registered_checksum)


def should_compensate(stored: Optional[Mapping[str, Any]]) -> bool:
    """Whether a stored-object descriptor describes an object to roll back.

    Only an object *created by this request* may be removed. ``created`` is the
    storage layer's own report (`MediaService.store_image`): ``False`` for the
    identical-bytes idempotent path, where the object already existed and may
    already be referenced by a valid record.
    """
    if not stored:
        return False
    if not stored.get("created"):
        return False
    return bool(stored.get("key"))


def compensation_report(stored: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    """Structured, log-friendly summary of a compensation decision."""
    key = (stored or {}).get("key")
    return {
        "compensated": should_compensate(stored),
        "key": key,
        "createdByRequest": bool((stored or {}).get("created")),
    }
