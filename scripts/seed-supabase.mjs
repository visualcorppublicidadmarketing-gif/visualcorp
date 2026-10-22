import process from 'node:process';
import pg from 'pg';
import { createServer } from 'vite';

const connectionString = process.env.GIGAPRINT_DB_URL;
if (!connectionString) throw new Error('Define GIGAPRINT_DB_URL antes de ejecutar la migración de datos.');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { initialData, themePresets } = await server.ssrLoadModule('/src/data.js');
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
const json = (value) => JSON.stringify(value ?? []);
const cleanPath = (value) => typeof value === 'string' && value.startsWith('/gigaprint-webpage/') ? value.replace('/gigaprint-webpage', '') : value;
const cleanAssets = (value) => Array.isArray(value) ? value.map(cleanAssets) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanAssets(item)])) : cleanPath(value);

try {
  const settings = initialData.settings;
  await pool.query(`insert into public.site_settings (id, brand, slogan, phone, email, address, whatsapp, hero_kicker, hero_title, hero_text, theme_preset, theme_presets)
    values ('main',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    on conflict (id) do update set brand=excluded.brand, slogan=excluded.slogan, phone=excluded.phone, email=excluded.email, address=excluded.address, whatsapp=excluded.whatsapp, hero_kicker=excluded.hero_kicker, hero_title=excluded.hero_title, hero_text=excluded.hero_text, theme_preset=excluded.theme_preset, theme_presets=excluded.theme_presets, updated_at=now()`, [settings.brand, settings.slogan, settings.phone, settings.email, settings.address, settings.whatsapp, settings.heroKicker, settings.heroTitle, settings.heroText, settings.themePreset, json(themePresets)]);

  for (const [index, row] of initialData.services.entries()) await pool.query(`insert into public.services (id,name,short,detail,icon,image,tag,sort_order,is_published) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (id) do update set name=excluded.name,short=excluded.short,detail=excluded.detail,icon=excluded.icon,image=excluded.image,tag=excluded.tag,sort_order=excluded.sort_order,is_published=excluded.is_published`, [row.id, row.name, row.short, row.detail, row.icon, cleanPath(row.image), row.tag, index, row.isPublished !== false]);
  for (const [index, row] of initialData.products.entries()) await pool.query(`insert into public.products (id,name,category,subcategory,type,calc_type,pricing_mode,price,price_inst,price_corp,unit,image,images,features,description,specs,price_scales,variant_options,price_matrix,colors,color_variations,attributes,custom_options,has_variants,sizes,min_quantity,quantity_step,source,featured,is_published,sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) on conflict (id) do update set name=excluded.name,category=excluded.category,subcategory=excluded.subcategory,calc_type=excluded.calc_type,pricing_mode=excluded.pricing_mode,price=excluded.price,price_inst=excluded.price_inst,price_corp=excluded.price_corp,unit=excluded.unit,image=excluded.image,images=excluded.images,features=excluded.features,description=excluded.description,specs=excluded.specs,price_scales=excluded.price_scales,variant_options=excluded.variant_options,price_matrix=excluded.price_matrix,colors=excluded.colors,color_variations=excluded.color_variations,attributes=excluded.attributes,custom_options=excluded.custom_options,has_variants=excluded.has_variants,sizes=excluded.sizes,min_quantity=excluded.min_quantity,quantity_step=excluded.quantity_step,source=excluded.source,featured=excluded.featured,is_published=excluded.is_published,sort_order=excluded.sort_order`, [row.id, row.name, row.category || 'General', row.subcategory || null, row.type || 'unit', row.calcType || row.type || 'unit', row.pricingMode || 'unit', Number(row.price) || 0, row.priceInst ?? null, row.priceCorp ?? null, row.unit, cleanPath(row.image), json(row.images), json(row.features), row.description, json(row.specs), json(row.priceScales), json(row.variantOptions), json(row.priceMatrix || {}), json(row.colors), json(row.colorVariations), json(row.attributes), json(row.customOptions || {}), Boolean(row.hasVariants || row.variantOptions?.length), json(row.sizes), Number(row.minQuantity) || 1, Number(row.quantityStep) || 1, row.source || 'manual', Boolean(row.featured), row.isPublished !== false, index]);
  const calculatorSettings = initialData.calculatorSettings;
  await pool.query(`insert into public.calculator_settings (id,tax_rate,min_dimension_cm,max_dimension_cm,design_adaptation_price,design_from_scratch_price,eyelet_small_price,eyelet_large_price,disclaimer) values ('default',$1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do update set tax_rate=excluded.tax_rate,min_dimension_cm=excluded.min_dimension_cm,max_dimension_cm=excluded.max_dimension_cm,design_adaptation_price=excluded.design_adaptation_price,design_from_scratch_price=excluded.design_from_scratch_price,eyelet_small_price=excluded.eyelet_small_price,eyelet_large_price=excluded.eyelet_large_price,disclaimer=excluded.disclaimer,updated_at=now()`, [calculatorSettings.taxRate, calculatorSettings.minDimensionCm, calculatorSettings.maxDimensionCm, calculatorSettings.designAdaptationPrice, calculatorSettings.designFromScratchPrice, calculatorSettings.eyeletSmallPrice, calculatorSettings.eyeletLargePrice, calculatorSettings.disclaimer]);
  for (const [index, row] of initialData.promotions.entries()) await pool.query(`insert into public.promotions (id,title,eyebrow,description,price,old_price,badge,active,sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (id) do update set title=excluded.title,eyebrow=excluded.eyebrow,description=excluded.description,price=excluded.price,old_price=excluded.old_price,badge=excluded.badge,active=excluded.active,sort_order=excluded.sort_order`, [row.id, row.title, row.eyebrow, row.description, row.price, row.oldPrice, row.badge, row.active !== false, index]);

  await pool.query(`insert into public.pages (id,slug,title,intro,is_published,sort_order) values ('home','home','Inicio',$1,true,0) on conflict (id) do update set intro=excluded.intro,updated_at=now()`, [settings.heroText]);
  for (const [index, block] of initialData.homeBlocks.entries()) await pool.query(`insert into public.page_blocks (id,page_id,block_type,content,sort_order,is_visible) values ($1,'home',$2,$3,$4,$5) on conflict (id) do update set block_type=excluded.block_type,content=excluded.content,sort_order=excluded.sort_order,is_visible=excluded.is_visible,updated_at=now()`, [block.id, block.type, json(cleanAssets(Object.fromEntries(Object.entries(block).filter(([key]) => !['id', 'type', 'visible'].includes(key))))), index, block.visible !== false]);

  const { DEFAULT_ADVISORS } = await server.ssrLoadModule('/src/lib/posStore.js');
  for (const row of DEFAULT_ADVISORS) {
    await pool.query(`insert into public.pos_advisors (id, name, email, phone, role, weekly_pin, weekly_password, current_week_code, pin_last_rotated_at, weekly_goal, is_active)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict (id) do update set name=excluded.name, email=excluded.email, phone=excluded.phone, weekly_pin=excluded.weekly_pin, weekly_password=excluded.weekly_password, current_week_code=excluded.current_week_code, pin_last_rotated_at=excluded.pin_last_rotated_at, weekly_goal=excluded.weekly_goal, is_active=excluded.is_active, updated_at=now()`,
      [row.id, row.name, row.email, row.phone, row.role || 'asesora', row.weeklyPin || row.pin, row.weeklyPassword, row.currentWeekCode, row.pinLastRotatedAt, Number(row.weeklyGoal) || 3200, row.isActive !== false]);
  }

  console.log(`Seeded ${initialData.services.length} services, ${initialData.products.length} products, ${initialData.promotions.length} promotions, ${initialData.homeBlocks.length} home blocks and ${DEFAULT_ADVISORS.length} POS advisors.`);
} finally {
  await pool.end();
  await server.close();
}
