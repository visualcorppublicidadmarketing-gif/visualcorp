import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CircleAlert, ClipboardCheck, CircleHelp, Download, ListFilter, PackageCheck, Search } from 'lucide-react';
import { compareInventoryPriority, formatInventoryQuantity, getInventoryBalance, getInventoryPriority, getInventoryStatus, inventoryReplenishmentCsv, inventoryReplenishmentReason, inventoryStatusTone, matchesInventorySearch } from '../lib/inventoryModel';
import type { InventoryEntry, InventoryPriority } from '../lib/inventoryModel';
import './inventory-control.css';

type Filter = 'attention' | 'all' | InventoryPriority;
type Props = { items: InventoryEntry[]; onInspect: (item: InventoryEntry) => void; onCounts: () => void; onAssign: (item: InventoryEntry) => void };
const priorityFilters: Array<{ key: Filter; label: string }> = [
  { key: 'attention', label: 'Requieren revisión' }, { key: 'all', label: 'Todos los registros' },
  { key: 'unavailable', label: 'Sin disponible' }, { key: 'below', label: 'Bajo mínimo' },
  { key: 'minimum', label: 'En el mínimo' }, { key: 'minimum_unconfigured', label: 'Mínimo pendiente' }, { key: 'unverified', label: 'Por verificar' }, { key: 'healthy', label: 'Sobre el mínimo' },
];

export function InventoryReplenishment({ items, onInspect, onCounts, onAssign }: Props) {
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('');
  const [area, setArea] = useState('');
  const [filter, setFilter] = useState<Filter>('attention');
  const [limit, setLimit] = useState(30);
  const activeItems = useMemo(() => items.filter(item => !item.archived), [items]);
  const branches = useMemo(() => [...new Set(activeItems.map(item => item.branch).filter(Boolean))].sort(), [activeItems]);
  const areas = useMemo(() => [...new Set(activeItems.map(item => item.area).filter(Boolean))].sort(), [activeItems]);
  const scoped = useMemo(() => activeItems.filter(item => (!branch || item.branch === branch) && (!area || item.area === area) && matchesInventorySearch(item, query)), [activeItems, branch, area, query]);
  const totals = useMemo(() => {
    const counts: Record<InventoryPriority, number> = { unavailable: 0, below: 0, minimum: 0, minimum_unconfigured: 0, unverified: 0, healthy: 0 };
    for (const item of scoped) counts[getInventoryPriority(item)]++;
    return counts;
  }, [scoped]);
  const filtered = useMemo(() => scoped.filter(item => filter === 'all' || (filter === 'attention' ? getInventoryPriority(item) !== 'healthy' : getInventoryPriority(item) === filter)).sort(compareInventoryPriority), [scoped, filter]);
  const reset = () => { setQuery(''); setBranch(''); setArea(''); setFilter('attention'); setLimit(30); };
  const chooseFilter = (next: Filter) => { setFilter(next); setLimit(30); };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([inventoryReplenishmentCsv(filtered)], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `inventario-reposicion-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="panel inventory-control" aria-labelledby="inventory-control-title">
    <header className="inventory-control-heading"><div><span className="eyebrow">DECIDIR CON EXISTENCIAS REALES</span><h3 id="inventory-control-title">Control de reposición</h3><p>Revisa el disponible después de reservas y compáralo con el mínimo de la ficha.</p></div><button type="button" className="button button-outline" onClick={exportCsv} disabled={!filtered.length}><Download size={16}/>Exportar lista ({filtered.length})</button></header>
    <div className="inventory-control-summary" aria-label="Prioridades del alcance filtrado">
      {([{ key: 'unavailable', label: 'Sin disponible', icon: CircleAlert }, { key: 'below', label: 'Bajo mínimo', icon: ListFilter }, { key: 'minimum', label: 'En el mínimo', icon: PackageCheck }, { key: 'minimum_unconfigured', label: 'Mínimo pendiente', icon: CircleHelp }, { key: 'unverified', label: 'Por verificar', icon: ClipboardCheck }] as const).map(({ key, label, icon: Icon }) => <button key={key} type="button" className={filter === key ? 'selected' : ''} aria-pressed={filter === key} onClick={() => chooseFilter(filter === key ? 'attention' : key)}><Icon size={18}/><span>{label}<strong>{totals[key]}</strong></span></button>)}
    </div>
    <div className="inventory-control-filters"><label className="inventory-control-search"><Search size={16}/><input aria-label="Buscar en reposición" value={query} onChange={event => { setQuery(event.target.value); setLimit(30); }} placeholder="Artículo, SKU, variante o ubicación"/></label><label><span>Sucursal</span><select value={branch} onChange={event => { setBranch(event.target.value); setLimit(30); }}><option value="">Todas las sucursales</option>{branches.map(value => <option key={value}>{value}</option>)}</select></label><label><span>Área</span><select value={area} onChange={event => { setArea(event.target.value); setLimit(30); }}><option value="">Todas las áreas</option>{areas.map(value => <option key={value}>{value}</option>)}</select></label><label><span>Prioridad</span><select value={filter} onChange={event => chooseFilter(event.target.value as Filter)}>{priorityFilters.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label></div>
    <div className="inventory-control-caption"><span role="status">{filtered.length} de {scoped.length} registros en este alcance</span><button type="button" onClick={reset}>Limpiar filtros</button></div>
    {totals.unverified > 0 && <div className="inventory-control-notice"><ClipboardCheck size={18}/><div><b>{totals.unverified} registros necesitan verificación</b><p>Las cantidades sin conteo o sin disponibilidad confirmada no generan cantidades de reposición.</p></div><button type="button" className="button button-outline" onClick={onCounts}>Revisar conteos <ArrowUpRight size={14}/></button></div>}
    {totals.minimum_unconfigured > 0 && <div className="inventory-control-minimum-notice"><CircleHelp size={18}/><div><b>{totals.minimum_unconfigured} registros aún no tienen una decisión de mínimo</b><p>Esto no significa que estén agotados. Abre cada ficha para definir un umbral o confirmar que no necesita alerta.</p></div></div>}
    <div className="inventory-replenishment-list">
      {filtered.slice(0, limit).map(item => {
        const balance = getInventoryBalance(item);
        return <article key={item.id} className={`inventory-replenishment-row is-${getInventoryPriority(item)}`}>
          <div className="inventory-replenishment-identity"><span className={`inventory-status ${inventoryStatusTone(item)}`}>{getInventoryStatus(item)}</span><button type="button" onClick={() => onInspect(item)}>{item.name}<ArrowUpRight size={15}/></button><small>{item.variant || 'Variante base'} · {item.variantSku || item.sku || 'Sin SKU'}</small><small>{item.branch} · {item.area} · {item.location || 'Sin ubicación'}</small></div>
          <dl className="inventory-replenishment-quantities"><div><dt>Físico</dt><dd>{formatInventoryQuantity(balance.physical, item.unit)}</dd></div><div><dt>Reservado</dt><dd>{formatInventoryQuantity(balance.reserved, item.unit)}</dd></div><div className="is-available"><dt>Disponible</dt><dd>{formatInventoryQuantity(balance.available, item.unit)}</dd></div><div><dt>Mínimo de ficha</dt><dd>{formatInventoryQuantity(balance.minimum, item.unit)}</dd></div></dl>
          <div className="inventory-replenishment-decision"><div><span>Falta para llegar al mínimo</span><b>{balance.toMinimum === null ? 'Pendiente de verificar' : formatInventoryQuantity(balance.toMinimum, item.unit)}</b><p>{inventoryReplenishmentReason(item)}</p></div><button className="button button-outline" type="button" onClick={() => item.branchId ? onInspect(item) : onAssign(item)}>{item.branchId ? 'Ver detalle' : 'Asignar sucursal'}<ArrowUpRight size={14}/></button></div>
        </article>;
      })}
      {!filtered.length && <div className="inventory-control-empty"><PackageCheck size={28}/><h4>{activeItems.length ? 'Sin registros para esta selección' : 'Aún no hay artículos activos'}</h4><p>{activeItems.length ? 'Puedes ampliar el alcance o mostrar todos los registros.' : 'Añade artículos y confirma sus cantidades físicas para iniciar el control.'}</p>{activeItems.length > 0 && <button type="button" className="button button-outline" onClick={reset}>Restablecer vista</button>}</div>}
    </div>
    {filtered.length > limit && <button type="button" className="button button-outline inventory-control-more" onClick={() => setLimit(current => current + 30)}>Mostrar 30 más · {Math.min(limit, filtered.length)} de {filtered.length}</button>}
    <p className="inventory-control-footnote">El mínimo pertenece a la ficha del artículo y se usa aquí como referencia para cada saldo; confirma su alcance antes de definir una compra. Cada registro conserva su unidad, sucursal y ubicación. La exportación incluye todos los resultados filtrados.</p>
  </section>;
}
