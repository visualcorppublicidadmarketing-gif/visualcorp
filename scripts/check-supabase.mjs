import process from 'node:process';
import pg from 'pg';

const connectionString = process.env.GIGAPRINT_DB_URL;
if (!connectionString) throw new Error('Define GIGAPRINT_DB_URL.');
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
try {
  const policies = await pool.query(`select count(*)::int as count from pg_policies where schemaname='public'`);
  const buckets = await pool.query(`select id, public from storage.buckets where id in ('gigaprint-media','gigaprint-private') order by id`);
  const realCounts = await Promise.all(['site_settings','services','products','promotions','pages','page_blocks','profiles'].map(async (table) => ({ table, count: (await pool.query(`select count(*)::int as count from public.${table}`)).rows[0].count })));
  console.log(JSON.stringify({ tables: realCounts, publicPolicies: policies.rows[0].count, buckets: buckets.rows }, null, 2));
} finally { await pool.end(); }
