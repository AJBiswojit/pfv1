-- PostgreSQL / psql READ-ONLY migration evidence collection.
-- This is a diagnostic document, NOT an Alembic migration.
-- Use a preconfigured read-only libpq service; never paste credentials in chat.
-- From repository root, with PGSERVICE set to the approved deployment service:
-- PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000' \
--   psql -X --no-password -v ON_ERROR_STOP=1 -P pager=off -f docs/migration-readonly-check.sql
-- Do NOT substitute `alembic current`: this checkout's env.py executes DDL.

\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_setting('transaction_read_only') AS transaction_read_only,
       current_setting('transaction_isolation') AS transaction_isolation,
       current_setting('search_path') AS search_path;

-- Discover BOTH the configured and conventional version tables in all schemas.
-- Their presence is not proof they are authoritative for the deployed release.
SELECT n.nspname AS table_schema, c.relname AS table_name,
       EXISTS (
           SELECT 1 FROM pg_catalog.pg_attribute a
           WHERE a.attrelid = c.oid AND a.attname = 'version_num'
             AND a.attnum > 0 AND NOT a.attisdropped
       ) AS has_version_num
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND c.relname IN ('pratikshya_alembic_version', 'alembic_version')
ORDER BY n.nspname, c.relname;

-- Execute ONLY generated, identifier-quoted SELECTs against existing version
-- tables. Alembic stores CURRENT revision tips, not an append-only history.
-- No rows/absent tables must NOT be interpreted as proof of an empty database.
SELECT format(
    'SELECT %L AS version_table, version_num FROM %I.%I ORDER BY version_num;',
    n.nspname || '.' || c.relname, n.nspname, c.relname
)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND c.relname IN ('pratikshya_alembic_version', 'alembic_version')
  AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'version_num'
        AND a.attnum > 0 AND NOT a.attisdropped
  )
ORDER BY n.nspname, c.relname
\gexec

-- Discover affected relations, including legacy-schema or duplicate copies.
SELECT n.nspname AS table_schema, c.relname AS table_name, c.relkind
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN ('media_media_asset', 'media_product_media',
                    'media_marketing_media', 'user_product_interactions')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname;

-- Column metadata only; no media objects, product records, or behavioral data.
SELECT n.nspname AS table_schema, c.relname AS table_name,
       a.attnum AS ordinal_position, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE c.relname IN ('media_media_asset', 'media_product_media', 'media_marketing_media')
  AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum;

-- All incoming/outgoing FKs and table constraints, not a guessed FK name.
-- confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT.
SELECT ns.nspname AS source_schema, src.relname AS source_table,
       con.conname AS constraint_name, con.contype AS constraint_type,
       nt.nspname AS target_schema, dst.relname AS target_table,
       con.convalidated AS validated, con.condeferrable AS deferrable,
       con.confdeltype AS delete_action,
       pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
JOIN pg_catalog.pg_namespace ns ON ns.oid = src.relnamespace
LEFT JOIN pg_catalog.pg_class dst ON dst.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace nt ON nt.oid = dst.relnamespace
WHERE src.relname IN ('media_media_asset', 'media_product_media', 'media_marketing_media')
   OR dst.relname = 'media_media_asset'
ORDER BY ns.nspname, src.relname, con.conname;

SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid = src.relnamespace
    JOIN pg_catalog.pg_class dst ON dst.oid = con.confrelid
    JOIN pg_catalog.pg_namespace nt ON nt.oid = dst.relnamespace
    WHERE con.contype = 'f' AND ns.nspname = 'pratikshya'
      AND src.relname = 'media_marketing_media' AND nt.nspname = 'pratikshya'
      AND dst.relname = 'media_media_asset'
) AS marketing_to_asset_fk_present;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE tablename IN ('media_media_asset', 'media_product_media', 'media_marketing_media')
ORDER BY schemaname, tablename, indexname;

ROLLBACK;
