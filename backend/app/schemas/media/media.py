"""
Media Pydantic schemas (Phase 6).

Envelope convention matches the rest of the API: `{ ok: true, … }`.

Only the object-storage contract is modelled here. Media *records*
(`media_media_asset` rows, product↔media mappings, review rows) are NOT
modelled because those tables declare no business columns in the existing
schema, and Phase 6 may not invent them.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Legacy placeholders (retained — previously declared, still unused)
# ---------------------------------------------------------------------------

class MediaBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MediaCreate(MediaBase):
    pass


class MediaResponse(MediaBase):
    id: str


# ---------------------------------------------------------------------------
# Object storage (Phase 6)
# ---------------------------------------------------------------------------

class MediaObjectMetadata(BaseModel):
    """Provider-independent object metadata. No paths, no secrets."""

    model_config = ConfigDict(populate_by_name=True)

    key: str
    size: int = 0
    content_type: str = Field("application/octet-stream", alias="contentType")
    checksum_sha256: str = Field("", alias="checksumSha256")
    last_modified: Optional[str] = Field(None, alias="lastModified")
    etag: Optional[str] = None
    provider: str = ""


class MediaObjectPayload(BaseModel):
    """Descriptor returned after a successful upload."""

    model_config = ConfigDict(populate_by_name=True)

    key: str
    url: str
    created: bool = True
    already_exists: bool = Field(False, alias="alreadyExists")
    size: int = 0
    content_type: str = Field("application/octet-stream", alias="contentType")
    checksum_sha256: str = Field("", alias="checksumSha256")


class MediaObjectResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    object: MediaObjectPayload
    status: int = 201


class MediaObjectMetaResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    object: MediaObjectMetadata
    url: str = ""


class MediaStorageStatusResponse(BaseModel):
    """Non-secret provider summary."""

    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    provider: str = "local"
    configured: bool = True
    detail: Dict[str, Any] = {}
    url_prefix: str = Field("", alias="urlPrefix")
    cdn_configured: bool = Field(False, alias="cdnConfigured")
    namespaces: List[str] = []
    resolve_product_images: bool = Field(True, alias="resolveProductImages")


class MediaReferenceResolveRequest(BaseModel):
    """Batch of product image references to resolve."""

    references: List[str] = []


class MediaReferenceDecision(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reference: str = ""
    status: str = "empty"
    url: str = ""
    object_key: str = Field("", alias="objectKey")


class MediaReferenceResolveResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    items: List[MediaReferenceDecision] = []
    total: int = 0


class ProductMediaSetResponse(BaseModel):
    """Resolved media set built from existing `catalog_product` columns."""

    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    product_id: str = Field("", alias="productId")
    primary: Optional[str] = None
    hover: Optional[str] = None
    gallery: List[str] = []
    primary_media_id: Optional[str] = Field(None, alias="primaryMediaId")
    media_ids: List[str] = Field([], alias="mediaIds")
    gallery_media_ids: List[str] = Field([], alias="galleryMediaIds")
    media_records_available: bool = Field(False, alias="mediaRecordsAvailable")
    note: str = ""
