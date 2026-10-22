import pg from 'pg';
import { createServer } from 'vite';

const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'ihifnhibzlgxotywbeji';
if (!password) throw new Error('Falta SUPABASE_DB_PASSWORD.');

const client = new pg.Client({
  host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543,
  user: `postgres.${projectRef}`, password, database: 'postgres',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000
});
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const { DEFAULT_ADVISORS, DEFAULT_PRODUCTS, DEFAULT_MATERIALS, DEFAULT_WORKSTATIONS } = await server.ssrLoadModule('/src/lib/posStore.js');
  await client.connect();
  await client.query('BEGIN');

  for (const row of DEFAULT_ADVISORS) {
    await client.query(`INSERT INTO public.pos_advisors
      (id,name,email,phone,role,pin,weekly_pin,weekly_password,current_week_code,pin_last_rotated_at,weekly_goal,is_active,assigned_area)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO NOTHING`,
    [row.id, row.name, row.email, row.phone, row.role, row.pin, row.weeklyPin, row.weeklyPassword, row.currentWeekCode, row.pinLastRotatedAt, Number(row.weeklyGoal || 0), row.isActive !== false, row.assignedArea]);
  }

  for (const row of DEFAULT_PRODUCTS) {
    await client.query(`INSERT INTO public.pos_products
      (id,sku,name,category,parent_category,calc_type,base_price,min_price,unit,price_tiers,is_active,description,lead_time_days)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
      ON CONFLICT (id) DO NOTHING`,
    [row.id, row.sku, row.name, row.category, row.category, row.calcType, Number(row.basePrice || 0), Number(row.minPrice || 0), row.unit, JSON.stringify(row.priceTiers || []), row.isActive !== false, row.description, Number(row.leadTimeDays || 2)]);
  }

  for (const row of DEFAULT_MATERIALS) {
    await client.query(`INSERT INTO public.pos_materials_inventory
      (id,name,category,unit,current_stock,min_stock_alert,width_m,length_m,cost_per_unit,supplier_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO NOTHING`,
    [row.id, row.name, row.category, row.unit, row.currentStock, row.minStockAlert, row.widthM, row.lengthM, row.costPerUnit, row.supplierName]);
  }

  for (const row of DEFAULT_WORKSTATIONS) {
    await client.query(`INSERT INTO public.pos_workstations
      (id,code,name,area,model,max_width_m,status,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING`,
    [row.id, row.code, row.name, row.area, row.model, row.maxWidthM, row.status, row.notes]);
  }

  await client.query('COMMIT');
  console.log(`Datos POS listos: ${DEFAULT_ADVISORS.length} personas, ${DEFAULT_PRODUCTS.length} productos, ${DEFAULT_MATERIALS.length} materiales y ${DEFAULT_WORKSTATIONS.length} estaciones.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
  await server.close();
}
