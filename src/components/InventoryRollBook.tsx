import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  CircleHelp,
  Clock3,
  Disc3,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Ruler,
  Scissors,
  Search,
  Settings2,
  Sparkles,
  Warehouse,
  X,
  Zap,
} from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import {
  computeMeterStepTarget,
  computeMetersForPercent,
  computeRollMetrics,
  inferRollFamily,
  isRollRpcMissingError,
  LOW_ROLL_PERCENT,
  resolveRollFamilyMeta,
  resolveRollHealthLabel,
  resolveRollHealthTier,
  type RollFamily,
} from '../lib/inventoryRollHelpers.mjs';
import { BorderBeam } from './ui/MagicComponents';
import './InventoryRollBook.css';
import {
  RollBranchLocationCard,
  RollMaterialSelectorCard,
  RollDimensionsCard,
  RollTraceabilityCard,
  RollReceptionFooter,
  RollLiveMetric,
  RollSpoolPreview,
  RollInspectorPanel,
  type Branch,
  type InventoryItem,
  type LocationOption,
  type RollInspectorTab,
  type RollLogRecord,
  type RollRecord,
} from './inventory/rolls';

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
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message || 'Ocurrió un error inesperado.');
const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat('es-EC', { maximumFractionDigits: digits }).format(value);

const rollColumns =
  'id,organization_id,branch_id,variant_id,location_code,machine_name,material_name,material_family,roll_tag,standard_length_m,nominal_width_cm,remaining_m,remaining_percent,remaining_is_estimate,roll_state,status,operator_name,notes,last_measured_at,created_at,updated_at';

const QUICK_ROLL_PRESETS = [
  { id: 'vin-brill-127', label: 'Vinil Blanco Brillante', width: 127, length: 50, tagPrefix: 'VIN-BRILL', icon: '✨', searchTerms: ['brillante', '127', 'vinil'] },
  { id: 'vin-mate-127', label: 'Vinil Blanco Mate', width: 127, length: 50, tagPrefix: 'VIN-MATE', icon: '📄', searchTerms: ['mate', '127', 'vinil'] },
  { id: 'lona-107', label: 'Lona Front 13oz 1.07m', width: 107, length: 50, tagPrefix: 'LONA-107', icon: '📜', searchTerms: ['lona', '107'] },
  { id: 'lona-310', label: 'Lona Front 3.10m Gran Formato', width: 310, length: 50, tagPrefix: 'LONA-310', icon: '🏗️', searchTerms: ['lona', '310'] },
  { id: 'micro-152', label: 'Vinil Microperforado 1.52m', width: 152, length: 50, tagPrefix: 'MICRO-152', icon: '🪟', searchTerms: ['microperforado'] },
  { id: 'arenado-127', label: 'Vinil Arenado / Esmerilado', width: 127, length: 50, tagPrefix: 'AREN-127', icon: '❄️', searchTerms: ['arenado', 'esmerilado'] },
];

const QUICK_CARD_PERCENTS = [100, 75, 50, 25, 10, 0];
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
}: Props) {
  const [rolls, setRolls] = useState<RollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('all');
  const [stateFilter, setStateFilter] = useState<
    'todos' | 'bodega' | 'machine' | 'agotado' | 'bajo' | 'estimado'
  >('todos');
  const [familyFilter, setFamilyFilter] = useState<'todos' | RollFamily>('todos');
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [showReceive, setShowReceive] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [locationsByBranch, setLocationsByBranch] = useState<Record<string, LocationOption[]>>({});
  const [equipmentMachines, setEquipmentMachines] = useState<string[]>([]);

  // Unified Inspector state
  const [inspectedRollId, setInspectedRollId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<RollInspectorTab>('config');
  const [historyRows, setHistoryRows] = useState<RollLogRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Live 60fps card slider preview drafts (commit on release)
  const [sliderDrafts, setSliderDrafts] = useState<Record<string, number>>({});

  // Default reception branch
  const defaultBranchId = useMemo(() => {
    const found = branches.find((b) => b.name?.toLowerCase().includes('visual')) || branches[0];
    return found?.id || '';
  }, [branches]);

  // Reception form state
  const [formBranchId, setFormBranchId] = useState(defaultBranchId);
  const [rollCondition, setRollCondition] = useState<'full' | 'partial'>('full');
  const [batchCount, setBatchCount] = useState<number>(1);
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [materialFilterTab, setMaterialFilterTab] = useState<
    'todos' | 'vinil' | 'lona' | 'micro' | 'especial'
  >('todos');
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

  const rollItems = useMemo(() => {
    const candidates = inventoryItems.filter(
      (item) => !item.archived && item.variantId && unitIsMeters(item.unit)
    );
    const groupKey = String(rollGroupId || '').trim().toLowerCase();
    if (!groupKey) {
      return candidates.filter((item) =>
        /lona|vinil|papel|rollo|bobina|microperforado|banner|esmerilado|arenado/i.test(
          `${item.name} ${item.category} ${item.itemType} ${(item.tags || []).join(' ')}`
        )
      );
    }
    return candidates.filter((item) => {
      const keys = [
        item.rollGroupId,
        item.groupId,
        item.inventoryGroupId,
        item.categoryId,
        item.remoteItemId,
        item.category,
        item.name,
        item.itemType,
        ...(item.tags || []),
      ]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());
      return item.customFields?.inventory_model === 'roll' && keys.includes(groupKey);
    });
  }, [inventoryItems, rollGroupId]);

  const selectedMaterial = useMemo(
    () => rollItems.find((item) => item.variantId === form.variantId) || null,
    [rollItems, form.variantId]
  );

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

  const branchName = useCallback(
    (id: string) => branches.find((branch) => branch.id === id)?.name || 'Sucursal',
    [branches]
  );

  const generateAutoTag = useCallback((prefix = 'ROL') => {
    const date = new Date();
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${yy}${mm}-${rnd}`;
  }, []);

  const generateTagForMaterial = useCallback(
    (materialName: string) => {
      const lower = materialName.toLowerCase();
      const prefix = /lona/i.test(lower)
        ? 'ROL-LONA'
        : /micro/i.test(lower)
          ? 'ROL-MICRO'
          : /papel|sublim/i.test(lower)
            ? 'ROL-PAPEL'
            : 'ROL-VIN';
      return generateAutoTag(prefix);
    },
    [generateAutoTag]
  );

  const loadRolls = useCallback(async () => {
    if (!supabase || !organizationId) {
      setLoading(false);
      setLoadError('No hay conexión con el inventario.');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      let query = supabase
        .from('inventory_active_rolls')
        .select(rollColumns)
        .eq('organization_id', organizationId);
      const allowedBranchIds = branches.map((branch) => branch.id).filter(Boolean);
      if (branchId === 'all' && allowedBranchIds.length) {
        query = query.in('branch_id', allowedBranchIds);
      } else if (branchId !== 'all') {
        query = query.eq('branch_id', branchId);
      }
      const { data, error } = await query
        .order('roll_state')
        .order('remaining_m', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRolls((data || []) as RollRecord[]);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      onNotice?.(`No se pudieron cargar los rollos: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [organizationId, branchId, branches, onNotice]);

  useEffect(() => {
    void loadRolls();
    if (!supabase || !organizationId) {
      setRealtimeState('offline');
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`inventory-roll-book:${organizationId}:${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_active_rolls',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void loadRolls();
          }, 250);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_roll_logs',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void loadRolls();
          }, 250);
        }
      )
      .subscribe((status) =>
        setRealtimeState(
          status === 'SUBSCRIBED'
            ? 'live'
            : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
              ? 'offline'
              : 'connecting'
        )
      );
    return () => {
      if (timer) clearTimeout(timer);
      void supabase?.removeChannel(channel);
    };
  }, [organizationId, branchId, loadRolls]);

  // Fetch & cache active locations per branch (used by reception form AND inspector)
  const ensureBranchLocations = useCallback(
    async (targetBranchId: string) => {
      if (!supabase || !organizationId || !targetBranchId) return;
      if (locationsByBranch[targetBranchId]) return;
      const { data, error } = await supabase
        .from('inventory_locations')
        .select('code,name')
        .eq('organization_id', organizationId)
        .eq('branch_id', targetBranchId)
        .eq('active', true)
        .order('name');
      if (error) return;
      const next = (data || []) as LocationOption[];
      setLocationsByBranch((prev) => ({ ...prev, [targetBranchId]: next }));
    },
    [organizationId, locationsByBranch]
  );

  const targetFormBranch = formBranchId || (branchId !== 'all' ? branchId : defaultBranchId);
  const activeLocations = locationsByBranch[targetFormBranch] || [];

  useEffect(() => {
    if (!targetFormBranch) return;
    void ensureBranchLocations(targetFormBranch);
  }, [targetFormBranch, ensureBranchLocations]);

  useEffect(() => {
    if (!activeLocations.length) return;
    setForm((current) => ({
      ...current,
      location: activeLocations.some((loc) => loc.code === current.location)
        ? current.location
        : activeLocations.find((l) => l.code === 'MAIN')?.code || activeLocations[0]?.code || 'MAIN',
    }));
  }, [activeLocations]);

  useEffect(() => {
    if (branchId !== 'all') {
      setFormBranchId(branchId);
    }
  }, [branchId]);

  useEffect(() => {
    if (!supabase || !organizationId) {
      setEquipmentMachines([]);
      return;
    }
    let active = true;
    let query = supabase
      .from('equipment_assets')
      .select('name,equipment_type,status,branch_id')
      .eq('organization_id', organizationId)
      .neq('status', 'Retirado');
    if (branchId !== 'all') query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    void query.order('name').then(({ data, error }) => {
      if (!active || error) return;
      const values = (data || [])
        .filter((asset: any) =>
          /impresora|plotter|sublim|calandra|imprenta/i.test(`${asset.name} ${asset.equipment_type}`)
        )
        .map((asset: any) => String(asset.name || '').trim())
        .filter(Boolean);
      setEquipmentMachines([...new Set(values)]);
    });
    return () => {
      active = false;
    };
  }, [organizationId, branchId]);

  const groupVariantIds = useMemo(
    () => new Set(rollItems.map((item) => item.variantId).filter((id): id is string => Boolean(id))),
    [rollItems]
  );

  // Never hide active rolls silently if their variant isn't yet linked to the roll group.
  const scopedRolls = rolls;

  const inspectedRoll = useMemo(
    () => scopedRolls.find((r) => r.id === inspectedRollId) || null,
    [scopedRolls, inspectedRollId]
  );

  useEffect(() => {
    if (inspectedRoll?.branch_id) {
      void ensureBranchLocations(inspectedRoll.branch_id);
    }
  }, [inspectedRoll?.branch_id, ensureBranchLocations]);

  const visibleRolls = useMemo(
    () =>
      scopedRolls.filter((roll) => {
        if (machineFilter !== 'all' && roll.machine_name !== machineFilter) return false;
        if (locationFilter !== 'all' && roll.location_code !== locationFilter) return false;
        const family = inferRollFamily(roll.material_family, roll.material_name);
        if (familyFilter !== 'todos' && family !== familyFilter) return false;

        const metrics = computeRollMetrics(roll);
        if (stateFilter === 'agotado' && roll.status !== 'agotado' && metrics.remainingM > 0) return false;
        if (
          stateFilter === 'bajo' &&
          (roll.status === 'agotado' || metrics.percent === null || metrics.percent > LOW_ROLL_PERCENT)
        ) {
          return false;
        }
        if (stateFilter === 'estimado' && !roll.remaining_is_estimate) return false;
        if (stateFilter === 'bodega' && roll.roll_state !== 'bodega') return false;
        if (stateFilter === 'machine' && roll.roll_state !== 'machine') return false;

        const needle = search.trim().toLowerCase();
        return (
          !needle ||
          `${roll.material_name} ${roll.roll_tag} ${roll.machine_name} ${roll.notes || ''} ${roll.variant_id}`
            .toLowerCase()
            .includes(needle)
        );
      }),
    [scopedRolls, machineFilter, locationFilter, familyFilter, stateFilter, search]
  );

  const lowRolls = scopedRolls.filter((roll) => {
    if (roll.status === 'agotado') return false;
    const metrics = computeRollMetrics(roll);
    return metrics.percent !== null && metrics.percent <= LOW_ROLL_PERCENT;
  });
  const exhaustedCount = scopedRolls.filter(
    (roll) => roll.status === 'agotado' || Number(roll.remaining_m || 0) <= 0
  ).length;
  const estimatedCount = scopedRolls.filter((roll) => roll.remaining_is_estimate).length;
  const warehouseMeters = scopedRolls
    .filter((roll) => roll.roll_state === 'bodega')
    .reduce((sum, roll) => sum + Number(roll.remaining_m || 0), 0);
  const machines = [...new Set(scopedRolls.map((roll) => roll.machine_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
  const availableMachineNames = [
    ...new Set([...equipmentMachines, ...availableMachines, ...machines]),
  ].sort((a, b) => a.localeCompare(b, 'es'));
  const locations = [...new Set(scopedRolls.map((roll) => roll.location_code).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );

  const getWarehouseReplacements = useCallback(
    (roll: RollRecord) =>
      scopedRolls
        .filter(
          (candidate) =>
            candidate.id !== roll.id &&
            candidate.branch_id === roll.branch_id &&
            candidate.variant_id === roll.variant_id &&
            candidate.roll_state === 'bodega' &&
            candidate.status === 'en_bodega' &&
            Number(candidate.remaining_m || 0) > 0
        )
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
    [scopedRolls]
  );

  const loadHistory = useCallback(
    async (roll: RollRecord) => {
      if (!supabase) return;
      setHistoryRows([]);
      setHistoryError('');
      setHistoryLoading(true);
      try {
        const { data, error } = await supabase
          .from('inventory_roll_logs')
          .select(
            'id,event_type,previous_m,new_m,previous_percent,new_percent,previous_state,new_state,reason,work_reference,operator_name,recorded_at,notes'
          )
          .eq('organization_id', organizationId)
          .eq('roll_id', roll.id)
          .order('recorded_at', { ascending: false })
          .limit(40);
        if (error) throw error;
        setHistoryRows((data || []) as RollLogRecord[]);
      } catch (error) {
        const message = errorMessage(error);
        setHistoryError(message);
        onNotice?.(`No se pudo cargar el historial: ${message}`);
      } finally {
        setHistoryLoading(false);
      }
    },
    [organizationId, onNotice]
  );

  const openInspector = useCallback(
    (roll: RollRecord, tab: RollInspectorTab = 'config') => {
      setInspectedRollId(roll.id);
      setInspectorTab(tab);
      void loadHistory(roll);
      void ensureBranchLocations(roll.branch_id);
    },
    [loadHistory, ensureBranchLocations]
  );

  const handleSelectMaterial = useCallback(
    (item: InventoryItem) => {
      if (!item.variantId) return;
      const nameLower = `${item.name || ''} ${item.variant || ''} ${item.sku || ''}`.toLowerCase();
      let detectedWidth = String(item.variantAttributes?.width_cm || '');
      if (!detectedWidth) {
        const match = nameLower.match(/\b(107|127|152|310|160|200|320)\s*(?:cm|m)?\b/);
        if (match) detectedWidth = match[1];
      }
      if (!detectedWidth) detectedWidth = '127';

      const defaultNominal =
        Number(item.customFields?.default_nominal_roll_length_m) || 50;
      const nominalStr = String(defaultNominal);
      const autoTag = generateTagForMaterial(nameLower);

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
    },
    [generateTagForMaterial]
  );

  const applyQuickPreset = (preset: (typeof QUICK_ROLL_PRESETS)[0]) => {
    const found =
      rollItems.find((item) => {
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
      onNotice?.(`Plantilla cargada: ${preset.label} (${preset.width}cm × ${preset.length}m)`);
    } else {
      setShowReceive(true);
      onNotice?.('Plantilla lista. Selecciona el artículo exacto en la lista.');
    }
  };

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
    if (nominal !== null && (!Number.isFinite(nominal) || nominal <= 0)) {
      return onNotice?.('El largo nominal debe ser mayor que cero.');
    }
    if (form.remainingMode === 'percent' && nominal === null) {
      return onNotice?.('El porcentaje requiere el largo nominal del rollo.');
    }
    if (!form.reason.trim()) return onNotice?.('Indica el motivo de recepción.');
    if (
      form.remainingMode === 'meters' &&
      (!Number.isFinite(remaining) || remaining <= 0 || (nominal !== null && remaining > nominal))
    ) {
      return onNotice?.('Revisa los metros restantes. Deben ser mayores que cero y no superar el largo nominal.');
    }
    if (form.remainingMode === 'percent' && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
      return onNotice?.('El porcentaje debe estar entre 0 y 100.');
    }

    const countToReceive = Math.max(1, Math.min(20, batchCount));
    setBusy('receive');

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
      onNotice?.(
        countToReceive > 1
          ? `Se recibieron ${countToReceive} rollos con trazabilidad e IDs secuenciales.`
          : 'Rollo recibido con éxito y stock conciliado en metros.'
      );
    } catch (error) {
      onNotice?.(`No se pudo recibir el rollo: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const applyQuickPercent = async (roll: RollRecord, targetPercent: number) => {
    if (!canEdit || !supabase || busy) return false;
    if (roll.standard_length_m === null || Number(roll.standard_length_m) <= 0) {
      onNotice?.('Este rollo no tiene largo nominal; registra su medida exacta en metros.');
      return false;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(targetPercent)));
    setBusy(roll.id);
    try {
      const { error } = await supabase.rpc('update_inventory_roll_remaining', {
        p_roll_id: roll.id,
        p_remaining_m: null,
        p_remaining_percent: clamped,
        p_reason: `Ajuste rápido en vivo: ${clamped}%`,
        p_operator: operatorDefaultName || roll.operator_name || 'Taller',
        p_work_reference: '',
      });
      if (error) throw error;
      await loadRolls();
      await onRefreshInventory?.();
      if (inspectedRollId === roll.id) void loadHistory(roll);
      const estMeters = computeMetersForPercent(roll.standard_length_m, clamped);
      onNotice?.(
        `Rollo “${roll.material_name}” ajustado al ${clamped}% (~${formatNumber(estMeters ?? 0, 2)} m estimados).`
      );
      return true;
    } catch (error) {
      onNotice?.(`No se pudo ajustar el rollo: ${errorMessage(error)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const applyQuickMeterStep = async (roll: RollRecord, nextMeters: number, label: string) => {
    if (!canEdit || !supabase || busy) return false;
    setBusy(roll.id);
    try {
      const { error } = await supabase.rpc('update_inventory_roll_remaining', {
        p_roll_id: roll.id,
        p_remaining_m: nextMeters,
        p_remaining_percent: null,
        p_reason: label,
        p_operator: operatorDefaultName || roll.operator_name || 'Taller',
        p_work_reference: '',
      });
      if (error) throw error;
      await loadRolls();
      await onRefreshInventory?.();
      if (inspectedRollId === roll.id) void loadHistory(roll);
      onNotice?.(`Restante de “${roll.material_name}” actualizado a ${formatNumber(nextMeters, 2)} m.`);
      return true;
    } catch (error) {
      onNotice?.(`No se pudo actualizar el metraje: ${errorMessage(error)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveExactMeasurement = async (
    roll: RollRecord,
    payload: { meters: number; reason: string; workReference: string }
  ) => {
    if (!canEdit || !supabase || busy) return false;
    setBusy(roll.id);
    try {
      const { error } = await supabase.rpc('update_inventory_roll_remaining', {
        p_roll_id: roll.id,
        p_remaining_m: payload.meters,
        p_remaining_percent: null,
        p_reason: payload.reason,
        p_operator: operatorDefaultName || roll.operator_name || 'Taller',
        p_work_reference: payload.workReference,
      });
      if (error) throw error;
      await loadRolls();
      await onRefreshInventory?.();
      if (inspectedRollId === roll.id) void loadHistory(roll);
      onNotice?.(`Saldo medido confirmado: ${roll.material_name} → ${formatNumber(payload.meters, 3)} m.`);
      return true;
    } catch (error) {
      onNotice?.(`No se pudo guardar la medición: ${errorMessage(error)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const quickMoveRoll = async (
    roll: RollRecord,
    destination: 'bodega' | 'machine',
    targetMachine?: string
  ) => {
    if (!canEdit || !supabase || busy) return false;
    const machine = targetMachine || availableMachineNames[0] || 'Plotter';
    const reason =
      destination === 'machine'
        ? `Carga directa a ${machine} para producción`
        : 'Retorno de rollo a bodega tras producción';
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
      if (inspectedRollId === roll.id) void loadHistory(roll);
      onNotice?.(
        destination === 'machine'
          ? `Rollo cargado en “${machine}”. Trazabilidad registrada.`
          : 'Rollo devuelto a bodega. Trazabilidad registrada.'
      );
      return true;
    } catch (error) {
      onNotice?.(`No se pudo mover el rollo: ${errorMessage(error)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveRollConfig = async (
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
  ) => {
    if (!canEdit || !supabase || busy) return false;
    setBusy(roll.id);
    try {
      const { data, error } = await supabase.rpc('update_inventory_roll_config', {
        p_roll_id: roll.id,
        p_roll_tag: payload.rollTag,
        p_material_family: payload.materialFamily,
        p_standard_length_m: payload.standardLengthM,
        p_clear_standard_length: payload.clearStandardLength,
        p_location_code: payload.locationCode,
        p_notes: payload.notes,
        p_operator: operatorDefaultName || roll.operator_name || 'Taller',
        p_reason: payload.reason,
      });
      if (error) throw error;
      const changed = (data as { changed?: boolean } | null)?.changed !== false;
      await loadRolls();
      if (payload.locationCode !== roll.location_code) {
        await onRefreshInventory?.();
      }
      if (inspectedRollId === roll.id) void loadHistory(roll);
      onNotice?.(
        changed
          ? `Configuración de “${roll.material_name}” actualizada y registrada en trazabilidad.`
          : 'No hubo cambios pendientes en la configuración del rollo.'
      );
      return true;
    } catch (error) {
      if (isRollRpcMissingError(error)) {
        onNotice?.(
          'Falta aplicar la migración SQL 20261119175920_inventory_roll_config_rpc.sql en Supabase para guardar cambios de ficha.'
        );
      } else {
        onNotice?.(`No se pudo actualizar la configuración: ${errorMessage(error)}`);
      }
      return false;
    } finally {
      setBusy(null);
    }
  };

  const replaceRoll = async (roll: RollRecord) => {
    if (!canEdit || !supabase || busy) return false;
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
      if (inspectedRollId === roll.id) void loadHistory(roll);
      const activeId = (data as { active_roll_id?: string } | null)?.active_roll_id;
      const active = rolls.find((item) => item.id === activeId);
      onNotice?.(
        `Intercambio registrado. El rollo anterior quedó en bodega y ${
          active?.roll_tag ? `el lote ${active.roll_tag}` : 'el rollo de bodega'
        } pasó a máquina.`
      );
      return true;
    } catch (error) {
      onNotice?.(`No se pudo intercambiar: ${errorMessage(error)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <main className="roll-book" aria-labelledby="roll-book-title">
        {/* Cabecera Principal */}
        <header className="roll-book__header roll-book__header-panel vc-glass-frosted">
          <div className="roll-book__title-wrap">
            <span className="roll-book__mark" aria-hidden="true">
              <Scissors size={20} />
            </span>
            <div>
              <div className="roll-book__eyebrow">
                <span className={`roll-book__live-dot is-${realtimeState}`} />
                {realtimeState === 'live'
                  ? 'Sincronizado en vivo'
                  : realtimeState === 'connecting'
                    ? 'Conectando sincronización'
                    : 'Actualización manual'}
              </div>
              <h1 id="roll-book-title">Rollos y bobinas en vivo</h1>
              <p>
                Visualiza el nivel físico de cada bobina, sus configuraciones y calibración de 1 toque entre bodega y plotters.
              </p>
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
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="roll-book__refresh"
              type="button"
              onClick={() => void loadRolls()}
              disabled={loading}
            >
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
                {showReceive ? <X size={16} /> : <Plus size={16} />}{' '}
                {showReceive ? 'Cerrar recepción' : '+ Recibir rollo'}
              </button>
            )}
          </div>
        </header>

        {/* Métricas Generales con NumberFlow */}
        <section className="roll-book__metrics" aria-label="Resumen de rollos">
          <article className="vc-glass-blur">
            <span className="roll-book__metric-icon is-violet">
              <Disc3 size={17} />
            </span>
            <div>
              <small>Rollos identificados</small>
              <strong>
                <RollLiveMetric value={scopedRolls.length} format="integer" />
              </strong>
              <span>En todas las ubicaciones</span>
            </div>
          </article>

          <article className="vc-glass-blur">
            <span className="roll-book__metric-icon is-teal">
              <Warehouse size={17} />
            </span>
            <div>
              <small>En bodega</small>
              <strong>
                <RollLiveMetric
                  value={scopedRolls.filter((roll) => roll.roll_state === 'bodega').length}
                  format="integer"
                />
              </strong>
              <span>
                <RollLiveMetric value={warehouseMeters} decimals={2} suffix=" m disponibles" />
              </span>
            </div>
          </article>

          <article className="vc-glass-blur">
            <span className="roll-book__metric-icon is-blue">
              <Activity size={17} />
            </span>
            <div>
              <small>En máquinas</small>
              <strong>
                <RollLiveMetric
                  value={
                    scopedRolls.filter((roll) => roll.roll_state === 'machine' && roll.status !== 'agotado')
                      .length
                  }
                  format="integer"
                />
              </strong>
              <span>Asignados a producción</span>
            </div>
          </article>

          <article className={`vc-glass-blur ${lowRolls.length + exhaustedCount > 0 ? 'is-attention' : ''}`}>
            <span className="roll-book__metric-icon is-amber">
              <AlertTriangle size={17} />
            </span>
            <div>
              <small>Necesitan atención</small>
              <strong>
                <RollLiveMetric value={lowRolls.length + exhaustedCount} format="integer" />
              </strong>
              <span>
                {lowRolls.length} bajo {LOW_ROLL_PERCENT}% · {exhaustedCount} agotados
              </span>
            </div>
          </article>
        </section>

        {/* Barra de Plantillas Rápidas con 1-clic */}
        <section className="roll-book__quick-presets-bar" aria-label="Plantillas rápidas para ingresar rollos">
          <div className="roll-book__quick-presets-header">
            <Sparkles size={14} className="roll-book__quick-presets-icon" />
            <span>
              <b>Ingreso rápido con 1 clic:</b> Selecciona una plantilla estándar de Visual Corp para prellenar medidas y lote
            </span>
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
                  <small>
                    {preset.width} cm · {preset.length} m
                  </small>
                </div>
              </button>
            ))}
          </div>
        </section>

        {estimatedCount > 0 && (
          <aside className="roll-book__estimate-notice" aria-label="Saldos estimados pendientes de medición">
            <span className="roll-book__estimate-icon">
              <Ruler size={17} />
            </span>
            <div>
              <strong>
                {estimatedCount} {estimatedCount === 1 ? 'saldo estimado' : 'saldos estimados'} por confirmar
              </strong>
              <p>
                El ajuste rápido o consumo POS calcula el restante. Confirma la medida física para certificar el metraje real.
              </p>
            </div>
            <button type="button" onClick={() => setStateFilter('estimado')}>
              Revisar saldos <span aria-hidden="true">→</span>
            </button>
          </aside>
        )}

        {realtimeState !== 'live' && (
          <p className="roll-book__sync-note" role="status">
            <Clock3 size={14} />{' '}
            {lastUpdatedAt
              ? `Última consulta ${new Date(lastUpdatedAt).toLocaleTimeString('es-EC', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}.`
              : 'La conexión en vivo aún no está disponible.'}{' '}
            La pantalla se actualiza al recargar.
          </p>
        )}

        {loadError && (
          <div className="roll-book__error" role="alert">
            <CircleHelp size={17} />
            <span>No se pudieron actualizar los datos. Se conserva la última lectura disponible.</span>
            <button type="button" onClick={() => void loadRolls()} disabled={loading}>
              Reintentar
            </button>
          </div>
        )}

        {/* PANEL DE RECEPCIÓN EN 4 TARJETAS + VISTA PREVIA EN VIVO */}
        {showReceive && (
          <section className="roll-book__receive" aria-labelledby="roll-book-receive-title" id="roll-book-receive-form">
            <div className="roll-book__section-heading">
              <div>
                <span className="roll-book__kicker">Recepción de Rollos · Flujo Rápido</span>
                <h2 id="roll-book-receive-title">Ingresar rollo a bodega con trazabilidad</h2>
              </div>
              <div className="roll-book__receive-top-meta">
                <span className="roll-book__unit">
                  <Ruler size={15} /> Metraje en metros lineales (m)
                </span>
              </div>
            </div>

            {!canEdit && (
              <p className="roll-book__read-only">
                Tu perfil tiene acceso de consulta. Solicita permiso de edición para registrar y mover rollos.
              </p>
            )}

            <form onSubmit={submitReceive} className="roll-reception__form roll-book__form-v2">
              <RollBranchLocationCard
                branches={branches}
                formBranchId={formBranchId}
                onSelectBranch={setFormBranchId}
                location={form.location}
                onChangeLocation={(loc) => setForm((curr) => ({ ...curr, location: loc }))}
                activeLocations={activeLocations}
                disabled={!canEdit}
              />

              <RollMaterialSelectorCard
                selectedMaterial={selectedMaterial}
                isChangingMaterial={isChangingMaterial}
                onToggleChangingMaterial={setIsChangingMaterial}
                searchQuery={materialSearchQuery}
                onSearchQueryChange={setMaterialSearchQuery}
                activeTab={materialFilterTab}
                onTabChange={setMaterialFilterTab}
                candidates={filteredMaterialCandidates}
                selectedVariantId={form.variantId}
                onSelectMaterial={handleSelectMaterial}
                width={form.width}
                disabled={!canEdit}
              />

              <RollDimensionsCard
                width={form.width}
                onWidthChange={(w) => setForm((curr) => ({ ...curr, width: w }))}
                nominalLength={form.nominal}
                onNominalLengthChange={(l) =>
                  setForm((curr) => ({
                    ...curr,
                    nominal: l,
                    remaining: rollCondition === 'full' ? l : curr.remaining,
                  }))
                }
                condition={rollCondition}
                onConditionChange={setRollCondition}
                remainingMeters={form.remaining}
                onRemainingMetersChange={(m) => setForm((curr) => ({ ...curr, remaining: m }))}
                materialName={selectedMaterial?.name || 'Nuevo rollo a recibir'}
                materialFamily={
                  selectedMaterial
                    ? inferRollFamily(
                        String(selectedMaterial.customFields?.material_family || ''),
                        selectedMaterial.name || ''
                      )
                    : ''
                }
                disabled={!canEdit}
              />

              <RollTraceabilityCard
                tag={form.tag}
                onTagChange={(t) => setForm((curr) => ({ ...curr, tag: t }))}
                onAutoGenerateTag={() => setForm((curr) => ({ ...curr, tag: generateAutoTag('ROL') }))}
                batchCount={batchCount}
                onBatchCountChange={setBatchCount}
                operator={form.operator}
                onOperatorChange={(op) => setForm((curr) => ({ ...curr, operator: op }))}
                operatorDefaultName={operatorDefaultName}
                reason={form.reason}
                onReasonChange={(r) => setForm((curr) => ({ ...curr, reason: r }))}
                reference={form.reference}
                onReferenceChange={(ref) => setForm((curr) => ({ ...curr, reference: ref }))}
                disabled={!canEdit}
              />

              <RollReceptionFooter
                selectedMaterial={selectedMaterial}
                batchCount={batchCount}
                width={form.width}
                remainingMeters={form.remaining}
                branchName={branchName(formBranchId)}
                busy={busy === 'receive'}
                canEdit={canEdit}
                hasMaterial={Boolean(form.variantId)}
                onCancel={() => setShowReceive(false)}
              />
            </form>
          </section>
        )}

        {/* MONITOR EN VIVO + SPLIT STAGE CON INSPECTOR */}
        <section className="roll-book__inventory" aria-labelledby="roll-book-list-title">
          <div className="roll-book__section-heading roll-book__section-heading--list">
            <div>
              <span className="roll-book__kicker">Monitor visual + trazabilidad en vivo</span>
              <h2 id="roll-book-list-title">
                Rollos por ubicación <small>{visibleRolls.length}</small>
              </h2>
            </div>

            <div className="roll-book__filters">
              <label className="roll-book__search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar material, lote, máquina o nota"
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
                  <option key={machine} value={machine}>
                    {machine}
                  </option>
                ))}
              </select>

              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                aria-label="Filtrar por ubicación de bodega"
              >
                <option value="all">Todas las ubicaciones</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtros por Familia de Material */}
          <div className="roll-book__family-filters" role="group" aria-label="Filtrar por familia de material">
            {(
              [
                ['todos', 'Todas las familias'],
                ['lona', 'Lonas'],
                ['vinil', 'Viniles'],
                ['papel', 'Papel'],
                ['otro', 'Otros'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={familyFilter === key ? 'is-active' : ''}
                aria-pressed={familyFilter === key}
                onClick={() => setFamilyFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filtros por Estado */}
          <div className="roll-book__state-filters" role="group" aria-label="Filtrar rollos por estado">
            {(
              [
                ['todos', 'Todos', scopedRolls.length],
                ['machine', 'En máquina', scopedRolls.filter((r) => r.roll_state === 'machine' && r.status !== 'agotado').length],
                ['bodega', 'En bodega', scopedRolls.filter((r) => r.roll_state === 'bodega').length],
                ['estimado', 'Por confirmar', estimatedCount],
                ['bajo', 'Bajo mínimo', lowRolls.length],
                ['agotado', 'Agotados', exhaustedCount],
              ] as const
            ).map(([key, label, count]) => (
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

          {loading && rolls.length === 0 ? (
            <div className="roll-book__empty">
              <LoaderCircle className="roll-book__spin" size={20} /> Cargando rollos en vivo…
            </div>
          ) : visibleRolls.length ? (
            <div className={`roll-book__stage ${inspectedRoll ? 'has-inspector' : ''}`}>
              <div className="roll-book__grid">
                {visibleRolls.map((roll) => {
                  const baseMetrics = computeRollMetrics(roll);
                  const draftPct = sliderDrafts[roll.id];
                  const isDragging = draftPct !== undefined;
                  const displayPercent =
                    isDragging && baseMetrics.nominalM !== null ? draftPct : baseMetrics.percent;
                  const displayMeters =
                    isDragging && baseMetrics.nominalM !== null
                      ? computeMetersForPercent(baseMetrics.nominalM, draftPct) ?? baseMetrics.remainingM
                      : baseMetrics.remainingM;
                  const displayAreaM2 =
                    baseMetrics.widthCm !== null
                      ? Math.round(((baseMetrics.widthCm / 100) * displayMeters + Number.EPSILON) * 100) / 100
                      : null;

                  const tier = resolveRollHealthTier({
                    status: roll.status,
                    remainingM: displayMeters,
                    percent: displayPercent,
                  });
                  const healthLabel = resolveRollHealthLabel(tier, roll.roll_state);
                  const familyMeta = resolveRollFamilyMeta(roll.material_family, roll.material_name);
                  const replacements = getWarehouseReplacements(roll);
                  const isBusy = busy === roll.id;
                  const isInspected = inspectedRollId === roll.id;
                  const isCatalogLinked = groupVariantIds.has(roll.variant_id);

                  return (
                    <article
                      key={roll.id}
                      className={`roll-book__card vc-glass-blur ${
                        roll.roll_state === 'machine' ? 'is-machine' : ''
                      } is-${tier} ${isInspected ? 'is-inspected' : ''}`}
                    >
                      {tier === 'critical' && (
                        <BorderBeam
                          label="Rollo por agotarse"
                          colorFrom="#ef4444"
                          colorTo="#f59e0b"
                          borderWidth={1.5}
                          duration={5.5}
                        />
                      )}

                      {/* Top Status & Placement */}
                      <div className="roll-book__card-top">
                        <span className={`roll-book__location ${roll.roll_state}`}>
                          <span className="roll-book__location-pulse" aria-hidden="true" />
                          {roll.roll_state === 'machine'
                            ? `En máquina: ${roll.machine_name || 'Plotter'}`
                            : `En bodega · ${roll.location_code}`}
                        </span>

                        <div className="roll-book__status-group">
                          {!isCatalogLinked && (
                            <span
                              className="roll-book__unlinked-badge"
                              title="Variante fuera del grupo principal de rollos"
                            >
                              Sin grupo
                            </span>
                          )}
                          <span className={`roll-book__status is-tier-${tier}`}>{healthLabel}</span>
                        </div>
                      </div>

                      {/* Title */}
                      <div className="roll-book__card-title-row">
                        <h3 title={roll.material_name}>{roll.material_name}</h3>
                        <p className="roll-book__variant">
                          {branchName(roll.branch_id)} · {roll.location_code}
                          {roll.roll_tag ? ` · Lote: ${roll.roll_tag}` : ' · Sin lote'}
                        </p>
                      </div>

                      {/* Live Visual Spool + Animated Metrics */}
                      <div className="roll-book__visual-hero">
                        <RollSpoolPreview
                          materialName={roll.material_name}
                          materialFamily={familyMeta.id}
                          remainingM={displayMeters}
                          standardLengthM={baseMetrics.nominalM}
                          percent={displayPercent}
                          widthCm={baseMetrics.widthCm}
                          isActiveOnMachine={roll.roll_state === 'machine'}
                          status={displayMeters <= 0 ? 'agotado' : roll.status}
                          size="compact"
                          showWidthBar
                        />

                        <div className="roll-book__visual-metrics">
                          <div className="roll-book__primary-readout">
                            {displayPercent !== null ? (
                              <strong className="roll-book__pct-hero">
                                <RollLiveMetric
                                  value={displayPercent}
                                  decimals={isDragging ? 0 : 1}
                                  suffix="%"
                                  willChange
                                />
                              </strong>
                            ) : (
                              <strong className="roll-book__pct-hero">
                                <RollLiveMetric value={displayMeters} decimals={2} suffix=" m" willChange />
                              </strong>
                            )}
                            <span className="roll-book__meters-hero">
                              <RollLiveMetric value={displayMeters} decimals={2} suffix=" m" willChange />
                            </span>
                          </div>

                          <div className="roll-book__sub-metrics">
                            <span>
                              {baseMetrics.nominalM
                                ? `de ${formatNumber(baseMetrics.nominalM, 0)} m nominal`
                                : 'Sin largo nominal'}
                            </span>
                            {displayAreaM2 !== null && (
                              <span>
                                · <RollLiveMetric value={displayAreaM2} decimals={2} suffix=" m²" />
                              </span>
                            )}
                          </div>

                          <div className="roll-book__confidence-row">
                            <span
                              className={`roll-book__confidence${roll.remaining_is_estimate ? ' is-estimate' : ''}`}
                            >
                              {roll.remaining_is_estimate ? 'Saldo estimado' : 'Saldo medido'}
                            </span>
                            {roll.remaining_is_estimate && canEdit && (
                              <button
                                type="button"
                                className="roll-book__confirm-inline-btn"
                                onClick={() => openInspector(roll, 'calibrate')}
                                disabled={isBusy}
                              >
                                Confirmar medida
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Visible Configuration Summary Chips */}
                      <div className="roll-book__spec-strip" aria-label="Configuración resumida del rollo">
                        <span className="roll-book__spec-chip">
                          Ancho: {baseMetrics.widthCm ? `${formatNumber(baseMetrics.widthCm)} cm` : 'Estándar'}
                        </span>
                        <span className="roll-book__spec-chip">Familia: {familyMeta.label}</span>
                        {roll.notes && (
                          <span className="roll-book__spec-chip" title={roll.notes}>
                            Nota: {roll.notes.length > 26 ? `${roll.notes.slice(0, 26)}…` : roll.notes}
                          </span>
                        )}
                      </div>

                      {/* Immediate Warehouse Backup Status */}
                      <div
                        className={`roll-book__backup-banner ${
                          replacements.length > 0 ? 'has-stock' : 'no-stock'
                        } ${tier === 'critical' || tier === 'warning' || tier === 'exhausted' ? 'is-urgent' : ''}`}
                      >
                        <Warehouse size={13} aria-hidden="true" />
                        <span>
                          {replacements.length > 0
                            ? `Bodega: ${replacements.length} bobina${replacements.length === 1 ? '' : 's'} de repuesto compatible${replacements.length === 1 ? '' : 's'}`
                            : 'Bodega: sin repuesto compatible disponible'}
                        </span>
                      </div>

                      {/* 1-Touch Calibration Directly on Card */}
                      {canEdit && (
                        <div className="roll-book__quick-calibrate">
                          <div className="roll-book__quick-calibrate-head">
                            <span>
                              {baseMetrics.nominalM !== null
                                ? 'Calibración rápida (%)'
                                : 'Descuento rápido (m)'}
                            </span>
                            {isDragging && <span>Soltar para guardar: {draftPct}%</span>}
                          </div>

                          {baseMetrics.nominalM !== null ? (
                            <>
                              <div className="roll-book__quick-pct-row" role="group" aria-label="Porcentaje rápido">
                                {QUICK_CARD_PERCENTS.map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    className={Math.round(displayPercent ?? -1) === pct ? 'is-selected' : ''}
                                    disabled={isBusy}
                                    onClick={() => {
                                      setSliderDrafts((prev) => {
                                        const copy = { ...prev };
                                        delete copy[roll.id];
                                        return copy;
                                      });
                                      void applyQuickPercent(roll, pct);
                                    }}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>

                              <input
                                type="range"
                                className="roll-book__card-slider"
                                min={0}
                                max={100}
                                step={5}
                                disabled={isBusy}
                                value={Math.round(displayPercent ?? 0)}
                                onChange={(e) => {
                                  const nextVal = Number(e.target.value);
                                  setSliderDrafts((prev) => ({ ...prev, [roll.id]: nextVal }));
                                }}
                                onPointerUp={() => {
                                  const pending = sliderDrafts[roll.id];
                                  if (pending === undefined) return;
                                  setSliderDrafts((prev) => {
                                    const copy = { ...prev };
                                    delete copy[roll.id];
                                    return copy;
                                  });
                                  if (busy || Math.round(baseMetrics.percent ?? -1) === pending) return;
                                  void applyQuickPercent(roll, pending);
                                }}
                                onKeyUp={(e) => {
                                  if (!SLIDER_COMMIT_KEYS.has(e.key)) return;
                                  const pending = sliderDrafts[roll.id];
                                  if (pending === undefined) return;
                                  setSliderDrafts((prev) => {
                                    const copy = { ...prev };
                                    delete copy[roll.id];
                                    return copy;
                                  });
                                  if (busy || Math.round(baseMetrics.percent ?? -1) === pending) return;
                                  void applyQuickPercent(roll, pending);
                                }}
                                aria-label={`Calibrar porcentaje restante de ${roll.material_name}`}
                              />
                            </>
                          ) : (
                            <div className="roll-book__quick-meter-row">
                              {[-5, -2, -1].map((delta) => (
                                <button
                                  key={delta}
                                  type="button"
                                  disabled={isBusy || baseMetrics.remainingM <= 0}
                                  onClick={() =>
                                    void applyQuickMeterStep(
                                      roll,
                                      computeMeterStepTarget(baseMetrics.remainingM, delta, null),
                                      `Descuento rápido ${delta} m`
                                    )
                                  }
                                >
                                  {delta} m
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => openInspector(roll, 'calibrate')}
                              >
                                Medir
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Quick Bodega <-> Plotter Dispatch */}
                      {canEdit && (
                        <div className="roll-book__quick-actions-bar">
                          {roll.roll_state === 'bodega' ? (
                            <div className="roll-book__quick-machine-dispatch">
                              <span className="roll-book__quick-action-title">
                                <Zap size={13} /> Cargar a plotter con 1 clic:
                              </span>
                              <div className="roll-book__machine-pills-row">
                                {availableMachineNames.slice(0, 3).map((machineName) => (
                                  <button
                                    key={machineName}
                                    type="button"
                                    className="roll-book__machine-dispatch-btn"
                                    onClick={() => void quickMoveRoll(roll, 'machine', machineName)}
                                    disabled={isBusy}
                                    title={`Montar en ${machineName}`}
                                  >
                                    {isBusy ? <LoaderCircle className="roll-book__spin" size={12} /> : null}
                                    {machineName.replace(/plotter\s*/i, '')}
                                  </button>
                                ))}
                                {availableMachineNames.length > 3 && (
                                  <button
                                    type="button"
                                    className="roll-book__machine-dispatch-btn"
                                    onClick={() => openInspector(roll, 'config')}
                                    disabled={isBusy}
                                  >
                                    + Elegir plotter
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="roll-book__quick-return-box">
                              <button
                                type="button"
                                className="roll-book__quick-return-btn"
                                onClick={() => void quickMoveRoll(roll, 'bodega')}
                                disabled={isBusy}
                              >
                                <Warehouse size={13} /> Desmontar a bodega
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="roll-book__card-meta">
                        <span>
                          <Clock3 size={12} />{' '}
                          {roll.last_measured_at
                            ? new Date(roll.last_measured_at).toLocaleString('es-EC', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : 'sin fecha'}
                        </span>
                        {roll.operator_name && <span>Por {roll.operator_name}</span>}
                      </div>

                      <div className="roll-book__card-actions-foot">
                        <button
                          type="button"
                          className={`roll-book__inspect-btn ${isInspected ? 'is-active' : ''}`}
                          onClick={() =>
                            isInspected ? setInspectedRollId(null) : openInspector(roll, 'config')
                          }
                        >
                          <Settings2 size={14} aria-hidden="true" />
                          {isInspected ? 'Inspector abierto' : 'Configurar y trazabilidad'}
                        </button>
                        {roll.roll_state === 'machine' && replacements.length > 0 && canEdit && (
                          <button
                            type="button"
                            className="roll-book__inspect-btn"
                            onClick={() => openInspector(roll, 'traceability')}
                            title="Intercambiar por bobina compatible de bodega"
                          >
                            <ArrowRightLeft size={14} aria-hidden="true" /> Intercambiar
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Dedicated Inspector Panel (Sticky Desktop / Sheet Tablet / Vaul Mobile) */}
              <RollInspectorPanel
                roll={inspectedRoll}
                open={Boolean(inspectedRoll)}
                activeTab={inspectorTab}
                onTabChange={setInspectorTab}
                onClose={() => setInspectedRollId(null)}
                canEdit={canEdit}
                busy={Boolean(inspectedRoll && busy === inspectedRoll.id)}
                isCatalogLinked={Boolean(inspectedRoll && groupVariantIds.has(inspectedRoll.variant_id))}
                branchName={inspectedRoll ? branchName(inspectedRoll.branch_id) : 'Sucursal'}
                availableMachines={availableMachineNames}
                locations={inspectedRoll ? locationsByBranch[inspectedRoll.branch_id] || [] : []}
                warehouseReplacements={inspectedRoll ? getWarehouseReplacements(inspectedRoll) : []}
                onQuickPercent={applyQuickPercent}
                onQuickMeterStep={applyQuickMeterStep}
                onSaveMeasurement={saveExactMeasurement}
                onMoveRoll={quickMoveRoll}
                onSaveConfig={saveRollConfig}
                onReplaceRoll={replaceRoll}
                historyRows={historyRows}
                historyLoading={historyLoading}
                historyError={historyError}
                onReloadHistory={loadHistory}
                onAutoGenerateTag={generateTagForMaterial}
              />
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
                  setFamilyFilter('todos');
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
                <button
                  type="button"
                  className="roll-book__clear-filters"
                  onClick={() => setShowReceive(true)}
                >
                  <Plus size={14} /> Recibir primer rollo
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </MotionConfig>
  );
}

export default InventoryRollBook;
