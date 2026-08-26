import asyncio
import asyncpg

async def verify_rds():
    url = 'postgresql://MEdixo:llUNUFIiX1tk30CGmEYt@database-1-restored.cfck4skoe4h0.ap-south-2.rds.amazonaws.com:5432/postgres'
    conn = await asyncpg.connect(url, ssl='prefer')
    
    tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'pratikshya';")
    print(f"Total tables inside 'pratikshya' schema on RDS: {len(tables)}")
    print("Tables:", sorted([t['table_name'] for t in tables]))
    
    ver = await conn.fetch("SELECT * FROM pratikshya_alembic_version;")
    print("Alembic head version on RDS:", [dict(r) for r in ver])
    
    await conn.close()

if __name__ == '__main__':
    asyncio.run(verify_rds())
