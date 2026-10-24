import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, BriefcaseBusiness, Check, Code2, Eye, EyeOff, FilePlus2, Newspaper, Pencil, Save, Search } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { SiteAdminNav } from './SiteAdminNav';
import { MarkdownBlockEditor } from './MarkdownBlockEditor';

type ContentKind = 'blog' | 'publicaciones' | 'portafolio';
type SiteArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body_markdown: string;
  cover_image: string | null;
  tags: string[];
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
  created_by: string | null;
};
type EditorState = { id?: string; title: string; slug: string; excerpt: string; body: string; image: string; kind: ContentKind; published: boolean; publishedAt: string | null };
const blankEditor: EditorState = { title: '', slug: '', excerpt: '', body: '', image: '', kind: 'blog', published: false, publishedAt: null };

function kindFromTags(tags: string[] = []): ContentKind {
  const normalized = tags.map((tag) => tag.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  if (normalized.includes('portafolio') || normalized.includes('portfolio')) return 'portafolio';
  if (normalized.includes('publicacion') || normalized.includes('publicaciones')) return 'publicaciones';
  return 'blog';
}
function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function formatKind(kind: ContentKind) { return kind === 'portafolio' ? 'Portafolio' : kind === 'publicaciones' ? 'Publicación' : 'Blog'; }

export function SiteArticleManager({ initialKind }: { initialKind?: ContentKind } = {}) {
  const { organizationId, user, hasPermission } = useAuth();
  const canPublish = hasPermission('website', 'publish_content');
  const [articles, setArticles] = useState<SiteArticle[]>([]);
  const [editor, setEditor] = useState<EditorState>(blankEditor);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bodyMode, setBodyMode] = useState<'blocks' | 'markdown'>('blocks');

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase.from('site_articles').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setArticles((data || []) as SiteArticle[]);
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => articles.filter((article) => (!initialKind || kindFromTags(article.tags) === initialKind) && `${article.title} ${article.excerpt} ${article.slug}`.toLocaleLowerCase('es').includes(term.trim().toLocaleLowerCase('es'))), [articles, term, initialKind]);
  const editArticle = (article: SiteArticle) => {
    if (article.created_by && article.created_by !== user?.id) { setError('Por seguridad, solo puedes modificar entradas creadas por tu cuenta.'); return; }
    setEditor({ id: article.id, title: article.title, slug: article.slug, excerpt: article.excerpt, body: article.body_markdown, image: article.cover_image || '', kind: kindFromTags(article.tags), published: article.is_published, publishedAt: article.published_at });
    setBodyMode('blocks');
  };
  const reset = () => { setEditor({ ...blankEditor, kind: initialKind || 'blog' }); setBodyMode('blocks'); setError(''); setNotice(''); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !editor.title.trim() || saving) return;
    setSaving(true); setError(''); setNotice('');
    const tags = [editor.kind];
    const publishedAt = editor.published ? (editor.publishedAt || new Date().toISOString()) : null;
    const values = {
      organization_id: organizationId,
      title: editor.title.trim(),
      slug: slugify(editor.slug || editor.title),
      excerpt: editor.excerpt.trim(),
      body_markdown: editor.body.trim(),
      cover_image: editor.image.trim() || null,
      tags,
      is_published: editor.published,
      published_at: publishedAt,
    };
    try {
      const result = editor.id
        ? await supabase.from('site_articles').update(values).eq('id', editor.id).eq('organization_id', organizationId)
        : await supabase.from('site_articles').insert({ ...values, created_by: user?.id || null });
      if (result.error) throw result.error;
      setNotice(editor.published ? 'Contenido publicado y listo para la página.' : 'Borrador guardado sin mostrarlo en la página.');
      setEditor({ ...blankEditor, kind: initialKind || 'blog' });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el contenido.');
    } finally { setSaving(false); }
  };

  const title = initialKind === 'portafolio' ? 'Portafolio' : initialKind === 'publicaciones' ? 'Publicaciones' : initialKind === 'blog' ? 'Blog' : 'Contenido del sitio';
  const activeTab = initialKind === 'portafolio' ? '/admin/portafolio' : initialKind === 'publicaciones' ? '/admin/publicaciones' : '/admin/blog';
  return <AppFrame area="admin"><PageHeading eyebrow="EDITOR DEL SITIO" title={title} description="Crea borradores, ordénalos con bloques y publica cada entrada en su sección." action={<button className="button button-dark" type="button" onClick={reset}><FilePlus2 size={16}/> Nuevo contenido</button>}/>
    <SiteAdminNav active={activeTab}/>
    <div className="site-content-admin-grid">
      <form className="panel form-panel site-content-editor" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">{editor.id ? 'EDITAR CONTENIDO' : 'NUEVO CONTENIDO'}</span><h2>{editor.id ? editor.title || 'Sin título' : 'Crea una entrada'}</h2></div>{editor.kind === 'portafolio' ? <BriefcaseBusiness size={19}/> : editor.kind === 'publicaciones' ? <Newspaper size={19}/> : <BookOpen size={19}/>}</div>
        {notice && <div className="site-content-notice" role="status"><Check size={15}/>{notice}</div>}
        {error && <div className="op-flow-alert error" role="alert">{error}</div>}
        {initialKind ? <div className="site-content-kind-lock"><span>Sección</span><b>{formatKind(initialKind)}</b><small>El contenido nuevo se guardará en esta sección.</small></div> : <label>Tipo de contenido<select value={editor.kind} onChange={(event) => setEditor((current) => ({ ...current, kind: event.target.value as ContentKind }))}><option value="blog">Artículo de blog</option><option value="publicaciones">Publicación</option><option value="portafolio">Proyecto de portafolio</option></select></label>}
        <label>Título<input required value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value, slug: current.id || current.slug ? current.slug : slugify(event.target.value) }))} placeholder="Título visible"/></label>
        <label>URL del contenido<input value={editor.slug} onChange={(event) => setEditor((current) => ({ ...current, slug: slugify(event.target.value) }))} placeholder="se-genera-desde-el-titulo"/></label>
        <label>Descripción breve<textarea rows={3} value={editor.excerpt} onChange={(event) => setEditor((current) => ({ ...current, excerpt: event.target.value }))} placeholder="Resumen para tarjetas y buscadores"/></label>
        <label>Imagen de portada (URL)<input type="url" value={editor.image} onChange={(event) => setEditor((current) => ({ ...current, image: event.target.value }))} placeholder="https://…"/></label>
        <div className="site-content-body-heading"><label htmlFor="site-content-body">Contenido</label><div className="site-content-mode-switch" role="group" aria-label="Modo de edición"><button type="button" className={bodyMode === 'blocks' ? 'is-active' : ''} onClick={() => setBodyMode('blocks')}><Pencil size={13}/> Bloques</button><button type="button" className={bodyMode === 'markdown' ? 'is-active' : ''} onClick={() => setBodyMode('markdown')}><Code2 size={13}/> Markdown</button></div></div>
        {bodyMode === 'blocks' ? <MarkdownBlockEditor key={editor.id || 'new'} value={editor.body} onChange={(body) => setEditor((current) => ({ ...current, body }))}/> : <textarea id="site-content-body" className="site-content-body-field" rows={12} value={editor.body} onChange={(event) => setEditor((current) => ({ ...current, body: event.target.value }))} placeholder="Escribe Markdown. Usa párrafos separados por una línea en blanco."/>}
        <label className="toggle-row site-content-publish"><span><b>Visible en la página</b><small>{canPublish ? 'Al publicar, aparecerá en la sección elegida.' : 'Tu perfil puede guardar borradores; hace falta permiso de publicación para mostrarlo.'}</small></span><input type="checkbox" disabled={!canPublish} checked={editor.published} onChange={(event) => setEditor((current) => ({ ...current, published: event.target.checked }))}/></label>
        <div className="site-content-actions"><button className="button button-dark" type="submit" disabled={saving || !editor.title.trim()}><Save size={16}/>{saving ? 'Guardando…' : 'Guardar contenido'}</button><button className="button button-light" type="button" onClick={reset}>Limpiar</button></div>
      </form>
      <section className="panel site-content-list"><div className="panel-heading"><div><span className="eyebrow">CMS COMPARTIDO</span><h2>Entradas existentes</h2></div><span className="muted-count">{filtered.length} en esta sección</span></div>
        <label className="search-box"><Search size={16}/><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar título o URL"/></label>
        {loading ? <div className="empty-state">Cargando contenido…</div> : filtered.length ? <div className="site-content-list-items">{filtered.map((article) => { const kind = kindFromTags(article.tags); const path = kind === 'portafolio' ? '/portafolio' : kind === 'publicaciones' ? '/publicaciones' : '/blog'; const canEdit = !article.created_by || article.created_by === user?.id; return <article className="site-content-list-item" key={article.id}><span className={`site-content-type type-${kind}`}>{kind === 'portafolio' ? <BriefcaseBusiness size={14}/> : kind === 'publicaciones' ? <Newspaper size={14}/> : <BookOpen size={14}/>} {formatKind(kind)}</span><div className="site-content-list-copy"><b>{article.title}</b><small>{path}/{article.slug}</small></div><span className={`site-content-status${article.is_published ? ' published' : ''}`}>{article.is_published ? <><Eye size={13}/>Publicado</> : <><EyeOff size={13}/>Borrador</>}</span><button type="button" className="icon-button" aria-label={canEdit ? `Editar ${article.title}` : `${article.title}, solo lectura`} disabled={!canEdit} onClick={() => editArticle(article)}><Pencil size={15}/></button></article>; })}</div> : <div className="empty-state"><span><BookOpen size={19}/></span><b>No hay entradas</b><p>Crea un artículo, publicación o ficha de portafolio desde el formulario.</p></div>}
      </section>
    </div>
  </AppFrame>;
}

export function BlogAdmin() { return <SiteArticleManager initialKind="blog"/>; }
export function PublicationsAdmin() { return <SiteArticleManager initialKind="publicaciones"/>; }
export function PortfolioAdmin() { return <SiteArticleManager initialKind="portafolio"/>; }
