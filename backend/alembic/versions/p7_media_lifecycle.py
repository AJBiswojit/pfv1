"""Phase 7 durable media records and product mappings."""
from alembic import op
import sqlalchemy as sa

revision = "p7_media_lifecycle"
# Linearised after the Phase 7 migration added a second head under
# m001schema (a2b3c4d5e6f7 already hung there). Chain: … → m001schema →
# a2b3c4d5e6f7 (admin settings) → p7_media_lifecycle.
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade():
    # Existing empty stub tables are upgraded in place; legacy product columns remain dual-read.
    op.add_column("media_media_asset", sa.Column("object_key", sa.String(512), nullable=False, server_default="legacy/unknown"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("storage_provider", sa.String(20), nullable=False, server_default="local"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("media_type", sa.String(30), nullable=False, server_default="image"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("mime_type", sa.String(100), nullable=False, server_default="application/octet-stream"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("original_filename", sa.String(255), nullable=False, server_default="legacy"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("file_size", sa.Integer(), nullable=False, server_default="0"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("checksum_sha256", sa.String(64), nullable=False, server_default=""), schema="pratikshya")
    for name, typ in (("width", sa.Integer()), ("height", sa.Integer()), ("title", sa.String(255)), ("alt_text", sa.Text()), ("caption", sa.Text())):
        op.add_column("media_media_asset", sa.Column(name, typ), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("status", sa.String(30), nullable=False, server_default="uploaded"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("scope", sa.String(30), nullable=False, server_default="product"), schema="pratikshya")
    op.add_column("media_media_asset", sa.Column("uploaded_by", sa.String(36), nullable=True), schema="pratikshya")
    op.create_index("ix_media_asset_object_key", "media_media_asset", ["object_key"], unique=True, schema="pratikshya")
    op.create_index("ix_media_asset_checksum", "media_media_asset", ["checksum_sha256"], schema="pratikshya")
    op.add_column("media_product_media", sa.Column("product_id", sa.String(36), nullable=False, server_default=""), schema="pratikshya")
    op.add_column("media_product_media", sa.Column("media_id", sa.String(36), nullable=False, server_default=""), schema="pratikshya")
    op.add_column("media_product_media", sa.Column("role", sa.String(30), nullable=False, server_default="gallery"), schema="pratikshya")
    op.add_column("media_product_media", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"), schema="pratikshya")
    op.add_column("media_product_media", sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()), schema="pratikshya")
    op.add_column("media_product_media", sa.Column("assigned_by", sa.String(36)), schema="pratikshya")
    op.add_column("media_product_media", sa.Column("assignment_note", sa.String(500)), schema="pratikshya")
    op.create_unique_constraint("uq_media_product_asset", "media_product_media", ["product_id", "media_id"], schema="pratikshya")
    op.create_index("ix_product_media_product", "media_product_media", ["product_id"], schema="pratikshya")
    op.create_index("ix_product_media_media", "media_product_media", ["media_id"], schema="pratikshya")


def downgrade():
    for i in ("ix_product_media_product", "ix_product_media_media"):
        op.drop_index(i, table_name="media_product_media", schema="pratikshya")
    op.drop_constraint("uq_media_product_asset", "media_product_media", schema="pratikshya")
    for c in ("assignment_note", "assigned_by", "is_primary", "sort_order", "role", "media_id", "product_id"):
        op.drop_column("media_product_media", c, schema="pratikshya")
    for i in ("ix_media_asset_object_key", "ix_media_asset_checksum"):
        op.drop_index(i, table_name="media_media_asset", schema="pratikshya")
    for c in ("uploaded_by", "scope", "status", "caption", "alt_text", "title", "height", "width", "checksum_sha256", "file_size", "original_filename", "mime_type", "media_type", "storage_provider", "object_key"):
        op.drop_column("media_media_asset", c, schema="pratikshya")
