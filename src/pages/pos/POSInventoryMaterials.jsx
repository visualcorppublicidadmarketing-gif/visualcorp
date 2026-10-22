import React, { useState, useMemo, useRef } from 'react';
import { 
  Package, Search, Plus, AlertTriangle, CheckCircle2, 
  Layers, ArrowDownRight, RefreshCw, Edit2, ShieldAlert,
  Printer, Tag, Trash2, XCircle, Check, Sparkles, QrCode
} from 'lucide-react';
import { DEFAULT_MATERIALS, toISODate, logMaterialScrap } from '../../lib/posStore';

export function POSInventoryMaterials({ store, setStore }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [adjustModalMaterial, setAdjustModalMaterial] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');

  // Roll Label Modal State
  const [rollLabelModalMaterial, setRollLabelModalMaterial] = useState(null);
  const [rollWidthM, setRollWidthM] = useState('1.60');
  const [rollLengthM, setRollLengthM] = useState('50');
  const [rollLotCode, setRollLotCode] = useState(`LOT-${new Date().getFullYear()}-001`);

  // Technical Scrap Modal State
  const [scrapModalMaterial, setScrapModalMaterial] = useState(null);
  const [scrapQtyM2, setScrapQtyM2] = useState('');
  const [scrapReason, setScrapReason] = useState('Falla de cabezal / Inyección');
  const [scrapNotes, setScrapNotes] = useState('');

  const materials = store.materials?.length ? store.materials : DEFAULT_MATERIALS;

  const categories = useMemo(() => {
    return ['all', ...Array.from(new Set(materials.map((m) => m.category)))];
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const q = search.toLowerCase();
      const matchText = (m.name || '').toLowerCase().includes(q) ||
        (m.supplierName || '').toLowerCase().includes(q);
      const matchCat = categoryFilter === 'all' || m.category === categoryFilter;
      return matchText && matchCat;
    });
  }, [materials, search, categoryFilter]);

  const handleSaveAdjustment = (e) => {
    e.preventDefault();
    if (!adjustModalMaterial || !adjustQty) return;

    const qtyNumber = Number(adjustQty) || 0;
    const updatedMaterials = materials.map((m) => {
      if (m.id === adjustModalMaterial.id) {
        return {
          ...m,
          currentStock: Math.max(0, (Number(m.currentStock) || 0) + qtyNumber)
        };
      }
      return m;
    });

    const newLog = {
      id: 'log-' + Date.now(),
      materialId: adjustModalMaterial.id,
      quantityUsed: -qtyNumber,
      costApplied: qtyNumber * (adjustModalMaterial.costPerUnit || 1),
      notes: adjustNotes || 'Ajuste manual de inventario',
      createdAt: new Date().toISOString()
    };

    const nextState = {
      ...store,
      materials: updatedMaterials,
      materialLogs: [newLog, ...(store.materialLogs || [])]
    };

    setStore(nextState);
    setAdjustModalMaterial(null);
    setAdjustQty('');
    setAdjustNotes('');
  };

  const handleSaveScrap = (e) => {
    e.preventDefault();
    if (!scrapModalMaterial || !scrapQtyM2) return;

    const res = logMaterialScrap(store, {
      materialId: scrapModalMaterial.id,
      quantityM2: scrapQtyM2,
      reason: scrapReason,
      notes: scrapNotes
    });

    if (res.ok) {
      setStore(res.updatedStore);
      alert(`✓ Merma de ${scrapQtyM2} m² registrada y descontada de inventario.`);
      setScrapModalMaterial(null);
      setScrapQtyM2('');
      setScrapNotes('');
    } else {
      alert(`⚠️ Error: ${res.error}`);
    }
  };

  return (
    <div className="pos-inventory-container" style={{ display: 'grid', gap: '16px' }}>
      {/* Top Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'var(--paper)',
        padding: '16px',
        borderRadius: '16px',
        border: '1px solid var(--line)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Buscar sustrato, vinil, lona..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                fontSize: '12px'
              }}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              fontSize: '12px',
              fontWeight: '700'
            }}
          >
            <option value="all">Todas las Categorías</option>
            {categories.filter((c) => c !== 'all').map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>
          <Layers size={16} color="var(--orange)" />
          <span>{filteredMaterials.length} Sustratos & Bobinas Registradas</span>
        </div>
      </div>

      {/* Materials Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '14px'
      }}>
        {filteredMaterials.map((mat) => {
          const isLowStock = (Number(mat.currentStock) || 0) <= (Number(mat.minStockAlert) || 10);

          return (
            <div
              key={mat.id}
              style={{
                background: 'var(--paper)',
                borderRadius: '14px',
                border: isLowStock ? '1.5px solid #ef4444' : '1px solid var(--line)',
                padding: '16px',
                display: 'grid',
                gap: '10px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--orange-dark)', background: 'var(--orange-soft)', padding: '2px 6px', borderRadius: '4px' }}>
                    {mat.category}
                  </span>
                  <strong style={{ fontSize: '14px', color: 'var(--ink)', display: 'block', marginTop: '4px', lineHeight: 1.25 }}>
                    {mat.name}
                  </strong>
                </div>

                {isLowStock ? (
                  <span style={{ fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <ShieldAlert size={12} /> Stock Bajo
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', background: '#dcfce7', color: '#166534' }}>
                    Disponible
                  </span>
                )}
              </div>

              {/* Stock numbers */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                background: 'var(--bg)',
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid var(--line)'
              }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Stock Actual</span>
                  <strong style={{ fontSize: '20px', fontWeight: '900', color: isLowStock ? '#dc2626' : 'var(--ink)' }}>
                    {Number(mat.currentStock || 0).toFixed(1)} {mat.unit}
                  </strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Costo Base</span>
                  <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>
                    {'$' + Number(mat.costPerUnit || 0).toFixed(2) + ' / ' + mat.unit}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                <span>{mat.widthM ? 'Ancho: ' + mat.widthM + 'm' : ''} {mat.lengthM ? '| Rollo: ' + mat.lengthM + 'm' : ''}</span>
                <span>{mat.supplierName || 'Proveedor'}</span>
              </div>

              {/* Action Buttons Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setAdjustModalMaterial(mat)}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                  title="Ajuste manual o recepción de rollos"
                >
                  <Plus size={13} /> Ajustar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRollLabelModalMaterial(mat);
                    setRollWidthM(mat.widthM || '1.60');
                    setRollLengthM(mat.lengthM || '50');
                  }}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: '#eff6ff',
                    color: '#1e40af',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                  title="Generar e imprimir etiqueta térmica para rollo / bobina"
                >
                  <Printer size={13} /> Etiqueta
                </button>

                <button
                  type="button"
                  onClick={() => setScrapModalMaterial(mat)}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                  title="Registrar merma o desperdicio técnico"
                >
                  <AlertTriangle size={13} /> Merma
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Adjust Stock Modal */}
      {adjustModalMaterial && (
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
          <form onSubmit={handleSaveAdjustment} style={{
            background: 'var(--paper)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            border: '1px solid var(--line)',
            display: 'grid',
            gap: '14px'
          }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: 'var(--ink)' }}>
              Ajuste de Stock: {adjustModalMaterial.name}
            </h3>

            <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
              Stock actual: <strong>{adjustModalMaterial.currentStock} {adjustModalMaterial.unit}</strong>
            </p>

            <div style={{ display: 'grid', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--ink)' }}>
                Cantidad a agregar (ej. +50) o restar (ej. -10):
              </label>
              <input
                type="number"
                step="0.1"
                required
                placeholder="Ej. 50 (para un rollo nuevo)"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)' }}
              />
            </div>

            <div style={{ display: 'grid', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--ink)' }}>Motivo / Nota:</label>
              <input
                type="text"
                placeholder="Ej. Factura #4012 de Importadora Gráfica"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setAdjustModalMaterial(null)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)', cursor: 'pointer', fontWeight: '700' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ padding: '8px 16px', borderRadius: '8px', border: 0, background: 'var(--orange)', color: '#fff', cursor: 'pointer', fontWeight: '800' }}
              >
                Aplicar Ajuste
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Technical Scrap / Waste Modal */}
      {scrapModalMaterial && (
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
          <form onSubmit={handleSaveScrap} style={{
            background: 'var(--paper)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '440px',
            width: '100%',
            border: '1px solid var(--line)',
            display: 'grid',
            gap: '14px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
              <AlertTriangle size={22} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900' }}>
                Registro de Merma / Desperdicio Técnico
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
              Sustrato afectado: <strong>{scrapModalMaterial.name}</strong> (Stock: {scrapModalMaterial.currentStock} {scrapModalMaterial.unit})
            </p>

            <div style={{ display: 'grid', gap: '4px' }}>
              <label className="pos-label required">Cantidad Desperdiciada / Dañada ({scrapModalMaterial.unit}):</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="Ej. 3.50"
                value={scrapQtyM2}
                onChange={(e) => setScrapQtyM2(e.target.value)}
                className="pos-input"
              />
            </div>

            <div style={{ display: 'grid', gap: '4px' }}>
              <label className="pos-label required">Causa de la Merma:</label>
              <select
                className="pos-select"
                value={scrapReason}
                onChange={(e) => setScrapReason(e.target.value)}
              >
                <option value="Falla de cabezal / Inyección">Falla de cabezal / Inyección de tinta</option>
                <option value="Arrugamiento de sustrato en rodillos">Arrugamiento / Atasco en rodillos</option>
                <option value="Descarte por inicio de bobina sucia">Descarte por inicio de bobina / punta sucia</option>
                <option value="Error en archivo de diseño / Medidas">Error en archivo de diseño / Medidas cliente</option>
                <option value="Falla de curado UV / Adherencia">Falla de curado UV / Adherencia de tinta</option>
                <option value="Otro motivo técnico">Otro motivo técnico</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: '4px' }}>
              <label className="pos-label">Notas Adicionales / Operario:</label>
              <input
                type="text"
                placeholder="Detalle de máquina o lote..."
                value={scrapNotes}
                onChange={(e) => setScrapNotes(e.target.value)}
                className="pos-input"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setScrapModalMaterial(null)}
                className="pos-cat-pill"
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ padding: '8px 16px', borderRadius: '8px', border: 0, background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: '800', fontSize: '13px' }}
              >
                Registrar y Descontar Merma
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Roll / Bobbin Barcode Label Modal */}
      {rollLabelModalMaterial && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
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
            maxWidth: '460px',
            width: '100%',
            border: '1px solid var(--line)',
            display: 'grid',
            gap: '16px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={20} color="var(--orange)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: 'var(--ink)' }}>
                  Etiqueta de Bobina / Rollo
                </h3>
              </div>
              <button onClick={() => setRollLabelModalMaterial(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <XCircle size={18} />
              </button>
            </div>

            {/* Thermal Label Preview Card */}
            <div style={{
              background: '#fff',
              color: '#000',
              border: '2px dashed #000',
              padding: '16px',
              borderRadius: '8px',
              textAlign: 'center',
              fontFamily: 'monospace'
            }}>
              <div style={{ fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>
                GIGAPRINT — BODEGA DE BOBINAS
              </div>
              <div style={{ fontSize: '11px', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '8px' }}>
                CONTROL DE MATERIA PRIMA & TRAZABILIDAD
              </div>

              <div style={{ fontSize: '16px', fontWeight: 900, margin: '6px 0' }}>
                {rollLabelModalMaterial.name}
              </div>

              <div style={{ fontSize: '13px', margin: '4px 0' }}>
                <strong>DIMENSIONES:</strong> {rollWidthM}m ancho × {rollLengthM}m largo ({(Number(rollWidthM) * Number(rollLengthM)).toFixed(1)} m²)
              </div>

              <div style={{ fontSize: '12px', margin: '4px 0' }}>
                <strong>LOTE:</strong> {rollLotCode} | <strong>PROV:</strong> {rollLabelModalMaterial.supplierName || 'Importador'}
              </div>

              <div style={{ fontSize: '11px', color: '#333', marginTop: '6px' }}>
                FECHA INGRESO: {new Date().toLocaleDateString()}
              </div>

              {/* Barcode Simulation */}
              <div style={{ margin: '12px auto 4px', padding: '6px', background: '#000', color: '#fff', fontSize: '13px', fontWeight: 900, letterSpacing: '4px', maxWidth: '240px' }}>
                ||| | |||| | ||||| ||
              </div>
              <span style={{ fontSize: '10px' }}>ROLL-{rollLabelModalMaterial.id.toUpperCase()}-{rollLotCode.replace(/[^0-9]/g, '') || '01'}</span>
            </div>

            {/* Label Parameters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="pos-label">Ancho de Bobina (m):</label>
                <input
                  type="number"
                  step="0.05"
                  className="pos-input"
                  value={rollWidthM}
                  onChange={(e) => setRollWidthM(e.target.value)}
                />
              </div>
              <div>
                <label className="pos-label">Metraje Lineal (m):</label>
                <input
                  type="number"
                  step="1"
                  className="pos-input"
                  value={rollLengthM}
                  onChange={(e) => setRollLengthM(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRollLabelModalMaterial(null)}
                className="pos-cat-pill"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="pos-submit-order-btn"
                style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={15} /> Imprimir Etiqueta Térmica (Alt+P)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
