import asyncio
import asyncpg

async def check_schemas():
    url = 'postgresql://MEdixo:llUNUFIiX1tk30CGmEYt@database-1-restored.cfck4skoe4h0.ap-south-2.rds.amazonaws.com:5432/postgres'
    conn = await asyncpg.connect(url, ssl='prefer')
    
    rows = await conn.fetch("SELECT table_schema, count(*) as cnt FROM information_schema.tables GROUP BY table_schema;")
    for r in rows:
        print(f"Schema: '{r['table_schema']}' -> {r['cnt']} tables")
        
    await conn.close()

if __name__ == '__main__':
    asyncio.run(check_schemas())
