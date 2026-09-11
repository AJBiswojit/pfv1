"""Account-level schema migration — graph, idempotency, existing-user preservation.

Proves that revision ``r1a2b3c4d5e6`` (and the idempotent safety-net
``t3c4d5e6f7a8``) is the revision that adds ``account_level``,
``permission_mode`` and ``custom_permissions`` to ``pratikshya.users``, that
the Alembic DAG still has a single head, and that applying the helper to a
pre-column users table:

  * does not delete existing users
  * does not reset passwords
  * backfills SUPER_ADMIN / ADMIN / EMPLOYEE deterministically
  * leaves customers' account_level NULL
  * is safe to run twice
"""

from __future__ import annotations

import importlib.util
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory

def _backend_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "alembic" / "versions").is_dir():
            return parent
    raise RuntimeError("backend/alembic/versions not found from test path")


BACKEND_ROOT = _backend_root()
R1_PATH = BACKEND_ROOT / "alembic" / "versions" / "r1a2b3c4d5e6_add_account_level_columns.py"
T3_PATH = BACKEND_ROOT / "alembic" / "versions" / "t3c4d5e6f7a8_ensure_users_account_level_columns.py"
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"

REQUIRED_COLUMNS = ("account_level", "permission_mode", "custom_permissions")
ACCOUNT_LEVELS = ("SUPER_ADMIN", "ADMIN", "SUPER_EMPLOYEE", "EMPLOYEE")


def _load_r1():
    spec = importlib.util.spec_from_file_location("r1_account_level_columns", R1_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _script() -> ScriptDirectory:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    return ScriptDirectory.from_config(cfg)


class AccountLevelMigrationGraphTests(unittest.TestCase):
    def setUp(self):
        self.script = _script()

    def test_canonical_revision_is_r1(self):
        rev = self.script.get_revision("r1a2b3c4d5e6")
        self.assertIsNotNone(rev)
        self.assertEqual(set(rev.down_revision), {"b6b5dcfb675b", "d8e9f0a1b2c3"})

    def test_single_head_is_the_ensure_revision(self):
        heads = self.script.get_heads()
        self.assertEqual(heads, ["t3c4d5e6f7a8"])

    def test_ensure_revision_follows_workforce_then_r1(self):
        t3 = self.script.get_revision("t3c4d5e6f7a8")
        s2 = self.script.get_revision("s2a3b4c5d6e7")
        self.assertEqual(t3.down_revision, "s2a3b4c5d6e7")
        self.assertEqual(s2.down_revision, "r1a2b3c4d5e6")

    def test_r1_source_targets_pratikshya_users(self):
        source = R1_PATH.read_text(encoding="utf-8")
        self.assertIn("pratikshya.users", source)
        self.assertIn("ADD COLUMN IF NOT EXISTS account_level", source)
        self.assertIn("ADD COLUMN IF NOT EXISTS permission_mode", source)
        self.assertIn("ADD COLUMN IF NOT EXISTS custom_permissions", source)
        for level in ACCOUNT_LEVELS:
            self.assertIn(level, source)
        self.assertNotIn("DELETE FROM users", source)
        self.assertNotIn("DROP TABLE", source)

    def test_ensure_revision_reuses_r1_helper(self):
        source = T3_PATH.read_text(encoding="utf-8")
        self.assertIn("r1a2b3c4d5e6_add_account_level_columns.py", source)
        self.assertIn("apply_account_level_columns", source)

    def test_user_model_declares_the_three_columns(self):
        from app.models.auth.user import UserModel

        column_names = {c.name for c in UserModel.__table__.columns}
        for name in REQUIRED_COLUMNS:
            self.assertIn(name, column_names)
        self.assertEqual(str(UserModel.__table__.schema), "pratikshya")


class AccountLevelMigrationApplyTests(unittest.TestCase):
    """Apply the helper to a pre-column users table (SQLite stand-in)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="pf-acct-level-")
        self.main_db = os.path.join(self._tmp.name, "main.sqlite")
        self.schema_db = os.path.join(self._tmp.name, "pratikshya.sqlite")
        self.engine = sa.create_engine(f"sqlite:///{self.main_db}")

        @sa.event.listens_for(self.engine, "connect")
        def _attach(dbapi_conn, _record):  # pragma: no cover - driver hook
            cursor = dbapi_conn.cursor()
            cursor.execute(f"ATTACH DATABASE '{self.schema_db}' AS pratikshya")
            cursor.close()

        now = datetime.now(timezone.utc).isoformat()
        with self.engine.begin() as conn:
            conn.execute(
                sa.text(
                    """
                    CREATE TABLE pratikshya.users (
                        id VARCHAR(36) PRIMARY KEY,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        email VARCHAR(255),
                        phone VARCHAR(20),
                        full_name VARCHAR(255) NOT NULL,
                        hashed_password VARCHAR(255),
                        user_type VARCHAR(50) NOT NULL,
                        status VARCHAR(50) NOT NULL,
                        is_verified BOOLEAN NOT NULL,
                        force_password_change BOOLEAN NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                sa.text(
                    """
                    CREATE TABLE pratikshya.roles (
                        id VARCHAR(36) PRIMARY KEY,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        name VARCHAR(50) NOT NULL,
                        description VARCHAR(255),
                        is_system BOOLEAN NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                sa.text(
                    """
                    CREATE TABLE pratikshya.user_roles (
                        id VARCHAR(36) PRIMARY KEY,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        user_id VARCHAR(36) NOT NULL,
                        role_id VARCHAR(36) NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO pratikshya.roles
                        (id, created_at, updated_at, name, description, is_system)
                    VALUES
                        ('role-sa', :now, :now, 'SUPER_ADMIN', 'system', 1),
                        ('role-admin', :now, :now, 'ADMIN', 'system', 1),
                        ('role-se', :now, :now, 'SUPER_EMPLOYEE', 'system', 1)
                    """
                ),
                {"now": now},
            )
            rows = [
                ("u-super", "seeded-super@pratikshya.test", "Seeded Super", "HASH-SUPER", "admin"),
                ("u-admin", "seeded-admin@pratikshya.test", "Seeded Admin", "HASH-ADMIN", "admin"),
                ("u-se", "seeded-se@pratikshya.test", "Seeded Super Emp", "HASH-SE", "employee"),
                ("u-emp", "seeded-emp@pratikshya.test", "Seeded Employee", "HASH-EMP", "employee"),
                ("u-cust", "seeded-cust@pratikshya.test", "Seeded Customer", "HASH-CUST", "customer"),
            ]
            for uid, email, name, hashed, utype in rows:
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO pratikshya.users (
                            id, created_at, updated_at, email, full_name,
                            hashed_password, user_type, status, is_verified,
                            force_password_change
                        ) VALUES (
                            :id, :now, :now, :email, :name, :hashed, :utype,
                            'ACTIVE', 1, 0
                        )
                        """
                    ),
                    {
                        "id": uid,
                        "now": now,
                        "email": email,
                        "name": name,
                        "hashed": hashed,
                        "utype": utype,
                    },
                )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO pratikshya.user_roles
                        (id, created_at, updated_at, user_id, role_id)
                    VALUES
                        ('ur-sa', :now, :now, 'u-super', 'role-sa'),
                        ('ur-se', :now, :now, 'u-se', 'role-se')
                    """
                ),
                {"now": now},
            )

        self.apply = _load_r1().apply_account_level_columns

    def tearDown(self):
        self.engine.dispose()
        self._tmp.cleanup()

    def _columns(self) -> set:
        with self.engine.connect() as conn:
            inspector = sa.inspect(conn)
            return {c["name"] for c in inspector.get_columns("users", schema="pratikshya")}

    def _users(self):
        with self.engine.connect() as conn:
            return conn.execute(
                sa.text(
                    """
                    SELECT id, email, hashed_password, user_type,
                           account_level, permission_mode, custom_permissions
                      FROM pratikshya.users
                     ORDER BY id
                    """
                )
            ).mappings().all()

    def test_helper_adds_the_three_columns_without_deleting_rows(self):
        self.assertFalse(self._columns() & set(REQUIRED_COLUMNS))
        with self.engine.begin() as conn:
            self.apply(conn)
        cols = self._columns()
        for name in REQUIRED_COLUMNS:
            self.assertIn(name, cols)

        users = {row["id"]: row for row in self._users()}
        self.assertEqual(set(users), {"u-super", "u-admin", "u-se", "u-emp", "u-cust"})
        self.assertEqual(users["u-super"]["hashed_password"], "HASH-SUPER")
        self.assertEqual(users["u-admin"]["hashed_password"], "HASH-ADMIN")
        self.assertEqual(users["u-se"]["hashed_password"], "HASH-SE")
        self.assertEqual(users["u-emp"]["hashed_password"], "HASH-EMP")
        self.assertEqual(users["u-cust"]["hashed_password"], "HASH-CUST")

    def test_backfill_is_deterministic_and_leaves_customers_null(self):
        with self.engine.begin() as conn:
            self.apply(conn)
        users = {row["id"]: row for row in self._users()}
        self.assertEqual(users["u-super"]["account_level"], "SUPER_ADMIN")
        self.assertEqual(users["u-admin"]["account_level"], "ADMIN")
        self.assertEqual(users["u-se"]["account_level"], "SUPER_EMPLOYEE")
        self.assertEqual(users["u-emp"]["account_level"], "EMPLOYEE")
        self.assertIsNone(users["u-cust"]["account_level"])
        self.assertEqual(users["u-super"]["permission_mode"], "role")
        self.assertEqual(users["u-admin"]["permission_mode"], "role")
        self.assertEqual(users["u-emp"]["permission_mode"], "role")
        # Column default is 'role'; customers still have no staff account_level.
        self.assertIn(users["u-cust"]["permission_mode"], (None, "role"))
        self.assertIsNone(users["u-super"]["custom_permissions"])

    def test_helper_is_idempotent_and_does_not_overwrite_existing_levels(self):
        with self.engine.begin() as conn:
            self.apply(conn)
            conn.execute(
                sa.text(
                    "UPDATE pratikshya.users SET account_level = 'SUPER_EMPLOYEE' "
                    "WHERE id = 'u-emp'"
                )
            )
            self.apply(conn)
        users = {row["id"]: row for row in self._users()}
        self.assertEqual(users["u-emp"]["account_level"], "SUPER_EMPLOYEE")
        self.assertEqual(users["u-super"]["account_level"], "SUPER_ADMIN")
        self.assertEqual(len(users), 5)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
