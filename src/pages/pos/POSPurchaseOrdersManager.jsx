import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  Building2,
  Package,
  CheckCircle2,
  Clock,
  Printer,
  Trash2,
  Save,
  X,
  AlertCircle,
  ArrowRight,
  DollarSign,
  Calendar,
  Layers
} from 'lucide-react';
import {
  toISODate,
  savePOSStoreLocal,
  syncEntityRemote,
  createMaterial,
  updateMaterial,
  createPOSExpense
} from '../../lib/posStore';
import { useToast } from '../../components/studio/Toast';

export function POSPurchaseOrdersManager({ store, onStoreUpdate }) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPOForPrint, setSelectedPOForPrint] = useState(null);

  // Form State
  const [poForm, setPOForm] = useState({
    supplierId: store.suppliers?.[0]?.id || '',
    expectedDate: toISODate(new Date(Date.now() + 3 * 86400000)),
    notes: '',
    items: []
  });

  const [itemMatId, setItemMatId] = useState(store.materials?.[0]?.id || '');
  const [itemQty, setItemQty] = useState(1);
  const [itemCost, setItemCost] = useState(store.materials?.[0]?.costPerUnit || 1.25);

  const purchaseOrders = useMemo(() => {
    return store.purchaseOrders || [];
  }, [store.purchaseOrders]);

  const filteredPOs = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return purchaseOrders.filter((po) => {
      const matchSearch =
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        (po.notes && po.notes.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'all' || po.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [purchaseOrders, searchTerm, statusFilter]);

  // Add Item to Draft PO
  const handleAddItem = () => {
    const mat = (store.materials || []).find((m) => m.id === itemMatId);
    if (!mat) return;

    const newItem = {
      id: `poitem-${Date.now()}`,
      materialId: mat.id,
      materialName: mat.name,
      unit: mat.unit,
      quantity: Number(itemQty) || 1,
      unitCost: Number(itemCost) || 0,
      totalCost: Number(((Number(itemQty) || 1) * (Number(itemCost) || 0)).toFixed(2))
    };

    setPOForm({ ...poForm, items: [...poForm.items, newItem] });
  };

  const handleRemoveItem = (index) => {
    setPOForm({ ...poForm, items: poForm.items.filter((_, idx) => idx !== index) });
  };

  const poSubtotal = useMemo(() => {
    return poForm.items.reduce((sum, itm) => sum + itm.totalCost, 0);
  }, [poForm.items]);

  // Save Purchase Order
  const handleSavePO = (e) => {
    e.preventDefault();
    if (poForm.items.length === 0) {
      toast.warning('Agrega al menos un material a la orden de compra.');
      return;
    }
    const supplier = (store.suppliers || []).find((s) => s.id === poForm.supplierId);
    if (!supplier) {
      toast.warning('Selecciona un proveedor válido.');
      return;
    }

    const poNumber = `OC-2026-${String(purchaseOrders.length + 1).padStart(3, '0')}`;
    const newPO = {
      id: `po-${Date.now()}`,
      poNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierPhone: supplier.phone || '',
      supplierEmail: supplier.email || '',
      orderDate: toISODate(),
      expectedDate: poForm.expectedDate,
      status: 'pending', // 'draft', 'pending', 'received', 'cancelled'
      items: poForm.items,
      totalAmount: poSubtotal,
      notes: poForm.notes || 'Pedido regular de sustratos para taller',
      createdAt: new Date().toISOString()
    };

    const updatedPOs = [newPO, ...purchaseOrders];
    const updatedStore = { ...store, purchaseOrders: updatedPOs };
    savePOSStoreLocal(updatedStore);
    onStoreUpdate(updatedStore);
    setIsModalOpen(false);
    setPOForm({ supplierId: store.suppliers?.[0]?.id || '', expectedDate: toISODate(), notes: '', items: [] });
    toast.success(`Orden de compra ${poNumber} creada correctamente.`);
  };

  // Receive Goods into Inventory (Recibir Mercadería)
  const handleReceiveGoods = (po) => {
    if (!confirm(`¿Confirmar recepción física de la orden ${po.poNumber}? Esto incrementará el stock de inventario automáticamente.`)) return;

    let updatedMaterials = [...(store.materials || [])];

    po.items.forEach((itm) => {
      const idx = updatedMaterials.findIndex((m) => m.id === itm.materialId);
      if (idx !== -1) {
        const current = Number(updatedMaterials[idx].currentStock || 0);
        const added = Number(itm.quantity || 0);
        updatedMaterials[idx] = {
          ...updatedMaterials[idx],
          currentStock: Number((current + added).toFixed(2)),
          costPerUnit: Number(itm.unitCost) || updatedMaterials[idx].costPerUnit
        };
        syncEntityRemote('pos_materials_inventory', updatedMaterials[idx]);
      }
    });

    // Create Expense in Petty Cash
    createPOSExpense(store, {
      advisorId: 'adv-admin',
      description: `Pago compra ${po.poNumber} (${po.supplierName})`,
      amount: po.totalAmount,
      category: 'Suministros'
    });

    const updatedPO = {
      ...po,
      status: 'received',
      receivedAt: new Date().toISOString()
    };

    const updatedPOs = purchaseOrders.map((p) => (p.id === po.id ? updatedPO : p));
    const updatedStore = { ...store, purchaseOrders: updatedPOs, materials: updatedMaterials };
    savePOSStoreLocal(updatedStore);
    onStoreUpdate(updatedStore);

    toast.success(`¡Mercadería de ${po.poNumber} ingresada con éxito! Stock actualizado.`);
  };

  return (
    <div className="pos-card" style={{ display: 'grid', gap: '16px' }}>
      {/* Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck size={22} style={{ color: 'var(--orange)' }} />
            Órdenes de Compra a Proveedores ({purchaseOrders.length})
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Abastecimiento de bobinas de lona, viniles y tintas con recepción automática a stock.
          </span>
        </div>

        <button
          type="button"
          className="pos-submit-order-btn"
          onClick={() => setIsModalOpen(true)}
          style={{ padding: '8px 14px', fontSize: '12px' }}
        >
          <Plus size={16} /> Emitir Orden de Compra
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
          <input
            type="text"
            className="pos-input"
            placeholder="Buscar por Nº orden, proveedor o nota..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <select
          className="pos-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '160px' }}
        >
          <option value="all">Todos los Estados</option>
          <option value="pending">⏳ Pendiente de Entrega</option>
          <option value="received">📦 Recibido en Bodega</option>
        </select>
      </div>

      {/* POs Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: '12px' }}>
        <table className="pos-orders-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
              <th style={{ padding: '12px', fontSize: '12px' }}>Nº Orden</th>
              <th style={{ padding: '12px', fontSize: '12px' }}>Fecha</th>
              <th style={{ padding: '12px', fontSize: '12px' }}>Proveedor</th>
              <th style={{ padding: '12px', fontSize: '12px' }}>Materiales</th>
              <th style={{ padding: '12px', fontSize: '12px' }}>Total ($)</th>
              <th style={{ padding: '12px', fontSize: '12px' }}>Estado</th>
              <th style={{ padding: '12px', fontSize: '12px', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredPOs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                  No hay órdenes de compra registradas.
                </td>
              </tr>
            ) : (
              filteredPOs.map((po) => (
                <tr key={po.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--orange)' }}>
                    {po.poNumber}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--muted)' }}>
                    {po.orderDate}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--ink)' }}>
                    {po.supplierName}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                    {po.items.map((i) => `${i.materialName} (${i.quantity} ${i.unit})`).join(', ')}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
                    ${Number(po.totalAmount).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 800,
                      background: po.status === 'received' ? '#dcfce7' : '#fef3c7',
                      color: po.status === 'received' ? '#166534' : '#b45309'
                    }}>
                      {po.status === 'received' ? '● Recibido en Stock' : '⏳ Pendiente'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      {po.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleReceiveGoods(po)}
                          className="pos-submit-order-btn"
                          style={{ padding: '4px 10px', fontSize: '11px', background: '#16a34a' }}
                          title="Ingresar al inventario"
                        >
                          <Package size={13} /> Recibir Mercadería
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPOForPrint(po)}
                        className="pos-nav-tab"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                        title="Ver / Imprimir Orden"
                      >
                        <Printer size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: CREATE PURCHASE ORDER */}
      {isModalOpen && (
        <div className="pos-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
          <div className="pos-modal-card" style={{ maxWidth: '620px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Nueva Orden de Compra</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePO} style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Proveedor *</label>
                  <select
                    className="pos-input"
                    value={poForm.supplierId}
                    onChange={(e) => setPOForm({ ...poForm, supplierId: e.target.value })}
                  >
                    {(store.suppliers || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.paymentTerms})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Fecha Estimada de Llegada</label>
                  <input
                    type="date"
                    className="pos-input"
                    value={poForm.expectedDate}
                    onChange={(e) => setPOForm({ ...poForm, expectedDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Material Item Selector */}
              <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--line)', display: 'grid', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800 }}>Agregar Sustrato / Material:</span>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Sustrato</label>
                    <select
                      className="pos-select"
                      value={itemMatId}
                      onChange={(e) => {
                        setItemMatId(e.target.value);
                        const mat = (store.materials || []).find((m) => m.id === e.target.value);
                        if (mat) setItemCost(mat.costPerUnit || 1.25);
                      }}
                    >
                      {(store.materials || []).map((m) => (
                        <option key={m.id} value={m.id}>{m.name} (Stock: {m.currentStock} {m.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Cantidad</label>
                    <input
                      type="number"
                      step="1"
                      className="pos-input"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Costo Unit. ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="pos-input"
                      value={itemCost}
                      onChange={(e) => setItemCost(e.target.value)}
                    />
                  </div>
                  <button type="button" onClick={handleAddItem} className="pos-submit-order-btn" style={{ padding: '8px 12px' }}>
                    +
                  </button>
                </div>
              </div>

              {/* PO Items List */}
              {poForm.items.length > 0 && (
                <div style={{ display: 'grid', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                  {poForm.items.map((itm, idx) => (
                    <div key={idx} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{itm.materialName} — {itm.quantity} {itm.unit}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800 }}>${itm.totalCost.toFixed(2)}</span>
                        <button type="button" onClick={() => handleRemoveItem(idx)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontWeight: 900, fontSize: '15px', color: 'var(--orange)' }}>
                    Total Pedido: ${poSubtotal.toFixed(2)}
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Notas de Envío / Instrucciones</label>
                <textarea
                  className="pos-textarea"
                  rows={2}
                  value={poForm.notes}
                  onChange={(e) => setPOForm({ ...poForm, notes: e.target.value })}
                  placeholder="Ej. Entregar en taller de 8am a 12pm"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="pos-nav-tab" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="pos-submit-order-btn">
                  <Save size={15} /> Guardar y Emitir Orden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE PO MODAL */}
      {selectedPOForPrint && (
        <div className="pos-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
          <div className="pos-modal-card" style={{ maxWidth: '650px', background: '#fff', color: '#000', padding: '24px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#ea580c' }}>GIGAPRINT — ORDEN DE COMPRA</h2>
                <span style={{ fontSize: '12px', color: '#64748b' }}>DEPARTAMENTO DE ADQUISICIONES & BODEGA</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>NRO. DE ORDEN</span>
                <strong style={{ fontSize: '18px', color: '#000' }}>{selectedPOForPrint.poNumber}</strong>
              </div>
            </div>

            <div style={{ margin: '14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
              <div><b>Proveedor:</b> {selectedPOForPrint.supplierName}</div>
              <div><b>Fecha Emisión:</b> {selectedPOForPrint.orderDate}</div>
              <div><b>Teléfono:</b> {selectedPOForPrint.supplierPhone}</div>
              <div><b>Fecha Llegada:</b> {selectedPOForPrint.expectedDate}</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', margin: '14px 0', border: '1px solid #cbd5e1' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Material / Sustrato</th>
                  <th style={{ padding: '8px' }}>Cantidad</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Costo Unit.</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedPOForPrint.items.map((i, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}><b>{i.materialName}</b></td>
                    <td style={{ padding: '8px' }}>{i.quantity} {i.unit}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>${Number(i.unitCost).toFixed(2)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>${Number(i.totalCost).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ textAlign: 'right', fontSize: '16px', fontWeight: 900, marginBottom: '20px' }}>
              TOTAL ORDEN: ${Number(selectedPOForPrint.totalAmount).toFixed(2)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="pos-nav-tab" onClick={() => setSelectedPOForPrint(null)}>Cerrar</button>
              <button type="button" className="pos-submit-order-btn" onClick={() => window.print()}>
                <Printer size={15} /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
