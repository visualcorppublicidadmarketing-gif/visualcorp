import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const password = process.env.SUPABASE_DB_PASSWORD;
const migrationName = process.env.SUPABASE_MIGRATION;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'ihifnhibzlgxotywbeji';

if (!password) throw new Error('Falta SUPABASE_DB_PASSWORD.');
if (!/^\d{14}_[a-z0-9_]+\.sql$/i.test(migrationName || '')) throw new Error('SUPABASE_MIGRATION no es un archivo de migración válido.');

const hosts = [
  { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, user: `postgres.${projectRef}` },
  { host: 'aws-0-us-east-2.pooler.supabase.com', port: 6543, user: `postgres.${projectRef}` },
  { host: 'aws-0-sa-east-1.pooler.supabase.com', port: 6543, user: `postgres.${projectRef}` }
  ,{ host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres' }
];

let client;
for (const candidate of hosts) {
  const next = new pg.Client({ ...candidate, password, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await next.connect();
    client = next;
    console.log(`Conectado por ${candidate.host}:${candidate.port}`);
    break;
  } catch (error) {
    console.log(`Sin conexión por ${candidate.host}:${candidate.port}: ${error.code || error.message}`);
    await next.end().catch(() => {});
  }
}

if (!client) throw new Error('No se pudo conectar a la base de datos de Supabase.');

try {
  const filePath = path.resolve('supabase', 'migrations', migrationName);
  const sql = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
  const version = migrationName.slice(0, 14);
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
  await client.query(`CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version TEXT PRIMARY KEY,
    statements TEXT[],
    name TEXT
  )`);
  await client.query(
    'INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING',
    [version, [sql], migrationName.slice(15, -4)]
  );
  await client.query('COMMIT');

  const verification = await client.query(`
    SELECT
      to_regclass('public.pos_production_operations')::text AS operations_table,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_orders' AND column_name='involved_areas') AS has_involved_areas,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_orders' AND column_name='workflow_status') AS has_workflow_status
  `);
  console.log('Migración aplicada y verificada:', verification.rows[0]);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
