import asyncio
import asyncpg

async def list_all():
    url = 'postgresql://MEdixo:llUNUFIiX1tk30CGmEYt@database-1-restored.cfck4skoe4h0.ap-south-2.rds.amazonaws.com:5432/postgres'
    conn = await asyncpg.connect(url, ssl='prefer')
    
    schemas = await conn.fetch("SELECT schema_name FROM information_schema.schemata;")
    print("All Schemas on RDS:", [s['schema_name'] for s in schemas])
    
    for s in schemas:
        sn = s['schema_name']
        if sn not in ('pg_catalog', 'information_schema'):
            tbls = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = $1;", sn)
            print(f"Schema '{sn}' has {len(tbls)} tables: {[t['table_name'] for t in tbls[:10]]}")
            
    await conn.close()

if __name__ == '__main__':
    asyncio.run(list_all())
