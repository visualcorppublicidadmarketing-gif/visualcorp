import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Globe2 } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { saveWebsiteContent } from '../../lib/websiteAdminRepository';

const symbol = '/brand/visualcorp-symbol.png';

export function WebsiteAdmin() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const canEdit=hasPermission('website','edit');
  const [draft, setDraft] = useState(data.settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setDraft(data.settings), [data.settings]);
  const save = async (event) => { event.preventDefault(); if(!canEdit)return; setSaving(true); setError(''); try { await saveWebsiteContent(draft, data.services, organizationId); setData((current)=>({...current,settings:draft})); flash('Cambios del sitio guardados en la base compartida.'); } catch (err) { setError(err.message || 'No se guardaron los cambios.'); } finally { setSaving(false); } };
  const toggleService=async(id)=>{if(!canEdit)return;const next=data.services.map((service)=>service.id===id?{...service,enabled:!service.enabled}:service);try{await saveWebsiteContent(draft,next,organizationId);setData((current)=>({...current,services:next}));flash('Visibilidad del servicio actualizada.');}catch(err){setError(err.message||'No se guardó el servicio.');}};
  return <AppFrame area="admin"><PageHeading eyebrow="ADMINISTRADOR DEL SITIO" title="Página pública" description="Edita textos, controla qué servicios aparecen y previsualiza el sitio en vivo." action={<Link className="button button-outline" to="/">Abrir vista pública <ArrowUpRight size={16}/></Link>}/><div className="editor-grid"><form className="panel form-panel" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">CONTENIDO PRINCIPAL</span><h2>Mensajes del sitio</h2></div>{canEdit&&<button className="button button-dark" type="submit" disabled={saving}><Check size={16}/> Guardar cambios</button>}</div><div className="field-grid"><label>Antetítulo<input disabled={!canEdit} value={draft.heroEyebrow} onChange={(e)=>setDraft({...draft,heroEyebrow:e.target.value})}/></label><label>Titular principal<input disabled={!canEdit} value={draft.heroTitle} onChange={(e)=>setDraft({...draft,heroTitle:e.target.value})}/></label><label className="span-two">Descripción<textarea disabled={!canEdit} rows="3" value={draft.heroText} onChange={(e)=>setDraft({...draft,heroText:e.target.value})}/></label><label>Ubicación<input disabled={!canEdit} value={draft.location} onChange={(e)=>setDraft({...draft,location:e.target.value})}/></label><label>Contacto principal<input disabled={!canEdit} value={draft.contactPhone} onChange={(e)=>setDraft({...draft,contactPhone:e.target.value})}/></label><label>Instagram<input disabled={!canEdit} value={draft.instagram} onChange={(e)=>setDraft({...draft,instagram:e.target.value})}/></label></div></form><section className="panel"><div className="panel-heading"><div><span className="eyebrow">CONTENIDO VISIBLE</span><h2>Familias de servicio</h2></div><span className="muted-count">{data.services.filter((service)=>service.enabled).length} visibles</span></div><p className="panel-intro">Las familias reflejan capacidades generales confirmadas. Los materiales, disponibilidad y tiempos quedan por confirmar por proyecto.</p><div className="service-toggle-list">{data.services.map((service)=><label className="toggle-row" key={service.id}><span><b>{service.name}</b><small>{service.description}</small></span><input type="checkbox" disabled={!canEdit} checked={service.enabled} onChange={()=>toggleService(service.id)}/></label>)}</div><div className="brand-note"><img src={symbol} alt=""/><span><b>Logotipo Visual Corp</b><small>Se usa el recurso gráfico de la empresa para esta propuesta.</small></span></div></section></div><div className="preview-strip"><span><Globe2 size={17}/> La página pública se actualiza al guardar</span><Link to="/">Ver el resultado <ArrowUpRight size={15}/></Link></div></AppFrame>;
}
