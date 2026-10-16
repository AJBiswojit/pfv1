"""add_employee_leave_table

Revision ID: f7d8e9f0a1b4
Revises: e7d8e9f0a1b3
Create Date: 2026-09-10

Creates pratikshya.employee_leave table for employee leave management.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f7d8e9f0a1b4"
down_revision: Union[str, None] = "e7d8e9f0a1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "pratikshya"
TABLE = "employee_leave"


def upgrade() -> None:
    # No-op: employee_leave is created by s2a3b4c5d6e7, which is the canonical
    # migration that matches the LeaveModel ORM (includes days, requested_at,
    # reviewed_at, review_note). Running both would cause an AlreadyExistsError
    # when s2 runs after this revision on the same branch join (merge 770a4ce325b5).
    pass


def downgrade() -> None:
    # No-op: this revision created nothing, so there is nothing to drop.
    pass
