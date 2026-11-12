import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  Boxes,
  Check,
  CircleHelp,
  Clock3,
  Disc3,
  Dices,
  History,
  Layers,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Ruler,
  Scissors,
  Search,
  Sparkles,
  Warehouse,
  X,
  Zap
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Dialog } from './ui/OperationalKit';
import './InventoryRollBook.css';

type Branch = { id: string; name: string };
type InventoryItem = {
  id?: string;
  variantId?: string;
  remoteItemId?: string;
  branchId?: string | null;
  branch?: string;
  name?: string;
  variant?: string;
  variantSku?: string;
  sku?: string;
  unit?: string;
  category?: string;
  itemType?: string;
  tags?: string[];
  location?: string;
  variantAttributes?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  archived?: boolean;
  rollGroupId?: string;
  groupId?: string;
  categoryId?: string;
  inventoryGroupId?: string;
};
type Roll = {
  id: string;
  organization_id: string;
  branch_id: string;
  variant_id: string;
  location_code: string;
  machine_name: string;
  material_name: string;
  roll_tag: string;
  standard_length_m: number | null;
  nominal_width_cm: number | null;
  remaining_m: number | null;
  remaining_percent: number | null;
  remaining_is_estimate: boolean;
  roll_state: 'bodega' | 'machine';
  status: string;
  operator_name: string;
  notes: string;
  last_measured_at: string;
  updated_at: string;
};
type RollLog = {
  id: string;
  event_type: string;
  previous_m: number | null;
  new_m: number | null;
  previous_state: string | null;
  new_state: string | null;
  reason: string;
  work_reference: string;
  operator_name: string;
  recorded_at: string;
  notes: string;
};
type LocationOption = { code: string; name: string };

type Props = {
  organizationId: string;
  branches: Branch[];
  canEdit: boolean;
  onNotice?: (message: string) => void;
  operatorDefaultName?: string;
  inventoryItems: InventoryItem[];
  rollGroupId: string | null;
  onRefreshInventory?: () => Promise<void> | void;
  availableMachines?: string[];
  defaultBranchName?: string;
};

const unitIsMeters = (unit = '') => /^(m|metro|metros|metro lineal|metros lineales)$/i.test(unit.trim());
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String((error as { message?: string })?.message || 'Ocurrió un error inesperado.');
const formatNumber = (value: number, digits = 2) => new Intl.NumberFormat('es-EC', { maximumFractionDigits: digits }).format(value);
const LOW_ROLL_PERCENT = 20;
const rollColumns = 'id,organization_id,branch_id,variant_id,location_code,machine_name,material_name,material_family,roll_tag,standard_length_m,nominal_width_cm,remaining_m,remaining_percent,remaining_is_estimate,roll_state,status,operator_name,notes,last_measured_at,created_at,updated_at';

// Top presets de rollos recurrentes en Visual Corp para carga ultra-rápida (1-clic)
const QUICK_ROLL_PRESETS = [
  { id: 'vin-brill-127', label: 'Vinil Blanco Brillante', width: 127, length: 50, tagPrefix: 'VIN-BRILL', icon: '✨', searchTerms: ['brillante', '127', 'vinil'] },
  { id: 'vin-mate-127', label: 'Vinil Blanco Mate', width: 127, length: 50, tagPrefix: 'VIN-MATE', icon: '📄', searchTerms: ['mate', '127', 'vinil'] },
  { id: 'lona-107', label: 'Lona Front 13oz 1.07m', width: 107, length: 50, tagPrefix: 'LONA-107', icon: '📜', searchTerms: ['lona', '107'] },
  { id: 'lona-310', label: 'Lona Front 3.10m Gran Formato', width: 310, length: 50, tagPrefix: 'LONA-310', icon: '🏗️', searchTerms: ['lona', '310'] },
  { id: 'micro-152', label: 'Vinil Microperforado 1.52m', width: 152, length: 50, tagPrefix: 'MICRO-152', icon: '🪟', searchTerms: ['microperforado'] },
  { id: 'arenado-127', label: 'Vinil Arenado / Esmerilado', width: 127, length: 50, tagPrefix: 'AREN-127', icon: '❄️', searchTerms: ['arenado', 'esmerilado'] },
];

export function InventoryRollBook({
  organizationId,
  branches,
  canEdit,
  onNotice,
  operatorDefaultName = '',
  inventoryItems = [],
  rollGroupId,
  onRefreshInventory,
  availableMachines = [],
  defaultBranchName = 'Visual Corp',
}: Props) {
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('all');
  const [stateFilter, setStateFilter] = useState<'todos' | 'bodega' | 'machine' | 'agotado' | 'bajo' | 'estimado'>('todos');
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [showReceive, setShowReceive] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [activeLocations, setActiveLocations] = useState<LocationOption[]>([]);
  const [equipmentMachines, setEquipmentMachines] = useState<string[]>([]);
  const [historyRoll, setHistoryRoll] = useState<Roll | null>(null);
  const [historyRows, setHistoryRows] = useState<RollLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [expandedToolsRollId, setExpandedToolsRollId] = useState<string | null>(null);
  const measurementInputRef = useRef<HTMLInputElement>(null);
  const [replaceConfirmId, setReplaceConfirmId] = useState('');

  // Sucursal por defecto inteligente para el formulario de recepción
  const defaultBranchId = useMemo(() => {
    const found = branches.find((b) => b.name?.toLowerCase().includes('visual')) || branches[0];
    return found?.id || '';
  }, [branches]);

  // Estado del formulario de recepción
  const [formBranchId, setFormBranchId] = useState(defaultBranchId);
  const [rollCondition, setRollCondition] = useState<'full' | 'partial'>('full');
  const [batchCount, setBatchCount] = useState<number>(1);
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [materialFilterTab, setMaterialFilterTab] = useState<'todos' | 'vinil' | 'lona' | 'micro' | 'especial'>('todos');
  const [isChangingMaterial, setIsChangingMaterial] = useState(false);

  const [form, setForm] = useState({
    variantId: '',
    width: '',
    nominal: '50',
    remainingMode: 'meters' as 'meters' | 'percent',
    remaining: '50',
    percent: '100',
    location: 'MAIN',
    tag: '',
    operator: operatorDefaultName,
    reason: 'Ingreso de nuevo rollo en bodega',
    reference: '',
  });

  const [measurement, setMeasurement] = useState<Record<string, { meters: string; reason: string; reference: string }>>({});
  const [actions, setActions] = useState<Record<string, { machine: string; reason: string; reference: string }>>({});

  const rollItems = useMemo(() => {
    const candidates = inventoryItems.filter((item) => !item.archived && item.variantId && unitIsMeters(item.unit));
    const groupKey = String(rollGroupId || '').trim().toLowerCase();
    if (!groupKey) {
      return candidates.filter((item) => /lona|vinil|papel|rollo|bobina|microperforado|banner|esmerilado|arenado/i.test(`${item.name} ${item.category} ${item.itemType} ${(item.tags || []).join(' ')}`));
    }
    const matched = candidates.filter((item) => {
      const keys = [item.rollGroupId, item.groupId, item.inventoryGroupId, item.categoryId, item.remoteItemId, item.category, item.name, item.itemType, ...(item.tags || [])]
        .filter(Boolean).map((value) => String(value).trim().toLowerCase());
      return item.customFields?.inventory_model === 'roll' && keys.includes(groupKey);
    });
    return matched;
  }, [inventoryItems, rollGroupId]);

  // Selección del material activo en el formulario
  const selectedMaterial = useMemo(() => {
    return rollItems.find((item) => item.variantId === form.variantId) || null;
  }, [rollItems, form.variantId]);

  // Filtrado reactivo de materiales para el selector inteligente
  const filteredMaterialCandidates = useMemo(() => {
    const q = materialSearchQuery.trim().toLowerCase();
    return rollItems.filter((item) => {
      const text = `${item.name} ${item.variant || ''} ${item.sku || ''} ${item.variantSku || ''}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (materialFilterTab === 'vinil' && !/vinil/i.test(text)) return false;
      if (materialFilterTab === 'lona' && !/lona|banner/i.test(text)) return false;
      if (materialFilterTab === 'micro' && !/microperforado|micro/i.test(text)) return false;
      if (materialFilterTab === 'especial' && /^(vinil|lona)\b/i.test(text)) return false;
      return true;
    });
  }, [rollItems, materialSearchQuery, materialFilterTab]);

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name || 'Sucursal';

  // Generador de etiquetas / lote automáticos
  const generateAutoTag = useCallback((prefix = 'ROL') => {
    const date = new Date();
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${yy}${mm}-${rnd}`;
  }, []);

  const loadRolls = useCallback(async () => {
    if (!supabase || !organizationId) { setLoading(false); setLoadError('No hay conexión con el inventario.'); return; }
    setLoading(true);
    setLoadError('');
    try {
      let query = supabase.from('inventory_active_rolls').select(rollColumns).eq('organization_id', organizationId);
      const allowedBranchIds = branches.map((branch) => branch.id).filter(Boolean);
      if (branchId === 'all' && allowedBranchIds.length) query = query.in('branch_id', allowedBranchIds);
      else if (branchId !== 'all') query = query.eq('branch_id', branchId);
      const { data, error } = await query.order('roll_state').order('remaining_m', { ascending: true }).order('created_at', { ascending: false });
      if (error) throw error;
      setRolls((data || []) as Roll[]);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      onNotice?.(`No se pudieron cargar los rollos: ${message}`);
    } finally { setLoading(false); }
  }, [organizationId, branchId, branches, onNotice]);

  useEffect(() => {
    void loadRolls();
    if (!supabase || !organizationId) { setRealtimeState('offline'); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`inventory-roll-book:${organizationId}:${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_active_rolls', filter: `organization_id=eq.${organizationId}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void loadRolls(); }, 250);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_roll_logs', filter: `organization_id=eq.${organizationId}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void loadRolls(); }, 250);
      })
      .subscribe((status) => setRealtimeState(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting'));
    return () => { if (timer) clearTimeout(timer); void supabase?.removeChannel(channel); };
  }, [organizationId, branchId, loadRolls]);

  // Carga de ubicaciones activas según formBranchId
  useEffect(() => {
    const targetBranch = formBranchId || (branchId !== 'all' ? branchId : defaultBranchId);
    if (!supabase || !organizationId || !targetBranch) { setActiveLocations([]); return; }
    let active = true;
    void supabase.from('inventory_locations').select('code,name').eq('organization_id', organizationId).eq('branch_id', targetBranch).eq('active', true).order('name')
      .then(({ data, error }) => {
        if (!active || error) return;
        const next = (data || []) as LocationOption[];
        setActiveLocations(next);
        setForm((current) => ({
          ...current,
          location: next.some((location) => location.code === current.location) ? current.location : (next.find((l) => l.code === 'MAIN')?.code || next[0]?.code || 'MAIN')
        }));
      });
    return () => { active = false; };
  }, [organizationId, formBranchId, branchId, defaultBranchId]);

  // Si cambia el filtro de sucursal global y no es 'all', actualizar formBranchId
  useEffect(() => {
    if (branchId !== 'all') {
      setFormBranchId(branchId);
    }
  }, [branchId]);

  useEffect(() => {
    if (!supabase || !organizationId) { setEquipmentMachines([]); return; }
    let active = true;
    let query = supabase.from('equipment_assets').select('name,equipment_type,status,branch_id').eq('organization_id', organizationId).neq('status', 'Retirado');
    if (branchId !== 'all') query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    void query.order('name').then(({ data, error }) => {
      if (!active || error) return;
      const values = (data || []).filter((asset: any) => /impresora|plotter|sublim|calandra|imprenta/i.test(`${asset.name} ${asset.equipment_type}`)).map((asset: any) => String(asset.name || '').trim()).filter(Boolean);
      setEquipmentMachines([...new Set(values)]);
    });
    return () => { active = false; };
  }, [organizationId, branchId]);

  const groupVariantIds = useMemo(() => new Set(rollItems.map((item) => item.variantId).filter((id): id is string => Boolean(id))), [rollItems]);
  const visibleRolls = useMemo(() => rolls.filter((roll) => {
    if (!groupVariantIds.has(roll.variant_id)) return false;
    if (machineFilter !== 'all' && roll.machine_name !== machineFilter) return false;
    if (locationFilter !== 'all' && roll.location_code !== locationFilter) return false;
    const nominal = Number(roll.standard_length_m || 0);
    const percent = nominal > 0 ? Number(roll.remaining_m || 0) / nominal * 100 : null;
    if (stateFilter === 'agotado' && roll.status !== 'agotado') return false;
    if (stateFilter === 'bajo' && (roll.status === 'agotado' || percent === null || percent > LOW_ROLL_PERCENT)) return false;
    if (stateFilter === 'estimado' && !roll.remaining_is_estimate) return false;
    if (stateFilter === 'bodega' && roll.roll_state !== 'bodega') return false;
    if (stateFilter === 'machine' && roll.roll_state !== 'machine') return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${roll.material_name} ${roll.roll_tag} ${roll.machine_name} ${roll.variant_id}`.toLowerCase().includes(needle);
  }), [rolls, groupVariantIds, machineFilter, locationFilter, stateFilter, search]);

  const scopedRolls = useMemo(() => rolls.filter((roll) => groupVariantIds.has(roll.variant_id)), [rolls, groupVariantIds]);
  const lowRolls = scopedRolls.filter((roll) => {
    if (roll.status === 'agotado') return false;
    return roll.standard_length_m !== null && Number(roll.standard_length_m) > 0 && Number(roll.remaining_m || 0) / Number(roll.standard_length_m) * 100 <= LOW_ROLL_PERCENT;
  });
  const exhaustedCount = scopedRolls.filter((roll) => roll.status === 'agotado' || Number(roll.remaining_m || 0) <= 0).length;
  const estimatedCount = scopedRolls.filter((roll) => roll.remaining_is_estimate).length;
  const warehouseMeters = scopedRolls.filter((roll) => roll.roll_state === 'bodega').reduce((sum, roll) => sum + Number(roll.remaining_m || 0), 0);
  const machines = [...new Set(scopedRolls.map((roll) => roll.machine_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const availableMachineNames = [...new Set([...equipmentMachines, ...availableMachines, ...machines])].sort((a, b) => a.localeCompare(b, 'es'));
  const locations = [...new Set(scopedRolls.map((roll) => roll.location_code).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  useEffect(() => {
    if (expandedToolsRollId) measurementInputRef.current?.focus();
  }, [expandedToolsRollId]);

  // Función para seleccionar material y auto-completar ancho, largo y etiqueta
  const handleSelectMaterial = useCallback((item: InventoryItem) => {
    if (!item.variantId) return;
    const nameLower = `${item.name || ''} ${item.variant || ''} ${item.sku || ''}`.toLowerCase();

    // Extraer ancho automático de atributos o regex en el nombre/SKU
    let detectedWidth = String(item.variantAttributes?.width_cm || '');
    if (!detectedWidth) {
      const match = nameLower.match(/\b(107|127|152|310|160|200|320)\s*(?:cm|m)?\b/);
      if (match) detectedWidth = match[1];
    }
    if (!detectedWidth) detectedWidth = '127';

    // Determinar largo nominal estándar (50m por defecto, 100m para lona gran formato)
    const defaultNominal = Number(item.customFields?.default_nominal_roll_length_m) || (detectedWidth === '310' ? 50 : 50);
    const nominalStr = String(defaultNominal);

    // Determinar prefijo según categoría
    const prefix = /lona/i.test(nameLower) ? 'ROL-LONA' : /micro/i.test(nameLower) ? 'ROL-MICRO' : 'ROL-VIN';
    const autoTag = generateAutoTag(prefix);

    setForm((current) => ({
      ...current,
      variantId: item.variantId!,
      width: detectedWidth,
      nominal: nominalStr,
      remaining: nominalStr,
      percent: '100',
      tag: current.tag.trim() || autoTag,
      reason: current.reason || 'Ingreso de nuevo rollo en bodega',
    }));
    setRollCondition('full');
    setIsChangingMaterial(false);
  }, [generateAutoTag]);

  // Aplicar plantilla rápida de 1-clic
  const applyQuickPreset = (preset: typeof QUICK_ROLL_PRESETS[0]) => {
    // Buscar el material que mejor coincide
    const found = rollItems.find((item) => {
      const fullText = `${item.name} ${item.variant || ''} ${item.sku || ''}`.toLowerCase();
      return preset.searchTerms.every((term) => fullText.includes(term));
    }) || rollItems[0];

    if (found) {
      handleSelectMaterial(found);
      setForm((current) => ({
        ...current,
        width: String(preset.width),
        nominal: String(preset.length),
        remaining: String(preset.length),
        tag: generateAutoTag(preset.tagPrefix),
      }));
      setShowReceive(true);
      onNotice?.(`⚡ Plantilla cargada: ${preset.label} (${preset.width}cm × ${preset.length}m)`);
    } else {
      setShowReceive(true);
      onNotice?.(`Plantilla lista. Selecciona el artículo exacto en la lista.`);
    }
  };

  // Envío del formulario de recepción (soporta recepción individual o por lote múltiple)
  const submitReceive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !supabase || busy) return;

    const selected = rollItems.find((item) => item.variantId === form.variantId);
    const targetBranch = formBranchId || (branchId !== 'all' ? branchId : defaultBranchId);
    const width = Number(form.width);
    const nominal = form.nominal.trim() ? Number(form.nominal) : null;
    const remaining = Number(form.remaining);
    const percent = Number(form.percent);

    if (!selected || !targetBranch) {
      return onNotice?.('Selecciona un material de rollo y confirma la sucursal de destino.');
    }
    if (!Number.isFinite(width) || width <= 0) return onNotice?.('Indica el ancho del rollo en centímetros.');
    if (nominal !== null && (!Number.isFinite(nominal) || nominal <= 0)) return onNotice?.('El largo nominal debe ser mayor que cero.');
    if (form.remainingMode === 'percent' && nominal === null) return onNotice?.('El porcentaje requiere el largo nominal del rollo.');
    if (!form.reason.trim()) return onNotice?.('Indica el motivo de recepción.');
    if (form.remainingMode === 'meters' && (!Number.isFinite(remaining) || remaining <= 0 || (nominal !== null && remaining > nominal))) {
      return onNotice?.('Revisa los metros restantes. Deben ser mayores que cero y no superar el largo nominal.');
    }
    if (form.remainingMode === 'percent' && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
      return onNotice?.('El porcentaje debe estar entre 0 y 100.');
    }

    const countToReceive = Math.max(1, Math.min(20, batchCount));
    const key = 'receive';
    setBusy(key);

    try {
      const baseTag = form.tag.trim() || generateAutoTag('ROL');
      const locationCode = form.location.trim() || selected.location || 'MAIN';
      const operator = form.operator.trim() || operatorDefaultName || 'Taller';
      const reason = form.reason.trim() || 'Ingreso de rollo nuevo en bodega';

      for (let i = 0; i < countToReceive; i++) {
        const itemTag = countToReceive > 1 ? `${baseTag}-${String(i + 1).padStart(2, '0')}` : baseTag;
        const { error } = await supabase.rpc('receive_inventory_roll', {
          p_variant_id: selected.variantId,
          p_branch_id: targetBranch,
          p_location_code: locationCode,
          p_roll_tag: itemTag,
          p_nominal_length_m: nominal,
          p_nominal_width_cm: width,
          p_remaining_m: form.remainingMode === 'meters' ? remaining : null,
          p_remaining_percent: form.remainingMode === 'percent' ? percent : null,
          p_operator: operator,
          p_reason: reason,
          p_work_reference: form.reference.trim(),
        });
        if (error) throw error;
      }

      setForm((current) => ({
        ...current,
        variantId: '',
        width: '',
        nominal: '50',
        remaining: '50',
        percent: '100',
        tag: '',
        reason: 'Ingreso de nuevo rollo en bodega',
        reference: '',
        operator: operatorDefaultName,
      }));
      setBatchCount(1);
      setIsChangingMaterial(false);
      await loadRolls();
      await onRefreshInventory?.();
      onNotice?.(countToReceive > 1 ? `Se recibieron ${countToReceive} rollos con trazabilidad e IDs secuenciales.` : 'Rollo recibido con éxito y stock conciliado en metros.');
    } catch (error) {
      onNotice?.(`No se pudo recibir el rollo: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const saveMeasurement = async (roll: Roll) => {
    if (!canEdit || !supabase || busy) return;
    const draft = measurement[roll.id];
    const meters = Number(draft?.meters);
    if (!Number.isFinite(meters) || meters < 0 || (roll.standard_length_m !== null && meters > Number(roll.standard_length_m))) {
      return onNotice?.('Los metros restantes deben estar entre cero y el largo nominal registrado.');
    }
    if (!draft?.reason.trim()) return onNotice?.('Indica el motivo del ajuste.');
    setBusy(roll.id);
    try {
      const { error } = await supabase.rpc('update_inventory_roll_remaining', {
        p_roll_id: roll.id,
        p_remaining_m: meters,
        p_remaining_percent: null,
        p_reason: draft.reason.trim(),
        p_operator: operatorDefaultName || roll.operator_name || 'Taller',
        p_work_reference: draft.reference.trim(),
      });
      if (error) throw error;
      await loadRolls();
      await onRefreshInventory?.();
      setMeasurement((current) => ({ ...current, [roll.id]: { meters: '', reason: '', reference: '' } }));
      onNotice?.(`Restante de ${roll.material_name} actualizado a ${formatNumber(meters, 3)} m.`);
    } catch (error) {
      onNotice?.(`No se pudo guardar la medición: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  // Movimiento rápido a máquina o retorno a bodega (1-clic con trazabilidad)
  const quickMoveRoll = async (roll: Roll, destination: 'bodega' | 'machine', targetMachine?: string) => {
    if (!canEdit || !supabase || busy) return;
    const machine = targetMachine || actions[roll.id]?.machine || availableMachineNames[0] || 'Plotter';
    const reason = destination === 'machine' ? `Carga directa a ${machine} para producción` : 'Retorno de rollo a bodega tras producción';
    const operator = operatorDefaultName || roll.operator_name || 'Taller';

    setBusy(roll.id);
    try {
      const { error } = await supabase.rpc('move_inventory_roll', {
        p_roll_id: roll.id,
        p_destination: destination,
        p_machine_name: destination === 'machine' ? machine : '',
        p_reason: reason,
        p_operator: operator,
        p_work_reference: '',
      });
      if (error) throw error;
      await loadRolls();
      onNotice?.(destination === 'machine' ? `⚡ Rollo cargado a “${machine}”. Trazabilidad registrada.` : `🏢 Rollo devuelto a bodega. Trazabilidad registrada.`);
    } catch (error) {
      onNotice?.(`No se pudo mover el rollo: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const openHistory = async (roll: Roll) => {
    if (!supabase) return;
    setHistoryRoll(roll);
    setHistoryRows([]);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_roll_logs')
        .select('id,event_type,previous_m,new_m,previous_state,new_state,reason,work_reference,operator_name,recorded_at,notes')
        .eq('organization_id', organizationId)
        .eq('roll_id', roll.id)
        .order('recorded_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      setHistoryRows((data || []) as RollLog[]);
    } catch (error) {
      const message = errorMessage(error);
      setHistoryError(message);
      onNotice?.(`No se pudo cargar el historial: ${message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const replaceRoll = async (roll: Roll) => {
    if (!canEdit || !supabase || busy) return;
    setBusy(roll.id);
    try {
      const { data, error } = await supabase.rpc('replace_active_roll', {
        p_roll_id: roll.id,
        p_consume_warehouse_roll: false,
        p_new_tag: '',
        p_operator: operatorDefaultName || roll.operator_name || 'Taller',
        p_notes: 'Intercambio físico de rollos: usado a bodega y nuevo a máquina',
      });
      if (error) throw error;
      await loadRolls();
      setReplaceConfirmId('');
      const activeId = (data as any)?.active_roll_id;
      const active = rolls.find((item) => item.id === activeId);
      onNotice?.(`Intercambio registrado. El rollo anterior quedó en bodega y ${active?.roll_tag ? `el lote ${active.roll_tag}` : 'el rollo de bodega'} pasó a máquina.`);
    } catch (error) {
      onNotice?.(`No se pudo intercambiar: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const warehouseReplacementCount = (roll: Roll) =>
    scopedRolls.filter((candidate) => candidate.branch_id === roll.branch_id && candidate.variant_id === roll.variant_id && candidate.roll_state === 'bodega' && candidate.status === 'en_bodega' && Number(candidate.remaining_m || 0) > 0).length;

  return (
    <main className="roll-book" aria-labelledby="roll-book-title">
      {/* Cabecera Principal */}
      <header className="roll-book__header">
        <div className="roll-book__title-wrap">
          <span className="roll-book__mark" aria-hidden="true"><Scissors size={20} /></span>
          <div>
            <div className="roll-book__eyebrow">
              <span className={`roll-book__live-dot is-${realtimeState}`} />
              {realtimeState === 'live' ? 'Sincronizado en vivo' : realtimeState === 'connecting' ? 'Conectando sincronización' : 'Actualización manual'}
            </div>
            <h1 id="roll-book-title">Rollos de impresión</h1>
            <p>Consulta saldo por rollo, identifica qué está en máquina y registra movimientos con trazabilidad automática.</p>
          </div>
        </div>
        <div className="roll-book__header-actions">
          <label className="roll-book__branch">
            Sucursal
            <select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setMachineFilter('all');
                setLocationFilter('all');
              }}
              aria-label="Sucursal de los rollos"
            >
              <option value="all">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <button className="roll-book__refresh" type="button" onClick={() => void loadRolls()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'roll-book__spin' : ''} /> Actualizar
          </button>
          {canEdit && (
            <button
              className={`roll-book__receive-toggle ${showReceive ? 'is-active' : ''}`}
              type="button"
              aria-expanded={showReceive}
              aria-controls="roll-book-receive-form"
              onClick={() => setShowReceive((value) => !value)}
            >
              {showReceive ? <X size={16} /> : <Plus size={16} />} {showReceive ? 'Cerrar recepción' : '+ Recibir rollo'}
            </button>
          )}
        </div>
      </header>

      {/* Métricas Generales */}
      <section className="roll-book__metrics" aria-label="Resumen de rollos">
        <article>
          <span className="roll-book__metric-icon is-violet"><Disc3 size={17} /></span>
          <div>
            <small>Rollos identificados</small>
            <strong>{scopedRolls.length}</strong>
            <span>En todas las ubicaciones</span>
          </div>
        </article>
        <article>
          <span className="roll-book__metric-icon is-teal"><Warehouse size={17} /></span>
          <div>
            <small>En bodega</small>
            <strong>{scopedRolls.filter((roll) => roll.roll_state === 'bodega').length}</strong>
            <span>{formatNumber(warehouseMeters, 2)} m disponibles</span>
          </div>
        </article>
        <article>
          <span className="roll-book__metric-icon is-blue"><Activity size={17} /></span>
          <div>
            <small>En máquinas</small>
            <strong>{scopedRolls.filter((roll) => roll.roll_state === 'machine' && roll.status !== 'agotado').length}</strong>
            <span>Asignados a producción</span>
          </div>
        </article>
        <article className={lowRolls.length + exhaustedCount > 0 ? 'is-attention' : ''}>
          <span className="roll-book__metric-icon is-amber"><AlertTriangle size={17} /></span>
          <div>
            <small>Necesitan atención</small>
            <strong>{lowRolls.length + exhaustedCount}</strong>
            <span>{lowRolls.length} bajo {LOW_ROLL_PERCENT}% · {exhaustedCount} agotados</span>
          </div>
        </article>
      </section>

      {/* Barra de Plantillas Rápidas con 1-clic */}
      <section className="roll-book__quick-presets-bar" aria-label="Plantillas rápidas para ingresar rollos">
        <div className="roll-book__quick-presets-header">
          <Sparkles size={14} className="roll-book__quick-presets-icon" />
          <span><b>Ingreso rápido con 1 clic:</b> Selecciona una plantilla estándar de Visual Corp para prellenar medidas y lote</span>
        </div>
        <div className="roll-book__quick-presets-grid">
          {QUICK_ROLL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="roll-book__quick-preset-btn"
              onClick={() => applyQuickPreset(preset)}
              title={`Cargar ${preset.label} (${preset.width}cm)`}
            >
              <span className="roll-book__quick-preset-badge">{preset.icon}</span>
              <div className="roll-book__quick-preset-info">
                <b>{preset.label}</b>
                <small>{preset.width} cm · {preset.length} m</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      {estimatedCount > 0 && (
        <aside className="roll-book__estimate-notice" aria-label="Saldos estimados pendientes de medición">
          <span className="roll-book__estimate-icon"><Ruler size={17} /></span>
          <div>
            <strong>{estimatedCount} {estimatedCount === 1 ? 'saldo estimado' : 'saldos estimados'} por confirmar</strong>
            <p>El consumo registrado calcula el restante. Una medición física confirma el metraje real del rollo.</p>
          </div>
          <button type="button" onClick={() => setStateFilter('estimado')}>Revisar saldos <span aria-hidden="true">→</span></button>
        </aside>
      )}

      {realtimeState !== 'live' && (
        <p className="roll-book__sync-note" role="status">
          <Clock3 size={14} /> {lastUpdatedAt ? `Última consulta ${new Date(lastUpdatedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}.` : 'La conexión en vivo aún no está disponible.'} La pantalla se actualiza al recargar.
        </p>
      )}
      {loadError && (
        <div className="roll-book__error" role="alert">
          <CircleHelp size={17} />
          <span>No se pudieron actualizar los datos. Se conserva la última lectura disponible.</span>
          <button type="button" onClick={() => void loadRolls()} disabled={loading}>Reintentar</button>
        </div>
      )}

      {/* PANEL REDISEÑADO DE RECEPCIÓN DE ROLLOS (Recepción Rápida, Intuitiva y Automatizada) */}
      {showReceive && (
        <section className="roll-book__receive" aria-labelledby="roll-book-receive-title" id="roll-book-receive-form">
          <div className="roll-book__section-heading">
            <div>
              <span className="roll-book__kicker">Recepción de Rollos · Flujo Rápido</span>
              <h2 id="roll-book-receive-title">Ingresar rollo a bodega con trazabilidad</h2>
            </div>
            <div className="roll-book__receive-top-meta">
              <span className="roll-book__unit"><Ruler size={15} /> Metraje en metros lineales (m)</span>
            </div>
          </div>

          {!canEdit && (
            <p className="roll-book__read-only">Tu perfil tiene acceso de consulta. Solicita permiso de edición para registrar y mover rollos.</p>
          )}

          <form onSubmit={submitReceive} className="roll-book__form-v2">
            {/* 1. Selector de Sucursal y Ubicación */}
            <div className="roll-book__v2-card">
              <div className="roll-book__v2-card-header">
                <span className="roll-book__step-badge">1</span>
                <div>
                  <h3>Destino del rollo</h3>
                  <small>Selecciona la sucursal y bodega de recepción (Visual Corp por defecto)</small>
                </div>
              </div>

              <div className="roll-book__branch-selector-row">
                <span className="roll-book__field-label">Sucursal asignada:</span>
                <div className="roll-book__branch-pills" role="radiogroup" aria-label="Sucursal de recepción">
                  {branches.map((b) => {
                    const isSelected = formBranchId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`roll-book__branch-pill ${isSelected ? 'is-active' : ''}`}
                        onClick={() => setFormBranchId(b.id)}
                      >
                        {b.name.toLowerCase().includes('visual') ? '🏢 Visual Corp' : '🖨️ ' + b.name}
                        {isSelected && <Check size={14} className="roll-book__pill-check" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="roll-book__location-row">
                <label className="roll-book__field">
                  Ubicación interna en bodega
                  <select
                    required
                    value={form.location}
                    onChange={(event) => setForm({ ...form, location: event.target.value })}
                    disabled={!canEdit || !activeLocations.length}
                  >
                    {activeLocations.map((loc) => (
                      <option key={loc.code} value={loc.code}>
                        {loc.name} · {loc.code}
                      </option>
                    ))}
                    {!activeLocations.length && <option value="MAIN">MAIN · Bodega general</option>}
                  </select>
                </label>
              </div>
            </div>

            {/* 2. Selector Inteligente y Búsqueda de Material */}
            <div className="roll-book__v2-card">
              <div className="roll-book__v2-card-header">
                <span className="roll-book__step-badge">2</span>
                <div>
                  <h3>Material y variante</h3>
                  <small>Selecciona o busca el rollo específico (Lona, Vinil, Microperforado...)</small>
                </div>
              </div>

              {selectedMaterial && !isChangingMaterial ? (
                /* Tarjeta de Material Seleccionado */
                <div className="roll-book__selected-material-card">
                  <div className="roll-book__selected-material-icon">
                    <Disc3 size={24} />
                  </div>
                  <div className="roll-book__selected-material-body">
                    <h4>{selectedMaterial.name}</h4>
                    <div className="roll-book__selected-material-tags">
                      {selectedMaterial.variant && <span className="roll-book__tag-chip finish">{selectedMaterial.variant}</span>}
                      <span className="roll-book__tag-chip width">{form.width ? `${form.width} cm (${(Number(form.width) / 100).toFixed(2)}m)` : 'Ancho estándar'}</span>
                      <span className="roll-book__tag-chip sku">{selectedMaterial.sku || selectedMaterial.variantSku}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={() => setIsChangingMaterial(true)}
                  >
                    Cambiar material
                  </button>
                </div>
              ) : (
                /* Selector Inteligente con Filtros y Búsqueda */
                <div className="roll-book__material-picker">
                  <div className="roll-book__material-search-bar">
                    <div className="roll-book__material-search-input">
                      <Search size={15} />
                      <input
                        type="text"
                        placeholder="Buscar por nombre, medida (127, 310...), color o código..."
                        value={materialSearchQuery}
                        onChange={(e) => setMaterialSearchQuery(e.target.value)}
                        autoFocus
                      />
                      {materialSearchQuery && (
                        <button type="button" onClick={() => setMaterialSearchQuery('')}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div className="roll-book__material-tabs">
                      {(['todos', 'vinil', 'lona', 'micro', 'especial'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          className={materialFilterTab === tab ? 'is-active' : ''}
                          onClick={() => setMaterialFilterTab(tab)}
                        >
                          {tab === 'todos' ? 'Todos' : tab === 'vinil' ? 'Vinilos' : tab === 'lona' ? 'Lonas' : tab === 'micro' ? 'Microperforados' : 'Especiales'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="roll-book__material-candidates-list">
                    {filteredMaterialCandidates.length === 0 ? (
                      <div className="roll-book__material-empty">
                        <Boxes size={20} />
                        <span>No se encontraron rollos con esa búsqueda. Ajusta el texto o el filtro.</span>
                      </div>
                    ) : (
                      filteredMaterialCandidates.map((item) => {
                        const isChosen = form.variantId === item.variantId;
                        return (
                          <button
                            key={item.variantId}
                            type="button"
                            className={`roll-book__candidate-row ${isChosen ? 'is-selected' : ''}`}
                            onClick={() => handleSelectMaterial(item)}
                          >
                            <div className="roll-book__candidate-info">
                              <b>{item.name}</b>
                              <small>{item.variant ? `${item.variant} · ` : ''}{item.sku || item.variantSku || ''}</small>
                            </div>
                            <span className="roll-book__candidate-select-pill">
                              {isChosen ? <Check size={12} /> : 'Elegir'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Dimensiones y Metraje (Automatizado) */}
            <div className="roll-book__v2-card">
              <div className="roll-book__v2-card-header">
                <span className="roll-book__step-badge">3</span>
                <div>
                  <h3>Dimensiones y Metros a Ingresar</h3>
                  <small>Ancho en cm y largo en metros lineales</small>
                </div>
              </div>

              <div className="roll-book__dimensions-grid">
                {/* Ancho */}
                <label className="roll-book__field">
                  Ancho nominal
                  <div className="roll-book__input-unit">
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.width}
                      onChange={(event) => setForm({ ...form, width: event.target.value })}
                      placeholder="127"
                      disabled={!canEdit}
                    />
                    <i>cm</i>
                  </div>
                  <div className="roll-book__quick-chips">
                    {[107, 127, 152, 310].map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={Number(form.width) === w ? 'is-active' : ''}
                        onClick={() => setForm({ ...form, width: String(w) })}
                      >
                        {w} cm
                      </button>
                    ))}
                  </div>
                </label>

                {/* Largo nominal */}
                <label className="roll-book__field">
                  Largo nominal total
                  <div className="roll-book__input-unit">
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.nominal}
                      onChange={(event) => {
                        const val = event.target.value;
                        setForm((curr) => ({
                          ...curr,
                          nominal: val,
                          remaining: rollCondition === 'full' ? val : curr.remaining,
                        }));
                      }}
                      placeholder="50"
                      disabled={!canEdit}
                    />
                    <i>m</i>
                  </div>
                  <div className="roll-book__quick-chips">
                    {[30, 50, 100].map((l) => (
                      <button
                        key={l}
                        type="button"
                        className={Number(form.nominal) === l ? 'is-active' : ''}
                        onClick={() => {
                          setForm((curr) => ({
                            ...curr,
                            nominal: String(l),
                            remaining: rollCondition === 'full' ? String(l) : curr.remaining,
                          }));
                        }}
                      >
                        {l} m
                      </button>
                    ))}
                  </div>
                </label>

                {/* Condición: Rollo nuevo o Rollo empezado */}
                <div className="roll-book__condition-box">
                  <span className="roll-book__field-label">Condición del rollo:</span>
                  <div className="roll-book__condition-toggle" role="group">
                    <button
                      type="button"
                      className={rollCondition === 'full' ? 'is-active' : ''}
                      onClick={() => {
                        setRollCondition('full');
                        setForm((curr) => ({
                          ...curr,
                          remainingMode: 'meters',
                          remaining: curr.nominal || '50',
                          percent: '100',
                        }));
                      }}
                    >
                      📦 Rollo Nuevo Completo (100%)
                    </button>
                    <button
                      type="button"
                      className={rollCondition === 'partial' ? 'is-active' : ''}
                      onClick={() => setRollCondition('partial')}
                    >
                      ✂️ Rollo Empezado / Parcial
                    </button>
                  </div>

                  {rollCondition === 'partial' && (
                    <div className="roll-book__partial-inputs">
                      <label className="roll-book__field">
                        Metros restantes reales
                        <div className="roll-book__input-unit">
                          <input
                            required
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={form.remaining}
                            onChange={(event) => setForm({ ...form, remaining: event.target.value })}
                            placeholder="Ej. 35.5"
                          />
                          <i>m</i>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 4. Lote, Operador y Recepción Múltiple (Automatización) */}
            <div className="roll-book__v2-card">
              <div className="roll-book__v2-card-header">
                <span className="roll-book__step-badge">4</span>
                <div>
                  <h3>Identificación y Trazabilidad</h3>
                  <small>Código de rollo único y registro del operador responsable</small>
                </div>
              </div>

              <div className="roll-book__trace-grid">
                {/* Lote / Tag */}
                <label className="roll-book__field">
                  Lote / Código único del rollo
                  <div className="roll-book__tag-input-group">
                    <input
                      required
                      value={form.tag}
                      onChange={(event) => setForm({ ...form, tag: event.target.value })}
                      placeholder="Ej. ROL-VIN-2611-001"
                    />
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => setForm({ ...form, tag: generateAutoTag('ROL') })}
                      title="Generar código de lote aleatorio con fecha de hoy"
                    >
                      <Dices size={14} /> Auto
                    </button>
                  </div>
                </label>

                {/* Cantidad de rollos iguales (Recepción por lote) */}
                <label className="roll-book__field">
                  Cantidad de rollos iguales a recibir
                  <div className="roll-book__batch-stepper">
                    <button
                      type="button"
                      disabled={batchCount <= 1}
                      onClick={() => setBatchCount((c) => Math.max(1, c - 1))}
                    >
                      −
                    </button>
                    <b>{batchCount}</b>
                    <button
                      type="button"
                      disabled={batchCount >= 20}
                      onClick={() => setBatchCount((c) => Math.min(20, c + 1))}
                    >
                      +
                    </button>
                    <span className="roll-book__batch-note">
                      {batchCount > 1 ? `Genera ${batchCount} rollos con IDs secuenciales` : '1 unidad'}
                    </span>
                  </div>
                </label>

                {/* Operador */}
                <label className="roll-book__field">
                  Operador responsable
                  <input
                    value={form.operator}
                    onChange={(event) => setForm({ ...form, operator: event.target.value })}
                    placeholder={operatorDefaultName || 'Nombre del operador'}
                  />
                </label>

                {/* Motivo con chips rápidos */}
                <div className="roll-book__reason-group">
                  <label className="roll-book__field">
                    Motivo de recepción
                    <input
                      required
                      value={form.reason}
                      onChange={(event) => setForm({ ...form, reason: event.target.value })}
                      placeholder="Motivo del ingreso"
                    />
                  </label>
                  <div className="roll-book__quick-chips">
                    {['📦 Compra nueva', '🔄 Devolución de máquina', '🔍 Inventario inicial'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm({ ...form, reason: r })}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Referencia de trabajo */}
                <label className="roll-book__field">
                  Referencia de orden / factura (opcional)
                  <input
                    value={form.reference}
                    onChange={(event) => setForm({ ...form, reference: event.target.value })}
                    placeholder="Ej. Factura #4028 o OT #120"
                  />
                </label>
              </div>
            </div>

            {/* Botón Maestro de Envío */}
            <div className="roll-book__form-v2-footer">
              <div className="roll-book__footer-summary">
                {selectedMaterial ? (
                  <span>
                    Recibiendo <b>{batchCount} rollo(s)</b> de <b>{selectedMaterial.name}</b> ({form.width}cm × {form.remaining}m) en <b>{branchName(formBranchId)}</b>.
                  </span>
                ) : (
                  <span>Selecciona un material arriba para habilitar la recepción.</span>
                )}
              </div>
              <div className="roll-book__footer-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setShowReceive(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button button-dark roll-book__submit-btn-v2"
                  disabled={!canEdit || busy === 'receive' || !form.variantId}
                >
                  {busy === 'receive' ? (
                    <LoaderCircle className="roll-book__spin" size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {batchCount > 1 ? `Recibir ${batchCount} rollos en bodega` : 'Recibir rollo en bodega'}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* LISTADO DE ROLLOS Y TARJETAS CON TRAZABILIDAD AUTOMÁTICA */}
      <section className="roll-book__inventory" aria-labelledby="roll-book-list-title">
        <div className="roll-book__section-heading roll-book__section-heading--list">
          <div>
            <span className="roll-book__kicker">Trazabilidad física en vivo</span>
            <h2 id="roll-book-list-title">Rollos por ubicación <small>{visibleRolls.length}</small></h2>
          </div>
          <div className="roll-book__filters">
            <label className="roll-book__search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar material, lote o máquina"
                aria-label="Buscar rollos"
              />
              {search && (
                <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}>
                  <X size={14} />
                </button>
              )}
            </label>
            <select
              value={machineFilter}
              onChange={(event) => setMachineFilter(event.target.value)}
              aria-label="Filtrar por máquina"
            >
              <option value="all">Todas las máquinas</option>
              {machines.map((machine) => (
                <option key={machine} value={machine}>{machine}</option>
              ))}
            </select>
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              aria-label="Filtrar por ubicación de bodega"
            >
              <option value="all">Todas las ubicaciones</option>
              {locations.map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtros por Estado */}
        <div className="roll-book__state-filters" role="group" aria-label="Filtrar rollos por estado">
          {([
            ['todos', 'Todos', scopedRolls.length],
            ['bodega', 'En bodega', scopedRolls.filter((roll) => roll.roll_state === 'bodega').length],
            ['machine', 'En máquina', scopedRolls.filter((roll) => roll.roll_state === 'machine' && roll.status !== 'agotado').length],
            ['estimado', 'Por confirmar', estimatedCount],
            ['bajo', 'Bajo mínimo', lowRolls.length],
            ['agotado', 'Agotados', exhaustedCount],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={stateFilter === key ? 'is-active' : ''}
              aria-pressed={stateFilter === key}
              onClick={() => setStateFilter(key)}
            >
              {label} <b>{count}</b>
            </button>
          ))}
        </div>

        {/* Cuadrícula de Tarjetas de Rollos */}
        {loading && rolls.length === 0 ? (
          <div className="roll-book__empty">
            <LoaderCircle className="roll-book__spin" size={20} /> Cargando rollos…
          </div>
        ) : visibleRolls.length ? (
          <div className="roll-book__grid">
            {visibleRolls.map((roll) => {
              const remaining = Number(
                roll.remaining_m ??
                  (roll.standard_length_m
                    ? (Number(roll.standard_length_m) * Number(roll.remaining_percent || 0)) / 100
                    : 0)
              );
              const percent =
                roll.standard_length_m && Number(roll.standard_length_m) > 0
                  ? Math.max(0, Math.min(100, (remaining / Number(roll.standard_length_m)) * 100))
                  : null;
              const isLow = roll.status !== 'agotado' && percent !== null && percent <= LOW_ROLL_PERCENT;
              const draft = measurement[roll.id] || { meters: '', reason: '', reference: '' };
              const isBusy = busy === roll.id;

              return (
                <article
                  className={`roll-book__card ${roll.roll_state === 'machine' ? 'is-machine' : ''}${isLow ? ' is-low' : ''}${roll.status === 'agotado' ? ' is-exhausted' : ''}`}
                  key={roll.id}
                >
                  {/* Encabezado de la tarjeta */}
                  <div className="roll-book__card-top">
                    <span className={`roll-book__location ${roll.roll_state}`}>
                      <i />
                      {roll.roll_state === 'bodega' ? 'En bodega' : `En máquina: ${roll.machine_name || 'Plotter'}`}
                    </span>
                    <span className={`roll-book__status ${roll.status === 'agotado' ? 'is-empty' : isLow ? 'is-low' : ''}`}>
                      {roll.status === 'agotado' ? 'Agotado' : isLow ? 'Bajo mínimo' : roll.roll_state === 'machine' ? 'En producción' : 'Disponible'}
                    </span>
                  </div>

                  <div className="roll-book__material-heading">
                    <div>
                      <h3>{roll.material_name}</h3>
                      <p className="roll-book__variant">
                        {roll.nominal_width_cm ? `${formatNumber(Number(roll.nominal_width_cm))} cm de ancho` : 'Ancho estándar'}
                        {roll.roll_tag ? ` · Lote: ${roll.roll_tag}` : ' · Sin lote'}
                      </p>
                    </div>
                    <span className="roll-book__material-icon"><Disc3 size={20} /></span>
                  </div>

                  {/* Medida y barra */}
                  <div className="roll-book__measure">
                    <strong>{formatNumber(remaining, 3)} <small>m</small></strong>
                    <span>{percent === null ? 'Sin largo nominal' : `${formatNumber(percent, 1)}% restante`}</span>
                  </div>
                  {percent !== null && (
                    <div
                      className={`roll-book__bar${isLow ? ' is-low' : ''}`}
                      role="progressbar"
                      aria-label={`${formatNumber(remaining, 3)} metros restantes de ${roll.material_name}; ${formatNumber(percent, 1)} por ciento`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(percent)}
                    >
                      <i style={{ width: `${percent}%` }} />
                    </div>
                  )}

                  <div className="roll-book__data-line">
                    <span>{roll.standard_length_m ? `Nominal ${formatNumber(Number(roll.standard_length_m))} m` : 'Largo no registrado'}</span>
                    <span className={`roll-book__confidence${roll.remaining_is_estimate ? ' is-estimate' : ''}`}>
                      {roll.remaining_is_estimate ? 'Saldo estimado' : 'Saldo medido'}
                    </span>
                  </div>

                  <p className="roll-book__where">
                    <MapPin size={14} />
                    {branchName(roll.branch_id)} · {roll.location_code}
                  </p>

                  {/* ACCIÓN RÁPIDA DE TRAZABILIDAD (Req 4: Carga rápida a máquina en 1 clic) */}
                  {canEdit && (
                    <div className="roll-book__quick-actions-bar">
                      {roll.roll_state === 'bodega' ? (
                        <div className="roll-book__quick-machine-dispatch">
                          <span className="roll-book__quick-action-title">
                            <Zap size={13} /> Cargar a plotter con 1 clic:
                          </span>
                          <div className="roll-book__machine-pills-row">
                            {availableMachineNames.slice(0, 4).map((machineName) => (
                              <button
                                key={machineName}
                                type="button"
                                className="roll-book__machine-dispatch-btn"
                                onClick={() => void quickMoveRoll(roll, 'machine', machineName)}
                                disabled={isBusy}
                                title={`Montar este rollo en ${machineName} para iniciar producción`}
                              >
                                {isBusy ? <LoaderCircle className="roll-book__spin" size={12} /> : null}
                                {machineName.replace(/plotter\s*/i, '')}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="roll-book__quick-return-box">
                          <button
                            type="button"
                            className="roll-book__quick-return-btn"
                            onClick={() => void quickMoveRoll(roll, 'bodega')}
                            disabled={isBusy}
                            title="Desmontar rollo del plotter y devolverlo a bodega con trazabilidad"
                          >
                            <Warehouse size={13} /> Desmontar y devolver a bodega
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="roll-book__card-meta">
                    <span>
                      <Clock3 size={12} /> Actualizado {roll.last_measured_at ? new Date(roll.last_measured_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : 'sin fecha'}
                    </span>
                    {roll.operator_name && <span>Por {roll.operator_name}</span>}
                  </div>

                  {/* Acciones avanzadas (Medición, Traslado, Intercambio) */}
                  {canEdit && (
                    <details
                      className="roll-book__tools"
                      open={expandedToolsRollId === roll.id}
                      onToggle={(event) => {
                        if (!event.currentTarget.open && expandedToolsRollId === roll.id) setExpandedToolsRollId(null);
                        else if (event.currentTarget.open && expandedToolsRollId !== roll.id) setExpandedToolsRollId(roll.id);
                      }}
                    >
                      <summary>
                        <span className="roll-book__tools-title"><Ruler size={15} /> Ajuste y herramientas</span>
                        <small>Medir · mover · intercambiar</small>
                      </summary>

                      {/* Bloque de medición manual */}
                      <div className="roll-book__tool-block">
                        <b>Medición física directa</b>
                        <p className="roll-book__measurement-hint">Ingresa el metraje que ves en el rollo; al guardar quedará como saldo medido.</p>
                        <div className="roll-book__tool-fields">
                          <label>
                            Metros restantes
                            <input
                              ref={expandedToolsRollId === roll.id ? measurementInputRef : null}
                              type="number"
                              min="0"
                              {...(roll.standard_length_m ? { max: roll.standard_length_m } : {})}
                              step="0.001"
                              value={draft.meters}
                              onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, meters: event.target.value } })}
                              placeholder={formatNumber(remaining, 3)}
                            />
                          </label>
                          <label>
                            Motivo
                            <input
                              value={draft.reason}
                              onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, reason: event.target.value } })}
                              placeholder="Medición física"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="roll-book__secondary-action"
                          onClick={() => void saveMeasurement(roll)}
                          disabled={isBusy || !draft.meters || !draft.reason.trim()}
                        >
                          {isBusy ? <LoaderCircle className="roll-book__spin" size={15} /> : <Ruler size={15} />} Guardar medición
                        </button>
                      </div>

                      {/* Intercambio */}
                      {roll.roll_state === 'machine' && (
                        <div className="roll-book__tool-block">
                          <b>Intercambiar por un rollo de bodega</b>
                          <p>{warehouseReplacementCount(roll) ? `${warehouseReplacementCount(roll)} rollo(s) de esta variante están en bodega.` : 'No hay un rollo compatible en bodega.'}</p>
                          {replaceConfirmId === roll.id ? (
                            <div className="roll-book__confirm-replace">
                              <span>El rollo usado volverá a bodega y el nuevo pasará a la máquina. El saldo total no cambia.</span>
                              <button
                                type="button"
                                className="roll-book__secondary-action"
                                onClick={() => void replaceRoll(roll)}
                                disabled={isBusy || warehouseReplacementCount(roll) === 0}
                              >
                                {isBusy ? 'Intercambiando…' : 'Confirmar intercambio'}
                              </button>
                              <button type="button" className="roll-book__cancel-action" onClick={() => setReplaceConfirmId('')}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="roll-book__secondary-action"
                              onClick={() => setReplaceConfirmId(roll.id)}
                              disabled={!warehouseReplacementCount(roll)}
                            >
                              <ArrowRightLeft size={15} /> Preparar intercambio
                            </button>
                          )}
                        </div>
                      )}
                    </details>
                  )}

                  {/* Botón de Trazabilidad */}
                  <button type="button" className="roll-book__history-action" onClick={() => void openHistory(roll)}>
                    <History size={14} /> Ver trazabilidad completa
                  </button>
                </article>
              );
            })}
          </div>
        ) : scopedRolls.length > 0 ? (
          <div className="roll-book__empty">
            <Search size={21} />
            <b>No hay rollos que coincidan</b>
            <span>Ajusta la búsqueda o los filtros para ver los rollos de esta sucursal.</span>
            <button
              type="button"
              className="roll-book__clear-filters"
              onClick={() => {
                setSearch('');
                setStateFilter('todos');
                setMachineFilter('all');
                setLocationFilter('all');
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="roll-book__empty">
            <ArrowDownToLine size={21} />
            <b>Aún no hay rollos identificados</b>
            <span>Registra cada unidad física con su metraje real o estimado para comenzar el control.</span>
            {canEdit && (
              <button type="button" className="roll-book__clear-filters" onClick={() => setShowReceive(true)}>
                <Plus size={14} /> Recibir primer rollo
              </button>
            )}
          </div>
        )}
      </section>

      {/* MODAL DE HISTORIAL Y TRAZABILIDAD COMPLETA (Línea de tiempo visual) */}
      <Dialog
        open={Boolean(historyRoll)}
        onOpenChange={(open) => { if (!open) setHistoryRoll(null); }}
        eyebrow="Trazabilidad automatizada de rollo"
        title={historyRoll?.material_name || 'Historial del rollo'}
        description={historyRoll ? `Lote: ${historyRoll.roll_tag || 'Sin lote'} · ${branchName(historyRoll.branch_id)} · ${historyRoll.nominal_width_cm ? `${historyRoll.nominal_width_cm} cm` : ''}` : undefined}
        icon={<History size={18} />}
        size="lg"
        tone="info"
        className="roll-book-history"
        footer={
          <button type="button" className="roll-book__refresh" onClick={() => setHistoryRoll(null)}>
            Cerrar trazabilidad
          </button>
        }
      >
        {historyLoading ? (
          <p className="roll-book__history-state">
            <LoaderCircle className="roll-book__spin" size={18} /> Cargando movimientos…
          </p>
        ) : historyError ? (
          <div className="roll-book__history-state" role="alert">
            <span>No se pudo cargar la trazabilidad.</span>
            <button type="button" className="roll-book__history-action" onClick={() => historyRoll && void openHistory(historyRoll)}>
              Reintentar
            </button>
          </div>
        ) : historyRows.length ? (
          <div className="roll-book__timeline-wrap">
            <ol className="roll-book__history-list">
              {historyRows.map((row) => {
                const isReceive = row.event_type === 'receive';
                const isTransfer = row.event_type === 'transfer';
                const isMeasurement = row.event_type === 'measurement';

                return (
                  <li key={row.id} className={`roll-book__history-item event-${row.event_type}`}>
                    <span className="roll-book__history-marker">
                      {isReceive ? <Plus size={13} /> : isTransfer ? <ArrowRightLeft size={13} /> : <Ruler size={13} />}
                    </span>
                    <div className="roll-book__history-content">
                      <div className="roll-book__history-title-row">
                        <strong>
                          {isReceive ? '📦 Recepción en bodega' : isTransfer ? '🔄 Movimiento / Carga' : isMeasurement ? '📏 Medición física' : 'Registro de inventario'}
                        </strong>
                        <small>
                          {new Date(row.recorded_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}
                        </small>
                      </div>
                      <p className="roll-book__history-reason">
                        {row.reason || row.notes || 'Movimiento registrado'}
                        {row.work_reference ? ` · Referencia: ${row.work_reference}` : ''}
                      </p>
                      <div className="roll-book__history-meta-row">
                        {(row.previous_m !== null || row.new_m !== null) && (
                          <span className="roll-book__history-values">
                            {row.previous_m === null ? '—' : `${formatNumber(Number(row.previous_m), 3)} m`} → {row.new_m === null ? '—' : `${formatNumber(Number(row.new_m), 3)} m`}
                          </span>
                        )}
                        <span className="roll-book__history-actor">
                          Responsable: <b>{row.operator_name || 'Taller'}</b>
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <p className="roll-book__history-state">No hay movimientos registrados para este rollo.</p>
        )}
      </Dialog>
    </main>
  );
}

export default InventoryRollBook;
