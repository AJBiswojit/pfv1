"""Closed homepage registry and strict authoring DTOs. Not a generic CMS."""
from typing import Literal, Optional
from urllib.parse import unquote, urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def slots(text=(), media=(), products=None):
    return ([{"slotKey": k, "contentType": "TEXT", "capacity": 1} for k in text]
            + [{"slotKey": k, "contentType": "MEDIA", "capacity": 1} for k in media]
            + [{"slotKey": k, "contentType": "PRODUCT", "capacity": v} for k, v in (products or {}).items()])


REGISTRY = {
    "categories": slots(("intro",), ("women", "men", "kids", "essentials"), {f"{k}-products": 4 for k in ("women", "men", "kids", "essentials")}),
    "sarees": slots(("intro", "silk-classics", "everyday-elegance", "festive-sarees", "contemporary-drapes"), ("lookbook-1", "lookbook-2", "lookbook-3"), {"products": 4}),
    "bridal": slots(("intro",), ("bride", "groom", "couple"), {"bride-products": 4, "groom-products": 4}),
    "jewellery": slots(("intro",), ("campaign",), {"products": 24}),
    "promotion": slots(("intro",), ("campaign",)),
    "men": slots(("intro", "kurtas", "bandhgalas", "sherwanis", "accessories"), ("campaign",), {"featured": 1, "products": 4}),
    "kids": slots(("intro", "girls", "boys", "festive"), ("main", "girls", "boys"), {"products": 24}),
    "bestsellers": slots(("intro",), (), {"products": 8}),
    "kurtis": slots(("intro",), ("everyday-kurtis", "anarkalis", "festive-kurtis", "kurta-sets"), {k: 4 for k in ("everyday-kurtis", "anarkalis", "festive-kurtis", "kurta-sets", "pairings")}),
    "newsletter": slots(("intro", "fine-print"), ("campaign",)),
    "trust": slots(("delivery", "authentic", "secure", "returns", "help")),
}
SECTION_KEYS = tuple(REGISTRY)
COPY_FIELDS = ("eyebrow", "title", "subtitle", "cta_label", "cta_href", "alt_text")
GROUPS = {
    ("trust", "trust-items", "TEXT"): ("delivery", "authentic", "secure", "returns", "help"),
    ("sarees", "lookbook", "MEDIA"): ("lookbook-1", "lookbook-2", "lookbook-3"),
}
IMAGE_MIMES = frozenset(("image/jpeg", "image/png", "image/webp", "image/avif"))


def safe_cta(value):
    if value is None or value == "":
        return value
    decoded = value
    for _ in range(8):
        new = unquote(decoded)
        if new == decoded:
            break
        decoded = new
    else:
        raise ValueError("CTA has excessive encoding")
    if not decoded.startswith("/") or decoded.startswith("//") or "\\" in decoded or any(ord(c) < 33 for c in decoded):
        raise ValueError("CTA must be a safe single-slash site-relative URL")
    parts = urlsplit(decoded)
    if parts.scheme or parts.netloc:
        raise ValueError("External CTA is not supported")
    return value


class StrictDTO(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class RevisionDTO(StrictDTO):
    expected_revision: int = Field(..., alias="expectedRevision", ge=0)


class SectionWrite(RevisionDTO):
    is_active: bool = Field(False, alias="isActive")


class CopyDTO(StrictDTO):
    eyebrow: Optional[str] = Field(None, max_length=100)
    title: Optional[str] = Field(None, max_length=255)
    subtitle: Optional[str] = Field(None, max_length=500)
    cta_label: Optional[str] = Field(None, alias="ctaLabel", max_length=100)
    cta_href: Optional[str] = Field(None, alias="ctaHref", max_length=500)
    alt_text: Optional[str] = Field(None, alias="altText", max_length=2000)

    _safe_cta = field_validator("cta_href")(safe_cta)


class ItemFields(CopyDTO):
    media_asset_id: Optional[str] = Field(None, alias="mediaAssetId", min_length=1, max_length=36)
    product_id: Optional[str] = Field(None, alias="productId", min_length=1, max_length=36)
    is_active: bool = Field(False, alias="isActive")


class ItemCreate(ItemFields, RevisionDTO):
    slot_key: str = Field(..., alias="slotKey", min_length=1, max_length=64)
    content_type: Literal["TEXT", "MEDIA", "PRODUCT"] = Field(..., alias="contentType")

    @model_validator(mode="after")
    def shape(self):
        validate_shape(self.content_type, self.model_dump())
        return self


class ItemPatch(ItemFields, RevisionDTO):
    # Fields not supplied are ignored; explicit null is rejected for isActive.
    pass


def validate_shape(kind, values):
    media, product = values.get("media_asset_id"), values.get("product_id")
    if (kind == "TEXT" and (media or product)) or (kind == "MEDIA" and (not media or product)) or (kind == "PRODUCT" and (not product or media)):
        raise ValueError("Content type and resource references disagree")
    if kind == "PRODUCT" and any(values.get(k) is not None for k in COPY_FIELDS):
        raise ValueError("Products cannot carry editorial, identity or price overrides")
    if kind == "TEXT" and not any(str(values.get(k) or "").strip() for k in ("title", "subtitle", "eyebrow")):
        raise ValueError("Text requires meaningful copy")
    if bool(str(values.get("cta_label") or "").strip()) != bool(values.get("cta_href")):
        raise ValueError("CTA label and destination must be supplied together")
    safe_cta(values.get("cta_href"))


class ReorderDTO(RevisionDTO):
    slot_key: str = Field(..., alias="slotKey", max_length=64)
    content_type: Literal["TEXT", "MEDIA", "PRODUCT"] = Field(..., alias="contentType")
    item_ids: list[str] = Field(..., alias="itemIds", max_length=100)


class HeroCopyDTO(StrictDTO):
    title: Optional[str] = Field(None, max_length=255)
    subtitle: Optional[str] = Field(None, max_length=500)
    cta_label: Optional[str] = Field(None, alias="ctaLabel", max_length=100)
    cta_href: Optional[str] = Field(None, alias="ctaHref", max_length=500)
    alt_text: Optional[str] = Field(None, alias="altText", max_length=2000)
    _safe_cta = field_validator("cta_href")(safe_cta)


class HeroCreate(HeroCopyDTO):
    media_asset_id: str = Field(..., alias="mediaAssetId", min_length=1, max_length=36)
    is_active: bool = Field(False, alias="isActive")


class HeroPatch(HeroCopyDTO):
    media_asset_id: Optional[str] = Field(None, alias="mediaAssetId", min_length=1, max_length=36)
    is_active: Optional[bool] = Field(None, alias="isActive")


class HeroReorder(StrictDTO):
    item_ids: list[str] = Field(..., alias="itemIds", max_length=100)


# Public response DTOs exclude authoring/audit fields by construction.
from app.schemas.catalog.product import StorefrontProduct


class PublicMedia(CopyDTO):
    id: str
    object_key: str = Field(..., alias="objectKey")
    url: str
    status: Literal["uploaded"]
    mime_type: str = Field(..., alias="mimeType")


class PublicItem(StrictDTO):
    id: str
    slot_key: str = Field(..., alias="slotKey")
    content_type: Literal["TEXT", "MEDIA", "PRODUCT"] = Field(..., alias="contentType")
    sort_order: int = Field(..., alias="sortOrder")
    text: Optional[CopyDTO] = None
    media: Optional[PublicMedia] = None
    product: Optional[StorefrontProduct] = None


class PublicSection(StrictDTO):
    key: Literal["hero", "categories", "sarees", "bridal", "jewellery", "promotion", "men", "kids", "bestsellers", "kurtis", "newsletter", "trust"]
    source: Literal["heroSlides", "legacy", "sections"]
    state: Literal["delegated", "missing", "inactive", "empty", "ready", "unavailable"]
    configured: Optional[bool] = None
    is_active: Optional[bool] = Field(None, alias="isActive")
    revision: Optional[int] = None
    items: list[PublicItem] = Field(default_factory=list)


class HomepageContentPublic(StrictDTO):
    version: Literal[1] = 1
    status: Literal["ready", "unavailable"]
    sections: list[PublicSection] = Field(..., min_length=12, max_length=12)
