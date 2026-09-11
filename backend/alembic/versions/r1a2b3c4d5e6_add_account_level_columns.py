"""add_account_level_and_custom_permissions

Revision ID: r1a2b3c4d5e6
Revises: b6b5dcfb675b, d8e9f0a1b2c3
Create Date: 2026-09-11 00:00:00.000000

Unified authentication + 4-level RBAC consolidation (additive, non-destructive).
Table names resolve through the `pratikshya` search_path set in env.py.

  • users.account_level      SUPER_ADMIN | ADMIN | SUPER_EMPLOYEE | EMPLOYEE (NULL for customers)
  • users.permission_mode    'role' | 'custom'
  • users.custom_permissions explicit grant list for permission_mode='custom'

Also performs the deterministic backfill of account_level from the existing
user_type / SUPER_ADMIN role assignment. Existing passwords, sessions and
role rows are untouched; no rows are deleted. Downgrade removes only the
three columns added here.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "r1a2b3c4d5e6"
down_revision: Union[str, None] = ("b6b5dcfb675b", "d8e9f0a1b2c3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("account_level", sa.String(length=20), nullable=True,
                  comment="Staff hierarchy level: SUPER_ADMIN | ADMIN | SUPER_EMPLOYEE | EMPLOYEE; NULL for customers"),
    )
    op.add_column(
        "users",
        sa.Column("permission_mode", sa.String(length=10), nullable=True,
                  server_default="role",
                  comment="'role' = capability set comes from assigned roles; 'custom' = custom_permissions override"),
    )
    op.add_column(
        "users",
        sa.Column(
            "custom_permissions",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.Text(), "sqlite"),
            nullable=True,
            comment="Explicit grant list (canonical capability or legacy granular codes) when permission_mode='custom'",
        ),
    )

    # ── Deterministic backfill ─────────────────────────────────────────────
    # 1) Admins holding the SUPER_ADMIN role become SUPER_ADMIN.
    op.execute(sa.text(
        """
        UPDATE users u
           SET account_level = 'SUPER_ADMIN'
         WHERE u.user_type = 'admin'
           AND EXISTS (
                SELECT 1
                  FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id AND r.name = 'SUPER_ADMIN'
           )
        """
    ))
    # 2) Every remaining admin becomes ADMIN (never above SUPER_ADMIN).
    op.execute(sa.text(
        "UPDATE users SET account_level = 'ADMIN' "
        "WHERE user_type = 'admin' AND account_level IS NULL"
    ))
    # 3) Employees become EMPLOYEE (the pre-existing single employee level).
    op.execute(sa.text(
        "UPDATE users SET account_level = 'EMPLOYEE' "
        "WHERE user_type = 'employee' AND account_level IS NULL"
    ))


def downgrade() -> None:
    for column in ("custom_permissions", "permission_mode", "account_level"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column(column)
