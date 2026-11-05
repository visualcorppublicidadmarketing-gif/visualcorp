import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Disc,
  Layers,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './inventory-live-roll-monitor.css';

export type ActiveRoll = {
  id: string;
  organization_id: string;
  branch_id: string;
  variant_id: string;
  location_code: string;
  machine_name: string;
  material_name: string;
  material_family: 'lona' | 'vinil' | 'papel' | 'otro';
  roll_tag: string;
  standard_length_m: number;
  remaining_percent: number;
  status: 'en_uso' | 'en_espera' | 'agotado';
  operator_name: string;
  notes: string;
  last_measured_at: string;
  created_at: string;
  updated_at: string;
};

type InventoryLiveRollMonitorProps = {
  organizationId: string;
  branches: Array<{ id: string; name: string }>;
  canEdit: boolean;
  onNotice?: (msg: string) => void;
  operatorDefaultName?: string;
};

export function InventoryLiveRollMonitor({
  organizationId,
  branches,
  canEdit,
  onNotice,
  operatorDefaultName = '',
}: InventoryLiveRollMonitorProps) {
  const [rolls, setRolls] = useState<ActiveRoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyFilter, setFamilyFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('todas');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<ActiveRoll | null>(null);
  const [consumeStockOnReplace, setConsumeStockOnReplace] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRollForm, setNewRollForm] = useState({
    materialName: '',
    machineName: 'Plotter Gran Formato 3.20m',
    materialFamily: 'lona',
    rollTag: '',
    standardLengthM: '50',
    initialPercent: '100',
    operatorName: operatorDefaultName || '',
    notes: '',
  });

  const loadRolls = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_active_rolls')
        .select('*')
        .eq('organization_id', organizationId)
        .order('remaining_percent', { ascending: true });

      if (error) {
        console.error('Error cargando rollos en vivo:', error);
      } else if (data) {
        setRolls(data as ActiveRoll[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRolls();
  }, [organizationId]);

  const updatePercent = async (roll: ActiveRoll, newPercent: number) => {
    if (!canEdit || !supabase) return;
    setUpdatingId(roll.id);
    const clamped = Math.max(0, Math.min(100, Math.round(newPercent)));
    try {
      const { data, error } = await supabase.rpc('record_roll_daily_percent', {
        p_roll_id: roll.id,
        p_percent: clamped,
        p_operator: operatorDefaultName || roll.operator_name || 'Operario de taller',
        p_notes: `Ajuste diario en vivo: ${clamped}%`,
      });

      if (error) {
        onNotice?.(`Error al actualizar porcentaje: ${error.message}`);
      } else {
        setRolls((prev) =>
          prev.map((r) =>
            r.id === roll.id
              ? {
                  ...r,
                  remaining_percent: clamped,
                  status: clamped === 0 ? 'agotado' : 'en_uso',
                  last_measured_at: new Date().toISOString(),
                }
              : r
          )
        );
        onNotice?.(`Rollo “${roll.material_name}” actualizado al ${clamped}%.`);
      }
    } catch (err: any) {
      onNotice?.(`Fallo al guardar: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReplaceRoll = async () => {
    if (!replaceTarget || !supabase) return;
    setUpdatingId(replaceTarget.id);
    try {
      const { data, error } = await supabase.rpc('replace_active_roll', {
        p_roll_id: replaceTarget.id,
        p_consume_warehouse_roll: consumeStockOnReplace,
        p_new_tag: `Lote-${new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' })}`,
        p_operator: operatorDefaultName || 'Operario de taller',
        p_notes: 'Nuevo rollo montado al 100%',
      });

      if (error) {
        onNotice?.(`No se pudo reemplazar el rollo: ${error.message}`);
      } else {
        setRolls((prev) =>
          prev.map((r) =>
            r.id === replaceTarget.id
              ? {
                  ...r,
                  remaining_percent: 100,
                  status: 'en_uso',
                  last_measured_at: new Date().toISOString(),
                }
              : r
          )
        );
        const msg = consumeStockOnReplace
          ? `¡Nuevo rollo montado al 100%! Se descontó 1 rollo cerrado del stock de bodega.`
          : `¡Rollo reiniciado al 100% en máquina!`;
        onNotice?.(msg);
        setReplaceTarget(null);
      }
    } catch (err: any) {
      onNotice?.(`Error: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateRoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newRollForm.materialName.trim()) return;

    // Buscar una variante de rollo por defecto si existe
    const branchId = branches[0]?.id || 'f499caf7-6286-4c6e-abd7-d79fa58c27d0';
    try {
      // Tomamos la primera variante existente para asociar
      const { data: variants } = await supabase
        .from('inventory_variants')
        .select('id')
        .limit(1);

      const variantId = variants?.[0]?.id || '68fc1410-6261-4ed6-85f8-1ce561ed1c16';

      const { data, error } = await supabase
        .from('inventory_active_rolls')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          variant_id: variantId,
          location_code: 'MAIN',
          machine_name: newRollForm.machineName.trim(),
          material_name: newRollForm.materialName.trim(),
          material_family: newRollForm.materialFamily,
          roll_tag: newRollForm.rollTag.trim() || 'Rollo #1',
          standard_length_m: Number(newRollForm.standardLengthM) || 50,
          remaining_percent: Number(newRollForm.initialPercent) || 100,
          operator_name: newRollForm.operatorName.trim() || 'Taller',
          notes: newRollForm.notes.trim(),
          status: 'en_uso',
        })
        .select()
        .single();

      if (error) {
        onNotice?.(`Error al crear rollo: ${error.message}`);
      } else if (data) {
        setRolls((prev) => [data as ActiveRoll, ...prev]);
        setShowAddModal(false);
        onNotice?.(`Rollo “${newRollForm.materialName}” agregado a máquina con éxito.`);
      }
    } catch (err: any) {
      onNotice?.(`Error: ${err.message}`);
    }
  };

  const filteredRolls = useMemo(() => {
    return rolls.filter((r) => {
      if (familyFilter === 'peligro' && r.remaining_percent > 25) return false;
      if (familyFilter !== 'todos' && familyFilter !== 'peligro' && r.material_family !== familyFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = r.material_name.toLowerCase().includes(q);
        const matchesMachine = r.machine_name.toLowerCase().includes(q);
        const matchesTag = r.roll_tag.toLowerCase().includes(q);
        if (!matchesName && !matchesMachine && !matchesTag) return false;
      }
      return true;
    });
  }, [rolls, familyFilter, search]);

  const criticalCount = useMemo(() => rolls.filter((r) => r.remaining_percent <= 25).length, [rolls]);

  const getMeterEstimate = (roll: ActiveRoll) => {
    const meters = (roll.standard_length_m * roll.remaining_percent) / 100;
    return meters.toFixed(1);
  };

  const getPercentColorClass = (pct: number) => {
    if (pct <= 15) return 'is-critical';
    if (pct <= 35) return 'is-warning';
    if (pct <= 65) return 'is-medium';
    return 'is-healthy';
  };

  return (
    <div className="vc-live-rolls-container">
      {/* Cabecera y Resumen */}
      <div className="vc-live-rolls-header">
        <div className="vc-live-rolls-title-block">
          <div className="vc-live-badge-live">
            <span className="vc-pulse-dot" /> EN VIVO EN MÁQUINA
          </div>
          <h2>Control Diario de Rollos y Bobinas</h2>
          <p>
            Monitorea el porcentaje restante de lonas, viniles y papeles montados en cada plotter.
            Actualiza con 1 toque al terminar el trabajo o jornada.
          </p>
        </div>

        <div className="vc-live-rolls-actions">
          {criticalCount > 0 && (
            <div className="vc-live-alert-pill" role="alert">
              <AlertTriangle size={15} />
              <span><b>{criticalCount}</b> {criticalCount === 1 ? 'rollo por agotarse' : 'rollos por agotarse'}</span>
            </div>
          )}
          <button
            type="button"
            className="button button-outline"
            onClick={loadRolls}
            disabled={loading}
            title="Refrescar datos en vivo"
          >
            <RefreshCw size={14} className={loading ? 'vc-spin' : ''} /> Refrescar
          </button>
          {canEdit && (
            <button
              type="button"
              className="button button-dark"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={15} /> Añadir rollo a máquina
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="vc-live-rolls-filters">
        <div className="vc-live-filter-chips" role="group" aria-label="Filtrar por familia de material">
          <button
            type="button"
            className={familyFilter === 'todos' ? 'is-active' : ''}
            onClick={() => setFamilyFilter('todos')}
          >
            Todos ({rolls.length})
          </button>
          <button
            type="button"
            className={familyFilter === 'lona' ? 'is-active' : ''}
            onClick={() => setFamilyFilter('lona')}
          >
            Lonas
          </button>
          <button
            type="button"
            className={familyFilter === 'vinil' ? 'is-active' : ''}
            onClick={() => setFamilyFilter('vinil')}
          >
            Viniles
          </button>
          <button
            type="button"
            className={familyFilter === 'papel' ? 'is-active' : ''}
            onClick={() => setFamilyFilter('papel')}
          >
            Papeles Sublimación
          </button>
          {criticalCount > 0 && (
            <button
              type="button"
              className={`chip-danger ${familyFilter === 'peligro' ? 'is-active' : ''}`}
              onClick={() => setFamilyFilter('peligro')}
            >
              ⚠️ Por agotarse ({criticalCount})
            </button>
          )}
        </div>

        <div className="vc-live-search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Buscar por material, máquina o lote…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grid de Rollos Activos */}
      {loading && rolls.length === 0 ? (
        <div className="vc-live-loading">
          <LoaderCircle size={28} className="vc-spin" />
          <p>Conectando con máquinas y rollos activos…</p>
        </div>
      ) : filteredRolls.length === 0 ? (
        <div className="vc-live-empty">
          <Disc size={36} />
          <h3>No se encontraron rollos con este filtro</h3>
          <p>Cambia el criterio de búsqueda o añade un nuevo rollo a la máquina.</p>
        </div>
      ) : (
        <div className="vc-live-rolls-grid">
          {filteredRolls.map((roll) => {
            const isBusy = updatingId === roll.id;
            const pctClass = getPercentColorClass(roll.remaining_percent);
            const estMeters = getMeterEstimate(roll);

            return (
              <article key={roll.id} className={`vc-roll-card ${pctClass}`}>
                {/* Cabecera de la Tarjeta */}
                <div className="vc-roll-card-head">
                  <div>
                    <span className="vc-roll-machine-badge">{roll.machine_name || 'Plotter de Taller'}</span>
                    <h3 title={roll.material_name}>{roll.material_name}</h3>
                    <div className="vc-roll-meta-line">
                      <span className="vc-roll-family-tag">{roll.material_family.toUpperCase()}</span>
                      {roll.roll_tag && <span className="vc-roll-tag">{roll.roll_tag}</span>}
                    </div>
                  </div>
                  <div className="vc-roll-status-icon">
                    <Disc size={20} className={roll.remaining_percent > 0 ? 'is-spinning' : ''} />
                  </div>
                </div>

                {/* Visualizador 3D de Bobina / Cilindro */}
                <div className="vc-roll-visual-block">
                  <div className="vc-roll-cylinder" title={`Nivel restante: ${roll.remaining_percent}%`}>
                    <div
                      className="vc-roll-cylinder-fill"
                      style={{ height: `${Math.max(8, roll.remaining_percent)}%` }}
                    />
                    <div className="vc-roll-cylinder-core" />
                  </div>

                  <div className="vc-roll-metrics">
                    <div className="vc-roll-pct-display">
                      <span className="vc-roll-pct-num">{Math.round(roll.remaining_percent)}</span>
                      <span className="vc-roll-pct-unit">%</span>
                    </div>
                    <div className="vc-roll-meters-sub">
                      ~{estMeters} m <span>de {roll.standard_length_m} m</span>
                    </div>
                    {roll.remaining_percent <= 20 && (
                      <span className="vc-roll-warning-badge">¡CRÍTICO! Pedir nuevo rollo</span>
                    )}
                  </div>
                </div>

                {/* Controles de Porcentaje Táctiles */}
                {canEdit && (
                  <div className="vc-roll-controls">
                    <span className="vc-control-label">Ajustar porcentaje del día:</span>
                    <div className="vc-roll-quick-buttons" role="group">
                      {[100, 75, 50, 25, 10, 0].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className={Math.round(roll.remaining_percent) === val ? 'is-selected' : ''}
                          onClick={() => updatePercent(roll, val)}
                          disabled={isBusy}
                        >
                          {val === 0 ? '0%' : `${val}%`}
                        </button>
                      ))}
                    </div>

                    {/* Slider táctil continuo */}
                    <div className="vc-roll-slider-row">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={roll.remaining_percent}
                        disabled={isBusy}
                        onChange={(e) => updatePercent(roll, Number(e.target.value))}
                        aria-label={`Porcentaje restante de ${roll.material_name}`}
                      />
                    </div>
                  </div>
                )}

                {/* Pie y Acción de Reemplazo */}
                <div className="vc-roll-card-footer">
                  <div className="vc-roll-operator-info">
                    <small>
                      Medido: {new Date(roll.last_measured_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}{' '}
                      · {roll.operator_name || 'Taller'}
                    </small>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="vc-roll-btn-replace"
                      onClick={() => setReplaceTarget(roll)}
                      disabled={isBusy}
                    >
                      <Zap size={14} /> Montar nuevo rollo
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal de Reemplazo de Rollo */}
      {replaceTarget && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <div className="vc-live-modal">
            <header>
              <Zap size={22} className="vc-modal-icon-zap" />
              <div>
                <h3>Montar Nuevo Rollo en Máquina</h3>
                <p>{replaceTarget.material_name} · {replaceTarget.machine_name}</p>
              </div>
            </header>

            <div className="vc-live-modal-body">
              <p>
                Al confirmar, el porcentaje del rollo en máquina se reiniciará al <b>100%</b> (lleno).
              </p>

              <label className="vc-live-checkbox-card">
                <input
                  type="checkbox"
                  checked={consumeStockOnReplace}
                  onChange={(e) => setConsumeStockOnReplace(e.target.checked)}
                />
                <div>
                  <b>Descontar 1 rollo cerrado del inventario de bodega</b>
                  <small>
                    Registra automáticamente una salida de bodega por consumo y actualiza las existencias.
                  </small>
                </div>
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setReplaceTarget(null)}
                disabled={Boolean(updatingId)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                onClick={handleReplaceRoll}
                disabled={Boolean(updatingId)}
              >
                {updatingId ? 'Procesando…' : 'Confirmar nuevo rollo al 100%'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal para Añadir Nuevo Rollo a Máquina */}
      {showAddModal && (
        <div className="vc-live-modal-backdrop" role="presentation">
          <form className="vc-live-modal" onSubmit={handleCreateRoll}>
            <header>
              <Plus size={22} />
              <div>
                <h3>Asignar Rollo a Máquina</h3>
                <p>Registra un nuevo material para monitorear su porcentaje de uso diario.</p>
              </div>
            </header>

            <div className="vc-live-modal-body vc-form-grid">
              <label>
                Nombre del material *
                <input
                  required
                  type="text"
                  placeholder="Ej. Lona Blackout 3.20m, Vinil Mate 1.27m"
                  value={newRollForm.materialName}
                  onChange={(e) => setNewRollForm({ ...newRollForm, materialName: e.target.value })}
                />
              </label>

              <label>
                Máquina o puesto de taller *
                <input
                  required
                  type="text"
                  placeholder="Ej. Plotter Gran Formato 3.20m"
                  value={newRollForm.machineName}
                  onChange={(e) => setNewRollForm({ ...newRollForm, machineName: e.target.value })}
                />
              </label>

              <label>
                Familia
                <select
                  value={newRollForm.materialFamily}
                  onChange={(e) => setNewRollForm({ ...newRollForm, materialFamily: e.target.value as any })}
                >
                  <option value="lona">Lona</option>
                  <option value="vinil">Vinil</option>
                  <option value="papel">Papel Sublimación</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              <label>
                Lote o etiqueta
                <input
                  type="text"
                  placeholder="Ej. Lote B-2026"
                  value={newRollForm.rollTag}
                  onChange={(e) => setNewRollForm({ ...newRollForm, rollTag: e.target.value })}
                />
              </label>

              <label>
                Largo estándar (metros)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newRollForm.standardLengthM}
                  onChange={(e) => setNewRollForm({ ...newRollForm, standardLengthM: e.target.value })}
                />
              </label>

              <label>
                Porcentaje inicial en uso (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newRollForm.initialPercent}
                  onChange={(e) => setNewRollForm({ ...newRollForm, initialPercent: e.target.value })}
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
                Guardar y poner en vivo
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
