import pg from 'pg';

const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'ihifnhibzlgxotywbeji';
if (!password) throw new Error('Falta SUPABASE_DB_PASSWORD.');
const client = new pg.Client({ host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, user: `postgres.${projectRef}`, password, database: 'postgres', ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query('BEGIN');
  const advisor = await client.query('SELECT id FROM public.pos_advisors ORDER BY id LIMIT 1');
  const suffix = Date.now().toString(36);
  const orderId = `test-order-${suffix}`;
  const adviceId = `test-advice-${suffix}`;
  const designId = `test-design-${suffix}`;
  const approvalId = `test-approval-${suffix}`;
  await client.query(`INSERT INTO public.pos_orders
    (id,tracking_token,order_number,advisor_id,customer_name,job_name,total_amount,workflow_status)
    VALUES ($1,$2,$3,$4,'Cliente de prueba','Prueba transaccional',10,'planned')`,
  [orderId, `test-token-${suffix}`, `TEST-${suffix}`, advisor.rows[0]?.id || null]);
  await client.query(`INSERT INTO public.pos_production_operations
    (id,order_id,area,title,sequence,depends_on,status,estimated_minutes)
    VALUES ($1,$4,'asesoria','Asesoría',1,'[]','done',15),
           ($2,$4,'diseno','Diseño',2,$5::jsonb,'ready',30),
           ($3,$4,'aprobacion','Aprobación',3,$6::jsonb,'blocked',15)`,
  [adviceId, designId, approvalId, orderId, JSON.stringify([adviceId]), JSON.stringify([designId])]);
  await client.query("UPDATE public.pos_production_operations SET status='done' WHERE id=$1", [designId]);
  const result = await client.query('SELECT area,status FROM public.pos_production_operations WHERE order_id=$1 ORDER BY sequence', [orderId]);
  const approvalReady = result.rows.some((row) => row.area === 'aprobacion' && row.status === 'ready');
  if (!approvalReady) throw new Error(`La dependencia no liberó aprobación: ${JSON.stringify(result.rows)}`);
  console.log('Prueba transaccional correcta:', result.rows);
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
