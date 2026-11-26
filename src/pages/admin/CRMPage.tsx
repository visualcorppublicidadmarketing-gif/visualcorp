import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText, MessageCircle, Users } from 'lucide-react';
import { formatDate, formatMoney, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState, StageBadge } from '../../components/feedback';
import { CRMInboxPage } from './CRMInboxPage';
import './crm-page.css';

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
  const canQuote = hasPermission('quotes', 'edit');
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
                    {canQuote && (
                      <Link
                        className="button button-outline"
                        style={{ minHeight: '28px', padding: '0 8px', fontSize: '10px' }}
                        to={`/operaciones/cotizador?fromRequest=${encodeURIComponent(item.id)}`}
                      >
                        Cotizar
                      </Link>
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
  return <CRMInboxPage area={area} />;
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
