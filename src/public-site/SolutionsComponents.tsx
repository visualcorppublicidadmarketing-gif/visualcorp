import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  Layers,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Truck,
  Users,
} from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import { BorderBeam, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import { Dialog, DialogCallout } from '../components/ui/DialogSystem';
import { publicServiceFamilies, serviceDetailContent, type PublicServiceId } from './content';
import {
  brandingEnvironments,
  getPiecesForService,
  panoramicProductStrips,
  showcasePieces,
  strategicBenefits,
  workGalleryCategories,
  type ShowcasePiece,
  type WorkGalleryCategoryId,
} from './solutionsCatalog';
import './solutions-showcase.css';

const benefitIcons: Record<string, typeof Eye> = {
  visibilidad: Eye,
  diferenciacion: Star,
  durabilidad: ShieldCheck,
  cultura: Users,
};

const environmentIcons: Record<string, typeof Store> = {
  local: Store,
  oficina: Building2,
  vehiculo: Truck,
  eventos: Layers,
};

function serviceNameById(serviceId: PublicServiceId, services: Array<{ id: string; name: string }>) {
  return (
    services.find((item) => item.id === serviceId)?.name ||
    publicServiceFamilies.find((item) => item.id === serviceId)?.name ||
    'Impresión y papelería'
  );
}

/**
 * 1. Matriz de Branding por Escenario: Local Comercial · Oficina · Vehículo · Eventos/BTL
 * Inspirada y superando el desglose por espacios de estudios de branding y rotulación.
 */
export function EnvironmentBrandingMatrix({ compact = false }: { compact?: boolean }) {
  const { data } = useWorkspace();
  const [imageSeries, setImageSeries] = useState<'marcas' | 'visualcorp'>('marcas');
  const displayedEnvironments = compact ? brandingEnvironments.slice(0, 3) : brandingEnvironments;

  return (
    <section className="vc-sol-section vc-sol-environments" aria-labelledby="vc-sol-env-title">
      <div className="vc-sol-section-header">
        <div>
          <span className="site-eyebrow">
            <i /> SOLUCIONES POR ESCENARIO
          </span>
          <h2 id="vc-sol-env-title">
            Ideas de branding para tu local,
            <br />
            <span>oficina, flota y eventos.</span>
          </h2>
        </div>
        <div className="vc-sol-header-controls">
          <p>
            Explora referencias de piezas gráficas y señalización que podrías consultar según el espacio donde interactúas con tus clientes.
          </p>
          <div className="vc-sol-series-switch" role="group" aria-label="Cambiar estilo de ejemplos visuales">
            <button
              type="button"
              className={imageSeries === 'marcas' ? 'is-active' : ''}
              onClick={() => setImageSeries('marcas')}
            >
              Referencias comerciales
            </button>
            <button
              type="button"
              className={imageSeries === 'visualcorp' ? 'is-active' : ''}
              onClick={() => setImageSeries('visualcorp')}
            >
              Serie Visual Corp
            </button>
          </div>
        </div>
      </div>

      <p className="vc-sol-gallery-note" role="note">Las imágenes y listas son referencias orientativas; materiales, procesos, alcance y disponibilidad se confirman para cada solicitud.</p>

      <div className={`vc-sol-env-grid cols-${displayedEnvironments.length}`}>
        {displayedEnvironments.map((env, index) => {
          const EnvIcon = environmentIcons[env.id] || Store;
          const serviceName = serviceNameById(env.serviceId, data.services);
          const mainImage = imageSeries === 'marcas' ? env.primaryImage : env.secondaryImage;
          const secondaryImage = imageSeries === 'marcas' ? env.secondaryImage : env.primaryImage;

          return (
            <article
              key={env.id}
              className="vc-sol-env-card vc-magic-card"
              onPointerMove={updateSpotlight}
              onPointerLeave={clearSpotlight}
            >
              <SpotlightLayer />
              {index === 0 && <BorderBeam />}
              <div className="vc-sol-env-media">
                <img src={mainImage} alt={`${env.title} — soluciones de branding y rotulación`} loading="lazy" />
                <img
                  className="vc-sol-env-media-floating"
                  src={secondaryImage}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                />
                <span className="vc-sol-env-badge">
                  <EnvIcon size={14} aria-hidden="true" /> 0{index + 1} · {env.title.toUpperCase()}
                </span>
              </div>

              <div className="vc-sol-env-body">
                <h3>{env.title}</h3>
                <p>{env.subtitle}</p>

                <ul className="vc-sol-env-checklist" aria-label={`Soluciones para ${env.title}`}>
                  {env.items.map((item) => (
                    <li key={item}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      <Link
                        to={`/cotizador?servicio=${encodeURIComponent(serviceName)}&producto=${encodeURIComponent(item)}`}
                        title={`Cotizar ${item}`}
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="vc-sol-env-footer">
                  <Link
                    className="vc-sol-env-cta"
                    to={`/cotizador?servicio=${encodeURIComponent(serviceName)}`}
                  >
                    Cotizar para {env.title.toLowerCase()} <ArrowUpRight size={16} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 2. Bloque estratégico: ¿Por qué es importante el branding de tus espacios y vehículos?
 * (Visibilidad · Diferenciación · Materiales / Durabilidad · Cultura Corporativa)
 */
export function StrategicBenefitsGrid({ title }: { title?: string }) {
  return (
    <section className="vc-sol-section vc-sol-benefits" aria-labelledby="vc-sol-benefits-title">
      <div className="vc-sol-benefits-header">
        <span className="site-eyebrow">
          <i /> VALOR ESTRATÉGICO PARA TU MARCA
        </span>
        <h2 id="vc-sol-benefits-title">
          {title || '¿Por qué es importante el branding de tus espacios, productos y vehículos?'}
        </h2>
        <p>
          La marca se vuelve más reconocible y memorable ante el público. En locales ordena la experiencia de compra y en vehículos se convierte en publicidad móvil todos los días.
        </p>
      </div>

      <div className="vc-sol-benefits-grid">
        {strategicBenefits.map((benefit, index) => {
          const Icon = benefitIcons[benefit.id] || Sparkles;
          return (
            <article
              key={benefit.id}
              className="vc-sol-benefit-card vc-magic-card"
              onPointerMove={updateSpotlight}
              onPointerLeave={clearSpotlight}
            >
              <SpotlightLayer />
              <div className="vc-sol-benefit-top">
                <span className="vc-sol-benefit-icon">
                  <Icon size={26} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="vc-sol-benefit-num">0{index + 1}</span>
              </div>
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
              <span className="vc-sol-benefit-tag">
                <Check size={13} aria-hidden="true" /> {benefit.highlight}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 3. Tiras verticales panorámicas interactivas (Estilo Creative Group / BTL Pro)
 * Con efecto acordeón panorámico en desktop y vista adaptable en móvil.
 */
export function PanoramicCategoryStrips() {
  const { data } = useWorkspace();
  const [useAltSeries, setUseAltSeries] = useState(false);
  const [activeSliceByStrip, setActiveSliceByStrip] = useState<Record<string, string>>({});

  return (
    <section className="vc-sol-section vc-sol-panoramic" aria-labelledby="vc-sol-panoramic-title">
      <div className="vc-sol-section-header">
        <div>
          <span className="site-eyebrow">
            <i /> LÍNEAS DESTACADAS DE PRODUCCIÓN
          </span>
          <h2 id="vc-sol-panoramic-title">
            Exhibición panorámica
            <br />
            <span>por línea de impacto.</span>
          </h2>
        </div>
        <div className="vc-sol-header-controls">
          <p>
            Pasa el cursor o selecciona cada columna vertical para expandir la pieza y preparar tu cotización directa.
          </p>
          <button
            type="button"
            className="vc-sol-toggle-btn"
            onClick={() => setUseAltSeries((prev) => !prev)}
          >
            <Sparkles size={14} aria-hidden="true" />
            {useAltSeries ? 'Viendo: Serie Visual Corp' : 'Viendo: Ejemplos de Marcas'} (Cambiar)
          </button>
        </div>
      </div>

      <div className="vc-sol-strips-stack">
        {panoramicProductStrips.map((strip) => {
          const serviceName = serviceNameById(strip.serviceId, data.services);
          const activeSliceId = activeSliceByStrip[strip.id] || strip.slices[0].id;

          return (
            <div key={strip.id} className="vc-sol-strip-block">
              <div className="vc-sol-strip-head">
                <div>
                  <span className="vc-sol-strip-eyebrow">{strip.eyebrow}</span>
                  <h3>{strip.title}</h3>
                  <p>{strip.subtitle}</p>
                </div>
                <Link className="site-secondary-button" to={`/servicios/${strip.serviceId}`}>
                  Ver especialidad <ArrowRight size={15} />
                </Link>
              </div>

              <div className="vc-sol-strip-accordion" role="list">
                {strip.slices.map((slice) => {
                  const isExpanded = activeSliceId === slice.id;
                  const imgSrc = useAltSeries ? slice.altImage : slice.image;
                  return (
                    <article
                      key={slice.id}
                      role="listitem"
                      className={`vc-sol-slice${isExpanded ? ' is-expanded' : ''}`}
                      onMouseEnter={() =>
                        setActiveSliceByStrip((prev) => ({ ...prev, [strip.id]: slice.id }))
                      }
                      onFocus={() =>
                        setActiveSliceByStrip((prev) => ({ ...prev, [strip.id]: slice.id }))
                      }
                      onClick={() =>
                        setActiveSliceByStrip((prev) => ({ ...prev, [strip.id]: slice.id }))
                      }
                    >
                      <img src={imgSrc} alt={slice.title} loading="lazy" />
                      <div className="vc-sol-slice-overlay">
                        <span className="vc-sol-slice-tag">{slice.tag}</span>
                        <div className="vc-sol-slice-content">
                          <h4>{slice.title}</h4>
                          <Link
                            className="vc-sol-slice-cta"
                            to={`/cotizador?servicio=${encodeURIComponent(serviceName)}&producto=${encodeURIComponent(slice.productQuery)}`}
                          >
                            Cotizar pieza <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 4. Galería Interactiva Filtrable de Trabajos y Soluciones (Estilo MarketVision /trabajos/ llevado al siguiente nivel)
 * Incluye pestañas: Todo | Señalética | Letreros | Branding | BTL / Exhibición | Impresión | Textil | Promocionales
 */
export function InteractiveCatalogGallery({
  initialCategory = 'todo',
  heading = 'Explora ideas y referencias para cotizar',
  eyebrow = 'CATÁLOGO VISUAL INTERACTIVO',
}: {
  initialCategory?: WorkGalleryCategoryId;
  heading?: string;
  eyebrow?: string;
}) {
  const { data } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategory = (searchParams.get('categoria') as WorkGalleryCategoryId) || initialCategory;
  const [activeCategory, setActiveCategory] = useState<WorkGalleryCategoryId>(
    workGalleryCategories.some((cat) => cat.id === urlCategory) ? urlCategory : 'todo'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [visualMode, setVisualMode] = useState<'marcas' | 'visualcorp' | 'real'>('marcas');
  const [selectedPiece, setSelectedPiece] = useState<ShowcasePiece | null>(null);
  const [modalImageMode, setModalImageMode] = useState<'marcas' | 'visualcorp' | 'real'>('marcas');

  const selectCategory = (catId: WorkGalleryCategoryId) => {
    setActiveCategory(catId);
    const next = new URLSearchParams(searchParams);
    if (catId === 'todo') next.delete('categoria');
    else next.set('categoria', catId);
    setSearchParams(next, { replace: true });
  };

  const filteredPieces = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return showcasePieces.filter((piece) => {
      const matchesCat = activeCategory === 'todo' || piece.category === activeCategory;
      if (!matchesCat) return false;
      if (!query) return true;
      const haystack = `${piece.title} ${piece.subtitle} ${piece.description} ${piece.environment} ${piece.specs.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeCategory, searchQuery]);

  const activeCategoryMeta =
    workGalleryCategories.find((cat) => cat.id === activeCategory) || workGalleryCategories[0];

  const getImageForPiece = (piece: ShowcasePiece, mode: 'marcas' | 'visualcorp' | 'real') => {
    if (mode === 'real' && piece.imageRealPhoto) return piece.imageRealPhoto;
    if (mode === 'visualcorp') return piece.imageVisualCorp;
    return piece.imageBrandExample;
  };

  const openPieceModal = (piece: ShowcasePiece) => {
    setSelectedPiece(piece);
    setModalImageMode(visualMode === 'real' && !piece.imageRealPhoto ? 'marcas' : visualMode);
  };

  return (
    <section className="vc-sol-section vc-sol-gallery" aria-labelledby="vc-sol-gallery-title">
      <div className="vc-sol-section-header">
        <div>
          <span className="site-eyebrow">
            <i /> {eyebrow}
          </span>
          <h2 id="vc-sol-gallery-title">{heading}</h2>
          <p className="vc-sol-gallery-desc">{activeCategoryMeta.description}</p>
          <p className="vc-sol-gallery-note" role="note">Las imágenes y fichas son referencias orientativas. Técnica, material, medidas, configuración, cantidad y disponibilidad se confirman para cada solicitud.</p>
        </div>

        <div className="vc-sol-gallery-controls">
          <label className="vc-sol-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Buscar pieza o solución</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar letrero, vinil, señalética, taza, stand…"
            />
          </label>

          <div className="vc-sol-series-switch" role="group" aria-label="Modo de vista de imágenes">
            <button
              type="button"
              className={visualMode === 'marcas' ? 'is-active' : ''}
              onClick={() => setVisualMode('marcas')}
            >
              Ejemplos de marca
            </button>
            <button
              type="button"
              className={visualMode === 'visualcorp' ? 'is-active' : ''}
              onClick={() => setVisualMode('visualcorp')}
            >
              Serie Visual Corp
            </button>
            <button
              type="button"
              className={visualMode === 'real' ? 'is-active' : ''}
              onClick={() => setVisualMode('real')}
            >
              Incluir referencias adicionales
            </button>
          </div>
        </div>
      </div>

      {/* Barra de pestañas estilo MarketVision /trabajos/ pero con contadores en vivo */}
      <div className="vc-sol-filter-tabs" role="tablist" aria-label="Filtrar por categoría de trabajo">
        {workGalleryCategories.map((category) => {
          const isSelected = activeCategory === category.id;
          const count =
            category.id === 'todo'
              ? showcasePieces.length
              : showcasePieces.filter((item) => item.category === category.id).length;

          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`vc-sol-filter-tab${isSelected ? ' is-active' : ''}`}
              onClick={() => selectCategory(category.id)}
            >
              <span>{category.shortLabel}</span>
              <small>{count}</small>
            </button>
          );
        })}
      </div>

      {filteredPieces.length === 0 ? (
        <div className="vc-sol-empty">
          <h3>No encontramos piezas para “{searchQuery}”.</h3>
          <p>Prueba con otra palabra o explora todas las categorías disponibles.</p>
          <button
            type="button"
            className="site-secondary-button"
            onClick={() => {
              setSearchQuery('');
              selectCategory('todo');
            }}
          >
            Mostrar todas las soluciones
          </button>
        </div>
      ) : (
        <div className="vc-sol-cards-grid">
          {filteredPieces.map((piece) => {
            const serviceName = serviceNameById(piece.serviceId, data.services);
            const primaryImg = getImageForPiece(piece, visualMode);
            const secondaryImg =
              visualMode === 'visualcorp' ? piece.imageBrandExample : piece.imageVisualCorp;

            return (
              <article
                key={piece.id}
                className="vc-sol-piece-card vc-magic-card"
                onPointerMove={updateSpotlight}
                onPointerLeave={clearSpotlight}
              >
                <SpotlightLayer />
                <div className="vc-sol-piece-image-wrap" onClick={() => openPieceModal(piece)}>
                  <img className="vc-sol-piece-img-main" src={primaryImg} alt={piece.title} loading="lazy" />
                  <img
                    className="vc-sol-piece-img-hover"
                    src={secondaryImg}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                  />
                  <span className="vc-sol-piece-env">{piece.environment}</span>
                  {piece.imageRealPhoto && (
                    <span className="vc-sol-piece-real-badge">Referencia visual adicional</span>
                  )}
                  <button
                    type="button"
                    className="vc-sol-piece-quickbtn"
                    onClick={(event) => {
                      event.stopPropagation();
                      openPieceModal(piece);
                    }}
                  >
                    <Eye size={14} aria-hidden="true" /> Vista rápida
                  </button>
                </div>

                <div className="vc-sol-piece-body">
                  <div className="vc-sol-piece-specs">
                    {piece.specs.map((spec) => (
                      <span key={spec}>{spec}</span>
                    ))}
                  </div>
                  <h3>
                    <button type="button" onClick={() => openPieceModal(piece)}>
                      {piece.title}
                    </button>
                  </h3>
                  <p>{piece.subtitle}</p>

                  <div className="vc-sol-piece-actions">
                    <button
                      type="button"
                      className="vc-sol-piece-detail-btn"
                      onClick={() => openPieceModal(piece)}
                    >
                      Ver ficha y vistas
                    </button>
                    <Link
                      className="vc-sol-piece-quote-btn"
                      to={`/cotizador?servicio=${encodeURIComponent(serviceName)}&producto=${encodeURIComponent(piece.title)}`}
                    >
                      Cotizar <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Lightbox y Ficha de Cotización Rápida */}
      <Dialog
        open={Boolean(selectedPiece)}
        onOpenChange={(open) => !open && setSelectedPiece(null)}
        size="lg"
        tone="brand"
        magicBorder
        eyebrow={selectedPiece ? `${selectedPiece.environment.toUpperCase()} · VISUAL CORP` : 'CATÁLOGO VISUAL'}
        badge="Referencia visual"
        title={selectedPiece?.title || 'Detalle de solución'}
        description={selectedPiece?.subtitle}
        footer={
          selectedPiece ? (
            <>
              <Link
                className="vc-dialog-btn vc-dialog-btn-ghost"
                to={`/servicios/${selectedPiece.serviceId}`}
                onClick={() => setSelectedPiece(null)}
              >
                Ver familia {serviceNameById(selectedPiece.serviceId, data.services)}
              </Link>
              <Link
                className="vc-dialog-btn vc-dialog-btn-primary"
                to={`/cotizador?servicio=${encodeURIComponent(
                  serviceNameById(selectedPiece.serviceId, data.services)
                )}&producto=${encodeURIComponent(selectedPiece.title)}`}
                onClick={() => setSelectedPiece(null)}
              >
                Cotizar esta pieza <ArrowUpRight size={16} />
              </Link>
            </>
          ) : undefined
        }
      >
        {selectedPiece && (
          <div className="vc-sol-modal-grid">
            <div className="vc-sol-modal-gallery">
              <div className="vc-sol-modal-main-img">
                <img
                  src={getImageForPiece(selectedPiece, modalImageMode)}
                  alt={selectedPiece.title}
                />
              </div>
              <div className="vc-sol-modal-thumbs" role="group" aria-label="Cambiar vista de referencia">
                <button
                  type="button"
                  className={modalImageMode === 'marcas' ? 'is-active' : ''}
                  onClick={() => setModalImageMode('marcas')}
                >
                  <img src={selectedPiece.imageBrandExample} alt="" />
                  <span>Ejemplo marca</span>
                </button>
                <button
                  type="button"
                  className={modalImageMode === 'visualcorp' ? 'is-active' : ''}
                  onClick={() => setModalImageMode('visualcorp')}
                >
                  <img src={selectedPiece.imageVisualCorp} alt="" />
                  <span>Serie Visual Corp</span>
                </button>
                {selectedPiece.imageRealPhoto && (
                  <button
                    type="button"
                    className={modalImageMode === 'real' ? 'is-active' : ''}
                    onClick={() => setModalImageMode('real')}
                  >
                    <img src={selectedPiece.imageRealPhoto} alt="" />
                    <span>Referencia adicional</span>
                  </button>
                )}
              </div>
            </div>

            <div className="vc-sol-modal-info">
              <p className="vc-sol-modal-desc">{selectedPiece.description}</p>

              <div className="vc-sol-modal-specs">
                <strong>Características de referencia:</strong>
                <div className="vc-sol-piece-specs">
                  {selectedPiece.specs.map((spec) => (
                    <span key={spec}>{spec}</span>
                  ))}
                </div>
              </div>

              {serviceDetailContent[selectedPiece.serviceId] && (
                <div className="vc-sol-modal-checklist">
                  <strong>Qué compartir para cotizar rápido:</strong>
                  <ul>
                    {serviceDetailContent[selectedPiece.serviceId].checklist.map((item) => (
                      <li key={item}>
                        <Check size={15} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogCallout tone="info">
                Las imágenes son referencias visuales para orientar tu idea. Materiales, medidas, disponibilidad, valores y tiempos se confirman según cada solicitud.
              </DialogCallout>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}

/**
 * 5. Galería específica para insertar dentro de cada subpágina `/servicios/:slug`
 */
export function ServiceVisualShowcase({
  serviceId,
  serviceName,
}: {
  serviceId: PublicServiceId;
  serviceName: string;
}) {
  const pieces = useMemo(() => getPiecesForService(serviceId), [serviceId]);
  const [series, setSeries] = useState<'marcas' | 'visualcorp'>('marcas');
  const matchingEnv =
    brandingEnvironments.find((env) => env.serviceId === serviceId) || brandingEnvironments[0];

  return (
    <div className="vc-service-visual-bundle">
      <section className="service-detail-section vc-service-pieces-section" aria-labelledby="service-pieces-heading">
        <div className="vc-sol-section-header">
          <div>
            <span className="site-eyebrow">
              <i /> SOLUCIONES Y APLICACIONES EN {serviceName.toUpperCase()}
            </span>
            <h2 id="service-pieces-heading">
              Piezas que podemos crear
              <br />
              <span>en esta especialidad.</span>
            </h2>
          </div>
          <div className="vc-sol-header-controls">
            <p>
              Explora referencias visuales de nuestro catálogo y elige la pieza que quieres cotizar para tu marca.
            </p>
            <div className="vc-sol-series-switch" role="group" aria-label="Alternar serie visual">
              <button
                type="button"
                className={series === 'marcas' ? 'is-active' : ''}
                onClick={() => setSeries('marcas')}
              >
                Ejemplos de marca
              </button>
              <button
                type="button"
                className={series === 'visualcorp' ? 'is-active' : ''}
                onClick={() => setSeries('visualcorp')}
              >
                Serie Visual Corp
              </button>
            </div>
          </div>
        </div>

        <div className="vc-sol-cards-grid">
          {pieces.map((piece) => {
            const imgSrc = series === 'marcas' ? piece.imageBrandExample : piece.imageVisualCorp;
            const altImg = series === 'marcas' ? piece.imageVisualCorp : piece.imageBrandExample;

            return (
              <article
                key={piece.id}
                className="vc-sol-piece-card vc-magic-card"
                onPointerMove={updateSpotlight}
                onPointerLeave={clearSpotlight}
              >
                <SpotlightLayer />
                <Link
                  to={`/cotizador?servicio=${encodeURIComponent(serviceName)}&producto=${encodeURIComponent(piece.title)}`}
                  className="vc-sol-piece-image-wrap"
                >
                  <img className="vc-sol-piece-img-main" src={imgSrc} alt={piece.title} loading="lazy" />
                  <img className="vc-sol-piece-img-hover" src={altImg} alt="" aria-hidden="true" loading="lazy" />
                  <span className="vc-sol-piece-env">{piece.environment}</span>
                </Link>
                <div className="vc-sol-piece-body">
                  <div className="vc-sol-piece-specs">
                    {piece.specs.map((spec) => (
                      <span key={spec}>{spec}</span>
                    ))}
                  </div>
                  <h3>
                    <Link
                      to={`/cotizador?servicio=${encodeURIComponent(serviceName)}&producto=${encodeURIComponent(piece.title)}`}
                    >
                      {piece.title}
                    </Link>
                  </h3>
                  <p>{piece.description}</p>
                  <div className="vc-sol-piece-actions">
                    <Link
                      className="vc-sol-piece-detail-btn"
                      to="/soluciones"
                    >
                      Ver más soluciones
                    </Link>
                    <Link
                      className="vc-sol-piece-quote-btn"
                      to={`/cotizador?servicio=${encodeURIComponent(serviceName)}&producto=${encodeURIComponent(piece.title)}`}
                    >
                      Cotizar pieza <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Bloque de escenario destacado + 4 beneficios estratégicos */}
      <section className="service-detail-section vc-service-env-spotlight" aria-label="Aplicaciones por espacio">
        <div className="vc-service-env-banner">
          <div className="vc-service-env-banner-copy">
            <span className="site-eyebrow light">
              <i /> ESCENARIO DESTACADO · {matchingEnv.title.toUpperCase()}
            </span>
            <h3>Referencias para tu {matchingEnv.title.toLowerCase()}</h3>
            <p>{matchingEnv.subtitle}</p>
            <ul className="vc-service-env-mini-list">
              {matchingEnv.items.slice(0, 6).map((item) => (
                <li key={item}>
                  <Check size={15} aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
            <p className="vc-sol-gallery-note" role="note">Piezas, materiales, procesos, alcance y disponibilidad se revisan por solicitud.</p>
            <div className="vc-service-env-banner-actions">
              <Link
                className="site-primary-button"
                to={`/cotizador?servicio=${encodeURIComponent(serviceName)}`}
              >
                Cotizar para mi espacio <ArrowUpRight size={16} />
              </Link>
              <Link className="site-secondary-button" to="/soluciones">
                Ver Local, Oficina y Vehículo <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          <div className="vc-service-env-banner-images">
            <img src={matchingEnv.primaryImage} alt={matchingEnv.title} loading="lazy" />
            <img src={matchingEnv.secondaryImage} alt="" aria-hidden="true" loading="lazy" />
          </div>
        </div>
      </section>

      <StrategicBenefitsGrid title={`¿Por qué potenciar tu marca con ${serviceName.toLowerCase()}?`} />
    </div>
  );
}

/**
 * 6. Nueva Subpágina Principal: `/soluciones` (y `/soluciones/:categoria`)
 */
export function SolutionsHubPage() {
  const { categoria } = useParams();
  const initialCat = (categoria as WorkGalleryCategoryId) || 'todo';

  return (
    <div className="vc-solutions-hub">
      <section className="site-page-hero vc-sol-hero">
        <div className="site-hero-glow glow-pink" />
        <div className="vc-sol-hero-grid">
          <div className="site-page-hero-inner">
            <span className="site-eyebrow light">
              <i /> SOLUCIONES INTEGRALES VISUAL CORP
            </span>
            <h1>
              Branding, rotulación
              <br />y producción <em>en acción.</em>
            </h1>
            <p>
              Explora ideas para locales comerciales, oficinas, vehículos, ferias y campañas. La atención es en Milagro, Ecuador; la producción y el montaje se coordinan según cada proyecto.
            </p>
            <div className="site-page-hero-actions">
              <Link className="site-primary-button" to="/cotizador">
                Cotizar mi proyecto <ArrowUpRight size={16} />
              </Link>
              <a className="site-secondary-button" href="#catalogo-visual">
                Explorar catálogo por categoría <ArrowRight size={16} />
              </a>
            </div>
          </div>

          <div className="vc-sol-hero-collage" aria-hidden="true">
            <img src="/inventory-reference-library/images/33-marcas.webp" alt="" />
            <img src="/inventory-reference-library/images/11-marcas.webp" alt="" />
            <img src="/inventory-reference-library/images/14-marcas.webp" alt="" />
            <img src="/inventory-reference-library/images/03-marcas.webp" alt="" />
          </div>
        </div>
      </section>

      <EnvironmentBrandingMatrix />

      <StrategicBenefitsGrid />

      <PanoramicCategoryStrips />

      <div id="catalogo-visual">
        <InteractiveCatalogGallery initialCategory={initialCat} />
      </div>
    </div>
  );
}
