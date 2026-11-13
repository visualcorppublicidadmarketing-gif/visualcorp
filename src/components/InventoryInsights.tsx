import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Eye, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Building2, ChartNoAxesCombined, CheckCircle2, ChevronLeft, ChevronRight, Clock, Copy, DollarSign, Image as ImageIcon, LayoutGrid, List, Lock, MapPin, Package, Search, SlidersHorizontal, Store, Trash2, TrendingUp, X } from 'lucide-react';
import referenceLibrary from '../data/inventory-reference-index.json';
import { inventoryImageRecordForSku, inventoryRollMaterialImageRecord } from '../data/inventoryProductImages';
import { InventoryArticleEditor } from './InventoryArticleEditor';
import { ContextMenu, type ContextMenuAction } from './ui/ContextMenu';
import { BorderBeam, NumberTicker } from './ui/MagicComponents';
import { Dialog, useConfirm } from './ui/OperationalKit';
import { inventorySpecificationSuggestions, inventoryTagSuggestions, inventoryTypeSuggestions } from '../lib/inventoryProductMetadata.mjs';
import { inventoryHealthState, summarizeInventoryHealth, summarizeInventoryUsage } from '../lib/inventoryMetrics.mjs';
import './InventoryInsights.css';

const referenceProducts = referenceLibrary.products as Array<{ id: string; name: string; tags: string[]; images: Array<{ path: string; label: string; series: string }> }>;
const viewModes: Array<{ key: 'table' | 'cards' | 'analytics'; Icon: React.ComponentType<{ size?: number }> }> = [
  { key: 'table', Icon: List }, { key: 'cards', Icon: LayoutGrid }, { key: 'analytics', Icon: ChartNoAxesCombined },
];

const modeNames: Record<string, string> = { table: 'Tabla', cards: 'Tarjetas', analytics: 'Métricas' };
const minimumConfigured = (item) => item.minimumConfigured ?? Number(item.minimum || 0) > 0;
const healthLabels = {
  archived: 'Archivado',
  uncounted: 'Sin conteo',
  outOfStock: 'Agotado',
  replenish: 'Reponer',
  inStock: 'En stock',
};
const inventoryState = (item) => {
  const state = inventoryHealthState(item);
  return state === 'inStock' && !minimumConfigured(item) ? 'Mínimo pendiente' : healthLabels[state];
};
const inventoryStatusClass = (item) => item.sourceStatus ? 'pending' : inventoryState(item) === 'Mínimo pendiente' ? 'pending' : ['Agotado', 'Reponer'].includes(inventoryState(item)) ? 'low' : 'ok';
const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const suggestedReference = (item) => {
  const query = normalized(`${item.name} ${item.category} ${item.itemType} ${(item.tags || []).join(' ')}`);
  return referenceProducts
    .filter((product) => {
      const name = normalized(product.name);
      return name.includes(' ') ? query.includes(name) : new RegExp(`\\b${name}\\b`).test(query);
    })
    .sort((a, b) => b.name.length - a.name.length)[0]?.images[0];
};
const productImage = (item) => {
  const materialImage = inventoryRollMaterialImageRecord(item);
  const assigned = inventoryImageRecordForSku(item.sku);
  const assignedPath = assigned?.path || '';
  const directPath = item.referenceImageUrl || '';
  const suggested = !materialImage && !directPath && !assignedPath ? suggestedReference(item) : null;
  const primaryPath = materialImage?.path || directPath || assignedPath || suggested?.path || '';
  const label = materialImage?.label || (directPath && directPath !== assignedPath ? 'Referencia asignada' : assigned?.label || suggested?.label || '');
  const gallery = Array.isArray(item.productImages) ? item.productImages.map((image) => ({ path: image.url, label: image.label || 'Imagen del producto' })).filter((image) => image.path) : [];
  const addImage = (path, imageLabel) => {
    if (path && !gallery.some((image) => image.path === path)) gallery.unshift({ path, label: imageLabel });
  };
  if (materialImage) {
    addImage(directPath, directPath === assignedPath ? assigned?.label || 'Referencia anterior' : 'Referencia asignada');
    addImage(assignedPath, assigned?.label || 'Referencia de catálogo');
    addImage(materialImage.path, materialImage.label);
  } else {
    addImage(assignedPath, assigned?.label || 'Referencia de catálogo');
    addImage(directPath, directPath !== assignedPath ? 'Referencia asignada' : assigned?.label || 'Referencia generada');
    addImage(suggested?.path || '', suggested?.label || '');
  }
  return { path: primaryPath, label, gallery };
};

export function InventoryInsights({ id, hidden, items, optionSourceItems = items, inventoryGroups = [], canSeeCosts, canEditCosts = false, canEdit, canReserve, canMove, canRequestTransfer, onTransfer, onEdit, onReserve, onMovement, onCost, onArchive, onArchiveMany, onDuplicate, formatDate, formatMoney, metadataEdit, setMetadataEdit, reservationEdit, setReservationEdit, onSaveMetadata, onSaveReservation, metadataSaveBusy = false, branchOptions = [], onAssignBranch, onAssignBranchMany, onInspect }) {
  const confirm = useConfirm();
  const [term, setTerm] = useState('');
  const [area, setArea] = useState('Todas');
  const [branch, setBranch] = useState('Todas');
  const [type, setType] = useState('Todos');
  const [status, setStatus] = useState('Todos');
  const [tag, setTag] = useState('Todos');
  const [mode, setMode] = useState('cards');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTerm, setLibraryTerm] = useState('');
  const [imagePreview, setImagePreview] = useState<{path:string;name:string;label:string;images?:Array<{path:string;label:string}>;index?:number}|null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(()=>new Set());
  const [bulkBranch, setBulkBranch] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState('');
  const trackProductSpotlight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>('.inventory-product-card');
    if (!card) return;
    const bounds = card.getBoundingClientRect();
    card.style.setProperty('--vc-spot-x', `${event.clientX - bounds.left}px`);
    card.style.setProperty('--vc-spot-y', `${event.clientY - bounds.top}px`);
  };
  const clearProductSpotlight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>('.inventory-product-card');
    if (card && !(event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) {
      card.style.removeProperty('--vc-spot-x');
      card.style.removeProperty('--vc-spot-y');
    }
  };
  const areas = [...new Set<string>(items.map((item) => item.area).filter(Boolean))].sort();
  const branches = [...new Set<string>(items.map((item) => item.branch).filter(Boolean))].sort();
  const types = [...new Set<string>(items.map((item) => item.itemType).filter(Boolean))].sort();
  const tags = [...new Set<string>(items.flatMap((item) => item.tags || []))].sort();
  const typeSuggestions = inventoryTypeSuggestions(optionSourceItems);
  const tagSuggestions = inventoryTagSuggestions(optionSourceItems);
  const specificationOptions = {
    finish: inventorySpecificationSuggestions(optionSourceItems, 'finish'),
    color: inventorySpecificationSuggestions(optionSourceItems, 'color'),
    purchase_unit: inventorySpecificationSuggestions(optionSourceItems, 'purchase_unit'),
    material: inventorySpecificationSuggestions(optionSourceItems, 'material'),
  };
  const filtered = useMemo(() => items.filter((item) => {
    const currentStatus = inventoryState(item);
    const query = normalized(`${item.name} ${item.description} ${item.sku} ${item.variantSku} ${item.variant} ${item.category} ${item.itemType} ${item.location} ${(item.tags || []).join(' ')}`);
    return !item.archived && (area === 'Todas' || item.area === area) && (branch === 'Todas' || item.branch === branch)
      && (type === 'Todos' || item.itemType === type) && (status === 'Todos' || currentStatus === status)
      && (tag === 'Todos' || (item.tags || []).includes(tag)) && query.includes(normalized(term));
  }), [items, area, branch, type, status, tag, term]);
  const uniqueFiltered = [...new Map<string, any>(filtered.filter((item)=>item.remoteItemId).map((item)=>[item.remoteItemId,item])).values()];
  const uniqueActive = [...new Map<string, any>(items.filter((item)=>!item.archived&&item.remoteItemId).map((item)=>[item.remoteItemId,item])).values()];
  const selectedItems = uniqueActive.filter((item)=>selectedIds.has(item.remoteItemId));
  const toggleSelected=(id:string)=>setSelectedIds((current)=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
  const selectVisible=()=>setSelectedIds((current)=>{const next=new Set(current);const visibleIds=uniqueFiltered.map((item)=>item.remoteItemId);if(visibleIds.length&&visibleIds.every((id)=>next.has(id)))visibleIds.forEach((id)=>next.delete(id));else visibleIds.forEach((id)=>next.add(id));return next;});
  const confirmArchiveMany=async()=>{if(!selectedItems.length)return;const accepted=await confirm({eyebrow:'SELECCIÓN MASIVA DE INVENTARIO',title:`¿Eliminar ${selectedItems.length} artículo(s) del catálogo activo?`,description:'Los artículos dejarán de aparecer en las vistas operativas.',tone:'danger',destructive:true,confirmLabel:`Eliminar ${selectedItems.length} artículo(s)`,cancelLabel:'Conservar artículos',summaryItems:[{label:'Artículos seleccionados',value:String(selectedItems.length)},{label:'Primer artículo',value:selectedItems[0]?.name||'—'}],consequences:['Se conservan todos los movimientos, conteos y datos históricos.','No se borran ni ajustan existencias históricas.']});if(!accepted)return;await onArchiveMany(selectedItems);setSelectedIds(new Set());};
  const assignSelectedBranch=async()=>{if(!selectedItems.length||!bulkBranch||bulkBusy||!onAssignBranchMany)return;setBulkBusy(true);setBulkFeedback('');try{const completed=await onAssignBranchMany(selectedItems,bulkBranch);if(completed){setSelectedIds(new Set());setBulkBranch('');setBulkFeedback('Asignación completada. Los conteos físicos siguen pendientes.');}}catch(error){setBulkFeedback(error instanceof Error?error.message:'No se pudo completar la asignación.');}finally{setBulkBusy(false);}};
  const copySelected=async()=>{if(!selectedItems.length)return;const content=selectedItems.map((item)=>`${item.sku||item.remoteItemId}\t${item.name}${item.variant?`\t${item.variant}`:''}`).join('\n');try{await navigator.clipboard.writeText(content);setBulkFeedback(`${selectedItems.length} artículos copiados.`);}catch{setBulkFeedback('El navegador no permitió copiar la selección.');}};
  const inventoryActions = (item, index: number): ContextMenuAction[] => [
    ...(onInspect ? [{ label: 'Ver detalle de existencias', icon: <Eye size={14}/>, onSelect: () => onInspect(item) }] : []),
    ...(canEdit ? [{ label: 'Editar ficha del artículo', icon: <SlidersHorizontal size={14}/>, onSelect: () => onEdit(item) }] : []),
    ...(canEdit && filtered.findIndex((candidate) => candidate.remoteItemId === item.remoteItemId) === index ? [{ label: 'Duplicar artículo', icon: <Copy size={14}/>, onSelect: () => onDuplicate(item) }] : []),
    ...((canMove || canReserve || canRequestTransfer || canEditCosts) ? [{ kind: 'separator' as const, label: '', onSelect: () => {} }] : []),
    ...(canMove ? [
      { label: 'Registrar entrada', icon: <ArrowDownToLine size={14}/>, onSelect: () => onMovement(item, 'entrada') },
      { label: 'Registrar salida', icon: <ArrowUpFromLine size={14}/>, onSelect: () => onMovement(item, 'consumo') },
      { label: 'Conteo / ajuste', icon: <ChartNoAxesCombined size={14}/>, onSelect: () => onMovement(item, 'ajuste') },
    ] : []),
    ...(canReserve && !item.sourceStatus ? [{ label: 'Administrar reserva', icon: <ArrowLeftRight size={14}/>, onSelect: () => onReserve(item) }] : []),
    ...(canEditCosts ? [{ label: 'Editar costo unitario', icon: <DollarSign size={14}/>, onSelect: () => onCost(item) }] : []),
    ...(canRequestTransfer ? [{ label: 'Solicitar traslado', icon: <ArrowLeftRight size={14}/>, onSelect: () => onTransfer(item) }] : []),
    ...(canEdit ? [{ kind: 'separator' as const, label: '', onSelect: () => {} }, { label: 'Eliminar del catálogo activo', icon: <Trash2 size={14}/>, onSelect: () => onArchive(item), destructive: true }] : []),
  ];
  const usage = summarizeInventoryUsage(filtered);
  const physical = filtered.filter((item) => !item.sourceStatus);
  const health = summarizeInventoryHealth(filtered);
  const replenishmentCount = health.replenish;
  const valued = physical.filter((item) => item.unitCost !== null);
  const stockValue = valued.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const days = (date) => date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000)) : null;
  const libraryProducts = referenceProducts.filter((product) => normalized(`${product.name} ${product.tags.join(' ')}`).includes(normalized(libraryTerm)));
  const statusOptions = ['Todos', 'En stock', 'Reponer', 'Mínimo pendiente', 'Agotado', 'Sin conteo'];
  const statusCount = (value) => value === 'Todos' ? items.filter((item) => !item.archived).length : items.filter((item) => !item.archived && inventoryState(item) === value).length;

  const totalFilteredCount = health.total;
  const inStockPct = totalFilteredCount ? Math.round((health.inStock / totalFilteredCount) * 100) : 0;
  const replenishPct = totalFilteredCount ? Math.round((health.replenish / totalFilteredCount) * 100) : 0;
  const outOfStockPct = totalFilteredCount ? Math.round((health.outOfStock / totalFilteredCount) * 100) : 0;
  const uncountedPct = totalFilteredCount ? Math.round((health.uncounted / totalFilteredCount) * 100) : 0;

  const branchMetrics = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      const b = item.branch || 'Sin sucursal';
      const cur = map.get(b) || { total: 0, inStock: 0, replenish: 0, outOfStock: 0, uncounted: 0, value: 0 };
      cur.total += 1;
      if (item.sourceStatus) cur.uncounted += 1;
      else cur[inventoryHealthState(item)] += 1;
      if (!item.sourceStatus && item.unitCost !== null) {
        cur.value += (Number(item.quantity) || 0) * Number(item.unitCost);
      }
      map.set(b, cur);
    });
    return [...map.entries()].map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const areaMetrics = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      const a = item.area || 'Sin área';
      const cur = map.get(a) || { total: 0, alerts: 0, value: 0 };
      cur.total += 1;
      const state = inventoryHealthState(item);
      if (state === 'outOfStock' || state === 'replenish') {
        cur.alerts += 1;
      }
      if (!item.sourceStatus && item.unitCost !== null) {
        cur.value += (Number(item.quantity) || 0) * Number(item.unitCost);
      }
      map.set(a, cur);
    });
    return [...map.entries()].map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const topConsumedItems = useMemo(() => {
    return filtered
      .filter((item) => Number(item.consumedLast30Days) > 0)
      .sort((a, b) => (Number(b.consumedLast30Days) || 0) - (Number(a.consumedLast30Days) || 0))
      .slice(0, 6);
  }, [filtered]);

  const reservedItemsList = useMemo(() => {
    return filtered
      .filter((item) => Number(item.reservedQuantity) > 0)
      .sort((a, b) => (Number(b.reservedQuantity) || 0) - (Number(a.reservedQuantity) || 0))
      .slice(0, 6);
  }, [filtered]);

  return <><section id={id} hidden={hidden} className="panel inventory-insights">
    <header className="inventory-insights-header"><div><span className="eyebrow">FICHA Y MÉTRICAS</span><h3>Catálogo de inventario</h3><p>Busca y filtra artículos por sucursal, área y estado. La etiqueta de cada imagen indica su origen; las referencias no confirman stock físico.</p></div>
      <nav className="inventory-insights-modes" aria-label="Modo de vista">{viewModes.map(({ key, Icon }) => <button type="button" key={key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)} title={`Vista ${modeNames[key]}`} aria-pressed={mode === key}><Icon size={16}/><span>{modeNames[key]}</span></button>)}</nav>
    </header>
    <nav className="inventory-quick-status" aria-label="Filtrar artículos por estado">{statusOptions.map((value) => <button type="button" key={value} className={`${status === value ? 'active' : ''} ${value === 'Reponer' || value === 'Agotado' ? 'attention' : ''}`} onClick={() => setStatus(value)} aria-pressed={status === value}><span>{value}</span><b>{statusCount(value)}</b></button>)}</nav>
    <div className="inventory-insights-filters"><label className="inventory-insights-search"><Search size={15} aria-hidden="true"/><input aria-label="Buscar artículos por nombre, ID o etiqueta" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar nombre, ID o tag"/></label>
      {[
        { label: 'Sucursal', value: branch, setValue: setBranch, choices: branches },
        { label: 'Área', value: area, setValue: setArea, choices: areas },
        { label: 'Tipo', value: type, setValue: setType, choices: types },
        { label: 'Tag', value: tag, setValue: setTag, choices: tags },
      ].map(({ label, value, setValue, choices }) => <select key={label} aria-label={label} value={value} onChange={(event) => setValue(event.target.value)}><option>{label === 'Sucursal' || label === 'Área' ? 'Todas' : 'Todos'}</option>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select>)}
      <span>{filtered.length} artículos</span>{(term || area !== 'Todas' || branch !== 'Todas' || type !== 'Todos' || status !== 'Todos' || tag !== 'Todos') && <button type="button" className="inventory-clear-filters" onClick={() => { setTerm(''); setArea('Todas'); setBranch('Todas'); setType('Todos'); setStatus('Todos'); setTag('Todos'); }}>Limpiar filtros</button>}
    </div>
    {canEdit&&<div className="inventory-bulk-bar"><label className="inventory-bulk-select"><input type="checkbox" checked={uniqueFiltered.length>0&&uniqueFiltered.every((item)=>selectedIds.has(item.remoteItemId))} onChange={selectVisible}/> Seleccionar todos los artículos filtrados</label>
      {selectedItems.length>0&&<div className="inventory-bulk-tools" aria-label="Herramientas de selección masiva"><span className="inventory-bulk-count">{selectedItems.length} seleccionados</span>
        {onAssignBranchMany&&<div className="inventory-bulk-branch"><MapPin size={14}/><select aria-label="Sucursal para asignación masiva" value={bulkBranch} onChange={(event)=>setBulkBranch(event.target.value)}><option value="">Asignar sucursal…</option>{branchOptions.map((name)=><option key={name} value={name}>{name}</option>)}</select><button type="button" className="button button-outline" onClick={assignSelectedBranch} disabled={!bulkBranch||bulkBusy}><MapPin size={13}/>{bulkBusy?'Asignando…':'Asignar sucursal'}</button></div>}
        <button type="button" className="button button-outline" onClick={copySelected}><Copy size={13}/>Copiar lista</button><button type="button" className="inventory-delete-small" onClick={()=>void confirmArchiveMany()}><Trash2 size={13}/>Eliminar seleccionados</button><button type="button" className="inventory-bulk-clear" onClick={()=>{setSelectedIds(new Set());setBulkFeedback('');}} aria-label="Limpiar selección"><X size={14}/>Limpiar</button>
        <small>Asignar sucursal solo configura variantes sin sucursal ni saldo físico. Los conteos e historial se conservan.</small>{bulkFeedback&&<span className="inventory-bulk-feedback" role="status">{bulkFeedback}</span>}
      </div>}
    </div>}{mode === 'analytics' ? (
      <div className="inventory-analytics-dashboard">
        <div className="inventory-analytics-kpis">
          <article className="inventory-analytics-kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-label">Valor en stock contado</span>
              <span className="kpi-icon-badge purple"><DollarSign size={14}/></span>
            </div>
            <b className="kpi-value">{canSeeCosts ? formatMoney(stockValue) : 'Restringido'}</b>
            <small className="kpi-subtext">
              {canSeeCosts ? `${valued.length} de ${physical.length} artículos contados con costo` : 'Requiere permisos de costos'}
            </small>
          </article>

          <article className="inventory-analytics-kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-label">Artículos en stock activo</span>
              <span className="kpi-icon-badge green"><CheckCircle2 size={14}/></span>
            </div>
            <b className="kpi-value"><NumberTicker value={health.inStock}/> <span className="kpi-pct green">({inStockPct}%)</span></b>
            <small className="kpi-subtext">Existencias seguras por encima del mínimo</small>
          </article>

          <article className={`inventory-analytics-kpi-card ${replenishmentCount > 0 ? 'kpi-card-warning' : ''}`}>
            {replenishmentCount > 0 && <BorderBeam />}
            <div className="kpi-card-header">
              <span className="kpi-label">Saldos bajo mínimo</span>
              <span className="kpi-icon-badge amber"><AlertTriangle size={14}/></span>
            </div>
            <b className="kpi-value warning-text"><NumberTicker value={replenishmentCount}/> <span className="kpi-pct amber">({replenishPct}%)</span></b>
            <small className="kpi-subtext">Artículos que requieren reposición prioritaria</small>
          </article>

          <article className={`inventory-analytics-kpi-card ${health.outOfStock > 0 ? 'kpi-card-danger' : ''}`}>
            <div className="kpi-card-header">
              <span className="kpi-label">Artículos agotados</span>
              <span className="kpi-icon-badge red"><Package size={14}/></span>
            </div>
            <b className="kpi-value danger-text"><NumberTicker value={health.outOfStock}/> <span className="kpi-pct red">({outOfStockPct}%)</span></b>
            <small className="kpi-subtext">Existencia física en 0 unidades</small>
          </article>

          <article className="inventory-analytics-kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-label">Pendientes de conteo</span>
              <span className="kpi-icon-badge blue"><Clock size={14}/></span>
            </div>
            <b className="kpi-value"><NumberTicker value={health.uncounted}/> <span className="kpi-pct purple">({uncountedPct}%)</span></b>
            <small className="kpi-subtext">En catálogo, pendiente de inventario físico</small>
          </article>

          <article className="inventory-analytics-kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-label">Movimientos últimos 30 días</span>
              <span className="kpi-icon-badge purple"><TrendingUp size={14}/></span>
            </div>
            <b className="kpi-value"><NumberTicker value={usage.recordsLast30Days}/> <span className="kpi-sub-unit">artículos</span></b>
            <small className="kpi-subtext">Con salidas o consumo directo en taller</small>
          </article>
        </div>

        <div className="inventory-analytics-strip-card">
          <div className="analytics-strip-header">
            <div>
              <h4>Salud y distribución general del inventario</h4>
              <p>Composición de los {totalFilteredCount} artículos filtrados según su estado operativo actual</p>
            </div>
            <div className="analytics-strip-meta">
              <span>{health.inStock + health.replenish + health.outOfStock} contados ({Math.round(((health.inStock + health.replenish + health.outOfStock) / (totalFilteredCount || 1)) * 100)}%)</span>
            </div>
          </div>
          <div className="inventory-health-progress-bar" role="progressbar" aria-label="Distribución de salud del inventario">
            {inStockPct > 0 && <div className="bar-segment bar-ok" style={{ width: `${inStockPct}%` }} title={`En stock: ${health.inStock} (${inStockPct}%)`} />}
            {replenishPct > 0 && <div className="bar-segment bar-warning" style={{ width: `${replenishPct}%` }} title={`Reponer: ${health.replenish} (${replenishPct}%)`} />}
            {outOfStockPct > 0 && <div className="bar-segment bar-danger" style={{ width: `${outOfStockPct}%` }} title={`Agotado: ${health.outOfStock} (${outOfStockPct}%)`} />}
            {uncountedPct > 0 && <div className="bar-segment bar-uncounted" style={{ width: `${uncountedPct}%` }} title={`Sin conteo: ${health.uncounted} (${uncountedPct}%)`} />}
          </div>
          <div className="inventory-health-legend">
            <button type="button" className="legend-item" onClick={() => setStatus('En stock')}>
              <span className="legend-dot dot-ok" />
              <span className="legend-title">En stock</span>
              <b>{health.inStock}</b>
              <small>({inStockPct}%)</small>
            </button>
            <button type="button" className="legend-item" onClick={() => setStatus('Reponer')}>
              <span className="legend-dot dot-warning" />
              <span className="legend-title">Reponer</span>
              <b>{health.replenish}</b>
              <small>({replenishPct}%)</small>
            </button>
            <button type="button" className="legend-item" onClick={() => setStatus('Agotado')}>
              <span className="legend-dot dot-danger" />
              <span className="legend-title">Agotado</span>
              <b>{health.outOfStock}</b>
              <small>({outOfStockPct}%)</small>
            </button>
            <button type="button" className="legend-item" onClick={() => setStatus('Sin conteo')}>
              <span className="legend-dot dot-uncounted" />
              <span className="legend-title">Sin conteo</span>
              <b>{health.uncounted}</b>
              <small>({uncountedPct}%)</small>
            </button>
          </div>
        </div>

        <div className="inventory-analytics-split-grid">
          <div className="inventory-analytics-section-card">
            <div className="section-card-title">
              <Building2 size={16} />
              <div>
                <h4>Distribución por Sucursal y Área Operativa</h4>
                <small>Carga de materiales y alertas por centro de trabajo</small>
              </div>
            </div>

            <div className="analytics-branches-row">
              {branchMetrics.map((b) => (
                <div key={b.name} className="analytics-branch-box">
                  <div className="branch-box-head">
                    <Store size={14} />
                    <b>{b.name}</b>
                    <span className="branch-total-badge">{b.total} artículos</span>
                  </div>
                  <div className="branch-box-stats">
                    <span>En stock: <strong>{b.inStock}</strong></span>
                    <span>Bajo mínimo: <strong className={b.replenish > 0 ? 'text-amber' : ''}>{b.replenish}</strong></span>
                    <span>Agotados: <strong className={b.outOfStock > 0 ? 'text-red' : ''}>{b.outOfStock}</strong></span>
                    <span>Sin conteo: <strong>{b.uncounted}</strong></span>
                  </div>
                  {canSeeCosts && b.value > 0 && (
                    <div className="branch-box-value">
                      <small>Valoración parcial:</small>
                      <strong>{formatMoney(b.value)}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <h5 className="sub-section-title">Desglose por Áreas de Producción</h5>
            <div className="analytics-areas-list">
              {areaMetrics.slice(0, 6).map((a) => {
                const pct = Math.round((a.total / (totalFilteredCount || 1)) * 100);
                return (
                  <div key={a.name} className="analytics-area-row">
                    <div className="area-info">
                      <span className="area-name">{a.name}</span>
                      <span className="area-count">{a.total} artículos ({pct}%)</span>
                    </div>
                    <div className="area-bar-bg">
                      <div className="area-bar-fill" style={{ width: `${Math.min(100, pct * 2)}%` }} />
                    </div>
                    <div className="area-badges">
                      {a.alerts > 0 ? (
                        <span className="area-alert-badge">{a.alerts} en alerta</span>
                      ) : (
                        <span className="area-ok-badge">Sin alertas</span>
                      )}
                      {canSeeCosts && a.value > 0 && <span className="area-val">{formatMoney(a.value)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="inventory-analytics-section-card">
            <div className="section-card-title">
              <Activity size={16} />
              <div>
                <h4>Mayor Consumo Reciente (30 Días)</h4>
                <small>Materiales con mayor rotación y salidas registradas</small>
              </div>
            </div>

            <div className="analytics-top-list">
              {topConsumedItems.length > 0 ? (
                topConsumedItems.map((item, idx) => {
                  const maxConsumed = Number(topConsumedItems[0]?.consumedLast30Days) || 1;
                  const barWidth = Math.max(8, Math.round(((Number(item.consumedLast30Days) || 0) / maxConsumed) * 100));
                  return (
                    <div key={item.id} className="top-consumed-item">
                      <div className="top-rank-badge">#{idx + 1}</div>
                      <div className="top-item-details">
                        <div className="top-item-header">
                          <b>{item.name}</b>
                          <span className="top-consumed-val">
                            {Number(item.consumedLast30Days).toLocaleString('es-EC', { maximumFractionDigits: 2 })} {item.unit}
                          </span>
                        </div>
                        <div className="top-item-sub">
                          <span>{item.branch} · {item.area}</span>
                          <span className={`inventory-status ${inventoryStatusClass(item)}`}>{inventoryState(item)}</span>
                        </div>
                        <div className="top-item-bar-bg">
                          <div className="top-item-bar-fill" style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="analytics-empty-state">
                  <Clock size={20} />
                  <p>No se registran salidas en los últimos 30 días para los artículos filtrados.</p>
                </div>
              )}
            </div>

            <h5 className="sub-section-title">Consumo Histórico Acumulado por Unidad</h5>
            <div className="analytics-units-grid">
              {usage.totalsByUnit.slice(0, 6).map(({ unit, quantity }) => (
                <div key={unit} className="analytics-unit-card">
                  <span className="unit-label">{unit}</span>
                  <b className="unit-amount">{quantity.toLocaleString('es-EC', { maximumFractionDigits: 2 })}</b>
                  <small>despachado históricamente</small>
                </div>
              ))}
              {usage.totalsByUnit.length === 0 && (
                <small className="analytics-no-data">Sin historial de consumo registrado.</small>
              )}
            </div>

            {reservedItemsList.length > 0 && (
              <div className="analytics-reservations-summary">
                <div className="reservations-header">
                  <Lock size={14} />
                  <span>Artículos con unidades reservadas para trabajos activos</span>
                </div>
                <div className="reservations-tags">
                  {reservedItemsList.map((res) => (
                    <span key={res.id} className="res-tag">
                      {res.name}: <b>{res.reservedQuantity} {res.unit}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : mode === 'cards' ? <div className="inventory-insights-cards" onPointerMove={trackProductSpotlight} onPointerOut={clearProductSpotlight}>{filtered.map((item, index) => { const image = productImage(item); return <ContextMenu key={item.id} className="inventory-card-context" label={`Acciones para ${item.name}`} actions={inventoryActions(item, index)}>
          <article className={`inventory-product-card vc-magic-card is-card-${inventoryStatusClass(item)}`}>
            <button type="button" className={`inventory-product-image ${image.label ? 'suggested' : ''}`} onClick={() => image.path && setImagePreview({path:image.path,name:item.name,label:image.label||'Imagen de referencia',images:image.gallery,index:0})} disabled={!image.path} aria-label={image.path?`Ver galería de ${image.gallery.length} imágenes de ${item.name}`:undefined}>
              {image.path ? <><img src={image.path} alt={`Referencia visual de ${item.name}`} loading="lazy"/>{image.label && <span className="inventory-reference-badge">{image.label}</span>}</> : <ImageIcon size={22}/>}
            </button>
            <div className="inventory-product-main">
              <div>
                <b>{item.name}</b>
                <small className="inventory-product-submeta">
                  <code className="inventory-card-sku">{item.sku || item.id}</code>
                  <span>{item.branch || 'Sin sucursal'}</span>
                  <span>{item.area || 'Sin área'}</span>
                </small>
                {item.variant && <small className="inventory-product-variant">Variante: {item.variant}</small>}
                {item.customFields?.condition_status && <small className={`inventory-condition-chip is-${String(item.customFields.condition_status).toLowerCase().replaceAll(' ','-')}`}>Condición · {String(item.customFields.condition_status)}{item.customFields.condition_note ? ` · ${String(item.customFields.condition_note)}` : ''}</small>}
              </div>
            </div>
            <div className="inventory-product-tags">
              {item.itemType && <em className="is-type-tag">{item.itemType}</em>}{(item.tags || []).slice(0, 5).map((value) => <em key={value}>{value}</em>)}
            </div>
            <div className="inventory-product-state">
              <span className={`inventory-status ${inventoryStatusClass(item)}`}>{inventoryState(item)}</span>
              {!item.sourceStatus && (minimumConfigured(item) ? Number(item.minimum) > 0 && <small className="inventory-card-min-hint" title="Mínimo de reposición">Mín. {item.minimum}</small> : <small className="inventory-card-min-hint is-pending" title="Define un mínimo de reposición">Mínimo pendiente</small>)}
              {canEdit&&<label className="inventory-card-select"><input type="checkbox" aria-label={`Seleccionar ${item.name}`} checked={selectedIds.has(item.remoteItemId)} onChange={()=>toggleSelected(item.remoteItemId)}/></label>}
            </div>
            <div className="inventory-card-health-meter" role="progressbar" aria-label={`Salud de stock de ${item.name}`}>
              <i className={`is-${inventoryStatusClass(item)}`} style={{ width: `${item.sourceStatus ? 0 : Number(item.quantity) <= 0 ? 5 : Number(item.minimum) > 0 ? Math.min(100, Math.max(12, Math.round((Number(item.availableQuantity ?? Math.max(0, Number(item.quantity || 0) - Number(item.reservedQuantity || 0))) / (Number(item.minimum) * 2)) * 100))) : 100}%` }} />
            </div>
            <div className="inventory-product-facts">
              <span className="is-fact-primary">Conteo físico<strong>{item.sourceStatus ? 'Pendiente' : `${item.quantity} ${item.unit}`}</strong></span>
              {item.customFields?.source_reported_quantity !== undefined && <span className="is-fact-primary">Cantidad en hoja<strong>{item.customFields.source_reported_quantity} {item.unit} · sin confirmar</strong></span>}
              <span className={`is-fact-primary is-available-${inventoryStatusClass(item)}`}>Disponible<strong>{item.sourceStatus || item.availableQuantity === null ? '—' : `${item.availableQuantity} ${item.unit}`}</strong></span>
              <span>Reservado<strong>{item.sourceStatus ? '—' : `${item.reservedQuantity} ${item.unit}`}</strong></span>
              <span>Última entrada<strong>{days(item.lastRestockAt) === null ? 'Sin registro' : `${days(item.lastRestockAt)} días`}</strong></span>
              <span>Uso 30 días<strong>{item.consumedLast30Days === null ? '—' : `${item.consumedLast30Days} ${item.unit}`}</strong></span>
              {canSeeCosts && <span className="is-fact-cost">Costo unitario<strong>{item.unitCost === null ? 'Pendiente' : formatMoney(item.unitCost)}</strong></span>}
            </div>
            <div className="inventory-product-actions">
              {onInspect && <button type="button" className="button button-outline" onClick={() => onInspect(item)} aria-label={`Ver existencias y movimientos de ${item.name}`}><Eye size={14}/> Ver detalle</button>}
              {canEdit && <button type="button" className="inventory-action-primary vc-shimmer-button" onClick={() => onEdit(item)} title={`Abrir ficha de ${item.name}`}><SlidersHorizontal size={14}/> Abrir ficha</button>}
              {canEditCosts && <button type="button" className="is-btn-cost" onClick={() => onCost(item)}><DollarSign size={14}/> Precio</button>}
              {canMove && <><button type="button" className="is-btn-in" onClick={() => onMovement(item,'entrada')}><ArrowDownToLine size={14}/> Entrada</button><button type="button" className="is-btn-out" onClick={() => onMovement(item,'consumo')}><ArrowUpFromLine size={14}/> Salida</button><button type="button" className="is-btn-count" onClick={() => onMovement(item,'ajuste')}><ChartNoAxesCombined size={14}/> Conteo</button></>}
            </div>
          </article>
        </ContextMenu>; })}{!filtered.length && <div className="inventory-empty">No hay artículos con estos filtros. Puedes limpiar los filtros para ver todo el catálogo.</div>}</div> : <div className="inventory-insights-table-wrap"><table className="inventory-insights-table"><thead><tr><th>Artículo / ID</th><th>Tipo · tags</th><th>Área · sucursal</th><th>Abastecimiento</th><th>Stock</th><th>Uso 30 días</th><th>Reserva</th>{canSeeCosts && <th>Costo</th>}<th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((item, index) => { const currentStatus = inventoryState(item); const image = productImage(item); return <tr key={item.id} className="inventory-insights-row"><td data-label="Artículo / ID"><ContextMenu className="inventory-row-context" label={`Acciones para ${item.name}`} actions={inventoryActions(item, index)}><div className="inventory-insights-identity">{image.path ? <><img src={image.path} alt={`Referencia de ${item.name}`} loading="lazy"/>{image.label && <span className="inventory-table-mockup-label">{image.label}</span>}</> : <ImageIcon size={16}/>}<div><b>{item.name}</b><small>{item.sku || item.id}{item.variant ? ` · ${item.variant}` : ''}</small></div></div></ContextMenu></td><td data-label="Tipo y etiquetas">{item.itemType || '—'}<small>{(item.tags || []).join(' · ') || 'Sin tags'}</small></td><td data-label="Área · sucursal">{item.area}<small>{item.branch}</small></td><td data-label="Abastecimiento">{item.lastRestockAt ? formatDate(item.lastRestockAt) : 'Sin registro'}<small>{days(item.lastRestockAt) === null ? '—' : `${days(item.lastRestockAt)} días`}</small></td><td data-label="Stock">{item.sourceStatus ? 'Pendiente de conteo' : <><b>{item.quantity} {item.unit}</b><small>{item.reservedQuantity} reservados · {item.availableQuantity ?? '—'} disponibles · mín. {item.minimum} · {item.location || 'MAIN'}</small></>}</td><td data-label="Uso 30 días">{item.consumedLast30Days === null ? '—' : `${item.consumedLast30Days} ${item.unit}`}<small>{item.lifetimeConsumed === null ? 'Sin historial' : `${item.lifetimeConsumed} histórico`}</small></td><td data-label="Reserva">{item.reservedPercent === null ? '—' : `${item.reservedPercent}%`}<small>{item.reservedQuantity} {item.unit}</small></td>{canSeeCosts && <td data-label="Costo">{item.unitCost === null ? 'Sin registrar' : formatMoney(item.unitCost)}</td>}<td data-label="Estado"><span className={`inventory-status ${inventoryStatusClass(item)}`}>{currentStatus}</span></td><td data-label="Acciones"><div className="inventory-insights-actions">{onInspect&&<button type="button" aria-label={`Ver existencias y movimientos de ${item.name}`} onClick={()=>onInspect(item)} title="Ver detalle"><Eye size={15}/></button>}{canEdit&&<label className="inventory-table-select"><input type="checkbox" aria-label={`Seleccionar ${item.name}`} checked={selectedIds.has(item.remoteItemId)} onChange={()=>toggleSelected(item.remoteItemId)}/></label>}{canEdit && <button type="button" aria-label={"Editar tipo, etiquetas e imagen de " + item.name} onClick={() => onEdit(item)} title="Editar tipo, tags e imagen"><SlidersHorizontal size={15}/></button>}{canReserve && !item.sourceStatus && <button type="button" aria-label={"Administrar reserva de " + item.name} onClick={() => onReserve(item)} title="Administrar reserva">R</button>}{canEditCosts && <button type="button" aria-label={"Editar costo de " + item.name} onClick={() => onCost(item)} title="Editar costo"><DollarSign size={15}/></button>}{canMove && <><button type="button" aria-label={"Registrar entrada de " + item.name} onClick={() => onMovement(item,'entrada')} title="Registrar entrada"><ArrowDownToLine size={15}/></button><button type="button" aria-label={"Registrar consumo de " + item.name} onClick={() => onMovement(item,'consumo')} title="Registrar consumo"><ArrowUpFromLine size={15}/></button><button type="button" aria-label={"Registrar conteo físico de " + item.name} onClick={() => onMovement(item,'ajuste')} title="Conteo físico">C</button></>}{canRequestTransfer && <button type="button" aria-label={"Solicitar traslado de " + item.name} onClick={() => onTransfer(item)} title="Solicitar traslado"><ArrowLeftRight size={15}/></button>}{canEdit && filtered.findIndex((candidate) => candidate.remoteItemId === item.remoteItemId) === index && <button type="button" aria-label={"Duplicar " + item.name + " sin existencias ni movimientos"} onClick={() => onDuplicate(item)} title="Duplicar artículo sin existencias ni movimientos"><Copy size={15}/></button>}{canEdit && <button type="button" aria-label={"Eliminar " + item.name + " del catálogo activo, conserva historial"} onClick={() => onArchive(item)} title="Eliminar del catálogo activo; conserva historial" className="inventory-delete-small"><Trash2 size={13}/>Eliminar</button>}</div></td></tr>; })}{!filtered.length && <tr><td colSpan={canSeeCosts ? 10 : 9}>No hay artículos con estos filtros. Puedes limpiar los filtros para ver todo el catálogo.</td></tr>}</tbody></table></div>}
  </section>
    {imagePreview && <Dialog open onOpenChange={(open)=>{if(!open)setImagePreview(null);}} eyebrow="IMAGEN DE REFERENCIA" title={imagePreview.name} description={`${imagePreview.images?.[imagePreview.index||0]?.label||imagePreview.label} · No confirma marca, variante ni existencias`} size="xl" className="inventory-image-dialog" footer={Boolean(imagePreview.images&&imagePreview.images.length>1)&&<nav className="inventory-image-lightbox-thumbnails" aria-label="Seleccionar imagen">{imagePreview.images!.map((image,index)=><button type="button" key={`${image.path}-${index}`} className={index===imagePreview.index?"is-active":""} aria-label={`Imagen ${index+1}`} aria-pressed={index===imagePreview.index} onClick={()=>setImagePreview(current => current ? ({ ...current, index }) : current)}><img src={image.path} alt=""/></button>)}</nav>}><div className="inventory-image-lightbox-view"><button type="button" aria-label="Imagen anterior" disabled={(imagePreview.index||0)===0} onClick={()=>setImagePreview(current=>current?{...current,index:Math.max(0,(current.index||0)-1)}:current)}><ChevronLeft size={20}/></button><img src={imagePreview.images?.[imagePreview.index||0]?.path||imagePreview.path} alt={`Imagen ${(imagePreview.index||0)+1} de ${imagePreview.name}`}/><button type="button" aria-label="Imagen siguiente" disabled={(imagePreview.index||0)>=(imagePreview.images?.length||1)-1} onClick={()=>setImagePreview(current=>current?{...current,index:Math.min((current.images?.length||1)-1,(current.index||0)+1)}:current)}><ChevronRight size={20}/></button></div></Dialog>}
    {metadataEdit && <InventoryArticleEditor value={metadataEdit} onChange={setMetadataEdit} saving={metadataSaveBusy} onClose={() => { if (!metadataSaveBusy) { setMetadataEdit(null); setLibraryOpen(false); } }} onSave={onSaveMetadata} onDelete={onArchive} onAssignBranch={onAssignBranch} onTransfer={onTransfer} onMovement={onMovement} onCost={onCost} canSeeCosts={canSeeCosts} canEditCosts={canEditCosts} formatMoney={formatMoney} branches={branchOptions} libraryProducts={libraryProducts} libraryCount={referenceLibrary.count} itemTypeOptions={typeSuggestions} tagOptions={tagSuggestions} specificationOptions={specificationOptions} inventoryGroups={inventoryGroups}/>}
    {reservationEdit && <Dialog open onOpenChange={(open)=>{if(!open)setReservationEdit(null);}} eyebrow="CONTROL DE DISPONIBILIDAD" title="Reserva de existencias" description="El POS contará como disponibles solo las unidades no reservadas." size="sm" footer={<><button type="button" className="button button-outline" onClick={()=>setReservationEdit(null)}>Cancelar</button><button className="button button-dark" type="submit" form="inventory-reservation-form">Guardar reserva</button></>}><form id="inventory-reservation-form" onSubmit={onSaveReservation} className="inventory-reservation-form"><label>Unidades reservadas<input data-autofocus type="number" min="0" step="0.001" max={items.find((item) => item.id === reservationEdit.itemId)?.quantity || 0} required value={reservationEdit.quantity} onChange={(event) => setReservationEdit({ ...reservationEdit, quantity: event.target.value })}/></label><label>Motivo / referencia<input value={reservationEdit.note} onChange={(event) => setReservationEdit({ ...reservationEdit, note: event.target.value })} placeholder="Orden, cliente o solicitud"/></label></form></Dialog>}
  </>;
}
