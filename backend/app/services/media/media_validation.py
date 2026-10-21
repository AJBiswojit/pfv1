"""
app/services/media/media_validation.py — media policy enforcement (Phase 6).

The single place that decides whether a file may enter the object store.
It reuses the EXISTING backend configuration rather than inventing a second
policy:

    settings.allowed_image_types     → which MIME types are accepted
    settings.MAX_IMAGE_SIZE_MB       → size ceiling

The signature table itself lives in `app/storage/signatures.py` so that the
upload policy and the local provider's `Content-Type` reporting can never
disagree about what a file really is.

Filenames are never trusted. A file is accepted only when ALL of these hold:

  1. it is non-empty (an empty upload is a malformed request, not an image)
  2. it is within `MAX_IMAGE_SIZE_MB`
  3. its extension maps to one of the configured image MIME types
  4. its content signature maps to one of those MIME types

Note on step 3/4 disagreement: the AUTHORITY is the sniffed type — that is
what the object is stored and served as. `validate_image_bytes` reports the
disagreement (`extension_mismatch`) instead of silently trusting the
filename; it only rejects when either side is outside the configured policy.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import List, Optional

from app.config import settings
from app.storage.signatures import (
    MAX_SNIFF_BYTES,
    extension_to_mime,
    mime_to_extensions,
    sniff_content_type,
)


class MediaValidationError(ValueError):
    """Raised when an upload violates the house media policy."""


def allowed_image_mime_types() -> List[str]:
    """The configured image policy, lower-cased."""
    return [item.lower() for item in settings.allowed_image_types]


def allowed_image_extensions() -> List[str]:
    """Extensions permitted by the configured image policy."""
    table = mime_to_extensions()
    allowed = set(allowed_image_mime_types())
    extensions: List[str] = []
    for mime, names in table.items():
        if mime in allowed:
            extensions.extend("." + name for name in names)
    return sorted(extensions)


def extension_of(filename: str) -> str:
    """Lower-cased extension with its dot, or `""`."""
    text = str(filename or "")
    dot = text.rfind(".")
    if dot < 0 or dot == len(text) - 1:
        return ""
    return text[dot:].lower()


def mime_for_extension(filename: str) -> Optional[str]:
    """MIME type implied by the extension, or None when unknown."""
    return extension_to_mime().get(extension_of(filename))


@dataclass(frozen=True)
class ValidatedImage:
    """Outcome of a successful policy check."""

    content_type: str
    extension: str
    size: int
    checksum_sha256: str
    #: True when the sniffed type differs from what the extension claims.
    extension_mismatch: bool = False
    declared_extension_type: str = ""
    #:"" when no geometry check ran, otherwise "ok" / the reason it was skipped.
    dimension_check: str = ""
    width: Optional[int] = None
    height: Optional[int] = None


#: Reasons a geometry check did not run. Surfaced so an operator can tell
#: "checked and fine" from "could not check".
DIMENSION_OK = "ok"
DIMENSION_NOT_DECODABLE = "not-decodable"
DIMENSION_DISABLED = "disabled"
DIMENSION_CHECK_FAILED = "check-failed"
#: AVIF skipped because the optional codec is not installed in this process.
#: Distinct from `DIMENSION_NOT_DECODABLE` because it is actionable: install
#: `pillow-avif-plugin` (pinned in requirements.txt) and the guard starts
#: measuring AVIF too.
DIMENSION_AVIF_NO_DECODER = "avif-no-decoder"

#: Probe result for the AVIF codec: None until first asked.
_AVIF_CODEC: dict = {"checked": False, "available": False}


def ensure_avif_support() -> bool:
    """
    Register the AVIF decoder with Pillow, once per process.

    `pillow-avif-plugin` does NOT self-register: `from PIL import Image` alone
    leaves AVIF undecodable, and every AVIF upload would then silently skip the
    geometry guard. Importing the plugin module is what installs the codec, so
    it is imported explicitly here.

    Returns False (never raises) when the optional wheel is absent — a missing
    decoder downgrades the guarantee for one format, it must never turn into an
    upload outage.
    """
    if _AVIF_CODEC["checked"]:
        return _AVIF_CODEC["available"]
    _AVIF_CODEC["checked"] = True
    try:
        import pillow_avif  # noqa: F401  (importing registers the codec)
        from PIL import Image

        _AVIF_CODEC["available"] = Image.registered_extensions().get(".avif") == "AVIF"
    except Exception:  # pragma: no cover - only import/registry faults land here
        _AVIF_CODEC["available"] = False
    return _AVIF_CODEC["available"]
#: AVIF skipped because `pillow-avif-plugin` is not installed in this process.
#: Distinct from `DIMENSION_NOT_DECODABLE` because it is an actionable
#: deployment fault rather than a property of the uploaded file.
DIMENSION_AVIF_DECODER_MISSING = "avif-decoder-missing"

#: Pillow does not decode AVIF out of the box. `pillow-avif-plugin` supplies
#: the codec, but it does NOT self-register on `from PIL import Image`: the
#: plugin module has to be imported explicitly, and importing it is what adds
#: `AVIF` to Pillow's format registry. Without this import the geometry guard
#: silently skips every AVIF — which is the house's dominant product-image
#: format — so the import is done here, once, lazily.
_AVIF_REGISTRATION_STATE: dict = {"attempted": False, "available": False}


def ensure_avif_support() -> bool:
    """
    Register the AVIF decoder with Pillow, once per process.

    Returns True when AVIF geometry can be measured. Returns False (never
    raises) when the optional `pillow-avif-plugin` wheel is not installed —
    a missing decoder downgrades the geometry guard for AVIF, it must never
    become an upload outage.
    """
    if _AVIF_REGISTRATION_STATE["attempted"]:
        return _AVIF_REGISTRATION_STATE["available"]
    _AVIF_REGISTRATION_STATE["attempted"] = True
    try:
        import pillow_avif  # noqa: F401  (importing registers the codec)
        from PIL import Image

        available = Image.registered_extensions().get(".avif") == "AVIF"
    except Exception:  # pragma: no cover - import/registry faults only
        available = False
    _AVIF_REGISTRATION_STATE["available"] = available
    if not available:
        import logging

        logging.getLogger(__name__).warning(
            "pillow-avif-plugin is not available: AVIF uploads will skip the "
            "image-dimension guard. Install it (it is pinned in "
            "backend/requirements.txt) to close that gap."
        )
    return available


def avif_decoder_available() -> bool:
    """Whether this process can measure AVIF geometry. Test seam."""
    return ensure_avif_support()


def reset_avif_registration_cache() -> None:
    """Forget the cached probe result. Test seam only."""
    _AVIF_REGISTRATION_STATE.update({"attempted": False, "available": False})


def image_geometry(data: bytes) -> tuple:
    """
    `(width, height, reason)` for an image Pillow can decode.

    AVIF is measured like any other format: `pillow-avif-plugin` provides the
    codec (see `ensure_avif_support`). If that optional wheel is missing the
    file is not rejected — it has already passed the magic-byte signature
    check, and refusing the house's dominant product-image format over a
    missing optional dependency would be a regression — but the reason
    reported is `avif-decoder-missing`, which is a deployment fault an
    operator can act on, not a property of the upload.

    Raises MediaValidationError for a decompression bomb or an oversized
    dimension.
    """
    max_pixels = int(getattr(settings, "MAX_IMAGE_PIXELS", 0) or 0)
    max_side = int(getattr(settings, "MAX_IMAGE_DIMENSION_PX", 0) or 0)
    if max_pixels <= 0 and max_side <= 0:
        return None, None, DIMENSION_DISABLED
    try:
        from PIL import Image  # noqa: PLC0415 — optional, heavy import
    except ImportError:  # pragma: no cover - Pillow is in requirements
        return None, None, DIMENSION_CHECK_FAILED
    # Pillow needs the AVIF codec registered before it will open one; the
    # optional plugin does that on import. Cheap after the first call.
    have_avif = ensure_avif_support()
    if not have_avif and sniff_content_type(data) == "image/avif":
        return None, None, DIMENSION_AVIF_DECODER_MISSING
    try:
        previous_limit = Image.MAX_IMAGE_PIXELS
        if max_pixels > 0:
            Image.MAX_IMAGE_PIXELS = max_pixels
        try:
            with Image.open(io.BytesIO(data)) as handle:
                width, height = handle.size
        finally:
            Image.MAX_IMAGE_PIXELS = previous_limit
    except Exception as exc:  # noqa: BLE001 - Pillow raises several types
        name = type(exc).__name__
        if name == "DecompressionBombError" or "DecompressionBomb" in name:
            raise MediaValidationError(
                "The image declares an extremely large pixel count and was "
                "rejected as a possible decompression bomb."
            ) from None
        # UnidentifiedImageError / OSError / … → Pillow cannot decode this
        # container. AVIF without the plugin is the expected case.
        return None, None, DIMENSION_NOT_DECODABLE
    if max_pixels > 0 and width * height > max_pixels:
        raise MediaValidationError(
            f"The image is {width}x{height} ({width * height:,} pixels), which "
            f"exceeds the maximum of {max_pixels:,} pixels."
        )
    if max_side > 0 and max(width, height) > max_side:
        raise MediaValidationError(
            f"The image is {width}x{height}; the longest side must not exceed "
            f"{max_side} pixels."
        )
    return width, height, DIMENSION_OK


def max_image_bytes() -> int:
    return int(settings.MAX_IMAGE_SIZE_MB) * 1024 * 1024


def validate_image_bytes(
    filename: str,
    data: bytes,
    *,
    allowed_types: Optional[List[str]] = None,
    max_bytes: Optional[int] = None,
) -> ValidatedImage:
    """
    Apply the full media policy to an upload candidate.

    Raises MediaValidationError with a user-safe message (never a path).
    """
    allowed = [item.lower() for item in (allowed_types or allowed_image_mime_types())]
    ceiling = max_bytes if max_bytes is not None else max_image_bytes()

    if data is None:
        raise MediaValidationError("No file content was received.")
    if len(data) == 0:
        raise MediaValidationError("The uploaded file is empty.")
    if len(data) > ceiling:
        raise MediaValidationError(
            f"Image is {len(data) / (1024 * 1024):.1f} MB — the maximum allowed "
            f"size is {int(settings.MAX_IMAGE_SIZE_MB)} MB."
        )

    ext = extension_of(filename)
    if not ext:
        raise MediaValidationError(
            "The uploaded file has no extension, so its type cannot be verified."
        )

    table = extension_to_mime()
    if ext not in table:
        raise MediaValidationError(
            f"Unsupported file extension '{ext}'. Allowed: "
            f"{', '.join(allowed_image_extensions())}."
        )
    declared_type = table[ext]
    if declared_type not in allowed:
        raise MediaValidationError(
            f"'{declared_type}' is not an allowed image type. Allowed: "
            f"{', '.join(sorted(allowed))}."
        )

    sniffed = sniff_content_type(data)
    if sniffed is None:
        raise MediaValidationError(
            "The file content does not match any supported image format, so it "
            "was rejected. The filename alone is never trusted."
        )
    if sniffed not in allowed:
        raise MediaValidationError(
            f"Detected '{sniffed}', which is not an allowed image type. Allowed: "
            f"{', '.join(sorted(allowed))}."
        )

    from app.storage.local import sha256_bytes

    width, height, dimension_reason = image_geometry(data)

    return ValidatedImage(
        content_type=sniffed,
        extension=ext,
        size=len(data),
        checksum_sha256=sha256_bytes(data),
        extension_mismatch=sniffed != declared_type,
        declared_extension_type=declared_type,
        dimension_check=dimension_reason,
        width=width,
        height=height,
    )


__all__ = [
    "MediaValidationError",
    "ValidatedImage",
    "MAX_SNIFF_BYTES",
    "DIMENSION_OK",
    "DIMENSION_NOT_DECODABLE",
    "DIMENSION_DISABLED",
    "DIMENSION_CHECK_FAILED",
    "DIMENSION_AVIF_DECODER_MISSING",
    "allowed_image_mime_types",
    "allowed_image_extensions",
    "avif_decoder_available",
    "ensure_avif_support",
    "extension_of",
    "image_geometry",
    "mime_for_extension",
    "max_image_bytes",
    "reset_avif_registration_cache",
    "sniff_content_type",
    "validate_image_bytes",
]
