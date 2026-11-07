import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Check, FileText, MessageCircle, Search, TrendingUp, Users } from 'lucide-react';
import { AppFrame, PageHeading, StatCard } from '../../app/layout';
import { formatDate, formatMoney, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { EmptyState, StageBadge } from '../../components/feedback';
import { useAlert } from '../../components/ui/OperationalKit';

function QuoteRequestDetails({ quote }: { quote: any }) {
  const mode = quote.calculationMode;
  const production =
    mode === 'area'
      ? `${quote.width} × ${quote.height} ${quote.measurementUnit} · ${Number(quote.area || 0).toFixed(2)} m² por pieza`
      : mode === 'units'
        ? 'Por unidades'
        : 'Medidas por definir';
  const preview = quote.pricePreview;
  const priceLabel = (value: number | null | undefined) => (value == null ? 'pendiente' : formatMoney(value));
  return (
    <details className="crm-quote-details">
      <summary>Ver especificaciones</summary>
      <span>
        {quote.project || 'Proyecto por definir'} · {production}
        {quote.quantity ? ` · ${quote.quantity} ${quote.quantity === 1 ? 'pieza' : 'piezas'}` : ''}
      </span>
      {quote.productName && <span>Producto: {quote.productName}</span>}
      {preview && (
        <span>
          Estimados pendientes de validar — Normal: {priceLabel(preview.normal)} · Instalación: {priceLabel(preview.installation)} ·
          Corporativo: {priceLabel(preview.corporate)}
        </span>
      )}
      {quote.designSupport && <span>Diseño: {quote.designSupport}</span>}
      {quote.installation && <span>Consulta instalación</span>}
      {quote.finishing && <span>Acabados: {quote.finishing}</span>}
    </details>
  );
}

function buildLeadWhatsApp(phone?: string, name?: string, service?: string): string | null {
  const digits = String(phone || '').replace(/\D+/g, '');
  if (digits.length < 8) return null;
  const normalized = digits.startsWith('593')
    ? digits
    : digits.startsWith('0')
      ? `593${digits.slice(1)}`
      : digits.length === 9
        ? `593${digits}`
        : digits;
  const text = encodeURIComponent(
    `Hola ${name || ''}, te escribimos de Visual Corp respecto a tu solicitud${service ? ` de ${service}` : ''}.`,
  );
  return `https://wa.me/${normalized}?text=${text}`;
}

export interface LeadsTableProps {
  collection?: string;
  remoteItems?: any[];
  onStatusChange?: (item: any, nextStage: string) => void;
  onConvertToCustomer?: (item: any) => void;
}

export function LeadsTable({ collection = 'leads', remoteItems, onStatusChange, onConvertToCustomer }: LeadsTableProps) {
  const { data, update } = useWorkspace();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('crm', 'edit');
  const items = remoteItems ?? data[collection];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin registros en este filtro"
        text="Las solicitudes creadas desde la web o el cotizador público aparecerán aquí."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Contacto</th>
            <th>Interés y detalle</th>
            <th>Origen</th>
            <th>Recibido</th>
            <th>Etapa</th>
            <th>Ficha y Acción</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const waHref = buildLeadWhatsApp(item.phone, item.name, item.service);
            return (
              <tr key={item.id}>
                <td>
                  <b>{item.name}</b>
                  {item.company && <small>{item.company}</small>}
                  {item.phone && <small>Tel. {item.phone}</small>}
                  {item.email && <small>{item.email}</small>}
                </td>
                <td>
                  <b>{item.service || item.details || 'Consulta general'}</b>
                  {item.details && item.service && (
                    <details className="crm-quote-details">
                      <summary>Ver mensaje</summary>
                      <span>{item.details}</span>
                    </details>
                  )}
                  {item.quoteData && <QuoteRequestDetails quote={item.quoteData} />}
                </td>
                <td>{item.source || 'Sitio web'}</td>
                <td>{formatDate(item.createdAt)}</td>
                <td>
                  {canEdit ? (
                    <select
                      className="stage-select"
                      value={item.stage}
                      onChange={(e) =>
                        onStatusChange ? onStatusChange(item, e.target.value) : update(collection, item.id, { stage: e.target.value })
                      }
                    >
                      <option>Nuevo</option>
                      <option>Contactado</option>
                      <option>Cotizando</option>
                      <option>Ganado</option>
                      <option>Perdido</option>
                      <option>Cerrado</option>
                    </select>
                  ) : (
                    <StageBadge stage={item.stage} />
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {item.customerId ? (
                      <Link className="inventory-status ok" to={`/operaciones/clientes?cliente=${encodeURIComponent(item.customerId)}`}>
                        Ver ficha 360° →
                      </Link>
                    ) : item.stage === 'Ganado' && canEdit && onConvertToCustomer ? (
                      <button
                        className="button button-outline crm-convert-button"
                        type="button"
                        onClick={() => onConvertToCustomer(item)}
                      >
                        Crear ficha
                      </button>
                    ) : (
                      <span className="muted-count">—</span>
                    )}
                    {waHref && (
                      <a
                        className="button button-outline"
                        style={{ minHeight: '28px', padding: '0 8px', fontSize: '10px' }}
                        href={waHref}
                        target="_blank"
                        rel="noreferrer"
                        title="Contactar por WhatsApp"
                      >
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LeadsPage({ area = 'admin' }: { area?: 'admin' | 'operations' }) {
  const { data } = useWorkspace();
  const { user, hasPermission } = useAuth();
  const alert = useAlert();
  const canViewCRM = hasPermission('crm', 'view');
  const [remoteLeads, setRemoteLeads] = useState<any[] | null>(null);
  const [leadQuery, setLeadQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  useEffect(() => {
    if (!supabase || !user || !canViewCRM) return;
    let active = true;
    supabase
      .from('public_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data: rows, error }) => {
        if (!active) return;
        if (error) {
          window.console.error(error);
          return;
        }
        const stages: Record<string, string> = {
          new: 'Nuevo',
          contacted: 'Contactado',
          quoted: 'Cotizando',
          won: 'Ganado',
          lost: 'Perdido',
          closed: 'Cerrado',
        };
        setRemoteLeads(
          (rows || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            company: row.company || row.quote_data?.request?.company || '',
            phone: row.phone,
            email: row.email,
            service: row.service,
            details: row.message,
            quoteData: row.quote_data?.request || null,
            source: row.request_type === 'quote' ? 'Cotizador público' : 'Sitio web',
            createdAt: row.created_at,
            stage: stages[row.status] || 'Nuevo',
            remoteStatus: row.status,
            customerId: row.customer_id,
          })),
        );
      });
    return () => {
      active = false;
    };
  }, [user, canViewCRM]);

  const leads = remoteLeads ?? data.leads;

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    return leads.filter((item: any) => {
      if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
      if (!q) return true;
      return `${item.name || ''} ${item.company || ''} ${item.phone || ''} ${item.email || ''} ${item.service || ''} ${
        item.details || ''
      }`
        .toLowerCase()
        .includes(q);
    });
  }, [leads, leadQuery, stageFilter]);

  const conversionRate = useMemo(() => {
    if (!leads.length) return 0;
    const wonCount = leads.filter((item: any) => item.stage === 'Ganado' || Boolean(item.customerId)).length;
    return Math.round((wonCount / leads.length) * 100);
  }, [leads]);

  const updateRemote = async (item: any, next: string) => {
    if (!hasPermission('crm', 'edit') || !supabase) return;
    const map: Record<string, string> = {
      Nuevo: 'new',
      Contactado: 'contacted',
      Cotizando: 'quoted',
      Ganado: 'won',
      Perdido: 'lost',
      Cerrado: 'closed',
    };
    const { error } = await supabase
      .from('public_requests')
      .update({ status: map[next], updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) {
      await alert({ eyebrow: 'SOLICITUDES Y CRM', title: 'No se guardó la etapa', description: error.message, tone: 'danger' });
      return;
    }
    setRemoteLeads((current) =>
      current ? current.map((row) => (row.id === item.id ? { ...row, stage: next, remoteStatus: map[next] } : row)) : current,
    );
  };

  const convertLead = async (item: any) => {
    if (!hasPermission('crm', 'edit') || !supabase) return;
    const { data: customerId, error } = await supabase.rpc('convert_visualcorp_request_to_customer', { p_request_id: item.id });
    if (error) {
      await alert({ eyebrow: 'SOLICITUDES Y CRM', title: 'No se creó la ficha', description: error.message, tone: 'danger' });
      return;
    }
    setRemoteLeads((current) =>
      current ? current.map((row) => (row.id === item.id ? { ...row, customerId, stage: 'Ganado', remoteStatus: 'won' } : row)) : current,
    );
  };

  return (
    <AppFrame area={area}>
      <PageHeading
        eyebrow="GESTIÓN DE CLIENTES · EMBUDO COMERCIAL"
        title="Solicitudes y Prospectos CRM"
        description="Da seguimiento a las solicitudes web, filtra por etapa comercial y convierte las oportunidades ganadas en fichas 360° de cliente."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Link className="button button-outline" to="/operaciones/clientes">
              <Users size={15} /> Directorio de Clientes 360°
            </Link>
            <span className="local-badge">
              <span className="status-dot" /> {remoteLeads ? 'Base compartida' : 'Cargando solicitudes'}
            </span>
          </div>
        }
      />

      <div className="stat-grid compact-stats">
        <StatCard
          label="Nuevos"
          value={leads.filter((item: any) => item.stage === 'Nuevo').length}
          icon={Users}
          note="Por revisar y contactar"
          tone="violet"
        />
        <StatCard
          label="En gestión"
          value={leads.filter((item: any) => item.stage === 'Contactado' || item.stage === 'Cotizando').length}
          icon={FileText}
          note="Contactados o cotizando"
          tone="blue"
        />
        <StatCard
          label="Ganados"
          value={leads.filter((item: any) => item.stage === 'Ganado').length}
          icon={BadgeCheck}
          note="Oportunidades calificadas"
          tone="amber"
        />
        <StatCard
          label="Tasa de conversión"
          value={`${conversionRate}%`}
          icon={TrendingUp}
          note="Solicitudes ganadas / total"
          tone="rose"
        />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">EMBUDO COMERCIAL</span>
            <h2>Contactos y Solicitudes Recientes</h2>
          </div>
          <span className="muted-count">
            {filteredLeads.length} de {leads.length} registros
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
            marginBottom: '12px',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flex: '1 1 240px',
              minHeight: '38px',
              padding: '0 11px',
              border: '1px solid var(--vc-line, #e0dfe8)',
              borderRadius: '10px',
            }}
          >
            <Search size={15} />
            <input
              type="search"
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              placeholder="Buscar prospecto por nombre, empresa, teléfono o servicio…"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: 0,
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                fontSize: '12px',
              }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'Nuevo', 'Contactado', 'Cotizando', 'Ganado', 'Perdido'].map((st) => (
              <button
                key={st}
                type="button"
                className={`button button-outline ${stageFilter === st ? 'active' : ''}`}
                style={{ minHeight: '32px', padding: '0 10px', fontSize: '10.5px' }}
                onClick={() => setStageFilter(st)}
              >
                {st === 'all' ? 'Todas las etapas' : st}
              </button>
            ))}
          </div>
        </div>

        <LeadsTable
          remoteItems={filteredLeads}
          onStatusChange={remoteLeads ? updateRemote : undefined}
          onConvertToCustomer={remoteLeads ? convertLead : undefined}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">COTIZACIONES</span>
            <h2>Seguimiento de propuestas</h2>
          </div>
          <Link className="text-link" to="/operaciones/cotizador">
            Abrir cotizador <ArrowUpRight size={14} />
          </Link>
        </div>
        <QuoteTable />
      </section>
    </AppFrame>
  );
}

export function QuoteTable({ editable }: { editable?: boolean }) {
  const { data, update } = useWorkspace();
  const { hasPermission } = useAuth();
  const canEdit = editable ?? hasPermission('quotes', 'edit');
  if (!data.quotes.length)
    return <EmptyState icon={FileText} title="Sin cotizaciones" text="El equipo puede crear una propuesta desde Operaciones → Cotizador." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Referencia</th>
            <th>Cliente</th>
            <th>Concepto</th>
            <th>Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {data.quotes.map((quote: any) => (
            <tr key={quote.id}>
              <td>
                <b>{quote.code}</b>
                <small>{formatDate(quote.createdAt)}</small>
              </td>
              <td>{quote.customer || 'Sin cliente'}</td>
              <td>
                {quote.itemName} · {quote.quantity} {quote.unit}
              </td>
              <td>{quote.total === null ? 'Por confirmar' : formatMoney(quote.total)}</td>
              <td>
                {canEdit ? (
                  <select className="stage-select" value={quote.stage} onChange={(e) => update('quotes', quote.id, { stage: e.target.value })}>
                    <option>Borrador</option>
                    <option>Enviada</option>
                    <option>Aprobada</option>
                    <option>Rechazada</option>
                    <option>Convertida a venta</option>
                  </select>
                ) : (
                  <StageBadge stage={quote.stage} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
