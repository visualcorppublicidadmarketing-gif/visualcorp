import React, { useState, useMemo } from 'react';
import { 
  Layout, Eye, Printer, Scissors, CheckSquare, Package, CheckCircle2,
  AlertTriangle, Clock, ArrowRight, ArrowLeft, Search, Filter,
  FileText, MessageCircle, MoreVertical, XCircle, Sparkles, Check, Tag,
  QrCode, Cpu, UserCheck
} from 'lucide-react';
import {
  PRODUCTION_STAGES,
  updateOrderProductionStage,
  toISODate,
  cancelPOSOrder,
  advanceOrderProductionStageByScan,
  assignOrderProductionResource
} from '../../lib/posStore';
import { POSPackageLabelModal } from './POSPackageLabelModal';

export function POSProductionKanban({ 
  store, 
  setStore, 
  session, 
  onOpenWorkOrder, 
  onOpenArtProof 
}) {
  const [search, setSearch] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [labelModalOrder, setLabelModalOrder] = useState(null);

  // Scan-to-Advance and Machine Assignment States
  const [scanCode, setScanCode] = useState('');
  const [assignModalOrder, setAssignModalOrder] = useState(null);
  const [assignedMachine, setAssignedMachine] = useState('');
  const [assignedTechnician, setAssignedTechnician] = useState('');

  const today = toISODate();

  // Filter Orders for Kanban
  const filteredOrders = useMemo(() => {
    return (store.orders || []).filter((o) => {
      if (o.status === 'anulado' || o.productionStage === 'anulado') return false;
      
      const q = search.toLowerCase();
      const matchText = (o.orderNumber || '').includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.jobName || '').toLowerCase().includes(q);

      const matchAdvisor = advisorFilter === 'all' || o.advisorId === advisorFilter;
      const matchPriority = priorityFilter === 'all' || o.productionPriority === priorityFilter;
      const matchArea = areaFilter === 'all' || (o.assignedArea || 'impresion') === areaFilter;

      return matchText && matchAdvisor && matchPriority && matchArea;
    });
  }, [store.orders, search, advisorFilter, priorityFilter, areaFilter]);

  // Group by production stage
  const stageOrders = useMemo(() => {
    const map = {};
    PRODUCTION_STAGES.forEach((st) => { map[st.id] = []; });

    filteredOrders.forEach((o) => {
      const stage = o.productionStage || 'preprensa';
      if (map[stage]) {
        map[stage].push(o);
      } else if (map['preprensa']) {
        map['preprensa'].push(o);
      }
    });

    return map;
  }, [filteredOrders]);

  // Stage transition helpers
  const handleMoveStage = (orderId, targetStage) => {
    const nextState = updateOrderProductionStage(store, orderId, targetStage);
    setStore(nextState);
  };

  const handleNextStage = (order) => {
    const currentIdx = PRODUCTION_STAGES.findIndex((s) => s.id === (order.productionStage || 'preprensa'));
    if (currentIdx >= 0 && currentIdx < PRODUCTION_STAGES.length - 1) {
      handleMoveStage(order.id, PRODUCTION_STAGES[currentIdx + 1].id);
    }
  };

  const handlePrevStage = (order) => {
    const currentIdx = PRODUCTION_STAGES.findIndex((s) => s.id === (order.productionStage || 'preprensa'));
    if (currentIdx > 0) {
      handleMoveStage(order.id, PRODUCTION_STAGES[currentIdx - 1].id);
    }
  };

  const handleConfirmCancel = () => {
    if (!cancelModalOrder) return;
    const nextState = cancelPOSOrder(store, cancelModalOrder.id, cancelReason || 'Cancelado por cliente');
    setStore(nextState);
    setCancelModalOrder(null);
    setCancelReason('');
  };

  // Scan-to-Advance Fast Floor Handler
  const handleScanAdvanceSubmit = (e) => {
    e.preventDefault();
    if (!scanCode.trim()) return;
    const res = advanceOrderProductionStageByScan(store, scanCode.trim(), session?.id || '');
    if (res.ok) {
      setStore(res.updatedStore);
      setScanCode('');
      alert(`✓ Orden #${res.order?.orderNumber} avanzada a etapa: ${res.order?.productionStage}`);
    } else {
      alert(`⚠️ ${res.error}`);
    }
  };

  // Machine and Technician Assignment
  const handleOpenAssignModal = (order) => {
    setAssignModalOrder(order);
    setAssignedMachine(order.machineAssigned || 'Plotter Solvente 3.20m');
    setAssignedTechnician(order.technicianAssigned || (store.advisors?.[0]?.name || 'Operario Taller'));
  };

  const handleSaveResourceAssignment = (e) => {
    e.preventDefault();
    if (!assignModalOrder) return;
    const res = assignOrderProductionResource(store, assignModalOrder.id, {
      machine: assignedMachine,
      technician: assignedTechnician,
      advisorId: session?.id || ''
    });
    if (res.ok) {
      setStore(res.updatedStore);
      setAssignModalOrder(null);
    }
  };

  // Helper for delivery status badge
  const getDeliveryStatus = (deliveryDate) => {
    if (!deliveryDate) return { label: 'Sin fecha', color: '#94a3b8', bg: '#f1f5f9' };
    if (deliveryDate < today) return { label: '¡Vencido!', color: '#dc2626', bg: '#fee2e2', urgent: true };
    if (deliveryDate === today) return { label: 'Entrega Hoy', color: '#d97706', bg: '#fef3c7', today: true };
    return { label: `Entrega: ${deliveryDate}`, color: '#059669', bg: '#dcfce7' };
  };

  const advisorMap = useMemo(() => {
    return (store.advisors || []).reduce((acc, a) => ({ ...acc, [a.id]: a.name }), {});
  }, [store.advisors]);

  return (
    <div className="pos-kanban-container" style={{ display: 'grid', gap: '16px' }}>
      {/* Top Filter Bar with Fast Scan-to-Advance Station */}
      <div className="pos-kanban-toolbar" style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: 'var(--paper)',
        padding: '12px 16px',
        borderRadius: '16px',
        border: '1px solid var(--line)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px', flexWrap: 'wrap' }}>
          {/* Scan-to-Advance Input Box */}
          <form onSubmit={handleScanAdvanceSubmit} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ position: 'relative' }}>
              <QrCode size={15} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--orange)' }} />
              <input
                type="text"
                placeholder="Escanear Hoja de Ruta (Scan-to-Advance)..."
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                style={{
                  padding: '7px 10px 7px 32px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--orange)',
                  background: '#fff',
                  fontSize: '12px',
                  fontWeight: '700',
                  width: '230px'
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                background: 'var(--orange)',
                color: '#fff',
                border: 'none',
                fontWeight: '800',
                fontSize: '12px',
                cursor: 'pointer'
              }}
              title="Avanzar de fase mediante escaneo de código"
            >
              Avanzar (↵)
            </button>
          </form>

          <div style={{ position: 'relative', width: '100%', maxWidth: '240px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Buscar por # Orden o Cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                fontSize: '12.5px',
                color: 'var(--ink)'
              }}
            />
          </div>

          <select
            value={advisorFilter}
            onChange={(e) => setAdvisorFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              fontSize: '12px',
              color: 'var(--ink)',
              fontWeight: '600'
            }}
          >
            <option value="all">Todas las Asesoras</option>
            {(store.advisors || []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              fontSize: '12px',
              color: 'var(--ink)',
              fontWeight: '600'
            }}
          >
            <option value="all">Todas las Prioridades</option>
            <option value="urgente">🔥 Urgente</option>
            <option value="alta">⚡ Alta</option>
            <option value="normal">Normal</option>
          </select>

          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              fontSize: '12px',
              color: 'var(--ink)',
              fontWeight: '600'
            }}
          >
            <option value="all">Todas las Áreas</option>
            <option value="impresion">🖨️ Impresión</option>
            <option value="sublimacion">👕 Sublimación & DTF</option>
            <option value="corte_laser">⚡ Corte Láser & CNC</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>
          <span>Total en Taller: <strong style={{ color: 'var(--orange-dark)' }}>{filteredOrders.length}</strong> trabajos</span>
        </div>
      </div>

      {/* Kanban Board Columns Grid */}
      <div className="pos-kanban-board" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(260px, 1fr))',
        gap: '14px',
        overflowX: 'auto',
        paddingBottom: '16px',
        minHeight: '650px',
        alignItems: 'start'
      }}>
        {PRODUCTION_STAGES.map((stage, sIdx) => {
          const ordersInStage = stageOrders[stage.id] || [];

          return (
            <div 
              key={stage.id}
              className="pos-kanban-column"
              style={{
                background: 'var(--paper)',
                borderRadius: '16px',
                border: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(100vh - 200px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              {/* Column Header */}
              <div style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: `4px solid ${stage.color}`,
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
                background: 'var(--bg)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{stage.label}</strong>
                </div>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: stage.color,
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: '800'
                }}>
                  {ordersInStage.length}
                </span>
              </div>

              {/* Cards Container */}
              <div style={{
                padding: '10px',
                display: 'grid',
                gap: '10px',
                overflowY: 'auto',
                flex: 1
              }}>
                {ordersInStage.length === 0 ? (
                  <div style={{
                    padding: '28px 12px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                    fontSize: '12px',
                    border: '1.5px dashed var(--line)',
                    borderRadius: '12px'
                  }}>
                    Sin trabajos en esta fase
                  </div>
                ) : (
                  ordersInStage.map((order) => {
                    const delivery = getDeliveryStatus(order.deliveryDate);
                    const itemsForOrder = (store.orderItems || []).filter((it) => it.orderId === order.id);

                    return (
                      <div
                        key={order.id}
                        className="pos-kanban-card"
                        style={{
                          background: 'var(--bg)',
                          border: delivery.urgent ? '1.5px solid #ef4444' : '1px solid var(--line)',
                          borderRadius: '12px',
                          padding: '12px',
                          display: 'grid',
                          gap: '8px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Card Top Row: Order # and Urgency Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '900',
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: 'var(--orange-soft)',
                              color: 'var(--orange-dark)'
                            }}>
                              #{order.orderNumber}
                            </span>
                            <span style={{
                              fontSize: '9.5px',
                              fontWeight: '800',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              background: order.assignedArea === 'sublimacion' ? '#fce7f3' : order.assignedArea === 'corte_laser' ? '#ede9fe' : '#dbeafe',
                              color: order.assignedArea === 'sublimacion' ? '#be185d' : order.assignedArea === 'corte_laser' ? '#6d28d9' : '#1d4ed8'
                            }}>
                              {order.assignedArea === 'sublimacion' ? '👕 Subli' : order.assignedArea === 'corte_laser' ? '⚡ Láser' : '🖨️ Print'}
                            </span>
                            {order.requiresInstallation && (
                              <span style={{
                                fontSize: '9.5px',
                                fontWeight: '800',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                background: '#cffafe',
                                color: '#0e7490'
                              }}>
                                🚚 Montaje
                              </span>
                            )}
                          </div>

                          <span style={{
                            fontSize: '10px',
                            fontWeight: '800',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            background: delivery.bg,
                            color: delivery.color,
                            animation: delivery.urgent ? 'pulse 1.5s infinite' : 'none'
                          }}>
                            {delivery.label}
                          </span>
                        </div>

                        {/* Card Job Name & Customer */}
                        <div>
                          <strong style={{ fontSize: '13px', color: 'var(--ink)', display: 'block', lineHeight: 1.25 }}>
                            {order.jobName || 'Trabajo sin título'}
                          </strong>
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600' }}>
                            👤 {order.customerName}
                          </span>
                        </div>

                        {/* Items Specs Preview */}
                        <div style={{
                          fontSize: '11px',
                          color: 'var(--ink)',
                          background: 'var(--paper)',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          border: '1px solid var(--line)'
                        }}>
                          {itemsForOrder.slice(0, 2).map((it, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                • {it.productName}
                              </span>
                              <span style={{ color: 'var(--muted)', fontWeight: '800' }}>
                                {it.widthCm && it.heightCm ? `${it.widthCm}x${it.heightCm}cm` : `x${it.quantity}`}
                              </span>
                            </div>
                          ))}
                          {itemsForOrder.length > 2 && (
                            <span style={{ fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic' }}>
                              +{itemsForOrder.length - 2} productos más...
                            </span>
                          )}
                        </div>

                        {/* Art Status Pill */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: '700',
                            color: order.artApproved ? '#059669' : '#d97706'
                          }}>
                            {order.artApproved ? <Check size={13} /> : <Clock size={13} />}
                            {order.artApproved ? 'Arte Aprobado' : 'Arte Pendiente'}
                          </span>

                          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700' }}>
                            {advisorMap[order.advisorId] || 'Ventas'}
                          </span>
                        </div>

                        {/* Machine & Technician Assignment Tag */}
                        <div style={{
                          fontSize: '10.5px',
                          background: '#f8fafc',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span style={{ fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                            🖨️ {order.machineAssigned || 'Sin Máquina'}
                          </span>
                          <span style={{ fontWeight: 600, color: '#64748b' }}>
                            👷 {order.technicianAssigned || 'Taller'}
                          </span>
                        </div>

                        {/* Action Buttons Row */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '6px',
                          borderTop: '1px dashed var(--line)'
                        }}>
                          {/* Navigation buttons */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {sIdx > 0 && (
                              <button
                                onClick={() => handlePrevStage(order)}
                                title="Retroceder etapa"
                                style={{
                                  padding: '5px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--line)',
                                  background: 'var(--paper)',
                                  color: 'var(--muted)',
                                  cursor: 'pointer'
                                }}
                              >
                                <ArrowLeft size={13} />
                              </button>
                            )}

                            {sIdx < PRODUCTION_STAGES.length - 1 && (
                              <button
                                onClick={() => handleNextStage(order)}
                                title="Avanzar a siguiente etapa"
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  border: 0,
                                  background: stage.color,
                                  color: '#fff',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: '800'
                                }}
                              >
                                Avanzar <ArrowRight size={13} />
                              </button>
                            )}
                          </div>

                          {/* Technical Work Order & Art Buttons */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => handleOpenAssignModal(order)}
                              title="Asignar Máquina de Impresión y Técnico Operario"
                              style={{
                                padding: '5px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--line)',
                                background: order.machineAssigned ? '#eff6ff' : 'var(--paper)',
                                color: order.machineAssigned ? '#1d4ed8' : 'var(--ink)',
                                cursor: 'pointer'
                              }}
                            >
                              <Cpu size={13} />
                            </button>

                            <button
                              onClick={() => onOpenArtProof && onOpenArtProof(order)}
                              title="Revisar y Aprobar Boceto de Arte"
                              style={{
                                padding: '5px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--line)',
                                background: 'var(--paper)',
                                color: 'var(--ink)',
                                cursor: 'pointer'
                              }}
                            >
                              <Eye size={13} />
                            </button>

                            <button
                              onClick={() => onOpenWorkOrder && onOpenWorkOrder(order)}
                              title="Imprimir Hoja de Ruta de Taller (Work Order)"
                              style={{
                                padding: '5px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--line)',
                                background: 'var(--paper)',
                                color: 'var(--ink)',
                                cursor: 'pointer'
                              }}
                            >
                              <FileText size={13} />
                            </button>

                            <button
                              onClick={() => setLabelModalOrder(order)}
                              title="Imprimir Etiqueta Térmica de Empaque"
                              style={{
                                padding: '5px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--line)',
                                background: 'var(--paper)',
                                color: 'var(--ink)',
                                cursor: 'pointer'
                              }}
                            >
                              <Package size={13} />
                            </button>

                            <button
                              onClick={() => setCancelModalOrder(order)}
                              title="Anular Trabajo"
                              style={{
                                padding: '5px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--line)',
                                background: 'var(--paper)',
                                color: '#dc2626',
                                cursor: 'pointer'
                              }}
                            >
                              <XCircle size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel Order Modal */}
      {cancelModalOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--paper)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '420px',
            width: '100%',
            border: '1px solid var(--line)',
            display: 'grid',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900' }}>¿Anular Trabajo #{cancelModalOrder.orderNumber}?</h3>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
              Esta acción marcará el pedido como <strong>Anulado</strong> y detendrá su producción en taller.
            </p>

            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--ink)' }}>Motivo de la Anulación:</label>
              <input
                type="text"
                placeholder="Ej. Desistimiento de cliente, error en medidas..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  fontSize: '13px'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setCancelModalOrder(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '13px'
                }}
              >
                Volver
              </button>
              <button
                onClick={handleConfirmCancel}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 0,
                  background: '#dc2626',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '800',
                  fontSize: '13px'
                }}
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource & Machinery Assignment Modal */}
      {assignModalOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--paper)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '480px',
            width: '100%',
            border: '1px solid var(--line)',
            display: 'grid',
            gap: '16px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={20} color="var(--orange)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: 'var(--ink)' }}>
                  Asignar Recursos — Orden #{assignModalOrder.orderNumber}
                </h3>
              </div>
              <button
                onClick={() => setAssignModalOrder(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <XCircle size={18} />
              </button>
            </div>

            <div>
              <strong style={{ fontSize: '13px', color: 'var(--ink)', display: 'block' }}>{assignModalOrder.jobName}</strong>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cliente: {assignModalOrder.customerName}</span>
            </div>

            <form onSubmit={handleSaveResourceAssignment} style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label className="pos-label required">Máquina de Producción / Taller</label>
                <select
                  className="pos-select"
                  value={assignedMachine}
                  onChange={(e) => setAssignedMachine(e.target.value)}
                  required
                >
                  <option value="Plotter Solvente 3.20m">🖨️ Plotter Solvente 3.20m (Lonas, Microperforado, Vallas)</option>
                  <option value="Plotter Roland Ecosolvente 1.60m">🎨 Plotter Roland Ecosolvente 1.60m (Vinil HD, Troquelados)</option>
                  <option value="Cama Plana UV Mimaki">⚡ Cama Plana UV Mimaki (Sintra, Acrílico, Vidrio, Madera)</option>
                  <option value="Prensa Digital Láser Konica">📄 Prensa Digital Láser Konica (Papelería, Flyers, Tarjetas)</option>
                  <option value="Plotter DTF Textil 60cm">👕 Plotter DTF Textil 60cm (Camisetas, Bolsos, Sublimación)</option>
                  <option value="Ruteadora CNC & Láser CO2">⚙️ Ruteadora CNC & Corte Láser CO2 (Rótulos 3D)</option>
                  <option value="Mesa de Acabados Manual">✂️ Mesa de Acabados & Confección (Ojales, Bastidores)</option>
                </select>
              </div>

              <div>
                <label className="pos-label required">Técnico / Operador Responsable</label>
                <select
                  className="pos-select"
                  value={assignedTechnician}
                  onChange={(e) => setAssignedTechnician(e.target.value)}
                  required
                >
                  {(store.advisors || []).map((adv) => (
                    <option key={adv.id} value={adv.name}>{adv.name} ({adv.role})</option>
                  ))}
                  <option value="Operario Taller Turno 1">Operario Taller Turno 1</option>
                  <option value="Operario Taller Turno 2">Operario Taller Turno 2</option>
                  <option value="Instalador en Sitio">Instalador en Sitio</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="pos-cat-pill"
                  onClick={() => setAssignModalOrder(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pos-add-cart-btn"
                  style={{ width: 'auto', padding: '10px 18px' }}
                >
                  <Check size={16} /> Guardar Asignación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {labelModalOrder && (
        <POSPackageLabelModal
          order={labelModalOrder}
          items={(store.orderItems || []).filter((it) => it.orderId === labelModalOrder.id)}
          isOpen={Boolean(labelModalOrder)}
          onClose={() => setLabelModalOrder(null)}
        />
      )}
    </div>
  );
}
