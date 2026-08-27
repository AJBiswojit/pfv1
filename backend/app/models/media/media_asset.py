from typing import Optional
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class MediaAssetModel(Base):
    """Durable database identity for an object in the configured store."""
    __tablename__ = "media_media_asset"
    object_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True, index=True)
    storage_provider: Mapped[str] = mapped_column(String(20), nullable=False, default="local")
    media_type: Mapped[str] = mapped_column(String(30), nullable=False, default="image")
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)
    title: Mapped[Optional[str]] = mapped_column(String(255))
    alt_text: Mapped[Optional[str]] = mapped_column(Text)
    caption: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="uploaded", index=True)
    scope: Mapped[str] = mapped_column(String(30), nullable=False, default="product")
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pratikshya.users.id"))
    product_media = relationship("ProductMediaModel", back_populates="media", cascade="all, delete-orphan")
