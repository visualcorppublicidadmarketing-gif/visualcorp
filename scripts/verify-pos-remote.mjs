import pg from 'pg';

const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'ihifnhibzlgxotywbeji';
if (!password) throw new Error('Falta SUPABASE_DB_PASSWORD.');

const client = new pg.Client({
  host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543,
  user: `postgres.${projectRef}`, password, database: 'postgres',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000
});

const expected = {
  pos_advisors: ['id', 'name', 'role', 'assigned_area', 'daily_capacity_minutes'],
  pos_products: ['id', 'sku', 'name', 'category', 'calc_type', 'base_price', 'price_tiers'],
  pos_materials_inventory: ['id', 'name', 'category', 'current_stock', 'min_stock_alert'],
  pos_workstations: ['id', 'code', 'name', 'area', 'status'],
  pos_orders: ['id', 'tracking_token', 'order_number', 'advisor_id', 'customer_id', 'customer_name', 'customer_identification', 'customer_phone', 'job_name', 'order_date', 'delivery_date', 'pickup_location', 'pickup_pin', 'day_of_week', 'production_stage', 'production_priority', 'production_notes', 'assigned_area', 'involved_areas', 'execution_date', 'installation_date', 'requires_installation', 'installation_address', 'field_measurements_notes', 'workflow_status', 'stage_history', 'art_url', 'art_approved', 'art_approved_at', 'art_approved_by', 'status', 'payment_status', 'subtotal', 'tax_rate', 'tax_amount', 'discount_percent', 'discount_amount', 'discount_reason', 'shipping_cost', 'total_amount', 'deposit_amount', 'balance_due', 'notes', 'created_at', 'updated_at'],
  pos_order_items: ['id', 'order_id', 'product_id', 'product_name', 'category', 'calc_type', 'width_cm', 'height_cm', 'area_m2', 'quantity', 'unit_price', 'finishing', 'eyelet_count', 'eyelet_type', 'total_price', 'custom_details'],
  pos_payments: ['id', 'order_id', 'advisor_id', 'payment_date', 'payment_method', 'amount', 'tendered_amount', 'change_given', 'bank_name', 'reference_number', 'notes', 'created_at'],
  pos_production_operations: ['id', 'order_id', 'area', 'title', 'sequence', 'depends_on', 'status', 'assigned_to', 'estimated_minutes', 'actual_minutes', 'scheduled_start', 'scheduled_end', 'requires_approval', 'metadata']
};

await client.connect();
try {
  let hasMissing = false;
  for (const [table, expectedColumns] of Object.entries(expected)) {
    const result = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
    const columns = new Set(result.rows.map((row) => row.column_name));
    const missing = expectedColumns.filter((column) => !columns.has(column));
    hasMissing ||= missing.length > 0;
    const count = columns.size ? await client.query(`SELECT count(*)::int AS count FROM public.${table}`) : { rows: [{ count: 0 }] };
    console.log(`${table}: ${count.rows[0].count} filas; faltantes: ${missing.length ? missing.join(', ') : 'ninguno'}`);
  }
  const migrations = await client.query(`SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20260822000000' ORDER BY version`);
  console.log('Migraciones POS registradas:', migrations.rows);
  if (hasMissing) process.exitCode = 2;
} finally {
  await client.end();
}
