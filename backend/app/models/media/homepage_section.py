"""Additive homepage configuration; hero remains owned by marketing media."""
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.schemas.media.homepage import SECTION_KEYS


class HomepageSectionModel(Base):
    __tablename__ = "homepage_section"
    section_key: Mapped[str] = mapped_column(String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pratikshya.users.id", ondelete="SET NULL"))
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pratikshya.users.id", ondelete="SET NULL"))
    __table_args__ = (
        UniqueConstraint("section_key", name="uq_homepage_section_key"),
        CheckConstraint("section_key IN (" + ",".join(repr(k) for k in SECTION_KEYS) + ")", name="ck_homepage_section_key"),
        CheckConstraint("revision >= 1", name="ck_homepage_revision"),
    )


class HomepageSectionItemModel(Base):
    __tablename__ = "homepage_section_item"
    section_id: Mapped[str] = mapped_column(String(36), ForeignKey("pratikshya.homepage_section.id", ondelete="CASCADE"), nullable=False)
    slot_key: Mapped[str] = mapped_column(String(64), nullable=False)
    content_type: Mapped[str] = mapped_column(String(8), nullable=False)
    media_asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pratikshya.media_media_asset.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pratikshya.catalog_product.id", ondelete="CASCADE"), index=True)
    eyebrow: Mapped[Optional[str]] = mapped_column(String(100))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    subtitle: Mapped[Optional[str]] = mapped_column(String(500))
    cta_label: Mapped[Optional[str]] = mapped_column(String(100))
    cta_href: Mapped[Optional[str]] = mapped_column(String(500))
    alt_text: Mapped[Optional[str]] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pratikshya.users.id", ondelete="SET NULL"))
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pratikshya.users.id", ondelete="SET NULL"))
    __table_args__ = (
        CheckConstraint("content_type IN ('TEXT','MEDIA','PRODUCT')", name="ck_homepage_item_type"),
        CheckConstraint("(content_type = 'TEXT' AND media_asset_id IS NULL AND product_id IS NULL) OR (content_type = 'MEDIA' AND media_asset_id IS NOT NULL AND product_id IS NULL) OR (content_type = 'PRODUCT' AND product_id IS NOT NULL AND media_asset_id IS NULL)", name="ck_homepage_item_reference"),
        CheckConstraint("content_type <> 'PRODUCT' OR (eyebrow IS NULL AND title IS NULL AND subtitle IS NULL AND cta_label IS NULL AND cta_href IS NULL AND alt_text IS NULL)", name="ck_homepage_product_copy"),
        CheckConstraint("sort_order >= 0", name="ck_homepage_sort"),
        UniqueConstraint("section_id", "slot_key", "product_id", name="uq_homepage_product_slot"),
        Index("uq_homepage_singleton_slot", "section_id", "slot_key", "content_type", unique=True, postgresql_where=text("content_type <> 'PRODUCT'"), sqlite_where=text("content_type <> 'PRODUCT'")),
        Index("ix_homepage_item_read", "section_id", "content_type", "slot_key", "is_active", "sort_order"),
    )
