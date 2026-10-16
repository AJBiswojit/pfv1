# Homepage verification (Phase 3)

These two new suites live outside `backend/tests/` because `backend/.gitignore`
ignores new files throughout that directory. This keeps the verification sources
visible in the unstaged deliverable without changing any `.gitignore` or staging
files. Existing tracked regression tests remain in their original locations.

Run the database-free suite from the repository root:

```sh
PYTHONPATH=backend .venv/bin/python -m pytest -o addopts='' -q \
  backend/verification/unit/test_homepage_content.py
```

It blocks database connection attempts and uses fake sessions, mocked HTTP,
PostgreSQL SQL compilation and offline migration rendering. It does **not** prove
SQL execution, concurrency/locking, migration compatibility or durability.

`integration/test_homepage_disposable_pg.py` is opt-in. Without an explicitly
provided target it skips before connecting. Do not use a default `DATABASE_URL`,
SQLite, a shared/live database, historical migrations or stamping to enable it.
The required inputs are `HOMEPAGE_DISPOSABLE_TEST_URL`,
`HOMEPAGE_DISPOSABLE_TEST_DATABASE`, and
`HOMEPAGE_DISPOSABLE_TEST_APPROVED=YES`; never put connection credentials in a
report or commit. The database must be a separately authorized loopback PostgreSQL
target named `pfv1_homepage_disposable_[a-z0-9_]+`, with database comment
`pfv1:homepage:disposable:p3hp20261016a` and sole revision `l1a2b3c4d5e1` in
`pratikshya.pratikshya_alembic_version`. The first connection enforces read-only
mode from startup and verifies identity/schema/revision before permitting any
writes. Mismatch stops the test; it does not provision, stamp or catch up a target.

After separate target verification/authorization, the explicit opt-in command is:

```sh
PYTHONPATH=backend .venv/bin/python -m pytest -o addopts='' -q -s \
  backend/verification/integration/test_homepage_disposable_pg.py
```

The test applies only the new revision, exercises TEXT configuration with fresh
sessions, checks legacy fingerprints, downgrades only that revision, and upgrades
it again. It leaves the disposable target at `p3hp20261016a`. It mocks the grant
resolver: even a successful future run would not establish DB-backed RBAC or the
complete PRODUCT/MEDIA lifecycle and media-delivery acceptance matrix. No such
database run was performed during implementation. See
`docs/PHASE-3-HOMEPAGE-PERSISTENCE-REPORT.md` for executed evidence and blockers.
