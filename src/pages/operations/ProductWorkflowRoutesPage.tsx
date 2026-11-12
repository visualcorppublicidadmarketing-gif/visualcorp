import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  ClipboardList,
  Clock,
  FolderKanban,
  Layers3,
  ListFilter,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  Search,
  Settings2,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import {
  buildFamilyWorkflowSuggestions,
  buildProductWorkflowRecommendations,
  productFamilyOf,
  type FamilyWorkflowRouteRule,
  type FamilyWorkflowSuggestion,
} from '../../lib/productWorkflowRoutes';
import { Pagination } from '../../components/ui/OperationalKit';
import {
  WorkflowTemplateEditorModal,
  type EditableWorkflowStep,
  type EditableWorkflowTemplate,
} from './components/WorkflowTemplateEditorModal';
import { AutoClassifyRoutesModal } from './components/AutoClassifyRoutesModal';
import './product-workflow-routes.css';

type WorkflowStep = EditableWorkflowStep;
type WorkflowTemplate = {
  code: string;
  name: string;
  steps: WorkflowStep[];
  required_fields: string[];
  active?: boolean;
};
type ProductRoute = {
  id: string;
  catalog_product_id: string;
  workflow_code: string;
  active: boolean;
};
type CatalogProductEntry = {
  id: string;
  sku?: string;
  name: string;
  family: string;
  mode: 'area' | 'quantity';
  calc_type?: string;
  image?: string;
  description?: string;
  published?: boolean;
};
type ActiveTab = 'families' | 'products' | 'flows';
type RouteFilter = 'all' | 'explicit' | 'inherited' | 'unassigned' | 'dirty';
type FamilyStatusFilter = 'all' | 'with_rule' | 'without_rule' | 'with_pending';

const PAGE_SIZE = 40;

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();

const fieldLabels: Record<string, string> = {
  width_cm: 'Ancho (cm)',
  height_cm: 'Alto (cm)',
  material: 'Material o soporte',
  installation_address: 'Dirección de instalación',
};

const DEFAULT_AREA_FALLBACK: Record<string, string> = {
  ASE: 'Asesoría',
  BOD: 'Bodega',
  DIS: 'Diseño',
  IMP: 'Impresión',
  LAS: 'Láser',
  NEO: 'Neones',
  SUB: 'Sublimación',
  TAL: 'Taller',
  TRO: 'Troquelado',
};

export function ProductWorkflowRoutesPage() {
  const { organizationId, user, hasPermission } = useAuth();
  const { data } = useWorkspace();
  const canManage = hasPermission('sales', 'edit') && hasPermission('workshop', 'edit');

  const [activeTab, setActiveTab] = useState<ActiveTab>('families');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [areaOptions, setAreaOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [areaNames, setAreaNames] = useState<Record<string, string>>(DEFAULT_AREA_FALLBACK);
  const [routes, setRoutes] = useState<ProductRoute[]>([]);
  const [familyRules, setFamilyRules] = useState<FamilyWorkflowRouteRule[]>([]);
  const [remoteProducts, setRemoteProducts] = useState<CatalogProductEntry[]>([]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [familyDrafts, setFamilyDrafts] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters for Products Tab
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [workflowFilter, setWorkflowFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState<RouteFilter>('all');
  const [onlyAreaMode, setOnlyAreaMode] = useState(false);
  const [page, setPage] = useState(1);

  // Filters for Families Tab
  const [familyQuery, setFamilyQuery] = useState('');
  const [familyStatusFilter, setFamilyStatusFilter] = useState<FamilyStatusFilter>('all');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkWorkflow, setBulkWorkflow] = useState('');

  // Modals
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EditableWorkflowTemplate | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizationId || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [templateResult, routeResult, familyRuleResult, areaResult, catalogResult] =
        await Promise.all([
          supabase
            .from('production_workflow_templates')
            .select('code,name,steps,required_fields,active')
            .eq('organization_id', organizationId)
            .eq('active', true)
            .order('name'),
          supabase
            .from('catalog_product_workflow_routes')
            .select('id,catalog_product_id,workflow_code,active')
            .eq('organization_id', organizationId)
            .order('catalog_product_id'),
          supabase
            .from('catalog_family_workflow_routes')
            .select('id,family_name,workflow_code,active')
            .eq('organization_id', organizationId)
            .order('family_name'),
          supabase
            .from('areas')
            .select('code,name')
            .eq('organization_id', organizationId)
            .eq('active', true)
            .order('name'),
          supabase
            .from('catalog_products')
            .select('id,sku,name,category_id,subcategory,calc_type,image_url,description,is_published')
            .eq('organization_id', organizationId)
            .order('name'),
        ]);

      if (templateResult.error) throw templateResult.error;
      if (routeResult.error) throw routeResult.error;

      const nextRoutes = (routeResult.data || []) as ProductRoute[];
      const nextFamilyRules = !familyRuleResult.error
        ? ((familyRuleResult.data || []) as FamilyWorkflowRouteRule[])
        : [];

      setTemplates((templateResult.data || []) as WorkflowTemplate[]);
      setRoutes(nextRoutes);
      setFamilyRules(nextFamilyRules);

      if (!areaResult.error && areaResult.data?.length) {
        setAreaOptions(areaResult.data as Array<{ code: string; name: string }>);
        setAreaNames({
          ...DEFAULT_AREA_FALLBACK,
          ...Object.fromEntries((areaResult.data || []).map((area: any) => [area.code, area.name])),
        });
      }

      if (!catalogResult.error && catalogResult.data) {
        setRemoteProducts(
          catalogResult.data.map((row: any) => ({
            id: String(row.id),
            sku: row.sku || row.id,
            name: String(row.name || 'Producto'),
            family: String(row.subcategory || row.category_id || 'General').trim() || 'General',
            mode: row.calc_type === 'm2' ? 'area' : 'quantity',
            calc_type: row.calc_type,
            image: row.image_url || '',
            description: row.description || '',
            published: row.is_published !== false,
          })),
        );
      }

      setDrafts(
        Object.fromEntries(
          nextRoutes.map((route) => [route.catalog_product_id, route.active ? route.workflow_code : '']),
        ),
      );
      setFamilyDrafts(
        Object.fromEntries(
          nextFamilyRules.map((rule) => [rule.family_name, rule.active !== false ? rule.workflow_code : '']),
        ),
      );
    } catch (cause: any) {
      setError(cause?.message || 'No se pudieron cargar las rutas de producción.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Combine workspace catalog (which resolves display_category & images) with remote catalog_products (including drafts)
  const products = useMemo<CatalogProductEntry[]>(() => {
    const map = new Map<string, CatalogProductEntry>();
    for (const rp of remoteProducts) {
      map.set(rp.id, rp);
    }
    for (const wp of data.catalog || []) {
      const id = String(wp.id);
      const existing = map.get(id);
      map.set(id, {
        id,
        sku: wp.sku || existing?.sku || id,
        name: wp.name || existing?.name || 'Producto',
        family: String(wp.family || wp.category || existing?.family || 'General').trim() || 'General',
        mode: wp.mode === 'area' || existing?.mode === 'area' ? 'area' : 'quantity',
        calc_type: wp.mode === 'area' ? 'm2' : existing?.calc_type,
        image: wp.image || existing?.image || '',
        description: wp.description || existing?.description || '',
        published: wp.published ?? existing?.published ?? true,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [remoteProducts, data.catalog]);

  const routeByProduct = useMemo(
    () => new Map(routes.map((route) => [route.catalog_product_id, route])),
    [routes],
  );
  const familyRuleByName = useMemo(
    () =>
      new Map(
        familyRules
          .filter((r) => r.active !== false)
          .map((rule) => [rule.family_name, rule]),
      ),
    [familyRules],
  );
  const families = useMemo(
    () => [...new Set(products.map(productFamilyOf))].sort((a, b) => a.localeCompare(b, 'es')),
    [products],
  );
  const activeWorkflowCodes = useMemo(
    () => new Set(templates.map((template) => template.code)),
    [templates],
  );
  const templateByCode = useMemo(
    () => new Map(templates.map((template) => [template.code, template])),
    [templates],
  );

  const recommendations = useMemo(
    () =>
      buildProductWorkflowRecommendations(products, routes, {
        activeWorkflowCodes,
        familyRules,
      }),
    [products, routes, activeWorkflowCodes, familyRules],
  );

  const familySuggestions = useMemo(
    () => buildFamilyWorkflowSuggestions(products, routes, { activeWorkflowCodes }),
    [products, routes, activeWorkflowCodes],
  );

  // Metrics
  const explicitConfiguredIds = useMemo(
    () => new Set(products.filter((p) => routeByProduct.get(p.id)?.active).map((p) => p.id)),
    [products, routeByProduct],
  );
  const inheritedProductIds = useMemo(
    () =>
      new Set(
        products
          .filter((p) => {
            if (explicitConfiguredIds.has(p.id)) return false;
            const rec = recommendations.get(p.id);
            return rec?.ruleType === 'explicit_family';
          })
          .map((p) => p.id),
      ),
    [products, explicitConfiguredIds, recommendations],
  );
  const effectiveConfiguredCount = explicitConfiguredIds.size + inheritedProductIds.size;
  const unassignedCount = Math.max(products.length - effectiveConfiguredCount, 0);
  const coveragePercent = products.length
    ? Math.round((effectiveConfiguredCount / products.length) * 100)
    : 0;

  const dirtyProducts = useMemo(
    () =>
      products.filter((product) => {
        const current = routeByProduct.get(product.id);
        const saved = current?.active ? current.workflow_code : '';
        const draft = drafts[product.id] ?? saved;
        return draft !== saved;
      }),
    [products, routeByProduct, drafts],
  );

  // Group products by family for the Families Tab
  const familyCards = useMemo(() => {
    const groups = new Map<string, CatalogProductEntry[]>();
    for (const product of products) {
      const fam = productFamilyOf(product);
      const list = groups.get(fam) || [];
      list.push(product);
      groups.set(fam, list);
    }

    return [...groups.entries()]
      .map(([family, members]) => {
        const rule = familyRuleByName.get(family);
        const savedCode = rule?.workflow_code || '';
        const draftCode = familyDrafts[family] ?? savedCode;
        const explicitCount = members.filter((m) => explicitConfiguredIds.has(m.id)).length;
        const inheritedCount = members.filter((m) => inheritedProductIds.has(m.id)).length;
        const coveredCount = explicitCount + inheritedCount;
        const pendingCount = members.length - coveredCount;
        const areaCount = members.filter((m) => m.mode === 'area').length;
        const dirty = draftCode !== savedCode;

        return {
          family,
          members,
          savedCode,
          draftCode,
          dirty,
          explicitCount,
          inheritedCount,
          coveredCount,
          pendingCount,
          areaCount,
        };
      })
      .sort((a, b) => {
        // Pending families first, then alphabetical
        if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
        if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
        return a.family.localeCompare(b.family, 'es');
      });
  }, [products, familyRuleByName, familyDrafts, explicitConfiguredIds, inheritedProductIds]);

  const visibleFamilies = useMemo(() => {
    const needle = normalize(familyQuery);
    return familyCards.filter((card) => {
      if (needle && !normalize(card.family).includes(needle)) return false;
      if (familyStatusFilter === 'with_rule' && !card.savedCode) return false;
      if (familyStatusFilter === 'without_rule' && card.savedCode) return false;
      if (familyStatusFilter === 'with_pending' && card.pendingCount === 0) return false;
      return true;
    });
  }, [familyCards, familyQuery, familyStatusFilter]);

  // Filtered products for Products Tab
  const visibleProducts = useMemo(() => {
    const needle = normalize(query);
    return products.filter((product) => {
      const current = routeByProduct.get(product.id);
      const savedWorkflow = current?.active ? current.workflow_code : '';
      const draftWorkflow = drafts[product.id] ?? savedWorkflow;
      const rec = recommendations.get(product.id);
      const effectiveCode = draftWorkflow || (rec?.ruleType === 'explicit_family' ? rec.workflow_code : '');
      const isDirty = draftWorkflow !== savedWorkflow;
      const isExplicit = Boolean(savedWorkflow);
      const isInherited = !isExplicit && rec?.ruleType === 'explicit_family';

      if (
        needle &&
        !normalize(
          `${product.name} ${product.sku || ''} ${product.family || ''} ${product.description || ''}`,
        ).includes(needle)
      ) {
        return false;
      }

      if (familyFilter !== 'all' && productFamilyOf(product) !== familyFilter) return false;
      if (onlyAreaMode && product.mode !== 'area') return false;

      if (routeFilter === 'explicit' && !isExplicit) return false;
      if (routeFilter === 'inherited' && !isInherited) return false;
      if (routeFilter === 'unassigned' && (isExplicit || isInherited)) return false;
      if (routeFilter === 'dirty' && !isDirty) return false;

      if (workflowFilter !== 'all') {
        if (workflowFilter === 'unassigned') {
          if (effectiveCode) return false;
        } else if (effectiveCode !== workflowFilter) {
          return false;
        }
      }

      if (areaFilter !== 'all') {
        const tpl = effectiveCode ? templateByCode.get(effectiveCode) : undefined;
        const hasArea = Boolean(tpl?.steps?.some((step) => step.area === areaFilter));
        if (!hasArea) return false;
      }

      return true;
    });
  }, [
    products,
    query,
    familyFilter,
    workflowFilter,
    areaFilter,
    routeFilter,
    onlyAreaMode,
    routeByProduct,
    drafts,
    recommendations,
    templateByCode,
  ]);

  const totalPages = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE));
  useEffect(() => {
    setPage((curr) => Math.min(curr, totalPages));
  }, [totalPages]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleProducts.slice(start, start + PAGE_SIZE);
  }, [visibleProducts, page]);

  const visibleIds = paginatedProducts.map((product) => product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedProducts = products.filter((product) => selectedIds.has(product.id));

  const actionableFamilySuggestions = useMemo(
    () =>
      [...familySuggestions.values()]
        .flatMap((suggestion) => {
          const pendingInFam = products.filter(
            (product) =>
              productFamilyOf(product) === suggestion.family &&
              !explicitConfiguredIds.has(product.id) &&
              !familyRuleByName.has(suggestion.family),
          ).length;
          return pendingInFam > 0 ? [{ ...suggestion, unassigned_count: pendingInFam }] : [];
        })
        .sort((a, b) => b.unassigned_count - a.unassigned_count || a.family.localeCompare(b.family, 'es')),
    [familySuggestions, products, explicitConfiguredIds, familyRuleByName],
  );

  // Template usage counts for Flows Tab
  const templateUsage = useMemo(() => {
    const counts = new Map<string, { explicit: number; inherited: number }>();
    for (const tpl of templates) {
      counts.set(tpl.code, { explicit: 0, inherited: 0 });
    }
    for (const product of products) {
      const explicitCode = routeByProduct.get(product.id)?.active
        ? routeByProduct.get(product.id)!.workflow_code
        : '';
      if (explicitCode && counts.has(explicitCode)) {
        counts.get(explicitCode)!.explicit += 1;
      } else {
        const rec = recommendations.get(product.id);
        if (rec?.ruleType === 'explicit_family' && counts.has(rec.workflow_code)) {
          counts.get(rec.workflow_code)!.inherited += 1;
        }
      }
    }
    return counts;
  }, [templates, products, routeByProduct, recommendations]);

  const prepareFamilySuggestion = (suggestion: FamilyWorkflowSuggestion) => {
    const unassigned = products.filter(
      (product) =>
        productFamilyOf(product) === suggestion.family && !explicitConfiguredIds.has(product.id),
    );
    if (!unassigned.length) {
      setNotice(`La familia ${suggestion.family} ya tiene una ruta explícita en todos sus productos.`);
      return;
    }
    const ids = unassigned.map((product) => product.id);
    setDrafts((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, suggestion.workflow_code])),
    }));
    setSelectedIds(new Set(ids));
    setBulkWorkflow(suggestion.workflow_code);
    setFamilyFilter(suggestion.family);
    setRouteFilter('unassigned');
    setActiveTab('products');
    setPage(1);
    setQuery('');
    setNotice(
      `Preparé la sugerencia “${templateByCode.get(suggestion.workflow_code)?.name || suggestion.workflow_code}” para ${ids.length} productos sin ruta de ${suggestion.family}.`,
    );
  };

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const saveSingleProduct = async (productId: string) => {
    if (!supabase || !organizationId || !canManage) return;
    const workflow = drafts[productId] || '';
    setSavingId(productId);
    setError('');
    setNotice('');
    try {
      const now = new Date().toISOString();
      if (workflow) {
        const { error: saveError } = await supabase
          .from('catalog_product_workflow_routes')
          .upsert(
            {
              organization_id: organizationId,
              catalog_product_id: productId,
              workflow_code: workflow,
              active: true,
              updated_at: now,
            },
            { onConflict: 'organization_id,catalog_product_id' },
          );
        if (saveError) throw saveError;
      } else {
        const existing = routeByProduct.get(productId);
        if (existing?.active) {
          const { error: saveError } = await supabase
            .from('catalog_product_workflow_routes')
            .update({ active: false, updated_at: now })
            .eq('id', existing.id)
            .eq('organization_id', organizationId);
          if (saveError) throw saveError;
        }
      }
      await refresh();
      setNotice(
        `Ruta de ${products.find((p) => p.id === productId)?.name || 'producto'} guardada correctamente.`,
      );
    } catch (cause: any) {
      setError(cause?.message || 'No se pudo guardar la ruta del producto.');
    } finally {
      setSavingId('');
    }
  };

  const saveAllDirtyProducts = async () => {
    if (!supabase || !organizationId || !canManage || !dirtyProducts.length) return;
    setSavingId('dirty_batch');
    setError('');
    setNotice('');
    const now = new Date().toISOString();
    try {
      const toUpsert: Array<{
        organization_id: string;
        catalog_product_id: string;
        workflow_code: string;
        active: boolean;
        updated_at: string;
      }> = [];
      const toDeactivateIds: string[] = [];

      for (const product of dirtyProducts) {
        const code = drafts[product.id] || '';
        if (code) {
          toUpsert.push({
            organization_id: organizationId,
            catalog_product_id: product.id,
            workflow_code: code,
            active: true,
            updated_at: now,
          });
        } else {
          toDeactivateIds.push(product.id);
        }
      }

      if (toUpsert.length > 0) {
        const { error: upsertErr } = await supabase
          .from('catalog_product_workflow_routes')
          .upsert(toUpsert, { onConflict: 'organization_id,catalog_product_id' });
        if (upsertErr) throw upsertErr;
      }
      if (toDeactivateIds.length > 0) {
        const { error: deactErr } = await supabase
          .from('catalog_product_workflow_routes')
          .update({ active: false, updated_at: now })
          .eq('organization_id', organizationId)
          .in('catalog_product_id', toDeactivateIds);
        if (deactErr) throw deactErr;
      }

      await refresh();
      setNotice(`Se guardaron todos los ${dirtyProducts.length} cambios pendientes en el catálogo.`);
    } catch (cause: any) {
      setError(cause?.message || 'No se pudieron guardar todos los cambios pendientes.');
    } finally {
      setSavingId('');
    }
  };

  const discardAllDirtyProducts = () => {
    setDrafts(
      Object.fromEntries(
        routes.map((route) => [route.catalog_product_id, route.active ? route.workflow_code : '']),
      ),
    );
    setNotice('Se descartaron los cambios pendientes sin guardar.');
  };

  const saveSelection = async () => {
    if (!supabase || !organizationId || !canManage || !selectedProducts.length) return;
    const timestamp = new Date().toISOString();
    const ids = selectedProducts.map((product) => product.id);
    const selectedRouteName = templateByCode.get(bulkWorkflow)?.name;
    setSavingId('bulk');
    setError('');
    setNotice('');
    try {
      if (bulkWorkflow) {
        const { error: saveError } = await supabase
          .from('catalog_product_workflow_routes')
          .upsert(
            ids.map((productId) => ({
              organization_id: organizationId,
              catalog_product_id: productId,
              workflow_code: bulkWorkflow,
              active: true,
              updated_at: timestamp,
            })),
            { onConflict: 'organization_id,catalog_product_id' },
          );
        if (saveError) throw saveError;
      } else {
        const { error: saveError } = await supabase
          .from('catalog_product_workflow_routes')
          .update({ active: false, updated_at: timestamp })
          .eq('organization_id', organizationId)
          .in('catalog_product_id', ids);
        if (saveError) throw saveError;
      }
      await refresh();
      setNotice(
        bulkWorkflow
          ? `Ruta “${selectedRouteName || bulkWorkflow}” aplicada a ${ids.length} productos.`
          : `Ruta explícita quitada de ${ids.length} productos (ahora usarán regla de familia si existe).`,
      );
      setSelectedIds(new Set());
      setBulkWorkflow('');
    } catch (cause: any) {
      setError(cause?.message || 'No se pudieron actualizar los productos seleccionados.');
    } finally {
      setSavingId('');
    }
  };

  const saveFamilyRule = async (familyName: string, alsoApplyToProducts: boolean) => {
    if (!supabase || !organizationId || !canManage) return;
    const workflowCode = familyDrafts[familyName] ?? familyRuleByName.get(familyName)?.workflow_code ?? '';
    setSavingId(`fam:${familyName}`);
    setError('');
    setNotice('');
    const now = new Date().toISOString();
    try {
      if (workflowCode) {
        const { error: ruleError } = await supabase.from('catalog_family_workflow_routes').upsert(
          {
            organization_id: organizationId,
            family_name: familyName,
            workflow_code: workflowCode,
            active: true,
            created_by: user?.id || null,
            updated_at: now,
          },
          { onConflict: 'organization_id,family_name' },
        );
        if (ruleError) throw ruleError;

        if (alsoApplyToProducts) {
          const famProductIds = products
            .filter((p) => productFamilyOf(p) === familyName)
            .map((p) => p.id);
          if (famProductIds.length > 0) {
            const { error: prodError } = await supabase
              .from('catalog_product_workflow_routes')
              .upsert(
                famProductIds.map((pid) => ({
                  organization_id: organizationId,
                  catalog_product_id: pid,
                  workflow_code: workflowCode,
                  active: true,
                  updated_at: now,
                })),
                { onConflict: 'organization_id,catalog_product_id' },
              );
            if (prodError) throw prodError;
          }
        }
      } else {
        const existing = familyRuleByName.get(familyName);
        if (existing) {
          const { error: deactError } = await supabase
            .from('catalog_family_workflow_routes')
            .update({ active: false, updated_at: now })
            .eq('organization_id', organizationId)
            .eq('family_name', familyName);
          if (deactError) throw deactError;
        }
      }

      await refresh();
      const tplName = templateByCode.get(workflowCode)?.name || workflowCode;
      setNotice(
        workflowCode
          ? alsoApplyToProducts
            ? `Regla “${tplName}” guardada en ${familyName} y fijada en todos sus productos.`
            : `Regla predeterminada “${tplName}” guardada para ${familyName}. Los productos sin excepción heredan esta ruta.`
          : `Se quitó la regla predeterminada de ${familyName}.`,
      );
    } catch (cause: any) {
      setError(cause?.message || `No se pudo guardar la regla de la familia ${familyName}.`);
    } finally {
      setSavingId('');
    }
  };

  const handleApplyAutoClassification = async (
    assignments: Array<{ productId: string; workflow_code: string }>,
    newFamilyRules: Array<{ family_name: string; workflow_code: string }>,
  ) => {
    if (!supabase || !organizationId || !canManage) return;
    setSavingId('auto');
    setError('');
    setNotice('');
    const now = new Date().toISOString();
    try {
      if (assignments.length > 0) {
        const { error: prodErr } = await supabase.from('catalog_product_workflow_routes').upsert(
          assignments.map((item) => ({
            organization_id: organizationId,
            catalog_product_id: item.productId,
            workflow_code: item.workflow_code,
            active: true,
            updated_at: now,
          })),
          { onConflict: 'organization_id,catalog_product_id' },
        );
        if (prodErr) throw prodErr;
      }

      if (newFamilyRules.length > 0) {
        const { error: famErr } = await supabase.from('catalog_family_workflow_routes').upsert(
          newFamilyRules.map((rule) => ({
            organization_id: organizationId,
            family_name: rule.family_name,
            workflow_code: rule.workflow_code,
            active: true,
            created_by: user?.id || null,
            updated_at: now,
          })),
          { onConflict: 'organization_id,family_name' },
        );
        if (famErr) throw famErr;
      }

      await refresh();
      setNotice(
        `Auto-clasificación completa: ${assignments.length} productos configurados${
          newFamilyRules.length > 0
            ? ` y ${newFamilyRules.length} reglas de familia creadas.`
            : '.'
        }`,
      );
    } finally {
      setSavingId('');
    }
  };

  const handleSaveTemplate = async (payload: {
    isNew: boolean;
    code: string;
    name: string;
    steps: EditableWorkflowStep[];
    required_fields: string[];
  }) => {
    if (!supabase || !organizationId || !canManage) return;
    setSavingTemplate(true);
    setError('');
    setNotice('');
    const now = new Date().toISOString();
    try {
      const { error: tplErr } = await supabase.from('production_workflow_templates').upsert(
        {
          organization_id: organizationId,
          code: payload.code,
          name: payload.name,
          steps: payload.steps,
          required_fields: payload.required_fields,
          active: true,
          updated_at: now,
        },
        { onConflict: 'organization_id,code' },
      );
      if (tplErr) throw tplErr;
      await refresh();
      setNotice(
        payload.isNew
          ? `Flujo “${payload.name}” creado y disponible para asignar a productos o familias.`
          : `Flujo “${payload.name}” actualizado correctamente.`,
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  const renderPipelineChips = (tpl?: WorkflowTemplate, compact = false) => {
    if (!tpl) return null;
    const steps = Array.isArray(tpl.steps) ? tpl.steps : [];
    if (steps.length === 0) {
      return (
        <span className="pwr-step-pipeline is-direct">
          <Check size={12} />
          <span>{tpl.code === 'none' ? 'Entrega directa (sin etapas de taller)' : 'Revisión manual'}</span>
        </span>
      );
    }
    return (
      <div className={`pwr-step-pipeline${compact ? ' is-compact' : ''}`} aria-label={`Etapas de ${tpl.name}`}>
        {steps.map((step, index) => (
          <React.Fragment key={step.key || `${step.area || 'step'}-${index}`}>
            {index > 0 && <ArrowRight size={12} className="pwr-pipe-arrow" aria-hidden="true" />}
            <span className="pwr-pipe-chip" title={step.title || ''}>
              <small>{index + 1}</small>
              <span>{step.area ? areaNames[step.area] || step.area : 'Área'}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  const jumpToFamilyProducts = (familyName: string) => {
    setFamilyFilter(familyName);
    setRouteFilter('all');
    setWorkflowFilter('all');
    setAreaFilter('all');
    setOnlyAreaMode(false);
    setPage(1);
    setActiveTab('products');
  };

  const jumpToWorkflowProducts = (workflowCode: string) => {
    setWorkflowFilter(workflowCode);
    setFamilyFilter('all');
    setRouteFilter('all');
    setAreaFilter('all');
    setOnlyAreaMode(false);
    setPage(1);
    setActiveTab('products');
  };

  const clearProductFilters = () => {
    setQuery('');
    setFamilyFilter('all');
    setWorkflowFilter('all');
    setAreaFilter('all');
    setRouteFilter('all');
    setOnlyAreaMode(false);
    setPage(1);
  };

  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow="PRODUCCIÓN · CENTRO DE RUTAS"
        title="Rutas de producción y flujos"
        description="Configura el recorrido automático en taller por familia o producto, y diseña flujos de estaciones en un solo lugar."
        action={
          <div className="pwr-heading-actions">
            {canManage && templates.length > 0 && (
              <button
                type="button"
                className="button button-dark"
                disabled={loading || savingId !== ''}
                onClick={() => setAutoModalOpen(true)}
              >
                <Sparkles size={15} /> Auto-clasificar catálogo
              </button>
            )}
            <Link className="button button-outline" to="/operaciones/coordinacion-trabajos">
              <Wrench size={15} /> Coordinación taller
            </Link>
            <Link className="button button-outline" to="/operaciones/mi-semana">
              <ArrowLeft size={15} /> Mi semana
            </Link>
          </div>
        }
      />

      {/* Hero Overview + Coverage Bar */}
      <section className="pwr-overview" aria-label="Resumen de asignación de rutas">
        <div className="pwr-overview-copy">
          <span className="pwr-overview-mark">
            <Route size={19} />
          </span>
          <div className="pwr-overview-text">
            <h2>Cobertura del catálogo en taller</h2>
            <p>
              Asigna reglas a familias enteras para que cada producto nuevo y existente vaya directo
              a Diseño, Impresión, Láser, Sublimación o Taller sin pasar por revisión manual.
            </p>
            <div className="pwr-coverage-bar-wrap" aria-label={`Cobertura ${coveragePercent}%`}>
              <div className="pwr-coverage-labels">
                <span>
                  <strong>{coveragePercent}%</strong> automatizado ({effectiveConfiguredCount} de{' '}
                  {products.length})
                </span>
                <small>
                  {explicitConfiguredIds.size} directas · {inheritedProductIds.size} heredadas de
                  familia
                </small>
              </div>
              <div className="pwr-coverage-track">
                <div className="pwr-coverage-fill" style={{ width: `${coveragePercent}%` }} />
              </div>
            </div>
          </div>
        </div>

        <dl className="pwr-metrics">
          <div>
            <dt>Productos</dt>
            <dd>{products.length}</dd>
          </div>
          <div className="is-configured">
            <dt>Enrutados</dt>
            <dd>{effectiveConfiguredCount}</dd>
          </div>
          <div className="is-pending">
            <dt>Por definir</dt>
            <dd>{unassignedCount}</dd>
          </div>
          <div>
            <dt>Flujos activos</dt>
            <dd>{templates.length}</dd>
          </div>
        </dl>
      </section>

      {!canManage && (
        <p className="pwr-alert" role="status">
          <CircleHelp size={17} /> Tienes acceso de consulta. Para editar rutas o flujos se requieren
          permisos de ventas y taller.
        </p>
      )}
      {error && (
        <p className="pwr-alert" role="alert">
          {error}
          <button type="button" className="button button-outline" onClick={() => void refresh()}>
            Reintentar
          </button>
        </p>
      )}
      {notice && (
        <p className="pwr-notice" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button
            type="button"
            className="pwr-notice-close"
            aria-label="Cerrar aviso"
            onClick={() => setNotice('')}
          >
            <X size={14} />
          </button>
        </p>
      )}

      {/* Segmented Navigation Tabs */}
      <div className="pwr-tabs-bar" role="group" aria-label="Vistas de configuración de rutas">
        <button
          type="button"
          aria-pressed={activeTab === 'families'}
          className={`pwr-tab${activeTab === 'families' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('families')}
        >
          <FolderKanban size={16} />
          <span>Por Familias</span>
          <span className="pwr-tab-badge">{families.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'products'}
          className={`pwr-tab${activeTab === 'products' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          <Package size={16} />
          <span>Todos los Productos</span>
          <span className="pwr-tab-badge">{products.length}</span>
          {dirtyProducts.length > 0 && (
            <span className="pwr-tab-dirty-pill">{dirtyProducts.length} sin guardar</span>
          )}
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'flows'}
          className={`pwr-tab${activeTab === 'flows' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('flows')}
        >
          <Wrench size={16} />
          <span>Flujos del Taller</span>
          <span className="pwr-tab-badge">{templates.length}</span>
        </button>

        <button
          type="button"
          className="button button-outline pwr-refresh-btn"
          onClick={() => void refresh()}
          disabled={loading || savingId !== ''}
        >
          <RefreshCw size={15} className={loading ? 'pwr-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Main Content Panel */}
      <section className="panel pwr-panel">
        {templates.length === 0 && !loading && (
          <div className="pwr-flows-warning">
            <div>
              <strong>Aún no hay flujos activos disponibles</strong>
              <p>Crea al menos un flujo en la pestaña "Flujos del Taller" antes de asignarlo.</p>
            </div>
            <button
              type="button"
              className="button button-dark"
              onClick={() => {
                setActiveTab('flows');
                setEditingTemplate(null);
                setTemplateModalOpen(true);
              }}
            >
              <Plus size={15} /> Crear primer flujo
            </button>
          </div>
        )}

        {/* TAB 1: POR FAMILIAS */}
        {activeTab === 'families' && (
          <div className="pwr-tab-content">
            <header className="pwr-panel-heading">
              <div>
                <span className="pwr-section-icon">
                  <FolderKanban size={17} />
                </span>
                <div>
                  <h2>Reglas predeterminadas por familia</h2>
                  <p>
                    Configura una categoría completa en 1 clic. Todo producto sin excepción puntual
                    —incluyendo futuros productos nuevos— heredará automáticamente la ruta de su
                    familia.
                  </p>
                </div>
              </div>
              {canManage && unassignedCount > 0 && (
                <button
                  type="button"
                  className="button button-outline"
                  disabled={loading || savingId !== ''}
                  onClick={() => setAutoModalOpen(true)}
                >
                  <Sparkles size={15} /> Sugerir todo automático
                </button>
              )}
            </header>

            <div className="pwr-fam-toolbar">
              <label className="pwr-search">
                <Search size={17} />
                <span className="pwr-sr-only">Buscar familia</span>
                <input
                  value={familyQuery}
                  onChange={(e) => setFamilyQuery(e.target.value)}
                  placeholder="Buscar familia o categoría (ej. Impresiones, Souvenirs, Sublimación…)"
                />
                {familyQuery && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => setFamilyQuery('')}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>

              <div className="pwr-filter-row is-compact" role="group" aria-label="Filtrar familias">
                <button
                  type="button"
                  className={familyStatusFilter === 'all' ? 'is-selected' : ''}
                  aria-pressed={familyStatusFilter === 'all'}
                  onClick={() => setFamilyStatusFilter('all')}
                >
                  Todas <span>{familyCards.length}</span>
                </button>
                <button
                  type="button"
                  className={familyStatusFilter === 'with_pending' ? 'is-selected' : ''}
                  aria-pressed={familyStatusFilter === 'with_pending'}
                  onClick={() => setFamilyStatusFilter('with_pending')}
                >
                  Con pendientes{' '}
                  <span>{familyCards.filter((c) => c.pendingCount > 0).length}</span>
                </button>
                <button
                  type="button"
                  className={familyStatusFilter === 'with_rule' ? 'is-selected' : ''}
                  aria-pressed={familyStatusFilter === 'with_rule'}
                  onClick={() => setFamilyStatusFilter('with_rule')}
                >
                  Con regla <span>{familyCards.filter((c) => Boolean(c.savedCode)).length}</span>
                </button>
                <button
                  type="button"
                  className={familyStatusFilter === 'without_rule' ? 'is-selected' : ''}
                  aria-pressed={familyStatusFilter === 'without_rule'}
                  onClick={() => setFamilyStatusFilter('without_rule')}
                >
                  Sin regla <span>{familyCards.filter((c) => !c.savedCode).length}</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="pwr-loading" role="status">
                <span />
                <span />
                <span />
                Cargando familias y reglas…
              </div>
            ) : visibleFamilies.length === 0 ? (
              <div className="pwr-empty">
                <span className="pwr-empty-icon">
                  <FolderKanban size={22} />
                </span>
                <h3>Sin familias que coincidan</h3>
                <p>Limpia el buscador o cambia el filtro de estado.</p>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => {
                    setFamilyQuery('');
                    setFamilyStatusFilter('all');
                  }}
                >
                  Mostrar todas las familias
                </button>
              </div>
            ) : (
              <div className="pwr-family-grid">
                {visibleFamilies.map((card) => {
                  const selectedTpl = templateByCode.get(card.draftCode);
                  const pct = card.members.length
                    ? Math.round((card.coveredCount / card.members.length) * 100)
                    : 0;
                  const rowSaving = savingId === `fam:${card.family}`;

                  return (
                    <article
                      key={card.family}
                      className={`pwr-family-card${card.dirty ? ' is-dirty' : ''}${
                        card.savedCode ? ' has-rule' : ''
                      }`}
                    >
                      <div className="pwr-family-card-top">
                        <div>
                          <h3>{card.family}</h3>
                          <div className="pwr-family-meta">
                            <span>
                              {card.members.length}{' '}
                              {card.members.length === 1 ? 'producto' : 'productos'}
                            </span>
                            {card.areaCount > 0 && (
                              <span className="pwr-badge-area">{card.areaCount} por m²</span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`pwr-fam-progress-badge${
                            card.pendingCount === 0 ? ' is-done' : ''
                          }`}
                        >
                          {card.pendingCount === 0
                            ? '100% cubierto'
                            : `${card.pendingCount} sin ruta`}
                        </span>
                      </div>

                      <div className="pwr-fam-bar">
                        <div className="pwr-fam-bar-fill" style={{ width: `${pct}%` }} />
                      </div>

                      <label className="pwr-family-rule-select">
                        <span>Regla predeterminada de la familia</span>
                        <select
                          value={card.draftCode}
                          disabled={!canManage || rowSaving || !templates.length}
                          onChange={(e) =>
                            setFamilyDrafts((prev) => ({
                              ...prev,
                              [card.family]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Sin regla de familia (configuración individual)</option>
                          {templates.map((tpl) => (
                            <option key={tpl.code} value={tpl.code}>
                              {tpl.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedTpl && (
                        <div className="pwr-fam-pipeline-box">
                          {renderPipelineChips(selectedTpl, true)}
                          {selectedTpl.required_fields?.length > 0 && (
                            <div className="pwr-mini-reqs">
                              <small>Pide en POS:</small>
                              {selectedTpl.required_fields.map((f) => (
                                <span key={f}>{fieldLabels[f] || f}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pwr-family-card-actions">
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={() => jumpToFamilyProducts(card.family)}
                        >
                          Ver sus {card.members.length} <ArrowRight size={13} />
                        </button>
                        {canManage && (
                          <div className="pwr-family-save-pair">
                            <button
                              type="button"
                              className="button button-dark"
                              disabled={rowSaving || (!card.dirty && !card.draftCode)}
                              title="Guarda la regla predeterminada para todos los productos actuales y futuros"
                              onClick={() => void saveFamilyRule(card.family, false)}
                            >
                              {rowSaving ? 'Guardando…' : card.dirty ? 'Guardar regla' : 'Regla activa'}
                            </button>
                            {card.draftCode && (
                              <button
                                type="button"
                                className="button button-outline"
                                disabled={rowSaving}
                                title={`Fija explícitamente esta ruta en los ${card.members.length} productos de ${card.family}`}
                                onClick={() => void saveFamilyRule(card.family, true)}
                              >
                                Fijar en {card.members.length}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TODOS LOS PRODUCTOS */}
        {activeTab === 'products' && (
          <div className="pwr-tab-content">
            <header className="pwr-panel-heading">
              <div>
                <span className="pwr-section-icon">
                  <Layers3 size={17} />
                </span>
                <div>
                  <h2 id="pwr-list-title">Configuración detallada por producto</h2>
                  <p>
                    Ajusta excepciones individuales, revisa las áreas por las que pasa cada ítem o
                    aplica cambios por lotes con guardado masivo.
                  </p>
                </div>
              </div>
              {dirtyProducts.length > 0 && canManage && (
                <div className="pwr-header-dirty-actions">
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={savingId !== ''}
                    onClick={discardAllDirtyProducts}
                  >
                    <RotateCcw size={14} /> Descartar ({dirtyProducts.length})
                  </button>
                  <button
                    type="button"
                    className="button button-dark"
                    disabled={savingId !== ''}
                    onClick={() => void saveAllDirtyProducts()}
                  >
                    <Save size={14} />{' '}
                    {savingId === 'dirty_batch'
                      ? 'Guardando todo…'
                      : `Guardar ${dirtyProducts.length} cambios`}
                  </button>
                </div>
              )}
            </header>

            <div className="pwr-toolbar-multi">
              <label className="pwr-search">
                <Search size={17} />
                <span className="pwr-sr-only">Buscar productos</span>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar producto, SKU, descripción o familia…"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => {
                      setQuery('');
                      setPage(1);
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>

              <label className="pwr-select-filter">
                <span className="pwr-sr-only">Filtrar por familia</span>
                <select
                  value={familyFilter}
                  onChange={(e) => {
                    setFamilyFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Todas las familias</option>
                  {families.map((family) => (
                    <option key={family} value={family}>
                      {family}
                    </option>
                  ))}
                </select>
              </label>

              <label className="pwr-select-filter">
                <span className="pwr-sr-only">Filtrar por flujo</span>
                <select
                  value={workflowFilter}
                  onChange={(e) => {
                    setWorkflowFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Todos los flujos</option>
                  <option value="unassigned">Sin flujo asignado (Revisión)</option>
                  {templates.map((tpl) => (
                    <option key={tpl.code} value={tpl.code}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="pwr-select-filter">
                <span className="pwr-sr-only">Filtrar por área del taller</span>
                <select
                  value={areaFilter}
                  onChange={(e) => {
                    setAreaFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Todas las áreas</option>
                  {Object.entries(areaNames).map(([code, label]) => (
                    <option key={code} value={code}>
                      Área: {label} ({code})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="pwr-filter-row" role="group" aria-label="Filtrar por estado de ruta">
              <span className="pwr-filter-caption">
                <ListFilter size={15} /> Estado
              </span>
              <button
                type="button"
                className={routeFilter === 'all' ? 'is-selected' : ''}
                aria-pressed={routeFilter === 'all'}
                onClick={() => {
                  setRouteFilter('all');
                  setPage(1);
                }}
              >
                Todos <span>{products.length}</span>
              </button>
              <button
                type="button"
                className={routeFilter === 'explicit' ? 'is-selected' : ''}
                aria-pressed={routeFilter === 'explicit'}
                onClick={() => {
                  setRouteFilter('explicit');
                  setPage(1);
                }}
              >
                Explícita <span>{explicitConfiguredIds.size}</span>
              </button>
              <button
                type="button"
                className={routeFilter === 'inherited' ? 'is-selected' : ''}
                aria-pressed={routeFilter === 'inherited'}
                onClick={() => {
                  setRouteFilter('inherited');
                  setPage(1);
                }}
              >
                Heredada <span>{inheritedProductIds.size}</span>
              </button>
              <button
                type="button"
                className={routeFilter === 'unassigned' ? 'is-selected' : ''}
                aria-pressed={routeFilter === 'unassigned'}
                onClick={() => {
                  setRouteFilter('unassigned');
                  setPage(1);
                }}
              >
                Por definir <span>{unassignedCount}</span>
              </button>
              {dirtyProducts.length > 0 && (
                <button
                  type="button"
                  className={routeFilter === 'dirty' ? 'is-selected' : ''}
                  aria-pressed={routeFilter === 'dirty'}
                  onClick={() => {
                    setRouteFilter('dirty');
                    setPage(1);
                  }}
                >
                  Sin guardar <span>{dirtyProducts.length}</span>
                </button>
              )}

              <label className="pwr-area-only-toggle">
                <input
                  type="checkbox"
                  checked={onlyAreaMode}
                  onChange={(e) => {
                    setOnlyAreaMode(e.target.checked);
                    setPage(1);
                  }}
                />
                <span>Solo productos m²</span>
              </label>

              <span className="pwr-result-count">
                {visibleProducts.length} {visibleProducts.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>

            {actionableFamilySuggestions.length > 0 && (
              <section className="pwr-suggestions" aria-labelledby="pwr-suggestions-title">
                <div className="pwr-suggestions-heading">
                  <span className="pwr-suggestion-icon">
                    <Sparkles size={16} />
                  </span>
                  <div>
                    <h3 id="pwr-suggestions-title">Atajos basados en rutas ya confirmadas</h3>
                    <p>
                      Detecté coincidencia del 80% o más en estas familias sin regla fija. Puedes
                      preparar su asignación con un clic.
                    </p>
                  </div>
                </div>
                <div className="pwr-suggestion-list">
                  {actionableFamilySuggestions.map((suggestion) => (
                    <article className="pwr-suggestion" key={suggestion.family}>
                      <div className="pwr-suggestion-copy">
                        <strong>{suggestion.family}</strong>
                        <span>
                          {templateByCode.get(suggestion.workflow_code)?.name ||
                            suggestion.workflow_code}
                        </span>
                        <small>
                          {suggestion.matching_count} de {suggestion.assigned_count} coinciden ·{' '}
                          {suggestion.unassigned_count} por completar
                        </small>
                      </div>
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={!canManage || loading || savingId !== ''}
                        onClick={() => prepareFamilySuggestion(suggestion)}
                      >
                        <ClipboardList size={14} /> Preparar selección
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Floating Dirty Changes Banner */}
            {dirtyProducts.length > 0 && canManage && (
              <div className="pwr-dirty-banner" role="status">
                <div>
                  <span className="pwr-dirty-dot" />
                  <b>
                    Tienes {dirtyProducts.length}{' '}
                    {dirtyProducts.length === 1 ? 'cambio pendiente' : 'cambios pendientes'} sin
                    guardar
                  </b>
                </div>
                <div className="pwr-dirty-banner-actions">
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={savingId !== ''}
                    onClick={discardAllDirtyProducts}
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    className="button button-dark"
                    disabled={savingId !== ''}
                    onClick={() => void saveAllDirtyProducts()}
                  >
                    <Save size={14} />{' '}
                    {savingId === 'dirty_batch'
                      ? 'Guardando…'
                      : `Guardar los ${dirtyProducts.length} cambios`}
                  </button>
                </div>
              </div>
            )}

            {/* Bulk Selection Bar */}
            {selectedIds.size > 0 && (
              <section className="pwr-bulk" aria-label="Asignación en lote">
                <div className="pwr-bulk-copy">
                  <span className="pwr-bulk-count">{selectedIds.size}</span>
                  <div>
                    <strong>Productos seleccionados</strong>
                    <button
                      type="button"
                      className="pwr-text-action"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Limpiar selección
                    </button>
                  </div>
                </div>
                <label>
                  <span className="pwr-sr-only">Ruta para los productos seleccionados</span>
                  <select
                    value={bulkWorkflow}
                    onChange={(e) => setBulkWorkflow(e.target.value)}
                    disabled={!canManage || savingId !== ''}
                  >
                    <option value="">Quitar ruta explícita (heredar familia)</option>
                    {templates.map((template) => (
                      <option key={template.code} value={template.code}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button button-dark"
                  disabled={!canManage || !templates.length || savingId !== ''}
                  onClick={() => void saveSelection()}
                >
                  {savingId === 'bulk' ? 'Aplicando…' : 'Aplicar a selección'}
                </button>
              </section>
            )}

            {loading ? (
              <div className="pwr-loading" role="status">
                <span />
                <span />
                <span />
                Cargando productos y rutas…
              </div>
            ) : !products.length ? (
              <div className="pwr-empty">
                <span className="pwr-empty-icon">
                  <Layers3 size={22} />
                </span>
                <h3>No hay productos disponibles</h3>
                <p>
                  Cuando el catálogo tenga productos activos, podrás definir aquí sus rutas de
                  taller.
                </p>
              </div>
            ) : !visibleProducts.length ? (
              <div className="pwr-empty">
                <span className="pwr-empty-icon">
                  <Search size={22} />
                </span>
                <h3>No hay coincidencias con estos filtros</h3>
                <p>Prueba con otro término o limpia los filtros para ver todo el catálogo.</p>
                <button type="button" className="button button-outline" onClick={clearProductFilters}>
                  Limpiar todos los filtros
                </button>
              </div>
            ) : (
              <>
                <div className="pwr-list" aria-label="Productos y rutas">
                  <div className="pwr-list-top">
                    <label className="pwr-select-visible">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Seleccionar todos los productos visibles en esta página"
                      />
                      <span>Producto ({paginatedProducts.length} en página)</span>
                    </label>
                    <span>Ruta y etapas</span>
                    <span>Origen / Estado</span>
                    <span className="pwr-sr-only">Acciones</span>
                  </div>

                  {paginatedProducts.map((product) => {
                    const current = routeByProduct.get(product.id);
                    const savedWorkflow = current?.active ? current.workflow_code : '';
                    const selected = drafts[product.id] ?? savedWorkflow;
                    const dirty = selected !== savedWorkflow;
                    const rec = recommendations.get(product.id);
                    const inheritedCode =
                      !selected && rec?.ruleType === 'explicit_family' ? rec.workflow_code : '';
                    const effectiveCode = selected || inheritedCode;
                    const effectiveTemplate = effectiveCode
                      ? templateByCode.get(effectiveCode)
                      : undefined;
                    const rowSaving =
                      savingId === product.id || savingId === 'bulk' || savingId === 'dirty_batch';

                    return (
                      <article
                        className={`pwr-item${dirty ? ' is-dirty' : ''}${
                          inheritedCode ? ' is-inherited' : ''
                        }`}
                        key={product.id}
                      >
                        <div className="pwr-product-cell">
                          <label className="pwr-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(product.id)}
                              onChange={(event) =>
                                setSelectedIds((value) => {
                                  const next = new Set(value);
                                  if (event.target.checked) next.add(product.id);
                                  else next.delete(product.id);
                                  return next;
                                })
                              }
                              aria-label={`Seleccionar ${product.name}`}
                            />
                          </label>
                          {product.image ? (
                            <img
                              src={product.image}
                              alt=""
                              className="pwr-product-thumb"
                              loading="lazy"
                            />
                          ) : (
                            <span className="pwr-product-icon">
                              <Route size={16} />
                            </span>
                          )}
                          <div className="pwr-product-name">
                            <strong>{product.name}</strong>
                            <div className="pwr-product-sub">
                              <span>{productFamilyOf(product)}</span>
                              {product.sku && product.sku !== product.id && (
                                <span>· {product.sku}</span>
                              )}
                              {product.mode === 'area' && (
                                <span className="pwr-badge-area">m²</span>
                              )}
                              {!product.published && <span className="pwr-badge-draft">Borrador</span>}
                            </div>
                          </div>
                        </div>

                        <div className="pwr-route-col">
                          <label className="pwr-route-select">
                            <span className="pwr-sr-only">Ruta para {product.name}</span>
                            <select
                              value={selected}
                              disabled={!canManage || rowSaving || !templates.length}
                              onChange={(event) =>
                                setDrafts((value) => ({
                                  ...value,
                                  [product.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">
                                {rec?.ruleType === 'explicit_family'
                                  ? `Usar regla de familia (${
                                      templateByCode.get(rec.workflow_code)?.name || rec.workflow_code
                                    })`
                                  : 'Sin ruta predeterminada (Revisión)'}
                              </option>
                              {templates.map((template) => (
                                <option key={template.code} value={template.code}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {effectiveTemplate && (
                            <div className="pwr-inline-pipeline">
                              {renderPipelineChips(effectiveTemplate, true)}
                            </div>
                          )}
                        </div>

                        <div className="pwr-status-cell">
                          {dirty ? (
                            <span className="pwr-status is-pending">
                              <span />
                              Cambio sin guardar
                            </span>
                          ) : savedWorkflow ? (
                            <span className="pwr-status is-configured">
                              <CheckCheck size={14} />
                              <span>Explícita · {templateByCode.get(savedWorkflow)?.name || savedWorkflow}</span>
                            </span>
                          ) : inheritedCode ? (
                            <span className="pwr-status is-inherited">
                              <FolderKanban size={14} />
                              <span>Hereda de familia</span>
                            </span>
                          ) : (
                            <span className="pwr-status is-unassigned">
                              <CircleHelp size={14} />
                              <span>Se define en revisión</span>
                            </span>
                          )}
                          {effectiveTemplate?.required_fields?.length ? (
                            <div className="pwr-mini-reqs">
                              {effectiveTemplate.required_fields.map((f) => (
                                <span key={f}>{fieldLabels[f] || f}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="pwr-row-actions">
                          {dirty ? (
                            <div className="pwr-row-btn-group">
                              <button
                                type="button"
                                className="button button-outline"
                                disabled={rowSaving}
                                title="Deshacer cambio en esta fila"
                                aria-label={`Deshacer el cambio de ruta de ${product.name}`}
                                onClick={() =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [product.id]: savedWorkflow,
                                  }))
                                }
                              >
                                <RotateCcw size={13} />
                              </button>
                              <button
                                type="button"
                                className="button button-dark"
                                disabled={!canManage || rowSaving}
                                onClick={() => void saveSingleProduct(product.id)}
                              >
                                {savingId === product.id ? 'Guardando…' : 'Guardar'}
                              </button>
                            </div>
                          ) : (
                            <span className="pwr-row-saved-hint">
                              {effectiveCode ? 'Listo para POS' : 'Manual'}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="pwr-pagination-wrap">
                    <Pagination
                      page={page}
                      pages={totalPages}
                      onPageChange={(nextPage) => setPage(nextPage)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 3: FLUJOS DEL TALLER (PLANTILLAS) */}
        {activeTab === 'flows' && (
          <div className="pwr-tab-content">
            <header className="pwr-panel-heading">
              <div>
                <span className="pwr-section-icon">
                  <Wrench size={17} />
                </span>
                <div>
                  <h2>Plantillas de flujo de producción</h2>
                  <p>
                    Cada plantilla define la secuencia exacta de áreas que seguirá el pedido en
                    taller y los campos técnicos que pedirá el POS al confirmar.
                  </p>
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="button button-dark"
                  onClick={() => {
                    setEditingTemplate(null);
                    setTemplateModalOpen(true);
                  }}
                >
                  <Plus size={15} /> Crear nuevo flujo
                </button>
              )}
            </header>

            {loading ? (
              <div className="pwr-loading" role="status">
                <span />
                <span />
                <span />
                Cargando plantillas…
              </div>
            ) : (
              <div className="pwr-flows-grid">
                {templates.map((tpl) => {
                  const stats = templateUsage.get(tpl.code) || { explicit: 0, inherited: 0 };
                  const totalUsed = stats.explicit + stats.inherited;
                  const steps = Array.isArray(tpl.steps) ? tpl.steps : [];
                  const totalMins = steps.reduce(
                    (sum, s) => sum + (Number(s.estimated_minutes) || 60),
                    0,
                  );

                  return (
                    <article className="pwr-flow-card" key={tpl.code}>
                      <div className="pwr-flow-card-head">
                        <div>
                          <div className="pwr-flow-title-row">
                            <h3>{tpl.name}</h3>
                            <code>{tpl.code}</code>
                          </div>
                          <div className="pwr-flow-meta">
                            <span>
                              {steps.length} {steps.length === 1 ? 'etapa' : 'etapas'}
                            </span>
                            {steps.length > 0 && (
                              <span>
                                <Clock size={12} /> ~{totalMins} min est.
                              </span>
                            )}
                            <span className="pwr-flow-usage-pill">
                              {totalUsed} {totalUsed === 1 ? 'producto' : 'productos'}
                            </span>
                          </div>
                        </div>

                        {canManage && (
                          <button
                            type="button"
                            className="button button-outline"
                            onClick={() => {
                              setEditingTemplate({
                                code: tpl.code,
                                name: tpl.name,
                                steps: steps,
                                required_fields: tpl.required_fields || [],
                                active: tpl.active,
                              });
                              setTemplateModalOpen(true);
                            }}
                          >
                            <Pencil size={14} /> Editar flujo
                          </button>
                        )}
                      </div>

                      <div className="pwr-flow-steps-detail">
                        {steps.length === 0 ? (
                          <p className="pwr-flow-no-steps">
                            {tpl.code === 'none'
                              ? 'Entrega directa de inventario/producto terminado. No crea trabajos de producción.'
                              : 'Envía el trabajo a revisión general sin etapas predefinidas.'}
                          </p>
                        ) : (
                          <ol className="pwr-flow-timeline">
                            {steps.map((step, idx) => (
                              <li key={step.key || `${step.area}-${idx}`}>
                                <span className="pwr-timeline-num">{idx + 1}</span>
                                <div className="pwr-timeline-body">
                                  <strong>{step.title || 'Etapa'}</strong>
                                  <small>
                                    {step.area ? areaNames[step.area] || step.area : 'Área'} ·{' '}
                                    {step.estimated_minutes || 60} min
                                  </small>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>

                      <div className="pwr-flow-card-foot">
                        <div className="pwr-flow-reqs-wrap">
                          {tpl.required_fields?.length > 0 ? (
                            tpl.required_fields.map((field) => (
                              <span key={field} className="pwr-mini-req-badge">
                                Pide: {fieldLabels[field] || field}
                              </span>
                            ))
                          ) : (
                            <span className="pwr-flow-no-reqs">Sin requisitos extras en POS</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="pwr-text-action"
                          onClick={() => jumpToWorkflowProducts(tpl.code)}
                        >
                          Ver {totalUsed} productos →
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <footer className="pwr-footnote">
          <span className="pwr-footnote-icon">
            <Settings2 size={15} />
          </span>
          <p>
            Las rutas explícitas por producto tienen prioridad sobre las reglas de familia. Cambiar
            una ruta o flujo aplica a las <strong>ventas y cotizaciones nuevas</strong> sin alterar
            trabajos que ya están en producción.
          </p>
        </footer>
      </section>

      {/* Modals */}
      <AutoClassifyRoutesModal
        open={autoModalOpen}
        onOpenChange={setAutoModalOpen}
        products={products}
        assignedProductIds={explicitConfiguredIds}
        assignedFamilyNames={new Set(familyRuleByName.keys())}
        templates={templates}
        areaNames={areaNames}
        saving={savingId === 'auto'}
        onApply={handleApplyAutoClassification}
      />

      <WorkflowTemplateEditorModal
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        template={editingTemplate}
        areaOptions={
          areaOptions.length > 0
            ? areaOptions
            : Object.entries(DEFAULT_AREA_FALLBACK).map(([code, name]) => ({ code, name }))
        }
        existingCodes={templates.map((t) => t.code)}
        saving={savingTemplate}
        onSave={handleSaveTemplate}
      />
    </AppFrame>
  );
}

export default ProductWorkflowRoutesPage;
