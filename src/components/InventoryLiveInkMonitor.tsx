import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Droplet,
  Droplets,
  Layers,
  LayoutGrid,
  LoaderCircle,
  Plus,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './inventory-live-ink-monitor.css';

export type ActiveInk = {
  id: string;
  organization_id: string;
  branch_id: string;
  variant_id: string | null;
  location_code: string;
  machine_name: string;
  color_code: 'C' | 'M' | 'Y' | 'K' | 'LC' | 'LM' | 'W' | 'V' | 'FL' | 'OTRO';
  color_name: string;
  color_hex: string;
  ink_type: 'ecosolvente' | 'solvente' | 'sublimacion' | 'uv' | 'dtf' | 'acuosa' | 'otro';
  tank_capacity_ml: number;
  remaining_percent: number;
  status: 'en_uso' | 'bajo' | 'critico' | 'agotado';
  operator_name: string;
  notes: string;
  last_measured_at: string;
  created_at: string;
  updated_at: string;
};

type InventoryLiveInkMonitorProps = {
  organizationId: string;
  branches: Array<{ id: string; name: string }>;
  canEdit: boolean;
  onNotice?: (msg: string) => void;
  operatorDefaultName?: string;
};

export const CMYK_COLOR_CONFIG: Record<
  string,
  { name: string; hex: string; bgGradient: string; badgeBg: string; textDark?: boolean }
> = {
  C: {
    name: 'Cian',
    hex: '#00AEEF',
    bgGradient: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 60%, #0369a1 100%)',
    badgeBg: '#e0f2fe',
  },
  M: {
    name: 'Magenta',
    hex: '#EC008C',
    bgGradient: 'linear-gradient(180deg, #f43f5e 0%, #e11d48 60%, #9f1239 100%)',
    badgeBg: '#ffe4e6',
  },
  Y: {
    name: 'Amarillo',
    hex: '#FACC15',
    bgGradient: 'linear-gradient(180deg, #fef08a 0%, #facc15 60%, #ca8a04 100%)',
    badgeBg: '#fef9c3',
    textDark: true,
  },
  K: {
    name: 'Negro',
    hex: '#18181B',
    bgGradient: 'linear-gradient(180deg, #3f3f46 0%, #27272a 60%, #09090b 100%)',
    badgeBg: '#f4f4f5',
  },
  LC: {
    name: 'Light Cyan',
    hex: '#7dd3fc',
    bgGradient: 'linear-gradient(180deg, #bae6fd 0%, #7dd3fc 100%)',
    badgeBg: '#f0f9ff',
  },
  LM: {
    name: 'Light Magenta',
    hex: '#fda4af',
    bgGradient: 'linear-gradient(180deg, #fecdd3 0%, #fda4af 100%)',
    badgeBg: '#fff1f2',
  },
  W: {
    name: 'Blanco',
    hex: '#ffffff',
    bgGradient: 'linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%)',
    badgeBg: '#f1f5f9',
    textDark: true,
  },
};

export type ColorConfig = {
  name: string;
  hex: string;
  bgGradient: string;
  badgeBg: string;
  textDark?: boolean;
};

export function getColorConfig(code: string, fallbackName = '', fallbackHex = '#00AEEF'): ColorConfig {
  if (CMYK_COLOR_CONFIG[code]) return CMYK_COLOR_CONFIG[code];
  return {
    name: fallbackName || code,
    hex: fallbackHex,
    bgGradient: fallbackHex,
    badgeBg: '#f3f4f6',
    textDark: false,
  };
}

export function InventoryLiveInkMonitor({
  organizationId,
  branches,
  canEdit,
  onNotice,
  operatorDefaultName = '',
}: InventoryLiveInkMonitorProps) {
  const [inks, setInks] = useState<ActiveInk[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<string>('todas');
  const [colorFilter, setColorFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'machines' | 'grid'>('machines');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal de recarga individual
  const [refillTarget, setRefillTarget] = useState<ActiveInk | null>(null);
  const [consumeStockOnRefill, setConsumeStockOnRefill] = useState(true);

  // Modal de ajuste por lote de máquina
  const [batchMachine, setBatchMachine] = useState<string | null>(null);
  const [batchDraft, setBatchDraft] = useState<Record<string, number>>({});
  const [batchSaving, setBatchSaving] = useState(false);

  // Modal para agregar nuevo canal de tinta
  const [showAddModal, setShowAddModal] = useState(false);
  const [newInkForm, setNewInkForm] = useState({
    machineName: 'Plotter Gran Formato 3.20m',
    colorCode: 'C' as ActiveInk['color_code'],
    inkType: 'ecosolvente' as ActiveInk['ink_type'],
    capacityMl: '1000',
    initialPercent: '100',
    notes: '',
  });

  const loadInks = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_active_inks')
        .select('*')
        .eq('organization_id', organizationId)
        .order('machine_name', { ascending: true })
        .order('color_code', { ascending: true });

      if (error) {
        console.error('Error cargando tintas en vivo:', error);
      } else if (data) {
        setInks(data as ActiveInk[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInks();
  }, [organizationId]);

  // Actualizar porcentaje de un canal
  const updatePercent = async (ink: ActiveInk, newPercent: number) => {
    if (!canEdit || !supabase) return;
    setUpdatingId(ink.id);
    const clamped = Math.max(0, Math.min(100, Math.round(newPercent)));
    try {
      const { error } = await supabase.rpc('record_ink_daily_percent', {
        p_ink_id: ink.id,
        p_percent: clamped,
        p_operator: operatorDefaultName || ink.operator_name || 'Operario de taller',
        p_notes: `Ajuste en vivo: ${clamped}%`,
      });

      if (error) {
        onNotice?.(`Error al actualizar tinta: ${error.message}`);
      } else {
        const nextStatus =
          clamped === 0
            ? 'agotado'
            : clamped <= 15
            ? 'critico'
            : clamped <= 30
            ? 'bajo'
            : 'en_uso';

        setInks((prev) =>
          prev.map((i) =>
            i.id === ink.id
              ? {
                  ...i,
                  remaining_percent: clamped,
                  status: nextStatus,
                  last_measured_at: new Date().toISOString(),
                }
              : i
          )
        );
        onNotice?.(
          `Tinta ${ink.color_name} (${ink.machine_name}) actualizada al ${clamped}%.`
        );
      }
    } catch (err: any) {
      onNotice?.(`Fallo al guardar: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Recarga al 100% (Rellenar)
  const handleRefillInk = async () => {
    if (!refillTarget || !supabase) return;
    setUpdatingId(refillTarget.id);
    try {
      const { data, error } = await supabase.rpc('refill_active_ink', {
        p_ink_id: refillTarget.id,
        p_consume_warehouse_bottle: consumeStockOnRefill,
        p_operator: operatorDefaultName || 'Operario de taller',
        p_notes: 'Tanque rellenado al 100%',
      });

      if (error) {
        onNotice?.(`No se pudo recargar la tinta: ${error.message}`);
      } else {
        setInks((prev) =>
          prev.map((i) =>
            i.id === refillTarget.id
              ? {
                  ...i,
                  remaining_percent: 100,
                  status: 'en_uso',
                  last_measured_at: new Date().toISOString(),
                }
              : i
          )
        );
        const msg = consumeStockOnRefill && refillTarget.variant_id
          ? `¡Tanque de ${refillTarget.color_name} al 100%! Se descontó 1 botella del stock de bodega.`
          : `¡Tanque de ${refillTarget.color_name} al 100% en máquina!`;
        onNotice?.(msg);
        setRefillTarget(null);
      }
    } catch (err: any) {
      onNotice?.(`Error: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Abrir modal de ajuste rápido por máquina
  const openMachineBatchModal = (machineName: string) => {
    const machineInks = inks.filter((i) => i.machine_name === machineName);
    const draft: Record<string, number> = {};
    machineInks.forEach((i) => {
      draft[i.id] = Math.round(i.remaining_percent);
    });
    setBatchDraft(draft);
    setBatchMachine(machineName);
  };

  // Guardar ajuste por lote de máquina
  const handleSaveBatchMachine = async () => {
    if (!supabase || !batchMachine) return;
    setBatchSaving(true);
    try {
      const updates = Object.entries(batchDraft).map(([id, percent]) => ({
        id,
        percent,
      }));

      const { data, error } = await supabase.rpc('batch_record_machine_inks', {
        p_updates: updates,
        p_operator: operatorDefaultName || 'Operario de taller',
        p_notes: `Ajuste rápido de máquina: ${batchMachine}`,
      });

      if (error) {
        onNotice?.(`Error en ajuste por lote: ${error.message}`);
      } else {
        setInks((prev) =>
          prev.map((i) => {
            if (batchDraft[i.id] !== undefined) {
              const val = batchDraft[i.id];
              return {
                ...i,
                remaining_percent: val,
                status:
                  val === 0
                    ? 'agotado'
                    : val <= 15
                    ? 'critico'
                    : val <= 30
                    ? 'bajo'
                    : 'en_uso',
                last_measured_at: new Date().toISOString(),
              };
            }
            return i;
          })
        );
        onNotice?.(`¡Niveles CMYK de “${batchMachine}” actualizados correctamente!`);
        setBatchMachine(null);
      }
    } catch (err: any) {
      onNotice?.(`Error: ${err.message}`);
    } finally {
      setBatchSaving(false);
    }
  };

  // Crear nuevo canal de tinta
  const handleCreateInk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newInkForm.machineName.trim()) return;

    const branchId = branches[0]?.id || 'f499caf7-6286-4c6e-abd7-d79fa58c27d0';
    const cfg = getColorConfig(newInkForm.colorCode);

    try {
      const { data, error } = await supabase
        .from('inventory_active_inks')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          location_code: 'MAIN',
          machine_name: newInkForm.machineName.trim(),
          color_code: newInkForm.colorCode,
          color_name: cfg.name,
          color_hex: cfg.hex,
          ink_type: newInkForm.inkType,
          tank_capacity_ml: Number(newInkForm.capacityMl) || 1000,
          remaining_percent: Number(newInkForm.initialPercent) || 100,
          operator_name: operatorDefaultName || 'Taller',
          notes: newInkForm.notes.trim(),
          status: 'en_uso',
        })
        .select()
        .single();

      if (error) {
        onNotice?.(`Error al crear canal de tinta: ${error.message}`);
      } else if (data) {
        setInks((prev) => [...prev, data as ActiveInk]);
        setShowAddModal(false);
        onNotice?.(
          `Canal ${cfg.name} (${newInkForm.machineName}) registrado con éxito.`
        );
      }
    } catch (err: any) {
      onNotice?.(`Error: ${err.message}`);
    }
  };

  // Listado de máquinas únicas
  const machineList = useMemo(() => {
    return Array.from(new Set(inks.map((i) => i.machine_name))).sort();
  }, [inks]);

  // Filtrado de tintas
  const filteredInks = useMemo(() => {
    return inks.filter((i) => {
      if (selectedMachine !== 'todas' && i.machine_name !== selectedMachine) return false;
      if (colorFilter === 'peligro' && i.remaining_percent > 30) return false;
      if (colorFilter !== 'todos' && colorFilter !== 'peligro' && i.color_code !== colorFilter)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesMachine = i.machine_name.toLowerCase().includes(q);
        const matchesColor = i.color_name.toLowerCase().includes(q);
        const matchesCode = i.color_code.toLowerCase().includes(q);
        const matchesType = i.ink_type.toLowerCase().includes(q);
        if (!matchesMachine && !matchesColor && !matchesCode && !matchesType) return false;
      }
      return true;
    });
  }, [inks, selectedMachine, colorFilter, search]);

  // Agrupadas por máquina para la vista por estaciones
  const groupedByMachine = useMemo(() => {
    const map = new Map<string, ActiveInk[]>();
    filteredInks.forEach((ink) => {
      const list = map.get(ink.machine_name) || [];
      list.push(ink);
      map.set(ink.machine_name, list);
    });

    // Ordenar los canales CMYK dentro de cada máquina en orden estándar: C, M, Y, K
    const order = ['C', 'M', 'Y', 'K', 'LC', 'LM', 'W', 'V', 'FL', 'OTRO'];
    map.forEach((list, key) => {
      list.sort((a, b) => order.indexOf(a.color_code) - order.indexOf(b.color_code));
    });

    return Array.from(map.entries());
  }, [filteredInks]);

  // Conteo de tintas críticas (<= 20%)
  const criticalCount = useMemo(
    () => inks.filter((i) => i.remaining_percent <= 20).length,
    [inks]
  );

  const getMlEstimate = (ink: ActiveInk) => {
    const ml = (ink.tank_capacity_ml * ink.remaining_percent) / 100;
    return Math.round(ml);
  };

  const getInkStatusClass = (pct: number) => {
    if (pct <= 15) return 'is-critical';
    if (pct <= 30) return 'is-warning';
    return 'is-healthy';
  };

  return (
    <div className="vc-live-inks-container">
      {/* Cabecera Principal */}
      <div className="vc-live-inks-header">
        <div className="vc-live-inks-title-block">
          <div className="vc-live-badge-live">
            <span className="vc-pulse-dot" /> EN VIVO EN MÁQUINA
          </div>
          <h2>Control Diario de Tintas CMYK</h2>
          <p>
            Monitorea en tiempo real los tanques de <b>Cian (C)</b>, <b>Magenta (M)</b>,{' '}
            <b>Amarillo (Y)</b> y <b>Negro (K)</b> de cada plotter. Ajusta los niveles con un
            solo toque al terminar el trabajo o la jornada.
          </p>
        </div>

        <div className="vc-live-inks-actions">
          {criticalCount > 0 && (
            <button
              type="button"
              className="vc-live-alert-pill"
              onClick={() => setColorFilter('peligro')}
              title="Filtrar tintas críticas"
            >
              <AlertTriangle size={15} />
              <span>
                <b>{criticalCount}</b> {criticalCount === 1 ? 'tinta por agotarse' : 'tintas por agotarse'}
              </span>
            </button>
          )}

          <div className="vc-live-view-toggle" role="group" aria-label="Modo de vista">
            <button
              type="button"
              className={viewMode === 'machines' ? 'is-active' : ''}
              onClick={() => setViewMode('machines')}
              title="Vista de Estaciones por Máquina"
            >
              <Printer size={15} /> Estaciones
            </button>
            <button
              type="button"
              className={viewMode === 'grid' ? 'is-active' : ''}
              onClick={() => setViewMode('grid')}
              title="Vista Cuadrícula Individual"
            >
              <LayoutGrid size={15} /> Cuadrícula
            </button>
          </div>

          <button
            type="button"
            className="button button-outline"
            onClick={loadInks}
            disabled={loading}
            title="Refrescar niveles en vivo"
          >
            <RefreshCw size={14} className={loading ? 'vc-spin' : ''} /> Refrescar
          </button>

          {canEdit && (
            <button
              type="button"
              className="button button-dark"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={15} /> Añadir tinta a máquina
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="vc-live-inks-filters">
        <div className="vc-live-filter-chips" role="group" aria-label="Filtrar por máquina o color">
          {/* Selector de Máquina */}
          <button
            type="button"
            className={selectedMachine === 'todas' ? 'is-active' : ''}
            onClick={() => setSelectedMachine('todas')}
          >
            Todas las máquinas ({machineList.length})
          </button>
          {machineList.map((m) => (
            <button
              key={m}
              type="button"
              className={selectedMachine === m ? 'is-active' : ''}
              onClick={() => setSelectedMachine(m)}
            >
              {m}
            </button>
          ))}

          {/* Separador */}
          <span className="vc-filter-divider" />

          {/* Filtros rápidos por Canal CMYK */}
          <button
            type="button"
            className={`chip-cmyk chip-c ${colorFilter === 'C' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'C' ? 'todos' : 'C')}
          >
            <span className="cmyk-dot dot-c" /> Cian (C)
          </button>
          <button
            type="button"
            className={`chip-cmyk chip-m ${colorFilter === 'M' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'M' ? 'todos' : 'M')}
          >
            <span className="cmyk-dot dot-m" /> Magenta (M)
          </button>
          <button
            type="button"
            className={`chip-cmyk chip-y ${colorFilter === 'Y' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'Y' ? 'todos' : 'Y')}
          >
            <span className="cmyk-dot dot-y" /> Amarillo (Y)
          </button>
          <button
            type="button"
            className={`chip-cmyk chip-k ${colorFilter === 'K' ? 'is-active' : ''}`}
            onClick={() => setColorFilter(colorFilter === 'K' ? 'todos' : 'K')}
          >
            <span className="cmyk-dot dot-k" /> Negro (K)
          </button>

          {criticalCount > 0 && (
            <button
              type="button"
              className={`chip-danger ${colorFilter === 'peligro' ? 'is-active' : ''}`}
              onClick={() => setColorFilter(colorFilter === 'peligro' ? 'todos' : 'peligro')}
            >
              ⚠️ Por agotarse ({criticalCount})
            </button>
          )}
        </div>

        <div className="vc-live-search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Buscar por máquina, color, tinta…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Contenido Principal: Estaciones o Cuadrícula */}
      {loading && inks.length === 0 ? (
        <div className="vc-live-loading">
          <LoaderCircle size={28} className="vc-spin" />
          <p>Conectando con plotters y sensores de tinta…</p>
        </div>
      ) : filteredInks.length === 0 ? (
        <div className="vc-live-empty">
          <Droplet size={36} />
          <h3>No se encontraron registros de tinta con este filtro</h3>
          <p>Modifica los filtros seleccionados o añade canales de tinta a la máquina.</p>
        </div>
      ) : viewMode === 'machines' ? (
        /* VISTA DE ESTACIONES POR MÁQUINA */
        <div className="vc-machine-stations-grid">
          {groupedByMachine.map(([machineName, machineInks]) => {
            const hasCritical = machineInks.some((i) => i.remaining_percent <= 15);
            const hasWarning = machineInks.some((i) => i.remaining_percent <= 30);
            const machineType = machineInks[0]?.ink_type || 'ecosolvente';

            return (
              <section
                key={machineName}
                className={`vc-machine-station-card ${
                  hasCritical ? 'has-critical-ink' : hasWarning ? 'has-warning-ink' : ''
                }`}
              >
                <header className="vc-station-header">
                  <div className="vc-station-title-group">
                    <span className="vc-station-icon">
                      <Printer size={18} />
                    </span>
                    <div>
                      <h3>{machineName}</h3>
                      <div className="vc-station-tags">
                        <span className="vc-ink-type-tag">{machineType.toUpperCase()}</span>
                        <span className="vc-station-channel-count">
                          {machineInks.length} canales activos
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="vc-station-actions">
                    {canEdit && (
                      <button
                        type="button"
                        className="button button-outline button-small"
                        onClick={() => openMachineBatchModal(machineName)}
                        title="Ajustar todos los canales CMYK juntos"
                      >
                        <SlidersHorizontal size={13} /> Ajustar CMYK
                      </button>
                    )}
                  </div>
                </header>

                {/* Bahía de Tanques CMYK de la Máquina */}
                <div className="vc-station-cmyk-bay">
                  {machineInks.map((ink) => {
                    const isBusy = updatingId === ink.id;
                    const statusClass = getInkStatusClass(ink.remaining_percent);
                    const estMl = getMlEstimate(ink);
                    const colorCfg = getColorConfig(ink.color_code, ink.color_name, ink.color_hex);

                    return (
                      <div
                        key={ink.id}
                        className={`vc-bay-cartridge ${statusClass} is-color-${ink.color_code.toLowerCase()}`}
                      >
                        {/* Header de Tanque */}
                        <div className="vc-cartridge-header">
                          <span
                            className="vc-cmyk-channel-badge"
                            style={{
                              backgroundColor: colorCfg.badgeBg,
                              color: colorCfg.textDark ? '#713f12' : colorCfg.hex,
                              borderColor: colorCfg.hex,
                            }}
                          >
                            <b>{ink.color_code}</b>
                          </span>
                          <span className="vc-cartridge-color-name">{colorCfg.name}</span>
                        </div>

                        {/* Visualizador de Tanque / Fluido */}
                        <div className="vc-tank-visual-wrap">
                          <div className="vc-tank-cylinder">
                            {/* Líneas de graduación */}
                            <div className="vc-tank-marks">
                              <span className="mark-100">100%</span>
                              <span className="mark-75">75%</span>
                              <span className="mark-50">50%</span>
                              <span className="mark-25">25%</span>
                            </div>

                            {/* Líquido coloreado */}
                            <div
                              className="vc-tank-fluid"
                              style={{
                                height: `${Math.max(6, ink.remaining_percent)}%`,
                                background: colorCfg.bgGradient,
                              }}
                            >
                              <div className="vc-tank-liquid-wave" />
                            </div>

                            {/* Brillo de vidrio */}
                            <div className="vc-tank-glass-glare" />
                          </div>

                          {/* Métrica de Nivel */}
                          <div className="vc-tank-metrics">
                            <div className="vc-tank-pct">
                              <b>{Math.round(ink.remaining_percent)}</b>
                              <span>%</span>
                            </div>
                            <div className="vc-tank-ml">
                              ~{estMl} ml <span>/ {ink.tank_capacity_ml} ml</span>
                            </div>
                            {ink.remaining_percent <= 15 && (
                              <span className="vc-tank-critical-pill">¡CRÍTICO!</span>
                            )}
                          </div>
                        </div>

                        {/* Botones rápidos de ajuste */}
                        {canEdit && (
                          <div className="vc-cartridge-quick-touch">
                            <div className="vc-touch-btn-row">
                              {[100, 75, 50, 25, 10, 0].map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  className={
                                    Math.round(ink.remaining_percent) === val ? 'is-selected' : ''
                                  }
                                  onClick={() => updatePercent(ink, val)}
                                  disabled={isBusy}
                                >
                                  {val}%
                                </button>
                              ))}
                            </div>

                            {/* Slider suave */}
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={ink.remaining_percent}
                              disabled={isBusy}
                              onChange={(e) => updatePercent(ink, Number(e.target.value))}
                              aria-label={`Nivel de tinta ${ink.color_name} en ${ink.machine_name}`}
                            />
                          </div>
                        )}

                        {/* Pie de Tanque: Rellenar */}
                        <div className="vc-cartridge-footer">
                          <small>
                            {new Date(ink.last_measured_at).toLocaleTimeString('es-EC', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                          {canEdit && (
                            <button
                              type="button"
                              className="vc-btn-refill"
                              onClick={() => setRefillTarget(ink)}
                              disabled={isBusy}
                              title="Recargar tanque al 100%"
                            >
                              <Zap size={13} /> Rellenar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* VISTA CUADRÍCULA INDIVIDUAL */
        <div className="vc-live-inks-grid">
          {filteredInks.map((ink) => {
            const isBusy = updatingId === ink.id;
            const statusClass = getInkStatusClass(ink.remaining_percent);
            const estMl = getMlEstimate(ink);
            const colorCfg = getColorConfig(ink.color_code, ink.color_name, ink.color_hex);

            return (
              <article key={ink.id} className={`vc-ink-card ${statusClass}`}>
                <div className="vc-ink-card-head">
                  <div>
                    <span className="vc-ink-machine-badge">{ink.machine_name}</span>
                    <div className="vc-ink-title-row">
                      <span
                        className="vc-cmyk-channel-badge large"
                        style={{
                          backgroundColor: colorCfg.badgeBg,
                          color: colorCfg.textDark ? '#713f12' : colorCfg.hex,
                          borderColor: colorCfg.hex,
                        }}
                      >
                        {ink.color_code}
                      </span>
                      <h3>{colorCfg.name}</h3>
                    </div>
                    <span className="vc-ink-type-tag">{ink.ink_type.toUpperCase()}</span>
                  </div>
                  <div className="vc-ink-icon-status">
                    <Droplet
                      size={20}
                      style={{ color: colorCfg.hex, fill: colorCfg.hex, fillOpacity: 0.2 }}
                    />
                  </div>
                </div>

                {/* Visualizador de Tanque */}
                <div className="vc-tank-visual-wrap-grid">
                  <div className="vc-tank-cylinder">
                    <div
                      className="vc-tank-fluid"
                      style={{
                        height: `${Math.max(6, ink.remaining_percent)}%`,
                        background: colorCfg.bgGradient,
                      }}
                    />
                    <div className="vc-tank-glass-glare" />
                  </div>

                  <div className="vc-tank-metrics">
                    <div className="vc-tank-pct">
                      <b>{Math.round(ink.remaining_percent)}</b>
                      <span>%</span>
                    </div>
                    <div className="vc-tank-ml">
                      ~{estMl} ml <span>/ {ink.tank_capacity_ml} ml</span>
                    </div>
                    {ink.remaining_percent <= 15 && (
                      <span className="vc-tank-critical-pill">¡CRÍTICO! Rellenar</span>
                    )}
                  </div>
                </div>

                {/* Controles táctiles */}
                {canEdit && (
                  <div className="vc-cartridge-quick-touch">
                    <div className="vc-touch-btn-row">
                      {[100, 75, 50, 25, 10, 0].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className={Math.round(ink.remaining_percent) === val ? 'is-selected' : ''}
                          onClick={() => updatePercent(ink, val)}
                          disabled={isBusy}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={ink.remaining_percent}
                      disabled={isBusy}
                      onChange={(e) => updatePercent(ink, Number(e.target.value))}
                    />
                  </div>
                )}

                <div className="vc-cartridge-footer">
                  <small>
                    Medido:{' '}
                    {new Date(ink.last_measured_at).toLocaleTimeString('es-EC', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {ink.operator_name || 'Taller'}
                  </small>
                  {canEdit && (
                    <button
                      type="button"
                      className="vc-btn-refill"
                      onClick={() => setRefillTarget(ink)}
                      disabled={isBusy}
                    >
                      <Zap size={13} /> Rellenar al 100%
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* MODAL: Rellenar Tanque Individual */}
      {refillTarget && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal">
            <header>
              <Zap size={22} className="vc-modal-icon-zap" />
              <div>
                <h3>Recargar Tanque de Tinta al 100%</h3>
                <p>
                  {refillTarget.machine_name} · Tinta {refillTarget.color_name} (
                  {refillTarget.color_code})
                </p>
              </div>
            </header>

            <div className="vc-live-modal-body">
              <div className="vc-refill-summary-box">
                <div
                  className="vc-cmyk-dot-large"
                  style={{
                    backgroundColor:
                      CMYK_COLOR_CONFIG[refillTarget.color_code]?.hex || refillTarget.color_hex,
                  }}
                />
                <div>
                  <h4>
                    Canal {refillTarget.color_name} ({refillTarget.color_code})
                  </h4>
                  <p>
                    Nivel actual: <b>{Math.round(refillTarget.remaining_percent)}%</b> (~
                    {getMlEstimate(refillTarget)} ml) ➔ Se reiniciará al <b>100%</b> (
                    {refillTarget.tank_capacity_ml} ml).
                  </p>
                </div>
              </div>

              <label className="vc-live-checkbox-card">
                <input
                  type="checkbox"
                  checked={consumeStockOnRefill}
                  onChange={(e) => setConsumeStockOnRefill(e.target.checked)}
                />
                <div>
                  <b>Descontar 1 botella cerrada (1 Litro) del inventario de bodega</b>
                  <small>
                    Registra automáticamente una salida de bodega por consumo y actualiza las
                    existencias físicas.
                  </small>
                </div>
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setRefillTarget(null)}
                disabled={Boolean(updatingId)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                onClick={handleRefillInk}
                disabled={Boolean(updatingId)}
              >
                {updatingId ? 'Guardando…' : 'Confirmar recarga al 100%'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: Ajuste Rápido por Lote de Máquina */}
      {batchMachine && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal vc-batch-modal">
            <header>
              <SlidersHorizontal size={22} className="vc-modal-icon-zap" />
              <div>
                <h3>Ajustar Canales CMYK en Máquina</h3>
                <p>{batchMachine}</p>
              </div>
            </header>

            <div className="vc-live-modal-body vc-batch-modal-body">
              <p className="vc-batch-intro">
                Ajusta los niveles de todos los colores montados al finalizar la jornada o tirada:
              </p>

              <div className="vc-batch-channels-list">
                {inks
                  .filter((i) => i.machine_name === batchMachine)
                  .map((ink) => {
                    const currentVal = batchDraft[ink.id] ?? Math.round(ink.remaining_percent);
                    const colorCfg = getColorConfig(ink.color_code, ink.color_name, ink.color_hex);

                    return (
                      <div key={ink.id} className="vc-batch-channel-row">
                        <div className="vc-batch-col-badge">
                          <span
                            className="vc-cmyk-channel-badge"
                            style={{
                              backgroundColor: colorCfg.badgeBg,
                              color: colorCfg.textDark ? '#713f12' : colorCfg.hex,
                              borderColor: colorCfg.hex,
                            }}
                          >
                            <b>{ink.color_code}</b>
                          </span>
                          <div>
                            <b>{colorCfg.name}</b>
                            <small>
                              ~{Math.round((ink.tank_capacity_ml * currentVal) / 100)} ml
                            </small>
                          </div>
                        </div>

                        <div className="vc-batch-col-controls">
                          <div className="vc-batch-pct-badge">
                            <b>{currentVal}%</b>
                          </div>
                          <div className="vc-batch-preset-btns">
                            {[100, 75, 50, 25, 10, 0].map((v) => (
                              <button
                                key={v}
                                type="button"
                                className={currentVal === v ? 'is-selected' : ''}
                                onClick={() =>
                                  setBatchDraft((prev) => ({ ...prev, [ink.id]: v }))
                                }
                              >
                                {v}%
                              </button>
                            ))}
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={currentVal}
                            onChange={(e) =>
                              setBatchDraft((prev) => ({
                                ...prev,
                                [ink.id]: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setBatchMachine(null)}
                disabled={batchSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                onClick={handleSaveBatchMachine}
                disabled={batchSaving}
              >
                {batchSaving ? 'Guardando cambios…' : 'Guardar todos los niveles'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: Añadir Nuevo Canal de Tinta */}
      {showAddModal && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <form className="vc-live-modal" onSubmit={handleCreateInk}>
            <header>
              <Plus size={22} />
              <div>
                <h3>Asignar Canal de Tinta a Máquina</h3>
                <p>Registra un nuevo tanque o color para monitoreo diario en tiempo real.</p>
              </div>
            </header>

            <div className="vc-live-modal-body vc-form-grid">
              <label>
                Máquina o plotter *
                <input
                  required
                  type="text"
                  placeholder="Ej. Plotter Gran Formato 3.20m, Plotter Roland 1.60m"
                  value={newInkForm.machineName}
                  onChange={(e) =>
                    setNewInkForm({ ...newInkForm, machineName: e.target.value })
                  }
                />
              </label>

              <label>
                Canal de Color *
                <select
                  value={newInkForm.colorCode}
                  onChange={(e) =>
                    setNewInkForm({
                      ...newInkForm,
                      colorCode: e.target.value as ActiveInk['color_code'],
                    })
                  }
                >
                  <option value="C">Cian (C)</option>
                  <option value="M">Magenta (M)</option>
                  <option value="Y">Amarillo (Y)</option>
                  <option value="K">Negro (K)</option>
                  <option value="LC">Light Cyan (LC)</option>
                  <option value="LM">Light Magenta (LM)</option>
                  <option value="W">Blanco (W)</option>
                  <option value="V">Barniz / Gloss (V)</option>
                  <option value="FL">Limpiador / Flush (FL)</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>

              <label>
                Tipo de tinta
                <select
                  value={newInkForm.inkType}
                  onChange={(e) =>
                    setNewInkForm({
                      ...newInkForm,
                      inkType: e.target.value as ActiveInk['ink_type'],
                    })
                  }
                >
                  <option value="ecosolvente">Eco-solvente</option>
                  <option value="solvente">Solvente</option>
                  <option value="sublimacion">Sublimación</option>
                  <option value="uv">UV</option>
                  <option value="dtf">DTF</option>
                  <option value="acuosa">Acuosa / EcoTank</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              <label>
                Capacidad del tanque (ml)
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={newInkForm.capacityMl}
                  onChange={(e) =>
                    setNewInkForm({ ...newInkForm, capacityMl: e.target.value })
                  }
                />
              </label>

              <label>
                Porcentaje actual en tanque (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newInkForm.initialPercent}
                  onChange={(e) =>
                    setNewInkForm({ ...newInkForm, initialPercent: e.target.value })
                  }
                />
              </label>

              <label>
                Notas u observaciones
                <input
                  type="text"
                  placeholder="Ej. Tinta original Galaxy lote 2026"
                  value={newInkForm.notes}
                  onChange={(e) => setNewInkForm({ ...newInkForm, notes: e.target.value })}
                />
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setShowAddModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="button button-dark">
                Guardar y monitorear
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
