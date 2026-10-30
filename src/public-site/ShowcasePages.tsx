import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Check, ChevronLeft, ChevronRight, ClipboardList, Gift, Newspaper, Search, ShoppingBag, Sparkles, X } from 'lucide-react';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { catalogImagesForProduct } from '../data/catalogProductImages';
import { AnimatedList, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import { multiProductQuoteService } from './content';
import { ArticleMarkdown } from './ArticleMarkdown';
import './storefront.css';
import './store-promo-teaser.css';
import './store-product-sku.css';

type ContentKind = 'blog' | 'publicaciones' | 'portafolio';
const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const matchesSearch = (content: string, query: string) => {
  const haystack = normalizeSearch(content);
  return normalizeSearch(query.trim()).split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
};
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
  sku?: string;
  name: string;
  slug: string;
  description: string;
  category_id: string | null;
  category: string | null;
  image: string | null;
  featured: boolean;
  sort_order: number;
  type?: string | null;
  calc_type?: string | null;
  quantityTiers?: string[];
  sourceIds?: string[];
  images?: string[] | null;
  features?: string[] | null;
};
function StoreProductGallery({ product }: { product: CatalogProduct }) {
  const images = (product.images || []).filter(Boolean);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [product.id]);
  const image = images[active] || product.image;
  return <div className="store-detail-gallery"><div className="store-detail-image">{image ? <img src={image} alt={`${product.name}${images.length > 1 ? ` · imagen ${active + 1} de ${images.length}` : ''}`}/> : <span className="store-product-placeholder"><ShoppingBag size={36}/></span>}{images.length > 1 && <><button className="store-gallery-arrow previous" type="button" onClick={() => setActive((active - 1 + images.length) % images.length)} aria-label="Imagen anterior"><ChevronLeft size={19}/></button><button className="store-gallery-arrow next" type="button" onClick={() => setActive((active + 1) % images.length)} aria-label="Imagen siguiente"><ChevronRight size={19}/></button><span className="store-gallery-count">{active + 1} / {images.length}</span></>}</div>{images.length > 1 && <div className="store-gallery-thumbnails" role="group" aria-label="Imágenes del producto">{images.map((src, index) => <button key={`${src}-${index}`} type="button" aria-label={`Ver imagen ${index + 1}`} aria-pressed={active === index} onClick={() => setActive(index)}><img src={src} alt=""/></button>)}</div>}</div>;
}
function usePublishedArticles() {
  const [articles, setArticles] = useState<SiteArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    if (!supabase || !supabaseConfigured) {
      setError('El contenido publicado no está conectado en este momento.');
      setLoading(false);
      return () => { current = false; };
    }
    const load = async () => {
      try {
        const { data, error: queryError } = await supabase.from('site_articles').select('id,title,slug,excerpt,body_markdown,cover_image,tags,published_at')
          .eq('is_published', true).order('published_at', { ascending: false });
        if (!current) return;
        if (queryError) setError('No se pudo cargar el contenido publicado. Comprueba tu conexión e inténtalo de nuevo.');
        else setArticles((data || []) as SiteArticle[]);
      } catch {
        if (current) setError('No se pudo conectar para cargar el contenido publicado. Comprueba tu conexión e inténtalo de nuevo.');
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => { current = false; };
  }, [reloadKey]);
  return { articles, loading, error, retry: () => { setLoading(true); setReloadKey((key) => key + 1); } };
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
  return <article className="showcase-card glass-card vc-magic-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
    <SpotlightLayer/>
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

function ContentLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="showcase-empty glass-card" role="alert"><h2>No pudimos cargar este contenido.</h2><p>{message}</p><button type="button" className="site-secondary-button" onClick={onRetry}>Reintentar <ArrowRight size={15}/></button></div>;
}

function ArticleIndex({ kind }: { kind: ContentKind }) {
  const { articles, loading, error, retry } = usePublishedArticles();
  const [search, setSearch] = useState('');
  const sectionArticles = useMemo(() => articles.filter((article) => articleMatches(article, kind)), [articles, kind]);
  const matches = useMemo(() => sectionArticles.filter((article) => matchesSearch(`${article.title} ${article.excerpt} ${(article.tags || []).join(' ')}`, search)), [sectionArticles, search]);
  const description = kind === 'blog'
    ? 'Consejos, ideas y novedades sobre comunicación visual, producción y presencia de marca.'
    : kind === 'publicaciones'
      ? 'Una selección de novedades y piezas compartidas por Visual Corp.'
      : 'Una galería de proyectos confirmados, con contexto sobre el reto y el trabajo realizado.';
  return <><ShowcaseHero kind={kind} description={description}/><section className="showcase-section">
    <div className="showcase-toolbar"><div><span className="site-eyebrow"><i/>VISUAL CORP</span><h2>{kind === 'portafolio' ? 'Trabajo seleccionado' : kind === 'publicaciones' ? 'Últimas publicaciones' : 'Lecturas recientes'}</h2></div><label className="showcase-search"><Search size={16}/><span className="sr-only">Buscar contenido</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contenido"/></label></div>
    {loading ? <div className="showcase-empty glass-card" role="status">Cargando contenido…</div> : error ? <ContentLoadError message={error} onRetry={retry}/> : matches.length ? <AnimatedList className="showcase-grid" stagger={0.045}>{matches.map((article) => <ContentCard key={article.id} article={article} kind={kind}/>)}</AnimatedList> : sectionArticles.length && search.trim() ? <div className="showcase-empty glass-card" role="status"><h2>No encontramos resultados para “{search.trim()}”.</h2><p>Prueba con otras palabras o vuelve a ver todo el contenido.</p><button type="button" className="site-secondary-button" onClick={() => setSearch('')}>Limpiar búsqueda <ArrowRight size={15}/></button></div> : <EmptyContent kind={kind}/>}
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

function consolidateQuantityTiers(rows: CatalogProduct[]) {
  const isTier = (product: CatalogProduct) => product.calc_type === 'scale' && /^[\d\s.,–-]+$/.test(product.name.trim());
  const tierGroups = new Map<string, CatalogProduct[]>();
  const storefrontRows = rows.filter((product) => {
    if (!isTier(product)) return true;
    const baseSlug = product.slug.replace(/-\d+(?:-\d+)?$/, '');
    const key = `${product.category_id || ''}:${baseSlug || product.slug}`;
    tierGroups.set(key, [...(tierGroups.get(key) || []), product]);
    return false;
  });
  tierGroups.forEach((tiers) => {
    const first = tiers[0];
    const baseSlug = first.slug.replace(/-\d+(?:-\d+)?$/, '');
    const descriptionTitle = (first.description || '').split(/[.!?]\s/)[0]?.trim().replace(/[.!?]+$/, '');
    const title = descriptionTitle && descriptionTitle.length <= 72 ? descriptionTitle : first.category || descriptionTitle || 'Producto personalizado';
    storefrontRows.push({
      ...first,
      slug: baseSlug || first.slug,
      name: title,
      sourceIds: tiers.map((tier) => tier.id),
      quantityTiers: [...new Set(tiers.map((tier) => tier.name.trim()).filter(Boolean))],
      sort_order: Math.min(...tiers.map((tier) => tier.sort_order)),
      featured: tiers.some((tier) => tier.featured),
      images: [...new Set(tiers.flatMap((tier) => tier.images || []).filter((image): image is string => typeof image === 'string' && Boolean(image)))],
      features: [...new Set(tiers.flatMap((tier) => tier.features || []).filter((feature): feature is string => typeof feature === 'string' && Boolean(feature.trim())))],
    });
  });
  return storefrontRows.sort((a,b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'));
}

export function HomeContentHighlights() {
  const { articles } = usePublishedArticles();
  const portfolioPicks = articles.filter((article) => articleMatches(article, 'portafolio') && Boolean(article.cover_image?.trim())).slice(0, 3);
  if (portfolioPicks.length) return <section className="site-content-highlights home-portfolio-highlights" aria-labelledby="home-portfolio-title"><div className="showcase-toolbar"><div><span className="site-eyebrow light"><i/>TRABAJOS PUBLICADOS</span><h2 id="home-portfolio-title">Ideas que tomaron forma.</h2></div><Link className="site-secondary-button" to="/portafolio">Ver portafolio <ArrowUpRight size={15}/></Link></div><AnimatedList className={`showcase-grid home-portfolio-grid home-portfolio-count-${portfolioPicks.length}`} stagger={0.07}>{portfolioPicks.map((article) => <ContentCard key={article.id} article={article} kind="portafolio"/>)}</AnimatedList></section>;
  const picks = articles.filter((article) => articleMatches(article, 'portafolio') || articleMatches(article, 'publicaciones') || articleMatches(article, 'blog')).slice(0, 3);
  if (!picks.length) return null;
  return <section className="site-content-highlights"><div className="showcase-toolbar"><div><span className="site-eyebrow light"><i/>IDEAS, TRABAJO Y NOVEDADES</span><h2>Un poco más de Visual Corp.</h2></div><Link className="site-secondary-button" to="/portafolio">Explorar <ArrowUpRight size={15}/></Link></div><AnimatedList className="showcase-grid" stagger={0.07}>{picks.map((article) => { const kind: ContentKind = articleMatches(article, 'portafolio') ? 'portafolio' : articleMatches(article, 'publicaciones') ? 'publicaciones' : 'blog'; return <ContentCard key={article.id} article={article} kind={kind}/>; })}</AnimatedList></section>;
}

export function ArticleDetailPage({ kind = 'blog' }: { kind?: ContentKind }) {
  const { slug = '' } = useParams();
  const { articles, loading, error, retry } = usePublishedArticles();
  const article = articles.find((item) => item.slug === slug && articleMatches(item, kind));
  useEffect(() => { if (article) document.title = `${article.title} · Visual Corp`; }, [article]);
  if (loading) return <section className="showcase-section"><div className="showcase-empty glass-card" role="status">Cargando artículo…</div></section>;
  if (error) return <section className="showcase-section"><ContentLoadError message={error} onRetry={retry}/></section>;
  if (!article) return <section className="showcase-section"><div className="showcase-empty glass-card"><h1>Este contenido no está disponible.</h1><p>Revisa el enlace o vuelve a la lista de artículos.</p><Link className="site-secondary-button" to={kind === 'publicaciones' ? '/publicaciones' : kind === 'portafolio' ? '/portafolio' : '/blog'}>Volver <ArrowRight size={15}/></Link></div></section>;
  return <><DocumentTitle title={article.title}/><header className="article-hero"><Link className="article-back" to={kind === 'publicaciones' ? '/publicaciones' : kind === 'portafolio' ? '/portafolio' : '/blog'}><ArrowRight size={15}/> Volver</Link><span className="site-eyebrow light"><i/>{kind === 'publicaciones' ? 'PUBLICACIÓN' : kind === 'portafolio' ? 'PORTAFOLIO VISUAL CORP' : 'BLOG VISUAL CORP'}</span><h1>{article.title}</h1>{article.excerpt && <p>{article.excerpt}</p>}{article.published_at && <time dateTime={article.published_at}>{new Date(article.published_at).toLocaleDateString('es-EC', { dateStyle: 'long' })}</time>}</header><article className="article-body glass-card">{article.cover_image && <img className="article-cover" src={article.cover_image} alt=""/>}<ArticleMarkdown value={article.body_markdown}/>{article.tags?.length > 0 && <div className="article-tags">{article.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}</article></>;
}

export function StorefrontPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('Todos');
  const [sort, setSort] = useState('relevance');
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  const [comparisonNotice, setComparisonNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selection, setSelection] = useState<string[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('visualcorp-store-selection-v1') || '[]'); return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []; }
    catch { return []; }
  });
  const [selectionTiers, setSelectionTiers] = useState<Record<string,string>>(() => {
    try { const saved = JSON.parse(localStorage.getItem('visualcorp-store-quantity-tiers-v1') || '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? Object.fromEntries(Object.entries(saved).filter((entry): entry is [string,string] => typeof entry[1] === 'string')) : {}; }
    catch { return {}; }
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const productDialog = useRef<HTMLDialogElement>(null);
  const selectionDialog = useRef<HTMLDialogElement>(null);
  const comparisonDialog = useRef<HTMLDialogElement>(null);
  const [selectedQuantityTier, setSelectedQuantityTier] = useState('');
  const queryProduct = searchParams.get('producto');
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus(); }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    if (!supabase || !supabaseConfigured) { setError('El catálogo no está conectado en este momento. Intenta de nuevo más tarde.'); setLoading(false); return () => { current = false; }; }
    const load = async () => {
      try {
        const { data: rows, error: productError } = await supabase.from('public_catalog_products')
          .select('id,sku,name,slug,description,type,category_id,category,calc_type,featured,sort_order,image,images,features')
          .eq('is_published', true).order('sort_order', { ascending: true });
        if (!current) return;
        if (productError) { setError('No pudimos cargar el catálogo. Comprueba tu conexión e inténtalo de nuevo.'); return; }
        setProducts(consolidateQuantityTiers((rows || []) as CatalogProduct[]).map((product) => {
          const images = catalogImagesForProduct({ id: product.id, name: product.name, family: product.category || '', image: product.image, images: product.images || [] });
          return { ...product, sku: product.sku || product.id, images: images.length ? images : product.images || [], image: images[0] || product.image };
        }));
      } catch {
        if (current) setError('No pudimos conectar con el catálogo. Comprueba tu conexión e inténtalo de nuevo.');
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => { current = false; };
  }, [reloadKey]);
  useEffect(() => { try { localStorage.setItem('visualcorp-store-selection-v1', JSON.stringify(selection)); } catch { /* La lista sigue funcionando durante esta visita. */ } }, [selection]);
  useEffect(() => { try { localStorage.setItem('visualcorp-store-quantity-tiers-v1', JSON.stringify(selectionTiers)); } catch { /* La lista sigue funcionando durante esta visita. */ } }, [selectionTiers]);
  useEffect(() => {
    if (!products.length) return;
    setSelection((current) => [...new Set(products.filter((product) => current.includes(product.id) || product.sourceIds?.some((id) => current.includes(id))).map((product) => product.id))]);
    setSelectionTiers((current) => Object.fromEntries(Object.entries(current).flatMap(([id,tier]) => {
      const product = products.find((item) => item.id === id || item.sourceIds?.includes(id));
      return product ? [[product.id,tier]] : [];
    })));
  }, [products]);
  const normalized = normalizeSearch;
  const groupFor = (product: CatalogProduct) => {
    const categoryText = normalized(`${product.category || ''} ${product.category_id || ''}`);
    const searchText = normalized(`${product.name} ${product.description || ''} ${categoryText}`);
    if (/ropa y textiles|textil|camiseta|polo|uniforme|sublim|\bdtf\b|body recien/.test(categoryText)) return 'Textil';
    if (/gran formato|lona|banner|vinil|gigantografia|microperforado|backlight|valla|pendon/.test(searchText)) return 'Gran formato';
    if (/rotulo|letrero|senal|placa|acrilico|corporeo|cintra|corte|grabado/.test(searchText)) return 'Rótulos y materiales';
    if (/imprenta|impresion|tarjeta|volante|papeleria|credencial|factura|carpeta|afiche|triptico|etiqueta/.test(searchText)) return 'Imprenta';
    if (/display|roll.?up|stand|exhibidor|evento|totem|banderola/.test(searchText)) return 'Displays y eventos';
    if (/promocional|souvenir|jarro|taza|funda|bolso|mochila|regalo|llavero|mouse.?pad|tomatodo|gorra/.test(searchText)) return 'Promocionales';
    return 'Otros productos';
  };
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => { const group = groupFor(product); counts.set(group, (counts.get(group) || 0) + 1); });
    return [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  }, [products]);
  const matches = useMemo(() => {
    const result = products.filter((product) => (category === 'Todos' || groupFor(product) === category)
      && matchesSearch(`${product.name} ${product.sku || product.id} ${product.description || ''} ${product.category || ''} ${product.category_id || ''} ${(product.features || []).join(' ')}`, search));
    if (sort === 'az') result.sort((a,b) => a.name.localeCompare(b.name, 'es'));
    else if (sort === 'za') result.sort((a,b) => b.name.localeCompare(a.name, 'es'));
    else result.sort((a,b) => Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'));
    return result;
  }, [products, category, search, sort]);
  useEffect(() => { setVisibleLimit(24); }, [search, category, sort]);
  const selectedProduct = products.find((product) => product.slug === queryProduct || product.id === queryProduct);
  useEffect(() => {
    const dialog = productDialog.current;
    if (selectedProduct && dialog && !dialog.open) dialog.showModal();
    else if (!selectedProduct && dialog?.open) dialog.close();
  }, [selectedProduct]);
  useEffect(() => setSelectedQuantityTier(selectedProduct?.quantityTiers?.[0] || ''), [selectedProduct?.id]);
  useEffect(() => {
    if (loading || error || !queryProduct || !products.length || selectedProduct) return;
    const next = new URLSearchParams(searchParams);
    next.delete('producto');
    setSearchParams(next, { replace: true });
  }, [loading, error, queryProduct, products.length, selectedProduct, searchParams, setSearchParams]);
  useEffect(() => {
    if (products.length) setComparedIds((current) => current.filter((id) => products.some((product) => product.id === id)));
  }, [products]);
  useEffect(() => {
    if (comparedIds.length < 2 && comparisonDialog.current?.open) comparisonDialog.current.close();
  }, [comparedIds.length]);
  const openProduct = (product: CatalogProduct) => {
    const next = new URLSearchParams(searchParams);
    next.set('producto', product.slug);
    setSearchParams(next);
  };
  const closeProduct = () => productDialog.current?.close();
  const closeSelectionDialog = () => selectionDialog.current?.close();
  const onDialogClose = () => {
    if (!searchParams.has('producto')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('producto');
    setSearchParams(next, { replace: true });
  };
  const toggleSelection = (id: string, quantityTier = '') => {
    if (selection.includes(id)) {
      setSelection(selection.filter((item) => item !== id));
      setSelectionTiers((current) => { const next = { ...current }; delete next[id]; return next; });
    } else {
      setSelection([...selection,id]);
      if (quantityTier) setSelectionTiers((current) => ({ ...current,[id]: quantityTier }));
    }
  };
  const removeFromSelection = (id: string) => {
    setSelection((current) => current.filter((item) => item !== id));
    setSelectionTiers((current) => { const next = { ...current }; delete next[id]; return next; });
  };
  const toggleComparison = (id: string) => {
    if (comparedIds.includes(id)) {
      setComparedIds((current) => current.filter((item) => item !== id));
      setComparisonNotice('');
      return;
    }
    if (comparedIds.length >= 3) {
      setComparisonNotice('Puedes comparar hasta 3 productos a la vez.');
      return;
    }
    setComparisonNotice('');
    setComparedIds((current) => current.includes(id) || current.length >= 3 ? current : [...current, id]);
  };
  const addToSelection = (id: string) => setSelection((current) => current.includes(id) ? current : [...current, id]);
  const quoteUrl = (items: CatalogProduct[], quantityTier = '') => {
    const params = new URLSearchParams();
    const serviceForGroup: Record<string, string> = {
      'Gran formato': 'gran-formato', 'Rótulos y materiales': 'rotulos', 'Imprenta': 'impresion',
      'Textil': 'textil', 'Displays y eventos': 'eventos', 'Promocionales': 'textil', 'Otros productos': '',
    };
    const serviceIds = [...new Set(items.map((product) => serviceForGroup[groupFor(product)] || '').filter(Boolean))];
    if (serviceIds.length === 1) params.set('servicio', serviceIds[0]);
    else if (items.length > 1) params.set('servicio', multiProductQuoteService);
    items.forEach((product) => {
      params.append('producto', product.name);
      params.append('familia', serviceForGroup[groupFor(product)] || '');
    });
    if (items.length === 1) {
      const tier = quantityTier || selectionTiers[items[0].id] || '';
      if (tier) params.set('cantidad', tier);
    } else if (items.length > 1) items.forEach((product) => params.append('cantidad', selectionTiers[product.id] || ''));
    return `/cotizador?${params.toString()}`;
  };
  const selectedProducts = products.filter((product) => selection.includes(product.id));
  const comparedProducts = comparedIds.flatMap((id) => { const product = products.find((item) => item.id === id); return product ? [product] : []; });
  const featuredProducts = products.filter((product) => product.featured).slice(0, 4);
  const featuredPreview = [...products].sort((a,b) => Number(b.featured)-Number(a.featured) || a.sort_order-b.sort_order).slice(0, 3);
  const categoryModules = categories.slice(0, 6).map(([name,count]) => ({name,count,product:products.find((product)=>groupFor(product)===name)}));
  const scrollToCatalog = () => document.getElementById('catalogo-productos')?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
  const renderProductCard = (product: CatalogProduct, index: number) => {
    const productGroup=groupFor(product); const isSelected=selection.includes(product.id); const isCompared=comparedIds.includes(product.id); const productImage=product.image;
    return <article className="store-product-card vc-magic-card" key={product.id} style={{'--store-card-index':Math.min(index%12,11)} as CSSProperties} onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}><SpotlightLayer/>
      <button type="button" className="store-product-open" onClick={()=>openProduct(product)} aria-label={`Ver detalles de ${product.name}`}><span className="store-product-image">{productImage?<img src={productImage} alt="" loading={index<6?'eager':'lazy'}/>:<span className="store-product-placeholder"><ShoppingBag size={30}/></span>}<span className="store-product-image-label">VER DETALLES <ArrowUpRight size={13}/></span></span></button>
      <div className="store-product-copy"><span className="store-product-category">{productGroup}</span><h3><button type="button" onClick={()=>openProduct(product)}>{product.name}</button></h3><p>{product.description || 'Cuéntanos qué tienes en mente y revisamos los detalles contigo.'}</p>{product.quantityTiers?.length ? <span className="store-product-tier-hint">{product.quantityTiers.length} opciones de cantidad</span> : null}<div className="store-product-card-bottom"><button type="button" className={`store-product-add${isSelected?' is-selected':''}`} aria-pressed={isSelected} onClick={()=>toggleSelection(product.id)}>{isSelected?<><Check size={15}/>En tu lista</>:<>+ Añadir a mi lista</>}</button><span>{product.quantityTiers?.length ? 'Opciones por cantidad' : 'Precio según proyecto'}</span></div><button type="button" className={`store-product-compare${isCompared?' is-selected':''}`} aria-pressed={isCompared} onClick={()=>toggleComparison(product.id)}><ArrowLeftRight size={14}/>{isCompared?'En comparación':'Comparar'}</button></div>
    </article>;
  };
  return <><DocumentTitle title="Tienda"/><div className="storefront-page">
    <section className="store-hero store-hero-commerce" aria-labelledby="store-title">
      <div className="store-hero-orbit store-hero-orbit-one"/><div className="store-hero-orbit store-hero-orbit-two"/>
      <div className="store-hero-inner"><div className="store-hero-copy"><span className="site-eyebrow light"><i/><ShoppingBag size={15}/>TIENDA VISUAL CORP</span>
        <h1 id="store-title">Tu próxima idea<br/><em>empieza aquí.</em></h1>
        <p>Encuentra productos para tu marca, evento o negocio. Reúne tus opciones y solicita una cotización con los detalles de tu proyecto.</p>
        <label className="storefront-search store-hero-search"><Search size={19}/><input ref={searchInput} aria-label="Buscar productos en la tienda" type="search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="¿Qué estás buscando?" autoComplete="off"/><kbd>Ctrl K</kbd>{search&&<button type="button" aria-label="Borrar búsqueda" onClick={()=>setSearch('')}><X size={16}/></button>}</label>
        <div className="store-hero-actions"><a className="site-primary-button" href="#catalogo-productos">Explorar productos <ArrowRight size={17}/></a><Link className="store-hero-secondary" to="/contacto">Quiero orientación <ArrowUpRight size={15}/></Link></div>
        <div className="store-hero-stats"><span><b>{loading ? '…' : products.length}</b><small>productos publicados</small></span><i/><span><b>A tu medida</b><small>cantidades al cotizar</small></span><i/><span><b>Milagro</b><small>atención directa</small></span></div>
      </div><div className="store-hero-showcase" aria-label="Una muestra del catálogo">{featuredPreview.length ? featuredPreview.map((product,index)=><button type="button" className={`store-hero-product store-hero-product-${index+1}`} key={product.id} onClick={()=>openProduct(product)} aria-label={`Ver ${product.name}`}>
        <span className="store-hero-product-image">{product.image ? <img src={product.image} alt=""/> : <ShoppingBag size={24}/>}</span><span className="store-hero-product-name">{product.name}</span><span className="store-hero-product-mark">0{index+1}</span>
      </button>) : <div className="store-hero-art-placeholder"><Sparkles size={30}/><span>Ideas en movimiento</span></div>}<span className="store-hero-art-label">CATÁLOGO · {loading ? 'VISUAL CORP' : `${products.length} IDEAS`}</span></div></div>
      <a className="store-hero-scroll" href="#catalogo">Desliza para explorar <span>↓</span></a>
    </section>
    <section className="store-promo-teaser" aria-labelledby="store-promo-teaser-title">
      <span className="store-promo-teaser-icon" aria-hidden="true"><Gift size={22}/></span>
      <div className="store-promo-teaser-copy"><span className="site-eyebrow"><i/>NOVEDADES DE LA TIENDA</span><h2 id="store-promo-teaser-title">Promociones y sorteos</h2><p>Consulta las campañas que Visual Corp publique oficialmente, con sus fechas y condiciones.</p></div>
      <Link className="store-promo-teaser-link" to="/tienda/promociones">Ver novedades <ArrowUpRight size={16}/></Link>
    </section>
    <section className="storefront-catalog" id="catalogo" aria-labelledby="store-catalog-title">
      <div className="storefront-heading"><div><span className="site-eyebrow"><i/>DESCUBRE LO QUE PODEMOS CREAR</span><h2 id="store-catalog-title">Explora por<br/><em>lo que necesitas.</em></h2><p>Encuentra opciones, añade las que te interesan y define cantidades, materiales y acabados al cotizar.</p></div><div className="storefront-promise"><span><Check size={15}/></span><div><b>Una lista. Una solicitud.</b><small>Tu selección se conserva en este dispositivo.</small></div></div></div>
      {!loading&&!error&&categoryModules.length>0&&<section className="store-category-discovery" aria-labelledby="store-category-title"><div className="store-module-heading"><div><span className="site-eyebrow"><i/>ENCUENTRA TU CATEGORÍA</span><h3 id="store-category-title">¿Qué tienes en mente?</h3></div><span>{categories.length} familias</span></div><div className="store-category-grid">{categoryModules.map(({name,count,product},index)=><button type="button" className={`store-category-card store-category-card-${index+1}${category===name?' is-active':''}`} key={name} aria-pressed={category===name} onClick={()=>{setCategory(name);scrollToCatalog();}}><span className="store-category-photo">{product?.image?<img src={product.image} alt="" loading="lazy"/>:<ShoppingBag size={25}/>}</span><span className="store-category-label"><b>{name}</b><small>{count} {count===1?'producto':'productos'}</small></span>{category===name?<Check size={17}/>:<ArrowUpRight size={16}/>}</button>)}</div></section>}
      {!loading&&!error&&featuredProducts.length>0&&<section className="store-featured-module" aria-labelledby="store-featured-title"><div className="store-module-heading"><div><span className="site-eyebrow"><i/>SELECCIÓN VISUAL CORP</span><h3 id="store-featured-title">Productos destacados</h3></div><button type="button" onClick={()=>{setCategory('Todos');scrollToCatalog();}}>Ver catálogo completo <ArrowRight size={15}/></button></div><div className="store-featured-grid">{featuredProducts.map(renderProductCard)}</div></section>}
      <div id="catalogo-productos" className="store-product-browser-heading"><div><span className="site-eyebrow"><i/>CATÁLOGO COMPLETO</span><h3>Encuentra tu producto</h3><p>Filtra por familia o busca por nombre, material y uso.</p></div></div>
      <div className="store-catalog-controls" role="region" aria-label="Búsqueda y filtros del catálogo">
        <div className="store-category-rail" role="group" aria-label="Filtrar por familia"><button className={category==='Todos'?'active':''} type="button" aria-pressed={category==='Todos'} onClick={()=>setCategory('Todos')}>Todo el catálogo <span>{products.length}</span></button>{categories.map(([name,count])=><button key={name} className={category===name?'active':''} type="button" aria-pressed={category===name} onClick={()=>setCategory(name)}>{name}<span>{count}</span></button>)}</div>
        <div className="store-results-toolbar"><div className="store-results-copy" aria-live="polite" aria-atomic="true"><b>{loading ? 'Cargando productos…' : `${matches.length} ${matches.length===1?'producto':'productos'}`}</b><span>{category==='Todos'?'en el catálogo':`en ${category}`}{search.trim()?` para “${search.trim()}”`:''}</span></div><div className="store-results-controls"><label className="store-inline-search"><Search size={15}/><input type="search" aria-label="Buscar en el catálogo" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar productos" autoComplete="off"/>{search&&<button type="button" aria-label="Borrar búsqueda" onClick={()=>setSearch('')}><X size={14}/></button>}</label><label className="store-results-sort">Ordenar por<select value={sort} onChange={(event)=>setSort(event.target.value)}><option value="relevance">Más relevantes</option><option value="az">Nombre: A a Z</option><option value="za">Nombre: Z a A</option></select></label>{(category!=='Todos'||search.trim())&&<button type="button" className="store-clear-filters" onClick={()=>{setSearch('');setCategory('Todos');}}>Limpiar filtros <X size={13}/></button>}</div></div>
      </div>
      {loading ? <div className="store-product-grid" role="status" aria-label="Cargando catálogo">{Array.from({length:8},(_,index)=><div className="store-product-skeleton" key={index}><i/><span/><b/></div>)}</div>
        : error ? <div className="store-state-card" role="alert"><span><ShoppingBag size={22}/></span><h3>No pudimos mostrar la tienda</h3><p>{error}</p><button type="button" className="site-primary-button" onClick={()=>{setLoading(true);setReloadKey((key)=>key+1);}}>Intentar de nuevo <ArrowRight size={16}/></button></div>
        : matches.length ? <><div className="store-product-grid">{matches.slice(0,visibleLimit).map(renderProductCard)}</div>{visibleLimit<matches.length&&<div className="store-load-more"><span>Viendo {Math.min(visibleLimit,matches.length)} de {matches.length}</span><button className="site-secondary-button" type="button" onClick={()=>setVisibleLimit((limit)=>Math.min(limit+24,matches.length))}>Cargar más productos <ArrowRight size={16}/></button></div>}</>
        : <div className="store-state-card"><span><Search size={22}/></span><h3>{search||category!=='Todos'?'No encontramos coincidencias':'El catálogo se está preparando'}</h3><p>{search||category!=='Todos'?'Cambia la búsqueda o prueba otra familia para encontrar productos.':'Cuando haya productos publicados, aparecerán aquí.'}</p>{(search||category!=='Todos')&&<button type="button" className="store-reset-button" onClick={()=>{setSearch('');setCategory('Todos');}}>Limpiar búsqueda y filtros <X size={15}/></button>}</div>}
    </section>
    <section className="store-help-band"><div><span className="site-eyebrow light"><i/>¿NO SABES POR DÓNDE EMPEZAR?</span><h2>Tu idea no tiene que<br/>llegar resuelta.</h2><p>Comparte el objetivo y te ayudamos a decidir qué pieza, medidas y acabados revisar.</p></div><Link className="site-primary-button" to="/contacto">Conversemos sobre tu idea <ArrowUpRight size={16}/></Link></section>
    {selectedProducts.length>0&&<aside className="store-selection-bar" aria-live="polite" aria-label="Resumen de tu lista para cotizar"><span className="store-selection-icon" aria-hidden="true"><ClipboardList size={18}/></span><span className="store-selection-count">{selectedProducts.length}</span><button type="button" className="store-selection-copy" aria-haspopup="dialog" onClick={()=>selectionDialog.current?.showModal()}><b>Tu lista para cotizar</b><small>{selectedProducts.slice(0,2).map((item)=>`${item.name}${selectionTiers[item.id]?` · ${selectionTiers[item.id]} uds.`:''}`).join(' · ')}{selectedProducts.length>2?` · +${selectedProducts.length-2}`:''} · Revisar lista</small></button><Link className="site-primary-button" to={quoteUrl(selectedProducts)}>Solicitar cotización <ArrowRight size={16}/></Link><button type="button" className="store-selection-clear" onClick={()=>{setSelection([]);setSelectionTiers({});}} aria-label="Vaciar lista">Vaciar</button></aside>}
    {comparedProducts.length>0&&<aside className={`store-compare-bar${selectedProducts.length?' has-quote-selection':''}`} aria-label="Productos seleccionados para comparar"><span className="store-compare-icon" aria-hidden="true"><ArrowLeftRight size={17}/></span><span className="store-compare-copy"><b>{comparedProducts.length} de 3 para comparar</b><small role="status" aria-live="polite">{comparisonNotice||comparedProducts.map((product)=>product.name).join(' · ')}</small></span>{comparedProducts.length>=2?<button type="button" className="store-compare-open" aria-haspopup="dialog" onClick={()=>comparisonDialog.current?.showModal()}>Comparar productos <ArrowRight size={15}/></button>:<span className="store-compare-hint">Añade 1 más</span>}<button type="button" className="store-compare-clear" onClick={()=>{setComparedIds([]);setComparisonNotice('');}} aria-label="Vaciar comparación">Vaciar</button></aside>}
    <dialog ref={comparisonDialog} className="store-compare-dialog" aria-labelledby="store-compare-title" onClick={(event)=>{if(event.target===comparisonDialog.current)comparisonDialog.current?.close();}}>
      <section className="store-compare-panel"><header className="store-compare-header"><div><span className="site-eyebrow"><i/><ArrowLeftRight size={14}/> COMPARACIÓN · {comparedProducts.length} PRODUCTOS</span><h2 id="store-compare-title">Compara tus opciones</h2><p>Revisa la información publicada antes de añadir productos a tu lista.</p></div><button type="button" className="store-detail-close" onClick={()=>comparisonDialog.current?.close()} aria-label="Cerrar comparación"><X size={19}/></button></header>
        {comparedProducts.length>=2&&<div className="store-compare-table-scroll" role="region" aria-label="Tabla de comparación. Desliza horizontalmente para ver todos los productos." tabIndex={0}><table className="store-compare-table"><caption className="sr-only">Comparación de familia, descripción, características y cantidades</caption><thead><tr><th className="store-compare-row-head" scope="col">Producto</th>{comparedProducts.map((product)=><th scope="col" key={product.id}><div className="store-compare-product-head"><span className="store-compare-product-image">{product.image?<img src={product.image} alt=""/>:<ShoppingBag size={20}/>}</span><b>{product.name}</b><button type="button" onClick={()=>toggleComparison(product.id)} aria-label={`Quitar ${product.name} de la comparación`}>Quitar</button></div></th>)}</tr></thead><tbody>
          <tr><th className="store-compare-row-head" scope="row">Familia</th>{comparedProducts.map((product)=><td key={product.id}><span className="store-product-category">{groupFor(product)}</span></td>)}</tr>
          <tr><th className="store-compare-row-head" scope="row">Descripción</th>{comparedProducts.map((product)=><td key={product.id}>{product.description||'Consulta los detalles al cotizar.'}</td>)}</tr>
          <tr><th className="store-compare-row-head" scope="row">Características</th>{comparedProducts.map((product)=><td key={product.id}>{product.features?.length?<ul className="store-compare-features">{product.features.filter((feature)=>typeof feature==='string'&&feature.trim()).map((feature)=><li key={feature}>{feature}</li>)}</ul>:<span className="store-compare-missing">Sin detalles adicionales publicados</span>}</td>)}</tr>
          <tr><th className="store-compare-row-head" scope="row">Cantidades</th>{comparedProducts.map((product)=><td key={product.id}>{product.quantityTiers?.length?<ul className="store-compare-features">{product.quantityTiers.map((tier)=><li key={tier}>{tier.replace(/(\d+)\.0\b/g,'$1')}</li>)}</ul>:<span className="store-compare-missing">Se define al cotizar</span>}</td>)}</tr>
          <tr><th className="store-compare-row-head" scope="row">Precio</th>{comparedProducts.map((product)=><td key={product.id}>Según proyecto</td>)}</tr>
          <tr><th className="store-compare-row-head" scope="row">Tu lista</th>{comparedProducts.map((product)=>{const isSelected=selection.includes(product.id);return <td key={product.id}><button type="button" className={`store-compare-quote${isSelected?' is-selected':''}`} aria-pressed={isSelected} onClick={()=>addToSelection(product.id)}>{isSelected?<><Check size={14}/>En mi lista</>:<>+ Añadir a mi lista</>}</button></td>;})}</tr>
        </tbody></table></div>}
        <footer className="store-compare-footer"><p>Los precios y detalles finales se confirman al cotizar cada proyecto.</p><button type="button" className="site-secondary-button" onClick={()=>comparisonDialog.current?.close()}>Seguir explorando</button></footer>
      </section>
    </dialog>
    <dialog ref={selectionDialog} className="store-selection-dialog" aria-labelledby="store-selection-title" onClick={(event)=>{if(event.target===selectionDialog.current)closeSelectionDialog();}}>
      <section className="store-selection-panel"><header className="store-selection-header"><div><span className="site-eyebrow"><i/><ClipboardList size={14}/> LISTA DE COTIZACIÓN · {selectedProducts.length}</span><h2 id="store-selection-title">Revisa tu selección</h2><p>Confirma los productos y define cantidades si ya las tienes.</p></div><button type="button" className="store-detail-close" onClick={closeSelectionDialog} aria-label="Cerrar lista"><X size={19}/></button></header>
        {selectedProducts.length>0?<ul className="store-selection-items">{selectedProducts.map((product)=>{const tier=selectionTiers[product.id]||'';return <li key={product.id}><span className="store-selection-item-image">{product.image?<img src={product.image} alt=""/>:<ShoppingBag size={20}/>}</span><div className="store-selection-item-copy"><span className="store-product-category">{groupFor(product)}</span><b>{product.name}</b>{product.quantityTiers?.length?<label>Rango de cantidad<select value={tier} onChange={(event)=>setSelectionTiers((current)=>({...current,[product.id]:event.target.value}))}><option value="">Aún no definido</option>{product.quantityTiers.map((quantity)=>{const clean=quantity.replace(/(\d+)\.0\b/g,'$1');return <option key={quantity} value={quantity}>{clean} {clean.trim()==='1'?'unidad':'unidades'}</option>;})}</select></label>:<small>La cantidad se define al cotizar</small>}</div><button type="button" className="store-selection-remove" onClick={()=>removeFromSelection(product.id)} aria-label={`Quitar ${product.name} de la lista`}><X size={16}/></button></li>;})}</ul>:<div className="store-selection-empty"><span><ShoppingBag size={25}/></span><h3>Tu lista está vacía</h3><p>Explora el catálogo y añade productos para preparar una cotización.</p><button type="button" className="site-secondary-button" onClick={closeSelectionDialog}>Seguir explorando <ArrowRight size={15}/></button></div>}
        {selectedProducts.length>0&&<footer className="store-selection-footer"><p>El precio y la disponibilidad se revisan con los detalles de cada proyecto.</p><Link className="site-primary-button" to={quoteUrl(selectedProducts)} onClick={closeSelectionDialog}>Continuar al cotizador <ArrowRight size={16}/></Link></footer>}
      </section>
    </dialog>
    <dialog ref={productDialog} className="store-product-dialog" aria-labelledby="store-product-dialog-title" onClose={onDialogClose} onClick={(event)=>{if(event.target===productDialog.current) closeProduct();}}>
      {selectedProduct&&<div className="store-product-detail"><button type="button" className="store-detail-close" onClick={closeProduct} aria-label="Cerrar ficha"><X size={19}/></button><StoreProductGallery product={selectedProduct}/><div className="store-detail-copy"><span className="site-eyebrow"><i/>{groupFor(selectedProduct)}</span><h2 id="store-product-dialog-title">{selectedProduct.name}</h2><span className="store-detail-sku"><span>Código de producto</span><code>{selectedProduct.sku || selectedProduct.id}</code></span><p>{selectedProduct.description || 'Comparte las características que necesitas y revisaremos la mejor forma de realizarlo.'}</p>{selectedProduct.features?.length? <ul className="store-detail-features">{selectedProduct.features.filter((feature)=>typeof feature==='string'&&feature.trim()).slice(0,5).map((feature)=><li key={feature}><Check size={14}/>{feature}</li>)}</ul>:null}{selectedProduct.quantityTiers?.length ? <div className="store-detail-quantity"><b>Rangos de cantidad</b><div role="group" aria-label="Selecciona un rango de cantidad">{selectedProduct.quantityTiers.map((tier)=>{const cleanTier=tier.replace(/(\d+)\.0\b/g,'$1');return <button key={tier} type="button" className={selectedQuantityTier===tier?'is-selected':''} aria-pressed={selectedQuantityTier===tier} onClick={()=>setSelectedQuantityTier(tier)}>{cleanTier} {cleanTier.trim()==='1'?'unidad':'unidades'}</button>;})}</div><small>El valor final se confirma al revisar los detalles de tu solicitud.</small></div> : null}<div className="store-detail-note"><b>Precio y disponibilidad</b><span>Se confirman al revisar cantidades, medidas, material y acabados de tu proyecto.</span></div><div className="store-detail-actions"><button type="button" className={`store-product-add${selection.includes(selectedProduct.id)?' is-selected':''}`} aria-pressed={selection.includes(selectedProduct.id)} onClick={()=>selection.includes(selectedProduct.id)?setSelectionTiers((current)=>({...current,[selectedProduct.id]:selectedQuantityTier})):toggleSelection(selectedProduct.id,selectedQuantityTier)}>{selection.includes(selectedProduct.id)?<><Check size={15}/>{selectedProduct.quantityTiers?.length?'Actualizar mi lista':'Añadido a tu lista'}</>:<>+ Añadir a mi lista</>}</button><Link className="site-primary-button" to={quoteUrl([selectedProduct],selectedQuantityTier)}>Cotizar este producto <ArrowUpRight size={16}/></Link></div></div></div>}
    </dialog>
  </div></>;
}



