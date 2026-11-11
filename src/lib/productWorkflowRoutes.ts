export type ProductWorkflowRoute = {
  catalog_product_id: string;
  workflow_code: string;
  active?: boolean;
};

export type ProductWorkflowProduct = {
  id: string;
  family?: string | null;
  category?: string | null;
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
  evidence?: FamilyWorkflowSuggestion;
};

const familyOf = (product: ProductWorkflowProduct) => String(product.family || product.category || 'General').trim() || 'General';

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
  const activeRoutes = new Map(routes.filter((route) => route.active !== false).map((route) => [route.catalog_product_id, route.workflow_code]));
  const familyProducts = new Map<string, ProductWorkflowProduct[]>();
  for (const product of products) {
    const family = familyOf(product);
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
      suggestions.set(family, { family, workflow_code: dominantCode, assigned_count: assignedCount, matching_count: matchingCount, confidence });
    }
  }
  return suggestions;
}

export function buildProductWorkflowRecommendations(
  products: ProductWorkflowProduct[],
  routes: ProductWorkflowRoute[],
  options: { minExamples?: number; minConfidence?: number; activeWorkflowCodes?: ReadonlySet<string> } = {},
): Map<string, ProductWorkflowRecommendation> {
  const activeRoutes = new Map(routes.filter((route) => route.active !== false && (!options.activeWorkflowCodes || options.activeWorkflowCodes.has(route.workflow_code))).map((route) => [route.catalog_product_id, route.workflow_code]));
  const familySuggestions = buildFamilyWorkflowSuggestions(products, routes, options);
  const recommendations = new Map<string, ProductWorkflowRecommendation>();
  for (const product of products) {
    const explicitCode = activeRoutes.get(product.id);
    if (explicitCode) {
      recommendations.set(product.id, { workflow_code: explicitCode, source: 'product' });
      continue;
    }
    const suggested = familySuggestions.get(familyOf(product));
    if (suggested) recommendations.set(product.id, { workflow_code: suggested.workflow_code, source: 'family', evidence: suggested });
  }
  return recommendations;
}
