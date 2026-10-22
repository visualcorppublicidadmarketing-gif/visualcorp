import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.GIGAPRINT_DB_PASSWORD;
if (!dbPassword) throw new Error('Define SUPABASE_DB_PASSWORD o GIGAPRINT_DB_PASSWORD antes de ejecutar.');
const projectRef = process.env.SUPABASE_PROJECT_REF || 'ihifnhibzlgxotywbeji';

// Try standard direct connection and pooler endpoints
const connectionCandidates = [
  `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`,
  `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
  `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true`,
  `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
];

async function tryConnect() {
  for (const conn of connectionCandidates) {
    const masked = conn.replace(/:[^:]*@/, ':****@');
    console.log(`Trying connection: ${masked}`);
    const pool = new pg.Pool({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 7000 });
    try {
      const res = await pool.query('SELECT current_database(), version()');
      console.log(`Connected successfully to database: ${res.rows[0].current_database}`);
      return { pool, conn };
    } catch (err) {
      console.log(`Failed on ${masked}: ${err.message}`);
      await pool.end().catch(() => {});
    }
  }
  throw new Error('Could not connect to Supabase database with any endpoint.');
}

async function runMigrations() {
  const { pool } = await tryConnect();
  try {
    // Migrations in sorted order
    const migrationsDir = path.resolve('supabase/migrations');
    const files = (await fs.readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      console.log(`\n--- Applying migration: ${file} ---`);
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
      console.log(`✓ Applied migration: ${file}`);
    }

    console.log('\nAll migrations applied successfully!');
    
    // Check tables
    const tableRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('\nTables in public schema:');
    tableRes.rows.forEach(r => console.log(' •', r.table_name));

    // Check count of products and settings
    const productCount = await pool.query('SELECT count(*)::int as count FROM public.products');
    console.log(`\nProducts count in Supabase: ${productCount.rows[0].count}`);
  } finally {
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
