import asyncio
import asyncpg

async def check_rds():
    url = 'postgresql://MEdixo:llUNUFIiX1tk30CGmEYt@database-1-restored.cfck4skoe4h0.ap-south-2.rds.amazonaws.com:5432/postgres'
    conn = await asyncpg.connect(url, ssl='prefer')
    
    schemas = await conn.fetch("SELECT schema_name FROM information_schema.schemata;")
    print("RDS Schemas:", [s['schema_name'] for s in schemas])
    
    try:
        ver = await conn.fetch("SELECT * FROM alembic_version;")
        print("RDS alembic_version:", [dict(r) for r in ver])
    except Exception as e:
        print("No alembic_version table found or error:", e)

    tables = await conn.fetch("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');")
    print("RDS existing tables count:", len(tables))
    print("RDS existing tables:", [(t['table_schema'], t['table_name']) for t in tables])
    
    await conn.close()

if __name__ == '__main__':
    asyncio.run(check_rds())
