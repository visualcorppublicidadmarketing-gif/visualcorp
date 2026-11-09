import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, Check, ChevronDown, ClipboardCheck, Clock3, FilePlus2, PackageCheck, Plus, RefreshCw, Send, ThumbsDown, Truck, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace, formatMoney } from '../app/workspace';
import { Dialog } from './ui/OperationalKit';
import { supabase } from '../lib/supabaseClient';
import './PurchasingSourcing.css';

const blankRequestLine = () => ({ variant_id: '', quantity_requested: '', note: '' });
const requestStatus: Record<string, string> = { submitted: 'Por revisar', approved: 'Aprobada · cotizar', rejected: 'Rechazada', converted: 'Orden en borrador', cancelled: 'Cancelada' };
const eventLabel: Record<string, string> = { submitted: 'Enviada a revisión', approved: 'Solicitud aprobada', rejected: 'Solicitud rechazada', quote_registered: 'Oferta registrada', quote_selected: 'Oferta elegida', order_created: 'Borrador de compra creado' };
const localDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'Sin fecha';
const todayKey = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

export function PurchasingSourcing({ organizationId: organizationIdProp, refreshVersion = 0, onOpenOrder }: { organizationId?: string | null; refreshVersion?: number; onOpenOrder?: (orderNumber: string) => void }) {
  const { organizationId: sessionOrganizationId, hasPermission, user } = useAuth();
  const { flash } = useWorkspace();
  const organizationId = organizationIdProp ?? sessionOrganizationId;
  const canManage = hasPermission('purchases', 'edit');
  const canApprove = hasPermission('purchases', 'approve_purchase');
  const canRequest = canManage || hasPermission('workshop', 'view') || hasPermission('sales', 'view');
  const [options, setOptions] = useState<any>({ branches: [], areas: [], variants: [], jobs: [] });
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestDraft, setRequestDraft] = useState<any>({ branch_id: '', area_id: '', production_job_id: '', title: '', needed_by: '', note: '', lines: [blankRequestLine()] });
  const [rejectingId, setRejectingId] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [quoteRequest, setQuoteRequest] = useState<any>(null);
  const [quoteSelection, setQuoteSelection] = useState<any>(null);
  const [quoteDraft, setQuoteDraft] = useState<any>({ supplier_id: '', reference: '', valid_until: '', delivery_date: '', note: '', costs: {} });
  const [refreshTick, setRefreshTick] = useState(0);
  const requestVersion = useRef(0);

  const reload = async () => {
    if (!supabase || !organizationId) { setLoading(false); return; }
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    const [optionsResult, requestResult, supplierResult] = await Promise.all([
      supabase.rpc('get_purchase_request_options', { p_organization_id: organizationId }),
      supabase.from('purchase_requests').select(`id,organization_id,branch_id,area_id,production_job_id,request_number,title,note,needed_by,status,resolution_note,purchase_order_id,created_by,created_at,updated_at,branches(name),areas(name),production_jobs(title,sale_code),purchase_orders(order_number),purchase_request_lines(id,variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_requested,note),purchase_request_events(id,event_key,note,created_at),supplier_quotes(id,supplier_id,reference,valid_until,delivery_date,note,status,created_at,suppliers(name),supplier_quote_lines(id,request_line_id,quantity_quoted,unit_cost,note))`).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(120),
      canManage ? supabase.from('suppliers').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name') : Promise.resolve({ data: [], error: null }),
    ]);
    if (version !== requestVersion.current) return;
    const failure = optionsResult.error || requestResult.error || supplierResult.error;
    if (failure) setError(`No se actualizaron las solicitudes. ${failure.message}`);
    else {
      setOptions(optionsResult.data || { branches: [], areas: [], variants: [], jobs: [] });
      setRequests(requestResult.data || []);
      setSuppliers(supplierResult.data || []);
      const current = optionsResult.data?.branches || [];
      setRequestDraft((draft: any) => ({ ...draft, branch_id: current.some((row: any) => row.id === draft.branch_id) ? draft.branch_id : current[0]?.id || '' }));
    }
    setLoading(false);
  };

  useEffect(() => { void reload(); return () => { requestVersion.current += 1; }; }, [organizationId, refreshVersion, refreshTick, canManage]);

  const activeAreas = useMemo(() => options.areas || [], [options.areas]);
  const requestJobs = useMemo(() => (options.jobs || []).filter((job: any) => job.branch_id === requestDraft.branch_id && (job.areas || []).some((area: any) => area.id === requestDraft.area_id)), [options.jobs, requestDraft.branch_id, requestDraft.area_id]);
  const activeRequests = useMemo(() => requests.filter((row) => ['submitted', 'approved'].includes(row.status)), [requests]);

  const updateRequestLine = (index: number, patch: Record<string, string>) => setRequestDraft((draft: any) => ({ ...draft, lines: draft.lines.map((line: any, row: number) => row === index ? { ...line, ...patch } : line) }));

  const createRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRequest || !user || !organizationId || !supabase) return;
    if (requestDraft.lines.some((line: any) => !line.variant_id || !line.quantity_requested || Number(line.quantity_requested) <= 0)) { setError('Completa cada material solicitado antes de enviar.'); return; }
    if (new Set(requestDraft.lines.map((line: any) => line.variant_id)).size !== requestDraft.lines.length) { setError('Cada variante debe aparecer una sola vez en la solicitud.'); return; }
    setSaving(true); setError(''); setSuccess('');
    const lines = requestDraft.lines.map((line: any) => ({ variant_id: line.variant_id, quantity_requested: Number(line.quantity_requested), note: line.note || '' }));
    const { data: requestId, error: saveError } = await supabase.rpc('create_purchase_request', {
      p_organization_id: organizationId, p_branch_id: requestDraft.branch_id, p_area_id: requestDraft.area_id,
      p_production_job_id: requestDraft.production_job_id || null, p_title: requestDraft.title.trim(),
      p_note: requestDraft.note.trim(), p_needed_by: requestDraft.needed_by || null, p_lines: lines,
    });
    setSaving(false);
    if (saveError || !requestId) { setError(`No se envió la solicitud. ${saveError?.message || 'La base de datos no confirmó el registro.'}`); return; }
    setShowRequestForm(false); setRequestDraft((draft: any) => ({ ...draft, title: '', needed_by: '', note: '', production_job_id: '', lines: [blankRequestLine()] }));
    setSuccess('Solicitud enviada. Quedó en la cola de revisión de Compras.'); setRefreshTick((value) => value + 1); flash('Solicitud de materiales enviada a Compras.');
  };

  const resolveRequest = async (request: any, decision: 'approved' | 'rejected') => {
    if (!canApprove || !supabase) return;
    if (decision === 'rejected' && rejectNote.trim().length < 3) { setError('Escribe un motivo breve para rechazar la solicitud.'); return; }
    setSaving(true); setError('');
    const { error: saveError } = await supabase.rpc('resolve_purchase_request', { p_request_id: request.id, p_decision: decision, p_note: decision === 'rejected' ? rejectNote.trim() : '' });
    setSaving(false);
    if (saveError) { setError(`No se pudo actualizar ${request.request_number}. ${saveError.message}`); return; }
    setRejectingId(''); setRejectNote(''); setSuccess(decision === 'approved' ? `${request.request_number} aprobada para cotizar.` : `${request.request_number} rechazada con motivo registrado.`); setRefreshTick((value) => value + 1);
  };

  const startQuote = (request: any) => {
    setError(''); setQuoteRequest(request);
    setQuoteDraft({ supplier_id: '', reference: '', valid_until: '', delivery_date: '', note: '', costs: Object.fromEntries((request.purchase_request_lines || []).map((line: any) => [line.id, ''])) });
  };

  const captureQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || !quoteRequest || !supabase) return;
    const lines = (quoteRequest.purchase_request_lines || []).map((line: any) => ({ request_line_id: line.id, unit_cost: Number(quoteDraft.costs[line.id]), note: '' }));
    if (!quoteDraft.supplier_id || lines.some((line: any) => !Number.isFinite(line.unit_cost) || line.unit_cost < 0)) { setError('Selecciona proveedor e ingresa un precio válido para cada artículo.'); return; }
    setSaving(true); setError('');
    const { data: quoteId, error: saveError } = await supabase.rpc('capture_supplier_quote', {
      p_request_id: quoteRequest.id, p_supplier_id: quoteDraft.supplier_id, p_reference: quoteDraft.reference.trim(),
      p_valid_until: quoteDraft.valid_until || null, p_delivery_date: quoteDraft.delivery_date || null,
      p_note: quoteDraft.note.trim(), p_lines: lines,
    });
    setSaving(false);
    if (saveError || !quoteId) { setError(`No se registró la oferta. ${saveError?.message || 'La base de datos no confirmó el registro.'}`); return; }
    setQuoteRequest(null); setSuccess(`Oferta registrada para ${quoteRequest.request_number}. Compara precios y fechas antes de elegir.`); setRefreshTick((value) => value + 1); flash('Cotización de proveedor registrada.');
  };

  const selectQuote = (quote: any, request: any) => {
    if (canApprove && canManage) setQuoteSelection({ quote, request });
  };

  const confirmQuoteSelection = async () => {
    if (!canApprove || !canManage || !supabase || !quoteSelection) return;
    setSaving(true); setError('');
    const { quote, request } = quoteSelection;
    const { data: orderId, error: saveError } = await supabase.rpc('select_supplier_quote', { p_quote_id: quote.id });
    setSaving(false);
    if (saveError || !orderId) { setQuoteSelection(null); setError(`No se convirtió la oferta. ${saveError?.message || 'La base de datos no confirmó la orden.'}`); return; }
    const { data: orderRow } = await supabase.from('purchase_orders').select('order_number').eq('id', orderId).maybeSingle();
    setQuoteSelection(null);
    setSuccess(`Oferta elegida. Se creó ${orderRow?.order_number || 'un borrador de orden'}; revisa cantidades y fecha antes de enviarlo.`); setRefreshTick((value) => value + 1); flash('Se creó un borrador de orden desde la oferta elegida.');
    if (orderRow?.order_number) onOpenOrder?.(orderRow.order_number);
  };

  const selectionTotal = quoteSelection ? (quoteSelection.quote.supplier_quote_lines || []).reduce((sum: number, line: any) => sum + Number(line.quantity_quoted) * Number(line.unit_cost), 0) : 0;
  return <section className="purchase-sourcing" aria-labelledby="purchase-sourcing-title">
    <div className="purchase-sourcing-heading"><div><span className="eyebrow">SOLICITUD → APROBACIÓN → COTIZACIÓN → ORDEN</span><h2 id="purchase-sourcing-title">Solicitudes y ofertas</h2><p>El equipo pide materiales con su área y trabajo asociados. Compras revisa la necesidad, registra ofertas recibidas y compara antes de crear un borrador.</p></div><div className="purchase-sourcing-actions"><button className="button button-outline" type="button" onClick={() => { void reload(); }} disabled={loading}><RefreshCw size={14}/> Actualizar</button>{canRequest && <button className="button button-dark" type="button" onClick={() => { setError(''); setShowRequestForm((value) => !value); }}><Plus size={15}/>{showRequestForm ? 'Cerrar solicitud' : 'Solicitar materiales'}</button>}</div></div>

    <div className="purchase-sourcing-stepper" aria-label="Etapas del abastecimiento"><span className="is-current"><i>1</i>Solicitud</span><b/><span><i>2</i>Revisión</span><b/><span><i>3</i>Cotizaciones</span><b/><span><i>4</i>Orden</span></div>
    {error && <div className="purchase-sourcing-message is-error" role="alert"><AlertTriangle size={16}/><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Cerrar aviso"><X size={15}/></button></div>}
    {success && <div className="purchase-sourcing-message is-success" role="status"><Check size={16}/><span>{success}</span><button type="button" onClick={() => setSuccess('')} aria-label="Cerrar aviso"><X size={15}/></button></div>}
    {canManage && !suppliers.length && <div className="purchase-sourcing-message is-warn" role="status"><Truck size={15}/><span>No hay proveedores activos para registrar ofertas. Añade un proveedor desde la sección Compras.</span><a href="/operaciones/compras">Abrir Compras <ArrowRight size={13}/></a></div>}

    {showRequestForm && <form className="purchase-request-form" onSubmit={createRequest}>
      <header><span className="purchase-sourcing-icon"><FilePlus2 size={17}/></span><div><b>Nueva solicitud de materiales</b><small>La solicitud no reserva existencias ni crea una compra.</small></div></header>
      {(!options.branches?.length || !options.areas?.length || !options.variants?.length) && <div className="purchase-sourcing-message is-warn" role="status"><AlertTriangle size={15}/><span>Falta acceso a una sucursal, área o catálogo de materiales para completar una solicitud.</span></div>}
      <div className="purchase-request-fields">
        <label>Motivo de compra<input required minLength={3} maxLength={180} value={requestDraft.title} onChange={(event) => setRequestDraft({ ...requestDraft, title: event.target.value })} placeholder="Ej. Insumos para pedidos de esta semana"/></label>
        <label>Sucursal<select required value={requestDraft.branch_id} onChange={(event) => setRequestDraft({ ...requestDraft, branch_id: event.target.value, production_job_id: '' })}><option value="">Selecciona sucursal</option>{options.branches.map((branch: any) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
        <label>Área de trabajo<select required value={requestDraft.area_id} onChange={(event) => setRequestDraft({ ...requestDraft, area_id: event.target.value, production_job_id: '' })}><option value="">Selecciona área</option>{activeAreas.map((area: any) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
        <label>Trabajo asociado <span className="purchase-field-optional">Opcional</span><select value={requestDraft.production_job_id} onChange={(event) => setRequestDraft({ ...requestDraft, production_job_id: event.target.value })}><option value="">Sin vincular a un trabajo</option>{requestJobs.map((job: any) => <option value={job.id} key={job.id}>{job.sale_code ? `${job.sale_code} · ` : ''}{job.title}</option>)}</select></label>
        <label>Necesario para<input type="date" min={todayKey()} value={requestDraft.needed_by} onChange={(event) => setRequestDraft({ ...requestDraft, needed_by: event.target.value })}/></label>
        <label className="purchase-request-wide">Contexto o especificación<textarea rows={2} maxLength={2000} value={requestDraft.note} onChange={(event) => setRequestDraft({ ...requestDraft, note: event.target.value })} placeholder="Medida, material, acabado o indicación útil para Compras"/></label>
      </div>
      <div className="purchase-request-lines-heading"><span><b>Materiales</b><small>Las cantidades y unidades quedan en la solicitud.</small></span><button className="button button-outline" type="button" onClick={() => setRequestDraft({ ...requestDraft, lines: [...requestDraft.lines, blankRequestLine()] })}><Plus size={13}/> Añadir material</button></div>
      <div className="purchase-request-lines">{requestDraft.lines.map((line: any, index: number) => <div className="purchase-request-line" key={`req-line-${index}`}>
        <label className="purchase-request-material">Artículo o variante<select required value={line.variant_id} onChange={(event) => updateRequestLine(index, { variant_id: event.target.value })}><option value="">Buscar en el catálogo de inventario</option>{(options.variants || []).map((variant: any) => <option value={variant.id} key={variant.id}>{variant.name}{variant.variant ? ` · ${variant.variant}` : ''} · {variant.sku || 'sin SKU'}</option>)}</select></label>
        <label>Cantidad<input required type="number" min="0.001" step="0.001" value={line.quantity_requested} onChange={(event) => updateRequestLine(index, { quantity_requested: event.target.value })} placeholder="0"/></label>
        <label>Nota de línea<input maxLength={500} value={line.note} onChange={(event) => updateRequestLine(index, { note: event.target.value })} placeholder="Medida, color…"/></label>
        {requestDraft.lines.length > 1 && <button className="purchase-request-remove" type="button" aria-label={`Quitar material ${index + 1}`} onClick={() => setRequestDraft({ ...requestDraft, lines: requestDraft.lines.filter((_: any, row: number) => row !== index) })}><X size={15}/></button>}
      </div>)}</div>
      <footer><span><AlertTriangle size={14}/> No se reserva stock hasta que exista una orden aprobada.</span><button className="button button-dark" type="submit" disabled={saving || !options.variants?.length || !options.branches?.length || !options.areas?.length}>{saving ? 'Enviando…' : 'Enviar solicitud'} <Send size={14}/></button></footer>
    </form>}

    <div className="purchase-request-queue-heading"><div><span className="eyebrow">COLA OPERATIVA</span><h3>Solicitudes registradas</h3></div><span className="purchase-request-count"><ClipboardCheck size={14}/>{activeRequests.length} abiertas</span></div>
    {loading ? <div className="purchase-sourcing-empty"><RefreshCw size={17}/>Cargando solicitudes y cotizaciones…</div> : requests.length ? <div className="purchase-request-list">{requests.map((request: any) => <article className={`purchase-request-card status-${request.status}`} key={request.id}>
      <header className="purchase-request-card-heading"><div className="purchase-request-number"><span className={`purchase-request-status is-${request.status}`}>{requestStatus[request.status] || request.status}</span><b>{request.request_number}</b><h4>{request.title}</h4><p>{request.branches?.name || 'Sucursal'} · {request.areas?.name || 'Área'}{request.production_jobs?.title ? ` · ${request.production_jobs.title}` : ''}</p></div><div className="purchase-request-date"><CalendarDays size={14}/><span>Necesario<br/><b>{localDate(request.needed_by)}</b></span></div></header>
      {request.note && <p className="purchase-request-note">{request.note}</p>}
      <div className="purchase-request-line-summary">{(request.purchase_request_lines || []).map((line: any) => <span key={line.id}><PackageCheck size={14}/><b>{line.description_snapshot}</b><small>{Number(line.quantity_requested)} {line.unit_snapshot || 'unid.'}{line.note ? ` · ${line.note}` : ''}</small></span>)}</div>
      {request.resolution_note && <div className={`purchase-resolution-note${request.status === 'rejected' ? ' is-rejected' : ''}`}>{request.status === 'rejected' ? 'Motivo:' : 'Nota de revisión:'} {request.resolution_note}</div>}
      {(request.supplier_quotes || []).length > 0 && <QuoteComparison request={request} canApprove={canApprove && canManage} saving={saving} onSelect={selectQuote}/>}
      {request.status === 'submitted' && canApprove && <div className="purchase-request-review-actions">{rejectingId === request.id ? <form className="purchase-reject-form" onSubmit={(event) => { event.preventDefault(); void resolveRequest(request, 'rejected'); }}><label>Motivo del rechazo<textarea required minLength={3} maxLength={500} rows={2} value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Explica qué dato falta o qué debe cambiar"/></label><button className="button button-outline" type="button" onClick={() => { setRejectingId(''); setRejectNote(''); }}>Volver</button><button className="button button-danger" type="submit" disabled={saving}>Confirmar rechazo</button></form> : <><button className="button button-outline" type="button" onClick={() => { setRejectingId(request.id); setRejectNote(''); }} disabled={saving}><ThumbsDown size={14}/> Rechazar</button><button className="button button-dark" type="button" onClick={() => { void resolveRequest(request, 'approved'); }} disabled={saving}><Check size={14}/> Aprobar para cotizar</button></>}</div>}
      {request.status === 'approved' && <div className="purchase-request-review-actions"><span className="purchase-approved-hint"><Check size={14}/> Lista para comparar precios y entrega.</span>{canManage && <button className="button button-dark" type="button" onClick={() => startQuote(request)} disabled={saving || !suppliers.length}><Plus size={14}/> Registrar oferta recibida</button>}</div>}
      {quoteRequest?.id === request.id && <QuoteForm request={request} suppliers={suppliers} draft={quoteDraft} setDraft={setQuoteDraft} saving={saving} onClose={() => setQuoteRequest(null)} onSubmit={captureQuote}/>}
      {request.purchase_order_id && request.purchase_orders?.order_number && <button className="purchase-converted-link" type="button" onClick={() => onOpenOrder?.(request.purchase_orders.order_number)}><Check size={14}/> Abrir borrador {request.purchase_orders.order_number} <ArrowRight size={14}/></button>}
      <details className="purchase-request-history"><summary><Clock3 size={14}/> Historial de revisión <ChevronDown size={14}/></summary><div>{(request.purchase_request_events || []).map((event: any) => <p key={event.id}><b>{eventLabel[event.event_key] || event.event_key}</b><small>{localDate(event.created_at)}{event.note ? ` · ${event.note}` : ''}</small></p>)}</div></details>
    </article>)}</div> : <div className="purchase-sourcing-empty"><ClipboardCheck size={22}/><b>Aún no hay solicitudes para mostrar</b><span>{canRequest ? 'Registra una necesidad de materiales para iniciar el flujo.' : 'Las solicitudes de tus trabajos aparecerán aquí cuando se envíen.'}</span>{canRequest && <button className="button button-outline" type="button" onClick={() => setShowRequestForm(true)}>Crear solicitud <Plus size={14}/></button>}</div>}
    {quoteSelection && <Dialog open onOpenChange={(open) => { if (!open && !saving) setQuoteSelection(null); }} eyebrow="COMPRAS · REVISIÓN FINAL" title="Crear borrador desde esta oferta" description={`Se creará una orden en borrador para ${quoteSelection.quote.suppliers?.name || 'el proveedor seleccionado'} vinculada a ${quoteSelection.request.request_number}. El importe y la fecha se copiarán de la cotización.`} tone="warning" size="sm" role="alertdialog" busy={saving} closeOnOverlayClick={false} footer={<><button className="vc-dlg-btn variant-outline" type="button" onClick={() => setQuoteSelection(null)} disabled={saving}>Volver a comparar</button><button className="vc-dlg-btn variant-primary" type="button" onClick={() => void confirmQuoteSelection()} disabled={saving}>{saving ? 'Creando borrador…' : 'Crear borrador'} <Check size={14}/></button></>}><div className="purchase-selection-total"><span>Valor cotizado · USD</span><b>{formatMoney(selectionTotal)}</b></div><div className="purchase-selection-note"><Truck size={16}/><span>La orden no se envía al proveedor. Revisa cantidades, sucursal y entrega; una persona autorizada debe marcarla como enviada.</span></div></Dialog>}
  </section>;
}

function QuoteForm({ request, suppliers, draft, setDraft, saving, onClose, onSubmit }: { request: any; suppliers: any[]; draft: any; setDraft: (next: any) => void; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <form className="purchase-quote-form" onSubmit={onSubmit}>
    <header><div><span className="eyebrow">CAPTURA MANUAL · OFERTA RECIBIDA</span><h4>Registrar cotización · {request.request_number}</h4><p>Transcribe lo que confirmó el proveedor. No se envía una solicitud al proveedor desde aquí.</p></div><button type="button" className="purchase-request-remove" aria-label="Cerrar formulario de cotización" onClick={onClose} disabled={saving}><X size={16}/></button></header>
    <div className="purchase-quote-fields"><label>Proveedor<select required value={draft.supplier_id} onChange={(event) => setDraft({ ...draft, supplier_id: event.target.value })}><option value="">Selecciona proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Referencia<input maxLength={180} value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} placeholder="Código o documento recibido"/></label><label>Vigencia hasta<input type="date" value={draft.valid_until} onChange={(event) => setDraft({ ...draft, valid_until: event.target.value })}/></label><label>Entrega ofrecida<input type="date" value={draft.delivery_date} onChange={(event) => setDraft({ ...draft, delivery_date: event.target.value })}/></label></div>
    <div className="purchase-quote-price-list">{(request.purchase_request_lines || []).map((line: any) => <label key={line.id}><span><b>{line.description_snapshot}</b><small>{Number(line.quantity_requested)} {line.unit_snapshot || 'unid.'} solicitadas</small></span><span><small>USD por unidad</small><input required type="number" min="0" step="0.0001" value={draft.costs[line.id]} onChange={(event) => setDraft({ ...draft, costs: { ...draft.costs, [line.id]: event.target.value } })} placeholder="0.00"/></span></label>)}</div>
    <label className="purchase-quote-note">Observación de la oferta<textarea rows={2} maxLength={1500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Condiciones, transporte, cambios o exclusiones confirmadas"/></label>
    <footer><button type="button" className="button button-outline" onClick={onClose} disabled={saving}>Cancelar</button><button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar oferta'} <Check size={14}/></button></footer>
  </form>;
}

function QuoteComparison({ request, canApprove, saving, onSelect }: { request: any; canApprove: boolean; saving: boolean; onSelect: (quote: any, request: any) => void }) {
  const quotes = request.supplier_quotes || [];
  const openQuotes = quotes.filter((quote: any) => quote.status === 'submitted' && (!quote.valid_until || quote.valid_until >= todayKey()) && (!quote.delivery_date || quote.delivery_date >= todayKey()));
  return <section className="purchase-quote-comparison" aria-label={`Comparación de ofertas para ${request.request_number}`}>
    <header><div><span className="eyebrow">COMPARACIÓN</span><h5>Ofertas recibidas</h5></div><span>{openQuotes.length} vigentes en el historial</span></header>
    <div className="purchase-quote-grid">{quotes.map((quote: any) => {
      const total = (quote.supplier_quote_lines || []).reduce((sum: number, line: any) => sum + Number(line.quantity_quoted) * Number(line.unit_cost), 0);
      const expired = quote.valid_until && quote.valid_until < todayKey();
      const deliveryPassed = quote.delivery_date && quote.delivery_date < todayKey();
      const unusable = Boolean(expired || deliveryPassed);
      return <article className={`purchase-quote-option${quote.status === 'selected' ? ' is-selected' : ''}${unusable ? ' is-expired' : ''}`} key={quote.id}>
        <div className="purchase-quote-option-top"><span className="purchase-quote-supplier">{quote.suppliers?.name || 'Proveedor'}</span>{quote.status === 'selected' && <span className="purchase-quote-selected"><Check size={12}/> Elegida</span>}{unusable && quote.status !== 'selected' && <span className="purchase-quote-expired">{expired ? 'Venció' : 'Entrega pasada'}</span>}</div>
        <strong>{formatMoney(total)}</strong><small>{quote.reference || 'Sin referencia'}{quote.delivery_date ? ` · entrega ${localDate(quote.delivery_date)}` : ''}</small>{quote.valid_until && <small>Vigente hasta {localDate(quote.valid_until)}</small>}{quote.note && <small className="purchase-quote-note-summary">{quote.note}</small>}
        {canApprove && quote.status === 'submitted' && <button type="button" className="button button-outline" onClick={() => onSelect(quote, request)} disabled={saving || unusable}><Check size={13}/> Elegir y crear borrador</button>}
      </article>;
    })}</div>
    {quotes.length > 1 && <details className="purchase-quote-detail"><summary>Comparar importe por artículo <ChevronDown size={14}/></summary><div className="table-wrap"><table><thead><tr><th scope="col">Artículo</th><th scope="col">Cantidad</th>{quotes.map((quote: any) => <th scope="col" key={quote.id}>{quote.suppliers?.name || 'Proveedor'}{quote.status === 'selected' ? ' · Elegida' : ''}</th>)}</tr></thead><tbody>{(request.purchase_request_lines || []).map((line: any) => <tr key={line.id}><th scope="row">{line.description_snapshot}</th><td>{Number(line.quantity_requested)} {line.unit_snapshot || 'unid.'}</td>{quotes.map((quote: any) => { const quoteLine = (quote.supplier_quote_lines || []).find((row: any) => row.request_line_id === line.id); return <td key={quote.id}>{quoteLine ? formatMoney(Number(quoteLine.unit_cost)) : '—'}</td>; })}</tr>)}</tbody></table></div></details>}
  </section>;
}
