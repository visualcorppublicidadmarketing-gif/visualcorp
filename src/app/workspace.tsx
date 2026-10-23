import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import sourceCatalog from '../data/estebanicoSupabaseCatalog.snapshot.json';
import { catalogImagesForProduct } from '../data/catalogProductImages';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';

const STORAGE_KEY = 'visualcorp-suite-local-v1';
const WorkspaceContext = createContext<any>(null);
const uid = (prefix = 'item') => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

// Catálogo inicial de necesidades: guía para completar el inventario, no prueba de compra ni de existencia.
const inventoryStarterRows = [
  ['IMP', 'Papel bond', 'Papelería', '', 'hoja'], ['IMP', 'Papel couché', 'Papelería', 'Gramaje por confirmar', 'hoja'],
  ['IMP', 'Papel adhesivo', 'Papelería', 'Acabado por confirmar', 'hoja'], ['IMP', 'Cartulina', 'Papelería', 'Color y gramaje por confirmar', 'hoja'],
  ['IMP', 'Vinil adhesivo', 'Viniles', 'Ancho y acabado por confirmar', 'metro'], ['IMP', 'Vinil transparente', 'Viniles', 'Ancho por confirmar', 'metro'],
  ['IMP', 'Lona estándar', 'Lonas', 'Ancho por confirmar', 'metro'], ['IMP', 'Lona translúcida', 'Lonas', 'Ancho por confirmar', 'metro'],
  ['IMP', 'Tinta de impresión', 'Tintas', 'Color y equipo compatibles por confirmar', 'ml'], ['IMP', 'Laminado protector', 'Acabados', 'Tipo y ancho por confirmar', 'metro'],
  ['SUB', 'Taza blanca para sublimación', 'Tazas', 'Capacidad y acabado por confirmar', 'unidad'], ['SUB', 'Taza metalizada', 'Tazas', 'Color y capacidad por confirmar', 'unidad'],
  ['SUB', 'Taza mágica', 'Tazas', 'Color y capacidad por confirmar', 'unidad'], ['SUB', 'Papel para sublimación', 'Papeles', 'Formato por confirmar', 'hoja'],
  ['SUB', 'Tinta para sublimación', 'Tintas', 'Color y equipo compatibles por confirmar', 'ml'], ['SUB', 'Camiseta para sublimación', 'Textil', 'Talla y color por confirmar', 'unidad'],
  ['SUB', 'Mouse pad sublimable', 'Promocionales', 'Medida por confirmar', 'unidad'], ['SUB', 'Llavero sublimable', 'Promocionales', 'Modelo por confirmar', 'unidad'],
  ['SUB', 'Botella sublimable', 'Promocionales', 'Material y capacidad por confirmar', 'unidad'], ['SUB', 'Placa sublimable', 'Placas', 'Material y medida por confirmar', 'unidad'],
  ['TRO', 'Vinil adhesivo', 'Viniles', 'Color, acabado y ancho por confirmar', 'metro'], ['TRO', 'Vinil textil', 'Viniles', 'Color y ancho por confirmar', 'metro'],
  ['TRO', 'Vinil reflectivo', 'Viniles', 'Color y ancho por confirmar', 'metro'], ['TRO', 'Vinil esmerilado', 'Viniles', 'Ancho por confirmar', 'metro'],
  ['TRO', 'Vinil microperforado', 'Viniles', 'Ancho por confirmar', 'metro'], ['TRO', 'Vinil transparente', 'Viniles', 'Ancho por confirmar', 'metro'],
  ['TRO', 'Cinta de transferencia', 'Transferencia', 'Ancho por confirmar', 'metro'], ['TRO', 'Laminado para vinil', 'Acabados', 'Tipo y ancho por confirmar', 'metro'],
  ['TRO', 'Máscara de transferencia', 'Transferencia', 'Ancho por confirmar', 'metro'], ['TRO', 'Papel transportador', 'Transferencia', 'Ancho por confirmar', 'metro'],
  ['LAS', 'MDF para corte láser', 'Tableros', 'Espesor y formato por confirmar', 'hoja'], ['LAS', 'Acrílico para corte láser', 'Plásticos', 'Color, espesor y formato por confirmar', 'hoja'],
  ['LAS', 'Triplay para corte láser', 'Maderas', 'Espesor y formato por confirmar', 'hoja'], ['LAS', 'Cartón para corte láser', 'Papeles', 'Tipo y formato por confirmar', 'hoja'],
  ['LAS', 'Cuero sintético para grabado', 'Textiles', 'Color y formato por confirmar', 'hoja'], ['LAS', 'Papel para corte láser', 'Papeles', 'Tipo y formato por confirmar', 'hoja'],
  ['LAS', 'Repuesto de lente láser', 'Repuestos', 'Diámetro y equipo compatibles por confirmar', 'unidad'], ['LAS', 'Repuesto de espejo láser', 'Repuestos', 'Medida y equipo compatibles por confirmar', 'unidad'],
  ['LAS', 'Material de prueba para grabado', 'Muestras', 'Material por confirmar', 'unidad'], ['LAS', 'Material de enmascarado', 'Consumibles', 'Tipo y ancho por confirmar', 'metro'],
  ['TAL', 'Silicona transparente', 'Adhesivos', 'Presentación por confirmar', 'unidad'], ['TAL', 'Silicona blanca', 'Adhesivos', 'Presentación por confirmar', 'unidad'],
  ['TAL', 'Silicona negra', 'Adhesivos', 'Presentación por confirmar', 'unidad'], ['TAL', 'Pegamento de contacto', 'Adhesivos', 'Presentación por confirmar', 'unidad'],
  ['TAL', 'Tornillos', 'Fijaciones', 'Tipo y medida por confirmar', 'unidad'], ['TAL', 'Pernos', 'Fijaciones', 'Tipo y medida por confirmar', 'unidad'],
  ['TAL', 'Cable eléctrico', 'Electricidad', 'Calibre y color por confirmar', 'metro'], ['TAL', 'Pintura', 'Acabados', 'Tipo y color por confirmar', 'litro'],
  ['TAL', 'Discos de corte', 'Consumibles', 'Diámetro y material por confirmar', 'unidad'], ['TAL', 'Brocas', 'Consumibles', 'Diámetro y material por confirmar', 'unidad'],
  ['NEO', 'Manguera neón LED', 'Iluminación', 'Color y voltaje por confirmar', 'metro'], ['NEO', 'Tira LED', 'Iluminación', 'Color, densidad y voltaje por confirmar', 'metro'],
  ['NEO', 'Fuente de alimentación LED', 'Electricidad', 'Voltaje y potencia por confirmar', 'unidad'], ['NEO', 'Cable para neón', 'Electricidad', 'Calibre por confirmar', 'metro'],
  ['NEO', 'Conector para iluminación LED', 'Conectores', 'Modelo por confirmar', 'unidad'], ['NEO', 'Controlador LED', 'Electricidad', 'Compatibilidad por confirmar', 'unidad'],
  ['NEO', 'Acrílico para letrero luminoso', 'Plásticos', 'Color, espesor y formato por confirmar', 'hoja'], ['NEO', 'Perfil para letrero luminoso', 'Estructuras', 'Tipo y medida por confirmar', 'metro'],
  ['NEO', 'Cinta aislante', 'Electricidad', 'Color y ancho por confirmar', 'unidad'], ['NEO', 'Terminal eléctrico', 'Conectores', 'Tipo y calibre por confirmar', 'unidad'],
  ['BOD', 'Cinta de embalaje', 'Empaque', 'Ancho por confirmar', 'unidad'], ['BOD', 'Cartón para empaque', 'Empaque', 'Formato por confirmar', 'hoja'],
  ['BOD', 'Fundas para despacho', 'Empaque', 'Tamaño y material por confirmar', 'unidad'], ['BOD', 'Etiquetas de identificación', 'Organización', 'Formato por confirmar', 'unidad'],
  ['BOD', 'Guantes de protección', 'Seguridad', 'Material y talla por confirmar', 'par'], ['BOD', 'Mascarillas de protección', 'Seguridad', 'Tipo por confirmar', 'unidad'],
  ['BOD', 'Alcohol de limpieza', 'Limpieza', 'Concentración y presentación por confirmar', 'litro'], ['BOD', 'Paños de limpieza', 'Limpieza', 'Material por confirmar', 'unidad'],
  ['BOD', 'Marcadores permanentes', 'Organización', 'Colores y puntas por confirmar', 'unidad'], ['BOD', 'Bolsas resellables', 'Empaque', 'Tamaño por confirmar', 'unidad'],
];

const starterInventory = inventoryStarterRows.map(([areaCode, name, category, variant, unit], index) => {
  const serial = String(inventoryStarterRows.slice(0, index + 1).filter((row) => row[0] === areaCode).length).padStart(3, '0');
  const sku = `VC-INV-${areaCode}-${serial}`;
  return {
    id: sku, sku, name, category, variant, unit, area: ({ IMP: 'Impresión', SUB: 'Sublimación', TRO: 'Troquelado', LAS: 'Láser', TAL: 'Taller', NEO: 'Neones', BOD: 'Bodega general' })[areaCode],
    branch: 'Visual Corp', location: 'Pendiente de ubicar', quantity: 0, minimum: 0,
    sourceStatus: 'Catálogo sugerido · existencia por verificar',
    notes: `Registro sugerido para completar el catálogo. Confirmar especificación, unidad y existencia física. ${variant || 'Verificar presentación y variante antes de comprar.'}`,
    starterCatalog: true,
  };
});

const defaultServices = [
  { id: 'impresion', name: 'Impresión y papelería', description: 'Piezas gráficas para comunicar tu marca.', enabled: true },
  { id: 'gran-formato', name: 'Publicidad de gran formato', description: 'Soluciones para que tu mensaje se vea.', enabled: true },
  { id: 'rotulos', name: 'Rótulos y fachadas', description: 'Identidad visible para espacios y negocios.', enabled: true },
  { id: 'textil', name: 'Textil y promocionales', description: 'Piezas personalizadas para marcas y equipos.', enabled: true },
  { id: 'corte', name: 'Corte, grabado y señalética', description: 'Piezas gráficas y señalización a medida.', enabled: true },
  { id: 'eventos', name: 'Exhibición y eventos', description: 'Material visual para presentar ideas y proyectos.', enabled: true },
];

const catalog = (sourceCatalog.products || []).map((product, index) => {
  const normalized = {
  id: product.id || `vc-${index + 1}`,
  name: product.name,
  family: product.category || 'General',
  mode: product.calcType === 'm2' ? 'area' : 'quantity',
  priceBasis: 'unit',
  tiers: (product.priceScales || []).filter((scale) => scale.qty != null && (scale.pvp != null || scale.price != null)).map((scale) => ({ min_qty: Number(scale.qty), unit_price: Number(scale.pvp ?? scale.price) })),
  optionPrices: (product.priceScales || []).filter((scale) => scale.option != null && scale.price != null).map((scale) => ({ label: String(scale.option), price: Number(scale.price) })),
  unit: product.calcType === 'm2' ? 'm²' : 'unidad',
  price: Number(product.price) || 0,
  installPrice: product.installPrice == null ? null : Number(product.installPrice),
  corporatePrice: product.corporatePrice == null ? null : Number(product.corporatePrice),
  image: product.image || '',
  images: product.images || [],
  confirmed: product.published === true && Number(product.price) > 0,
  published: product.published === true,
  description: product.description || '',
  source: 'Supabase · estebanico.com',
  updatedAt: product.updatedAt,
  };
  return { ...normalized, images: catalogImagesForProduct(normalized) };
});

function createInitialState() {
  return {
    schemaVersion: 1,
    settings: {
      name: 'Visual Corp',
      location: 'Milagro, Ecuador',
      heroEyebrow: 'Agencia de publicidad y marketing',
      heroTitle: 'Hacemos visible lo que imaginas.',
      heroText: 'Diseño, producción y marketing para marcas que quieren ocupar su espacio.',
      contactPhone: '0967872396',
      instagram: '@visualcorpec',
    },
    services: defaultServices,
    catalog,
    legacyCatalog: [],
    customers: [],
    inventoryMovements: [],
    leads: [],
    quotes: [],
    inventory: starterInventory,
    sales: [],
    campaigns: [],
  };
}

function readState() {
  const initial = createInitialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.schemaVersion !== 1) return initial;
    const seedById = new Map(initial.catalog.map((item)=>[item.id,item]));
    const storedById = new Map((Array.isArray(saved.catalog) ? saved.catalog : []).map((item) => [item.id, item]));
    const catalogWithEdits = initial.catalog.map((seed) => {
      const item = storedById.get(seed.id);
      return item ? { ...seed, ...item, tiers: seed.tiers, optionPrices: seed.optionPrices, installPrice: seed.installPrice, corporatePrice: seed.corporatePrice, image: seed.image } : seed;
    });
    const legacyCatalog = (Array.isArray(saved.catalog) ? saved.catalog : []).filter((item) => !seedById.has(item.id));
    const storedInventory = Array.isArray(saved.inventory) ? saved.inventory : initial.inventory;
    const storedMovements = Array.isArray(saved.inventoryMovements) ? saved.inventoryMovements : initial.inventoryMovements;
    const storedCustomers = Array.isArray(saved.customers) ? saved.customers : initial.customers;
    return {
      ...initial,
      ...saved,
      settings: { ...initial.settings, ...saved.settings },
      catalog: catalogWithEdits,
      legacyCatalog,
      inventory: [...storedInventory.map((item) => Object.prototype.hasOwnProperty.call(item, 'sourceStatus') ? item : { ...item, sourceStatus: 'Conteo inicial pendiente' }), ...starterInventory.filter((seed) => !storedInventory.some((item) => item.id === seed.id || item.sku === seed.sku))],
      inventoryMovements: storedMovements,
      customers: storedCustomers,
    };
  } catch {
    return initial;
  }
}

export function WorkspaceProvider({ children }) {
  const [data, setData] = useState(readState);
  const [notice, setNotice] = useState('');
  const { organizationId, user } = useAuth();
  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;
    const hydrate = async () => {
      const [settingsResult, servicesResult, catalogResult] = await Promise.all([
        supabase.from('site_settings').select('*').eq('id', 'main').maybeSingle(),
        supabase.from('services').select('*').order('sort_order'),
        supabase.from('public_quote_catalog_products').select('*').order('sort_order'),
      ]);
      if (!active || settingsResult.error || servicesResult.error || catalogResult.error) return;
      const settings = settingsResult.data;
      const services = (servicesResult.data || []).map((row) => ({ id: row.id, name: row.name, description: row.short || row.detail || '', enabled: row.is_published }));
      const remoteCatalog = (catalogResult.data || []).map((row) => ({
        id: row.id, name: row.name, slug: row.slug, family: row.category || 'General', mode: row.calc_type === 'm2' ? 'area' : 'quantity',
        priceBasis: 'unit', tiers: (row.price_scales || []).filter((scale) => scale.qty != null && (scale.pvp != null || scale.price != null)).map((scale) => ({ min_qty: Number(scale.qty), unit_price: Number(scale.pvp ?? scale.price) })),
        optionPrices: (row.price_scales || []).filter((scale) => scale.option != null && scale.price != null).map((scale) => ({ label: String(scale.option), price: Number(scale.price) })),
        unit: row.calc_type === 'm2' ? 'm²' : 'unidad', price: Number(row.price) || 0, installPrice: row.price_inst == null ? null : Number(row.price_inst),
        corporatePrice: row.price_corp == null ? null : Number(row.price_corp), image: row.image || '', images: catalogImagesForProduct({ id: row.id, name: row.name, family: row.category, image: row.image, images: row.images || [] }),
        confirmed: Number(row.price) > 0, published: true, description: row.description || '', source: 'Supabase · Visual Corp',
      }));
      setData((current) => ({ ...current,
        settings: settings ? { ...current.settings, name: settings.brand, location: settings.address, heroEyebrow: settings.hero_kicker, heroTitle: settings.hero_title, heroText: settings.hero_text, contactPhone: settings.phone, email: settings.email } : current.settings,
        services: servicesResult.data ? services : current.services,
        catalog: remoteCatalog.length ? remoteCatalog : current.catalog,
      }));
    };
    void hydrate();
    return () => { active = false; };
  }, [user]);
  const refreshRemote = useCallback(async () => {
    if (!supabase || !organizationId || !user) return;
    const [itemsResult, variantsResult, stockResult, areasResult, categoriesResult, branchesResult, locationsResult, movementsResult, customersResult, salesResult, costsResult, metricsResult] = await Promise.all([
      supabase.from('inventory_items').select('id,category_id,area_id,sku,name,description,item_type,tags,reference_image_url,custom_fields,base_unit,minimum_quantity,active,created_at,updated_at').eq('organization_id', organizationId),
      supabase.from('inventory_variants').select('id,item_id,sku,label,attributes,active').eq('organization_id', organizationId),
      supabase.from('inventory_stock').select('variant_id,branch_id,location_code,quantity,updated_at').eq('organization_id', organizationId),
      supabase.from('areas').select('id,code,name').eq('organization_id', organizationId),
      supabase.from('inventory_categories').select('id,code,name').eq('organization_id', organizationId),
      supabase.from('branches').select('id,code,name').eq('organization_id', organizationId),
      supabase.from('inventory_locations').select('id,branch_id,parent_id,code,name,location_type,active,is_system').eq('organization_id', organizationId).order('name'),
      supabase.from('inventory_movements').select('id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(500),
      supabase.from('customers').select('id,full_name,phone,email,notes,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      supabase.from('sales').select('id,sale_code,customer_id,status,urgent_backorder,subtotal,discount_total,total,note,payment_method,created_at,sale_lines(description_snapshot,quantity,backordered_quantity),sale_payments(method,amount)').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(500),
      supabase.from('inventory_item_costs').select('variant_id,unit_cost,supplier_name,updated_at').eq('organization_id', organizationId),
      supabase.from('inventory_stock_metrics').select('variant_id,branch_id,location_code,quantity,reserved_quantity,available_quantity,reserved_percent,last_restock_at,lifetime_consumed,consumed_last_30_days,movement_count,last_movement_at').eq('organization_id', organizationId),
    ]);
    const failed = [itemsResult, variantsResult, stockResult, areasResult, categoriesResult, branchesResult, locationsResult, movementsResult, customersResult, salesResult, costsResult, metricsResult].find((result) => result.error);
    if (failed) { setNotice(`No se pudieron sincronizar todos los datos operativos: ${failed.error.message}`); return; }
    const itemById = new Map((itemsResult.data || []).map((row) => [row.id, row]));
    const areaById = new Map((areasResult.data || []).map((row) => [row.id, row]));
    const categoryById = new Map((categoriesResult.data || []).map((row) => [row.id, row]));
    const branchById = new Map((branchesResult.data || []).map((row) => [row.id, row]));
    const inventoryLocations = (locationsResult.data || []).map((row) => ({
      id: row.id, branchId: row.branch_id, branch: branchById.get(row.branch_id)?.name || '',
      parentId: row.parent_id, code: row.code, name: row.name, type: row.location_type,
      active: row.active, isSystem: row.is_system,
    }));
    const variantById = new Map((variantsResult.data || []).map((row) => [row.id, row]));
    const costByVariant = new Map((costsResult.data || []).map((row) => [row.variant_id, row]));
    const metricsByKey = new Map((metricsResult.data || []).map((row) => [`${row.variant_id}|${row.branch_id}|${row.location_code}`, row]));
    const remoteInventory = [];
    for (const variant of variantsResult.data || []) {
      const item = itemById.get(variant.item_id);
      if (!item) continue;
      for (const branch of branchesResult.data || []) {
        const branchStocks = (stockResult.data || []).filter((row) => row.variant_id === variant.id && row.branch_id === branch.id);
        if (!branchStocks.length && item.custom_fields?.initial_branch_id && item.custom_fields.initial_branch_id !== branch.id) continue;
        for (const stock of branchStocks.length ? branchStocks : [null]) {
        const location = stock?.location_code || item.custom_fields?.default_location_code || 'MAIN';
        const metrics = metricsByKey.get(`${variant.id}|${branch.id}|${location}`);
        remoteInventory.push({
          id: `${variant.id}:${branch.id}:${location}`, remoteItemId: item.id, variantId: variant.id, sku: item.sku, variantSku: variant.sku,
          name: item.name, category: categoryById.get(item.category_id)?.name || '', variant: variant.label || item.description,
          itemType: item.item_type || '', tags: item.tags || [], referenceImageUrl: item.reference_image_url || '', customFields: item.custom_fields || {},
          area: areaById.get(item.area_id)?.name || 'Sin área', branch: branch.name, branchId: branch.id,
          location, unit: item.base_unit, quantity: stock ? Number(stock.quantity) : 0,
          reservedQuantity: Number(metrics?.reserved_quantity || 0), availableQuantity: metrics ? Number(metrics.available_quantity) : null,
          reservedPercent: metrics?.reserved_percent == null ? null : Number(metrics.reserved_percent), lastRestockAt: metrics?.last_restock_at || null,
          lifetimeConsumed: metrics ? Number(metrics.lifetime_consumed) : null, consumedLast30Days: metrics ? Number(metrics.consumed_last_30_days) : null,
          movementCount: metrics ? Number(metrics.movement_count) : 0, lastMovementAt: metrics?.last_movement_at || null,
          minimum: Number(item.minimum_quantity || 0), unitCost: costByVariant.has(variant.id) ? Number(costByVariant.get(variant.id).unit_cost) : null, supplierName: costByVariant.get(variant.id)?.supplier_name || '', sourceStatus: stock ? '' : 'Sin conteo físico', archived: !item.active || !variant.active,
          createdAt: item.created_at, updatedAt: stock?.updated_at || item.updated_at,
        });
        }
      }
    }
    const movementLabel = { receipt: 'entrada', consumption: 'consumo', return: 'devolución', waste: 'merma', sale: 'venta', adjustment: 'ajuste', transfer_out: 'transferencia_salida', transfer_in: 'recepcion_transferencia' };
    const remoteMovements = (movementsResult.data || []).map((row) => {
      const variant = variantById.get(row.variant_id); const item = itemById.get(variant?.item_id); const branch = branchById.get(row.branch_id);
      return { id: row.id, itemId: row.variant_id, itemName: item?.name || variant?.sku || 'Artículo', unit: item?.base_unit || '', quantity: Math.abs(Number(row.quantity_delta)), quantityDelta: Number(row.quantity_delta), type: movementLabel[row.movement_type] || row.movement_type, actor: row.created_by === user.id ? user.email : `Usuario ${row.created_by}`, reason: row.reason, referenceType: row.reference_type || '', reference: row.reference_id || '', branch: branch?.name || '', location: row.location_code || 'MAIN', createdAt: row.created_at, shortage: 0 };
    });
    const remoteCustomers = (customersResult.data || []).map((row) => ({ id: row.id, name: row.full_name, phone: row.phone, email: row.email, notes: row.notes, createdAt: row.created_at }));
    const customerById = new Map(remoteCustomers.map((row) => [row.id, row]));
    const paymentLabels = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro' };
    const remoteSales = (salesResult.data || []).map((row) => { const paid = (row.sale_payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0); const methods = [...new Set((row.sale_payments || []).map((payment) => payment.method))]; return { id: row.id, code: row.sale_code || row.id.slice(0, 8), total: Number(row.total), paid, balance: Math.max(0, Number(row.total) - paid), date: row.created_at, method: methods.length > 1 ? 'Pago dividido' : paymentLabels[methods[0] || row.payment_method] || 'Otro', customer: customerById.get(row.customer_id)?.name || '', description: (row.sale_lines || []).map((line) => line.description_snapshot).join(', '), quantity: (row.sale_lines || []).reduce((sum, line) => sum + Number(line.quantity), 0), urgent: row.urgent_backorder, status: row.status, note: row.note }; });
    setData((current) => ({ ...current, branches: branchesResult.data || [], inventoryLocations, inventory: remoteInventory, inventoryMovements: remoteMovements, customers: remoteCustomers, sales: remoteSales }));
  }, [organizationId, user]);
  useEffect(() => { void refreshRemote(); }, [refreshRemote]);
  useEffect(() => {
    const publicCache = { ...data, inventory: (data.inventory || []).map(({ unitCost, supplierName, ...item }) => item) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(publicCache));
  }, [data]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try { setData(JSON.parse(event.newValue)); } catch { /* Ignore incomplete browser writes. */ }
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const flash = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };
  const add = (collection, value) => {
    const row = { ...value, id: value.id || uid(collection), createdAt: value.createdAt || new Date().toISOString() };
    setData((current) => ({ ...current, [collection]: [row, ...current[collection]] }));
    return row;
  };
  const update = (collection, id, patch) => setData((current) => ({ ...current, [collection]: current[collection].map((row) => row.id === id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row) }));
  const remove = (collection, id) => setData((current) => ({ ...current, [collection]: current[collection].filter((row) => row.id !== id) }));
  const api = useMemo(() => ({ data, setData, add, update, remove, flash, notice, refreshRemote }), [data, notice, refreshRemote]);
  return <WorkspaceContext.Provider value={api}>{children}{notice && <div className="toast" role="status">{notice}</div>}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace debe usarse dentro de WorkspaceProvider');
  return value;
}

export const formatMoney = (value) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
export const formatDate = (value) => {
  if (!value) return 'Sin fecha';
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(date);
};
export const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
