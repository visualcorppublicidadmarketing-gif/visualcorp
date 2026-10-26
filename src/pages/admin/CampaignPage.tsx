import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Check,
  CheckCircle2, Clock3, Copy, FileImage, FileText, Filter, FolderOpen, Images, Lightbulb,
  LoaderCircle, Megaphone, Plus, RefreshCw, Search, Save, Sparkles, Target, TrendingUp, X,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { AnimatedList } from '../../components/ui/MagicComponents';
import { EmptyState, StageBadge } from '../../components/feedback';
import { supabase } from '../../lib/supabaseClient';
import { MarketingCalendar } from './marketing/MarketingCalendar';
import { MarketingAssetIntake } from './marketing/MarketingAssetIntake';
import { MarketingAssetPreview } from './marketing/MarketingAssetPreview';
import { PublicationEditorSections, type PublicationDraft, type PublicationEditorTab } from './marketing/PublicationEditorSections';

type Post = Record<string, any> & { id: string; title: string; status: string; scheduled_date: string; platform: string };
type Asset = Record<string, any> & { id: string; filename: string; rel_path: string; section: string; is_available: boolean; storage_status?: string; retention_enabled?: boolean; retention_months?: number };
type Section = 'overview' | 'calendar' | 'library' | 'strategy' | 'operations' | 'results';
type WorkspaceData = { posts: Post[]; assets: Asset[]; postAssets: any[]; strategy: any[]; work: any[]; history: any[]; leads: any[]; sales: any[]; events: any[] };

const emptyData: WorkspaceData = { posts: [], assets: [], postAssets: [], strategy: [], work: [], history: [], leads: [], sales: [], events: [] };
const sections: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Resumen', icon: BarChart3 },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'library', label: 'Biblioteca', icon: Images },
  { id: 'strategy', label: 'Estrategia', icon: Target },
  { id: 'operations', label: 'Operación', icon: CheckCircle2 },
  { id: 'results', label: 'Resultados', icon: TrendingUp },
];

const formatDate = (value?: string) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};
const formatMoney = (value?: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
const statusTone = (value = '') => /publicad|complet|aprobad|ganad/i.test(value) ? 'good' : /bloque|atras|vencid/i.test(value) ? 'danger' : /revisi|espera|valid/i.test(value) ? 'review' : 'active';
const checklistFields = [
  ['cover_status', 'Portada'], ['art_status', 'Arte'], ['caption_status', 'Copy'],
  ['video_status', 'Video'], ['voiceover_status', 'Voz'], ['tiktok_status', 'TikTok'],
] as const;
const defaultDraft = (scheduledDate = ''): PublicationDraft => ({ title: '', content_line: '', platform: 'Instagram', format: 'Post', scheduled_date: scheduledDate, scheduled_time: '', owner: '', status: 'Por iniciar', caption: '', next_action: '', due_date: '', objective: '', audience: '', offer: '', call_in: '', callout: '', cta: '', cta_destination: '', external_url: '', hashtags: '', visual_direction: '' });

async function readAll(table: string, organizationId: string, orderBy?: string) {
  if (!supabase) return [];
  const pageSize = 1000;
  const rows: any[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select('*').eq('organization_id', organizationId);
    if (orderBy) query = query.order(orderBy, { ascending: true, nullsFirst: false }).order('id', { ascending: true });
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export function CampaignPage({ area = 'admin' }: { area?: 'admin' | 'operations' }) {
  const { organizationId, hasPermission } = useAuth();
  const canView = hasPermission('marketing', 'view');
  const canEdit = hasPermission('marketing', 'edit');
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos los estados');
  const [assetFilter, setAssetFilter] = useState('Todos los archivos');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(defaultDraft);
  const [isNew, setIsNew] = useState(false);
  const [draftTabKey, setDraftTabKey] = useState(0);
  const [editorTab, setEditorTab] = useState<PublicationEditorTab>('plan');

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [posts, assets, postAssets, strategy, work, history, leads, sales, events] = await Promise.all([
        readAll('marketing_posts', organizationId, 'scheduled_date'),
        readAll('marketing_assets', organizationId, 'filename'),
        readAll('marketing_post_assets', organizationId, 'created_at'),
        readAll('marketing_strategy_items', organizationId, 'category'),
        readAll('marketing_work_items', organizationId, 'due_date'),
        readAll('marketing_work_item_history', organizationId, 'created_at'),
        readAll('marketing_lead_tracking', organizationId, 'created_at'),
        readAll('marketing_sales_snapshots', organizationId, 'imported_at'),
        readAll('marketing_post_events', organizationId, 'created_at'),
      ]);
      setData({ posts, assets, postAssets, strategy, work, history, leads, sales, events });
    } catch (error: any) {
      setLoadError(error?.message || 'No pudimos cargar el espacio de marketing.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, canView]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (!modalOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedPost(null); setModalOpen(false); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [modalOpen]);

  const statuses = useMemo(() => ['Todos los estados', ...new Set(data.posts.map((post) => post.status).filter(Boolean).sort())], [data.posts]);
  const filteredPosts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('es');
    return data.posts.filter((post) => {
      const matchesSearch = !search || [post.title, post.content_line, post.platform, post.owner, post.caption, post.status].some((field) => String(field || '').toLocaleLowerCase('es').includes(search));
      return matchesSearch && (statusFilter === 'Todos los estados' || post.status === statusFilter);
    }).sort((a, b) => {
      const aOpen = !/publicad|complet|cancelad/i.test(a.status || '');
      const bOpen = !/publicad|complet|cancelad/i.test(b.status || '');
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return (a.due_date || a.scheduled_date || '9999-12-31').localeCompare(b.due_date || b.scheduled_date || '9999-12-31');
    });
  }, [data.posts, query, statusFilter]);
  const visibleAssets = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('es');
    return data.assets.filter((asset) => {
      const matchesSearch = !search || [asset.filename, asset.rel_path, asset.section, asset.folder].some((field) => String(field || '').toLocaleLowerCase('es').includes(search));
      const matchesAvailability = assetFilter === 'Todos los archivos'
        || (assetFilter === 'Disponibles en el equipo' && asset.is_available)
        || (assetFilter === 'Solo referencia de ruta' && ['local_reference', 'local_only'].includes(asset.storage_status || ''))
        || (assetFilter === 'Eliminados por plazo' && asset.storage_status === 'retention_deleted');
      return matchesSearch && matchesAvailability;
    }).slice(0, 150);
  }, [data.assets, query, assetFilter]);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const published = data.posts.filter((post) => /publicad/i.test(post.status || '')).length;
  const overdue = data.posts.filter((post) => post.due_date && post.due_date < today && !/publicad|complet/i.test(post.status || '')).length;
  const inProduction = data.posts.filter((post) => !/publicad|complet|cancelad/i.test(post.status || '')).length;
  const linkedAssets = new Set(data.postAssets.map((link) => link.asset_id)).size;
  const linkedPosts = new Set(data.postAssets.map((link) => link.post_id)).size;
  const currentSnapshot = data.sales[0]?.data_json;
  const metricPosts = data.posts.filter((post) => Number(post.reach) || Number(post.interactions) || Number(post.clicks) || Number(post.leads));
  const selectedEvents = selectedPost ? data.events.filter((event) => event.post_id === selectedPost.id).slice(-8).reverse() : [];

  const openPost = (post?: Post, scheduledDate = '') => {
    setModalOpen(true);
    setDraftTabKey((current) => current + 1);
    setEditorTab('plan');
    setIsNew(!post);
    setSelectedPost(post || null);
    setDraft(post ? {
      title: post.title || '', content_line: post.content_line || '', platform: post.platform || 'Instagram',
      format: post.format || 'Post', scheduled_date: post.scheduled_date || '', scheduled_time: post.scheduled_time || '',
      owner: post.owner || '', status: post.status || 'Por iniciar', caption: post.caption || '',
      next_action: post.next_action || '', due_date: post.due_date || '',
      objective: post.objective || '', audience: post.audience || '', offer: post.offer || '',
      call_in: post.call_in || '', callout: post.callout || '', cta: post.cta || '',
      cta_destination: post.cta_destination || '', external_url: post.external_url || '',
      hashtags: post.hashtags || '', visual_direction: post.visual_direction || '',
    } : defaultDraft(scheduledDate));
  };
  const reschedulePost = async (post: Post, date: string) => {
    if (!supabase || !organizationId || !canEdit || !date || date === post.scheduled_date?.slice(0, 10)) return;
    setSaving(true);
    try {
      const { data: updated, error } = await supabase.from('marketing_posts').update({ scheduled_date: date, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', post.id).select('id').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('No encontramos la publicación o tu perfil no puede editarla.');
      setNotice(`“${post.title}” se movió al ${formatDate(date)}.`);
      await refresh();
    } catch (error: any) {
      setLoadError(error?.message || 'No se pudo cambiar la fecha de la publicación.');
    } finally { setSaving(false); }
  };
  const copyAssetPath = async (path: string) => {
    try { await navigator.clipboard.writeText(path); setNotice('Ruta del recurso copiada.'); }
    catch { setLoadError('El navegador no permitió copiar la ruta. Puedes seleccionarla manualmente en la biblioteca.'); }
  };
  const savePost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !canEdit) return;
    if (!draft.title.trim()) {
      setEditorTab('plan');
      setNotice('Completa el título en la sección Plan antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      const fields = { ...draft, title: draft.title.trim(), updated_at: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date()) };
      const result = isNew
        ? await supabase.from('marketing_posts').insert({ ...fields, organization_id: organizationId, source_system: 'visualcorp-suite', source_id: `suite-${globalThis.crypto.randomUUID()}` }).select('id').single()
        : await supabase.from('marketing_posts').update(fields).eq('organization_id', organizationId).eq('id', selectedPost?.id).select('id').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No encontramos la publicación o tu perfil no puede editarla.');
      setSelectedPost(null);
      setModalOpen(false);
      setNotice(isNew ? 'Publicación creada en el calendario central.' : 'Publicación actualizada y cambio registrado.');
      await refresh();
    } catch (error: any) {
      setLoadError(error?.message || 'No se pudo guardar la publicación.');
    } finally {
      setSaving(false);
    }
  };

  const sectionTitle = sections.find((section) => section.id === activeSection)?.label || 'Resumen';
  const searchPlaceholder = activeSection === 'library' ? 'Buscar por archivo, carpeta o sección…' : 'Buscar publicaciones por tema, canal o responsable…';

  return <AppFrame area={area}>
    <PageHeading eyebrow="MARKETING · CENTRO DE CONTENIDO" title="Marketing y contenido" description="Planifica, produce y revisa publicaciones, piezas, tareas y resultados en el espacio compartido de Visual Corp." action={<div className="vc-content-actions"><button className="button button-outline" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'vc-content-spin' : ''}/>Actualizar</button>{canEdit && <button className="button button-dark vc-shimmer-button" type="button" onClick={() => openPost()}><Plus size={16}/>Nueva publicación</button>}</div>} />

    <main className="vc-content-workspace" aria-label="Centro de gestión de marketing">
      <section className="vc-content-hero">
        <div className="vc-content-hero-glow" aria-hidden="true" />
        <div className="vc-content-hero-copy"><span className="vc-content-brand"><span><Sparkles size={16}/></span> VISUAL CONTENT STUDIO <i>·</i> ESPACIO CENTRAL</span><h2>Todo el contenido,<br/><em>conectado y en movimiento.</em></h2><p>El calendario y los registros de Tracking ya viven en la suite, con acceso por perfil, biblioteca catalogada y seguimiento de cambios.</p></div>
        <div className="vc-content-hero-stat"><span><Megaphone size={17}/></span><strong>{data.posts.length}</strong><small>publicaciones centralizadas</small><div className="vc-content-sparkline" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div>
      </section>

      {!supabase && <div className="vc-content-alert"><AlertCircle size={18}/><div><b>Falta conectar la suite a su base de datos</b><span>La biblioteca migrada está en Supabase; configura la conexión del entorno para cargarla.</span></div></div>}
      {!organizationId && supabase && !loading && <div className="vc-content-alert"><AlertCircle size={18}/><div><b>Tu cuenta aún no tiene una organización activa</b><span>Solicita que administración vincule tu perfil de acceso de Visual Corp.</span></div></div>}
      {!canView && organizationId && !loading && <div className="vc-content-alert"><AlertCircle size={18}/><div><b>Tu perfil no tiene acceso a Marketing</b><span>El contenido se protege con los permisos de tu organización.</span></div></div>}
      {loadError && <div className="vc-content-alert is-error"><AlertCircle size={18}/><div><b>No se pudo completar la carga</b><span>{loadError}</span></div><button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Reintentar"><RefreshCw size={16}/></button></div>}

      <section className="vc-content-kpis" aria-label="Estado del contenido">
        <article className="vc-content-kpi"><span className="is-purple"><FileText size={17}/></span><div><small>En producción</small><strong>{loading ? '—' : inProduction}</strong><em>publicaciones activas</em></div><ArrowUpRight size={15}/></article>
        <article className="vc-content-kpi"><span className="is-teal"><CheckCircle2 size={17}/></span><div><small>Publicadas</small><strong>{loading ? '—' : published}</strong><em>en el registro histórico</em></div><ArrowUpRight size={15}/></article>
        <article className="vc-content-kpi"><span className="is-amber"><Clock3 size={17}/></span><div><small>Requieren atención</small><strong>{loading ? '—' : overdue}</strong><em>vencidas por fecha límite</em></div><ArrowDownRight size={15}/></article>
        <article className="vc-content-kpi"><span className="is-blue"><Images size={17}/></span><div><small>Biblioteca vinculada</small><strong>{loading ? '—' : linkedAssets}</strong><em>{linkedPosts} publicaciones con piezas</em></div><ArrowUpRight size={15}/></article>
      </section>

      <nav className="vc-content-tabs" aria-label="Áreas de marketing">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeSection === id ? 'is-active' : ''} onClick={() => { setActiveSection(id); setQuery(''); }} aria-current={activeSection === id ? 'page' : undefined}><Icon size={16}/>{label}{id === 'calendar' && <span>{data.posts.length}</span>}{id === 'library' && <span>{data.assets.length}</span>}</button>)}
      </nav>

      {(activeSection === 'overview' || activeSection === 'calendar' || activeSection === 'library') && <div className="vc-content-toolbar"><div><span className="vc-content-section-icon"><FolderOpen size={16}/></span><div><b>{activeSection === 'overview' ? 'Flujo editorial' : sectionTitle}</b><small>{activeSection === 'library' ? `${data.assets.length} recursos catalogados · ${linkedAssets} vinculados` : `${filteredPosts.length} de ${data.posts.length} publicaciones`}</small></div></div><label className="vc-content-search"><Search size={15}/><input aria-label="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder}/></label><label className="vc-content-filter"><Filter size={14}/><select aria-label="Filtrar resultados" value={activeSection === 'library' ? assetFilter : statusFilter} onChange={(event) => activeSection === 'library' ? setAssetFilter(event.target.value) : setStatusFilter(event.target.value)}>{activeSection === 'library' ? <><option>Todos los archivos</option><option>Disponibles en el equipo</option><option>Solo referencia de ruta</option><option>Eliminados por plazo</option></> : statuses.map((status) => <option key={status}>{status}</option>)}</select></label></div>}

      {activeSection === 'calendar' && <MarketingCalendar posts={filteredPosts} canEdit={canEdit} onSelect={(post) => openPost(post as Post)} onCreate={(date) => openPost(undefined, date)} onReschedule={(post, date) => void reschedulePost(post as Post, date)}/>}

      {activeSection === 'overview' && <>
        {loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando publicaciones, piezas y tareas…</div>
          : data.posts.length === 0 ? <EmptyState icon={CalendarDays} title="El calendario está listo para comenzar" text="Aún no hay publicaciones en la base central. Crea la primera ficha para iniciar el flujo editorial." action={canEdit && <button className="button button-dark" onClick={() => openPost()}><Plus size={15}/>Nueva publicación</button>}/>
            : filteredPosts.length === 0 ? <EmptyState icon={Search} title="No encontramos coincidencias" text="Prueba con otro título, canal, responsable o estado." action={<button className="button button-outline" onClick={() => { setQuery(''); setStatusFilter('Todos los estados'); }}>Limpiar búsqueda</button>}/>
              : <div className={`vc-content-post-grid ${activeSection === 'overview' ? 'is-overview' : ''}`}>
                <AnimatedList className="vc-content-post-list" itemClassName="vc-content-post-entry">{filteredPosts.slice(0, activeSection === 'overview' ? 8 : undefined).map((post) => {
                  const linked = data.postAssets.filter((link) => link.post_id === post.id).length;
                  const complete = checklistFields.filter(([field]) => /complet|aprob|listo|hecho/i.test(post[field] || '')).length;
                  return <article className="vc-content-post" key={post.id}>
                    <div className="vc-content-date"><strong>{post.scheduled_date ? post.scheduled_date.slice(8,10) : '—'}</strong><span>{post.scheduled_date ? new Intl.DateTimeFormat('es-EC',{month:'short'}).format(new Date(`${post.scheduled_date.slice(0,10)}T12:00:00`)) : 'PEND.'}</span></div>
                    <button className="vc-content-post-main" type="button" onClick={() => openPost(post)}><span className="vc-content-post-eyebrow">{post.content_line || post.platform || 'Contenido'} <i>·</i> {post.format || 'Formato pendiente'}</span><strong>{post.title || 'Sin título'}</strong><span className="vc-content-post-caption">{post.caption || post.next_action || 'Copy y siguiente paso por completar.'}</span><span className="vc-content-post-meta"><span><Megaphone size={13}/>{post.platform || 'Canal pendiente'}</span><span><Images size={13}/>{linked} piezas</span><span><Check size={13}/>{complete}/{checklistFields.length} checklist</span>{post.owner && <span>{post.owner}</span>}</span></button>
                    <div className="vc-content-post-end"><StageBadge stage={post.status || 'Por iniciar'}/><span className={`vc-content-dot is-${statusTone(post.status)}`}/></div>
                  </article>;
                })}</AnimatedList>
                {activeSection === 'overview' && <aside className="vc-content-side-panel"><div className="vc-content-side-heading"><div><span className="eyebrow">PULSO EDITORIAL</span><h3>Lo que sigue</h3></div><Activity size={17}/></div><div className="vc-content-next-list">{data.posts.filter((post) => post.scheduled_date && post.scheduled_date >= today && !/publicad/i.test(post.status || '')).sort((a,b)=>a.scheduled_date.localeCompare(b.scheduled_date)).slice(0,4).map((post) => <button type="button" key={post.id} onClick={() => openPost(post)}><span className="vc-content-next-date">{formatDate(post.scheduled_date)}</span><b>{post.title}</b><small>{post.platform || 'Canal pendiente'}{post.owner ? ` · ${post.owner}` : ''}</small></button>)}{!data.posts.some((post) => post.scheduled_date && post.scheduled_date >= today && !/publicad/i.test(post.status || '')) && <p className="vc-content-side-empty">No hay publicaciones futuras con fecha asignada.</p>}</div><button className="vc-content-text-link" type="button" onClick={() => setActiveSection('calendar')}>Ver calendario completo <ArrowUpRight size={14}/></button><div className="vc-content-side-callout"><span><Lightbulb size={15}/></span><p><b>{overdue ? `${overdue} fichas necesitan atención` : 'El flujo está al día'}</b><br/>Define responsable, fecha límite y próximo paso para que las alertas tengan contexto.</p></div></aside>}
              </div>}
      </>}

      {activeSection === 'library' && <>
        {organizationId && <MarketingAssetIntake organizationId={organizationId} canEdit={canEdit} posts={data.posts} onSaved={() => void refresh()}/>}
        {loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando biblioteca…</div> : visibleAssets.length === 0 ? <EmptyState icon={Images} title="Sin recursos con este filtro" text="Prueba con otra búsqueda o cambia el filtro de disponibilidad."/> : <><div className="vc-library-grid">{visibleAssets.map((asset) => {const stored=asset.storage_status==='supabase_storage';const deleted=asset.storage_status==='retention_deleted';const sourceLabel=stored?'Central':deleted?'Eliminado por plazo':asset.storage_status==='local_reference'?'Ruta local':asset.storage_status==='upload_failed'?'Carga fallida':asset.storage_status==='uploading'?'Cargando':asset.is_available?'Local':'Referencia';const pathLabel=stored?`Almacenamiento privado · ${asset.folder || asset.section}`:asset.rel_path;return <article className="vc-library-card" key={asset.id}><MarketingAssetPreview asset={asset}/><div className="vc-library-info"><b title={asset.filename}>{asset.filename}</b><span>{asset.section || 'Sección pendiente'}{asset.folder ? ` · ${asset.folder}` : ''}</span><small>{Math.max(1,Math.round((asset.size_bytes || 0)/1024))} KB · {asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Dimensiones pendientes'}{asset.retention_enabled && asset.retention_months ? ` · Retención ${asset.retention_months} ${asset.retention_months===1?'mes':'meses'}` : ''}</small></div><span className={`vc-library-availability ${asset.is_available ? 'is-available' : ''}`} title={deleted?'El archivo central se eliminó por el plazo configurado; la ficha y la ruta se conservan':stored?'Guardado en el almacenamiento privado de la suite':asset.storage_status==='local_reference'?'Referencia a ruta de Visual Corp':asset.storage_status==='upload_failed'?'La ruta está indexada, pero falta completar la carga':asset.is_available?'Disponible en la biblioteca local':'La ruta se conserva como referencia'}><i/>{sourceLabel}</span><div className="vc-library-path"><code title={asset.rel_path}>{pathLabel}</code><button type="button" aria-label={`Copiar ruta de ${asset.filename}`} onClick={() => void copyAssetPath(asset.rel_path)}><Copy size={13}/></button></div></article>})}</div><p className="vc-content-footnote">Las imágenes vinculadas se eliminan del almacenamiento central al vencer su retención; sus fichas de índice quedan visibles. Las rutas locales conservan intactos los originales de Visual Corp.</p></>}
      </>}

      {activeSection === 'strategy' && <section className="vc-strategy-section"><div className="vc-content-toolbar vc-content-toolbar-inline"><div><span className="vc-content-section-icon"><Target size={16}/></span><div><b>FODA y decisiones estratégicas</b><small>{data.strategy.length} observaciones con su evidencia y estado</small></div></div></div>{loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando estrategia…</div> : <div className="vc-strategy-grid">{['fortaleza','debilidad','oportunidad','amenaza'].map((category) => {const items=data.strategy.filter((item)=>item.category.toLocaleLowerCase('es')===category);return <section className={`vc-strategy-column is-${category}`} key={category}><header><span>{category==='fortaleza'?'F':category==='debilidad'?'D':category==='oportunidad'?'O':'A'}</span><div><b>{category[0].toLocaleUpperCase('es')+category.slice(1)}</b><small>{items.length} registros</small></div></header>{items.map((item)=><article key={item.id}><b>{item.title}</b><p>{item.detail}</p><div><span>{item.evidence}</span><StageBadge stage={item.status}/></div>{item.owner&&<small>Responsable histórico: {item.owner}</small>}</article>)}</section>})}</div>}</section>}

      {activeSection === 'operations' && <section className="vc-ops-section"><div className="vc-content-toolbar vc-content-toolbar-inline"><div><span className="vc-content-section-icon"><CheckCircle2 size={16}/></span><div><b>Trabajo y responsabilidades</b><small>Órdenes importadas con fechas, próximos pasos e historial</small></div></div></div>{loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando tareas…</div> : <div className="vc-ops-grid">{data.work.length ? data.work.map((item) => {const events=data.history.filter((event)=>event.source_work_item_id===item.source_id);return <article className="vc-ops-card" key={item.id}><div className="vc-ops-card-top"><span>{item.process_area}</span><StageBadge stage={item.stage}/></div><h3>{item.title}</h3><p>{item.next_action || item.notes || 'Siguiente paso pendiente.'}</p><div className="vc-ops-meta"><span><CalendarDays size={13}/>{item.due_date ? formatDate(item.due_date) : 'Sin fecha límite'}</span><span><Activity size={13}/>{events.length} cambios</span><span className={item.priority==='Alta'?'is-priority':''}>{item.priority}</span></div>{item.blocked_reason&&<div className="vc-ops-blocked"><AlertCircle size={14}/>{item.blocked_reason}</div>}</article>}) : <EmptyState icon={CheckCircle2} title="No hay tareas importadas" text="Las próximas tareas de marketing pueden registrarse aquí con responsable, fecha y próximo paso."/>}</div>}</section>}

      {activeSection === 'results' && <section className="vc-results-section"><div className="vc-content-toolbar vc-content-toolbar-inline"><div><span className="vc-content-section-icon"><TrendingUp size={16}/></span><div><b>Resultados con contexto</b><small>Observaciones de publicaciones y resumen histórico agregado</small></div></div></div>{loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando resultados…</div> : <><div className="vc-results-top-grid"><article className="vc-results-card is-sales"><span className="eyebrow">RESUMEN HISTÓRICO · VENTAS</span><strong>{formatMoney(currentSnapshot?.amount)}</strong><p>{Number(currentSnapshot?.sales)||0} operaciones · promedio {formatMoney(currentSnapshot?.average)} por venta</p><small>{currentSnapshot?.date_from&&currentSnapshot?.date_to?`${formatDate(currentSnapshot.date_from)} — ${formatDate(currentSnapshot.date_to)}`:'Rango histórico por confirmar'} · Fuente: resumen importado de Tracking</small><div className="vc-results-tags"><span>Agregado</span><span>Sin atribución a campaña</span><span>Sin costos fiables</span></div></article><article className="vc-results-card"><span className="eyebrow">EMBUDO COMERCIAL</span><strong>{data.leads.length}</strong><p>oportunidades con seguimiento</p><small>{data.leads.length?'Los registros permanecen vinculados a su referencia interna.':'El módulo está preparado; la base original no tenía oportunidades registradas.'}</small></article></div><div className="vc-results-posts"><div className="vc-content-side-heading"><div><span className="eyebrow">DESEMPEÑO REGISTRADO</span><h3>Publicaciones con métricas</h3></div><span className="vc-results-count">{metricPosts.length}</span></div>{metricPosts.length ? metricPosts.map((post)=><article key={post.id}><div><b>{post.title}</b><span>{post.platform} · {post.status}</span></div><div><strong>{Number(post.reach).toLocaleString('es-EC')}</strong><small>alcance</small><strong>{Number(post.interactions).toLocaleString('es-EC')}</strong><small>interacciones</small><strong>{Number(post.clicks).toLocaleString('es-EC')}</strong><small>clics</small><strong>{Number(post.leads).toLocaleString('es-EC')}</strong><small>leads informados</small></div></article>) : <EmptyState icon={BarChart3} title="Aún no hay métricas de publicaciones" text="Registra resultados cuando la plataforma y el periodo de medición estén confirmados."/>}</div><p className="vc-content-footnote">El resumen de ventas cubre una copia histórica de una semana de agosto de 2026. No incluye una dimensión fiable de cliente ni costos; no mide rentabilidad ni atribuye ventas a publicaciones. El alcance, interacciones, clics y leads de cada publicación se muestran como valores informados en Tracking.</p></>}</section>}

      <footer className="vc-content-source"><span><CheckCircle2 size={15}/></span><p><b>Base central conectada · Visual Corp</b><small>Datos copiados desde Tracking con sus IDs y relaciones. Los cambios que hagas aquí quedan en la suite y se registran en el historial.</small></p><span className="vc-content-source-tag">{data.assets.length.toLocaleString('es-EC')} archivos catalogados</span></footer>
    </main>

    {notice&&<div className="vc-content-toast" role="status"><CheckCircle2 size={16}/>{notice}</div>}
    {modalOpen&&<div className="vc-content-modal-scrim" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget){setSelectedPost(null);setModalOpen(false)}}}><section className="vc-content-modal vc-content-modal-editor" role="dialog" aria-modal="true" aria-labelledby="vc-post-modal-title"><header><div><span className="eyebrow">{isNew?'NUEVA FICHA':'FICHA DE PUBLICACIÓN'}</span><h2 id="vc-post-modal-title">{isNew?'Planifica una publicación':'Edita la publicación'}</h2><p>{draft.title || 'Organiza el mensaje, el calendario y la producción desde una sola ficha.'}</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={()=>{setSelectedPost(null);setModalOpen(false)}}><X size={18}/></button></header><form onSubmit={savePost}><PublicationEditorSections key={draftTabKey} draft={draft} onChange={(field,value)=>setDraft((current)=>({...current,[field]:value}))} canEdit={canEdit} isNew={isNew} activeTab={editorTab} onTabChange={setEditorTab} selectedPost={selectedPost} checklistFields={checklistFields} events={selectedEvents} formatDate={formatDate}/><div className="vc-content-modal-actions"><span>{canEdit?'La ficha se guarda en el calendario central.':'Tu perfil tiene acceso de solo lectura.'}</span><button type="button" className="button button-outline" onClick={()=>{setSelectedPost(null);setModalOpen(false)}}>Cerrar</button>{canEdit&&<button type="submit" className="button button-dark" disabled={saving}>{saving?<LoaderCircle className="vc-content-spin" size={15}/>:<Save size={15}/>} {saving?'Guardando…':'Guardar ficha'}</button>}</div></form></section></div>}
  </AppFrame>;
}
