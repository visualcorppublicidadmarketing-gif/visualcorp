import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  Hash,
  PackageMinus,
  PackagePlus,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './inventory-quick-mobile-pad.css';

type QuickItem = {
  id: string;
  variantId: string;
  name: string;
  sku?: string;
  variant?: string;
  unit?: string;
  quantity?: number;
  branch?: string;
  branchId?: string | null;
  location?: string;
};

type InventoryQuickMobilePadProps = {
  isOpen: boolean;
  onClose: () => void;
  items: QuickItem[];
  branches: Array<{ id: string; name: string }>;
  canEdit: boolean;
  onDone: () => Promise<void>;
  onNotice?: (msg: string) => void;
  defaultActor?: string;
};

export function InventoryQuickMobilePad({
  isOpen,
  onClose,
  items,
  branches,
  canEdit,
  onDone,
  onNotice,
  defaultActor = '',
}: InventoryQuickMobilePadProps) {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<QuickItem | null>(null);
  const [mode, setMode] = useState<'consumption' | 'receipt' | 'waste' | 'adjustment'>('consumption');
  const [quantity, setQuantity] = useState<string>('1');
  const [actor, setActor] = useState(defaultActor || 'Taller');
  const [reason, setReason] = useState('Uso en orden de trabajo');
  const [busy, setBusy] = useState(false);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items.slice(0, 10);
    const q = search.toLowerCase();
    return items
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.sku && i.sku.toLowerCase().includes(q)) ||
          (i.variant && i.variant.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [items, search]);

  if (!isOpen) return null;

  const handleAddQty = (val: number) => {
    const current = Number(quantity) || 0;
    setQuantity(String(Math.max(0, current + val)));
  };

  const handleQuickReason = (text: string) => {
    setReason(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !supabase || !canEdit) return;

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      onNotice?.('Ingresa una cantidad válida mayor a cero.');
      return;
    }

    setBusy(true);
    try {
      const branchId = selectedItem.branchId || branches[0]?.id || 'f499caf7-6286-4c6e-abd7-d79fa58c27d0';

      let rpcResult: { data?: any; error?: any };
      if (mode === 'adjustment') {
        rpcResult = await supabase.rpc('set_inventory_count', {
          p_variant_id: selectedItem.variantId,
          p_branch_id: branchId,
          p_counted_quantity: qty,
          p_location_code: selectedItem.location || 'MAIN',
          p_note: `${reason.trim()} · ${actor.trim()}`,
        });
      } else {
        rpcResult = await supabase.rpc('record_inventory_movement', {
          p_variant_id: selectedItem.variantId,
          p_branch_id: branchId,
          p_movement_type: mode,
          p_quantity: qty,
          p_reason: `${reason.trim()} · ${actor.trim()}`,
          p_location_code: selectedItem.location || 'MAIN',
        });
      }
      const error = rpcResult.error;

      if (error) {
        onNotice?.(`No se pudo registrar: ${error.message}`);
      } else {
        const verb =
          mode === 'consumption'
            ? 'descontadas por consumo'
            : mode === 'receipt'
            ? 'ingresadas a bodega'
            : 'registradas como merma';
        onNotice?.(`¡Listo! ${qty} ${selectedItem.unit || 'uds'} ${verb} de ${selectedItem.name}.`);
        await onDone();
        onClose();
        setQuantity('1');
        setSelectedItem(null);
      }
    } catch (err: any) {
      onNotice?.(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vc-qpad-backdrop" role="presentation" onClick={onClose}>
      <div className="vc-qpad-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera del Pad */}
        <div className="vc-qpad-header">
          <div className="vc-qpad-title">
            <Zap size={18} className="vc-qpad-icon" />
            <div>
              <h3>Operación Rápida de Inventario</h3>
              <small>Optimizado para celular y personal de taller</small>
            </div>
          </div>
          <button type="button" className="vc-qpad-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="vc-qpad-content">
          {/* Selector de Acción */}
          <div className="vc-qpad-mode-group" role="group" aria-label="Tipo de operación">
            <button
              type="button"
              className={mode === 'consumption' ? 'is-active is-out' : ''}
              onClick={() => {
                setMode('consumption');
                setReason('Uso en orden de trabajo');
              }}
            >
              <PackageMinus size={16} /> Salida / Consumo
            </button>
            <button
              type="button"
              className={mode === 'receipt' ? 'is-active is-in' : ''}
              onClick={() => {
                setMode('receipt');
                setReason('Recepción de compra / llegada');
              }}
            >
              <PackagePlus size={16} /> Entrada / Compra
            </button>
            <button
              type="button"
              className={mode === 'waste' ? 'is-active is-waste' : ''}
              onClick={() => {
                setMode('waste');
                setReason('Merma / material dañado');
              }}
            >
              <Trash2 size={15} /> Merma
            </button>
          </div>

          {/* Selector o Buscador del Artículo */}
          {!selectedItem ? (
            <div className="vc-qpad-search-step">
              <label className="vc-qpad-label">1. Seleccionar artículo:</label>
              <div className="vc-qpad-search-bar">
                <Search size={16} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Escribe tinta, lona, vinil, taza, MDF…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="vc-qpad-results-list" role="list">
                {filteredItems.map((item) => (
                  <button
                    key={`${item.id}-${item.variantId}`}
                    type="button"
                    className="vc-qpad-item-card"
                    onClick={() => {
                      setSelectedItem(item);
                      setSearch('');
                    }}
                  >
                    <div>
                      <b>{item.name}</b>
                      {item.variant && <span className="vc-qpad-variant">{item.variant}</span>}
                    </div>
                    <div className="vc-qpad-stock-tag">
                      {item.quantity ?? '—'} {item.unit || 'uds'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="vc-qpad-selected-card">
              <div className="vc-qpad-selected-info">
                <small className="vc-qpad-label">Artículo seleccionado:</small>
                <h4>{selectedItem.name}</h4>
                <p>
                  {selectedItem.variant || selectedItem.sku || 'Estándar'} · Existencia:{' '}
                  <b>
                    {selectedItem.quantity ?? 0} {selectedItem.unit || 'uds'}
                  </b>
                </p>
              </div>
              <button
                type="button"
                className="vc-qpad-btn-change"
                onClick={() => setSelectedItem(null)}
              >
                Cambiar
              </button>
            </div>
          )}

          {/* Cantidad y Presets */}
          {selectedItem && (
            <div className="vc-qpad-qty-step">
              <label className="vc-qpad-label">2. Cantidad a registrar ({selectedItem.unit || 'uds'}):</label>

              <div className="vc-qpad-qty-input-row">
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="vc-qpad-qty-main"
                  autoFocus
                />
                <span className="vc-qpad-qty-unit">{selectedItem.unit || 'uds'}</span>
              </div>

              {/* Botones rápidos numéricos */}
              <div className="vc-qpad-presets" role="group">
                <button type="button" onClick={() => handleAddQty(1)}>+1</button>
                <button type="button" onClick={() => handleAddQty(5)}>+5</button>
                <button type="button" onClick={() => handleAddQty(10)}>+10</button>
                <button type="button" onClick={() => handleAddQty(25)}>+25</button>
                <button type="button" onClick={() => setQuantity('1')}>Reset 1</button>
              </div>

              {/* Motivo Rápido */}
              <div className="vc-qpad-meta-row">
                <label className="vc-qpad-label">Motivo rápido:</label>
                <div className="vc-qpad-reason-chips">
                  {['Uso en orden de trabajo', 'Reposición de taller', 'Cliente / Mostrador', 'Calibración / Prueba'].map(
                    (r) => (
                      <button
                        key={r}
                        type="button"
                        className={reason === r ? 'is-active' : ''}
                        onClick={() => handleQuickReason(r)}
                      >
                        {r}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="vc-qpad-operator-input">
                <label className="vc-qpad-label">Responsable:</label>
                <input
                  type="text"
                  required
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="Nombre de quien retira o ingresa"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className={`vc-qpad-submit-btn ${mode === 'receipt' ? 'btn-green' : 'btn-purple'}`}
              >
                {busy
                  ? 'Guardando…'
                  : mode === 'receipt'
                  ? `Confirmar entrada de +${quantity} ${selectedItem.unit || 'uds'}`
                  : mode === 'waste'
                  ? `Registrar merma de ${quantity} ${selectedItem.unit || 'uds'}`
                  : `Confirmar salida de −${quantity} ${selectedItem.unit || 'uds'}`}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
