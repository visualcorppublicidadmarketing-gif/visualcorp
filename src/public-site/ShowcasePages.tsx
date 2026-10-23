import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Newspaper, Search, ShoppingBag, Sparkles } from 'lucide-react';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';

type ContentKind = 'blog' | 'publicaciones' | 'portafolio';
type SiteArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body_markdown: string;
  cover_image: string | null;
  tags: string[];
  published_at: string | null;
};
type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category_id: string | null;
  category: string | null;
  image: string | null;
  featured: boolean;
  sort_order: number;
};
function usePublishedArticles() {
  const [articles, setArticles] = useState<SiteArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    if (!supabase || !supabaseConfigured) {
      setLoading(false);
      return () => { current = false; };
    }
    supabase.from('site_articles').select('id,title,slug,excerpt,body_markdown,cover_image,tags,published_at')
      .eq('is_published', true).order('published_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!current) return;
        if (queryError) setError('No se pudo cargar el contenido publicado.');
        else setArticles((data || []) as SiteArticle[]);
        setLoading(false);
      });
    return () => { current = false; };
  }, []);
  return { articles, loading, error };
}

function normalizedTags(article: SiteArticle) {
  return (article.tags || []).map((tag) => tag.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase());
}

function articleMatches(article: SiteArticle, kind: ContentKind) {
  const tags = normalizedTags(article);
  if (kind === 'portafolio') return tags.includes('portafolio') || tags.includes('portfolio');
  if (kind === 'publicaciones') return tags.includes('publicacion') || tags.includes('publicaciones');
  return !tags.some((tag) => ['portafolio', 'portfolio', 'publicacion', 'publicaciones'].includes(tag));
}

type ShowcaseKind = ContentKind | 'tienda';
function KindIcon({ kind, size = 18 }: { kind: ShowcaseKind; size?: number }) {
  const Icon = kind === 'portafolio' ? BriefcaseBusiness : kind === 'publicaciones' ? Newspaper : kind === 'tienda' ? ShoppingBag : BookOpen;
  return <Icon size={size} aria-hidden="true"/>;
}

function ShowcaseHero({ kind, description }: { kind: ShowcaseKind; description: string }) {
  const config = {
    blog: { title: 'Ideas que ayudan a avanzar.', eyebrow: 'BLOG VISUAL CORP' },
    publicaciones: { title: 'Lo que estamos compartiendo.', eyebrow: 'PUBLICACIONES' },
    portafolio: { title: 'Proyectos que toman forma.', eyebrow: 'PORTAFOLIO' },
    tienda: { title: 'Ideas que toman forma.', eyebrow: 'TIENDA VISUAL CORP' },
  }[kind];
  return <section className="site-page-hero showcase-hero"><div className="site-hero-glow glow-pink"/><div className="site-page-hero-inner"><span className="site-eyebrow light"><i/><KindIcon kind={kind}/>{config.eyebrow}</span><h1>{config.title}</h1><p>{description}</p><div className="site-page-hero-actions"><Link className="site-primary-button" to="/contacto">Conversemos <ArrowUpRight size={16}/></Link></div></div></section>;
}

function ContentCard({ article, kind }: { article: SiteArticle; kind: ContentKind }) {
  const date = article.published_at ? new Date(article.published_at).toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const to = kind === 'publicaciones' ? `/publicaciones/${article.slug}` : kind === 'portafolio' ? `/portafolio/${article.slug}` : `/blog/${article.slug}`;
  return <article className="showcase-card glass-card">
    <Link className="showcase-card-image" to={to} aria-label={`Leer ${article.title}`}>
      {article.cover_image ? <img src={article.cover_image} alt="" loading="lazy"/> : <span className="showcase-card-placeholder"><KindIcon kind={kind} size={30}/><i/></span>}
    </Link>
    <div className="showcase-card-copy"><div className="showcase-card-meta">{kind === 'portafolio' ? 'PROYECTO' : kind === 'publicaciones' ? 'PUBLICACIÓN' : 'IDEA'}{date && <><i/> {date}</>}</div><h2><Link to={to}>{article.title}</Link></h2>{article.excerpt && <p>{article.excerpt}</p>}<Link className="site-text-link" to={to}>Explorar <ArrowUpRight size={15}/></Link></div>
  </article>;
}

function EmptyContent({ kind }: { kind: ContentKind }) {
  const title = kind === 'portafolio' ? 'Estamos preparando esta galería.' : kind === 'publicaciones' ? 'Aún no hay publicaciones visibles.' : 'Aún no hay artículos publicados.';
  const text = kind === 'portafolio'
    ? 'Los proyectos aparecerán aquí cuando el equipo incorpore casos y confirme sus imágenes y descripciones.'
    : 'Este espacio mostrará contenido publicado por Visual Corp. Mientras tanto, puedes explorar nuestros servicios.';
  return <div className="showcase-empty glass-card"><span><Sparkles size={20}/></span><h2>{title}</h2><p>{text}</p><Link className="site-secondary-button" to="/servicios">Explorar servicios <ArrowRight size={15}/></Link></div>;
}

function ArticleIndex({ kind }: { kind: ContentKind }) {
  const { articles, loading, error } = usePublishedArticles();
  const [search, setSearch] = useState('');
  const matches = useMemo(() => articles.filter((article) => articleMatches(article, kind)
    && `${article.title} ${article.excerpt} ${(article.tags || []).join(' ')}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [articles, kind, search]);
  const description = kind === 'blog'
    ? 'Consejos, ideas y novedades sobre comunicación visual, producción y presencia de marca.'
    : kind === 'publicaciones'
      ? 'Una selección de novedades y piezas compartidas por Visual Corp.'
      : 'Una galería de proyectos confirmados, con contexto sobre el reto y el trabajo realizado.';
  return <><ShowcaseHero kind={kind} description={description}/><section className="showcase-section">
    <div className="showcase-toolbar"><div><span className="site-eyebrow"><i/>VISUAL CORP</span><h2>{kind === 'portafolio' ? 'Trabajo seleccionado' : kind === 'publicaciones' ? 'Últimas publicaciones' : 'Lecturas recientes'}</h2></div><label className="showcase-search"><Search size={16}/><span className="sr-only">Buscar contenido</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contenido"/></label></div>
    {loading ? <div className="showcase-empty glass-card" role="status">Cargando contenido…</div> : error ? <div className="showcase-empty glass-card" role="alert">{error}</div> : matches.length ? <div className="showcase-grid">{matches.map((article) => <ContentCard key={article.id} article={article} kind={kind}/>)}</div> : <EmptyContent kind={kind}/>}
  </section></>;
}

export function BlogIndexPage() { return <><DocumentTitle title="Blog"/><ArticleIndex kind="blog"/></>; }
export function PublicationIndexPage() { return <><DocumentTitle title="Publicaciones"/><ArticleIndex kind="publicaciones"/></>; }
export function PortfolioIndexPage() { return <><DocumentTitle title="Portafolio"/><ArticleIndex kind="portafolio"/></>; }
export function PublicationArticleDetailPage() { return <ArticleDetailPage kind="publicaciones"/>; }
export function PortfolioArticleDetailPage() { return <ArticleDetailPage kind="portafolio"/>; }

function DocumentTitle({ title }: { title: string }) {
  useEffect(() => { document.title = `${title} · Visual Corp`; }, [title]);
  return null;
}

export function HomeContentHighlights() {
  const { articles } = usePublishedArticles();
  const picks = articles.filter((article) => articleMatches(article, 'portafolio') || articleMatches(article, 'publicaciones') || articleMatches(article, 'blog')).slice(0, 3);
  if (!picks.length) return null;
  return <section className="site-content-highlights"><div className="showcase-toolbar"><div><span className="site-eyebrow light"><i/>IDEAS, TRABAJO Y NOVEDADES</span><h2>Un poco más de Visual Corp.</h2></div><Link className="site-secondary-button" to="/portafolio">Explorar <ArrowUpRight size={15}/></Link></div><div className="showcase-grid">{picks.map((article) => { const kind: ContentKind = articleMatches(article, 'portafolio') ? 'portafolio' : articleMatches(article, 'publicaciones') ? 'publicaciones' : 'blog'; return <ContentCard key={article.id} article={article} kind={kind}/>; })}</div></section>;
}

export function ArticleDetailPage({ kind = 'blog' }: { kind?: ContentKind }) {
  const { slug = '' } = useParams();
  const { articles, loading, error } = usePublishedArticles();
  const article = articles.find((item) => item.slug === slug && articleMatches(item, kind));
  useEffect(() => { if (article) document.title = `${article.title} · Visual Corp`; }, [article]);
  if (loading) return <section className="showcase-section"><div className="showcase-empty glass-card" role="status">Cargando artículo…</div></section>;
  if (error || !article) return <section className="showcase-section"><div className="showcase-empty glass-card"><h1>Este contenido no está disponible.</h1><p>{error || 'Revisa el enlace o vuelve a la lista de artículos.'}</p><Link className="site-secondary-button" to={kind === 'publicaciones' ? '/publicaciones' : kind === 'portafolio' ? '/portafolio' : '/blog'}>Volver <ArrowRight size={15}/></Link></div></section>;
  const lines = article.body_markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return <><DocumentTitle title={article.title}/><header className="article-hero"><Link className="article-back" to={kind === 'publicaciones' ? '/publicaciones' : kind === 'portafolio' ? '/portafolio' : '/blog'}><ArrowRight size={15}/> Volver</Link><span className="site-eyebrow light"><i/>{kind === 'publicaciones' ? 'PUBLICACIÓN' : kind === 'portafolio' ? 'PORTAFOLIO VISUAL CORP' : 'BLOG VISUAL CORP'}</span><h1>{article.title}</h1>{article.excerpt && <p>{article.excerpt}</p>}{article.published_at && <time dateTime={article.published_at}>{new Date(article.published_at).toLocaleDateString('es-EC', { dateStyle: 'long' })}</time>}</header><article className="article-body glass-card">{article.cover_image && <img className="article-cover" src={article.cover_image} alt=""/>}<div className="article-markdown">{lines.map((line, index) => line.startsWith('#') ? <h2 key={index}>{line.replace(/^#+\s*/, '')}</h2> : <p key={index}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>)}</div>{article.tags?.length > 0 && <div className="article-tags">{article.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}</article></>;
}

export function StorefrontPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    let current = true;
    if (!supabase || !supabaseConfigured) { setLoading(false); return () => { current = false; }; }
    const load = async () => {
      const { data: rows, error: productError } = await supabase.from('public_catalog_products')
        .select('id,name,slug,description,category_id,category,featured,sort_order,image')
        .eq('is_published', true).order('sort_order', { ascending: true });
      if (!current) return;
      if (productError) { setError('No se pudo cargar el catálogo. Escríbenos y te orientamos.'); setLoading(false); return; }
      setProducts((rows || []) as CatalogProduct[]);
      setLoading(false);
    };
    void load();
    return () => { current = false; };
  }, []);
  const visible = useMemo(() => products.filter((product) => `${product.name} ${product.description} ${product.category || product.category_id || ''}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [products, search]);
  return <><DocumentTitle title="Tienda"/><ShowcaseHero kind="tienda" description="Explora productos y soluciones personalizadas. Cada pedido se revisa según medidas, cantidad y acabados antes de confirmar precio y disponibilidad."/><section className="showcase-section">
    <div className="showcase-toolbar"><div><span className="site-eyebrow"><i/><ShoppingBag size={15}/>CATÁLOGO VISUAL CORP</span><h2>Ideas para personalizar</h2><p>Los precios y la disponibilidad se confirman al cotizar.</p></div><label className="showcase-search"><Search size={16}/><span className="sr-only">Buscar productos</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto"/></label></div>
    {loading ? <div className="showcase-empty glass-card" role="status">Cargando catálogo…</div> : error ? <div className="showcase-empty glass-card" role="alert">{error}</div> : visible.length ? <div className="showcase-grid store-grid">{visible.map((product) => <article className="showcase-card glass-card" key={product.id}><div className="showcase-card-image">{product.image ? <img src={product.image} alt="" loading="lazy"/> : <span className="showcase-card-placeholder"><ShoppingBag size={30}/><i/></span>}</div><div className="showcase-card-copy"><div className="showcase-card-meta">{product.category || product.category_id || 'PRODUCTO PERSONALIZADO'}</div><h2>{product.name}</h2><p>{product.description || 'Personalización según el proyecto.'}</p><Link className="site-text-link" to="/cotizador">Solicitar cotización <ArrowUpRight size={15}/></Link></div></article>)}</div> : <div className="showcase-empty glass-card"><span><ShoppingBag size={20}/></span><h2>Estamos preparando el catálogo.</h2><p>Cuando los productos estén publicados desde el panel, podrás explorarlos aquí.</p><Link className="site-secondary-button" to="/contacto">Consultar por WhatsApp <ArrowUpRight size={15}/></Link></div>}
  </section></>;
}

