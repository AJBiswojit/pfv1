import psycopg2

conn = psycopg2.connect(
    host='database-1-restored.cfck4skoe4h0.ap-south-2.rds.amazonaws.com',
    port=5432,
    user='MEdixo',
    password='llUNUFIiX1tk30CGmEYt',
    dbname='postgres'
)
cur = conn.cursor()

# Check all schemas and their table counts
cur.execute("SELECT table_schema, COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') GROUP BY table_schema ORDER BY table_schema;")
rows = cur.fetchall()
print("=== SCHEMAS AND TABLE COUNTS ON RDS ===")
for row in rows:
    print(f"  Schema: {row[0]}  |  Tables: {row[1]}")

# Check all tables inside pratikshya schema
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='pratikshya' ORDER BY table_name;")
tables = cur.fetchall()
print(f"\n=== TABLES INSIDE 'pratikshya' SCHEMA ({len(tables)} total) ===")
for t in tables:
    print(f"  - {t[0]}")

# Check alembic version for pratikshya project
try:
    cur.execute("SELECT * FROM pratikshya_alembic_version;")
    ver = cur.fetchall()
    print(f"\n=== ALEMBIC VERSION (pratikshya_alembic_version) ===")
    print(f"  Current head: {ver}")
except Exception as e:
    print(f"\n  Note: {e}")

cur.close()
conn.close()
