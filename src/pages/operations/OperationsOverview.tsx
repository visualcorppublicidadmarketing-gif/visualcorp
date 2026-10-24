import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NumberTicker } from '../../components/magicui/NumberTicker';
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
  onOpenFlow: (tab: OperationsFlowTab, itemId?: string) => void;
};

const dateTime = (value: string) => {
  if (!value) return 'Fecha pendiente';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Fecha pendiente' : parsed.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
};

export function OperationsOverview({ metrics, items, onOpenFlow }: Props) {
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    if (!normalized) return items;
    return items.filter((item) => `${item.title} ${item.detail} ${item.statusLabel} ${item.action}`.toLocaleLowerCase('es').includes(normalized));
  }, [items, query]);

  return <section className="op-overview" aria-labelledby="op-overview-title">
    <div className="op-overview-heading">
      <div>
        <span className="eyebrow">CENTRO DE OPERACIONES</span>
        <h2 id="op-overview-title">Lo que necesita atención</h2>
        <p>Un resumen de caja, devoluciones, traslados y órdenes activas. Cada elemento conserva sus controles y permisos en su flujo.</p>
      </div>
      <span className="op-overview-live"><i aria-hidden="true"/> Datos recientes disponibles</span>
    </div>

    <div className="op-overview-grid">
      <div className="op-overview-metrics" aria-label="Resumen de flujos operativos">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return <button className={`op-overview-metric ${metric.tone}`} key={metric.tab} type="button" onClick={() => onOpenFlow(metric.tab)}>
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
        {filteredItems.length ? <div className="op-overview-list" role="list">
          {filteredItems.slice(0, 7).map((item) => <button className="op-overview-item" key={`${item.tab}:${item.id}`} type="button" role="listitem" onClick={() => onOpenFlow(item.tab, item.id)}>
            <span className={`op-overview-item-mark ${item.overdue ? 'overdue' : ''}`} aria-hidden="true"/>
            <span className="op-overview-item-copy"><b>{item.title}</b><small>{item.detail} · {dateTime(item.updatedAt)}</small><span className={`op-flow-status status-${item.status}`}>{item.overdue ? 'Atrasada · ' : ''}{item.statusLabel}</span></span>
            <span className="op-overview-item-action">{item.action}<ArrowUpRight size={14}/></span>
          </button>)}
          {filteredItems.length > 7 && <p className="op-overview-more">Mostrando 7 de {filteredItems.length} pendientes recientes.</p>}
        </div> : <div className="op-overview-empty"><b>{query ? 'No encontramos coincidencias.' : 'No hay pendientes en los registros recientes.'}</b><span>{query ? 'Prueba con otro código o nombre.' : 'Los elementos activos aparecerán aquí cuando requieran seguimiento.'}</span></div>}
        <p className="op-overview-footnote">El resumen usa los registros recientes cargados por cada flujo; las acciones se confirman en el servidor.</p>
      </section>
    </div>
  </section>;
}
