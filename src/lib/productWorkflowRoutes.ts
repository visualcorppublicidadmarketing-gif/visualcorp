export type ProductWorkflowRoute = {
  catalog_product_id: string;
  workflow_code: string;
  active?: boolean;
};

export type FamilyWorkflowRouteRule = {
  id?: string;
  family_name: string;
  workflow_code: string;
  active?: boolean;
};

export type ProductWorkflowProduct = {
  id: string;
  name?: string | null;
  sku?: string | null;
  family?: string | null;
  category?: string | null;
  mode?: string | null;
  calc_type?: string | null;
};

export type FamilyWorkflowSuggestion = {
  family: string;
  workflow_code: string;
  assigned_count: number;
  matching_count: number;
  confidence: number;
};

export type ProductWorkflowRecommendation = {
  workflow_code: string;
  source: 'product' | 'family';
  ruleType?: 'explicit_product' | 'explicit_family' | 'inferred_family';
  evidence?: FamilyWorkflowSuggestion;
};

export type ProductAutoSuggestion = {
  productId: string;
  workflow_code: string;
  reason: string;
};

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();

export const productFamilyOf = (product: ProductWorkflowProduct) =>
  String(product.family || product.category || 'General').trim() || 'General';

/**
 * Derive a conservative, reviewable family default from existing explicit
 * product routes. These suggestions never write data on their own.
 */
export function buildFamilyWorkflowSuggestions(
  products: ProductWorkflowProduct[],
  routes: ProductWorkflowRoute[],
  options: { minExamples?: number; minConfidence?: number; activeWorkflowCodes?: ReadonlySet<string> } = {},
): Map<string, FamilyWorkflowSuggestion> {
  const minExamples = options.minExamples ?? 3;
  const minConfidence = options.minConfidence ?? 0.8;
  const activeRoutes = new Map(
    routes
      .filter((route) => route.active !== false)
      .map((route) => [route.catalog_product_id, route.workflow_code]),
  );
  const familyProducts = new Map<string, ProductWorkflowProduct[]>();
  for (const product of products) {
    const family = productFamilyOf(product);
    const group = familyProducts.get(family) ?? [];
    group.push(product);
    familyProducts.set(family, group);
  }

  const suggestions = new Map<string, FamilyWorkflowSuggestion>();
  for (const [family, members] of familyProducts) {
    const counts = new Map<string, number>();
    let assignedCount = 0;
    for (const product of members) {
      const code = activeRoutes.get(product.id);
      if (!code || code === 'review' || (options.activeWorkflowCodes && !options.activeWorkflowCodes.has(code))) continue;
      assignedCount += 1;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    if (assignedCount < minExamples) continue;

    let dominantCode = '';
    let matchingCount = 0;
    for (const [code, count] of counts) {
      if (count > matchingCount) {
        dominantCode = code;
        matchingCount = count;
      }
    }
    const confidence = matchingCount / assignedCount;
    if (dominantCode && confidence >= minConfidence) {
      suggestions.set(family, {
        family,
        workflow_code: dominantCode,
        assigned_count: assignedCount,
        matching_count: matchingCount,
        confidence,
      });
    }
  }
  return suggestions;
}

export function buildProductWorkflowRecommendations(
  products: ProductWorkflowProduct[],
  routes: ProductWorkflowRoute[],
  options: {
    minExamples?: number;
    minConfidence?: number;
    activeWorkflowCodes?: ReadonlySet<string>;
    familyRules?: FamilyWorkflowRouteRule[];
  } = {},
): Map<string, ProductWorkflowRecommendation> {
  const activeCodes = options.activeWorkflowCodes;
  const activeRoutes = new Map(
    routes
      .filter((route) => route.active !== false && (!activeCodes || activeCodes.has(route.workflow_code)))
      .map((route) => [route.catalog_product_id, route.workflow_code]),
  );
  const explicitFamilyMap = new Map(
    (options.familyRules || [])
      .filter((rule) => rule.active !== false && (!activeCodes || activeCodes.has(rule.workflow_code)))
      .map((rule) => [normalizeText(rule.family_name), rule.workflow_code]),
  );
  const familySuggestions = buildFamilyWorkflowSuggestions(products, routes, options);
  const recommendations = new Map<string, ProductWorkflowRecommendation>();

  for (const product of products) {
    const explicitCode = activeRoutes.get(product.id);
    if (explicitCode) {
      recommendations.set(product.id, {
        workflow_code: explicitCode,
        source: 'product',
        ruleType: 'explicit_product',
      });
      continue;
    }

    const family = productFamilyOf(product);
    const familyRuleCode = explicitFamilyMap.get(normalizeText(family));
    if (familyRuleCode) {
      recommendations.set(product.id, {
        workflow_code: familyRuleCode,
        source: 'family',
        ruleType: 'explicit_family',
      });
      continue;
    }

    const suggested = familySuggestions.get(family);
    if (suggested) {
      recommendations.set(product.id, {
        workflow_code: suggested.workflow_code,
        source: 'family',
        ruleType: 'inferred_family',
        evidence: suggested,
      });
    }
  }
  return recommendations;
}

const pickAvailableCode = (candidates: string[], activeWorkflowCodes?: ReadonlySet<string>): string => {
  if (!activeWorkflowCodes || activeWorkflowCodes.size === 0) return candidates[0] || 'review';
  for (const code of candidates) {
    if (activeWorkflowCodes.has(code)) return code;
  }
  return activeWorkflowCodes.has('review') ? 'review' : [...activeWorkflowCodes][0] || 'review';
};

/**
 * Predicts the best production workflow for a catalog product using Visual Corp
 * product families, product names, and calculation mode (m² vs unit).
 */
export function suggestWorkflowForProduct(
  product: ProductWorkflowProduct,
  activeWorkflowCodes?: ReadonlySet<string>,
): ProductAutoSuggestion | null {
  const familyRaw = productFamilyOf(product);
  const family = normalizeText(familyRaw);
  const name = normalizeText(product.name);
  const isArea = product.mode === 'area' || product.calc_type === 'm2';

  // 1. Diseño puro / Brief
  if (name.includes('diseno de logotipo') || name.includes('brief de marca')) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['design_only', 'review'], activeWorkflowCodes),
      reason: 'Servicio de diseño gráfico',
    };
  }

  // 2. Hardware / insumos sin personalización
  if (
    name.startsWith('ojal ') ||
    name.startsWith('ojales ') ||
    name.includes('tubo de cortina') ||
    name.includes('tubo de hierro') ||
    name === 'cordon llano' ||
    name.startsWith('portacredencial')
  ) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['none'], activeWorkflowCodes),
      reason: 'Accesorio o insumo de entrega directa',
    };
  }

  // 3. Recuerdos o lápidas en acrílico
  if (name.includes('lapida') || (name.includes('recuerdo') && name.includes('acrilico'))) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['custom_acrylic_memento', 'laser_cut_finish', 'laser'], activeWorkflowCodes),
      reason: 'Pieza conmemorativa en acrílico con foto/grabado',
    };
  }

  // 4. Neón
  if (name.includes('neon') || family.includes('neon')) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['neon', 'sign'], activeWorkflowCodes),
      reason: 'Fabricación de neón con corte acrílico y armado',
    };
  }

  // 5. Rótulos, letreros luminosos, corpóreos, menuderos LED
  if (
    family === 'productos de taller' ||
    name.includes('rotulo') ||
    name.includes('letrero luminoso') ||
    name.includes('lightbox') ||
    name.includes('corporeo') ||
    name.includes('menudero') ||
    name.includes('circulo led') ||
    name.includes('pancarta')
  ) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['sign', 'sign_measure', 'print'], activeWorkflowCodes),
      reason: 'Rótulo o estructura de taller',
    };
  }

  // 6. Corte láser (acrílico, MDF, llaveros, sellos)
  if (
    name.includes('laser') ||
    name.includes('llavero acrilico') ||
    name.includes('acrilico') ||
    name.includes('mdf') ||
    name.includes('sello personalizado')
  ) {
    const candidates = name.includes('llavero') ? ['laser_cut_finish', 'laser'] : ['laser', 'laser_cut_finish'];
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(candidates, activeWorkflowCodes),
      reason: 'Corte o grabado láser',
    };
  }

  // 7. Imprenta y papelería (tarjetas, volantes, trípticos, calendarios)
  if (
    family === 'precios imprenta' ||
    family === 'imprenta' ||
    name.includes('tarjeta de presentacion') ||
    name.includes('tarjeta presentacion') ||
    name.includes('volante') ||
    name.includes('triptico') ||
    name.includes('diptico') ||
    name.includes('calendario')
  ) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['printing_press', 'print'], activeWorkflowCodes),
      reason: 'Producto de imprenta y papelería',
    };
  }

  // 8. Troquelado / Electrocut
  if (name.includes('electrocut') || name.includes('troquelado')) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['troquelado', 'print'], activeWorkflowCodes),
      reason: 'Impresión y troquelado de vinil',
    };
  }

  // 9. Sublimación / DTF / Textil / Promocionales
  if (
    family.includes('sublimacion') ||
    family.includes('dtf') ||
    family.includes('almohadas') ||
    family.includes('body recien') ||
    family.includes('polo bordado') ||
    family.includes('campana camisetas') ||
    family.includes('campana promo') ||
    family.includes('ropa y textiles') ||
    family.includes('bolso cambrella') ||
    family.includes('mochila tela') ||
    family === 'souvenirs' ||
    family === 'souvenirs y personalizados' ||
    family === 'credenciales pvc' ||
    family === 'combos credenciales' ||
    name.includes('sublim') ||
    name.includes('dtf') ||
    name.includes('jarro') ||
    name.includes('taza') ||
    name.includes('gorra') ||
    name.includes('camiseta') ||
    name.includes('tomatodo') ||
    name.includes('boligrafo') ||
    name.includes('lapiz ecologico') ||
    name.includes('cuaderno personalizado') ||
    name.includes('pin publicitario') ||
    name.includes('credencial')
  ) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['sublimation', 'print'], activeWorkflowCodes),
      reason: 'Estampado, DTF o sublimación de artículos',
    };
  }

  // 10. Displays con lona / vinil (Banner X, Roll Up, Pop Up, Stand)
  if (
    family === 'displays importados' ||
    name.includes('banner') ||
    name.includes('roll up') ||
    name.includes('pop up') ||
    name.includes('stand publicitario')
  ) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['print', 'none'], activeWorkflowCodes),
      reason: 'Display con gráfica impresa',
    };
  }

  // 11. Impresiones / Sustratos rígidos / Campaña Lonas / Productos por m²
  if (
    family === 'impresiones' ||
    family === 'campana lonas' ||
    family === 'sustratos rigidos' ||
    family === 'taller y gran formato' ||
    isArea ||
    name.includes('lona') ||
    name.includes('vinil') ||
    name.includes('backlight') ||
    name.includes('lienzo') ||
    name.includes('microperforado') ||
    name.includes('cintra') ||
    name.includes('alucobond') ||
    name.includes('foamboard')
  ) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['print'], activeWorkflowCodes),
      reason: isArea ? 'Producto por m² de gran formato' : 'Impresión o sustrato gráfico',
    };
  }

  // 12. Fundas y bolsas genéricas
  if (family.includes('fundas') || family.includes('boutique') || family.includes('radiografia')) {
    return {
      productId: product.id,
      workflow_code: pickAvailableCode(['printing_press', 'print', 'none'], activeWorkflowCodes),
      reason: 'Fundas o empaques impresos/comerciales',
    };
  }

  return null;
}

export function buildAutoClassificationPlan(
  products: ProductWorkflowProduct[],
  assignedProductIds: ReadonlySet<string>,
  activeWorkflowCodes?: ReadonlySet<string>,
  options: { includeAssigned?: boolean } = {},
): ProductAutoSuggestion[] {
  const plan: ProductAutoSuggestion[] = [];
  for (const product of products) {
    if (!options.includeAssigned && assignedProductIds.has(product.id)) continue;
    const suggestion = suggestWorkflowForProduct(product, activeWorkflowCodes);
    if (suggestion) plan.push(suggestion);
  }
  return plan;
}
