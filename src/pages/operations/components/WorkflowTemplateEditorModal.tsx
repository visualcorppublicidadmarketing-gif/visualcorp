import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Plus,
  Save,
  Trash2,
  Workflow,
} from 'lucide-react';
import { Dialog, DialogCallout, DialogSection } from '../../../components/ui/OperationalKit';

export type EditableWorkflowStep = {
  key: string;
  area: string;
  title: string;
  depends_on: string[];
  estimated_minutes?: number;
  requirements?: {
    before_start?: string[];
    before_complete?: string[];
  };
};

export type EditableWorkflowTemplate = {
  code: string;
  name: string;
  steps: EditableWorkflowStep[];
  required_fields: string[];
  active?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EditableWorkflowTemplate | null;
  areaOptions: Array<{ code: string; name: string }>;
  existingCodes: string[];
  saving: boolean;
  onSave: (payload: {
    isNew: boolean;
    code: string;
    name: string;
    steps: EditableWorkflowStep[];
    required_fields: string[];
  }) => Promise<void>;
};

const REQUIRED_FIELD_OPTIONS = [
  { key: 'width_cm', label: 'Ancho (cm)' },
  { key: 'height_cm', label: 'Alto (cm)' },
  { key: 'material', label: 'Material o soporte' },
  { key: 'installation_address', label: 'Dirección de instalación' },
];

const slugifyCode = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 38);

const defaultSteps = (): EditableWorkflowStep[] => [
  {
    key: 'intake',
    area: 'ASE',
    title: 'Verificar ficha y medidas',
    depends_on: [],
    estimated_minutes: 15,
    requirements: { before_start: [], before_complete: ['intake_complete'] },
  },
  {
    key: 'design',
    area: 'DIS',
    title: 'Preparar diseño y arte',
    depends_on: ['intake'],
    estimated_minutes: 45,
    requirements: { before_start: [], before_complete: [] },
  },
  {
    key: 'workshop',
    area: 'TAL',
    title: 'Producir y preparar entrega',
    depends_on: ['design'],
    estimated_minutes: 120,
    requirements: { before_start: ['deposit_paid', 'artwork_approved'], before_complete: [] },
  },
];

export function WorkflowTemplateEditorModal({
  open,
  onOpenChange,
  template,
  areaOptions,
  existingCodes,
  saving,
  onSave,
}: Props) {
  const isNew = !template;
  const [name, setName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [steps, setSteps] = useState<EditableWorkflowStep[]>(defaultSteps());
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFormError('');
    if (template) {
      setName(template.name || '');
      setCustomCode(template.code || '');
      setCodeTouched(true);
      setRequiredFields(Array.isArray(template.required_fields) ? template.required_fields : []);
      setSteps(
        Array.isArray(template.steps) && template.steps.length > 0
          ? template.steps.map((step, index) => ({
              key: step.key || `step_${index + 1}`,
              area: step.area || areaOptions[0]?.code || 'TAL',
              title: step.title || '',
              depends_on: Array.isArray(step.depends_on) ? step.depends_on : [],
              estimated_minutes: Number(step.estimated_minutes) || 60,
              requirements: step.requirements || { before_start: [], before_complete: [] },
            }))
          : [],
      );
    } else {
      setName('');
      setCustomCode('');
      setCodeTouched(false);
      setRequiredFields([]);
      setSteps(defaultSteps());
    }
  }, [open, template, areaOptions]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (isNew && !codeTouched) {
      const base = slugifyCode(value);
      setCustomCode(base ? `custom_${base}`.slice(0, 46) : '');
    }
  };

  const toggleRequiredField = (fieldKey: string) => {
    setRequiredFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((item) => item !== fieldKey) : [...prev, fieldKey],
    );
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      next.splice(target, 0, removed);
      return next;
    });
  };

  const addStep = () => {
    if (steps.length >= 16) return;
    const nextIndex = steps.length + 1;
    const defaultArea = areaOptions.find((a) => a.code === 'TAL')?.code || areaOptions[0]?.code || 'TAL';
    setSteps((prev) => [
      ...prev,
      {
        key: prev.length === 0 ? 'intake' : `step_${nextIndex}_${Date.now().toString(36).slice(-3)}`,
        area: prev.length === 0 ? 'ASE' : defaultArea,
        title: prev.length === 0 ? 'Verificar ficha y pedido' : 'Nueva etapa de taller',
        depends_on: [],
        estimated_minutes: 60,
        requirements:
          prev.length === 0
            ? { before_start: [], before_complete: ['intake_complete'] }
            : { before_start: ['deposit_paid', 'artwork_approved'], before_complete: [] },
      },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, patch: Partial<EditableWorkflowStep>) => {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const toggleStepGate = (index: number, gate: 'deposit_paid' | 'artwork_approved') => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== index) return step;
        const current = step.requirements?.before_start || [];
        const nextBeforeStart = current.includes(gate)
          ? current.filter((item) => item !== gate)
          : [...current, gate];
        return {
          ...step,
          requirements: {
            before_complete: step.requirements?.before_complete || [],
            before_start: nextBeforeStart,
          },
        };
      }),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      setFormError('El nombre de la ruta debe tener entre 3 y 100 caracteres.');
      return;
    }

    const finalCode = isNew ? customCode.trim().toLowerCase() : template!.code;
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(finalCode)) {
      setFormError('El código técnico debe comenzar con letra minúscula y solo contener letras minúsculas, números o "_".');
      return;
    }

    if (isNew && existingCodes.includes(finalCode)) {
      setFormError(`Ya existe un flujo con el código "${finalCode}". Elige otro nombre o código.`);
      return;
    }

    if (finalCode !== 'none' && steps.length === 0) {
      setFormError('Agrega al menos 1 etapa de producción (o usa "Entrega directa" para productos sin taller).');
      return;
    }

    if (steps.some((step) => step.title.trim().length < 3)) {
      setFormError('Todas las etapas deben tener un título descriptivo de al menos 3 caracteres.');
      return;
    }

    // Build normalized linear step keys & sequential dependencies compatible with create_production_job_steps
    const usedKeys = new Set<string>();
    const normalizedSteps: EditableWorkflowStep[] = [];
    for (let i = 0; i < steps.length; i += 1) {
      const raw = steps[i];
      let stepKey = i === 0 && raw.area === 'ASE' && finalCode !== 'review' ? 'intake' : slugifyCode(raw.key || `step_${i + 1}`);
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(stepKey)) {
        stepKey = `step_${i + 1}`;
      }
      while (usedKeys.has(stepKey)) {
        stepKey = `${stepKey.slice(0, 58)}_${i + 1}`;
      }
      usedKeys.add(stepKey);

      const prevKey = i > 0 ? normalizedSteps[i - 1].key : null;
      normalizedSteps.push({
        key: stepKey,
        area: raw.area,
        title: raw.title.trim(),
        depends_on: prevKey ? [prevKey] : [],
        estimated_minutes: Math.max(5, Math.min(10080, Math.round(Number(raw.estimated_minutes) || 60))),
        requirements: {
          before_start: raw.requirements?.before_start || [],
          before_complete:
            stepKey === 'intake' && !(raw.requirements?.before_complete || []).includes('intake_complete')
              ? ['intake_complete']
              : raw.requirements?.before_complete || [],
        },
      });
    }

    try {
      await onSave({
        isNew,
        code: finalCode,
        name: trimmedName,
        steps: normalizedSteps,
        required_fields: requiredFields,
      });
      onOpenChange(false);
    } catch (err: any) {
      setFormError(err?.message || 'No se pudo guardar la plantilla de flujo.');
    }
  };

  const areaLookup = Object.fromEntries(areaOptions.map((a) => [a.code, a.name]));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
      title={isNew ? 'Crear nuevo flujo de taller' : `Editar flujo: ${template?.name}`}
      description="Define las áreas secuenciales que recorrerá cualquier producto asignado a esta ruta y qué datos exigirá al vender."
      eyebrow="PLANTILLAS DE PRODUCCIÓN"
      icon={<Workflow size={18} />}
      size="lg"
      footerHint="Los cambios se aplicarán a las nuevas ventas y cotizaciones."
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
            type="submit"
            form="pwr-template-editor-form"
            className="button button-dark"
            disabled={saving}
          >
            <Save size={15} />
            {saving ? 'Guardando flujo…' : isNew ? 'Crear flujo' : 'Guardar cambios'}
          </button>
        </div>
      }
    >
      <form id="pwr-template-editor-form" className="pwr-tpl-form" onSubmit={handleSubmit}>
        {formError && <DialogCallout tone="danger">{formError}</DialogCallout>}

        <div className="pwr-tpl-meta-grid">
          <label className="pwr-tpl-field">
            <span>Nombre visible del flujo</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={100}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej. Impresión UV sobre rígido"
            />
          </label>
          <label className="pwr-tpl-field">
            <span>Código interno {isNew ? '(Editable)' : '(Fijo)'}</span>
            <input
              type="text"
              required
              readOnly={!isNew}
              disabled={!isNew}
              value={customCode}
              onChange={(e) => {
                setCodeTouched(true);
                setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
              }}
              placeholder="custom_impresion_uv"
            />
          </label>
        </div>

        <DialogSection
          title="Recorrido resultante en taller"
          description="Vista previa en vivo de la secuencia de estaciones"
        >
          <div className="pwr-pipeline-preview">
            {steps.length === 0 ? (
              <span className="pwr-pipeline-empty">Entrega directa (sin etapas de producción)</span>
            ) : (
              steps.map((step, index) => (
                <React.Fragment key={`${step.key}-${index}`}>
                  {index > 0 && <ArrowRight size={14} className="pwr-pipeline-arrow" aria-hidden="true" />}
                  <span className="pwr-pipeline-chip">
                    <small>{index + 1}</small>
                    <b>{areaLookup[step.area] || step.area}</b>
                  </span>
                </React.Fragment>
              ))
            )}
          </div>
        </DialogSection>

        <DialogSection
          title={`Etapas del flujo (${steps.length}/16)`}
          description="El trabajo avanzará de arriba hacia abajo según este orden."
          action={
            template?.code !== 'none' && (
              <button
                type="button"
                className="button button-outline"
                disabled={steps.length >= 16 || saving}
                onClick={addStep}
              >
                <Plus size={14} /> Añadir etapa
              </button>
            )
          }
        >
          {steps.length === 0 ? (
            <p className="pwr-tpl-empty-steps">
              Este flujo no tiene etapas de taller. Puedes agregar etapas si deseas activar producción.
            </p>
          ) : (
            <div className="pwr-tpl-steps-list">
              {steps.map((step, index) => {
                const gates = step.requirements?.before_start || [];
                return (
                  <div className="pwr-tpl-step-card" key={`${step.key}-${index}`}>
                    <div className="pwr-tpl-step-top">
                      <span className="pwr-tpl-step-num">{index + 1}</span>
                      <select
                        aria-label={`Área etapa ${index + 1}`}
                        value={step.area}
                        onChange={(e) => updateStep(index, { area: e.target.value })}
                      >
                        {areaOptions.map((area) => (
                          <option key={area.code} value={area.code}>
                            {area.name} ({area.code})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={140}
                        aria-label={`Título etapa ${index + 1}`}
                        value={step.title}
                        onChange={(e) => updateStep(index, { title: e.target.value })}
                        placeholder="Describe qué se hace en esta etapa"
                      />
                      <div className="pwr-tpl-step-controls">
                        <button
                          type="button"
                          className="pwr-icon-btn"
                          title="Subir etapa"
                          disabled={index === 0 || saving}
                          onClick={() => moveStep(index, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="pwr-icon-btn"
                          title="Bajar etapa"
                          disabled={index === steps.length - 1 || saving}
                          onClick={() => moveStep(index, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="pwr-icon-btn is-danger"
                          title="Eliminar etapa"
                          disabled={(steps.length <= 1 && template?.code !== 'none') || saving}
                          onClick={() => removeStep(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="pwr-tpl-step-bottom">
                      <label className="pwr-tpl-minutes">
                        <span>Tiempo est. (min):</span>
                        <input
                          type="number"
                          min={5}
                          max={10080}
                          value={step.estimated_minutes ?? 60}
                          onChange={(e) =>
                            updateStep(index, { estimated_minutes: Number(e.target.value) || 60 })
                          }
                        />
                      </label>
                      <div className="pwr-tpl-gates">
                        <label>
                          <input
                            type="checkbox"
                            checked={gates.includes('deposit_paid')}
                            onChange={() => toggleStepGate(index, 'deposit_paid')}
                          />
                          <span>Exigir abono previo</span>
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={gates.includes('artwork_approved')}
                            onChange={() => toggleStepGate(index, 'artwork_approved')}
                          />
                          <span>Exigir arte aprobado</span>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogSection>

        <DialogSection
          title="Datos obligatorios al vender en POS"
          description="El sistema solicitará estos datos antes de enviar la orden a taller."
        >
          <div className="pwr-tpl-req-grid">
            {REQUIRED_FIELD_OPTIONS.map((field) => {
              const checked = requiredFields.includes(field.key);
              return (
                <label key={field.key} className={`pwr-tpl-req-chip${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRequiredField(field.key)}
                  />
                  {checked && <Check size={13} />}
                  <span>{field.label}</span>
                </label>
              );
            })}
          </div>
        </DialogSection>
      </form>
    </Dialog>
  );
}
