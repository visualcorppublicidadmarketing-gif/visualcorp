import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Layers,
  Printer,
  Scissors,
  Wrench,
  Clock,
  User,
  Phone,
  MapPin,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  RefreshCw,
  Search,
  UploadCloud,
  Eye,
  CheckSquare,
  MessageCircle,
  Truck,
  Cpu,
  X
} from 'lucide-react';
import {
  getMondayOfWeek,
  toISODate,
  getWorkshopWeeklyDispatchMatrix,
  assignOrderToWorkstation,
  updateOrderProductionStage,
  DAYS_SPANISH,
  PRODUCTION_STAGES
} from '../../lib/posStore';

export function POSWorkshopMasterBillboard({
  store,
  setStore,
  session,
  onOpenWorkOrder,
  onOpenArtProof
}) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfWeek());
  const [groupBy, setGroupBy] = useState('executionDate'); // 'executionDate' | 'installationDate'
  const [areaFilter, setAreaFilter] = useState('all'); // 'all' | 'impresion' | 'sublimacion' | 'corte_laser'
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'today' | 'tomorrow' | 'installation' | 'urgent'
  const [searchQuery, setSearchQuery] = useState('');

  // Coordination Modal State
  const [coordinationModalOrder, setCoordinationModalOrder] = useState(null);
  const [editArea, setEditArea] = useState('impresion');
  const [editMachine, setEditMachine] = useState('');
  const [editTechnician, setEditTechnician] = useState('');
  const [editExecutionDate, setEditExecutionDate] = useState('');
  const [editInstallationDate, setEditInstallationDate] = useState('');
  const [editRequiresInstallation, setEditRequiresInstallation] = useState(false);
  const [editInstallationAddress, setEditInstallationAddress] = useState('');
  const [editInstallationMapsUrl, setEditInstallationMapsUrl] = useState('');
  const [editFieldNotes, setEditFieldNotes] = useState('');

  const today = toISODate();
  const tomorrow = toISODate(new Date(Date.now() + 86400000));

  // Change Week Navigation
  const handlePrevWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() - 7);
    setCurrentMonday(toISODate(d));
  };

  const handleNextWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + 7);
    setCurrentMonday(toISODate(d));
  };

  const handleCurrentWeek = () => {
    setCurrentMonday(getMondayOfWeek());
  };

  // Open Coordination Modal
  const handleOpenCoordination = (order) => {
    setCoordinationModalOrder(order);
    setEditArea(order.assignedArea || 'impresion');
    setEditMachine(order.machineAssigned || 'Plotter Solvente 3.20m');
    setEditTechnician(order.technicianAssigned || (store.advisors?.[0]?.name || ''));
    setEditExecutionDate(order.executionDate || order.orderDate || today);
    setEditInstallationDate(order.installationDate || order.deliveryDate || today);
    setEditRequiresInstallation(Boolean(order.requiresInstallation));
    setEditInstallationAddress(order.installationAddress || '');
    setEditInstallationMapsUrl(order.installationMapsUrl || '');
    setEditFieldNotes(order.fieldMeasurementsNotes || '');
  };

  // Save Coordination Modal
  const handleSaveCoordination = (e) => {
    e.preventDefault();
    if (!coordinationModalOrder) return;

    const res = assignOrderToWorkstation(store, coordinationModalOrder.id, {
      assignedArea: editArea,
      machine: editMachine,
      technician: editTechnician,
      executionDate: editExecutionDate,
      installationDate: editInstallationDate,
      requiresInstallation: editRequiresInstallation,
      installationAddress: editInstallationAddress,
      installationMapsUrl: editInstallationMapsUrl,
      fieldMeasurementsNotes: editFieldNotes,
      advisorId: session?.id || ''
    });

    if (res.ok) {
      setStore(res.updatedStore);
      setCoordinationModalOrder(null);
    }
  };

  // 1-Click Advance Stage
  const handleAdvanceStage = (order) => {
    const stages = ['preprensa', 'aprobacion_arte', 'impresion', 'acabados', 'control_calidad', 'listo', 'entregado'];
    const currentIdx = stages.indexOf(order.productionStage || 'preprensa');
    if (currentIdx < stages.length - 1) {
      const nextStage = stages[currentIdx + 1];
      const res = updateOrderProductionStage(store, order.id, nextStage, 'Avanzado desde Cartelera de Taller', session?.id);
      if (res.ok) setStore(res.updatedStore);
    }
  };

  // WhatsApp quick trigger for installation/measurement coordinate
  const handleWhatsAppCustomer = (order) => {
    if (!order.customerPhone) return;
    const phone = order.customerPhone.replace(/\D/g, '');
    const cleanPhone = phone.startsWith('0') ? `593${phone.slice(1)}` : phone;
    const message = encodeURIComponent(
      `Hola *${order.customerName}*, te saluda el área de Producción e Instalaciones de *Gigaprint*. ` +
      `Nos comunicamos para coordinar la ${order.requiresInstallation ? 'instalación' : 'entrega'} de tu trabajo *${order.jobName || `#${order.orderNumber}`}*. ` +
      `¿Podrías confirmarnos disponibilidad de horario en la dirección: ${order.installationAddress || 'su ubicación'}?`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  // Matrix calculation
  const matrix = useMemo(() => {
    return getWorkshopWeeklyDispatchMatrix(store.orders || [], currentMonday, { groupBy, area: areaFilter });
  }, [store.orders, currentMonday, groupBy, areaFilter]);

  const advisorMap = useMemo(() => {
    return (store.advisors || []).reduce((acc, a) => ({ ...acc, [a.id]: a.name }), {});
  }, [store.advisors]);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* ----------------------------------------------------------------------
          TOP CONTROLS & DISPATCH BAR
          ---------------------------------------------------------------------- */}
      <div className="pos-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={22} style={{ color: 'var(--orange)' }} />
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>
                Cartelera Semanal de Taller & Despacho
              </h1>
              <span className="pos-nav-badge" style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '11px', fontWeight: 800 }}>
                Semana {matrix.weekCode}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
              Planificación semanal de fabricación, cola por estaciones y cuadrillas de instalación en sitio.
            </p>
          </div>

          {/* Week Selector Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handlePrevWeek}
              className="pos-nav-tab"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              title="Semana anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleCurrentWeek}
              className="pos-nav-tab"
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 800 }}
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              className="pos-nav-tab"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              title="Semana siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '14px 0' }} />

        {/* Filter Pills and Grouping Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Group By Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)' }}>Agrupar por:</span>
            <div style={{ display: 'inline-flex', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <button
                type="button"
                onClick={() => setGroupBy('executionDate')}
                style={{
                  background: groupBy === 'executionDate' ? '#fff' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: groupBy === 'executionDate' ? 'var(--orange-dark)' : 'var(--muted)',
                  cursor: 'pointer',
                  boxShadow: groupBy === 'executionDate' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                📅 Fecha de Ejecución Taller
              </button>
              <button
                type="button"
                onClick={() => setGroupBy('installationDate')}
                style={{
                  background: groupBy === 'installationDate' ? '#fff' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: groupBy === 'installationDate' ? '#0891b2' : 'var(--muted)',
                  cursor: 'pointer',
                  boxShadow: groupBy === 'installationDate' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                🚚 Fecha de Instalación en Sitio
              </button>
            </div>
          </div>

          {/* Area Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)' }}>Área:</span>
            {[
              { id: 'all', label: 'Todas las Áreas' },
              { id: 'impresion', label: '🖨️ Impresión' },
              { id: 'sublimacion', label: '👕 Sublimación & DTF' },
              { id: 'corte_laser', label: '⚡ Corte Láser & CNC' }
            ].map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaFilter(a.id)}
                style={{
                  background: areaFilter === a.id ? 'var(--orange)' : '#fff',
                  color: areaFilter === a.id ? '#fff' : 'var(--ink)',
                  border: areaFilter === a.id ? '1px solid var(--orange)' : '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div style={{ width: '220px' }}>
            <input
              type="text"
              className="pos-input"
              placeholder="🔎 Buscar # orden, cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '12px', padding: '6px 10px' }}
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------
          WEEKLY BILLBOARD GRID (MONDAY TO SATURDAY)
          ---------------------------------------------------------------------- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '14px',
        alignItems: 'start'
      }}>
        {matrix.days.map((colDay) => {
          const isToday = colDay.date === today;
          const isTomorrow = colDay.date === tomorrow;

          const filteredDayOrders = colDay.orders.filter((o) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (
              (o.orderNumber || '').includes(q) ||
              (o.customerName || '').toLowerCase().includes(q) ||
              (o.jobName || '').toLowerCase().includes(q)
            );
          });

          return (
            <div
              key={colDay.date}
              style={{
                background: isToday ? '#fffbf5' : '#ffffff',
                borderRadius: '12px',
                border: isToday ? '2px solid var(--orange)' : '1px solid var(--line)',
                boxShadow: isToday ? '0 4px 14px rgba(234, 88, 12, 0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '400px'
              }}
            >
              {/* Day Column Header */}
              <div style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--line)',
                background: isToday ? 'var(--orange-soft)' : '#f8fafc',
                borderTopLeftRadius: '10px',
                borderTopRightRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'capitalize', color: isToday ? 'var(--orange-dark)' : 'var(--ink)' }}>
                    {colDay.dayName} {colDay.date.split('-').slice(1).reverse().join('/')}
                    {isToday && <span style={{ marginLeft: '6px', fontSize: '10px', background: 'var(--orange)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>HOY</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700 }}>
                    {filteredDayOrders.length} {filteredDayOrders.length === 1 ? 'trabajo' : 'trabajos'}
                    {colDay.installationCount > 0 && ` · 🚚 ${colDay.installationCount} montaje(s)`}
                  </div>
                </div>

                {colDay.urgentCount > 0 && (
                  <span style={{ fontSize: '10.5px', background: '#fee2e2', color: '#dc2626', fontWeight: 900, padding: '2px 6px', borderRadius: '6px' }}>
                    🚨 {colDay.urgentCount} Urgentes
                  </span>
                )}
              </div>

              {/* Cards List in this Day */}
              <div style={{ padding: '10px', display: 'grid', gap: '10px', flex: 1, alignContent: 'start' }}>
                {filteredDayOrders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '12px' }}>
                    Sin trabajos programados para este día
                  </div>
                ) : (
                  filteredDayOrders.map((order) => {
                    const isUrgent = order.productionPriority === 'urgente' || order.priority === 'urgente';
                    const hasInstallation = Boolean(order.requiresInstallation);
                    const advisorName = advisorMap[order.advisorId] || order.advisorName || 'Asesora';

                    return (
                      <div
                        key={order.id}
                        style={{
                          background: '#fff',
                          border: isUrgent ? '1.5px solid #f87171' : '1px solid var(--line)',
                          borderRadius: '10px',
                          padding: '12px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.04)',
                          display: 'grid',
                          gap: '8px',
                          position: 'relative'
                        }}
                      >
                        {/* Header of Card */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 900, color: 'var(--ink)' }}>
                              #{order.orderNumber}
                            </span>
                            {/* Area Tag */}
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: order.assignedArea === 'sublimacion' ? '#fce7f3' : order.assignedArea === 'corte_laser' ? '#ede9fe' : '#dbeafe',
                              color: order.assignedArea === 'sublimacion' ? '#be185d' : order.assignedArea === 'corte_laser' ? '#6d28d9' : '#1d4ed8'
                            }}>
                              {order.assignedArea === 'sublimacion' ? '👕 Sublimación' : order.assignedArea === 'corte_laser' ? '⚡ Corte Láser' : '🖨️ Impresión'}
                            </span>
                            {isUrgent && (
                              <span style={{ fontSize: '10px', background: '#dc2626', color: '#fff', fontWeight: 900, padding: '2px 5px', borderRadius: '4px' }}>
                                🔥 URGENTE
                              </span>
                            )}
                            {hasInstallation && (
                              <span style={{ fontSize: '10px', background: '#cffafe', color: '#0e7490', fontWeight: 900, padding: '2px 5px', borderRadius: '4px' }}>
                                🚚 MONTAJE
                              </span>
                            )}
                          </div>

                          <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: '#f1f5f9',
                            color: '#475569'
                          }}>
                            {order.productionStage || 'preprensa'}
                          </span>
                        </div>

                        {/* Job Description & Customer */}
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', lineHeight: '1.3' }}>
                            {order.jobName || 'Trabajo Publicitario'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                            👤 <strong>{order.customerName}</strong> · Vendido por: <em>{advisorName}</em>
                          </div>
                        </div>

                        {/* Installation & Measurement Address if on-site */}
                        {hasInstallation && (
                          <div style={{
                            background: '#ecfeff',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid #a5f3fc',
                            fontSize: '11px',
                            color: '#0891b2',
                            display: 'grid',
                            gap: '3px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <MapPin size={12} />
                              <strong>Dir:</strong> {order.installationAddress || 'Por coordinar con el cliente'}
                            </div>
                            {order.fieldMeasurementsNotes && (
                              <div>📐 <strong>Medidas en sitio:</strong> {order.fieldMeasurementsNotes}</div>
                            )}
                          </div>
                        )}

                        {/* Machine & Technician assigned */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)', background: '#f8fafc', padding: '5px 8px', borderRadius: '6px' }}>
                          <div>⚙️ {order.machineAssigned || 'Plotter Solvente 3.20m'}</div>
                          <div>👷 {order.technicianAssigned || 'Operario'}</div>
                        </div>

                        {/* Artwork Status & Vector Link */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                          <span style={{ color: order.artApprovedAt ? '#16a34a' : '#d97706', fontWeight: 800 }}>
                            {order.artApprovedAt ? '✓ Arte Aprobado' : '⏳ Arte en Espera'}
                          </span>

                          {order.artUrl && (
                            <a
                              href={order.artUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <ExternalLink size={11} /> Vector
                            </a>
                          )}
                        </div>

                        {/* Action Buttons Toolbar */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr',
                          gap: '4px',
                          marginTop: '4px',
                          borderTop: '1px solid var(--line)',
                          paddingTop: '6px'
                        }}>
                          <button
                            type="button"
                            onClick={() => handleOpenCoordination(order)}
                            style={{
                              background: '#f1f5f9',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 4px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              color: 'var(--ink)',
                              cursor: 'pointer'
                            }}
                            title="Reasignar máquina, operario o fecha"
                          >
                            ⚙️ Coordinar
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenWorkOrder && onOpenWorkOrder(order)}
                            style={{
                              background: '#f1f5f9',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 4px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              color: 'var(--ink)',
                              cursor: 'pointer'
                            }}
                            title="Imprimir Orden de Trabajo"
                          >
                            📄 Ver OT
                          </button>

                          <button
                            type="button"
                            onClick={() => handleWhatsAppCustomer(order)}
                            style={{
                              background: '#dcfce7',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 4px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              color: '#15803d',
                              cursor: 'pointer'
                            }}
                            title="Coordinar por WhatsApp con el cliente"
                          >
                            💬 WhatsApp
                          </button>
                        </div>

                        {/* 1-Click Advance Button */}
                        <button
                          type="button"
                          onClick={() => handleAdvanceStage(order)}
                          style={{
                            background: 'var(--orange-soft)',
                            border: '1px solid var(--orange)',
                            color: 'var(--orange-dark)',
                            borderRadius: '6px',
                            padding: '5px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          Avanzar Etapa ➔
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------------
          MODAL: COORDINAR TRABAJO / REASIGNAR TALLER
          ---------------------------------------------------------------------- */}
      {coordinationModalOrder && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card" style={{ maxWidth: '560px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wrench size={20} style={{ color: 'var(--orange)' }} />
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 900 }}>
                  Coordinar Orden #{coordinationModalOrder.orderNumber}
                </h2>
              </div>
              <button type="button" onClick={() => setCoordinationModalOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCoordination} style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label className="pos-label">Área de Producción</label>
                <select
                  className="pos-select"
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value)}
                >
                  <option value="impresion">🖨️ Área de Impresión (Gran Formato & Digital)</option>
                  <option value="sublimacion">👕 Área de Sublimación & DTF Textil</option>
                  <option value="corte_laser">⚡ Área de Corte Láser, CNC & Neón LED</option>
                  <option value="acabados">✂️ Mesa de Acabados & Confección</option>
                  <option value="instalacion">🚚 Cuadrilla de Instalación en Sitio</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="pos-label">Máquina Asignada</label>
                  <select
                    className="pos-select"
                    value={editMachine}
                    onChange={(e) => setEditMachine(e.target.value)}
                  >
                    <option value="Plotter Flora Solvente 3.20m">Plotter Flora Solvente 3.20m</option>
                    <option value="Plotter Roland TrueVIS 1.60m">Plotter Roland TrueVIS 1.60m</option>
                    <option value="Plotter Textil DTF 60cm">Plotter Textil DTF 60cm</option>
                    <option value="Plancha Térmica Neumática 40x60">Plancha Térmica Neumática 40x60</option>
                    <option value="Cortadora Láser CO2 130W">Cortadora Láser CO2 130W</option>
                    <option value="Ruteadora CNC 1.30x2.50m">Ruteadora CNC 1.30x2.50m</option>
                    <option value="Prensa Digital Konica">Prensa Digital Konica</option>
                  </select>
                </div>

                <div>
                  <label className="pos-label">Técnico Responsable</label>
                  <select
                    className="pos-select"
                    value={editTechnician}
                    onChange={(e) => setEditTechnician(e.target.value)}
                  >
                    {(store.advisors || []).map((adv) => (
                      <option key={adv.id} value={adv.name}>
                        {adv.name} ({adv.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="pos-label">Fecha de Ejecución en Taller</label>
                  <input
                    type="date"
                    className="pos-input"
                    value={editExecutionDate}
                    onChange={(e) => setEditExecutionDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="pos-label">Fecha de Entrega / Instalación</label>
                  <input
                    type="date"
                    className="pos-input"
                    value={editInstallationDate}
                    onChange={(e) => setEditInstallationDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="reqInstCheck"
                  checked={editRequiresInstallation}
                  onChange={(e) => setEditRequiresInstallation(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--orange)' }}
                />
                <label htmlFor="reqInstCheck" style={{ fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}>
                  Requiere Montaje / Instalación en Sitio
                </label>
              </div>

              {editRequiresInstallation && (
                <>
                  <div>
                    <label className="pos-label">Dirección Exacta de Instalación</label>
                    <input
                      type="text"
                      className="pos-input"
                      value={editInstallationAddress}
                      onChange={(e) => setEditInstallationAddress(e.target.value)}
                      placeholder="Ej. Av. Amazonas N24-102 y Colón, Edificio San Francisco 2do piso"
                    />
                  </div>

                  <div>
                    <label className="pos-label">Enlace de Google Maps</label>
                    <input
                      type="url"
                      className="pos-input"
                      value={editInstallationMapsUrl}
                      onChange={(e) => setEditInstallationMapsUrl(e.target.value)}
                      placeholder="https://maps.app.goo.gl/..."
                    />
                  </div>

                  <div>
                    <label className="pos-label">Notas para Toma de Medidas / Cuadrilla</label>
                    <textarea
                      className="pos-input"
                      rows={2}
                      value={editFieldNotes}
                      onChange={(e) => setEditFieldNotes(e.target.value)}
                      placeholder="Ej. Llevar escalera de 4 cuerpos, broca de 1/2 pulgada, tacos Fischer..."
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="pos-nav-tab"
                  onClick={() => setCoordinationModalOrder(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pos-submit-order-btn"
                >
                  Guardar Coordinación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
