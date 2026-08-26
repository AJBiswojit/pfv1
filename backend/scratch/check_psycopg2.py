import psycopg2

conn = psycopg2.connect('postgresql://MEdixo:llUNUFIiX1tk30CGmEYt@database-1-restored.cfck4skoe4h0.ap-south-2.rds.amazonaws.com:5432/postgres')
cur = conn.cursor()

cur.execute("SELECT table_schema, count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') GROUP BY table_schema;")
print("Schema counts:", cur.fetchall())

cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'pratikshya';")
print("Pratikshya tables:", cur.fetchall())

cur.close()
conn.close()
