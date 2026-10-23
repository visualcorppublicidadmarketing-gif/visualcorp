import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Check, Clock3, FileText, History, Plus, Send, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import './changelog.css';

const categories = [
  ['general','General'],['website','Página web'],['sales','Ventas y POS'],
  ['inventory','Inventario'],['operations','Operaciones'],['security','Seguridad'],
];
const audiences = [['both','Admin y operaciones'],['admin','Solo admin'],['operations','Solo operaciones']];
const emptyForm = { title:'', summary:'', details:'', category:'operations', audience:'both', version_tag:'' };
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('es-EC',{year:'numeric',month:'short',day:'numeric'}) : 'Borrador';

export function ChangeLogPanel({ area='operations', compact=false }) {
  const { organizationId, user, roles } = useAuth();
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [form,setForm]=useState(emptyForm);
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false);
  const canManage=roles.some(role=>['owner','admin','manager','website_admin'].includes(role));
  const audiencesForArea=area==='admin'?['both','admin']:['both','operations'];

  const refresh=useCallback(async()=>{
    if(!supabase||!organizationId){setLoading(false);return;}
    setError('');
    let query=supabase.from('internal_change_log').select('*').eq('organization_id',organizationId).in('audience',audiencesForArea).order('published_at',{ascending:false,nullsFirst:false}).order('updated_at',{ascending:false}).limit(compact?4:100);
    if(compact||area==='operations'||!canManage)query=query.eq('status','published').lte('published_at',new Date().toISOString());
    const {data,error:loadError}=await query;
    if(loadError)setError(loadError.message);else setEntries(data||[]);
    setLoading(false);
  },[organizationId,canManage,area,compact]);

  useEffect(()=>{
    refresh();
    if(!supabase||!organizationId)return undefined;
    const channel=supabase.channel(`internal-change-log-${organizationId}-${area}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'internal_change_log',filter:`organization_id=eq.${organizationId}`},()=>refresh())
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[refresh,organizationId,area]);

  const startEdit=(entry)=>{
    setEditing(entry);
    setForm({title:entry.title,summary:entry.summary,details:entry.details||'',category:entry.category,audience:entry.audience,version_tag:entry.version_tag||''});
    setNotice('');setError('');
  };
  const resetForm=()=>{setEditing(null);setForm(emptyForm);};
  const save=async(status)=>{
    if(!canManage||!organizationId||!user)return;
    setSaving(true);setError('');setNotice('');
    const publishedAt=status==='published'?(editing?.published_at||new Date().toISOString()):null;
    const payload={...form,title:form.title.trim(),summary:form.summary.trim(),details:form.details.trim(),version_tag:form.version_tag.trim(),status,published_at:publishedAt,updated_at:new Date().toISOString(),updated_by:user.id};
    if(!editing)Object.assign(payload,{organization_id:organizationId,created_by:user.id});
    const result=editing
      ? await supabase.from('internal_change_log').update(payload).eq('id',editing.id).eq('organization_id',organizationId)
      : await supabase.from('internal_change_log').insert(payload);
    if(result.error){setError(result.error.message);setSaving(false);return;}
    resetForm();setNotice(status==='published'?'Novedad publicada en los paneles seleccionados.':status==='archived'?'Novedad archivada.':'Borrador guardado.');
    await refresh();setSaving(false);
  };
  const changeStatus=async(entry,status)=>{
    if(!canManage||!user||!organizationId)return;
    setSaving(true);setError('');setNotice('');
    const publishedAt=status==='published'?(entry.published_at||new Date().toISOString()):status==='archived'?entry.published_at:null;
    const {error:updateError}=await supabase.from('internal_change_log').update({status,published_at:publishedAt,updated_at:new Date().toISOString(),updated_by:user.id}).eq('id',entry.id).eq('organization_id',organizationId);
    if(updateError)setError(updateError.message);else{setNotice(status==='published'?'Novedad publicada.':'Novedad archivada.');await refresh();}
    setSaving(false);
  };

  const fullPath=area==='admin'?'/admin/cambios':'/operaciones/cambios';
  const heading=area==='admin'?'Novedades del sistema':'Cambios recientes';
  return <section className={`changelog ${compact?'changelog-compact':''}`}>
    <div className="changelog-heading"><div><span className="eyebrow">REGISTRO COMPARTIDO</span><h2>{heading}</h2>{!compact&&<p>Publicaciones internas sincronizadas entre administración y operaciones.</p>}</div>{compact?<Link className="text-link" to={fullPath}>Ver todas <ArrowUpRight size={14}/></Link>:canManage&&<button className="button button-dark" type="button" onClick={resetForm}><Plus size={16}/> Nueva novedad</button>}</div>
    {error&&<div className="changelog-message error" role="alert">{error}</div>}{notice&&<div className="changelog-message success" role="status">{notice}</div>}
    {!compact&&canManage&&<form className="changelog-editor" onSubmit={e=>{e.preventDefault();save('draft');}}>
      <div className="changelog-editor-title"><h3>{editing?'Editar novedad':'Redactar novedad'}</h3>{editing&&<button className="icon-button" type="button" aria-label="Cancelar edición" onClick={resetForm}><X size={16}/></button>}</div>
      <div className="changelog-form-grid"><label>Título<input required maxLength="160" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ej. Nuevo flujo de recepción parcial"/></label><label>Versión o referencia<input maxLength="80" value={form.version_tag} onChange={e=>setForm({...form,version_tag:e.target.value})} placeholder="Opcional: 1.4.0, commit…"/></label><label>Categoría<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Mostrar en<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}>{audiences.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
      <label>Resumen corto<input required maxLength="500" value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} placeholder="Qué cambió y para quién"/></label>
      <label>Detalles<textarea rows="4" maxLength="10000" value={form.details} onChange={e=>setForm({...form,details:e.target.value})} placeholder="Describe mejoras, alcance o instrucciones internas"/></label>
      <div className="changelog-form-actions"><button className="button button-outline" type="submit" disabled={saving||!form.title.trim()||!form.summary.trim()}><FileText size={15}/>{saving?'Guardando…':'Guardar borrador'}</button><button className="button button-dark" type="button" disabled={saving||!form.title.trim()||!form.summary.trim()} onClick={()=>save('published')}><Send size={15}/> Publicar ahora</button></div>
    </form>}
    {loading?<div className="changelog-empty"><Clock3 size={19}/> Cargando novedades…</div>:!entries.length?<div className="changelog-empty"><History size={20}/><b>Aún no hay novedades</b><span>{canManage?'Redacta la primera entrada para compartirla con el equipo.':'Las publicaciones aparecerán aquí cuando administración las comparta.'}</span></div>:<div className="changelog-list">{entries.map(entry=><article className="changelog-entry" key={entry.id}><div className="changelog-entry-top"><div className="changelog-tags"><span className="changelog-tag">{categories.find(([value])=>value===entry.category)?.[1]||'General'}</span>{entry.version_tag&&<span className="changelog-version">{entry.version_tag}</span>}{entry.status!=='published'&&<span className={`changelog-status status-${entry.status}`}>{entry.status==='draft'?'Borrador':'Archivada'}</span>}</div><time>{dateLabel(entry.published_at||entry.updated_at)}</time></div><h3>{entry.title}</h3><p className="changelog-summary">{entry.summary}</p>{entry.details&&<p className="changelog-details">{entry.details}</p>}{canManage&&!compact&&<div className="changelog-entry-actions">{entry.status!=='published'&&entry.status!=='archived'&&<button type="button" className="button button-outline" disabled={saving} onClick={()=>changeStatus(entry,'published')}><Send size={14}/> Publicar</button>}<button type="button" className="button button-outline" onClick={()=>startEdit(entry)}>Editar</button>{entry.status!=='archived'&&<button type="button" className="button button-outline changelog-archive" disabled={saving} onClick={()=>changeStatus(entry,'archived')}>Archivar</button>}</div>}</article>)}</div>}
  </section>;
}
