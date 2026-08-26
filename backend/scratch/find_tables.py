import asyncio
import asyncpg

async def check_all_tables():
    url = 'postgresql://MEdixo:llUNUFIiX1tk30CGmEYt@database-1-restored.cfck4skoe4h0.ap-south-2.rds.amazonaws.com:5432/postgres'
    conn = await asyncpg.connect(url, ssl='prefer')
    
    tables = await conn.fetch("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');")
    for t in tables:
        if 'catalog' in t['table_name'] or 'order' in t['table_name'] or 'user' in t['table_name'] or 'pratikshya' in t['table_name']:
            print(f"Schema: {t['table_schema']} | Table: {t['table_name']}")
            
    await conn.close()

if __name__ == '__main__':
    asyncio.run(check_all_tables())
