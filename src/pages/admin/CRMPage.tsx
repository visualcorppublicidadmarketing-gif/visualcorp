import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Check, FileText, Users } from 'lucide-react';
import { AppFrame, PageHeading, StatCard } from '../../app/layout';
import { formatDate, formatMoney, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { EmptyState, StageBadge } from '../../components/feedback';

function QuoteRequestDetails({ quote }: { quote: any }) {
  const mode = quote.calculationMode;
  const production = mode === 'area'
    ? `${quote.width} × ${quote.height} ${quote.measurementUnit} · ${Number(quote.area || 0).toFixed(2)} m² por pieza`
    : mode === 'units' ? 'Por unidades' : 'Medidas por definir';
    const preview = quote.pricePreview;
    const priceLabel = (value: number | null | undefined) => value == null ? 'pendiente' : formatMoney(value);
    return <details className="crm-quote-details"><summary>Ver especificaciones</summary><span>{quote.project || 'Proyecto por definir'} · {production}{quote.quantity ? ` · ${quote.quantity} ${quote.quantity === 1 ? 'pieza' : 'piezas'}` : ''}</span>{quote.productName&&<span>Producto: {quote.productName}</span>}{preview&&<span>Estimados pendientes de validar — Normal: {priceLabel(preview.normal)} · Instalación: {priceLabel(preview.installation)} · Corporativo: {priceLabel(preview.corporate)}</span>}{quote.designSupport&&<span>Diseño: {quote.designSupport}</span>}{quote.installation&&<span>Consulta instalación</span>}{quote.finishing&&<span>Acabados: {quote.finishing}</span>}</details>;
}
export interface LeadsTableProps { collection?: string; remoteItems?: any[]; onStatusChange?: (item: any, nextStage: string) => void }
export function LeadsTable({ collection='leads', remoteItems, onStatusChange }: LeadsTableProps) {
  const { data, update }=useWorkspace();
  const { hasPermission }=useAuth();
  const canEdit=hasPermission('crm','edit');
  const items=remoteItems ?? data[collection];
  return items.length===0?<EmptyState icon={Users} title="Sin registros todavía" text="Las solicitudes creadas desde la web aparecerán aquí."/>:<div className="table-wrap"><table><thead><tr><th>Contacto</th><th>Interés</th><th>Origen</th><th>Recibido</th><th>Etapa</th></tr></thead><tbody>{items.map((item)=><tr key={item.id}><td><b>{item.name}</b><small>{item.company||item.phone}</small></td><td><b>{item.service||item.details||'Consulta general'}</b>{item.quoteData&&<QuoteRequestDetails quote={item.quoteData}/>}</td><td>{item.source||'Sitio web'}</td><td>{formatDate(item.createdAt)}</td><td>{canEdit?<select className="stage-select" value={item.stage} onChange={(e)=>onStatusChange?onStatusChange(item,e.target.value):update(collection,item.id,{stage:e.target.value})}><option>Nuevo</option><option>Contactado</option><option>Cotizando</option><option>Ganado</option><option>Perdido</option><option>Cerrado</option></select>:<StageBadge stage={item.stage}/>}</td></tr>)}</tbody></table></div>;
}

export function LeadsPage({ area = 'admin' }: { area?: 'admin' | 'operations' }) {
  const { data }=useWorkspace();
  const { user, hasPermission }=useAuth();
  const canViewCRM=hasPermission('crm','view');
  const [remoteLeads,setRemoteLeads]=useState(null);
  useEffect(()=>{if(!supabase||!user||!canViewCRM)return;let active=true;supabase.from('public_requests').select('*').order('created_at',{ascending:false}).limit(300).then(({data:rows,error})=>{if(!active)return;if(error){window.console.error(error);return;}const stages={new:'Nuevo',contacted:'Contactado',quoted:'Cotizando',won:'Ganado',lost:'Perdido',closed:'Cerrado'};setRemoteLeads((rows||[]).map(row=>({id:row.id,name:row.name,company:row.company,phone:row.phone,service:row.service,details:row.message,quoteData:row.quote_data?.request||null,source:row.request_type==='quote'?'Cotizador público':'Sitio web',createdAt:row.created_at,stage:stages[row.status]||'Nuevo',remoteStatus:row.status})));});return()=>{active=false;};},[user,canViewCRM]);
  const leads=remoteLeads??data.leads;
  const updateRemote=async(item,next)=>{if(!hasPermission('crm','edit'))return;const map={'Nuevo':'new','Contactado':'contacted','Cotizando':'quoted','Ganado':'won','Perdido':'lost','Cerrado':'closed'};const {error}=await supabase.from('public_requests').update({status:map[next],updated_at:new Date().toISOString()}).eq('id',item.id);if(error){window.alert(`No se guardó la etapa: ${error.message}`);return;}setRemoteLeads(current=>current.map(row=>row.id===item.id?{...row,stage:next}:row));};
  return <AppFrame area={area}><PageHeading eyebrow="GESTIÓN DE CLIENTES" title="Solicitudes y CRM" description="Las solicitudes del formulario público quedan disponibles para seguimiento del equipo." action={<span className="local-badge"><span className="status-dot"/> {remoteLeads?'Base compartida':'Cargando solicitudes'}</span>}/><div className="stat-grid compact-stats"><StatCard label="Nuevos" value={leads.filter((item)=>item.stage==='Nuevo').length} icon={Users} note="Por revisar" tone="violet"/><StatCard label="Contactados" value={leads.filter((item)=>item.stage==='Contactado').length} icon={Check} note="En conversación" tone="blue"/><StatCard label="Cotizando" value={leads.filter((item)=>item.stage==='Cotizando').length} icon={FileText} note="Preparando propuesta" tone="amber"/><StatCard label="Ganados" value={leads.filter((item)=>item.stage==='Ganado').length} icon={BadgeCheck} note="Actualización manual" tone="rose"/></div><section className="panel"><div className="panel-heading"><div><span className="eyebrow">EMBUDO COMERCIAL</span><h2>Contactos recientes</h2></div><span className="muted-count">{leads.length} registros</span></div><LeadsTable remoteItems={remoteLeads||undefined} onStatusChange={remoteLeads?updateRemote:undefined}/></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">COTIZACIONES</span><h2>Seguimiento de propuestas</h2></div><Link className="text-link" to="/operaciones/cotizador">Abrir cotizador <ArrowUpRight size={14}/></Link></div><QuoteTable/></section></AppFrame>;
}

export function QuoteTable({ editable }: { editable?: boolean }) {
  const { data, update }=useWorkspace();
  const { hasPermission }=useAuth();
  const canEdit=editable??hasPermission('quotes','edit');
  if (!data.quotes.length) return <EmptyState icon={FileText} title="Sin cotizaciones" text="El equipo puede crear una propuesta desde Operaciones → Cotizador."/>;
  return <div className="table-wrap"><table><thead><tr><th>Referencia</th><th>Cliente</th><th>Concepto</th><th>Total</th><th>Estado</th></tr></thead><tbody>{data.quotes.map((quote)=><tr key={quote.id}><td><b>{quote.code}</b><small>{formatDate(quote.createdAt)}</small></td><td>{quote.customer||'Sin cliente'}</td><td>{quote.itemName} · {quote.quantity} {quote.unit}</td><td>{quote.total===null?'Por confirmar':formatMoney(quote.total)}</td><td>{canEdit?<select className="stage-select" value={quote.stage} onChange={(e)=>update('quotes',quote.id,{stage:e.target.value})}><option>Borrador</option><option>Enviada</option><option>Aprobada</option><option>Rechazada</option><option>Convertida a venta</option></select>:<StageBadge stage={quote.stage}/>}</td></tr>)}</tbody></table></div>;
}
