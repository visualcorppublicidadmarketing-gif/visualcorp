import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NumberTicker } from '../../components/magicui/NumberTicker';
import { SpotlightLayer, clearSpotlight, updateSpotlight } from '../../components/ui/MagicComponents';
import './operations-overview.css';

export type OperationsFlowTab = 'cash' | 'returns' | 'transfers' | 'production' | 'quotes';

export type OperationsQueueItem = {
  id: string;
  tab: OperationsFlowTab;
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
};

export type OperationsMetric = {
  tab: OperationsFlowTab;
  label: string;
  description: string;
  value: number;
  icon: LucideIcon;
  tone: 'violet' | 'amber' | 'blue' | 'teal' | 'green';
};

type Props = {
  metrics: OperationsMetric[];
  items: OperationsQueueItem[];
  branches: { id: string; name: string }[];
  onOpenFlow: (tab: OperationsFlowTab, itemId?: string) => void;
};

const dateTime = (value: string) => {
  if (!value) return 'Fecha pendiente';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Fecha pendiente' : parsed.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
};

const isToday = (value?: string) => Boolean(value && new Date(value).toDateString() === new Date().toDateString());
const isOverdue = (item: OperationsQueueItem) => Boolean(item.overdue || (item.dueAt && new Date(item.dueAt).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime()));

export function OperationsOverview({ metrics, items, branches, onOpenFlow }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue' | 'blocked'>('all');
  const [branchId, setBranchId] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filteredItems = useMemo(() => {
    const terms = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (branchId && item.branchId !== branchId) return false;
      if (filter === 'today' && !isToday(item.dueAt)) return false;
      if (filter === 'overdue' && !isOverdue(item)) return false;
      if (filter === 'blocked' && item.status !== 'blocked') return false;
      const haystack = `${item.title} ${item.detail} ${item.statusLabel} ${item.action}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, query, filter, branchId]);
  const counts = useMemo(() => {
    const scoped = branchId ? items.filter((item) => item.branchId === branchId) : items;
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
        <p>Prioriza caja, devoluciones, traslados y órdenes según atraso, fecha o bloqueo. Cada acción conserva sus permisos.</p>
      </div>
      <span className="op-overview-live"><i aria-hidden="true"/> Datos recientes disponibles</span>
    </div>

    <div className="op-overview-grid">
      <div className="op-overview-metrics" aria-label="Resumen de flujos operativos">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return <button className={`op-overview-metric ${metric.tone} vc-magic-card`} key={metric.tab} type="button" onClick={() => onOpenFlow(metric.tab)} onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
            <SpotlightLayer/>
            <span className="op-overview-metric-icon"><Icon size={17}/></span>
            <span className="op-overview-metric-copy"><span>{metric.label}</span><b><NumberTicker value={metric.value}/></b><small>{metric.description}</small></span>
            <ArrowUpRight className="op-overview-metric-arrow" size={15}/>
          </button>;
        })}
      </div>

      <section className="op-overview-queue panel" aria-labelledby="op-overview-queue-title">
        <div className="op-overview-queue-heading">
          <div><span className="eyebrow">BANDEJA OPERATIVA</span><h3 id="op-overview-queue-title">Pendientes recientes</h3></div>
          <span className="op-overview-count">{filteredItems.length}</span>
        </div>
        <label className="op-overview-search"><Search size={16}/><span className="sr-only">Buscar en pendientes recientes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar orden, venta o traslado"/></label>
        <div className="op-overview-controls"><div className="op-overview-filters" role="group" aria-label="Filtrar pendientes"><button type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setShowAll(false); }}>Todos <b>{counts.all}</b></button><button type="button" aria-pressed={filter === 'today'} onClick={() => { setFilter('today'); setShowAll(false); }}>Hoy <b>{counts.today}</b></button><button type="button" aria-pressed={filter === 'overdue'} onClick={() => { setFilter('overdue'); setShowAll(false); }}>Atrasados <b>{counts.overdue}</b></button><button type="button" aria-pressed={filter === 'blocked'} onClick={() => { setFilter('blocked'); setShowAll(false); }}>Bloqueados <b>{counts.blocked}</b></button></div><label className="op-overview-branch"><span className="sr-only">Filtrar por sucursal</span><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setShowAll(false); }}><option value="">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
        {visibleItems.length ? <div className="op-overview-list" role="list">
          {visibleItems.map((item) => <button className="op-overview-item" key={`${item.tab}:${item.id}`} type="button" role="listitem" onClick={() => onOpenFlow(item.tab, item.id)}>
            <span className={`op-overview-item-mark ${isOverdue(item) ? 'overdue' : ''}`} aria-hidden="true"/>
            <span className="op-overview-item-copy"><b>{item.title}</b><small>{item.detail} · Actualizada {dateTime(item.updatedAt)}{item.dueAt ? ` · Vence ${dateTime(item.dueAt)}` : ''}</small><span className={`op-flow-status status-${isOverdue(item) ? 'overdue' : item.status}`}>{isOverdue(item) ? 'Atrasada · ' : ''}{item.statusLabel}</span></span>
            <span className="op-overview-item-action">{item.action}<ArrowUpRight size={14}/></span>
          </button>)}
          {filteredItems.length > visibleItems.length && <button type="button" className="op-overview-more" onClick={() => setShowAll(true)}>Mostrar los {filteredItems.length - visibleItems.length} pendientes restantes</button>}
        </div> : <div className="op-overview-empty"><b>{query ? 'No encontramos coincidencias.' : 'No hay pendientes para este filtro.'}</b><span>{query ? 'Prueba con otro código o nombre.' : 'Cambia el estado o la sucursal para revisar otros pendientes.'}</span></div>}
        <p className="op-overview-footnote">El resumen usa los registros recientes cargados por cada flujo; las acciones se confirman en el servidor.</p>
      </section>
    </div>
  </section>;
}
