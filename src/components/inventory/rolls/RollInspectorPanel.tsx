import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Dices,
  History,
  Info,
  LoaderCircle,
  Lock,
  MapPin,
  Plus,
  Ruler,
  Settings2,
  SlidersHorizontal,
  Warehouse,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { Drawer } from 'vaul';
import { Sheet, Tabs } from '../../ui/OperationalKit';
import {
  buildRollConfigAuditReason,
  computeMeterStepTarget,
  computeMetersForPercent,
  computeRollMetrics,
  inferRollFamily,
  resolveRollFamilyMeta,
  resolveRollHealthLabel,
  resolveRollHealthTier,
  roundMetric,
  type RollFamily,
} from '../../../lib/inventoryRollHelpers.mjs';
import { RollLiveMetric } from './RollLiveMetric';
import { RollSpoolPreview } from './RollSpoolPreview';
import type {
  LocationOption,
  RollInspectorTab,
  RollLogRecord,
  RollRecord,
} from './types';

export type RollInspectorPanelProps = {
  roll: RollRecord | null;
  open: boolean;
  activeTab: RollInspectorTab;
  onTabChange: (tab: RollInspectorTab) => void;
  onClose: () => void;
  canEdit: boolean;
  busy: boolean;
  isCatalogLinked: boolean;
  branchName: string;
  availableMachines: string[];
  locations: LocationOption[];
  warehouseReplacements: RollRecord[];
  onQuickPercent: (roll: RollRecord, percent: number) => Promise<boolean>;
  onQuickMeterStep: (roll: RollRecord, nextMeters: number, label: string) => Promise<boolean>;
  onSaveMeasurement: (
    roll: RollRecord,
    payload: { meters: number; reason: string; workReference: string }
  ) => Promise<boolean>;
  onMoveRoll: (
    roll: RollRecord,
    destination: 'bodega' | 'machine',
    machineName?: string
  ) => Promise<boolean>;
  onSaveConfig: (
    roll: RollRecord,
    payload: {
      rollTag: string;
      materialFamily: RollFamily;
      standardLengthM: number | null;
      clearStandardLength: boolean;
      locationCode: string;
      notes: string;
      reason: string;
    }
  ) => Promise<boolean>;
  onReplaceRoll: (roll: RollRecord) => Promise<boolean>;
  historyRows: RollLogRecord[];
  historyLoading: boolean;
  historyError: string;
  onReloadHistory: (roll: RollRecord) => void;
  onAutoGenerateTag: (materialName: string) => string;
};

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

function useInspectorViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth <= 767) return 'mobile';
    if (window.innerWidth <= 1149) return 'tablet';
    return 'desktop';
  });

  useEffect(() => {
    const update = () => {
      if (window.innerWidth <= 767) setMode('mobile');
      else if (window.innerWidth <= 1149) setMode('tablet');
      else setMode('desktop');
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return mode;
}

function useIsSuiteDarkTheme(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const readTheme = () => {
      const workApp = document.querySelector('.work-app');
      const isDark =
        Boolean(workApp?.classList.contains('theme-dark')) ||
        workApp?.getAttribute('data-theme') === 'dark' ||
        document.documentElement.getAttribute('data-vc-theme') === 'dark' ||
        document.body.getAttribute('data-vc-theme') === 'dark';
      setDark(isDark);
    };
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-vc-theme', 'data-theme', 'class'] });
    const workApp = document.querySelector('.work-app');
    if (workApp) {
      observer.observe(workApp, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    }
    return () => observer.disconnect();
  }, []);

  return dark;
}

const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat('es-EC', { maximumFractionDigits: digits }).format(value);

const QUICK_PERCENT_STEPS = [100, 75, 50, 25, 10, 0];
const NOMINAL_PRESETS = [30, 50, 100, 200];
const SLIDER_COMMIT_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function RollInspectorPanel({
  roll,
  open,
  activeTab,
  onTabChange,
  onClose,
  canEdit,
  busy,
  isCatalogLinked,
  branchName,
  availableMachines,
  locations,
  warehouseReplacements,
  onQuickPercent,
  onQuickMeterStep,
  onSaveMeasurement,
  onMoveRoll,
  onSaveConfig,
  onReplaceRoll,
  historyRows,
  historyLoading,
  historyError,
  onReloadHistory,
  onAutoGenerateTag,
}: RollInspectorPanelProps) {
  const viewportMode = useInspectorViewportMode();
  const isDarkTheme = useIsSuiteDarkTheme();

  // Machine move draft
  const [selectedMachine, setSelectedMachine] = useState('');
  const [customMachine, setCustomMachine] = useState('');

  // Config draft (for update_inventory_roll_config RPC)
  const [configTag, setConfigTag] = useState('');
  const [configFamily, setConfigFamily] = useState<RollFamily>('lona');
  const [configNominal, setConfigNominal] = useState('');
  const [configLocation, setConfigLocation] = useState('MAIN');
  const [configNotes, setConfigNotes] = useState('');
  const [configReason, setConfigReason] = useState('');

  // Calibration & Measurement drafts
  const [calibrationMode, setCalibrationMode] = useState<'exact' | 'quick'>('exact');
  const [exactMeters, setExactMeters] = useState('');
  const [exactReason, setExactReason] = useState('Medición física en taller');
  const [exactReference, setExactReference] = useState('');
  const [quickSliderPct, setQuickSliderPct] = useState<number | null>(null);

  // Swap confirmation
  const [confirmSwapOpen, setConfirmSwapOpen] = useState(false);

  // Sync drafts whenever the inspected roll changes or reloads
  useEffect(() => {
    if (!roll) return;
    const baseMetrics = computeRollMetrics(roll);
    const inferredFamily = inferRollFamily(roll.material_family, roll.material_name);
    setSelectedMachine(roll.machine_name || availableMachines[0] || '');
    setCustomMachine('');
    setConfigTag(roll.roll_tag || '');
    setConfigFamily(inferredFamily);
    setConfigNominal(roll.standard_length_m !== null && roll.standard_length_m !== undefined ? String(roll.standard_length_m) : '');
    setConfigLocation(roll.location_code || 'MAIN');
    setConfigNotes(roll.notes || '');
    setConfigReason('');

    setExactMeters(String(baseMetrics.remainingM));
    setExactReason(roll.remaining_is_estimate ? 'Confirmación física tras saldo estimado' : 'Medición física en taller');
    setExactReference('');
    setQuickSliderPct(null);
    setConfirmSwapOpen(false);
  }, [roll?.id, roll?.updated_at, roll?.remaining_m, roll?.standard_length_m, roll?.location_code, roll?.roll_tag, roll?.notes, roll?.material_family, roll?.machine_name]);

  // Escape closes sticky desktop inspector
  useEffect(() => {
    if (!open || viewportMode !== 'desktop') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, viewportMode, onClose]);

  const metrics = useMemo(() => {
    if (!roll) return null;
    return computeRollMetrics(roll);
  }, [roll]);

  const locationOptions: LocationOption[] = useMemo(() => {
    const map = new Map<string, LocationOption>();
    for (const loc of locations) {
      map.set(loc.code, loc);
    }
    if (roll?.location_code && !map.has(roll.location_code)) {
      map.set(roll.location_code, { code: roll.location_code, name: `${roll.location_code} (actual)` });
    }
    if (!map.has('MAIN')) {
      map.set('MAIN', { code: 'MAIN', name: 'Bodega principal' });
    }
    return [...map.values()];
  }, [locations, roll?.location_code]);

  const machineChoices = useMemo(() => {
    const set = new Set<string>(availableMachines.filter(Boolean));
    if (roll?.machine_name) set.add(roll.machine_name);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [availableMachines, roll?.machine_name]);

  if (!open || !roll || !metrics) return null;

  const familyMeta = resolveRollFamilyMeta(configFamily || roll.material_family, roll.material_name);
  const previewPercent =
    calibrationMode === 'quick' && activeTab === 'calibrate' && quickSliderPct !== null
      ? quickSliderPct
      : metrics.percent;
  const previewMeters =
    calibrationMode === 'quick' &&
    activeTab === 'calibrate' &&
    quickSliderPct !== null &&
    metrics.nominalM !== null
      ? computeMetersForPercent(metrics.nominalM, quickSliderPct) ?? metrics.remainingM
      : activeTab === 'calibrate' && calibrationMode === 'exact' && exactMeters.trim() !== '' && Number.isFinite(Number(exactMeters)) && Number(exactMeters) >= 0
        ? roundMetric(Number(exactMeters), 3)
        : metrics.remainingM;
  const previewAreaM2 =
    metrics.widthCm !== null ? roundMetric((metrics.widthCm / 100) * previewMeters, 2) : null;
  const previewPctComputed =
    metrics.nominalM !== null
      ? Math.max(0, Math.min(100, roundMetric((previewMeters / metrics.nominalM) * 100, 1)))
      : previewPercent;

  const tier = resolveRollHealthTier({
    status: roll.status,
    remainingM: previewMeters,
    percent: previewPctComputed,
  });
  const healthLabel = resolveRollHealthLabel(tier, roll.roll_state);

  const parsedNominal = configNominal.trim() ? Number(configNominal) : null;
  const nominalInvalid =
    parsedNominal !== null &&
    (!Number.isFinite(parsedNominal) || parsedNominal <= 0 || parsedNominal < metrics.remainingM);

  const configHasChanges =
    configTag.trim() !== String(roll.roll_tag || '').trim() ||
    configFamily !== inferRollFamily(roll.material_family, roll.material_name) ||
    (parsedNominal ?? null) !== (roll.standard_length_m !== null ? Number(roll.standard_length_m) : null) ||
    configLocation !== (roll.location_code || 'MAIN') ||
    configNotes.trim() !== String(roll.notes || '').trim();

  const exactNum = Number(exactMeters);
  const exactDelta = Number.isFinite(exactNum) ? roundMetric(exactNum - metrics.remainingM, 3) : null;
  const exactValid =
    Number.isFinite(exactNum) &&
    exactNum >= 0 &&
    (metrics.nominalM === null || exactNum <= metrics.nominalM) &&
    exactReason.trim().length > 0;

  const incomingReplacement = warehouseReplacements[0] || null;
  const incomingMetrics = incomingReplacement ? computeRollMetrics(incomingReplacement) : null;

  const handleMoveSubmit = async (destination: 'bodega' | 'machine') => {
    const resolvedMachine =
      selectedMachine === '__custom__' ? customMachine.trim() : selectedMachine.trim();
    if (destination === 'machine' && !resolvedMachine) return;
    await onMoveRoll(roll, destination, resolvedMachine);
  };

  const handleConfigSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || busy || nominalInvalid || !configHasChanges) return;
    const autoReason =
      configReason.trim() ||
      buildRollConfigAuditReason(
        {
          roll_tag: roll.roll_tag,
          material_family: inferRollFamily(roll.material_family, roll.material_name),
          standard_length_m: roll.standard_length_m,
          location_code: roll.location_code,
          notes: roll.notes,
        },
        {
          roll_tag: configTag,
          material_family: configFamily,
          standard_length_m: parsedNominal,
          location_code: configLocation,
          notes: configNotes,
        }
      );

    await onSaveConfig(roll, {
      rollTag: configTag.trim(),
      materialFamily: configFamily,
      standardLengthM: parsedNominal,
      clearStandardLength: parsedNominal === null && roll.standard_length_m !== null,
      locationCode: configLocation,
      notes: configNotes.trim(),
      reason: autoReason,
    });
  };

  const handleMeasurementSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || busy || !exactValid) return;
    const ok = await onSaveMeasurement(roll, {
      meters: roundMetric(exactNum, 3),
      reason: exactReason.trim(),
      workReference: exactReference.trim(),
    });
    if (ok) {
      setExactReference('');
    }
  };

  const inspectorBody = (
    <div className="roll-inspector__inner">
      {/* Live spool + numeric summary header */}
      <div className="roll-inspector__hero">
        <RollSpoolPreview
          materialName={roll.material_name}
          materialFamily={configFamily}
          remainingM={previewMeters}
          standardLengthM={metrics.nominalM}
          percent={previewPctComputed}
          widthCm={metrics.widthCm}
          isActiveOnMachine={roll.roll_state === 'machine'}
          status={previewMeters <= 0 ? 'agotado' : roll.status}
          size="featured"
          showWidthBar
        />

        <div className="roll-inspector__hero-copy">
          <div className="roll-inspector__badges">
            <span className={`roll-book__location ${roll.roll_state}`}>
              <i />
              {roll.roll_state === 'machine'
                ? `En máquina: ${roll.machine_name || 'Plotter'}`
                : `En bodega · ${roll.location_code}`}
            </span>
            <span className={`roll-book__status is-tier-${tier}`}>{healthLabel}</span>
            <span className={`roll-book__confidence${roll.remaining_is_estimate ? ' is-estimate' : ''}`}>
              {roll.remaining_is_estimate ? 'Saldo estimado' : 'Saldo medido'}
            </span>
            {!isCatalogLinked && (
              <span className="roll-inspector__unlinked-pill" title="Esta variante aún no pertenece al grupo principal de rollos">
                Sin vincular al grupo
              </span>
            )}
          </div>

          <div className="roll-inspector__hero-numbers">
            <div className="roll-inspector__stat-box">
              <small>Metros</small>
              <strong>
                <RollLiveMetric value={previewMeters} decimals={3} minDecimals={1} suffix=" m" willChange />
              </strong>
            </div>
            <div className="roll-inspector__stat-box">
              <small>Nivel</small>
              <strong>
                {previewPctComputed !== null ? (
                  <RollLiveMetric value={previewPctComputed} decimals={1} suffix="%" willChange />
                ) : (
                  'Sin nominal'
                )}
              </strong>
            </div>
            <div className="roll-inspector__stat-box">
              <small>Área útil</small>
              <strong>
                {previewAreaM2 !== null ? (
                  <RollLiveMetric value={previewAreaM2} decimals={2} suffix=" m²" willChange />
                ) : (
                  '—'
                )}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* 3 ergonomic tabs */}
      <Tabs
        ariaLabel="Secciones del inspector de rollo"
        value={activeTab}
        onValueChange={(next) => onTabChange(next as RollInspectorTab)}
        items={[
          {
            value: 'config',
            label: (
              <span className="roll-inspector__tab-label">
                <Settings2 size={14} aria-hidden="true" /> Configuración
              </span>
            ),
            content: (
              <div className="roll-inspector__pane">
                {/* Technical immutable spec strip */}
                <div className="roll-inspector__spec-card">
                  <div className="roll-inspector__spec-grid">
                    <div>
                      <small>Sucursal</small>
                      <b>{branchName}</b>
                    </div>
                    <div>
                      <small className="roll-inspector__locked-label">
                        <Lock size={11} aria-hidden="true" /> Ancho nominal
                      </small>
                      <b>{metrics.widthCm ? `${formatNumber(metrics.widthCm)} cm` : 'Sin definir'}</b>
                    </div>
                    <div>
                      <small>Último responsable</small>
                      <b>{roll.operator_name || 'Taller'}</b>
                    </div>
                    <div>
                      <small>Última medición</small>
                      <b>
                        {roll.last_measured_at
                          ? new Date(roll.last_measured_at).toLocaleString('es-EC', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : 'Sin registro'}
                      </b>
                    </div>
                  </div>
                  <p className="roll-inspector__spec-hint">
                    <Info size={13} aria-hidden="true" />
                    <span>
                      El ancho pertenece a la variante del catálogo para no mezclar saldos m² en POS y cotizador.
                    </span>
                  </p>
                </div>

                {/* Plotter / Bodega Operational Placement */}
                {canEdit && (
                  <div className="roll-inspector__block">
                    <div className="roll-inspector__block-head">
                      <b>
                        <Wrench size={14} aria-hidden="true" /> Puesto operativo (Plotter ↔ Bodega)
                      </b>
                      <small>{roll.roll_state === 'machine' ? `Actualmente en ${roll.machine_name}` : 'Actualmente almacenado'}</small>
                    </div>

                    <div className="roll-inspector__machine-assign">
                      <label className="roll-inspector__field">
                        <span>Plotter / Máquina de destino</span>
                        <select
                          value={selectedMachine}
                          onChange={(e) => setSelectedMachine(e.target.value)}
                          disabled={busy}
                        >
                          {machineChoices.map((machine) => (
                            <option key={machine} value={machine}>
                              {machine}
                            </option>
                          ))}
                          <option value="__custom__">+ Escribir otra máquina…</option>
                        </select>
                      </label>

                      {selectedMachine === '__custom__' && (
                        <label className="roll-inspector__field">
                          <span>Nombre del plotter o puesto</span>
                          <input
                            type="text"
                            value={customMachine}
                            onChange={(e) => setCustomMachine(e.target.value)}
                            placeholder="Ej. Plotter Mimaki 1.60m"
                            disabled={busy}
                          />
                        </label>
                      )}

                      <div className="roll-inspector__action-row">
                        <button
                          type="button"
                          className="roll-inspector__btn-primary"
                          disabled={
                            busy ||
                            (selectedMachine === '__custom__' ? !customMachine.trim() : !selectedMachine.trim())
                          }
                          onClick={() => void handleMoveSubmit('machine')}
                        >
                          {busy ? <LoaderCircle size={14} className="roll-book__spin" /> : <Zap size={14} />}
                          {roll.roll_state === 'machine' ? 'Cambiar de plotter' : 'Montar en plotter'}
                        </button>

                        {roll.roll_state === 'machine' && (
                          <button
                            type="button"
                            className="roll-inspector__btn-outline"
                            disabled={busy}
                            onClick={() => void handleMoveSubmit('bodega')}
                          >
                            <Warehouse size={14} /> Devolver a bodega
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Editable Configuration Form (RPC update_inventory_roll_config) */}
                <form className="roll-inspector__block" onSubmit={handleConfigSubmit}>
                  <div className="roll-inspector__block-head">
                    <b>
                      <SlidersHorizontal size={14} aria-hidden="true" /> Ficha y configuración del rollo
                    </b>
                    <small>Se registra en trazabilidad</small>
                  </div>

                  <div className="roll-inspector__form-grid">
                    <label className="roll-inspector__field">
                      <span>Lote / Etiqueta</span>
                      <div className="roll-inspector__inline-group">
                        <input
                          type="text"
                          value={configTag}
                          onChange={(e) => setConfigTag(e.target.value)}
                          placeholder="Ej. ROL-VIN-2611-4021"
                          disabled={!canEdit || busy}
                          maxLength={120}
                        />
                        {canEdit && (
                          <button
                            type="button"
                            className="roll-inspector__icon-btn"
                            onClick={() => setConfigTag(onAutoGenerateTag(roll.material_name))}
                            title="Generar código de lote automático"
                            disabled={busy}
                          >
                            <Dices size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </label>

                    <label className="roll-inspector__field">
                      <span>Familia visual</span>
                      <select
                        value={configFamily}
                        onChange={(e) => setConfigFamily(e.target.value as RollFamily)}
                        disabled={!canEdit || busy}
                      >
                        <option value="lona">Lona (front / blackout / mesh)</option>
                        <option value="vinil">Vinil (adhesivo / micro / arenado)</option>
                        <option value="papel">Papel (sublimación / bond)</option>
                        <option value="otro">Otro sustrato</option>
                      </select>
                    </label>

                    <div className="roll-inspector__field">
                      <label htmlFor={`inspector-nominal-${roll.id}`}>Largo nominal (m)</label>
                      <div className="roll-inspector__inline-group">
                        <input
                          id={`inspector-nominal-${roll.id}`}
                          type="number"
                          min={metrics.remainingM > 0 ? metrics.remainingM : 0.01}
                          step="0.01"
                          value={configNominal}
                          onChange={(e) => setConfigNominal(e.target.value)}
                          placeholder="Sin largo fijo"
                          disabled={!canEdit || busy}
                        />
                        {canEdit && configNominal && (
                          <button
                            type="button"
                            className="roll-inspector__icon-btn"
                            onClick={() => setConfigNominal('')}
                            title="Limpiar largo nominal (modo metraje libre)"
                            disabled={busy}
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {canEdit && (
                        <div className="roll-inspector__preset-row" role="group" aria-label="Largos estándar">
                          {NOMINAL_PRESETS.map((len) => (
                            <button
                              key={len}
                              type="button"
                              className={Number(configNominal) === len ? 'is-active' : ''}
                              onClick={() => setConfigNominal(String(len))}
                              disabled={busy || len < metrics.remainingM}
                              title={len < metrics.remainingM ? `Menor al saldo actual (${formatNumber(metrics.remainingM, 2)} m)` : `Establecer ${len} m`}
                            >
                              {len} m
                            </button>
                          ))}
                        </div>
                      )}
                      {nominalInvalid && (
                        <small className="roll-inspector__field-error" role="alert">
                          Debe ser mayor a 0 y al menos {formatNumber(metrics.remainingM, 3)} m (saldo actual).
                        </small>
                      )}
                    </div>

                    <label className="roll-inspector__field">
                      <span>Ubicación de bodega</span>
                      <select
                        value={configLocation}
                        onChange={(e) => setConfigLocation(e.target.value)}
                        disabled={!canEdit || busy}
                      >
                        {locationOptions.map((loc) => (
                          <option key={loc.code} value={loc.code}>
                            {loc.code} · {loc.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="roll-inspector__field roll-inspector__field--full">
                      <span>Notas operativas del rollo</span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={configNotes}
                        onChange={(e) => setConfigNotes(e.target.value)}
                        placeholder="Observaciones de color, lote de proveedor o borde..."
                        disabled={!canEdit || busy}
                      />
                    </label>

                    {canEdit && configHasChanges && (
                      <label className="roll-inspector__field roll-inspector__field--full">
                        <span>Motivo del cambio (opcional)</span>
                        <input
                          type="text"
                          value={configReason}
                          onChange={(e) => setConfigReason(e.target.value)}
                          placeholder="Se generará resumen automático si lo dejas vacío"
                          disabled={busy}
                        />
                      </label>
                    )}
                  </div>

                  {canEdit && (
                    <button
                      type="submit"
                      className="roll-inspector__btn-primary roll-inspector__btn-full"
                      disabled={busy || nominalInvalid || !configHasChanges}
                    >
                      {busy ? <LoaderCircle size={14} className="roll-book__spin" /> : <CheckCircle2 size={14} />}
                      Guardar configuración
                    </button>
                  )}
                </form>

                {/* Compatible warehouse backup rolls */}
                <div className="roll-inspector__block">
                  <div className="roll-inspector__block-head">
                    <b>
                      <Warehouse size={14} aria-hidden="true" /> Repuestos compatibles en bodega
                    </b>
                    <small>{warehouseReplacements.length} disponible(s)</small>
                  </div>
                  {warehouseReplacements.length > 0 ? (
                    <ul className="roll-inspector__backup-list">
                      {warehouseReplacements.slice(0, 5).map((candidate) => {
                        const cMetrics = computeRollMetrics(candidate);
                        return (
                          <li key={candidate.id}>
                            <div>
                              <b>{candidate.roll_tag || 'Rollo sin lote'}</b>
                              <small>{candidate.location_code}</small>
                            </div>
                            <span>
                              {formatNumber(cMetrics.remainingM, 2)} m
                              {cMetrics.percent !== null ? ` (${formatNumber(cMetrics.percent, 0)}%)` : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="roll-inspector__empty-note">
                      <AlertTriangle size={14} aria-hidden="true" />
                      <span>No hay bobinas de repuesto de esta variante en {branchName}.</span>
                    </p>
                  )}
                </div>
              </div>
            ),
          },
          {
            value: 'calibrate',
            label: (
              <span className="roll-inspector__tab-label">
                <Ruler size={14} aria-hidden="true" /> Calibrar / Medir
              </span>
            ),
            content: (
              <div className="roll-inspector__pane">
                <div className="roll-inspector__mode-switch" role="group" aria-label="Modo de calibración">
                  <button
                    type="button"
                    className={calibrationMode === 'exact' ? 'is-active' : ''}
                    onClick={() => setCalibrationMode('exact')}
                    aria-pressed={calibrationMode === 'exact'}
                  >
                    <Ruler size={14} aria-hidden="true" /> Medición exacta (m)
                  </button>
                  <button
                    type="button"
                    className={calibrationMode === 'quick' ? 'is-active' : ''}
                    onClick={() => setCalibrationMode('quick')}
                    aria-pressed={calibrationMode === 'quick'}
                  >
                    <Zap size={14} aria-hidden="true" /> Ajuste visual rápido
                  </button>
                </div>

                {calibrationMode === 'exact' ? (
                  <form className="roll-inspector__block" onSubmit={handleMeasurementSubmit}>
                    <div className="roll-inspector__block-head">
                      <b>Confirmar saldo físico real</b>
                      <small>Marca el rollo como “Saldo medido”</small>
                    </div>
                    <p className="roll-inspector__hint">
                      Registra el metraje real verificado en taller. La diferencia con el saldo anterior se concilia en el historial del inventario.
                    </p>

                    <div className="roll-inspector__form-grid">
                      <label className="roll-inspector__field">
                        <span>Metros restantes reales</span>
                        <div className="roll-inspector__inline-group">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            {...(metrics.nominalM ? { max: metrics.nominalM } : {})}
                            value={exactMeters}
                            onChange={(e) => setExactMeters(e.target.value)}
                            disabled={!canEdit || busy}
                            required
                          />
                          <span className="roll-inspector__unit-badge">m</span>
                        </div>
                      </label>

                      <div className="roll-inspector__delta-box">
                        <small>Diferencia a conciliar</small>
                        <strong className={exactDelta !== null && exactDelta < 0 ? 'is-negative' : exactDelta !== null && exactDelta > 0 ? 'is-positive' : ''}>
                          {exactDelta === null ? '—' : `${exactDelta > 0 ? '+' : ''}${formatNumber(exactDelta, 3)} m`}
                        </strong>
                      </div>

                      <label className="roll-inspector__field roll-inspector__field--full">
                        <span>Motivo de medición</span>
                        <input
                          type="text"
                          value={exactReason}
                          onChange={(e) => setExactReason(e.target.value)}
                          placeholder="Medición física en taller"
                          disabled={!canEdit || busy}
                          required
                        />
                      </label>

                      <label className="roll-inspector__field roll-inspector__field--full">
                        <span>Orden o trabajo de referencia (opcional)</span>
                        <input
                          type="text"
                          value={exactReference}
                          onChange={(e) => setExactReference(e.target.value)}
                          placeholder="Ej. OT-2410 o Inventario semanal"
                          disabled={!canEdit || busy}
                        />
                      </label>
                    </div>

                    {canEdit && (
                      <button
                        type="submit"
                        className="roll-inspector__btn-primary roll-inspector__btn-full"
                        disabled={busy || !exactValid}
                      >
                        {busy ? <LoaderCircle size={14} className="roll-book__spin" /> : <Ruler size={14} />}
                        Confirmar saldo medido
                      </button>
                    )}
                  </form>
                ) : (
                  <div className="roll-inspector__block">
                    <div className="roll-inspector__block-head">
                      <b>Calibración táctil en 1 toque</b>
                      <small>{metrics.nominalM ? 'Porcentaje del largo nominal' : 'Pasos rápidos en metros'}</small>
                    </div>

                    {metrics.nominalM !== null ? (
                      <>
                        <div className="roll-inspector__quick-grid" role="group" aria-label="Porcentajes rápidos">
                          {QUICK_PERCENT_STEPS.map((pct) => {
                            const isCurrent = Math.round(previewPctComputed ?? -1) === pct;
                            return (
                              <button
                                key={pct}
                                type="button"
                                className={isCurrent ? 'is-selected' : ''}
                                disabled={!canEdit || busy}
                                onClick={() => {
                                  setQuickSliderPct(null);
                                  void onQuickPercent(roll, pct);
                                }}
                              >
                                {pct}%
                              </button>
                            );
                          })}
                        </div>

                        <label className="roll-inspector__slider-wrap">
                          <span>
                            Deslizar nivel visual
                            <b>
                              {formatNumber(quickSliderPct ?? metrics.percent ?? 0, 0)}% ·{' '}
                              {formatNumber(
                                computeMetersForPercent(metrics.nominalM, quickSliderPct ?? metrics.percent ?? 0) ??
                                  metrics.remainingM,
                                2
                              )}{' '}
                              m
                            </b>
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            disabled={!canEdit || busy}
                            value={quickSliderPct ?? Math.round(metrics.percent ?? 0)}
                            onChange={(e) => setQuickSliderPct(Number(e.target.value))}
                            onPointerUp={() => {
                              if (quickSliderPct !== null) {
                                const target = quickSliderPct;
                                setQuickSliderPct(null);
                                if (!busy && Math.round(metrics.percent ?? -1) !== target) {
                                  void onQuickPercent(roll, target);
                                }
                              }
                            }}
                            onKeyUp={(e) => {
                              if (!SLIDER_COMMIT_KEYS.has(e.key)) return;
                              if (quickSliderPct !== null) {
                                const target = quickSliderPct;
                                setQuickSliderPct(null);
                                if (!busy && Math.round(metrics.percent ?? -1) !== target) {
                                  void onQuickPercent(roll, target);
                                }
                              }
                            }}
                            aria-label={`Ajustar porcentaje visual de ${roll.material_name}`}
                          />
                        </label>

                        {quickSliderPct !== null && canEdit && (
                          <button
                            type="button"
                            className="roll-inspector__btn-primary roll-inspector__btn-full"
                            disabled={busy}
                            onClick={() => {
                              const target = quickSliderPct;
                              setQuickSliderPct(null);
                              void onQuickPercent(roll, target);
                            }}
                          >
                            Aplicar {quickSliderPct}% ahora
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="roll-inspector__meter-steps">
                        <p className="roll-inspector__hint">
                          Este rollo no tiene largo nominal definido; usa pasos directos en metros o define su largo nominal en Configuración.
                        </p>
                        <div className="roll-inspector__quick-grid">
                          {[-5, -2, -1].map((delta) => {
                            const nextM = computeMeterStepTarget(metrics.remainingM, delta, null);
                            return (
                              <button
                                key={delta}
                                type="button"
                                disabled={!canEdit || busy || metrics.remainingM <= 0}
                                onClick={() => void onQuickMeterStep(roll, nextM, `Descuento rápido ${delta} m`)}
                              >
                                {delta} m
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            disabled={!canEdit || busy || metrics.remainingM <= 0}
                            onClick={() => void onQuickMeterStep(roll, 0, 'Rollo agotado en taller')}
                          >
                            Agotar (0 m)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ),
          },
          {
            value: 'traceability',
            label: (
              <span className="roll-inspector__tab-label">
                <History size={14} aria-hidden="true" /> Intercambio y logs
              </span>
            ),
            content: (
              <div className="roll-inspector__pane">
                {roll.roll_state === 'machine' && canEdit && (
                  <div className="roll-inspector__block">
                    <div className="roll-inspector__block-head">
                      <b>
                        <ArrowRightLeft size={14} aria-hidden="true" /> Intercambio atómico en máquina
                      </b>
                      <small>{warehouseReplacements.length} compatible(s)</small>
                    </div>

                    {incomingReplacement && incomingMetrics ? (
                      <div className="roll-inspector__swap-compare">
                        <div className="roll-inspector__swap-card is-outgoing">
                          <small>Sale de máquina → Bodega</small>
                          <b>{roll.roll_tag || 'Rollo actual'}</b>
                          <span>{formatNumber(metrics.remainingM, 2)} m</span>
                        </div>
                        <ArrowRightLeft size={16} className="roll-inspector__swap-arrow" aria-hidden="true" />
                        <div className="roll-inspector__swap-card is-incoming">
                          <small>Entra desde bodega → {roll.machine_name}</small>
                          <b>{incomingReplacement.roll_tag || 'Siguiente en bodega'}</b>
                          <span>
                            {formatNumber(incomingMetrics.remainingM, 2)} m
                            {incomingMetrics.percent !== null ? ` (${formatNumber(incomingMetrics.percent, 0)}%)` : ''}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="roll-inspector__empty-note">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>No hay otro rollo disponible en bodega para esta variante y sucursal.</span>
                      </p>
                    )}

                    {incomingReplacement && (
                      confirmSwapOpen ? (
                        <div className="roll-book__confirm-replace">
                          <span>
                            El rollo actual volverá a bodega y el lote {incomingReplacement.roll_tag || 'siguiente'} quedará montado en {roll.machine_name}. El stock total no cambia.
                          </span>
                          <div className="roll-inspector__action-row">
                            <button
                              type="button"
                              className="roll-inspector__btn-primary"
                              disabled={busy}
                              onClick={async () => {
                                const ok = await onReplaceRoll(roll);
                                if (ok) setConfirmSwapOpen(false);
                              }}
                            >
                              {busy ? 'Intercambiando…' : 'Confirmar intercambio'}
                            </button>
                            <button
                              type="button"
                              className="roll-inspector__btn-outline"
                              disabled={busy}
                              onClick={() => setConfirmSwapOpen(false)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="roll-inspector__btn-outline roll-inspector__btn-full"
                          disabled={busy}
                          onClick={() => setConfirmSwapOpen(true)}
                        >
                          <ArrowRightLeft size={14} /> Preparar intercambio de bobina
                        </button>
                      )
                    )}
                  </div>
                )}

                {/* Audit Timeline */}
                <div className="roll-inspector__block">
                  <div className="roll-inspector__block-head">
                    <b>
                      <Clock3 size={14} aria-hidden="true" /> Historial del rollo
                    </b>
                    <button
                      type="button"
                      className="roll-inspector__text-btn"
                      onClick={() => onReloadHistory(roll)}
                      disabled={historyLoading}
                    >
                      Actualizar
                    </button>
                  </div>

                  {historyLoading ? (
                    <p className="roll-book__history-state">
                      <LoaderCircle className="roll-book__spin" size={16} /> Cargando movimientos…
                    </p>
                  ) : historyError ? (
                    <div className="roll-book__history-state" role="alert">
                      <span>No se pudo cargar la trazabilidad.</span>
                      <button type="button" className="roll-inspector__btn-outline" onClick={() => onReloadHistory(roll)}>
                        Reintentar
                      </button>
                    </div>
                  ) : historyRows.length > 0 ? (
                    <ol className="roll-book__history-list roll-inspector__history-list">
                      {historyRows.map((row) => {
                        const title =
                          row.event_type === 'receive'
                            ? 'Recepción en bodega'
                            : row.event_type === 'transfer'
                              ? 'Movimiento / Carga'
                              : row.event_type === 'measurement'
                                ? 'Medición física'
                                : row.event_type === 'estimated_consumption'
                                  ? 'Consumo POS estimado'
                                  : row.event_type === 'config'
                                    ? 'Configuración actualizada'
                                    : 'Registro de inventario';

                        return (
                          <li key={row.id} className={`roll-book__history-item event-${row.event_type}`}>
                            <span className="roll-book__history-marker">
                              {row.event_type === 'receive' ? (
                                <Plus size={12} />
                              ) : row.event_type === 'transfer' ? (
                                <ArrowRightLeft size={12} />
                              ) : row.event_type === 'config' ? (
                                <Settings2 size={12} />
                              ) : (
                                <Ruler size={12} />
                              )}
                            </span>
                            <div className="roll-book__history-content">
                              <div className="roll-book__history-title-row">
                                <strong>{title}</strong>
                                <small>
                                  {new Date(row.recorded_at).toLocaleString('es-EC', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}
                                </small>
                              </div>
                              <p className="roll-book__history-reason">
                                {row.reason || row.notes || 'Movimiento registrado'}
                                {row.work_reference ? ` · Ref: ${row.work_reference}` : ''}
                              </p>
                              <div className="roll-book__history-meta-row">
                                {(row.previous_m !== null || row.new_m !== null) && (
                                  <span className="roll-book__history-values">
                                    {row.previous_m === null ? '—' : `${formatNumber(Number(row.previous_m), 3)} m`} →{' '}
                                    {row.new_m === null ? '—' : `${formatNumber(Number(row.new_m), 3)} m`}
                                  </span>
                                )}
                                <span className="roll-book__history-actor">
                                  <b>{row.operator_name || 'Taller'}</b>
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="roll-book__history-state">No hay movimientos registrados para este rollo.</p>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );

  if (viewportMode === 'mobile') {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
        direction="bottom"
        dismissible
      >
        <Drawer.Portal>
          <Drawer.Overlay className={`roll-inspector-drawer-overlay ${isDarkTheme ? 'theme-dark' : ''}`} />
          <Drawer.Content
            className={`roll-inspector-drawer vc-glass-blur ${isDarkTheme ? 'theme-dark' : ''}`}
            aria-label={`Inspector de ${roll.material_name}`}
          >
            <div className="roll-inspector-drawer__handle-wrap">
              <Drawer.Handle className="roll-inspector-drawer__handle" />
            </div>
            <div className="roll-inspector__head">
              <div className="roll-inspector__head-title">
                <span className="roll-inspector__eyebrow">
                  {familyMeta.shortTag} · {roll.roll_tag || 'Sin lote'}
                </span>
                <Drawer.Title className="roll-inspector__title">{roll.material_name}</Drawer.Title>
                <Drawer.Description className="roll-inspector__subtitle">
                  <MapPin size={12} aria-hidden="true" /> {branchName} · {roll.location_code}
                </Drawer.Description>
              </div>
              <button
                type="button"
                className="roll-inspector__close-btn"
                onClick={onClose}
                aria-label="Cerrar inspector de rollo"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="roll-inspector-drawer__scroll">{inspectorBody}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (viewportMode === 'tablet') {
    return (
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
        eyebrow={`${familyMeta.shortTag} · ${roll.roll_tag || 'Sin lote'}`}
        title={roll.material_name}
        description={`${branchName} · ${roll.location_code}`}
        icon={<Settings2 size={18} />}
        size="md"
        className="roll-inspector-sheet"
      >
        <div className="roll-inspector roll-inspector--sheet">{inspectorBody}</div>
      </Sheet>
    );
  }

  return (
    <aside
      className="roll-inspector roll-inspector--desktop vc-glass-blur"
      aria-label={`Inspector y configuración de ${roll.material_name}`}
    >
      <div className="roll-inspector__head">
        <div className="roll-inspector__head-title">
          <span className="roll-inspector__eyebrow">
            {familyMeta.shortTag} · {roll.roll_tag || 'Sin lote'}
          </span>
          <h3 className="roll-inspector__title">{roll.material_name}</h3>
          <p className="roll-inspector__subtitle">
            <MapPin size={12} aria-hidden="true" /> {branchName} · {roll.location_code}
          </p>
        </div>
        <button
          type="button"
          className="roll-inspector__close-btn"
          onClick={onClose}
          aria-label="Cerrar inspector de rollo"
          title="Cerrar inspector (Esc)"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="roll-inspector__scroll">{inspectorBody}</div>
    </aside>
  );
}
