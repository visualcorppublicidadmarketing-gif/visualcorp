import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChartNoAxesCombined, Copy, DollarSign, Image as ImageIcon, LayoutGrid, List, MapPin, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import referenceLibrary from '../data/inventory-reference-index.json';
import inventoryImages from '../data/inventory-product-images.json';
import { InventoryArticleEditor } from './InventoryArticleEditor';
import { ContextMenu, type ContextMenuAction } from './ui/ContextMenu';
import { BorderBeam, NumberTicker } from './ui/MagicComponents';
import './InventoryInsights.css';

const referenceProducts = referenceLibrary.products as Array<{ id: string; name: string; tags: string[]; images: Array<{ path: string; label: string; series: string }> }>;
const inventoryImageProducts = inventoryImages.products as Record<string, { name: string; source: string }>;
const viewModes: Array<{ key: 'table' | 'cards' | 'analytics'; Icon: React.ComponentType<{ size?: number }> }> = [
  { key: 'table', Icon: List }, { key: 'cards', Icon: LayoutGrid }, { key: 'analytics', Icon: ChartNoAxesCombined },
];

const modeNames: Record<string, string> = { table: 'Tabla', cards: 'Tarjetas', analytics: 'Métricas' };
const inventoryState = (item) => item.sourceStatus ? 'Sin conteo' : Number(item.quantity) <= 0 ? 'Agotado' : Number(item.quantity) <= Number(item.minimum) ? 'Reponer' : 'En stock';
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
  const assigned = inventoryImageProducts[item.sku];
  const assignedPath = assigned ? `/inventory/${item.sku}.webp` : '';
  const suggested = !item.referenceImageUrl && !assignedPath ? suggestedReference(item) : null;
  const customImage = item.referenceImageUrl && item.referenceImageUrl !== assignedPath;
  const label = customImage ? 'Referencia asignada' : assigned?.source === 'generated' ? 'Referencia generada' : assigned?.source === 'company-sample' ? 'Muestra gráfica' : assigned?.source === 'company-photo' ? 'Foto Visual Corp' : suggested?.label || '';
  return { path: item.referenceImageUrl || assignedPath || suggested?.path || '', label };
};

export function InventoryInsights({ id, hidden, items, canSeeCosts, canEditCosts = false, canEdit, canReserve, canMove, canRequestTransfer, onTransfer, onEdit, onReserve, onMovement, onCost, onArchive, onArchiveMany, onDuplicate, formatDate, formatMoney, metadataEdit, setMetadataEdit, reservationEdit, setReservationEdit, onSaveMetadata, onSaveReservation, branchOptions = [], onAssignBranch, onAssignBranchMany }) {
  const [term, setTerm] = useState('');
  const [area, setArea] = useState('Todas');
  const [branch, setBranch] = useState('Todas');
  const [type, setType] = useState('Todos');
  const [status, setStatus] = useState('Todos');
  const [tag, setTag] = useState('Todos');
  const [mode, setMode] = useState('cards');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTerm, setLibraryTerm] = useState('');
  const [imagePreview, setImagePreview] = useState<{path:string;name:string;label:string}|null>(null);
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
  const confirmArchiveMany=()=>{if(!selectedItems.length||!window.confirm(`¿Quitar ${selectedItems.length} artículo(s) del catálogo activo? Se conservarán movimientos, conteos y el historial. No se borrarán existencias históricas.`))return;onArchiveMany(selectedItems);setSelectedIds(new Set());};
  const assignSelectedBranch=async()=>{if(!selectedItems.length||!bulkBranch||bulkBusy||!onAssignBranchMany)return;setBulkBusy(true);setBulkFeedback('');try{const completed=await onAssignBranchMany(selectedItems,bulkBranch);if(completed){setSelectedIds(new Set());setBulkBranch('');setBulkFeedback('Asignación completada. Los conteos físicos siguen pendientes.');}}catch(error){setBulkFeedback(error instanceof Error?error.message:'No se pudo completar la asignación.');}finally{setBulkBusy(false);}};
  const copySelected=async()=>{if(!selectedItems.length)return;const content=selectedItems.map((item)=>`${item.sku||item.remoteItemId}\t${item.name}${item.variant?`\t${item.variant}`:''}`).join('\n');try{await navigator.clipboard.writeText(content);setBulkFeedback(`${selectedItems.length} artículos copiados.`);}catch{setBulkFeedback('El navegador no permitió copiar la selección.');}};
  const inventoryActions = (item, index: number): ContextMenuAction[] => [
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
  const used = filtered.filter((item) => (item.lifetimeConsumed || 0) > 0).sort((a, b) => b.lifetimeConsumed - a.lifetimeConsumed);
  const physical = filtered.filter((item) => !item.sourceStatus);
  const consumed30 = filtered.reduce((sum, item) => sum + (item.consumedLast30Days || 0), 0);
  const consumedTotal = filtered.reduce((sum, item) => sum + (item.lifetimeConsumed || 0), 0);
  const replenishmentCount = filtered.filter((item) => !item.sourceStatus && Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.minimum)).length;
  const valued = physical.filter((item) => item.unitCost !== null);
  const stockValue = valued.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const days = (date) => date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000)) : null;
  const libraryProducts = referenceProducts.filter((product) => normalized(`${product.name} ${product.tags.join(' ')}`).includes(normalized(libraryTerm)));
  const statusOptions = ['Todos', 'En stock', 'Reponer', 'Agotado', 'Sin conteo'];
  const statusCount = (value) => value === 'Todos' ? items.filter((item) => !item.archived).length : items.filter((item) => !item.archived && inventoryState(item) === value).length;

  return <><section id={id} hidden={hidden} className="panel inventory-insights">
    <header className="inventory-insights-header"><div><span className="eyebrow">FICHA Y MÉTRICAS</span><h3>Catálogo de inventario</h3><p>Busca y filtra artículos por sucursal, área y estado. La etiqueta de cada imagen indica su origen; las referencias no confirman stock físico.</p></div>
      <nav className="inventory-insights-modes" aria-label="Modo de vista">{viewModes.map(({ key, Icon }) => <button type="button" key={key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)} title={`Vista ${modeNames[key]}`} aria-pressed={mode === key}><Icon size={16}/><span>{modeNames[key]}</span></button>)}</nav>
    </header>
    <nav className="inventory-quick-status" aria-label="Filtrar artículos por estado">{statusOptions.map((value) => <button type="button" key={value} className={`${status === value ? 'active' : ''} ${value === 'Reponer' || value === 'Agotado' ? 'attention' : ''}`} onClick={() => setStatus(value)} aria-pressed={status === value}><span>{value}</span><b>{statusCount(value)}</b></button>)}</nav>
    <div className="inventory-insights-filters"><label className="inventory-insights-search"><Search size={15}/><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar nombre, ID o tag"/></label>
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
        <button type="button" className="button button-outline" onClick={copySelected}><Copy size={13}/>Copiar lista</button><button type="button" className="inventory-delete-small" onClick={confirmArchiveMany}><Trash2 size={13}/>Eliminar seleccionados</button><button type="button" className="inventory-bulk-clear" onClick={()=>{setSelectedIds(new Set());setBulkFeedback('');}} aria-label="Limpiar selección"><X size={14}/>Limpiar</button>
        <small>Asignar sucursal solo configura variantes sin sucursal ni saldo físico. Los conteos e historial se conservan.</small>{bulkFeedback&&<span className="inventory-bulk-feedback" role="status">{bulkFeedback}</span>}
      </div>}
    </div>}{mode === 'analytics' ? <div className="inventory-insights-metrics"><article><span>Consumo último mes</span><b><NumberTicker value={consumed30}/></b><small>unidades registradas</small></article><article><span>Uso histórico</span><b><NumberTicker value={consumedTotal}/></b><small>consumo, ventas y merma</small></article><article><span>Sin conteo físico</span><b><NumberTicker value={filtered.filter((item) => item.sourceStatus).length}/></b><small>no se asumen como agotados</small></article><article className={replenishmentCount > 0 ? 'vc-replenishment-alert' : undefined}>{replenishmentCount > 0 && <BorderBeam/>}<span>Reposición recomendada</span><b><NumberTicker value={replenishmentCount}/></b><small>en o debajo del mínimo</small></article>{canSeeCosts && <article><span>Valor parcial de stock contado</span><b>{formatMoney(stockValue)}</b><small>costo registrado en {valued.length} de {physical.length} registros contados</small></article>}<article className="inventory-insights-top"><span><ChartNoAxesCombined size={15}/> Más utilizados</span>{used.slice(0, 8).map((item) => <small key={item.id}><b>{item.name}</b> · {item.lifetimeConsumed} {item.unit}</small>)}{!used.length && <small>Aún no hay historial de consumo.</small>}</article></div> : mode === 'cards' ? <div className="inventory-insights-cards" onPointerMove={trackProductSpotlight} onPointerOut={clearProductSpotlight}>{filtered.map((item, index) => { const image = productImage(item); return <ContextMenu key={item.id} className="inventory-card-context" label={`Acciones para ${item.name}`} actions={inventoryActions(item, index)}>
          <article className="inventory-product-card vc-magic-card">
            <button type="button" className={`inventory-product-image ${image.label ? 'suggested' : ''}`} onClick={() => image.path && setImagePreview({path:image.path,name:item.name,label:image.label||'Imagen de referencia'})} disabled={!image.path} aria-label={image.path?`Ampliar imagen de referencia de ${item.name}`:undefined}>
              {image.path ? <><img src={image.path} alt={`Referencia visual de ${item.name}`} loading="lazy"/>{image.label && <span className="inventory-reference-badge">{image.label}</span>}</> : <ImageIcon size={22}/>}
            </button>
            <div className="inventory-product-main">
              <div><b>{item.name}</b><small>{item.sku || item.id} · {item.branch} · {item.area}</small>{item.variant && <small className="inventory-product-variant">Variante: {item.variant}</small>}</div>
            </div>
            <div className="inventory-product-tags">
              {item.itemType && <em>{item.itemType}</em>}{(item.tags || []).map((value) => <em key={value}>{value}</em>)}
            </div>
            <div className="inventory-product-state">
              <span className={`inventory-status ${item.sourceStatus ? 'pending' : Number(item.quantity) <= Number(item.minimum) ? 'low' : 'ok'}`}>{inventoryState(item)}</span>
              {canEdit&&<label className="inventory-card-select"><input type="checkbox" aria-label={`Seleccionar ${item.name}`} checked={selectedIds.has(item.remoteItemId)} onChange={()=>toggleSelected(item.remoteItemId)}/></label>}
            </div>
            <div className="inventory-product-facts">
              <span>Conteo físico<strong>{item.sourceStatus ? 'Pendiente' : `${item.quantity} ${item.unit}`}</strong></span>
              <span>Disponible<strong>{item.sourceStatus || item.availableQuantity === null ? '—' : `${item.availableQuantity} ${item.unit}`}</strong></span>
              <span>Reservado<strong>{item.sourceStatus ? '—' : `${item.reservedQuantity} ${item.unit}`}</strong></span>
              <span>Última entrada<strong>{days(item.lastRestockAt) === null ? 'Sin registro' : `${days(item.lastRestockAt)} días`}</strong></span>
              <span>Uso 30 días<strong>{item.consumedLast30Days === null ? '—' : `${item.consumedLast30Days} ${item.unit}`}</strong></span>
              {canSeeCosts && <span>Costo unitario<strong>{item.unitCost === null ? 'Pendiente' : formatMoney(item.unitCost)}</strong></span>}
            </div>
            <div className="inventory-product-actions">
              {canEdit && <button type="button" className="inventory-action-primary vc-shimmer-button" onClick={() => onEdit(item)} title={`Abrir ficha de ${item.name}`}><SlidersHorizontal size={14}/> Abrir ficha</button>}
              {canEditCosts && <button type="button" onClick={() => onCost(item)}><DollarSign size={14}/> Precio</button>}
              {canMove && <><button type="button" onClick={() => onMovement(item,'entrada')}><ArrowDownToLine size={14}/> Entrada</button><button type="button" onClick={() => onMovement(item,'consumo')}><ArrowUpFromLine size={14}/> Salida</button><button type="button" onClick={() => onMovement(item,'ajuste')}><ChartNoAxesCombined size={14}/> Conteo</button></>}
            </div>
          </article>
        </ContextMenu>; })}{!filtered.length && <div className="inventory-empty">No hay artículos con estos filtros. Puedes limpiar los filtros para ver todo el catálogo.</div>}</div> : <div className="inventory-insights-table-wrap"><table className="inventory-insights-table"><thead><tr><th>Artículo / ID</th><th>Tipo · tags</th><th>Área · sucursal</th><th>Abastecimiento</th><th>Stock</th><th>Uso 30 días</th><th>Reserva</th>{canSeeCosts && <th>Costo</th>}<th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((item, index) => { const currentStatus = inventoryState(item); const image = productImage(item); return <tr key={item.id}><td><ContextMenu className="inventory-row-context" label={`Acciones para ${item.name}`} actions={inventoryActions(item, index)}><div className="inventory-insights-identity">{image.path ? <><img src={image.path} alt={`Referencia de ${item.name}`} loading="lazy"/>{image.label && <span className="inventory-table-mockup-label">{image.label}</span>}</> : <ImageIcon size={16}/>}<div><b>{item.name}</b><small>{item.sku || item.id}{item.variant ? ` · ${item.variant}` : ''}</small></div></div></ContextMenu></td><td>{item.itemType || '—'}<small>{(item.tags || []).join(' · ') || 'Sin tags'}</small></td><td>{item.area}<small>{item.branch}</small></td><td>{item.lastRestockAt ? formatDate(item.lastRestockAt) : 'Sin registro'}<small>{days(item.lastRestockAt) === null ? '—' : `${days(item.lastRestockAt)} días`}</small></td><td>{item.sourceStatus ? 'Pendiente de conteo' : <><b>{item.quantity} {item.unit}</b><small>{item.reservedQuantity} reservados · {item.availableQuantity ?? '—'} disponibles · mín. {item.minimum} · {item.location || 'MAIN'}</small></>}</td><td>{item.consumedLast30Days === null ? '—' : `${item.consumedLast30Days} ${item.unit}`}<small>{item.lifetimeConsumed === null ? 'Sin historial' : `${item.lifetimeConsumed} histórico`}</small></td><td>{item.reservedPercent === null ? '—' : `${item.reservedPercent}%`}<small>{item.reservedQuantity} {item.unit}</small></td>{canSeeCosts && <td>{item.unitCost === null ? 'Sin registrar' : formatMoney(item.unitCost)}</td>}<td><span className={`inventory-status ${item.sourceStatus ? 'pending' : Number(item.quantity) <= Number(item.minimum) ? 'low' : 'ok'}`}>{currentStatus}</span></td><td><div className="inventory-insights-actions">{canEdit&&<label className="inventory-table-select"><input type="checkbox" aria-label={`Seleccionar ${item.name}`} checked={selectedIds.has(item.remoteItemId)} onChange={()=>toggleSelected(item.remoteItemId)}/></label>}{canEdit && <button type="button" onClick={() => onEdit(item)} title="Editar tipo, tags e imagen"><SlidersHorizontal size={15}/></button>}{canReserve && !item.sourceStatus && <button type="button" onClick={() => onReserve(item)} title="Administrar reserva">R</button>}{canEditCosts && <button type="button" onClick={() => onCost(item)} title="Editar costo"><DollarSign size={15}/></button>}{canMove && <><button type="button" onClick={() => onMovement(item,'entrada')} title="Registrar entrada"><ArrowDownToLine size={15}/></button><button type="button" onClick={() => onMovement(item,'consumo')} title="Registrar consumo"><ArrowUpFromLine size={15}/></button><button type="button" onClick={() => onMovement(item,'ajuste')} title="Conteo físico">C</button></>}{canRequestTransfer && <button type="button" onClick={() => onTransfer(item)} title="Solicitar traslado"><ArrowLeftRight size={15}/></button>}{canEdit && filtered.findIndex((candidate) => candidate.remoteItemId === item.remoteItemId) === index && <button type="button" onClick={() => onDuplicate(item)} title="Duplicar artículo sin existencias ni movimientos"><Copy size={15}/></button>}{canEdit && <button type="button" onClick={() => onArchive(item)} title="Eliminar del catálogo activo; conserva historial" className="inventory-delete-small"><Trash2 size={13}/>Eliminar</button>}</div></td></tr>; })}{!filtered.length && <tr><td colSpan={canSeeCosts ? 10 : 9}>No hay artículos con estos filtros. Puedes limpiar los filtros para ver todo el catálogo.</td></tr>}</tbody></table></div>}
  </section>
    {imagePreview && <div className="inventory-image-lightbox" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setImagePreview(null);}}><section role="dialog" aria-modal="true" aria-label={`Imagen de referencia de ${imagePreview.name}`}><header><div><b>{imagePreview.name}</b><small>{imagePreview.label} · No confirma marca, variante ni existencias</small></div><button type="button" onClick={()=>setImagePreview(null)} aria-label="Cerrar imagen"><X size={18}/></button></header><img src={imagePreview.path} alt={`Referencia ampliada de ${imagePreview.name}`}/></section></div>}\n    {metadataEdit && <InventoryArticleEditor value={metadataEdit} onChange={setMetadataEdit} onClose={() => { setMetadataEdit(null); setLibraryOpen(false); }} onSave={onSaveMetadata} onDelete={onArchive} onAssignBranch={onAssignBranch} onTransfer={onTransfer} branches={branchOptions} libraryProducts={libraryProducts} libraryCount={referenceLibrary.count} itemTypeOptions={types} tagOptions={tags}/>}
    {reservationEdit && <div className="inventory-modal-backdrop"><form className="inventory-modal" onSubmit={onSaveReservation}><h3>Reserva de existencias</h3><p>El POS contará como disponibles solo las unidades no reservadas.</p><label>Unidades reservadas<input autoFocus type="number" min="0" step="0.001" max={items.find((item) => item.id === reservationEdit.itemId)?.quantity || 0} required value={reservationEdit.quantity} onChange={(event) => setReservationEdit({ ...reservationEdit, quantity: event.target.value })}/></label><label>Motivo / referencia<input value={reservationEdit.note} onChange={(event) => setReservationEdit({ ...reservationEdit, note: event.target.value })} placeholder="Orden, cliente o solicitud"/></label><footer><button type="button" className="button button-outline" onClick={() => setReservationEdit(null)}>Cancelar</button><button className="button button-dark" type="submit">Guardar reserva</button></footer></form></div>}
  </>;
}
