import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import sourceCatalog from '../data/estebanicoSupabaseCatalog.snapshot.json';
import { catalogImagesForProduct } from '../data/catalogProductImages';
import { inventoryImageForSku } from '../data/inventoryProductImages';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';

const STORAGE_KEY = 'visualcorp-suite-local-v1';
const INVENTORY_REFERENCE_PREFIX = 'inventory-reference-images://';
const inventoryReferenceStoragePath = (value) => typeof value === 'string' && value.startsWith(INVENTORY_REFERENCE_PREFIX) ? value.slice(INVENTORY_REFERENCE_PREFIX.length) : null;
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
    id: sku, sku, name, category, variant, unit, referenceImageUrl: inventoryImageForSku(sku), area: ({ IMP: 'Impresión', SUB: 'Sublimación', TRO: 'Troquelado', LAS: 'Láser', TAL: 'Taller', NEO: 'Neones', BOD: 'Bodega general' })[areaCode],
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
  const images = catalogImagesForProduct(normalized);
  return { ...normalized, image: images[0] || normalized.image, images: images.length ? images : [normalized.image].filter(Boolean) };
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
    const storedById = new Map<string, any>((Array.isArray(saved.catalog) ? saved.catalog : []).map((item) => [String(item.id), item]));
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
  const { organizationId, user, hasPermission } = useAuth();
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
      const remoteCatalog = (catalogResult.data || []).map((row) => {
        const standardDetails = row.custom_options?.standard_details || {};
        const standardDetailLines = [
          standardDetails.materials ? 'Materiales: ' + standardDetails.materials : '',
          standardDetails.colors ? 'Colores: ' + standardDetails.colors : '',
          standardDetails.dimensions ? 'Medidas: ' + standardDetails.dimensions : '',
          standardDetails.personalization ? 'Personalización: ' + standardDetails.personalization : '',
        ].filter(Boolean);
        return {
        id: row.id, name: row.name, slug: row.slug, family: row.category || 'General', mode: row.calc_type === 'm2' ? 'area' : 'quantity',
        priceBasis: 'unit', priceScales: row.price_scales || [], tiers: (row.price_scales || []).filter((scale) => scale.option == null && scale.qty != null && (scale.pvp != null || scale.price != null || scale.price_inst != null || scale.price_corp != null)).map((scale) => ({ min_qty: Number(scale.qty), unit_price: scale.pvp == null && scale.price == null ? null : Number(scale.pvp ?? scale.price), install_unit_price: scale.price_inst == null ? null : Number(scale.price_inst), corporate_unit_price: scale.price_corp == null ? null : Number(scale.price_corp) })),
        optionPrices: (row.price_scales || []).filter((scale) => scale.option != null && scale.price != null).map((scale) => ({ label: String(scale.option), price: Number(scale.price) })),
        unit: row.calc_type === 'm2' ? 'm²' : 'unidad', price: Number(row.price) || 0, installPrice: row.price_inst == null ? null : Number(row.price_inst),
        corporatePrice: row.price_corp == null ? null : Number(row.price_corp), image: row.image || '', images: row.images || [],
        confirmed: Number(row.price) > 0, published: true, description: [row.description || '', ...standardDetailLines].filter(Boolean).join(' · '), features: row.features || [], customOptions: row.custom_options || {}, source: 'Supabase · Visual Corp',
      }; }).map((product) => {
        const images = catalogImagesForProduct(product);
        return { ...product, image: images[0] || product.image, images: images.length ? images : [product.image].filter(Boolean) };
      });
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
    const read = (query: any, module: string, action = 'view'): Promise<any> => {
      const costActionAllowed = !['view_costs','edit_costs'].includes(action) || hasPermission('inventory_costs', action === 'view_costs' ? 'view' : 'edit');
      return hasPermission(module, action) && costActionAllowed ? query : Promise.resolve({ data: [], error: null });
    };
    const readAllPages = async (queryFactory: () => any, module: string, action = 'view'): Promise<any> => {
      const costActionAllowed = !['view_costs','edit_costs'].includes(action) || hasPermission('inventory_costs', action === 'view_costs' ? 'view' : 'edit');
      if (!hasPermission(module, action) || !costActionAllowed) return { data: [], error: null };
      const pageSize = 500;
      const rows: any[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data: page, error } = await queryFactory().range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        rows.push(...(page || []));
        if ((page || []).length < pageSize) return { data: rows, error: null };
      }
    };
    const [itemsResult, variantsResult, stockResult, areasResult, categoriesResult, branchesResult, locationsResult, movementsResult, customersResult, salesResult, costsResult, metricsResult, customerAvatarsResult] = await Promise.all([
      readAllPages(() => supabase.from('inventory_items').select('id,category_id,area_id,sku,name,description,item_type,tags,reference_image_url,custom_fields,base_unit,minimum_quantity,active,created_at,updated_at').eq('organization_id', organizationId).order('id'),'inventory'),
      readAllPages(() => supabase.from('inventory_variants').select('id,item_id,sku,label,attributes,active').eq('organization_id', organizationId).order('id'),'inventory'),
      readAllPages(() => supabase.from('inventory_stock').select('variant_id,branch_id,location_code,quantity,updated_at').eq('organization_id', organizationId).order('variant_id').order('branch_id').order('location_code'),'inventory'),
      readAllPages(() => supabase.from('areas').select('id,code,name').eq('organization_id', organizationId).order('name').order('id'),'workshop'),
      readAllPages(() => supabase.from('inventory_categories').select('id,code,name').eq('organization_id', organizationId).order('name').order('id'),'inventory'),
      supabase.from('branches').select('id,code,name').eq('organization_id', organizationId),
      readAllPages(() => supabase.from('inventory_locations').select('id,branch_id,parent_id,code,name,location_type,active,is_system').eq('organization_id', organizationId).order('branch_id').order('code').order('id'),'inventory'),
      read(supabase.from('inventory_movements').select('id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(500),'inventory'),
      read(supabase.from('customers').select('id,full_name,phone,email,document_reference,notes,preferences,tags,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }), 'crm'),
      read(supabase.from('sales').select('id,sale_code,customer_id,status,urgent_backorder,subtotal,discount_total,total,note,payment_method,created_at,sale_lines(description_snapshot,quantity,backordered_quantity),sale_payments(method,amount)').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(500),'sales'),
      readAllPages(() => supabase.from('inventory_item_costs').select('variant_id,unit_cost,supplier_name,updated_at').eq('organization_id', organizationId).order('variant_id'),'inventory_costs','view_costs'),
      readAllPages(() => supabase.from('inventory_stock_metrics').select('variant_id,branch_id,location_code,quantity,reserved_quantity,available_quantity,reserved_percent,last_restock_at,lifetime_consumed,consumed_last_30_days,movement_count,last_movement_at').eq('organization_id', organizationId).order('variant_id').order('branch_id').order('location_code'),'inventory'),
      hasPermission('crm', 'view') ? supabase.rpc('list_visualcorp_customer_google_avatars') : Promise.resolve({ data: [], error: null }),
    ]);
    const failed = [itemsResult, variantsResult, stockResult, areasResult, categoriesResult, branchesResult, locationsResult, movementsResult, customersResult, salesResult, costsResult, metricsResult].find((result) => result.error);
    if (failed) { setNotice(`No se pudieron sincronizar todos los datos operativos: ${failed.error.message}`); return; }
    const itemById = new Map<string, any>((itemsResult.data || []).map((row: any) => [row.id, row]));
    const inventoryImagePaths: string[] = [...new Set<string>((itemsResult.data || []).map((row: any) => inventoryReferenceStoragePath(row.reference_image_url)).filter((path: string | null): path is string => Boolean(path)))];
    const signedInventoryImages = new Map<string, string>();
    if (inventoryImagePaths.length) {
      const { data: signedImages } = await supabase.storage.from('inventory-reference-images').createSignedUrls(inventoryImagePaths, 86400);
      for (const image of signedImages || []) if (image.path && image.signedUrl) signedInventoryImages.set(image.path, image.signedUrl);
    }
    const areaById = new Map<string, any>((areasResult.data || []).map((row: any) => [row.id, row]));
    const categoryById = new Map<string, any>((categoriesResult.data || []).map((row: any) => [row.id, row]));
    const branchById = new Map<string, any>((branchesResult.data || []).map((row: any) => [row.id, row]));
    const inventoryLocations = (locationsResult.data || []).map((row) => ({
      id: row.id, branchId: row.branch_id, branch: branchById.get(row.branch_id)?.name || '',
      parentId: row.parent_id, code: row.code, name: row.name, type: row.location_type,
      active: row.active, isSystem: row.is_system,
    }));
    const variantById = new Map<string, any>((variantsResult.data || []).map((row: any) => [row.id, row]));
    const costByVariant = new Map<string, any>((costsResult.data || []).map((row: any) => [row.variant_id, row]));
    const metricsByKey = new Map<string, any>((metricsResult.data || []).map((row: any) => [`${row.variant_id}|${row.branch_id}|${row.location_code}`, row]));
    const stockRowsByVariant = new Map<string, any[]>();
    for (const stock of stockResult.data || []) {
      const rows = stockRowsByVariant.get(stock.variant_id) || [];
      rows.push(stock);
      stockRowsByVariant.set(stock.variant_id, rows);
    }
    const remoteInventory = [];
    for (const variant of variantsResult.data || []) {
      const item = itemById.get(variant.item_id);
      if (!item) continue;
      const referenceImageStoragePath = inventoryReferenceStoragePath(item.reference_image_url);
      const branchStocks = stockRowsByVariant.get(variant.id) || [];
      // A variant can be assigned to a different branch from its siblings.
      // Keep the legacy item-level value as a fallback for older catalog rows.
      const initialBranch = branchById.get(variant.attributes?.initial_branch_id || item.custom_fields?.initial_branch_id);
      const inventoryRows = branchStocks.length
        ? branchStocks.map((stock) => ({ stock, branch: branchById.get(stock.branch_id) || { id: stock.branch_id, name: 'Sucursal desconocida' } }))
        : [{ stock: null, branch: initialBranch || null }];
      for (const { stock, branch } of inventoryRows) {
        const location = stock?.location_code || item.custom_fields?.default_location_code || 'MAIN';
        const metrics = branch ? metricsByKey.get(`${variant.id}|${branch.id}|${location}`) : null;
        remoteInventory.push({
          id: `${variant.id}:${branch?.id || 'unassigned'}:${location}`, remoteItemId: item.id, variantId: variant.id, sku: item.sku, variantSku: variant.sku,
          name: item.name, description: item.description || '', category: categoryById.get(item.category_id)?.name || '', variant: variant.label || '', variantAttributes: variant.attributes || {},
          itemType: item.item_type || '', tags: item.tags || [], referenceImageUrl: referenceImageStoragePath ? signedInventoryImages.get(referenceImageStoragePath) || '' : item.reference_image_url || inventoryImageForSku(item.sku), referenceImageStoragePath, customFields: item.custom_fields || {},
          area: areaById.get(item.area_id)?.name || 'Sin área', branch: branch?.name || 'Sucursal por asignar', branchId: branch?.id || null,
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
    const movementLabel = { receipt: 'entrada', consumption: 'consumo', return: 'devolución', waste: 'merma', sale: 'venta', adjustment: 'ajuste', transfer_out: 'transferencia_salida', transfer_in: 'recepcion_transferencia' };
    const remoteMovements = (movementsResult.data || []).map((row) => {
      const variant = variantById.get(row.variant_id); const item = itemById.get(variant?.item_id); const branch = branchById.get(row.branch_id);
      return { id: row.id, itemId: row.variant_id, itemName: item?.name || variant?.sku || 'Artículo', unit: item?.base_unit || '', quantity: Math.abs(Number(row.quantity_delta)), quantityDelta: Number(row.quantity_delta), type: movementLabel[row.movement_type] || row.movement_type, actor: row.created_by === user.id ? user.email : `Usuario ${row.created_by}`, reason: row.reason, referenceType: row.reference_type || '', reference: row.reference_id || '', branch: branch?.name || '', location: row.location_code || 'MAIN', createdAt: row.created_at, shortage: 0 };
    });
    const customerAvatarById = new Map<string, string>((customerAvatarsResult.data || []).map((row: any) => [row.customer_id, row.avatar_url]));
    const remoteCustomers = (customersResult.data || []).map((row) => ({ id: row.id, name: row.full_name, phone: row.phone, email: row.email, avatarUrl: customerAvatarById.get(row.id) || '', documentReference: row.document_reference || '', notes: row.notes, preferences: row.preferences || {}, tags: row.tags || [], createdAt: row.created_at }));
    const customerById = new Map<string, any>(remoteCustomers.map((row) => [row.id, row]));
    const paymentLabels = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro' };
    const remoteSales = (salesResult.data || []).map((row) => { const paid = (row.sale_payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0); const methods = [...new Set((row.sale_payments || []).map((payment) => payment.method))]; return { id: row.id, code: row.sale_code || row.id.slice(0, 8), total: Number(row.total), paid, balance: Math.max(0, Number(row.total) - paid), date: row.created_at, method: methods.length > 1 ? 'Pago dividido' : paymentLabels[methods[0] || row.payment_method] || 'Otro', customer: customerById.get(row.customer_id)?.name || '', description: (row.sale_lines || []).map((line) => line.description_snapshot).join(', '), quantity: (row.sale_lines || []).reduce((sum, line) => sum + Number(line.quantity), 0), urgent: row.urgent_backorder, status: row.status, note: row.note }; });
    setData((current) => ({ ...current, branches: branchesResult.data || [], inventoryLocations, inventory: remoteInventory, inventoryMovements: remoteMovements, customers: remoteCustomers, sales: remoteSales }));
  }, [organizationId, user, hasPermission]);
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
