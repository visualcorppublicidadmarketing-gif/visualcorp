import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Check,
  CheckCircle2, Clock3, Copy, FileImage, FileText, Filter, FolderOpen, Images, Lightbulb,
  LoaderCircle, Megaphone, Plus, RefreshCw, Search, Save, Sparkles, Target, TrendingUp, X,
  Trash2, LayoutGrid, List, Pencil, CopyPlus, Film,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { AnimatedList } from '../../components/ui/MagicComponents';
import { ContextMenu, type ContextMenuAction } from '../../components/ui/ContextMenu';
import { EmptyState, StageBadge } from '../../components/feedback';
import { supabase } from '../../lib/supabaseClient';
import { MarketingCalendar, MarketingReadinessIndicators } from './marketing/MarketingCalendar';
import { MarketingPostArtwork, type MarketingArtworkAsset } from './marketing/MarketingPostArtwork';
import { MarketingAssetIntake } from './marketing/MarketingAssetIntake';
import { MarketingAssetPreview } from './marketing/MarketingAssetPreview';
import './marketing/campaign-post-cards.css';
import './marketing/marketing-insights.css';
import './marketing/marketing-interface-polish.css';
import { DEFAULT_MARKETING_TAGS, PublicationEditorSections, type PublicationDraft, type PublicationEditorTab } from './marketing/PublicationEditorSections';
import { getMarketingCalendarColor, getMarketingTags, MARKETING_COLORS } from './marketing/marketingColors';
import { isTerminalMarketingStatus, marketingDateKey } from './marketing/marketingScheduleRules';
import { WorkflowToolbar, WorkDetails, ReviewPanel, DateProposal, NonproductionSettings, BulkAssignment } from './marketing/MarketingWorkboard';
import { CHECKLIST_STATES, DELIVERABLES, compareWork, isMonthlyPlan, isPublication, matchesQueue, publicationWarnings, type Assignee, type MarketingReview, type NonproductionDay, type WorkQueue, type RecordFilter } from './marketing/marketingWorkflow';
import { saveMarketingPost } from './marketing/marketingWorkflowApi';

type Post = Record<string, any> & { id: string; title: string; status: string; scheduled_date: string; platform: string };
type Asset = Record<string, any> & { id: string; filename: string; rel_path: string; section: string; is_available: boolean; storage_status?: string; retention_enabled?: boolean; retention_months?: number };
type Section = 'overview' | 'calendar' | 'library' | 'strategy' | 'operations' | 'results';
type WorkspaceData = { posts: Post[]; assets: Asset[]; postAssets: any[]; strategy: any[]; work: any[]; history: any[]; leads: any[]; sales: any[]; events: any[]; reviews: MarketingReview[]; days: NonproductionDay[]; assignees: Assignee[] };

const emptyData: WorkspaceData = { posts: [], assets: [], postAssets: [], strategy: [], work: [], history: [], leads: [], sales: [], events: [], reviews: [], days: [], assignees: [] };
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
const defaultDraft = (scheduledDate = ''): PublicationDraft => ({ title: '', content_line: '', platform: 'Instagram', format: 'Post', scheduled_date: scheduledDate, scheduled_time: '', owner: '', owner_user_id: '', record_kind: 'publication', blocked_reason: '', cover_status: 'Por confirmar', art_status: 'Por confirmar', caption_status: 'Por confirmar', video_status: 'Por confirmar', voiceover_status: 'Por confirmar', tiktok_status: 'Por confirmar', status: 'Por iniciar', caption: '', next_action: '', due_date: '', objective: '', audience: '', offer: '', call_in: '', callout: '', cta: '', cta_destination: '', external_url: '', hashtags: '', visual_direction: '', tags: '', calendar_color: '', design_ready: false, video_ready: false, canvas_width: '', canvas_height: '' });

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
  const { organizationId, hasPermission, user } = useAuth();
  const canView = hasPermission('marketing', 'view');
  const canEdit = hasPermission('marketing', 'edit');
  const canDelete = hasPermission('marketing', 'delete_records');
  const canApprove = canEdit && hasPermission('marketing', 'approve_content');
  const [queue, setQueue] = useState<WorkQueue>('all');
  const [recordFilter, setRecordFilter] = useState<RecordFilter>('publications');
  const [reviewPost, setReviewPost] = useState<Post|null>(null);
  const [proposal, setProposal] = useState<{post:Post; date?:string}|null>(null);
  const [showDays, setShowDays] = useState(false);
  const [bulkReport, setBulkReport] = useState<string[]>([]);
  const editorDirty = React.useRef(false);
  const creationKey = React.useRef(globalThis.crypto.randomUUID());
  const today = marketingDateKey();
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos los estados');
  const [tagFilter, setTagFilter] = useState('Todas las etiquetas');
  const [assetFilter, setAssetFilter] = useState('Todos los archivos');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const editorDialogRef = React.useRef<HTMLElement | null>(null);
  const previousEditorFocusRef = React.useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState(defaultDraft);
  const [draftArtworkFile, setDraftArtworkFile] = useState<File | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draftTabKey, setDraftTabKey] = useState(0);
  const [editorTab, setEditorTab] = useState<PublicationEditorTab>('plan');
  const [postView, setPostView] = useState<'cards' | 'table'>('cards');
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [posts, assets, postAssets, strategy, work, history, leads, sales, events, reviews, days, assigneeResult] = await Promise.all([
        readAll('marketing_posts', organizationId, 'scheduled_date'),
        readAll('marketing_assets', organizationId, 'filename'),
        readAll('marketing_post_assets', organizationId, 'created_at'),
        readAll('marketing_strategy_items', organizationId, 'category'),
        readAll('marketing_work_items', organizationId, 'due_date'),
        readAll('marketing_work_item_history', organizationId, 'created_at'),
        readAll('marketing_lead_tracking', organizationId, 'created_at'),
        readAll('marketing_sales_snapshots', organizationId, 'imported_at'),
        readAll('marketing_post_events', organizationId, 'created_at'),
        readAll('marketing_reviews', organizationId, 'created_at'),
        readAll('marketing_nonproduction_days', organizationId, 'day'),
        supabase.rpc('list_marketing_assignees', { p_organization_id: organizationId }),
      ]);
      if (assigneeResult.error) throw assigneeResult.error;
      const workspace = { posts, assets, postAssets, strategy, work, history, leads, sales, events, reviews, days, assignees: assigneeResult.data || [] };
      setData(workspace);
      return workspace;
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
    if (!modalOpen) {
      if (previousEditorFocusRef.current?.isConnected) previousEditorFocusRef.current.focus();
      return undefined;
    }
    const dialog = editorDialogRef.current;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closePostEditor(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', closeOnEscape);
    dialog?.querySelector<HTMLElement>('[autofocus]')?.focus();
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      if (previousEditorFocusRef.current?.isConnected) previousEditorFocusRef.current.focus();
    };
  }, [modalOpen]);

  const statuses = useMemo(() => ['Todos los estados', ...new Set(data.posts.map((post) => post.status).filter(Boolean).sort())], [data.posts]);
  const knownTags = useMemo(() => [...new Set([...DEFAULT_MARKETING_TAGS, ...data.posts.flatMap((post) => getMarketingTags(post.tags))])].sort(), [data.posts]);
  const filteredPosts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('es');
    return data.posts.filter((post) => {
      const matchesSearch = !search || [post.title, post.content_line, post.platform, post.owner, post.caption, post.status].some((field) => String(field || '').toLocaleLowerCase('es').includes(search));
      const kindMatches = recordFilter === 'monthly_plans' ? isMonthlyPlan(post) : recordFilter === 'ideas' ? !isMonthlyPlan(post) && !post.title.trim() : isPublication(post);
      return kindMatches && (recordFilter !== 'publications' || matchesQueue(post,queue,today,user?.id,data.reviews)) && matchesSearch && (statusFilter === 'Todos los estados' || post.status === statusFilter)
        && (tagFilter === 'Todas las etiquetas' || getMarketingTags(post.tags).includes(tagFilter));
    }).sort((a,b) => compareWork(a,b,today));
  }, [data.posts, query, statusFilter, tagFilter, recordFilter, queue, today, user?.id, data.reviews]);

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
  const artworkByPost = useMemo(() => {
    const assetsById = new Map<string, Asset>(data.assets.map((asset) => [asset.id, asset]));
    const newestLinks = [...data.postAssets].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const result = new Map<string, MarketingArtworkAsset>();
    const imageExtensions = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp']);
    for (const link of newestLinks) {
      if (result.has(link.post_id)) continue;
      const asset = assetsById.get(link.asset_id);
      const extension = String(asset?.extension || asset?.filename?.split('.').pop() || '').replace(/^\./, '').toLowerCase();
      if (!asset || !imageExtensions.has(extension) || asset.storage_status !== 'supabase_storage' || !asset.rel_path.startsWith('storage://marketing-assets/')) continue;
      result.set(link.post_id, asset);
    }
    return result;
  }, [data.assets, data.postAssets]);

  const publications = data.posts.filter(isPublication);
  const materialsFor = (post: Post) => data.postAssets.filter(link=>link.post_id===post.id).map(link=>data.assets.find(asset=>asset.id===link.asset_id)).filter(Boolean);
  const confirmStatus = (post:Post,status:string) => {
    if (!/programad|publicad/i.test(status)) return true;
    const missing = publicationWarnings(post,data.reviews,materialsFor(post));
    return !missing.length || window.confirm(`La pieza tiene datos pendientes:\n${missing.join('\n')}\n¿Confirmas el registro como ${status}? Esto no publica en redes ni crea una aprobación.`);
  };
  const published = publications.filter((post) => /publicad/i.test(post.status || '')).length;
  const overdue = publications.filter(post=>matchesQueue(post,'overdue',today)).length;
  const inProduction = publications.filter((post) => !isTerminalMarketingStatus(post.status)).length;
  const linkedAssets = new Set(data.postAssets.map((link) => link.asset_id)).size;
  const linkedPosts = new Set(data.postAssets.map((link) => link.post_id)).size;
  const currentSnapshot = data.sales.at(-1)?.data_json;
  const metricPosts = data.posts.filter((post) => Number(post.reach) || Number(post.interactions) || Number(post.clicks) || Number(post.leads));
  const trackedReach = metricPosts.reduce((sum, post) => sum + (Number(post.reach) || 0), 0);
  const trackedInteractions = metricPosts.reduce((sum, post) => sum + (Number(post.interactions) || 0), 0);
  const trackedClicks = metricPosts.reduce((sum, post) => sum + (Number(post.clicks) || 0), 0);
  const trackedLeads = metricPosts.reduce((sum, post) => sum + (Number(post.leads) || 0), 0);
  const activeWork = data.work.filter((item) => !/complet|terminad|cerrad|cancelad/i.test(String(item.stage || '')));
  const overdueWork = activeWork.filter((item) => item.due_date && item.due_date < today).length;
  const blockedWork = activeWork.filter((item) => item.blocked_reason || /bloque/i.test(String(item.stage || ''))).length;
  const strategyCategories = new Set(data.strategy.map((item) => String(item.category || '').toLocaleLowerCase('es')).filter(Boolean)).size;
  const selectedEvents = selectedPost ? data.events.filter((event) => event.post_id === selectedPost.id).slice(-8).reverse() : [];
  const hasEditorArtwork = isNew ? Boolean(draftArtworkFile) : Boolean(selectedPost && artworkByPost.get(selectedPost.id));
  const publishedMissingItems = /publicad/i.test(draft.status) ? [!draft.scheduled_time ? 'hora' : '', !draft.owner ? 'responsable' : '', !hasEditorArtwork ? 'imagen' : ''].filter(Boolean) : [];

  const closePostEditor = () => {
    if (saving || (editorDirty.current && !window.confirm('¿Cerrar y descartar los cambios sin guardar?'))) return;
    editorDirty.current = false;
    setDraftArtworkFile(null);
    setSelectedPost(null);
    setModalOpen(false);
  };

  const openPost = (post?: Post, scheduledDate = '') => {
    if (modalOpen && editorDirty.current && !window.confirm('¿Descartar los cambios y abrir otra ficha?')) return;
    editorDirty.current = false;
    previousEditorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraftArtworkFile(null);
    setModalOpen(true);
    setDraftTabKey((current) => current + 1);
    setEditorTab('plan');
    if(!post)creationKey.current=globalThis.crypto.randomUUID();
    setIsNew(!post);
    setSelectedPost(post || null);
    setDraft(post ? {
      title: post.title || '', content_line: post.content_line || '', platform: post.platform || 'Instagram',
      format: post.format || 'Post', scheduled_date: post.scheduled_date || '', scheduled_time: post.scheduled_time || '',
      owner: post.owner || '', owner_user_id: post.owner_user_id || '', record_kind: post.record_kind || 'publication', blocked_reason: post.blocked_reason || '',
      ...Object.fromEntries(DELIVERABLES.map(([key])=>[key,CHECKLIST_STATES.includes(post[key])?post[key]:'Por confirmar'])) as Pick<PublicationDraft,'cover_status'|'art_status'|'caption_status'|'video_status'|'voiceover_status'|'tiktok_status'>, status: post.status || 'Por iniciar', caption: post.caption || '',
      next_action: post.next_action || '', due_date: post.due_date || '',
      objective: post.objective || '', audience: post.audience || '', offer: post.offer || '',
      call_in: post.call_in || '', callout: post.callout || '', cta: post.cta || '',
      cta_destination: post.cta_destination || '', external_url: post.external_url || '',
      hashtags: post.hashtags || '', visual_direction: post.visual_direction || '',
      tags: getMarketingTags(post.tags).join(', '), calendar_color: getMarketingCalendarColor(post.calendar_color, post.tags),
      design_ready: post.design_ready === true, video_ready: post.video_ready === true,
      canvas_width: post.canvas_width == null ? '' : String(post.canvas_width), canvas_height: post.canvas_height == null ? '' : String(post.canvas_height),
    } : defaultDraft(scheduledDate));
  };
  const reschedulePost = (post:Post,date?:string) => { if(canEdit) setProposal({post,date}); };
  const changePostStatus = async (post: Post, status: string) => {
    if (!supabase || !organizationId || !canEdit || !status || status === post.status) return;
    if (/^aprobad[ao]$/i.test(status)) { setReviewPost(post); return; }
    if (!confirmStatus(post,status)) return;
    setSaving(true);
    try {
      await saveMarketingPost(organizationId,post,{status});
      setNotice(`Etapa de “${post.title}” actualizada a ${status}.`);
      await refresh();
    } catch (error: any) {
      setLoadError(error?.message || 'No se pudo cambiar la etapa de la publicación.');
    } finally { setSaving(false); }
  };
  const changePostReadiness = async (post: Post, field: 'design_ready' | 'video_ready', checked: boolean) => {
    if (!supabase || !organizationId || !canEdit || post[field] === checked) return;
    setSaving(true);
    try {
      await saveMarketingPost(organizationId,post,{ [field]: checked, [field==='design_ready'?'art_status':'video_status']: checked?'Sí':'No' });
      setNotice(`${field === 'design_ready' ? 'Diseño' : 'Vídeo'} de “${post.title}” marcado como ${checked ? 'listo' : 'pendiente'}.`);
      await refresh();
    } catch (error: any) {
      setLoadError(error?.message || 'No se pudo actualizar el checklist de producción.');
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
    if ((draft.canvas_width === '') !== (draft.canvas_height === '')) {
      setEditorTab('plan');
      setNotice('Completa el ancho y el alto de la pieza, o deja ambas medidas vacías.');
      return;
    }
    const canvasWidth = draft.canvas_width === '' ? null : Number(draft.canvas_width);
    const canvasHeight = draft.canvas_height === '' ? null : Number(draft.canvas_height);
    if ((canvasWidth !== null && (!Number.isInteger(canvasWidth) || canvasWidth < 1 || canvasWidth > 20000)) || (canvasHeight !== null && (!Number.isInteger(canvasHeight) || canvasHeight < 1 || canvasHeight > 20000))) {
      setEditorTab('plan');
      setNotice('Las medidas deben ser números enteros entre 1 y 20 000 píxeles.');
      return;
    }
    setSaving(true);
    setLoadError('');
    try {
      const creating = isNew;
      const { canvas_width: _canvasWidth, canvas_height: _canvasHeight, owner: _historicalOwner, owner_user_id: ownerId, ...draftFields } = draft;
      const fields = { ...draftFields, canvas_width: canvasWidth, canvas_height: canvasHeight, calendar_color: getMarketingCalendarColor(draft.calendar_color, []), title: draft.title.trim(), tags: [...new Set(getMarketingTags(draft.tags.split(',')))], ...((ownerId||null)!==(selectedPost?.owner_user_id||null)?{owner_user_id:ownerId||null}:{}) };
      if (!confirmStatus({ ...selectedPost, ...fields } as Post,draft.status)) return;
      const saved = await saveMarketingPost(organizationId,creating?null:selectedPost,fields,creating?creationKey.current:undefined);
      if(creating&&Object.entries(fields).some(([key,value])=>JSON.stringify(saved[key])!==JSON.stringify(value))){setSelectedPost(saved as Post);setIsNew(false);setNotice('Recuperamos la ficha creada en el intento anterior. Revisa tus cambios antes de volver a guardar.');await refresh();return;}
      editorDirty.current=false;
      if (draftArtworkFile) {
        setSelectedPost(saved as Post);
        setIsNew(false);
        setNotice(creating ? 'Ficha creada. La imagen está lista para subir y vincular.' : 'Ficha guardada. La imagen queda lista para subir y vincular.');
        await refresh();
        return;
      }
      setSelectedPost(null);
      setModalOpen(false);
      setNotice(creating ? 'Publicación creada en el calendario central.' : 'Publicación actualizada y cambio registrado.');
      await refresh();
    } catch (error: any) {
      setLoadError(error?.message || 'No se pudo guardar la publicación.');
    } finally {
      setSaving(false);
    }
  };

  const togglePost = (postId: string) => setSelectedPostIds((current) => { const next = new Set(current); next.has(postId) ? next.delete(postId) : next.add(postId); return next; });
  const selectVisiblePosts = () => setSelectedPostIds((current) => { const allVisible = filteredPosts.every((post) => current.has(post.id)); const next = new Set(current); filteredPosts.forEach((post) => allVisible ? next.delete(post.id) : next.add(post.id)); return next; });
  const deletePosts = async (posts: Post[]) => {
    if (!canDelete || !supabase || !organizationId || !posts.length) return;
    const noun = posts.length === 1 ? `“${posts[0].title}”` : `${posts.length} publicaciones seleccionadas`;
    if (!window.confirm(`¿Eliminar ${noun} permanentemente? Se quitarán del calendario y sus piezas vinculadas. Los leads conservan su registro y se desvinculan de la publicación.`)) return;
    setSaving(true);
    try {
      const { data: deleted, error } = await supabase.from('marketing_posts').delete().eq('organization_id', organizationId).in('id', posts.map((post) => post.id)).select('id');
      if (error) throw error;
      const deletedIds = new Set((deleted || []).map((row) => row.id));
      if (!deletedIds.size) throw new Error('No se eliminó ninguna publicación. Revisa el permiso Eliminar en Marketing.');
      setSelectedPostIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
      if (selectedPost && deletedIds.has(selectedPost.id)) closePostEditor();
      setNotice(`${deletedIds.size} publicación${deletedIds.size === 1 ? '' : 'es'} eliminada${deletedIds.size === 1 ? '' : 's'}.`);
      await refresh();
    } catch (error: any) { setLoadError(error?.message || 'No se pudieron eliminar las publicaciones.'); }
    finally { setSaving(false); }
  };
  const duplicatePost = async (post: Post) => {
    if (!canEdit || !supabase || !organizationId) return;
    try {
      const copy=Object.fromEntries(Object.keys(defaultDraft()).filter(key=>!['owner','owner_user_id'].includes(key)).map(key=>[key,post[key] ?? defaultDraft()[key]]));
      await saveMarketingPost(organizationId,null,{...copy,title:`${post.title||'Publicación'} (copia)`.slice(0,180),status:'Por iniciar',scheduled_date:'',scheduled_time:'',canvas_width:post.canvas_width||null,canvas_height:post.canvas_height||null,...Object.fromEntries(DELIVERABLES.map(([key])=>[key,'Por confirmar'])),design_ready:false,video_ready:false});
    } catch(error:any) { setLoadError(error.message); return; }
    setNotice('Copia creada como borrador sin fecha ni métricas.');
    await refresh();
  };
  const assignSelected = async (ownerId:string) => {
    if(!canEdit||!organizationId)return;
    setSaving(true);const report:string[]=[];const successful=new Set<string>();
    for(const post of data.posts.filter(p=>selectedPostIds.has(p.id))){
      try{await saveMarketingPost(organizationId,post,{owner_user_id:ownerId});report.push(`${post.title||'Sin título'}: asignada`);successful.add(post.id);}
      catch(error:any){report.push(`${post.title||'Sin título'}: ${error.message}`);}
    }
    setBulkReport(report);setSelectedPostIds(current=>new Set([...current].filter(id=>!successful.has(id))));await refresh();setSaving(false);
  };
  const postActions = (post: Post): ContextMenuAction[] => [
    { kind: 'label', label: 'Publicación', onSelect: () => {} },
    { label: 'Revisar pieza', icon: <CheckCircle2 size={14}/>, onSelect: () => setReviewPost(post), disabled: !isPublication(post) },
    { label: 'Proponer nueva fecha', icon: <CalendarDays size={14}/>, onSelect: () => reschedulePost(post), disabled: !canEdit },
    { label: 'Editar ficha', icon: <Pencil size={14}/>, onSelect: () => openPost(post), disabled: !canEdit },
    { label: 'Duplicar como borrador', icon: <CopyPlus size={14}/>, onSelect: () => void duplicatePost(post), disabled: !canEdit },
    { label: selectedPostIds.has(post.id) ? 'Quitar de seleccionadas' : 'Seleccionar publicación', icon: <Check size={14}/>, kind: 'checkbox', checked: selectedPostIds.has(post.id), onSelect: () => {}, onCheckedChange: () => togglePost(post.id), disabled: !(canEdit || canDelete) },
    { label: post.design_ready ? 'Diseño listo' : 'Marcar diseño listo', group: 'Producción', icon: <FileImage size={14}/>, kind: 'checkbox', checked: post.design_ready === true, onSelect: () => {}, onCheckedChange: (checked) => void changePostReadiness(post, 'design_ready', checked), disabled: !canEdit },
    { label: post.video_ready ? 'Vídeo listo' : 'Marcar vídeo listo', group: 'Producción', icon: <Film size={14}/>, kind: 'checkbox', checked: post.video_ready === true, onSelect: () => {}, onCheckedChange: (checked) => void changePostReadiness(post, 'video_ready', checked), disabled: !canEdit },
    { label: 'Abrir calendario editorial', icon: <CalendarDays size={14}/>, onSelect: () => setActiveSection('calendar') },
    { kind: 'separator', label: '', onSelect: () => {} },
    { label: 'Eliminar publicación', icon: <Trash2 size={14}/>, onSelect: () => void deletePosts([post]), destructive: true, disabled: !canDelete },
  ];

  const sectionTitle = sections.find((section) => section.id === activeSection)?.label || 'Resumen';
  const searchPlaceholder = activeSection === 'library' ? 'Buscar por archivo, carpeta o sección…' : 'Buscar publicaciones por tema, canal o responsable…';

  return <AppFrame area={area}>
    <PageHeading eyebrow="MARKETING · CENTRO DE CONTENIDO" title="Marketing y contenido" description="Planifica, produce y revisa publicaciones, piezas, tareas y resultados en el espacio compartido de Visual Corp." action={<div className="vc-content-actions"><button className="button button-outline" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'vc-content-spin' : ''}/>Actualizar</button>{canEdit && <button className="button button-outline" type="button" onClick={()=>setShowDays(true)}>Días sin producción</button>}{canEdit && <button className="button button-dark vc-shimmer-button" type="button" onClick={() => openPost()}><Plus size={16}/>Nueva publicación</button>}</div>} />

    <main className="vc-content-workspace" aria-label="Centro de gestión de marketing">
      <section className="vc-content-hero">
        <div className="vc-content-hero-glow" aria-hidden="true" />
        <div className="vc-content-hero-copy"><span className="vc-content-brand"><span><Sparkles size={16}/></span> VISUAL CONTENT STUDIO <i>·</i> ESPACIO CENTRAL</span><h2>Tu equipo, tus piezas,<br/><em>el siguiente paso claro.</em></h2><p>El calendario y los registros de Tracking ya viven en la suite, con acceso por perfil, biblioteca catalogada y seguimiento de cambios.</p></div>
        <div className="vc-content-hero-stat"><span><Megaphone size={17}/></span><strong>{data.posts.length}</strong><small>registros centralizados</small><div className="vc-content-sparkline" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div>
      </section>

      {!supabase && <div className="vc-content-alert"><AlertCircle size={18}/><div><b>Falta conectar la suite a su base de datos</b><span>La biblioteca migrada está en Supabase; configura la conexión del entorno para cargarla.</span></div></div>}
      {!organizationId && supabase && !loading && <div className="vc-content-alert"><AlertCircle size={18}/><div><b>Tu cuenta aún no tiene una organización activa</b><span>Solicita que administración vincule tu perfil de acceso de Visual Corp.</span></div></div>}
      {!canView && organizationId && !loading && <div className="vc-content-alert"><AlertCircle size={18}/><div><b>Tu perfil no tiene acceso a Marketing</b><span>El contenido se protege con los permisos de tu organización.</span></div></div>}
      {loadError && <div className="vc-content-alert is-error"><AlertCircle size={18}/><div><b>No se pudo completar la carga</b><span>{loadError}</span></div><button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Reintentar"><RefreshCw size={16}/></button></div>}

      <section className="vc-content-kpis" aria-label="Estado del contenido">
        <article className="vc-content-kpi"><span className="is-purple"><FileText size={17}/></span><div><small>En producción</small><strong>{loading ? '—' : inProduction}</strong><em>publicaciones activas</em></div><ArrowUpRight size={15}/></article>
        <article className="vc-content-kpi"><span className="is-teal"><CheckCircle2 size={17}/></span><div><small>Publicadas</small><strong>{loading ? '—' : published}</strong><em>en el registro histórico</em></div><ArrowUpRight size={15}/></article>
        <article className="vc-content-kpi"><span className="is-amber"><Clock3 size={17}/></span><div><small>Requieren atención</small><strong>{loading ? '—' : overdue}</strong><em>producción o publicación pendientes</em></div><ArrowDownRight size={15}/></article>
        <article className="vc-content-kpi"><span className="is-blue"><Images size={17}/></span><div><small>Biblioteca vinculada</small><strong>{loading ? '—' : linkedAssets}</strong><em>{linkedPosts} publicaciones con piezas</em></div><ArrowUpRight size={15}/></article>
      </section>

      <nav className="vc-content-tabs" aria-label="Áreas de marketing">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeSection === id ? 'is-active' : ''} onClick={() => { setActiveSection(id); setQuery(''); }} aria-current={activeSection === id ? 'page' : undefined}><Icon size={16}/>{label}{id === 'calendar' && <span>{data.posts.length}</span>}{id === 'library' && <span>{data.assets.length}</span>}</button>)}
      </nav>

      {(activeSection === 'overview'||activeSection === 'calendar')&&<WorkflowToolbar posts={data.posts} today={today} userId={user?.id} queue={queue} onQueue={setQueue} recordFilter={recordFilter} onRecordFilter={setRecordFilter} reviews={data.reviews}/>}
      {bulkReport.length>0&&<div className="mk-bulk-report" role="status"><b>Resultado de asignación</b><ul>{bulkReport.map((message,i)=><li key={i}>{message}</li>)}</ul><button type="button" onClick={()=>setBulkReport([])}>Cerrar resultado</button></div>}
      {(activeSection === 'overview' || activeSection === 'calendar' || activeSection === 'library') && <div className="vc-content-toolbar"><div><span className="vc-content-section-icon"><FolderOpen size={16}/></span><div><b>{activeSection === 'overview' ? 'Flujo editorial' : sectionTitle}</b><small>{activeSection === 'library' ? `${data.assets.length} recursos catalogados · ${linkedAssets} vinculados` : `${filteredPosts.length} registros visibles · ${publications.length} publicaciones · ${data.posts.filter(isMonthlyPlan).length} planes`}</small></div></div><label className="vc-content-search"><Search size={15}/><input aria-label="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder}/></label><label className="vc-content-filter"><Filter size={14}/><select aria-label="Filtrar resultados" value={activeSection === 'library' ? assetFilter : statusFilter} onChange={(event) => activeSection === 'library' ? setAssetFilter(event.target.value) : setStatusFilter(event.target.value)}>{activeSection === 'library' ? <><option>Todos los archivos</option><option>Disponibles en el equipo</option><option>Solo referencia de ruta</option><option>Eliminados por plazo</option></> : statuses.map((status) => <option key={status}>{status}</option>)}</select></label>{activeSection !== 'library' && <label className="vc-content-filter vc-marketing-tag-filter"><Filter size={14}/><select aria-label="Filtrar por etiqueta" value={tagFilter} onChange={(event)=>setTagFilter(event.target.value)}><option>Todas las etiquetas</option>{knownTags.map((tag)=><option key={tag}>{tag}</option>)}</select></label>}{activeSection === 'overview' && <div className="vc-marketing-view-toggle" aria-label="Modo de publicaciones"><button type="button" aria-pressed={postView==='cards'} className={postView==='cards'?'active':''} onClick={()=>setPostView('cards')}><LayoutGrid size={14}/>Tarjetas</button><button type="button" aria-pressed={postView==='table'} className={postView==='table'?'active':''} onClick={()=>setPostView('table')}><List size={14}/>Tabla</button></div>}</div>}

      {(activeSection === 'overview' || activeSection === 'calendar') && (canEdit||canDelete) && <div className="vc-marketing-bulk-bar"><label><input type="checkbox" checked={filteredPosts.length > 0 && filteredPosts.every((post)=>selectedPostIds.has(post.id))} onChange={selectVisiblePosts}/> Seleccionar publicaciones visibles</label>{selectedPostIds.size > 0 && <><span>{selectedPostIds.size} seleccionadas</span>{canEdit&&<BulkAssignment assignees={data.assignees} busy={saving} onAssign={id=>void assignSelected(id)}/>}<button type="button" className="vc-small-danger" disabled={!canDelete||saving} title={!canDelete?"El perfil requiere permiso para eliminar publicaciones":undefined} onClick={()=>void deletePosts(data.posts.filter((post)=>selectedPostIds.has(post.id)))}><Trash2 size={13}/>Eliminar seleccionadas</button><button type="button" onClick={()=>setSelectedPostIds(new Set())}>Quitar selección</button></>}</div>}

      {activeSection === 'calendar' && <MarketingCalendar posts={filteredPosts} organizationId={organizationId || ''} artworkByPost={artworkByPost} onArtworkSaved={() => void refresh()} canEdit={canEdit} canDelete={canDelete} selectedIds={selectedPostIds} onToggle={togglePost} onSelect={(post) => openPost(post as Post)} onCreate={(date) => openPost(undefined, date)} onReschedule={(post, date) => void reschedulePost(post as Post, date)} onStatusChange={(post, status) => void changePostStatus(post as Post, status)} onReadinessChange={(post, field, checked) => void changePostReadiness(post as Post, field, checked)} onDuplicate={(post)=>void duplicatePost(post as Post)} onDelete={(post)=>void deletePosts([post as Post])}/>}

      {activeSection === 'overview' && <>
        {loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando publicaciones, piezas y tareas…</div>
          : data.posts.length === 0 ? <EmptyState icon={CalendarDays} title="El calendario está listo para comenzar" text="Aún no hay publicaciones en la base central. Crea la primera ficha para iniciar el flujo editorial." action={canEdit && <button className="button button-dark" onClick={() => openPost()}><Plus size={15}/>Nueva publicación</button>}/>
            : filteredPosts.length === 0 ? <EmptyState icon={Search} title="No encontramos coincidencias" text="Prueba con otro título, canal, responsable o estado." action={<button className="button button-outline" onClick={() => { setQuery(''); setStatusFilter('Todos los estados'); }}>Limpiar búsqueda</button>}/>
              : <div className={`vc-content-post-grid ${activeSection === 'overview' ? 'is-overview' : ''}`}>
                <div className="vc-content-post-list">
                  {postView === 'table' ? <div className="vc-marketing-post-table-wrap"><table className="vc-marketing-post-table"><thead><tr><th><input type="checkbox" aria-label="Seleccionar todas las publicaciones visibles" checked={filteredPosts.length>0&&filteredPosts.every((post)=>selectedPostIds.has(post.id))} onChange={selectVisiblePosts}/></th><th>Publicación</th><th>Fecha y canal</th><th>Etapa</th><th>Tags</th><th>Acciones</th></tr></thead><tbody>{filteredPosts.map((post)=> <tr key={post.id}><td><input type="checkbox" aria-label={`Seleccionar ${post.title}`} checked={selectedPostIds.has(post.id)} onChange={()=>togglePost(post.id)}/></td><td><button type="button" className="vc-marketing-table-title" onClick={()=>openPost(post)}>{post.title||'Sin título'}</button><small>{post.content_line||'Tema pendiente'}</small><MarketingReadinessIndicators post={post} onChange={(field, checked) => void changePostReadiness(post, field, checked)} disabled={!canEdit||saving}/></td><td>{post.scheduled_date?formatDate(post.scheduled_date):'Fecha pendiente'}<small>{post.platform||'Canal pendiente'}{post.scheduled_time?` · ${post.scheduled_time}`:''}</small></td><td><StageBadge stage={post.status||'Por iniciar'}/></td><td><div className="vc-marketing-table-tags">{getMarketingTags(post.tags).map((tag:string,index:number)=><span key={tag} style={{'--tag-color':MARKETING_COLORS[index%MARKETING_COLORS.length]} as React.CSSProperties}>{tag}</span>)}</div></td><td><ContextMenu label={`Acciones para ${post.title}`} actions={postActions(post)}><span className="vc-marketing-menu-anchor" aria-hidden="true"/></ContextMenu></td></tr>)}</tbody></table></div> : <AnimatedList stagger={0} className="vc-marketing-card-grid" itemClassName="vc-content-post-entry">{filteredPosts.map((post) => {
                  const linked = data.postAssets.filter((link) => link.post_id === post.id).length;
                  return <ContextMenu key={post.id} className="vc-marketing-post-context" label={`Acciones para ${post.title}`} actions={postActions(post)}><article className={`vc-content-post is-artwork-card${canEdit||canDelete?' has-selection':''}`}>
                    <header className="vc-marketing-post-card-top">{(canEdit||canDelete)&&<label className="vc-marketing-select-post"><input type="checkbox" aria-label={`Seleccionar ${post.title}`} checked={selectedPostIds.has(post.id)} onChange={()=>togglePost(post.id)}/></label>}<div className="vc-content-date" style={getMarketingCalendarColor(post.calendar_color, post.tags)?{borderColor:getMarketingCalendarColor(post.calendar_color, post.tags),color:getMarketingCalendarColor(post.calendar_color, post.tags)}:undefined}><strong>{post.scheduled_date ? post.scheduled_date.slice(8,10) : '—'}</strong><span>{post.scheduled_date ? new Intl.DateTimeFormat('es-EC',{month:'short'}).format(new Date(`${post.scheduled_date.slice(0,10)}T12:00:00`)) : 'PEND.'}</span></div><div className="vc-content-post-end"><StageBadge stage={post.status || 'Por iniciar'}/><span className={`vc-content-dot is-${statusTone(post.status)}`}/></div></header>
                    <MarketingPostArtwork organizationId={organizationId || ''} post={post} asset={artworkByPost.get(post.id)} canEdit={canEdit} variant="overview" onSaved={() => void refresh()}/>
                    <button className="vc-content-post-main" type="button" onClick={() => openPost(post)}><span className="vc-content-post-eyebrow">{post.content_line || post.platform || 'Contenido'} <i>·</i> {post.format || 'Formato pendiente'}</span><strong>{post.title || 'Sin título'}</strong><span className="vc-content-post-caption">{post.caption || post.next_action || 'Copy y siguiente paso por completar.'}</span><span className="vc-content-post-meta"><span><Megaphone size={13}/>{post.platform || 'Canal pendiente'}</span><span><Images size={13}/>{linked} piezas</span></span></button>
                    <WorkDetails post={post} today={today} reviews={data.reviews} materials={materialsFor(post)} canEdit={canEdit} onReview={()=>setReviewPost(post)} onReschedule={()=>reschedulePost(post)}/>
                    <MarketingReadinessIndicators post={post} onChange={(field, checked) => void changePostReadiness(post, field, checked)} disabled={!canEdit||saving}/>
                    {getMarketingTags(post.tags).length>0&&<div className="vc-marketing-post-tags">{getMarketingTags(post.tags).map((tag:string,index:number)=><span key={tag} style={{'--tag-color':MARKETING_COLORS[index%MARKETING_COLORS.length]} as React.CSSProperties}>{tag}</span>)}</div>}
                  </article></ContextMenu>;
                })}</AnimatedList>}
                </div>
                {activeSection === 'overview' && <aside className="vc-content-side-panel"><div className="vc-content-side-heading"><div><span className="eyebrow">PULSO EDITORIAL</span><h3>Lo que sigue</h3></div><Activity size={17}/></div><div className="vc-content-next-list">{publications.filter((post) => post.scheduled_date && post.scheduled_date >= today && !isTerminalMarketingStatus(post.status)).sort((a,b)=>a.scheduled_date.localeCompare(b.scheduled_date)).slice(0,4).map((post) => <button type="button" key={post.id} onClick={() => openPost(post)}><span className="vc-content-next-date">{formatDate(post.scheduled_date)}</span><b>{post.title}</b><small>{post.platform || 'Canal pendiente'}{post.owner ? ` · ${post.owner}` : ''}</small></button>)}{!publications.some((post) => post.scheduled_date && post.scheduled_date >= today && !isTerminalMarketingStatus(post.status)) && <p className="vc-content-side-empty">No hay publicaciones futuras con fecha asignada.</p>}</div><button className="vc-content-text-link" type="button" onClick={() => setActiveSection('calendar')}>Ver calendario completo <ArrowUpRight size={14}/></button><div className="vc-content-side-callout"><span><Lightbulb size={15}/></span><p><b>{overdue ? `${overdue} fichas necesitan atención` : 'El flujo está al día'}</b><br/>Define responsable, fecha límite y próximo paso para que las alertas tengan contexto.</p></div></aside>}
              </div>}
      </>}

      {activeSection === 'library' && <>
        {organizationId && <MarketingAssetIntake organizationId={organizationId} canEdit={canEdit} posts={data.posts} onSaved={() => void refresh()}/>}
        {loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando biblioteca…</div> : visibleAssets.length === 0 ? <EmptyState icon={Images} title="Sin recursos con este filtro" text="Prueba con otra búsqueda o cambia el filtro de disponibilidad."/> : <><div className="vc-library-grid">{visibleAssets.map((asset) => {const stored=asset.storage_status==='supabase_storage';const deleted=asset.storage_status==='retention_deleted';const sourceLabel=stored?'Central':deleted?'Eliminado por plazo':asset.storage_status==='local_reference'?'Ruta local':asset.storage_status==='upload_failed'?'Carga fallida':asset.storage_status==='uploading'?'Cargando':asset.is_available?'Local':'Referencia';const pathLabel=stored?`Almacenamiento privado · ${asset.folder || asset.section}`:asset.rel_path;return <article className="vc-library-card" key={asset.id}><MarketingAssetPreview asset={asset}/><div className="vc-library-info"><b title={asset.filename}>{asset.filename}</b><span>{asset.section || 'Sección pendiente'}{asset.folder ? ` · ${asset.folder}` : ''}</span><small>{Math.max(1,Math.round((asset.size_bytes || 0)/1024))} KB · {asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Dimensiones pendientes'}{asset.retention_enabled && asset.retention_months ? ` · Retención ${asset.retention_months} ${asset.retention_months===1?'mes':'meses'}` : ''}</small></div><span className={`vc-library-availability ${asset.is_available ? 'is-available' : ''}`} title={deleted?'El archivo central se eliminó por el plazo configurado; la ficha y la ruta se conservan':stored?'Guardado en el almacenamiento privado de la suite':asset.storage_status==='local_reference'?'Referencia a ruta de Visual Corp':asset.storage_status==='upload_failed'?'La ruta está indexada, pero falta completar la carga':asset.is_available?'Disponible en la biblioteca local':'La ruta se conserva como referencia'}><i/>{sourceLabel}</span><div className="vc-library-path"><code title={asset.rel_path}>{pathLabel}</code><button type="button" aria-label={`Copiar ruta de ${asset.filename}`} onClick={() => void copyAssetPath(asset.rel_path)}><Copy size={13}/></button></div></article>})}</div><p className="vc-content-footnote">Las imágenes vinculadas se eliminan del almacenamiento central al vencer su retención; sus fichas de índice quedan visibles. Las rutas locales conservan intactos los originales de Visual Corp.</p></>}
      </>}

      {activeSection === 'strategy' && <section className="vc-strategy-section">
        <div className="vc-content-toolbar vc-content-toolbar-inline"><div><span className="vc-content-section-icon"><Target size={16}/></span><div><b>FODA y decisiones estratégicas</b><small>Lectura de fortalezas, debilidades, oportunidades y amenazas registradas</small></div></div></div>
        {loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando estrategia…</div> : <>
          <div className="vc-marketing-insight-strip" aria-label="Resumen de estrategia">
            <article><span>Observaciones</span><strong>{data.strategy.length}</strong><small>en el registro estratégico</small></article>
            <article><span>Dimensiones con datos</span><strong>{strategyCategories} <small>de 4</small></strong><small>categorías FODA cubiertas</small></article>
            <article><span>Publicaciones activas</span><strong>{inProduction}</strong><small>vinculadas al flujo editorial</small></article>
            <article><span>Próximas con fecha</span><strong>{data.posts.filter((post) => post.scheduled_date && post.scheduled_date >= today && !isTerminalMarketingStatus(post.status)).length}</strong><small>pendientes o en producción</small></article>
          </div>
          <div className="vc-strategy-grid">{['fortaleza','debilidad','oportunidad','amenaza'].map((category) => {const items=data.strategy.filter((item)=>String(item.category || '').toLocaleLowerCase('es')===category);return <section className={`vc-strategy-column is-${category}`} key={category}><header><span>{category==='fortaleza'?'F':category==='debilidad'?'D':category==='oportunidad'?'O':'A'}</span><div><b>{category[0].toLocaleUpperCase('es')+category.slice(1)}</b><small>{items.length} registros</small></div></header>{items.length ? items.map((item)=><article key={item.id}><b>{item.title}</b><p>{item.detail}</p><div><span>{item.evidence || 'Evidencia pendiente de documentar'}</span><StageBadge stage={item.status}/></div>{item.owner&&<small>Responsable histórico: {item.owner}</small>}</article>) : <p className="vc-marketing-insight-empty">Sin observaciones registradas.</p>}</section>})}</div>
          <p className="vc-content-footnote">El panel resume observaciones históricas del registro FODA y publicaciones en la base central; no crea recomendaciones automáticas ni atribuye resultados a una decisión.</p>
        </>}
      </section>}

      {activeSection === 'operations' && <section className="vc-ops-section">
        <div className="vc-content-toolbar vc-content-toolbar-inline"><div><span className="vc-content-section-icon"><CheckCircle2 size={16}/></span><div><b>Trabajo y responsabilidades</b><small>Órdenes importadas con fechas, próximos pasos e historial</small></div></div></div>
        {loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando tareas…</div> : <>
          <div className="vc-marketing-insight-strip" aria-label="Resumen de operación">
            <article><span>Tareas registradas</span><strong>{data.work.length}</strong><small>órdenes de trabajo importadas</small></article>
            <article><span>Abiertas</span><strong>{activeWork.length}</strong><small>requieren seguimiento</small></article>
            <article className={overdueWork ? 'is-warning' : ''}><span>Fuera de fecha</span><strong>{overdueWork}</strong><small>tareas abiertas vencidas</small></article>
            <article className={blockedWork ? 'is-warning' : ''}><span>Bloqueadas</span><strong>{blockedWork}</strong><small>con bloqueo registrado</small></article>
          </div>
          <div className="vc-ops-grid">{data.work.length ? data.work.map((item) => {const events=data.history.filter((event)=>event.source_work_item_id===item.source_id);return <article className="vc-ops-card" key={item.id}><div className="vc-ops-card-top"><span>{item.process_area || 'Área por confirmar'}</span><StageBadge stage={item.stage}/></div><h3>{item.title}</h3><p>{item.next_action || item.notes || 'Siguiente paso pendiente.'}</p><div className="vc-ops-meta"><span><CalendarDays size={13}/>{item.due_date ? formatDate(item.due_date) : 'Sin fecha límite'}</span><span><Activity size={13}/>{events.length} cambios</span><span className={item.priority==='Alta'?'is-priority':''}>{item.priority || 'Prioridad por confirmar'}</span></div>{item.blocked_reason&&<div className="vc-ops-blocked"><AlertCircle size={14}/>{item.blocked_reason}</div>}</article>}) : <EmptyState icon={CheckCircle2} title="No hay tareas importadas" text="Las próximas tareas de marketing pueden registrarse aquí con responsable, fecha y próximo paso."/>}</div>
          <p className="vc-content-footnote">Las alertas de atraso se calculan con la fecha límite y etapa disponible en los registros importados; no modifican automáticamente órdenes de trabajo.</p>
        </>}
      </section>}

      {activeSection === 'results' && <section className="vc-results-section">
        <div className="vc-content-toolbar vc-content-toolbar-inline"><div><span className="vc-content-section-icon"><TrendingUp size={16}/></span><div><b>Resultados con contexto</b><small>Indicadores registrados en publicaciones y resumen histórico agregado</small></div></div></div>
        {loading ? <div className="vc-content-loading"><LoaderCircle size={21}/>Cargando resultados…</div> : <>
          <div className="vc-marketing-insight-strip vc-marketing-results-strip" aria-label="Indicadores informados por publicación">
            <article><span>Publicaciones medidas</span><strong>{metricPosts.length}</strong><small>con al menos un valor registrado</small></article>
            <article><span>Alcance informado</span><strong>{trackedReach.toLocaleString('es-EC')}</strong><small>suma de valores de Tracking</small></article>
            <article><span>Interacciones</span><strong>{trackedInteractions.toLocaleString('es-EC')}</strong><small>suma de valores de Tracking</small></article>
            <article><span>Clics · leads</span><strong>{trackedClicks.toLocaleString('es-EC')} · {trackedLeads.toLocaleString('es-EC')}</strong><small>valores informados, no atribución</small></article>
          </div>
          <div className="vc-results-top-grid"><article className="vc-results-card is-sales"><span className="eyebrow">RESUMEN HISTÓRICO · VENTAS</span><strong>{formatMoney(currentSnapshot?.amount)}</strong><p>{Number(currentSnapshot?.sales)||0} operaciones · promedio {formatMoney(currentSnapshot?.average)} por venta</p><small>{currentSnapshot?.date_from&&currentSnapshot?.date_to?`${formatDate(currentSnapshot.date_from)} — ${formatDate(currentSnapshot.date_to)}`:'Rango histórico por confirmar'} · Fuente: resumen importado de Tracking</small><div className="vc-results-tags"><span>Agregado</span><span>Sin atribución a campaña</span><span>Sin costos fiables</span></div></article><article className="vc-results-card"><span className="eyebrow">EMBUDO COMERCIAL</span><strong>{data.leads.length}</strong><p>oportunidades con seguimiento</p><small>{data.leads.length?'Los registros permanecen vinculados a su referencia interna.':'No hay oportunidades registradas en la base disponible.'}</small></article></div>
          <div className="vc-results-posts"><div className="vc-content-side-heading"><div><span className="eyebrow">DESEMPEÑO REGISTRADO</span><h3>Publicaciones con métricas</h3></div><span className="vc-results-count">{metricPosts.length}</span></div>{metricPosts.length ? metricPosts.map((post)=><article key={post.id}><div><b>{post.title}</b><span>{post.platform} · {post.status}</span></div><div><strong>{Number(post.reach).toLocaleString('es-EC')}</strong><small>alcance</small><strong>{Number(post.interactions).toLocaleString('es-EC')}</strong><small>interacciones</small><strong>{Number(post.clicks).toLocaleString('es-EC')}</strong><small>clics</small><strong>{Number(post.leads).toLocaleString('es-EC')}</strong><small>leads informados</small></div></article>) : <EmptyState icon={BarChart3} title="Aún no hay métricas de publicaciones" text="Registra resultados cuando la plataforma y el periodo de medición estén confirmados."/>}</div>
          <p className="vc-content-footnote">El panel muestra el registro importado más reciente de ventas (Tracking) y valores informados por publicación. El resumen agregado cubre una semana histórica de agosto de 2026; no tiene dimensión fiable de cliente ni costos, así que no mide rentabilidad ni atribuye ventas a campañas.</p>
        </>}
      </section>}

      <footer className="vc-content-source"><span><CheckCircle2 size={15}/></span><p><b>Base central conectada · Visual Corp</b><small>Datos copiados desde Tracking con sus IDs y relaciones. Los cambios que hagas aquí quedan en la suite y se registran en el historial.</small></p><span className="vc-content-source-tag">{data.assets.length.toLocaleString('es-EC')} archivos catalogados</span></footer>
    </main>

    {notice&&<div className="vc-content-toast" role="status"><CheckCircle2 size={16}/>{notice}</div>}
    {reviewPost&&<ReviewPanel post={reviewPost} materials={materialsFor(reviewPost)} reviews={data.reviews} events={data.events.filter(e=>e.post_id===reviewPost.id).slice(-20).reverse()} canEdit={canEdit} canApprove={canApprove} onClose={()=>setReviewPost(null)} onReload={async()=>{const fresh=await refresh();const current=fresh?.posts.find(p=>p.id===reviewPost.id);if(current)setReviewPost(current);}} onEdit={()=>{setReviewPost(null);openPost(reviewPost);}} onDecision={async(decision,feedback)=>{const result=await supabase!.rpc('review_marketing_post',{p_organization_id:organizationId,p_post_id:reviewPost.id,p_expected_version:reviewPost.row_version,p_decision:decision,p_feedback:feedback});if(result.error)throw result.error;setReviewPost(null);setNotice('Decisión registrada con su versión.');await refresh();}}/>}
    {proposal&&<DateProposal post={proposal.post} today={today} closedDays={data.days} initialDate={proposal.date} onClose={()=>setProposal(null)} onSave={async(field,date)=>{await saveMarketingPost(organizationId!,proposal.post,{[field]:date});setNotice('Fecha actualizada por confirmación del equipo.');await refresh();}}/>}
    {showDays&&<NonproductionSettings days={data.days} onClose={()=>setShowDays(false)} onSave={async(date,reason,remove=false)=>{const result=await supabase!.rpc('set_marketing_nonproduction_day',{p_organization_id:organizationId,p_day:date,p_reason:reason,p_remove:remove});if(result.error)throw result.error;await refresh();}}/>}
    {modalOpen && <div className="vc-content-modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePostEditor(); }}>
      <section ref={editorDialogRef} tabIndex={-1} className="vc-content-modal vc-content-modal-editor" role="dialog" aria-modal="true" aria-labelledby="vc-post-modal-title">
        <header className="vc-publication-editor-header">
          <div className="vc-publication-editor-title">
            <span className="eyebrow">{isNew ? 'NUEVA FICHA' : 'FICHA DE PUBLICACIÓN'}</span>
            <h2 id="vc-post-modal-title">{isNew ? 'Planifica una publicación' : 'Edita la publicación'}</h2>
            <p>{draft.title || 'Organiza el mensaje, el calendario y la producción desde una sola ficha.'}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Cerrar" autoFocus onClick={closePostEditor}><X size={18}/></button>
        </header>
        <form onSubmit={savePost}>
          <section className="vc-publication-editor-artwork" aria-label="Imagen de referencia">
            <div className="vc-publication-editor-artwork-copy">
              <span className="eyebrow">MATERIAL VISUAL</span>
              <b>Imagen de referencia</b>
              <small>{canEdit ? 'Pega con Ctrl+V, arrastra una imagen o elígela desde el dispositivo.' : 'Imagen asociada a esta publicación.'}</small>
              {publishedMissingItems.length > 0 && <span className="vc-publication-editor-missing" role="note">Ficha marcada como publicada con datos pendientes: {publishedMissingItems.join(', ')}. Completa la información cuando esté disponible.</span>}
            </div>
            <MarketingPostArtwork
            organizationId={organizationId || ''}
            post={selectedPost || { id: '', source_id: '', title: draft.title || 'nueva publicación', scheduled_date: draft.scheduled_date }}
            asset={selectedPost ? artworkByPost.get(selectedPost.id) : undefined}
            canEdit={canEdit}
            canDelete={canDelete}
            variant="editor"
            isDraft={isNew}
            draftFile={draftArtworkFile}
            onDraftFileChange={file=>{editorDirty.current=true;setDraftArtworkFile(file);}}
            onSaved={async () => { const fresh=await refresh(); if(selectedPost){const current=fresh?.posts.find(p=>p.id===selectedPost.id);if(current){const concurrent=Object.keys(defaultDraft()).some(key=>JSON.stringify(current[key])!==JSON.stringify(selectedPost[key]));if(!concurrent)setSelectedPost(current);else setLoadError('Otra persona modificó la ficha. Conservamos tus cambios locales; recarga la ficha antes de guardar.');}} setDraftArtworkFile(null); }}
          />
          </section>
          <PublicationEditorSections key={draftTabKey} draft={draft} onChange={(field, value) => { editorDirty.current=true; setDraft((current) => ({ ...current, [field]: value, ...(field==='design_ready'?{art_status:value?'Sí' as const:'No' as const}:field==='video_ready'?{video_status:value?'Sí' as const:'No' as const}:field==='art_status'?{design_ready:value==='Sí'}:field==='video_status'?{video_ready:value==='Sí'}:{}) })); }} canEdit={canEdit} isNew={isNew} activeTab={editorTab} onTabChange={setEditorTab} selectedPost={selectedPost} checklistFields={checklistFields} events={selectedEvents} formatDate={formatDate} knownTags={knownTags} assignees={data.assignees} canApprove={canApprove}/>
          {loadError&&<div className="vc-content-alert is-error" role="alert"><div><b>No se pudo guardar</b><p>{loadError}</p><button type="button" disabled={saving} onClick={async()=>{const fresh=await refresh();const current=fresh?.posts.find(p=>p.id===selectedPost?.id);if(current&&window.confirm('¿Descartar los cambios locales y cargar la ficha actual del servidor?')){editorDirty.current=false;openPost(current);}}}>Recargar ficha del servidor</button></div></div>}
          <div className="vc-content-modal-actions">
            <span>{canEdit ? 'La ficha se guarda en el calendario central.' : 'Tu perfil tiene acceso de solo lectura.'}</span>
            {canDelete && selectedPost && <button type="button" className="vc-small-danger" disabled={saving} onClick={() => void deletePosts([selectedPost])}><Trash2 size={13}/>Eliminar publicación</button>}
            <button type="button" className="button button-outline" onClick={closePostEditor}>Cerrar</button>
            {canEdit && <button type="submit" className="button button-dark" disabled={saving}>{saving ? <LoaderCircle className="vc-content-spin" size={15}/> : <Save size={15}/>} {saving ? 'Guardando…' : 'Guardar ficha'}</button>}
          </div>
        </form>
      </section>
    </div>}
  </AppFrame>;
}
