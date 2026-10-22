import { supabase } from './supabase';
import { assetPath } from '../data/media';

const firstError = (results) => results.find((result) => result.error)?.error || null;
const assetStoragePath = (value) => {
  if (!value || typeof value !== 'string') return value;
  const base = import.meta.env.BASE_URL || '/';
  if (base !== '/' && value.startsWith(base)) return `/${value.slice(base.length)}`;
  return value;
};
const cleanAssets = (value) => Array.isArray(value)
  ? value.map(cleanAssets)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanAssets(item)]))
    : assetStoragePath(value);

const normalizeRemoteAssets = (value, key = '') => {
  if (Array.isArray(value)) return value.map((item) => normalizeRemoteAssets(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, normalizeRemoteAssets(entryValue, entryKey)])
    );
  }
  if (typeof value === 'string') {
    if (
      key === 'src' ||
      key === 'poster' ||
      key === 'image' ||
      key === 'url' ||
      key === 'logo' ||
      key === 'icon' ||
      /^\/?(?:media|images|brand)\//i.test(value)
    ) {
      return assetPath(value);
    }
  }
  return value;
};

const fromProduct = (row) => normalizeRemoteAssets({
  ...row,
  calcType: row.calc_type,
  pricingMode: row.pricing_mode,
  priceScales: row.price_scales || [],
  variantOptions: row.variant_options || [],
  priceMatrix: row.price_matrix || {},
  minQuantity: row.min_quantity,
  quantityStep: row.quantity_step,
  isPublished: row.is_published,
  image: row.image ? assetPath(row.image) : row.image,
  images: (row.images || []).map(assetPath),
});

const fromSettings = (row) => ({
  brand: row.brand,
  slogan: row.slogan,
  phone: row.phone,
  email: row.email,
  address: row.address,
  whatsapp: row.whatsapp,
  quoteWhatsappRoutes: row.quote_whatsapp_routes || [],
  quoteMessageIntro: row.quote_message_intro,
  quoteMessageClosing: row.quote_message_closing,
  heroKicker: row.hero_kicker,
  heroTitle: row.hero_title,
  heroText: row.hero_text,
  themePreset: row.theme_preset,
  themePresets: row.theme_presets || [],
});

export async function fetchSiteData() {
  if (!supabase) return null;
  const [settings, services, products, promotions, inquiries, pages, blocks, calculatorSettings] = await Promise.all([
    supabase.from('site_settings').select('*').eq('id', 'main').maybeSingle(),
    supabase.from('services').select('*').eq('is_published', true).order('sort_order'),
    supabase.from('products').select('*').eq('is_published', true).order('sort_order'),
    supabase.from('promotions').select('*').eq('active', true).order('sort_order'),
    supabase.from('inquiries').select('*').order('created_at', { ascending: false }),
    supabase.from('pages').select('*').eq('slug', 'home').maybeSingle(),
    supabase.from('page_blocks').select('*').eq('is_visible', true).order('sort_order'),
    supabase.from('calculator_settings').select('*').eq('id', 'default').maybeSingle(),
  ]);
  const error = firstError([settings, services, products, promotions, inquiries, pages, blocks, calculatorSettings]);
  if (error) throw error;
  if (!settings.data && !products.data?.length) return null;
  const rawHomeBlocks = (blocks.data || []).map((row) => ({ id: row.id, type: row.block_type, visible: row.is_visible, ...(row.content || {}) }));
  const homeBlocks = normalizeRemoteAssets(rawHomeBlocks);
  const rawServices = (services.data || []).map((row) => ({ ...row, isPublished: row.is_published, sortOrder: row.sort_order, image: row.image ? assetPath(row.image) : row.image }));
  return {
    settings: settings.data ? fromSettings(settings.data) : {},
    services: normalizeRemoteAssets(rawServices),
    products: (products.data || []).map(fromProduct),
    promotions: (promotions.data || []).map((row) => ({ ...row, oldPrice: row.old_price, sortOrder: row.sort_order })),
    inquiries: inquiries.data || [],
    homeBlocks,
    remotePageId: pages.data?.id || null,
    calculatorSettings: calculatorSettings.data ? {
      taxRate: calculatorSettings.data.tax_rate,
      minDimensionCm: calculatorSettings.data.min_dimension_cm,
      maxDimensionCm: calculatorSettings.data.max_dimension_cm,
      designAdaptationPrice: calculatorSettings.data.design_adaptation_price,
      designFromScratchPrice: calculatorSettings.data.design_from_scratch_price,
      eyeletSmallPrice: calculatorSettings.data.eyelet_small_price,
      eyeletLargePrice: calculatorSettings.data.eyelet_large_price,
      disclaimer: calculatorSettings.data.disclaimer,
    } : undefined,
  };
}

export async function persistSiteData(data) {
  if (!supabase) return null;
  const settings = data.settings || {};
  const operations = [
    supabase.from('site_settings').upsert({
      id: 'main', brand: settings.brand, slogan: settings.slogan, phone: settings.phone, email: settings.email,
      address: settings.address, whatsapp: settings.whatsapp, quote_whatsapp_routes: settings.quoteWhatsappRoutes || [],
      quote_message_intro: settings.quoteMessageIntro, quote_message_closing: settings.quoteMessageClosing,
      hero_kicker: settings.heroKicker, hero_title: settings.heroTitle,
      hero_text: settings.heroText, theme_preset: settings.themePreset || 'default', theme_presets: settings.themePresets || [], updated_at: new Date().toISOString(),
    }),
    supabase.from('services').upsert((data.services || []).map((row, index) => ({ id: row.id, name: row.name, short: row.short, detail: row.detail, icon: row.icon, image: assetStoragePath(row.image), tag: row.tag, sort_order: index, is_published: row.isPublished !== false })), { onConflict: 'id' }),
    supabase.from('products').upsert((data.products || []).map((row, index) => ({
      id: row.id, name: row.name, category: row.category || 'General', subcategory: row.subcategory, type: row.type || 'unit', calc_type: row.calcType || row.type || 'unit', pricing_mode: row.pricingMode || 'unit', price: Number(row.price) || 0, price_inst: row.price_inst ?? row.priceInst ?? null, price_corp: row.price_corp ?? row.priceCorp ?? null, unit: row.unit,
      image: assetStoragePath(row.image), images: row.images || [], features: row.features || [], description: row.description, specs: row.specs || [], price_scales: row.priceScales || [], variant_options: row.variantOptions || [], price_matrix: row.priceMatrix || {}, colors: row.colors || [], color_variations: row.colorVariations || [], attributes: row.attributes || {}, custom_options: row.customOptions || row.custom_options || {}, has_variants: Boolean(row.hasVariants || row.has_variants), sizes: row.sizes || [], min_quantity: Number(row.minQuantity) || 1, quantity_step: Number(row.quantityStep) || 1, source: row.source || 'manual', featured: Boolean(row.featured), is_published: row.isPublished !== false, sort_order: index,
    })), { onConflict: 'id' }),
    supabase.from('promotions').upsert((data.promotions || []).map((row, index) => ({ id: row.id, title: row.title, eyebrow: row.eyebrow, description: row.description, price: Number(row.price) || 0, old_price: Number(row.oldPrice) || 0, badge: row.badge, active: row.active !== false, sort_order: index })), { onConflict: 'id' }),
    supabase.from('pages').upsert({ id: 'home', slug: 'home', title: 'Inicio', intro: settings.heroText, is_published: true, updated_at: new Date().toISOString() }, { onConflict: 'id' }),
  ];
  const calculator = data.calculatorSettings || {};
  operations.push(supabase.from('calculator_settings').upsert({
    id: 'default', tax_rate: Number(calculator.taxRate) || 15, min_dimension_cm: Number(calculator.minDimensionCm) || 1,
    max_dimension_cm: Number(calculator.maxDimensionCm) || 5000, design_adaptation_price: Number(calculator.designAdaptationPrice) || 5,
    design_from_scratch_price: Number(calculator.designFromScratchPrice) || 15, eyelet_small_price: Number(calculator.eyeletSmallPrice) || 0.3,
    eyelet_large_price: Number(calculator.eyeletLargePrice) || 0.5, disclaimer: calculator.disclaimer || 'Los valores son referenciales.', updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }));
  const pageBlocks = (data.homeBlocks || []).map((block, index) => ({ id: block.id, page_id: 'home', block_type: block.type, content: cleanAssets(Object.fromEntries(Object.entries(block).filter(([key]) => !['id', 'type', 'visible'].includes(key)))), sort_order: index, is_visible: block.visible !== false, updated_at: new Date().toISOString() }));
  operations.push(supabase.from('page_blocks').upsert(pageBlocks, { onConflict: 'id' }));
  const results = await Promise.all(operations);
  const error = firstError(results);
  if (error) throw error;
  return true;
}

export async function submitInquiry(inquiry) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('inquiries').insert({ name: inquiry.name, company: inquiry.company, email: inquiry.email, phone: inquiry.phone, message: inquiry.message }).select().single();
  if (error) throw error;
  return data;
}

export async function submitQuoteRequest(quote) {
  if (!supabase) return null;
  const payload = {
    customer_name: quote.customerName || null, customer_email: quote.customerEmail || null, customer_phone: quote.customerPhone || null,
    customer_company: quote.customerCompany || null, customer_city: quote.customerCity || null, items: quote.items || [],
    subtotal: Number(quote.subtotal) || 0, tax_rate: Number(quote.taxRate) || 0, tax_amount: Number(quote.taxAmount) || 0,
    total: Number(quote.total) || 0, notes: quote.notes || null, source: quote.source || 'cotizador',
    destination_whatsapp: quote.destinationWhatsapp || null, destination_label: quote.destinationLabel || null,
  };
  const { data, error } = await supabase.rpc('create_quote_request', { payload });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function fetchQuoteRequests() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('quote_requests').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

export async function updateQuoteRequestStatus(id, status) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('quote_requests').update({ status }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function markQuoteRequestConverted(id, orderId) {
  if (!supabase || !id) return null;
  const { data, error } = await supabase.from('quote_requests').update({
    status: 'convertido_pos', converted_order_id: orderId, converted_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function uploadMedia(file, folder = 'uploads') {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
  const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('gigaprint-media').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('gigaprint-media').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl, name: file.name, type: file.type, bytes: file.size };
}
