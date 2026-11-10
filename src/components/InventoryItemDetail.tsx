import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, ClipboardCheck, History, MapPin, RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { formatInventoryQuantity, getInventoryBalance, getInventoryStatus, inventoryReplenishmentReason, inventoryStatusTone } from '../lib/inventoryModel';
import type { InventoryEntry } from '../lib/inventoryModel';
import './inventory-control.css';

type Movement = { id: string; created_at: string; created_by: string; movement_type: string; quantity_delta: number; reason: string; reference_type: string | null; reference_id: string | null };
type Props = { item: InventoryEntry & { unitCost?: number | null; supplierName?: string }; organizationId: string | null; userId?: string; canManage: boolean; canSeeCosts: boolean; onClose: () => void; onMovement: (item: InventoryEntry, type: string) => void };
const movementLabels: Record<string, string> = { receipt: 'Entrada', consumption: 'Consumo', return: 'Devolución', waste: 'Merma', sale: 'Venta', adjustment: 'Ajuste de conteo', transfer_out: 'Salida por traslado', transfer_in: 'Entrada por traslado' };
const dateTime = (value?: string) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(date) : 'Fecha no registrada';
};

export function InventoryItemDetail({ item, organizationId, userId, canManage, canSeeCosts, onClose, onMovement }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Movement[]>([]);
  const [cursor, setCursor] = useState<Pick<Movement, 'id' | 'created_at'> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  const historyAvailable = Boolean(supabase && organizationId && item.variantId && item.branchId);
  const balance = getInventoryBalance(item);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!supabase || !organizationId || !item.variantId || !item.branchId) { setLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError('');
    if (!cursor) { setRows([]); setHasMore(false); }
    void (async () => {
      try {
        let query = supabase.from('inventory_movements').select('id,created_at,created_by,movement_type,quantity_delta,reason,reference_type,reference_id')
          .eq('organization_id', organizationId).eq('variant_id', item.variantId).eq('branch_id', item.branchId).eq('location_code', item.location || 'MAIN')
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(31);
        if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
        const { data, error: queryError } = await query.abortSignal(controller.signal);
        if (!active) return;
        if (queryError) throw queryError;
        const page = (data || []) as Movement[];
        setRows(current => cursor ? [...new Map([...current, ...page.slice(0, 30)].map(row => [row.id, row])).values()] : page.slice(0, 30));
        setHasMore(page.length > 30);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'No se pudo consultar el historial de esta ubicación.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [organizationId, item.variantId, item.branchId, item.location, cursor, request]);

  return <dialog className="inventory-detail-dialog" ref={dialogRef} aria-labelledby="inventory-detail-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="inventory-detail-inner">
      <header><div><span className="eyebrow">FICHA DE EXISTENCIAS</span><h2 id="inventory-detail-title">{item.name}</h2><p>{item.variant || 'Variante base'} · {item.variantSku || item.sku || 'Sin SKU'}</p></div><button className="icon-button" type="button" aria-label="Cerrar detalle del artículo" onClick={onClose}><X size={20}/></button></header>
      <div className="inventory-detail-location"><MapPin size={16}/><span>{item.branch} · {item.area} · {item.location || 'Sin ubicación'}</span><span className={`inventory-status ${inventoryStatusTone(item)}`}>{getInventoryStatus(item)}</span></div>
      <dl className="inventory-detail-balances"><div><dt>Físico registrado</dt><dd>{formatInventoryQuantity(balance.physical, item.unit)}</dd></div><div><dt>Reservado</dt><dd>{formatInventoryQuantity(balance.reserved, item.unit)}</dd></div><div className="is-available"><dt>Disponible</dt><dd>{formatInventoryQuantity(balance.available, item.unit)}</dd></div><div><dt>Mínimo de la ficha</dt><dd>{formatInventoryQuantity(balance.minimum, item.unit)}</dd></div></dl>
      <p className="inventory-detail-formula">Disponible = físico − reservado. Los saldos corresponden a esta variante y ubicación.</p>
      <div className="inventory-detail-advice"><CircleAlert size={18}/><div><b>{balance.toMinimum === null ? 'Cantidad por confirmar' : `Falta hasta el mínimo: ${formatInventoryQuantity(balance.toMinimum, item.unit)}`}</b><p>{inventoryReplenishmentReason(item)}</p></div></div>
      {canManage && item.branchId && <div className="inventory-detail-actions"><button type="button" className="button button-outline" onClick={() => onMovement(item, 'entrada')}><ArrowDownToLine size={15}/>Entrada</button><button type="button" className="button button-outline" onClick={() => onMovement(item, 'consumo')} disabled={balance.available === null || balance.available <= 0}><ArrowUpFromLine size={15}/>Salida</button><button type="button" className="button button-dark" onClick={() => onMovement(item, 'ajuste')}><ClipboardCheck size={15}/>Conteo físico</button></div>}
      {canSeeCosts && <dl className="inventory-detail-cost"><div><dt>Costo unitario privado</dt><dd>{item.unitCost == null ? 'Sin registrar' : new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(item.unitCost)}</dd></div><div><dt>Proveedor registrado</dt><dd>{item.supplierName || 'Sin registrar'}</dd></div></dl>}
      <section className="inventory-detail-history" aria-labelledby="inventory-detail-history-title"><div className="inventory-detail-history-heading"><div><span className="eyebrow">TRAZABILIDAD DE ESTA UBICACIÓN</span><h3 id="inventory-detail-history-title"><History size={17}/>Historial de movimientos</h3></div><button className="icon-button" type="button" aria-label="Actualizar historial del artículo" disabled={loading || !historyAvailable} onClick={() => { setCursor(null); setRequest(current => current + 1); }}><RefreshCw size={16}/></button></div>
        {!historyAvailable ? <p className="inventory-detail-empty">{!item.branchId ? 'Asigna una sucursal para consultar los movimientos de la ubicación.' : 'Conecta la suite a su base compartida para consultar el historial.'}</p> : <>
          {error && <div className="inventory-detail-error" role="alert"><b>No se pudo cargar el historial</b><span>{error}</span><button type="button" className="button button-outline" onClick={() => setRequest(current => current + 1)}>Reintentar</button></div>}
          {loading && !rows.length && <p role="status" className="inventory-detail-empty">Consultando movimientos…</p>}
          {!loading && !error && !rows.length && <p className="inventory-detail-empty">No hay movimientos registrados para esta variante, sucursal y ubicación.</p>}
          <ol>{rows.map(row => <li key={row.id}><div className={`inventory-detail-delta ${Number(row.quantity_delta) < 0 ? 'negative' : 'positive'}`}>{Number(row.quantity_delta) > 0 ? '+' : ''}{formatInventoryQuantity(Number(row.quantity_delta), item.unit)}</div><div><b>{movementLabels[row.movement_type] || row.movement_type}</b><p>{row.reason || 'Sin motivo registrado'}</p><time dateTime={row.created_at}>{dateTime(row.created_at)}</time><small>{row.created_by === userId ? 'Registrado con tu cuenta' : 'Registro del equipo'}{row.reference_type ? ` · ${row.reference_type}` : ''}{row.reference_id ? ` · ${row.reference_id}` : ''}</small></div></li>)}</ol>
          {hasMore && !error && <button type="button" className="button button-outline inventory-detail-more" disabled={loading} onClick={() => setCursor(rows[rows.length - 1])}>{loading ? 'Cargando…' : 'Cargar movimientos anteriores'}</button>}
          {rows.length > 0 && <small className="inventory-detail-history-count">{rows.length} movimientos consultados{hasMore ? ' · hay más registros' : ' · fin del historial'}</small>}
        </>}
      </section>
      <footer>Última actualización registrada: {dateTime(item.updatedAt)}<br/>Las correcciones se registran como nuevos movimientos y conservan el historial.</footer>
    </div>
  </dialog>;
}
