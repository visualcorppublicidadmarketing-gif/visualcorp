import React, { useState, useMemo } from 'react';
import {
  Printer,
  Scissors,
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  ExternalLink,
  ChevronRight,
  RotateCcw,
  Zap,
  Flame,
  Shirt,
  Box,
  Cpu,
  Radio,
  Plus,
  Trash2,
  Eye,
  Check,
  Play,
  CheckSquare,
  Square,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import {
  filterOrdersByWorkstationArea,
  updateOrderStationStage,
  toggleOrderItemStationCheck,
  logMaterialScrap,
  toISODate,
  getRoleCapabilities
} from '../../lib/posStore';

export function POSStationWorkspaces({
  store,
  setStore,
  session,
  activeStation = 'impresion', // 'impresion' | 'sublimacion' | 'corte_laser'
  onStationChange,
  onOpenWorkOrder
}) {
  const [station, setStation] = useState(activeStation);
  const [viewMode, setViewMode] = useState('columns'); // 'columns' | 'list'
  const [machineFilter, setMachineFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Scrap Modal
  const [scrapModalOrder, setScrapModalOrder] = useState(null);
  const [scrapMaterialId, setScrapMaterialId] = useState(store.materials?.[0]?.id || '');
  const [scrapQuantityM2, setScrapQuantityM2] = useState('1.5');
  const [scrapReason, setScrapReason] = useState('Atasco de cabezal / Falla inyección');
  const [scrapNotes, setScrapNotes] = useState('');

  const capabilities = getRoleCapabilities(session?.role);
  const stationIds = ['impresion', 'sublimacion', 'corte_laser'];
  const allowedStations = (capabilities.isAdmin || capabilities.isWorkshopCoordinator)
    ? stationIds
    : stationIds.filter((area) => capabilities.managedAreas.includes(area));
  const requestedStation = onStationChange ? activeStation : station;
  const currentStation = allowedStations.includes(requestedStation) ? requestedStation : (allowedStations[0] || requestedStation);
  const setStationTab = onStationChange || setStation;

  // Filter orders for the active station
  const stationOrders = useMemo(() => {
    const raw = filterOrdersByWorkstationArea(store.orders || [], currentStation);
    return raw.filter((o) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          (o.orderNumber || '').includes(q) ||
          (o.customerName || '').toLowerCase().includes(q) ||
          (o.jobName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (machineFilter !== 'all') {
        return (o.machineAssigned || '').toLowerCase().includes(machineFilter.toLowerCase());
      }
      return true;
    });
  }, [store.orders, currentStation, searchQuery, machineFilter]);

  // Split into 3 columns:
  // 1. pending / in queue ('pendiente', 'en_cola', or undefined)
  // 2. currently working / printing ('en_maquina')
  // 3. printed / curing / finishes ('en_secado', 'armado', 'aprobado_qc', 'listo_entrega')
  const columns = useMemo(() => {
    const pending = [];
    const inProgress = [];
    const completed = [];

    stationOrders.forEach((o) => {
      const st = o.stationStage || (o.productionStage === 'impresion' ? 'en_maquina' : 'en_cola');
      if (st === 'en_maquina') {
        inProgress.push(o);
      } else if (st === 'en_secado' || st === 'armado' || st === 'aprobado_qc' || st === 'listo_entrega' || o.productionStage === 'acabados' || o.productionStage === 'control_calidad' || o.productionStage === 'listo') {
        completed.push(o);
      } else {
        pending.push(o);
      }
    });

    return { pending, inProgress, completed };
  }, [stationOrders]);

  // Handle stage transition
  const handleUpdateStationStage = (orderId, stageName, note) => {
    const res = updateOrderStationStage(store, orderId, stageName, note, session?.id);
    if (res.ok) {
      setStore(res.updatedStore);
    }
  };

  // Toggle item printed checkbox
  const handleToggleItemPrinted = (orderId, itemKey) => {
    const res = toggleOrderItemStationCheck(store, orderId, itemKey, session?.id);
    if (res.ok) {
      setStore(res.updatedStore);
    }
  };

  // Handle Scrap Submit
  const handleSaveScrap = (e) => {
    e.preventDefault();
    const res = logMaterialScrap(store, {
      materialId: scrapMaterialId,
      quantityM2: Number(scrapQuantityM2),
      reason: scrapReason,
      notes: scrapNotes,
      advisorId: session?.id || ''
    });
    if (res.ok) {
      setStore(res.updatedStore);
      setScrapModalOrder(null);
      setScrapNotes('');
    }
  };

  const stationMeta = {
    impresion: {
      color: '#2563eb',
      col1Title: '⏳ 1. Por Imprimir / En Cola',
      col1Sub: 'Listos para ripear o cargar bobina',
      col1Btn: '▶ Iniciar Impresión en Máquina',
      col2Title: '🖨️ 2. Imprimiendo en Plotter',
      col2Sub: 'En máquina / marca ítems impresos',
      col2Btn: '✓ Impresión Lista ➔ A Secado',
      col3Title: '✅ 3. Impreso / En Secado & Acabados',
      col3Sub: 'En reposo o mesa de confección/ojales',
      col3Badge: '✓ Impreso / En Acabados'
    },
    sublimacion: {
      color: '#db2777',
      col1Title: '⏳ 1. Por Sublimar / En Cola',
      col1Sub: 'Preparar film DTF o papel transfer',
      col1Btn: '🔥 Cargar en Plancha Térmica / DTF',
      col2Title: '🔥 2. En Plancha / Termofijando',
      col2Sub: 'En termo-fijado / marca prendas listas',
      col2Btn: '✓ Termofijado Listo ➔ A Confección',
      col3Title: '🧵 3. Confección, Relleno & Empaque',
      col3Sub: 'Almohadas con plumón y empaque listo',
      col3Badge: '✓ Confección y Empaque Terminado'
    },
    corte_laser: {
      color: '#7c3aed',
      col1Title: '⏳ 1. Por Cortar / En Cola',
      col1Sub: 'Verificar vector DXF y espesor de plancha',
      col1Btn: '⚙️ Cargar en Mesa Láser / CNC',
      col2Title: '⚡ 2. En Láser / Ruteado CNC',
      col2Sub: 'En mesa de corte / marca piezas listas',
      col2Btn: '✓ Corte Listo ➔ A Pulido y Armado',
      col3Title: '💡 3. Pulido, Neón & Test 12V',
      col3Sub: 'Herrajes Standoff y test eléctrico aprobado',
      col3Badge: '✓ Ensamblaje y Calidad Aprobada'
    }
  };

  const meta = stationMeta[currentStation] || stationMeta.impresion;

  // Render a single order card
  const renderOrderCard = (order, columnType) => {
    const isUrgent = order.productionPriority === 'urgente' || order.priority === 'urgente';
    const items = order.items || [];
    const printedMap = order.printedItems || {};
    const printedCount = items.filter((it, idx) => printedMap[it.id || idx]).length;
    const allItemsPrinted = items.length > 0 && printedCount === items.length;

    return (
      <div
        key={order.id}
        style={{
          background: columnType === 'inProgress' ? '#f0fdf4' : '#ffffff',
          borderRadius: '12px',
          border: columnType === 'inProgress'
            ? '2px solid #22c55e'
            : isUrgent
            ? '1.5px solid #ef4444'
            : '1px solid var(--line)',
          padding: '12px 14px',
          boxShadow: columnType === 'inProgress' ? '0 4px 12px rgba(34, 197, 94, 0.15)' : '0 1px 4px rgba(0,0,0,0.04)',
          display: 'grid',
          gap: '8px'
        }}
      >
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 900, color: 'var(--ink)' }}>
              #{order.orderNumber}
            </span>
            {isUrgent && (
              <span style={{ fontSize: '9.5px', background: '#dc2626', color: '#fff', fontWeight: 900, padding: '2px 5px', borderRadius: '4px' }}>
                🔥 URGENTE
              </span>
            )}
            {order.requiresInstallation && (
              <span style={{ fontSize: '9.5px', background: '#cffafe', color: '#0e7490', fontWeight: 900, padding: '2px 5px', borderRadius: '4px' }}>
                🚚 Montaje
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            {order.artUrl && (
              <a
                href={order.artUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'var(--orange-soft)',
                  border: '1px solid var(--orange)',
                  color: 'var(--orange-dark)',
                  borderRadius: '6px',
                  padding: '3px 7px',
                  fontSize: '11px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
                title="Abrir vector / archivo para RIP"
              >
                <ExternalLink size={11} /> Vector
              </a>
            )}
            <button
              type="button"
              onClick={() => onOpenWorkOrder && onOpenWorkOrder(order)}
              style={{
                background: '#f1f5f9',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '3px 6px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
              title="Ver Orden de Trabajo (OT)"
            >
              <FileText size={12} />
            </button>
          </div>
        </div>

        {/* Job Title and Customer */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', lineHeight: '1.25' }}>
            {order.jobName || 'Trabajo Publicitario'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
            👤 <strong>{order.customerName}</strong>
            {order.deliveryDate && ` · Entrega: ${order.deliveryDate}`}
          </div>
        </div>

        {/* Machine Tag */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', background: '#f8fafc', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
          <span>⚙️ <strong>{order.machineAssigned || (currentStation === 'sublimacion' ? 'Plancha Neumática DTF' : currentStation === 'corte_laser' ? 'Láser CO2 130W' : 'Plotter Flora 3.20m')}</strong></span>
          <span>👷 {order.technicianAssigned || 'Operario'}</span>
        </div>

        {/* Items Checklist for this Order */}
        <div style={{ display: 'grid', gap: '4px', background: '#fff', borderRadius: '8px', padding: '6px 8px', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>
            <span>Ítems / Productos ({items.length})</span>
            {items.length > 0 && (
              <span style={{ color: allItemsPrinted ? '#16a34a' : 'var(--orange-dark)' }}>
                {printedCount} de {items.length} listos
              </span>
            )}
          </div>

          {items.map((it, idx) => {
            const itemKey = it.id || idx;
            const isChecked = Boolean(printedMap[itemKey]);

            return (
              <div
                key={idx}
                onClick={() => handleToggleItemPrinted(order.id, itemKey)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  background: isChecked ? '#f0fdf4' : '#fafafa',
                  border: isChecked ? '1px solid #bbf7d0' : '1px solid #f1f5f9',
                  cursor: 'pointer',
                  fontSize: '11px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  {isChecked ? (
                    <CheckSquare size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                  ) : (
                    <Square size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  )}
                  <span style={{
                    fontWeight: 700,
                    textDecoration: isChecked ? 'line-through' : 'none',
                    color: isChecked ? '#16a34a' : 'var(--ink)',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap'
                  }}>
                    {it.productName}
                  </span>
                </div>

                <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 800, flexShrink: 0, marginLeft: '6px' }}>
                  {it.widthCm && it.heightCm ? `${it.widthCm}×${it.heightCm}cm` : `x${it.quantity}`}
                  {it.areaM2 ? ` (${it.areaM2}m²)` : ''}
                </span>
              </div>
            );
          })}
        </div>

        {/* Column Action Buttons (1-Click Workflow Advance) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', marginTop: '4px' }}>
          {columnType === 'pending' && (
            <button
              type="button"
              onClick={() => handleUpdateStationStage(order.id, 'en_maquina', 'Iniciado en máquina')}
              style={{
                background: meta.color,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}
            >
              <Play size={13} fill="#fff" /> {meta.col1Btn}
            </button>
          )}

          {columnType === 'inProgress' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleUpdateStationStage(order.id, 'en_secado', 'Trabajo completado en máquina')}
                style={{
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.2)'
                }}
              >
                <Check size={14} /> {meta.col2Btn}
              </button>
              <button
                type="button"
                onClick={() => setScrapModalOrder(order)}
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
                title="Registrar merma o fallo técnico"
              >
                ⚠️ Merma
              </button>
            </div>
          )}

          {columnType === 'completed' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} /> {meta.col3Badge}
              </span>
              <button
                type="button"
                onClick={() => handleUpdateStationStage(order.id, 'en_maquina', 'Reabierto o devuelto a máquina')}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: 'var(--muted)',
                  cursor: 'pointer'
                }}
                title="Devolver a máquina"
              >
                ↺ Devolver
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* ----------------------------------------------------------------------
          TOP CONTROLS & STATION SWITCHER BAR
          ---------------------------------------------------------------------- */}
      <div className="pos-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {currentStation === 'impresion' && <Printer size={22} style={{ color: '#2563eb' }} />}
              {currentStation === 'sublimacion' && <Flame size={22} style={{ color: '#db2777' }} />}
              {currentStation === 'corte_laser' && <Zap size={22} style={{ color: '#7c3aed' }} />}
              <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: 'var(--ink)' }}>
                {currentStation === 'impresion' && 'Estación de Impresión (Gran Formato & Digital)'}
                {currentStation === 'sublimacion' && 'Estación de Sublimación & Textil DTF'}
                {currentStation === 'corte_laser' && 'Estación de Corte Láser, CNC & Neón LED'}
              </h1>
              <span className="pos-nav-badge" style={{ background: '#f1f5f9', color: 'var(--ink)', fontSize: '11.5px', fontWeight: 800 }}>
                {stationOrders.length} trabajos
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              Panel de control de producción con 3 estados: <strong>Por Fabricar</strong>, <strong>En Proceso / Máquina</strong> y <strong>Terminado / Acabados</strong>.
            </p>
          </div>

          {/* Station Switcher Tabs */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {allowedStations.includes('impresion') && <>
            <button
              type="button"
              onClick={() => setStationTab('impresion')}
              style={{
                background: currentStation === 'impresion' ? '#2563eb' : '#fff',
                color: currentStation === 'impresion' ? '#fff' : 'var(--ink)',
                border: currentStation === 'impresion' ? '1px solid #2563eb' : '1px solid var(--line)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Printer size={14} /> 🖨️ Impresión
            </button>
            </>}
            {allowedStations.includes('sublimacion') && <>
            <button
              type="button"
              onClick={() => setStationTab('sublimacion')}
              style={{
                background: currentStation === 'sublimacion' ? '#db2777' : '#fff',
                color: currentStation === 'sublimacion' ? '#fff' : 'var(--ink)',
                border: currentStation === 'sublimacion' ? '1px solid #db2777' : '1px solid var(--line)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Flame size={14} /> 👕 Sublimación
            </button>
            </>}
            {allowedStations.includes('corte_laser') && <>
            <button
              type="button"
              onClick={() => setStationTab('corte_laser')}
              style={{
                background: currentStation === 'corte_laser' ? '#7c3aed' : '#fff',
                color: currentStation === 'corte_laser' ? '#fff' : 'var(--ink)',
                border: currentStation === 'corte_laser' ? '1px solid #7c3aed' : '1px solid var(--line)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Zap size={14} /> ⚡ Corte Láser
            </button>
            </>}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '14px 0' }} />

        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)' }}>Máquina:</span>
            <select
              className="pos-select"
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              style={{ fontSize: '12px', padding: '5px 8px', width: 'auto' }}
            >
              <option value="all">Todas las Máquinas</option>
              {currentStation === 'impresion' && (
                <>
                  <option value="Flora">Plotter Flora Solvente 3.20m</option>
                  <option value="Roland">Plotter Roland TrueVIS 1.60m</option>
                  <option value="Konica">Prensa Digital Konica</option>
                </>
              )}
              {currentStation === 'sublimacion' && (
                <>
                  <option value="DTF">Plotter Textil DTF 60cm</option>
                  <option value="Plancha">Plancha Térmica Neumática</option>
                </>
              )}
              {currentStation === 'corte_laser' && (
                <>
                  <option value="Láser">Cortadora Láser CO2</option>
                  <option value="CNC">Ruteadora CNC 1.30x2.50m</option>
                </>
              )}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              className="pos-input"
              placeholder="🔎 Buscar # orden, cliente, trabajo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 10px', width: '220px' }}
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------
          3-STATE PRODUCTION BOARD (POR FABRICAR | EN MÁQUINA | TERMINADO)
          ---------------------------------------------------------------------- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
        gap: '16px',
        alignItems: 'start'
      }}>
        {/* COLUMN 1: POR FABRICAR / EN COLA */}
        <div style={{
          background: '#f8fafc',
          borderRadius: '14px',
          border: '1.5px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '450px'
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #cbd5e1',
            background: '#ffffff',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '4px solid #f59e0b'
          }}>
            <div>
              <strong style={{ fontSize: '13.5px', color: '#b45309', display: 'block' }}>
                {meta.col1Title}
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: '11px' }}>{meta.col1Sub}</small>
            </div>
            <span style={{ fontSize: '12px', background: '#fef3c7', color: '#b45309', fontWeight: 900, padding: '2px 8px', borderRadius: '8px' }}>
              {columns.pending.length}
            </span>
          </div>

          <div style={{ padding: '12px', display: 'grid', gap: '10px', alignContent: 'start', flex: 1 }}>
            {columns.pending.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '12px' }}>
                ✓ No hay trabajos pendientes en cola
              </div>
            ) : (
              columns.pending.map((order) => renderOrderCard(order, 'pending'))
            )}
          </div>
        </div>

        {/* COLUMN 2: EN PROCESO / MÁQUINA */}
        <div style={{
          background: '#f0fdf4',
          borderRadius: '14px',
          border: '2px solid #22c55e',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '450px',
          boxShadow: '0 4px 14px rgba(34, 197, 94, 0.08)'
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #86efac',
            background: '#ffffff',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '4px solid #22c55e'
          }}>
            <div>
              <strong style={{ fontSize: '13.5px', color: '#15803d', display: 'block' }}>
                {meta.col2Title}
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: '11px' }}>{meta.col2Sub}</small>
            </div>
            <span style={{ fontSize: '12px', background: '#dcfce7', color: '#15803d', fontWeight: 900, padding: '2px 8px', borderRadius: '8px' }}>
              {columns.inProgress.length}
            </span>
          </div>

          <div style={{ padding: '12px', display: 'grid', gap: '10px', alignContent: 'start', flex: 1 }}>
            {columns.inProgress.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '12px' }}>
                Máquinas libres. Presiona el botón de inicio en un trabajo.
              </div>
            ) : (
              columns.inProgress.map((order) => renderOrderCard(order, 'inProgress'))
            )}
          </div>
        </div>

        {/* COLUMN 3: TERMINADO / EN ACABADOS */}
        <div style={{
          background: '#f8fafc',
          borderRadius: '14px',
          border: '1.5px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '450px'
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #cbd5e1',
            background: '#ffffff',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '4px solid #6366f1'
          }}>
            <div>
              <strong style={{ fontSize: '13.5px', color: '#4338ca', display: 'block' }}>
                {meta.col3Title}
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: '11px' }}>{meta.col3Sub}</small>
            </div>
            <span style={{ fontSize: '12px', background: '#e0e7ff', color: '#4338ca', fontWeight: 900, padding: '2px 8px', borderRadius: '8px' }}>
              {columns.completed.length}
            </span>
          </div>

          <div style={{ padding: '12px', display: 'grid', gap: '10px', alignContent: 'start', flex: 1 }}>
            {columns.completed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '12px' }}>
                Sin trabajos en secado o acabados
              </div>
            ) : (
              columns.completed.map((order) => renderOrderCard(order, 'completed'))
            )}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------
          MODAL: REGISTRAR MERMA / SCRAP TÉCNICO
          ---------------------------------------------------------------------- */}
      {scrapModalOrder && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} style={{ color: '#dc2626' }} />
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 900 }}>
                  Registrar Merma Técnica (Orden #{scrapModalOrder.orderNumber})
                </h2>
              </div>
              <button type="button" onClick={() => setScrapModalOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveScrap} style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label className="pos-label">Sustrato Afectado</label>
                <select
                  className="pos-select"
                  value={scrapMaterialId}
                  onChange={(e) => setScrapMaterialId(e.target.value)}
                >
                  {(store.materials || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.currentStock} {m.unit} en stock)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px' }}>
                <div>
                  <label className="pos-label">Cantidad (m²)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="pos-input"
                    value={scrapQuantityM2}
                    onChange={(e) => setScrapQuantityM2(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="pos-label">Causa del Desperdicio</label>
                  <select
                    className="pos-select"
                    value={scrapReason}
                    onChange={(e) => setScrapReason(e.target.value)}
                  >
                    <option value="Atasco de cabezal / Falla inyección">Atasco de cabezal / Falla inyección</option>
                    <option value="Arruga en sustrato / Tensión">Arruga en sustrato / Tensión</option>
                    <option value="Error de archivo / Medidas">Error de archivo / Medidas</option>
                    <option value="Falla en termo-fijado / Temperatura">Falla en termo-fijado / Temperatura</option>
                    <option value="Corte láser descalibrado">Corte láser descalibrado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="pos-label">Notas Adicionales</label>
                <textarea
                  className="pos-input"
                  rows={2}
                  value={scrapNotes}
                  onChange={(e) => setScrapNotes(e.target.value)}
                  placeholder="Detalle técnico de lo ocurrido..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="pos-nav-tab"
                  onClick={() => setScrapModalOrder(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pos-submit-order-btn"
                  style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                >
                  Descontar Merma de Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
