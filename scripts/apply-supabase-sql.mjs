import fs from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

const file = process.argv[2];
const connectionString = process.env.GIGAPRINT_DB_URL;
if (!file || !connectionString) throw new Error('Uso: GIGAPRINT_DB_URL=... node scripts/apply-supabase-sql.mjs archivo.sql');

const sql = await fs.readFile(file, 'utf8');
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
try {
  await pool.query(sql);
  console.log(`Applied ${file}`);
} finally {
  await pool.end();
}
