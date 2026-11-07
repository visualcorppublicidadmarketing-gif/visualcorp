import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  Clock,
  Code2,
  Columns,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Image,
  Newspaper,
  Pencil,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { SiteAdminNav } from './SiteAdminNav';
import { MarkdownBlockEditor } from './MarkdownBlockEditor';
import { ArticlePreview } from '../../public-site/ArticleMarkdown';

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

type EditorState = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  image: string;
  kind: ContentKind;
  published: boolean;
  publishedAt: string | null;
};

const blankEditor: EditorState = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  image: '',
  kind: 'blog',
  published: false,
  publishedAt: null,
};

type ContentTemplate = {
  name: string;
  title: string;
  excerpt: string;
  body: string;
};

const TEMPLATES_BY_KIND: Record<ContentKind, ContentTemplate[]> = {
  blog: [
    {
      name: 'Guía paso a paso',
      title: 'Guía técnica: Cómo preparar tus archivos para rotulación e impresión de gran formato',
      excerpt: 'Aprende los estándares de color CMYK, resolución adecuada y sangrados necesarios para asegurar acabados nítidos y sin errores.',
      body: `## Introducción técnica

Preparar adecuadamente los artes finales ahorra costos de reimpresión y garantiza la máxima fidelidad cromática en nuestros plotters y mesas de acabado.

## 1. Espacio de color y resolución óptima

Para impresión publicitaria y señalética en gran formato:
- Trabaja siempre en modo de color **CMYK** (evita RGB para imprenta física).
- Para lonas y vallas exteriores (>3 metros), una resolución de **120 a 150 DPI a tamaño real** es suficiente.
- Para gigantografías vistas a corta distancia o rotulación vehicular, prepara a **200 a 300 DPI**.

## 2. Textos en curvas y sangrados perimetrales

Antes de exportar el archivo definitivo:
- Convierte todas las tipografías a contornos/curvas (\`Ctrl + Shift + O\` en Illustrator).
- Añade un mínimo de **3 a 5 mm de sangrado** perimetral para evitar bordes blancos en corte.

> Consejo Visual Corp: Deja un margen de seguridad interior de 3 cm respecto a costuras, ojales metálicos o bastidores de aluminio.

## 3. Formatos recomendados de entrega

- **PDF/X-1a** o PDF editable de alta resolución.
- **TIFF** con compresión LZW y canales acoplados.
- Archivos vectoriales originales (\`.AI\`, \`.EPS\`).`,
    },
    {
      name: 'Tendencias de branding / impresión',
      title: 'Tendencias de branding espacial e impresión comercial para este año',
      excerpt: 'Descubre los materiales sostenibles, iluminación LED arquitectónica y acabados hápticos que transforman puntos de venta.',
      body: `## La evolución del branding en espacios comerciales

El branding moderno supera el letrero tradicional: ahora busca crear atmósferas inmersivas donde cada cliente experimente la identidad de marca en tres dimensiones.

## Materiales de vanguardia y acabados táctiles

En Visual Corp implementamos combinaciones de alta durabilidad y elegancia:
- **Paneles de aluminio compuesto (ACM)** en acabados mate, cepillado y texturas amaderadas.
- **Acrílicos cristal y opal** cortados con láser CNC de precisión milimétrica.
- **Iluminación retroiluminada indirecta (Halo-lit)** con módulos LED de bajo consumo y temperatura cálida.

> La coherencia visual en fachadas e interiores incrementa el valor percibido del negocio hasta en un 40% desde la primera visita.

## Claves para renovar tu negocio

1. Unifica el lenguaje tipográfico en todos los ambientes.
2. Integra señalética direccional clara y accesible.
3. Asegura iluminación uniforme tanto de día como de noche.`,
    },
    {
      name: 'Consejos para empresas',
      title: '5 claves para maximizar el impacto visual de la fachada de tu negocio',
      excerpt: 'Estrategias de comunicación exterior, visibilidad vehicular y rotulación duradera para atraer nuevos clientes cada día.',
      body: `## Tu fachada comercial vende las 24 horas

Una fachada bien diseñada y rotulada con materiales profesionales es tu vendedor más constante y rentable.

## 1. Regla de los 3 segundos

Un peatón o conductor que circula frente a tu establecimiento solo dispone de 3 a 5 segundos para identificar quién eres y qué ofreces. La claridad y el contraste son fundamentales.

## 2. Contraste cromático y legibilidad

Evita combinaciones con bajo contraste (como gris sobre blanco o rojo sobre negro sin reborde). Utiliza tipografías geométricas o sans-serif legibles a distancia.

## 3. Rotulación vehicular como activo móvil

Si tu empresa cuenta con vehículos de distribución o visitas, rotularlos con vinil fundido de calidad industrial multiplica tus impactos publicitarios sin costo de alquiler mensual.

> En Visual Corp realizamos levantamiento técnico de medidas en sitio y simulaciones digitales antes de iniciar la producción.`,
    },
  ],
  publicaciones: [
    {
      name: 'Comunicado institucional',
      title: 'Comunicado oficial: Nuevos horarios de atención y recepción técnica de talleres',
      excerpt: 'Información institucional para nuestros clientes, agencias aliadas y proveedores sobre procesos de producción y entregas.',
      body: `## Estimados clientes y comunidad empresarial

Con el propósito de optimizar nuestros flujos de producción, manufactura y montajes en sitio, compartimos las actualizaciones operativas vigentes en Visual Corp.

## Horarios y canales de atención técnica

- **Recepción técnica y diseño:** Lunes a viernes de 08:30 a 18:00 en nuestra sede central de Milagro.
- **Taller de manufactura y rotulación:** Turnos continuos de corte, soldadura y termosellado.
- **Canal digital directo:** WhatsApp corporativo y plataforma Suite habilitados para seguimiento en tiempo real.

> Agradecemos su confianza continua en nuestros servicios de publicidad integral y producción gráfica.`,
    },
    {
      name: 'Lanzamiento / Promoción',
      title: 'Nueva temporada de soluciones visuales y acabados especiales',
      excerpt: 'Presentamos nuevos procesos de rotulación UV, letras corpóreas y señalética arquitectónica para el sector comercial e industrial.',
      body: `## Innovación y capacidad productiva en Visual Corp

Nos complace anunciar la incorporación de nuevos equipos y materiales certificados para satisfacer las exigencias de empresas de mediano y gran porte.

## Nuevas capacidades a tu disposición

- **Impresión UV curable en rígidos:** Aplicación directa sobre madera, vidrio, metal y PVC sintético sin necesidad de adhesivos.
- **Letras 3D corpóreas:** Fabricación automatizada en aluminio con cantos doblados por CNC y frente acrílico traslúcido.
- **Garantía extendida en exteriores:** Protección UV de fábrica contra decoloración solar e intemperie en la costa ecuatoriana.

> Consulta con nuestros asesores comerciales para acceder a demostraciones de muestras físicas en nuestro showroom.`,
    },
    {
      name: 'Novedad de taller',
      title: 'Novedades de producción: Nuevas capacidades técnicas en taller',
      excerpt: 'Ampliamos nuestra bahía de rotulación para atender flotas comerciales completas con tiempos récord de entrega.',
      body: `## Detrás de escena: Trabajo en taller

Para responder a la creciente demanda de rotulación de flotas de distribución e industriales, hemos expandido nuestra nave de aplicación técnica.

## Beneficios para tu flota

- **Espacio techado climatizado:** Libre de polvo y humedad ambiental para garantizar máxima adherencia del adhesivo.
- **Equipo certificado en viniles fundidos (Cast):** Especialistas en termoformado sobre molduras, curvas y remaches difíciles.
- **Tiempos reducidos:** Retiro de vinil anterior, preparación química de superficie y entrega en plazos pactados.`,
    },
  ],
  portafolio: [
    {
      name: 'Caso de éxito (Reto · Solución · Resultado)',
      title: 'Caso de éxito: Remodelación integral de fachada y letrero corpóreo monumental',
      excerpt: 'Diseño, fabricación estructural y montaje en altura de letrero 3D retroiluminado para reconocida cadena comercial.',
      body: `## El reto del cliente

El cliente necesitaba transformar una fachada antigua de 22 metros lineales en una arteria de alto tránsito, logrando alta visibilidad diurna y nocturna con bajo consumo energético.

## La solución de Visual Corp

- **Estructura base:** Bastidor autoportante de acero galvanizado con tratamiento anticorrosivo marino.
- **Revestimiento:** Paneles de aluminio compuesto (ACM) color gris carbón satinado con fijaciones ocultas.
- **Cuerpo tipográfico:** Letras corpóreas de 90 cm de altura en acrílico opal con laterales en aluminio lacado blanco.
- **Sistema lumínico:** Módulos LED Samsung IP68 con encendido automático programable mediante fotocélula.

## Resultado obtenido

> El resultado final logró un impacto visual inmediato, multiplicando la afluencia de clientes en las primeras semanas tras la inauguración.

## Ficha técnica

- **Cliente:** Sector Retail / Comercial
- **Ubicación:** Milagro, Guayas
- **Tiempo de producción y montaje:** 12 días calendario`,
    },
    {
      name: 'Instalación y rotulación en sitio',
      title: 'Instalación en sitio: Rotulación vehicular de flota comercial pesada',
      excerpt: 'Brandeo completo de camiones de carga con vinil reflectivo grado ingeniería y laminado de protección UV.',
      body: `## Alcance de la rotulación

Intervención de 8 unidades de transporte pesado destinadas a logística interprovincial, combinando estética de marca con normativas de seguridad vial.

## Procesos y materiales

- **Material:** Vinil fundido conformable con microcanales de aire antiburbujas.
- **Laminado:** Película transparente ultra brillante con bloqueador UV para resistir radiación y lavados a presión.
- **Detalles de seguridad:** Franjas reflectivas perimetrales homologadas grado diamante.

> Durabilidad garantizada ante condiciones climáticas severas, lluvia y barro de carretera.`,
    },
    {
      name: 'Producción corporativa',
      title: 'Producción corporativa: Señalética interior y decoración de oficinas',
      excerpt: 'Diseño e instalación de cuadros tensados en tela backlight, señalética en acrílico cristal y vinil esmerilado arquitectónico.',
      body: `## Ambientación corporativa moderna

Desarrollo de un concepto de ambientación visual que refleja la identidad de la empresa en cada área operativa, salas de reuniones y recepción.

## Componentes destacados

- **Recepción:** Isologo corpóreo en acero inoxidable con retroiluminación LED cálida sobre muro decorativo.
- **Salas de directorio:** Vinil esmerilado (frosted glass) con corte lineal para privacidad y diseño minimalista.
- **Pasillos y áreas comunes:** Cajas de luz LED ultradelgadas con gráfica textil intercambiable por silicona perimetral.

> Un entorno laboral armónico que inspira confianza a clientes y colaboradores.`,
    },
  ],
};

function kindFromTags(tags: string[] = []): ContentKind {
  const normalized = tags.map((tag) => tag.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  if (normalized.includes('portafolio') || normalized.includes('portfolio')) return 'portafolio';
  if (normalized.includes('publicacion') || normalized.includes('publicaciones')) return 'publicaciones';
  return 'blog';
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatKind(kind: ContentKind) {
  return kind === 'portafolio' ? 'Portafolio' : kind === 'publicaciones' ? 'Publicación' : 'Blog';
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function ArticleListThumbnail({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="article-list-thumb fallback" aria-hidden="true">
        <Image size={16} />
      </div>
    );
  }
  return (
    <div className="article-list-thumb">
      <img src={src} alt={`Portada de ${title}`} loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}

export function SiteArticleManager({ initialKind }: { initialKind?: ContentKind } = {}) {
  const { organizationId, user, hasPermission } = useAuth();
  const canPublish = hasPermission('website', 'publish_content');
  const [articles, setArticles] = useState<SiteArticle[]>([]);
  const [editor, setEditor] = useState<EditorState>(blankEditor);
  const [term, setTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bodyMode, setBodyMode] = useState<'blocks' | 'markdown'>('blocks');
  const [viewLayout, setViewLayout] = useState<'edit' | 'split' | 'preview'>('edit');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('site_articles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setArticles((data || []) as SiteArticle[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setCoverFailed(false);
  }, [editor.image]);

  useEffect(() => {
    if (initialKind) {
      setEditor((current) => ({ ...current, kind: initialKind }));
    }
  }, [initialKind]);

  // Section-scoped articles
  const sectionArticles = useMemo(() => {
    return articles.filter((article) => !initialKind || kindFromTags(article.tags) === initialKind);
  }, [articles, initialKind]);

  // Executive KPI stats scoped to this section
  const kpiStats = useMemo(() => {
    const total = sectionArticles.length;
    const published = sectionArticles.filter((a) => a.is_published).length;
    const drafts = sectionArticles.filter((a) => !a.is_published).length;
    const withCover = sectionArticles.filter((a) => Boolean(a.cover_image && a.cover_image.trim())).length;
    return { total, published, drafts, withCover };
  }, [sectionArticles]);

  // Filtered list with status pills and search query
  const filtered = useMemo(() => {
    return sectionArticles.filter((article) => {
      if (statusFilter === 'published' && !article.is_published) return false;
      if (statusFilter === 'draft' && article.is_published) return false;
      const termLower = term.trim().toLocaleLowerCase('es');
      if (!termLower) return true;
      return `${article.title} ${article.excerpt} ${article.slug}`.toLocaleLowerCase('es').includes(termLower);
    });
  }, [sectionArticles, statusFilter, term]);

  const editArticle = (article: SiteArticle) => {
    if (article.created_by && article.created_by !== user?.id) {
      setError('Por seguridad, solo puedes modificar entradas creadas por tu cuenta.');
      return;
    }
    setEditor({
      id: article.id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      body: article.body_markdown,
      image: article.cover_image || '',
      kind: kindFromTags(article.tags),
      published: article.is_published,
      publishedAt: article.published_at,
    });
    setBodyMode('blocks');
    setError('');
    setNotice('');
  };

  const reset = () => {
    setEditor({ ...blankEditor, kind: initialKind || 'blog' });
    setBodyMode('blocks');
    setError('');
    setNotice('');
    setConfirmDeleteId(null);
  };

  const duplicateArticle = (article: SiteArticle) => {
    setEditor({
      title: `${article.title} (Copia)`,
      slug: slugify(`${article.slug}-copia`),
      excerpt: article.excerpt,
      body: article.body_markdown,
      image: article.cover_image || '',
      kind: kindFromTags(article.tags),
      published: false,
      publishedAt: null,
    });
    setBodyMode('blocks');
    setError('');
    setNotice(`Borrador duplicado de "${article.title}". Modifica el contenido y guarda.`);
  };

  const togglePublishArticle = async (article: SiteArticle) => {
    if (!supabase || !organizationId || !canPublish) return;
    const canEdit = !article.created_by || article.created_by === user?.id;
    if (!canEdit) {
      setError('Por seguridad, solo puedes modificar entradas creadas por tu cuenta.');
      return;
    }
    const nextPublished = !article.is_published;
    const nextPublishedAt = nextPublished ? (article.published_at || new Date().toISOString()) : null;
    try {
      const { error: updateError } = await supabase
        .from('site_articles')
        .update({
          is_published: nextPublished,
          published_at: nextPublishedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', article.id)
        .eq('organization_id', organizationId);
      if (updateError) throw updateError;
      setNotice(nextPublished ? `"${article.title}" publicada en la web.` : `"${article.title}" pasada a borrador.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado de publicación.');
    }
  };

  const deleteArticle = async (articleId: string) => {
    if (!supabase || !organizationId) return;
    try {
      const { error: deleteError } = await supabase
        .from('site_articles')
        .delete()
        .eq('id', articleId)
        .eq('organization_id', organizationId);
      if (deleteError) throw deleteError;
      setNotice('Entrada eliminada de la base compartida.');
      setConfirmDeleteId(null);
      if (editor.id === articleId) {
        reset();
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la entrada.');
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !editor.title.trim() || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
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
      updated_at: new Date().toISOString(),
    };
    try {
      const result = editor.id
        ? await supabase.from('site_articles').update(values).eq('id', editor.id).eq('organization_id', organizationId)
        : await supabase.from('site_articles').insert({ ...values, created_by: user?.id || null });
      if (result.error) throw result.error;
      setNotice(editor.published ? 'Contenido publicado y listo para la página web.' : 'Borrador guardado sin mostrarlo en la página.');
      setEditor({ ...blankEditor, kind: initialKind || 'blog' });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el contenido.');
    } finally {
      setSaving(false);
    }
  };

  // SEO & Readability calculations
  const wordsCount = useMemo(() => {
    const raw = editor.body.trim();
    return raw ? raw.split(/\s+/).filter(Boolean).length : 0;
  }, [editor.body]);

  const readingTime = useMemo(() => {
    return Math.max(1, Math.ceil(wordsCount / 200));
  }, [wordsCount]);

  const basePath = editor.kind === 'portafolio' ? '/portafolio' : editor.kind === 'publicaciones' ? '/publicaciones' : '/blog';
  const targetSlug = editor.slug || slugify(editor.title) || 'url-del-articulo';
  const slugPreview = `${basePath}/${targetSlug}`;

  const handleCopyUrl = async () => {
    try {
      const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${slugPreview}` : slugPreview;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2200);
    } catch {
      // Fallback
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2200);
    }
  };

  const title = initialKind === 'portafolio' ? 'Portafolio' : initialKind === 'publicaciones' ? 'Publicaciones' : initialKind === 'blog' ? 'Blog' : 'Contenido del sitio';
  const activeTab = initialKind === 'portafolio' ? '/admin/portafolio' : initialKind === 'publicaciones' ? '/admin/publicaciones' : '/admin/blog';

  return (
    <AppFrame area="admin">
      <PageHeading
        eyebrow="EDITOR DEL SITIO"
        title={title}
        description="Crea borradores, ordénalos con bloques visuales y publica cada entrada en su sección correspondiente."
        action={
          <button className="button button-dark" type="button" onClick={reset}>
            <FilePlus2 size={16} /> Nuevo contenido
          </button>
        }
      />
      <SiteAdminNav active={activeTab} />

      {/* Executive KPI Strip */}
      <section className="site-admin-kpi-grid" aria-label="Métricas de contenido en esta sección">
        <div className="site-admin-kpi-card">
          <div className="kpi-icon total">
            <FileText size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Entradas en sección</span>
            <b className="kpi-value">{kpiStats.total}</b>
            <small className="kpi-hint">{initialKind ? formatKind(initialKind) : 'Sección activa'}</small>
          </div>
        </div>

        <div className="site-admin-kpi-card">
          <div className="kpi-icon is-published">
            <Eye size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Publicadas</span>
            <b className="kpi-value">{kpiStats.published}</b>
            <small className="kpi-hint">Visibles en la web</small>
          </div>
        </div>

        <div className="site-admin-kpi-card">
          <div className="kpi-icon is-draft">
            <EyeOff size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Borradores</span>
            <b className="kpi-value">{kpiStats.drafts}</b>
            <small className="kpi-hint">En redacción interna</small>
          </div>
        </div>

        <div className="site-admin-kpi-card">
          <div className="kpi-icon is-cover">
            <Image size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Con portada</span>
            <b className="kpi-value">{kpiStats.withCover}</b>
            <small className="kpi-hint">Con imagen visual</small>
          </div>
        </div>
      </section>

      <div className="site-content-admin-grid">
        <form className="panel form-panel site-content-editor" onSubmit={save}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{editor.id ? 'EDITAR CONTENIDO' : 'NUEVO CONTENIDO'}</span>
              <h2>{editor.id ? editor.title || 'Sin título' : 'Crea una entrada'}</h2>
            </div>
            {editor.kind === 'portafolio' ? (
              <BriefcaseBusiness size={19} />
            ) : editor.kind === 'publicaciones' ? (
              <Newspaper size={19} />
            ) : (
              <BookOpen size={19} />
            )}
          </div>

          {notice && (
            <div className="site-content-notice" role="status">
              <Check size={15} />
              {notice}
            </div>
          )}

          {error && (
            <div className="op-flow-alert error" role="alert">
              {error}
            </div>
          )}

          {initialKind ? (
            <div className="site-content-kind-lock">
              <span>Sección</span>
              <b>{formatKind(initialKind)}</b>
              <small>El contenido nuevo se guardará en esta sección.</small>
            </div>
          ) : (
            <label>
              Tipo de contenido
              <select
                value={editor.kind}
                onChange={(event) => setEditor((current) => ({ ...current, kind: event.target.value as ContentKind }))}
              >
                <option value="blog">Artículo de blog</option>
                <option value="publicaciones">Publicación</option>
                <option value="portafolio">Proyecto de portafolio</option>
              </select>
            </label>
          )}

          {/* Quick Content Starters / Templates */}
          {(!editor.body.trim() || !editor.id) && (
            <div className="site-content-templates">
              <div className="templates-header">
                <Sparkles size={14} className="templates-sparkle-icon" />
                <span>Plantillas rápidas para {formatKind(editor.kind)}:</span>
              </div>
              <div className="templates-pills">
                {TEMPLATES_BY_KIND[editor.kind]?.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    className="template-pill-button"
                    onClick={() => {
                      setEditor((current) => ({
                        ...current,
                        title: current.title ? current.title : tpl.title,
                        slug: current.slug ? current.slug : slugify(tpl.title),
                        excerpt: current.excerpt ? current.excerpt : tpl.excerpt,
                        body: tpl.body,
                      }));
                      setNotice(`Plantilla "${tpl.name}" cargada en el editor.`);
                    }}
                  >
                    <FileText size={12} />
                    <span>{tpl.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label>
            Título
            <input
              required
              value={editor.title}
              onChange={(event) =>
                setEditor((current) => ({
                  ...current,
                  title: event.target.value,
                  slug: current.id || current.slug ? current.slug : slugify(event.target.value),
                }))
              }
              placeholder="Título visible de la entrada"
            />
          </label>

          <label>
            URL del contenido (slug)
            <input
              value={editor.slug}
              onChange={(event) => setEditor((current) => ({ ...current, slug: slugify(event.target.value) }))}
              placeholder="se-genera-desde-el-titulo"
            />
          </label>

          <label>
            Descripción breve
            <textarea
              rows={3}
              value={editor.excerpt}
              onChange={(event) => setEditor((current) => ({ ...current, excerpt: event.target.value }))}
              placeholder="Resumen atractivo para tarjetas, listados y buscadores..."
            />
          </label>

          <label>
            Imagen de portada (URL)
            <input
              type="url"
              value={editor.image}
              onChange={(event) => setEditor((current) => ({ ...current, image: event.target.value }))}
              placeholder="https://..."
            />
          </label>

          {/* SEO & Readability Meter Bar */}
          <div className="site-content-seo-bar">
            <div className="seo-metric">
              <span className="seo-metric-label">Palabras:</span>
              <b className="seo-metric-value">{wordsCount}</b>
            </div>
            <div className="seo-metric">
              <Clock size={13} />
              <span>~{readingTime} min de lectura</span>
            </div>
            <div className="seo-metric seo-url-preview">
              <span className="seo-metric-label">Ruta web:</span>
              <code className="seo-slug-pill">{slugPreview}</code>
              <button
                type="button"
                className="button-copy-url"
                onClick={handleCopyUrl}
                title="Copiar ruta de URL al portapapeles"
              >
                {copiedUrl ? (
                  <>
                    <Check size={12} /> Copiada
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copiar URL
                  </>
                )}
              </button>
            </div>
            {editor.image.trim() && (
              <div className="seo-metric seo-cover-check">
                <span className="seo-metric-label">Portada:</span>
                {coverFailed ? (
                  <span className="cover-badge error">⚠️ Falló imagen</span>
                ) : (
                  <span className="cover-badge ok">
                    <img
                      src={editor.image.trim()}
                      alt="Miniatura de portada"
                      onError={() => setCoverFailed(true)}
                      className="seo-cover-thumb"
                    />
                    OK
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Body Heading with Format Switch & Layout View Mode Switch */}
          <div className="site-content-body-heading">
            <div className="site-content-heading-left">
              <label htmlFor="site-content-body">Contenido</label>
              <div className="site-content-mode-switch" role="group" aria-label="Modo de edición">
                <button
                  type="button"
                  className={bodyMode === 'blocks' ? 'is-active' : ''}
                  onClick={() => setBodyMode('blocks')}
                  title="Editor visual con bloques modulares"
                >
                  <Pencil size={13} /> Bloques
                </button>
                <button
                  type="button"
                  className={bodyMode === 'markdown' ? 'is-active' : ''}
                  onClick={() => setBodyMode('markdown')}
                  title="Editor de código Markdown"
                >
                  <Code2 size={13} /> Markdown
                </button>
              </div>
            </div>

            <div className="site-content-layout-switch" role="group" aria-label="Disposición de pantalla">
              <button
                type="button"
                className={viewLayout === 'edit' ? 'is-active' : ''}
                onClick={() => setViewLayout('edit')}
                title="Editor a ancho completo con espacio amplio"
              >
                <Edit3 size={13} /> Edición
              </button>
              <button
                type="button"
                className={viewLayout === 'split' ? 'is-active' : ''}
                onClick={() => setViewLayout('split')}
                title="Editor y vista previa en columnas divididas"
              >
                <Columns size={13} /> Dividido
              </button>
              <button
                type="button"
                className={viewLayout === 'preview' ? 'is-active' : ''}
                onClick={() => setViewLayout('preview')}
                title="Vista previa completa del artículo"
              >
                <Eye size={13} /> Vista previa
              </button>
            </div>
          </div>

          {/* Editor Workspace Studio Grid */}
          <div className={`site-content-studio-grid layout-${viewLayout}`}>
            {(viewLayout === 'edit' || viewLayout === 'split') && (
              <div className="site-content-editor-pane">
                {bodyMode === 'blocks' ? (
                  <MarkdownBlockEditor
                    key={editor.id || 'new'}
                    value={editor.body}
                    onChange={(body) => setEditor((current) => ({ ...current, body }))}
                  />
                ) : (
                  <textarea
                    id="site-content-body"
                    className="site-content-body-field"
                    rows={16}
                    value={editor.body}
                    onChange={(event) => setEditor((current) => ({ ...current, body: event.target.value }))}
                    placeholder="Escribe Markdown directo. Separa párrafos con una línea en blanco."
                  />
                )}
              </div>
            )}

            {(viewLayout === 'preview' || viewLayout === 'split') && (
              <section className="site-content-preview-panel">
                <div className="site-content-preview-heading">
                  <span>VISTA PREVIA PÚBLICA</span>
                  <small>Se actualiza mientras editas</small>
                </div>
                <ArticlePreview
                  title={editor.title}
                  excerpt={editor.excerpt}
                  cover={editor.image}
                  body={editor.body}
                  kind={editor.kind}
                />
              </section>
            )}
          </div>

          <label className="toggle-row site-content-publish">
            <span>
              <b>Visible en la página web</b>
              <small>
                {canPublish
                  ? 'Al publicar, aparecerá de inmediato en la sección elegida.'
                  : 'Tu perfil puede guardar borradores; hace falta permiso de publicación para mostrarlo.'}
              </small>
            </span>
            <input
              type="checkbox"
              disabled={!canPublish}
              checked={editor.published}
              onChange={(event) => setEditor((current) => ({ ...current, published: event.target.checked }))}
            />
          </label>

          <div className="site-content-actions">
            <button className="button button-dark" type="submit" disabled={saving || !editor.title.trim()}>
              <Save size={16} />
              {saving ? 'Guardando…' : 'Guardar contenido'}
            </button>
            <button className="button button-light" type="button" onClick={reset}>
              Limpiar
            </button>
          </div>
        </form>

        {/* Existing Entries List */}
        <section className="panel site-content-list">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CMS COMPARTIDO</span>
              <h2>Entradas existentes</h2>
            </div>
            <span className="muted-count">{filtered.length} en esta sección</span>
          </div>

          {/* Search Box with Inline Icon & Clear Button */}
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Buscar título o URL en esta sección..."
            />
            {term && (
              <button
                type="button"
                className="search-clear-button"
                onClick={() => setTerm('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="site-admin-filter-pills" role="tablist" aria-label="Filtrar por estado">
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Todos <span className="pill-count">{sectionArticles.length}</span>
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'published' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('published')}
            >
              Publicados <span className="pill-count">{kpiStats.published}</span>
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'draft' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('draft')}
            >
              Borradores <span className="pill-count">{kpiStats.drafts}</span>
            </button>
          </div>

          {loading ? (
            <div className="empty-state">Cargando contenido…</div>
          ) : filtered.length ? (
            <div className="site-content-list-items">
              {filtered.map((article) => {
                const kind = kindFromTags(article.tags);
                const path = kind === 'portafolio' ? '/portafolio' : kind === 'publicaciones' ? '/publicaciones' : '/blog';
                const canEdit = !article.created_by || article.created_by === user?.id;
                const isSelected = editor.id === article.id;
                const isConfirmingDelete = confirmDeleteId === article.id;

                return (
                  <article
                    className={`site-content-list-item ${isSelected ? 'is-active-editor' : ''}`}
                    key={article.id}
                  >
                    <ArticleListThumbnail src={article.cover_image} title={article.title} />

                    <div className="site-content-list-copy">
                      <div className="article-title-row">
                        <b>{article.title}</b>
                        <span className={`site-content-status ${article.is_published ? 'published' : 'draft'}`}>
                          {article.is_published ? (
                            <>
                              <Eye size={12} /> Publicado
                            </>
                          ) : (
                            <>
                              <EyeOff size={12} /> Borrador
                            </>
                          )}
                        </span>
                      </div>

                      <div className="article-meta-row">
                        <span className={`site-content-type type-${kind}`}>
                          {kind === 'portafolio' ? (
                            <BriefcaseBusiness size={12} />
                          ) : kind === 'publicaciones' ? (
                            <Newspaper size={12} />
                          ) : (
                            <BookOpen size={12} />
                          )}
                          {formatKind(kind)}
                        </span>
                        <small className="article-slug-text">
                          {path}/{article.slug}
                        </small>
                        <span className="article-date-sep">·</span>
                        <small className="article-updated-date">Act: {formatDate(article.updated_at)}</small>
                      </div>
                    </div>

                    <div className="site-content-item-actions">
                      <button
                        type="button"
                        className="icon-button edit"
                        aria-label={canEdit ? `Editar ${article.title}` : `${article.title}, solo lectura`}
                        disabled={!canEdit}
                        onClick={() => editArticle(article)}
                        title="Editar entrada en el formulario"
                      >
                        <Pencil size={15} />
                      </button>

                      {canPublish && canEdit && (
                        <button
                          type="button"
                          className={`icon-button toggle-pub ${article.is_published ? 'is-pub' : ''}`}
                          onClick={() => togglePublishArticle(article)}
                          title={article.is_published ? 'Ocultar (pasar a borrador)' : 'Publicar en la web'}
                          aria-label={article.is_published ? 'Ocultar' : 'Publicar'}
                        >
                          {article.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      )}

                      <button
                        type="button"
                        className="icon-button duplicate"
                        onClick={() => duplicateArticle(article)}
                        title="Duplicar como nuevo borrador"
                        aria-label="Duplicar como nuevo borrador"
                      >
                        <Copy size={15} />
                      </button>

                      {canEdit && (
                        isConfirmingDelete ? (
                          <div className="inline-confirm-delete">
                            <button
                              type="button"
                              className="confirm-delete-btn"
                              onClick={() => deleteArticle(article.id)}
                              title="Confirmar eliminación permanente"
                            >
                              ¿Confirmar?
                            </button>
                            <button
                              type="button"
                              className="cancel-delete-btn"
                              onClick={() => setConfirmDeleteId(null)}
                              title="Cancelar"
                              aria-label="Cancelar eliminación"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="icon-button delete"
                            onClick={() => setConfirmDeleteId(article.id)}
                            title="Eliminar entrada"
                            aria-label="Eliminar entrada"
                          >
                            <Trash2 size={15} />
                          </button>
                        )
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span>
                <BookOpen size={19} />
              </span>
              <b>No hay entradas que coincidan</b>
              <p>Prueba con otros términos de búsqueda o crea una nueva entrada desde el formulario.</p>
            </div>
          )}
        </section>
      </div>
    </AppFrame>
  );
}

export function BlogAdmin() {
  return <SiteArticleManager initialKind="blog" />;
}

export function PublicationsAdmin() {
  return <SiteArticleManager initialKind="publicaciones" />;
}

export function PortfolioAdmin() {
  return <SiteArticleManager initialKind="portafolio" />;
}
