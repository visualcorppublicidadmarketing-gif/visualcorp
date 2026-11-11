import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, ChevronDown, Sparkles } from 'lucide-react';
import { Dialog, DialogCallout, DialogSection } from '../../../components/ui/OperationalKit';
import {
  buildAutoClassificationPlan,
  productFamilyOf,
  type ProductWorkflowProduct,
} from '../../../lib/productWorkflowRoutes';

type WorkflowTemplateSummary = {
  code: string;
  name: string;
  steps?: Array<{ area?: string; title?: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductWorkflowProduct[];
  assignedProductIds: ReadonlySet<string>;
  assignedFamilyNames: ReadonlySet<string>;
  templates: WorkflowTemplateSummary[];
  areaNames: Record<string, string>;
  saving: boolean;
  onApply: (
    assignments: Array<{ productId: string; workflow_code: string }>,
    familyRules: Array<{ family_name: string; workflow_code: string }>,
  ) => Promise<void>;
};

export function AutoClassifyRoutesModal({
  open,
  onOpenChange,
  products,
  assignedProductIds,
  assignedFamilyNames,
  templates,
  areaNames,
  saving,
  onApply,
}: Props) {
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const [alsoCreateFamilyRules, setAlsoCreateFamilyRules] = useState(true);
  const [selectedWorkflows, setSelectedWorkflows] = useState<Record<string, string>>({});
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [expandedWorkflow, setExpandedWorkflow] = useState<string>('');
  const [error, setError] = useState('');

  const activeWorkflowCodes = useMemo(() => new Set(templates.map((t) => t.code)), [templates]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const templateByCode = useMemo(() => new Map(templates.map((t) => [t.code, t])), [templates]);

  const rawPlan = useMemo(
    () =>
      buildAutoClassificationPlan(products, assignedProductIds, activeWorkflowCodes, {
        includeAssigned,
      }),
    [products, assignedProductIds, activeWorkflowCodes, includeAssigned],
  );

  useEffect(() => {
    if (!open) return;
    setError('');
    setExcludedIds(new Set());
    const nextMap: Record<string, string> = {};
    for (const item of rawPlan) {
      nextMap[item.productId] = item.workflow_code;
    }
    setSelectedWorkflows(nextMap);
    if (rawPlan.length > 0) {
      setExpandedWorkflow('');
    }
  }, [open, rawPlan]);

  const groupedProposals = useMemo(() => {
    const groups = new Map<
      string,
      Array<{ product: ProductWorkflowProduct; reason: string; workflow_code: string }>
    >();
    for (const item of rawPlan) {
      const product = productById.get(item.productId);
      if (!product) continue;
      const code = selectedWorkflows[item.productId] || item.workflow_code;
      const arr = groups.get(code) || [];
      arr.push({ product, reason: item.reason, workflow_code: code });
      groups.set(code, arr);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rawPlan, productById, selectedWorkflows]);

  const activeAssignments = useMemo(() => {
    return rawPlan
      .filter((item) => !excludedIds.has(item.productId))
      .map((item) => ({
        productId: item.productId,
        workflow_code: selectedWorkflows[item.productId] || item.workflow_code,
      }));
  }, [rawPlan, excludedIds, selectedWorkflows]);

  // Compute unanimous family rules from activeAssignments if enabled
  const derivedFamilyRules = useMemo(() => {
    if (!alsoCreateFamilyRules) return [];
    const familyCounts = new Map<string, Map<string, number>>();
    for (const entry of activeAssignments) {
      const prod = productById.get(entry.productId);
      if (!prod) continue;
      const fam = productFamilyOf(prod);
      if (assignedFamilyNames.has(fam)) continue;
      const counts = familyCounts.get(fam) || new Map<string, number>();
      counts.set(entry.workflow_code, (counts.get(entry.workflow_code) || 0) + 1);
      familyCounts.set(fam, counts);
    }
    const rules: Array<{ family_name: string; workflow_code: string }> = [];
    for (const [fam, counts] of familyCounts.entries()) {
      let bestCode = '';
      let bestCount = 0;
      let total = 0;
      for (const [code, cnt] of counts.entries()) {
        total += cnt;
        if (cnt > bestCount) {
          bestCount = cnt;
          bestCode = code;
        }
      }
      if (bestCode && total >= 2 && bestCount / total >= 0.8) {
        rules.push({ family_name: fam, workflow_code: bestCode });
      }
    }
    return rules;
  }, [alsoCreateFamilyRules, activeAssignments, productById, assignedFamilyNames]);

  const toggleGroup = (items: Array<{ product: ProductWorkflowProduct }>, checked: boolean) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (checked) next.delete(item.product.id);
        else next.add(item.product.id);
      }
      return next;
    });
  };

  const changeGroupWorkflow = (
    items: Array<{ product: ProductWorkflowProduct }>,
    nextCode: string,
  ) => {
    setSelectedWorkflows((prev) => {
      const next = { ...prev };
      for (const item of items) {
        next[item.product.id] = nextCode;
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!activeAssignments.length) return;
    setError('');
    try {
      await onApply(activeAssignments, derivedFamilyRules);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron aplicar las rutas automáticas.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
      title="Asistente de Auto-clasificación de Rutas"
      description="Analiza nombres, familias y unidades (m² vs. unidad) del catálogo de Visual Corp para asignar rutas de taller en un clic."
      eyebrow="CONFIGURACIÓN INTELIGENTE"
      icon={<Sparkles size={18} />}
      size="xl"
      footerHint="Podrás ajustar cualquier producto de forma individual después de aplicar."
      footer={
        <div className="pwr-modal-footer-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button-dark"
            disabled={saving || activeAssignments.length === 0}
            onClick={() => void handleConfirm()}
          >
            <CheckCheck size={15} />
            {saving
              ? 'Aplicando rutas…'
              : `Aplicar ${activeAssignments.length} ${activeAssignments.length === 1 ? 'ruta' : 'rutas'}`}
          </button>
        </div>
      }
    >
      <div className="pwr-auto-wrap">
        {error && <DialogCallout tone="danger">{error}</DialogCallout>}

        <div className="pwr-auto-options">
          <label className="pwr-auto-check">
            <input
              type="checkbox"
              checked={includeAssigned}
              disabled={saving}
              onChange={(e) => setIncludeAssigned(e.target.checked)}
            />
            <span>
              <b>Incluir productos que ya tienen ruta</b>
              <small>Útil si deseas re-ordenar todo el catálogo desde cero.</small>
            </span>
          </label>
          <label className="pwr-auto-check">
            <input
              type="checkbox"
              checked={alsoCreateFamilyRules}
              disabled={saving}
              onChange={(e) => setAlsoCreateFamilyRules(e.target.checked)}
            />
            <span>
              <b>Guardar también como regla predeterminada por familia</b>
              <small>
                {derivedFamilyRules.length > 0
                  ? `Se crearán reglas automáticas para ${derivedFamilyRules.length} familias (ej. nuevos productos heredarán la ruta).`
                  : 'Los nuevos productos que se agreguen heredarán automáticamente la ruta de su categoría.'}
              </small>
            </span>
          </label>
        </div>

        {rawPlan.length === 0 ? (
          <DialogCallout tone="success">
            {includeAssigned
              ? 'No se encontraron productos compatibles para auto-clasificar.'
              : '¡Excelente! Todos los productos clasificables ya tienen una ruta asignada. Marca "Incluir productos que ya tienen ruta" si deseas re-evaluarlos.'}
          </DialogCallout>
        ) : (
          <DialogSection
            title={`Propuestas detectadas (${activeAssignments.length} de ${rawPlan.length} seleccionadas)`}
            description="Haz clic en cualquier bloque para inspeccionar productos puntuales o reasignar el destino."
          >
            <div className="pwr-auto-groups">
              {groupedProposals.map(([code, items]) => {
                const tpl = templateByCode.get(code);
                const activeCount = items.filter((it) => !excludedIds.has(it.product.id)).length;
                const allChecked = activeCount === items.length;
                const isOpen = expandedWorkflow === code;
                const steps = Array.isArray(tpl?.steps) ? tpl.steps : [];

                return (
                  <div className="pwr-auto-group" key={code}>
                    <div className="pwr-auto-group-head">
                      <label className="pwr-auto-group-check">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={(e) => toggleGroup(items, e.target.checked)}
                        />
                        <div>
                          <strong>{tpl?.name || code}</strong>
                          <small>
                            {activeCount} de {items.length} productos ·{' '}
                            {steps.length > 0
                              ? steps.map((s) => areaNames[s.area || ''] || s.area).join(' → ')
                              : 'Entrega directa sin taller'}
                          </small>
                        </div>
                      </label>
                      <div className="pwr-auto-group-actions">
                        <select
                          aria-label={`Cambiar destino para grupo ${tpl?.name || code}`}
                          value={code}
                          disabled={saving}
                          onChange={(e) => changeGroupWorkflow(items, e.target.value)}
                        >
                          {templates.map((t) => (
                            <option key={t.code} value={t.code}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={() => setExpandedWorkflow(isOpen ? '' : code)}
                        >
                          <span>{isOpen ? 'Ocultar' : `Ver ${items.length}`}</span>
                          <ChevronDown
                            size={14}
                            style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
                          />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="pwr-auto-group-items">
                        {items.map(({ product, reason }) => {
                          const checked = !excludedIds.has(product.id);
                          return (
                            <div
                              key={product.id}
                              className={`pwr-auto-item${!checked ? ' is-excluded' : ''}`}
                            >
                              <label className="pwr-auto-item-check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setExcludedIds((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.delete(product.id);
                                      else next.add(product.id);
                                      return next;
                                    });
                                  }}
                                />
                                <div>
                                  <b>{product.name}</b>
                                  <small>
                                    {productFamilyOf(product)} · {reason}
                                  </small>
                                </div>
                              </label>
                              <select
                                aria-label={`Ruta para ${product.name}`}
                                value={selectedWorkflows[product.id] || code}
                                disabled={saving || !checked}
                                onChange={(e) =>
                                  setSelectedWorkflows((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.value,
                                  }))
                                }
                              >
                                {templates.map((t) => (
                                  <option key={t.code} value={t.code}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogSection>
        )}
      </div>
    </Dialog>
  );
}
