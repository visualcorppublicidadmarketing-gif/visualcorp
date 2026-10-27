import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NumberTicker } from '../../components/magicui/NumberTicker';
import { SpotlightLayer, clearSpotlight, updateSpotlight } from '../../components/ui/MagicComponents';
import './operations-overview.css';

export type OperationsFlowTab = 'cash' | 'returns' | 'transfers' | 'production' | 'quotes';
export type OperationsQueueTab = OperationsFlowTab | 'purchases';

export type OperationsQueueItem = {
  id: string;
  tab: OperationsQueueTab;
  title: string;
  detail: string;
  action: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  severity: number;
  overdue?: boolean;
  dueAt?: string;
  branchId?: string;
  branchIndependent?: boolean;
};

export type OperationsMetric = {
  tab: OperationsQueueTab;
  label: string;
  description: string;
  zeroDescription: string;
  value: number | null;
  icon: LucideIcon;
  tone: 'violet' | 'amber' | 'blue' | 'teal' | 'green';
};

type Props = {
  metrics: OperationsMetric[];
  items: OperationsQueueItem[];
  branches: { id: string; name: string }[];
  hasData: boolean;
  onOpenFlow: (tab: OperationsQueueTab, itemId?: string) => void;
  onRetry: () => void;
};

const parseDate = (value: string) => {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)
    : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const dateTime = (value: string) => {
  if (!value) return 'Fecha pendiente';
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : 'Fecha pendiente';
};

const dateLabel = (value: string) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString('es-EC', { dateStyle: 'medium' }) : 'Fecha pendiente';
};

const isToday = (value?: string) => {
  const parsed = value ? parseDate(value) : null;
  return Boolean(parsed && parsed.toDateString() === new Date().toDateString());
};

const isOverdue = (item: OperationsQueueItem) => {
  if (item.overdue) return true;
  const dueAt = item.dueAt ? parseDate(item.dueAt) : null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Boolean(dueAt && dueAt.getTime() < startOfToday.getTime());
};

export function OperationsOverview({ metrics, items, branches, hasData, onOpenFlow, onRetry }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue' | 'blocked'>('all');
  const [branchId, setBranchId] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filteredItems = useMemo(() => {
    const terms = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (branchId && item.branchId !== branchId && !item.branchIndependent) return false;
      if (filter === 'today' && !isToday(item.dueAt)) return false;
      if (filter === 'overdue' && !isOverdue(item)) return false;
      if (filter === 'blocked' && item.status !== 'blocked') return false;
      const haystack = `${item.title} ${item.detail} ${item.statusLabel} ${item.action}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, query, filter, branchId]);
  const counts = useMemo(() => {
    const scoped = branchId ? items.filter((item) => item.branchId === branchId || item.branchIndependent) : items;
    return {
      all: scoped.length,
      today: scoped.filter((item) => isToday(item.dueAt)).length,
      overdue: scoped.filter(isOverdue).length,
      blocked: scoped.filter((item) => item.status === 'blocked').length,
    };
  }, [items, branchId]);
  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, 10);

  return <section className="op-overview" aria-labelledby="op-overview-title">
    <div className="op-overview-heading">
      <div>
        <span className="eyebrow">CENTRO DE OPERACIONES</span>
        <h2 id="op-overview-title">Lo que necesita atención</h2>
        <p>Prioriza caja, devoluciones, compras, traslados y producción según fecha, atraso o bloqueo. Cada acción conserva sus permisos.</p>
      </div>
      <span className="op-overview-live"><i aria-hidden="true"/> Vista general de flujos</span>
    </div>

    {!hasData ? <div className="op-overview-unavailable" role="status">
      <div><b>Resumen temporalmente no disponible</b><span>No se pudieron confirmar los datos de los flujos. Actualiza para volver a intentarlo.</span></div>
      <button type="button" onClick={onRetry}>Reintentar carga</button>
    </div> : <div className="op-overview-grid">
      <div className="op-overview-metrics" role="group" aria-label="Resumen de flujos operativos">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const description = metric.value === null ? 'Conteo no confirmado por ahora' : metric.value === 0 ? metric.zeroDescription : metric.description;
          const clear = metric.value === 0;
          const valueLabel = metric.value === null ? 'sin conteo confirmado' : metric.value.toLocaleString('es-EC');
          return <button className={`op-overview-metric ${metric.tone}${clear ? ' is-clear' : ''} vc-magic-card`} key={metric.tab} type="button" aria-label={`${metric.label}: ${valueLabel}, ${description}. Abrir.`} onClick={() => onOpenFlow(metric.tab)} onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
            <SpotlightLayer/>
            <span className="op-overview-metric-icon"><Icon size={17}/></span>
            <span className="op-overview-metric-copy"><span>{metric.label}</span><b>{metric.value === null ? '—' : <NumberTicker value={metric.value}/>}</b><small>{description}</small></span>
            <ArrowUpRight className="op-overview-metric-arrow" size={15}/>
          </button>;
        })}
      </div>

      <section className="op-overview-queue panel" aria-labelledby="op-overview-queue-title">
        <div className="op-overview-queue-heading">
          <div><span className="eyebrow">BANDEJA OPERATIVA</span><h3 id="op-overview-queue-title">Pendientes recientes</h3></div>
          <span className="op-overview-count" aria-label={`${filteredItems.length} pendientes recientes coinciden con los filtros actuales`}>{filteredItems.length}</span>
        </div>
        <label className="op-overview-search"><Search size={16}/><span className="sr-only">Buscar en pendientes recientes</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} placeholder="Buscar orden, proveedor, venta o traslado"/></label>
        <div className="op-overview-controls"><div className="op-overview-filters" role="group" aria-label="Filtrar pendientes"><button type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setShowAll(false); }}>Todos <b>{counts.all}</b></button><button type="button" aria-pressed={filter === 'today'} onClick={() => { setFilter('today'); setShowAll(false); }}>Hoy <b>{counts.today}</b></button><button type="button" aria-pressed={filter === 'overdue'} onClick={() => { setFilter('overdue'); setShowAll(false); }}>Atrasados <b>{counts.overdue}</b></button><button type="button" aria-pressed={filter === 'blocked'} onClick={() => { setFilter('blocked'); setShowAll(false); }}>Bloqueados <b>{counts.blocked}</b></button></div><label className="op-overview-branch"><span className="sr-only">Filtrar por sucursal</span><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setShowAll(false); }}><option value="">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
        {visibleItems.length ? <ul id="op-overview-list" className="op-overview-list" aria-label="Pendientes operativos">
          {visibleItems.map((item) => {
            const overdue = isOverdue(item);
            return <li key={`${item.tab}:${item.id}`}>
              <button className="op-overview-item" type="button" onClick={() => onOpenFlow(item.tab, item.id)}>
                <span className={`op-overview-item-mark ${overdue ? 'overdue' : ''}`} aria-hidden="true"/>
                <span className="op-overview-item-copy">
                  <b>{item.title}</b>
                  <small className="op-overview-item-detail">{item.detail}</small>
                  <span className="op-overview-item-meta">
                    <span className={`op-flow-status status-${overdue ? 'overdue' : item.status}`}>{overdue ? 'Atrasada · ' : ''}{item.statusLabel}</span>
                    <small>{item.dueAt ? `Vence ${dateLabel(item.dueAt)} · ` : ''}Actualizada {dateTime(item.updatedAt)}</small>
                  </span>
                </span>
                <span className="op-overview-item-action">{item.action}<ArrowUpRight size={14}/></span>
                <span className="op-overview-item-mobile-arrow" aria-hidden="true"><ArrowUpRight size={15}/></span>
              </button>
            </li>;
          })}
          {filteredItems.length > 10 && <li><button type="button" className="op-overview-more" aria-controls="op-overview-list" aria-expanded={showAll} onClick={() => setShowAll((current) => !current)}>{showAll ? 'Mostrar solo los primeros 10' : `Mostrar ${filteredItems.length - 10} pendientes recientes más`}</button></li>}
        </ul> : <div className="op-overview-empty"><b>{query ? 'No encontramos coincidencias.' : 'No hay pendientes para este filtro.'}</b><span>{query ? 'Prueba con otro código o nombre.' : 'Cambia el estado o la sucursal para revisar otros pendientes.'}</span></div>}
        <p className="op-overview-footnote">Cuando el conteo está disponible, las tarjetas muestran el total exacto del servidor. La bandeja y sus filtros presentan los registros recientes cargados por cada flujo; las acciones se confirman en el servidor.</p>
      </section>
    </div>}
  </section>;
}
