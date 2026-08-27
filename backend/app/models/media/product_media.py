from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class ProductMediaModel(Base):
    """Explicit ordered product-to-media mapping (source of truth for new media)."""
    __tablename__ = "media_product_media"
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("pratikshya.catalog_product.id", ondelete="CASCADE"), nullable=False, index=True)
    media_id: Mapped[str] = mapped_column(String(36), ForeignKey("pratikshya.media_media_asset.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="gallery")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    assigned_by: Mapped[str | None] = mapped_column(String(36))
    assignment_note: Mapped[str | None] = mapped_column(String(500))
    product = relationship("ProductModel")
    media = relationship("MediaAssetModel", back_populates="product_media")
    __table_args__ = (UniqueConstraint("product_id", "media_id", name="uq_media_product_asset"),)
