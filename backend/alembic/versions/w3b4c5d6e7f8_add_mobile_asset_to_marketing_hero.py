"""Add optional mobile art reference to marketing media rows.

Revision ID: w3b4c5d6e7f8
Revises: p3hp20261016a
"""
from alembic import op
import sqlalchemy as sa

revision = "w3b4c5d6e7f8"
down_revision = "p3hp20261016a"
branch_labels = None
depends_on = None
SCHEMA = "pratikshya"
FK_NAME = "fk_marketing_media_mobile_asset"
INDEX_NAME = "ix_media_marketing_media_mobile_media_asset_id"


def upgrade():
    if op.get_bind().dialect.name == "sqlite":
        # SQLite cannot ADD CONSTRAINT in place; batch mode preserves the
        # same additive column/FK semantics for disposable migration checks.
        with op.batch_alter_table("media_marketing_media", recreate="always") as batch:
            batch.add_column(sa.Column("mobile_media_asset_id", sa.String(length=36), nullable=True))
            batch.create_foreign_key(FK_NAME, "media_media_asset", ["mobile_media_asset_id"], ["id"], ondelete="SET NULL")
        op.create_index(INDEX_NAME, "media_marketing_media", ["mobile_media_asset_id"])
    else:
        op.add_column("media_marketing_media", sa.Column("mobile_media_asset_id", sa.String(length=36), nullable=True), schema=SCHEMA)
        op.create_index(INDEX_NAME, "media_marketing_media", ["mobile_media_asset_id"], schema=SCHEMA)
        op.create_foreign_key(FK_NAME, "media_marketing_media", "media_media_asset", ["mobile_media_asset_id"], ["id"], ondelete="SET NULL", source_schema=SCHEMA, referent_schema=SCHEMA)


def downgrade():
    if op.get_bind().dialect.name == "sqlite":
        op.drop_index(INDEX_NAME, table_name="media_marketing_media")
        with op.batch_alter_table("media_marketing_media", recreate="always") as batch:
            batch.drop_constraint(FK_NAME, type_="foreignkey")
            batch.drop_column("mobile_media_asset_id")
    else:
        op.drop_constraint(FK_NAME, "media_marketing_media", type_="foreignkey", schema=SCHEMA)
        op.drop_index(INDEX_NAME, table_name="media_marketing_media", schema=SCHEMA)
        op.drop_column("media_marketing_media", "mobile_media_asset_id", schema=SCHEMA)
