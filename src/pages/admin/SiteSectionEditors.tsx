import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Mail, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { saveServiceVisibility, saveWebsiteSettings } from '../../lib/websiteAdminRepository';
import { SiteAdminNav } from './SiteAdminNav';

export function ServicesAdminPage() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const canEdit = hasPermission('website', 'edit');
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setDrafts(Object.fromEntries(data.services.map((service) => [service.id, { name: service.name, description: service.description }]))), [data.services]);
  const save = async (event: FormEvent<HTMLFormElement>, serviceId: string) => {
    event.preventDefault();
    if (!canEdit || !supabase || !organizationId) return;
    const draft = drafts[serviceId];
    if (!draft?.name.trim()) { setError('Cada servicio necesita un nombre.'); return; }
    setSavingId(serviceId); setError('');
    try {
      const { data: row, error: saveError } = await supabase.from('services').update({ name: draft.name.trim(), short: draft.description.trim(), detail: draft.description.trim(), updated_at: new Date().toISOString() }).eq('id', serviceId).eq('organization_id', organizationId).select('id').single();
      if (saveError) throw saveError;
      if (!row) throw new Error('No se encontró el servicio para guardar.');
      setData((current) => ({ ...current, services: current.services.map((service) => service.id === serviceId ? { ...service, name: draft.name.trim(), description: draft.description.trim() } : service) }));
      flash('Servicio actualizado en la página pública.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el servicio.'); }
    finally { setSavingId(''); }
  };
  const toggle = async (id: string, enabled: boolean) => {
    try { await saveServiceVisibility(id, enabled, organizationId); setData((current) => ({ ...current, services: current.services.map((service) => service.id === id ? { ...service, enabled } : service) })); flash(enabled ? 'Servicio visible en la página.' : 'Servicio oculto en la página.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la visibilidad.'); }
  };
  return <AppFrame area="admin"><PageHeading eyebrow="EDITOR DEL SITIO" title="Servicios" description="Edita los nombres, resúmenes y visibilidad de las familias que aparecen en la web." action={<Link className="button button-outline" to="/servicios" target="_blank" rel="noreferrer">Ver página pública <ArrowUpRight size={16}/></Link>}/>
    <SiteAdminNav active="/admin/servicios"/>
    {error && <div className="op-flow-alert error" role="alert">{error}</div>}
    <div className="site-service-editor-grid">{data.services.map((service) => { const draft = drafts[service.id] || { name: service.name, description: service.description }; return <form className="panel site-service-editor" key={service.id} onSubmit={(event) => void save(event, service.id)}>
      <div className="panel-heading"><div><span className="eyebrow">FAMILIA DE SERVICIO</span><h2>{service.name}</h2></div><span className={`site-content-status${service.enabled ? ' published' : ''}`}>{service.enabled ? 'Visible' : 'Oculto'}</span></div>
      <label>Nombre visible<input disabled={!canEdit} required maxLength={90} value={draft.name} onChange={(event) => setDrafts((current) => ({ ...current, [service.id]: { ...draft, name: event.target.value } }))}/></label>
      <label>Resumen<textarea disabled={!canEdit} rows={3} maxLength={220} value={draft.description} onChange={(event) => setDrafts((current) => ({ ...current, [service.id]: { ...draft, description: event.target.value } }))}/><small className="field-hint">{draft.description.length}/220 · Este texto se reutiliza en tarjetas y navegación.</small></label>
      <div className="site-service-actions"><button className="button button-dark" type="submit" disabled={!canEdit || savingId === service.id}><Save size={15}/>{savingId === service.id ? 'Guardando…' : 'Guardar texto'}</button><label className="site-service-visibility"><input type="checkbox" disabled={!canEdit} checked={service.enabled} onChange={(event) => void toggle(service.id, event.target.checked)}/> Mostrar en el sitio</label></div>
    </form>; })}</div>
    {!canEdit && <div className="notice-box"><span><Check size={17}/></span><div><b>Acceso de solo lectura</b><p>Tu perfil puede consultar estos servicios, pero no tiene permiso para editarlos.</p></div></div>}
  </AppFrame>;
}

export function ContactAdminPage() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const canEdit = hasPermission('website', 'edit');
  const [draft, setDraft] = useState(data.settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setDraft(data.settings), [data.settings]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!canEdit || saving) return;
    setSaving(true); setError('');
    try { await saveWebsiteSettings(draft, organizationId); setData((current) => ({ ...current, settings: { ...current.settings, location: draft.location, contactPhone: draft.contactPhone } })); flash('Datos de contacto guardados.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los datos.'); }
    finally { setSaving(false); }
  };
  return <AppFrame area="admin"><PageHeading eyebrow="EDITOR DEL SITIO" title="Contacto" description="Actualiza los datos que se muestran en la web. Verifica cada valor antes de guardarlo." action={<Link className="button button-outline" to="/contacto" target="_blank" rel="noreferrer">Ver página pública <ArrowUpRight size={16}/></Link>}/>
    <SiteAdminNav active="/admin/contacto"/>
    <form className="panel form-panel site-contact-editor" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">DATOS COMPARTIDOS</span><h2>Ubicación y contacto principal</h2></div><Mail size={19}/></div>
      {error && <div className="op-flow-alert error" role="alert">{error}</div>}
      <label>Ubicación<input disabled={!canEdit} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })}/></label>
      <label>Teléfono de contacto<input disabled={!canEdit} inputMode="tel" value={draft.contactPhone} onChange={(event) => setDraft({ ...draft, contactPhone: event.target.value })}/></label>
      <p className="panel-intro">El teléfono se guarda también como WhatsApp principal. Las cuentas sociales y otros contactos no se editan aquí porque aún no están conectados a este formulario.</p>
      <button className="button button-dark" type="submit" disabled={!canEdit || saving}><Check size={16}/>{saving ? 'Guardando…' : 'Guardar contacto'}</button>
    </form>
  </AppFrame>;
}
