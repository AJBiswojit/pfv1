"""Add only homepage section configuration and typed associations.

Revision ID: p3hp20261016a
Revises: l1a2b3c4d5e1
No seeds, backfill, legacy table alteration or role changes.
"""
from alembic import op
import sqlalchemy as sa

revision = "p3hp20261016a"
down_revision = "l1a2b3c4d5e1"
branch_labels = None
depends_on = None
SCHEMA = "pratikshya"


def base_columns():
    return [sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)]


def audit_columns():
    return [sa.Column(name, sa.String(36), sa.ForeignKey(f"{SCHEMA}.users.id", ondelete="SET NULL")) for name in ("created_by", "updated_by")]


def upgrade():
    op.create_table("homepage_section", *base_columns(),
        sa.Column("section_key", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        *audit_columns(),
        sa.UniqueConstraint("section_key", name="uq_homepage_section_key"),
        sa.CheckConstraint("section_key IN ('categories','sarees','bridal','jewellery','promotion','men','kids','bestsellers','kurtis','newsletter','trust')", name="ck_homepage_section_key"),
        sa.CheckConstraint("revision >= 1", name="ck_homepage_revision"), schema=SCHEMA)
    op.create_index("ix_pratikshya_homepage_section_id", "homepage_section", ["id"], schema=SCHEMA)
    op.create_table("homepage_section_item", *base_columns(),
        sa.Column("section_id", sa.String(36), sa.ForeignKey(f"{SCHEMA}.homepage_section.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slot_key", sa.String(64), nullable=False),
        sa.Column("content_type", sa.String(8), nullable=False),
        sa.Column("media_asset_id", sa.String(36), sa.ForeignKey(f"{SCHEMA}.media_media_asset.id", ondelete="CASCADE")),
        sa.Column("product_id", sa.String(36), sa.ForeignKey(f"{SCHEMA}.catalog_product.id", ondelete="CASCADE")),
        sa.Column("eyebrow", sa.String(100)), sa.Column("title", sa.String(255)),
        sa.Column("subtitle", sa.String(500)), sa.Column("cta_label", sa.String(100)),
        sa.Column("cta_href", sa.String(500)), sa.Column("alt_text", sa.Text()),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        *audit_columns(),
        sa.CheckConstraint("content_type IN ('TEXT','MEDIA','PRODUCT')", name="ck_homepage_item_type"),
        sa.CheckConstraint("(content_type = 'TEXT' AND media_asset_id IS NULL AND product_id IS NULL) OR (content_type = 'MEDIA' AND media_asset_id IS NOT NULL AND product_id IS NULL) OR (content_type = 'PRODUCT' AND product_id IS NOT NULL AND media_asset_id IS NULL)", name="ck_homepage_item_reference"),
        sa.CheckConstraint("content_type <> 'PRODUCT' OR (eyebrow IS NULL AND title IS NULL AND subtitle IS NULL AND cta_label IS NULL AND cta_href IS NULL AND alt_text IS NULL)", name="ck_homepage_product_copy"),
        sa.CheckConstraint("sort_order >= 0", name="ck_homepage_sort"),
        sa.UniqueConstraint("section_id", "slot_key", "product_id", name="uq_homepage_product_slot"), schema=SCHEMA)
    for column in ("id", "media_asset_id", "product_id"):
        op.create_index(f"ix_pratikshya_homepage_section_item_{column}", "homepage_section_item", [column], schema=SCHEMA)
    op.create_index("uq_homepage_singleton_slot", "homepage_section_item", ["section_id", "slot_key", "content_type"], unique=True, postgresql_where=sa.text("content_type <> 'PRODUCT'"), schema=SCHEMA)
    op.create_index("ix_homepage_item_read", "homepage_section_item", ["section_id", "content_type", "slot_key", "is_active", "sort_order"], schema=SCHEMA)


def downgrade():
    # Export new homepage data and stop writers before explicitly authorizing this.
    op.drop_table("homepage_section_item", schema=SCHEMA)
    op.drop_table("homepage_section", schema=SCHEMA)
