import type { PublicServiceId } from './content';

export type WorkGalleryCategoryId =
  | 'todo'
  | 'branding-vehicular'
  | 'letreros-rotulos'
  | 'senaletica-corte'
  | 'btl-exhibicion'
  | 'impresion-papeleria'
  | 'textil-indumentaria'
  | 'promocionales-merch';

export type WorkGalleryCategory = {
  id: WorkGalleryCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  serviceId?: PublicServiceId;
};

export const workGalleryCategories: WorkGalleryCategory[] = [
  {
    id: 'todo',
    label: 'Ideas y referencias visuales',
    shortLabel: 'Todo',
    description: 'Explora ideas para conversar y cotizar proyectos de diseño gráfico, rotulación, señalética, impresión, BTL y promocionales.',
  },
  {
    id: 'senaletica-corte',
    label: 'Señalética y piezas a medida',
    shortLabel: 'Señalética',
    description: 'Referencias de señalización, placas, reconocimientos y piezas personalizadas; materiales y procesos se revisan por solicitud.',
    serviceId: 'corte',
  },
  {
    id: 'letreros-rotulos',
    label: 'Letreros y rótulos',
    shortLabel: 'Letreros',
    description: 'Ideas de rótulos y elementos de marca; técnica, estructura, iluminación y materiales se confirman al cotizar.',
    serviceId: 'rotulos',
  },
  {
    id: 'branding-vehicular',
    label: 'Branding de Espacios y Vehicular',
    shortLabel: 'Branding',
    description: 'Referencias de gráfica para espacios, vehículos y exterior; alcance, superficies y montaje se revisan por proyecto.',
    serviceId: 'gran-formato',
  },
  {
    id: 'btl-exhibicion',
    label: 'BTL, Stands y Exhibición',
    shortLabel: 'BTL / Exhibición',
    description: 'Ideas para exhibición, activaciones y campañas; formatos, estructura y transporte se confirman para cada solicitud.',
    serviceId: 'eventos',
  },
  {
    id: 'impresion-papeleria',
    label: 'Impresión y Papelería Corporativa',
    shortLabel: 'Impresión',
    description: 'Referencias de papelería y piezas impresas; formato, acabado, cantidad y disponibilidad se cotizan por proyecto.',
    serviceId: 'impresion',
  },
  {
    id: 'textil-indumentaria',
    label: 'Textil, Uniformes e Identificación',
    shortLabel: 'Textil',
    description: 'Ideas de indumentaria e identificación; técnicas, materiales, tallas y accesorios se confirman al cotizar.',
    serviceId: 'textil',
  },
  {
    id: 'promocionales-merch',
    label: 'Promocionales y Merchandising',
    shortLabel: 'Promocionales',
    description: 'Referencias de artículos promocionales; producto, personalización, cantidad mínima y disponibilidad se revisan por solicitud.',
    serviceId: 'textil',
  },
];

export type ShowcasePiece = {
  id: string;
  title: string;
  subtitle: string;
  category: Exclude<WorkGalleryCategoryId, 'todo'>;
  serviceId: PublicServiceId;
  environment: 'Local Comercial' | 'Oficina y Corporativo' | 'Vehículo y Exterior' | 'Eventos y Campañas';
  imageVisualCorp: string;
  imageBrandExample: string;
  imageRealPhoto?: string;
  specs: [string, string, string];
  description: string;
  featured?: boolean;
};

export const showcasePieces: ShowcasePiece[] = [
  // BRANDING DE ESPACIOS Y VEHICULAR
  {
    id: 'brandeo-vehicular',
    title: 'Brandeo Vehicular y de Flotas',
    subtitle: 'Publicidad móvil en camiones, furgonetas y autos comerciales',
    category: 'branding-vehicular',
    serviceId: 'gran-formato',
    environment: 'Vehículo y Exterior',
    imageVisualCorp: '/inventory-reference-library/images/33-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/33-marcas.webp',
    specs: ['Material y técnica por confirmar', 'Alcance parcial o total por revisar', 'Diseño según solicitud'],
    description: 'Referencia de presencia de marca en vehículos; diseño, superficies, materiales y alcance se revisan para cada proyecto.',
    featured: true,
  },
  {
    id: 'vinil-corporativo-vitrina',
    title: 'Vinil Adhesivo para Vitrinas y Paredes',
    subtitle: 'Gráfica decorativa y promocional para locales y oficinas',
    category: 'branding-vehicular',
    serviceId: 'gran-formato',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/34-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/34-marcas.webp',
    specs: ['Ubicación por confirmar', 'Acabados por cotizar', 'Proceso por revisar'],
    description: 'Referencia para conversar sobre gráfica en paredes, mamparas y vitrinas; el material, el acabado y la aplicación se revisan por proyecto.',
    featured: true,
  },
  {
    id: 'gigantografia-comercial',
    title: 'Gigantografías y Lonas de Gran Formato',
    subtitle: 'Impacto visual a distancia para campañas y fachadas',
    category: 'branding-vehicular',
    serviceId: 'gran-formato',
    environment: 'Vehículo y Exterior',
    imageVisualCorp: '/inventory-reference-library/images/40-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/40-marcas.webp',
    specs: ['Formato de impresión por cotizar', 'Sistema de sujeción por confirmar', 'Legibilidad según ubicación'],
    description: 'Ideas de piezas de gran formato para comunicar campañas o mensajes; soporte, medidas y montaje se revisan por solicitud.',
  },
  {
    id: 'valla-publicitaria',
    title: 'Vallas y Estructuras Exteriores',
    subtitle: 'Ideas de comunicación visual en espacios exteriores',
    category: 'branding-vehicular',
    serviceId: 'gran-formato',
    environment: 'Vehículo y Exterior',
    imageVisualCorp: '/inventory-reference-library/images/30-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/30-marcas.webp',
    specs: ['Formato por cotizar', 'Ubicación y permisos por revisar', 'Material por confirmar'],
    description: 'Referencia para conversar sobre piezas gráficas exteriores; ubicación, permisos, producción y montaje se revisan para cada solicitud.',
    featured: true,
  },
  {
    id: 'banderola-publicitaria',
    title: 'Banderolas yBanners de Exterior',
    subtitle: 'Señalización dinámica para eventos y puntos de venta',
    category: 'branding-vehicular',
    serviceId: 'gran-formato',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/31-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/31-marcas.webp',
    specs: ['Formato vertical de referencia', 'Ubicación según proyecto', 'Uso por confirmar'],
    description: 'Ideas para comunicar en entradas, puntos de atención o eventos; el formato, soporte y uso se revisan por proyecto.',
  },
  {
    id: 'pendon-publicitario',
    title: 'Pendones y Gráfica Colgante',
    subtitle: 'Comunicación vertical para pasillos, vitrinas y promociones',
    category: 'branding-vehicular',
    serviceId: 'gran-formato',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/42-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/42-marcas.webp',
    specs: ['Soporte y formato por cotizar', 'Impresión según material', 'Recambio por confirmar'],
    description: 'Referencias para anunciar ofertas o servicios en un espacio; formato, material y montaje se confirman por solicitud.',
  },
  {
    id: 'vinil-microperforado-esmerilado',
    title: 'Vinil Microperforado y Esmerilado',
    subtitle: 'Privacidad interior y publicidad exterior en ventanales',
    category: 'branding-vehicular',
    serviceId: 'gran-formato',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory/VC-INV-TRO-005.webp',
    imageBrandExample: '/inventory/VC-INV-TRO-004.webp',
    specs: ['Material y paso de luz por confirmar', 'Aplicación por cotizar', 'Superficie y uso por revisar'],
    description: 'Referencia de gráfica para puertas de vidrio, divisiones o superficies vehiculares; material, aplicación y uso se confirman al cotizar.',
  },

  // LETREROS, RÓTULOS Y NEÓN LED
  {
    id: 'rotulo-comercial-fachada',
    title: 'Rótulos Comerciales de Fachada',
    subtitle: 'La primera impresión de tu negocio frente a tus clientes',
    category: 'letreros-rotulos',
    serviceId: 'rotulos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/11-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/11-marcas.webp',
    specs: ['Identidad de marca', 'Medidas por revisar', 'Montaje según alcance'],
    description: 'Rótulos principales diseñados para ordenar la lectura de tu fachada y destacar el nombre de tu negocio.',
    featured: true,
  },
  {
    id: 'letrero-luminoso-caja-luz',
    title: 'Ideas para letreros con iluminación',
    subtitle: 'Referencias para explorar una pieza iluminada',
    category: 'letreros-rotulos',
    serviceId: 'rotulos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/12-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/12-marcas.webp',
    specs: ['Iluminación y técnica por confirmar', 'Frente y materiales por cotizar', 'Caras por revisar'],
    description: 'Referencias de letreros iluminados; forma, iluminación, estructura, instalación y disponibilidad se confirman por proyecto.',
    featured: true,
  },
  {
    id: 'neon-led-personalizado',
    title: 'Ideas de letreros luminosos para interiores',
    subtitle: 'Acentos luminosos modernos para interiores, fondos y vitrinas',
    category: 'letreros-rotulos',
    serviceId: 'rotulos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/13-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/13-marcas.webp',
    specs: ['Base y estructura por confirmar', 'Colores y acabado por cotizar', 'Interior o recepción según proyecto'],
    description: 'Referencia visual para conversar sobre letreros luminosos y acentos de marca; la técnica, instalación y disponibilidad se revisan por solicitud.',
    featured: true,
  },
  {
    id: 'formas-corporeas-3d',
    title: 'Letras y formas con volumen',
    subtitle: 'Ideas de volumen y relieve para marcas y espacios',
    category: 'letreros-rotulos',
    serviceId: 'rotulos',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/32-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/32-marcas.webp',
    specs: ['Volumen por cotizar', 'Acabado por confirmar', 'Ubicación según proyecto'],
    description: 'Ideas de letras o logotipos con volumen para espacios y fachadas; materiales, acabados y montaje se revisan por solicitud.',
    featured: true,
  },
  {
    id: 'backlight-publicitario',
    title: 'Ideas para paneles retroiluminados',
    subtitle: 'Gráfica de alto contraste para menús, vitrinas y exhibidores',
    category: 'letreros-rotulos',
    serviceId: 'rotulos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/41-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/41-marcas.webp',
    specs: ['Iluminación y color por confirmar', 'Aplicación según espacio', 'Gráfica intercambiable por cotizar'],
    description: 'Referencias de paneles retroiluminados para conversar sobre menús, vitrinas o campañas; técnica y configuración por confirmar.',
  },
  {
    id: 'totem-publicitario',
    title: 'Ideas para tótems y señalizadores',
    subtitle: 'Referencias de orientación para ingresos y pasillos',
    category: 'letreros-rotulos',
    serviceId: 'rotulos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/07-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/07-marcas.webp',
    specs: ['Formato por cotizar', 'Visibilidad según ubicación', 'Uso según proyecto'],
    description: 'Ideas de señalizadores verticales para orientar o comunicar en un espacio; estructura, medidas y montaje se cotizan por proyecto.',
  },

  // SEÑALÉTICA, CORTE LÁSER Y ACRÍLICO
  {
    id: 'senaletica-pvc-corporativa',
    title: 'Ideas de señalética informativa y corporativa',
    subtitle: 'Rutas de evacuación, seguridad industrial e identificación de áreas',
    category: 'senaletica-corte',
    serviceId: 'corte',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/14-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/14-marcas.webp',
    specs: ['Material por confirmar', 'Ubicación interior o exterior por revisar', 'Contenido y normativa por confirmar'],
    description: 'Referencia para planificar señalización e identificación de áreas. El contenido, los materiales y cualquier requisito normativo se validan para cada solicitud.',
    featured: true,
  },
  {
    id: 'placa-qr-acrilico',
    title: 'Ideas de placas informativas y señalizadores',
    subtitle: 'Conecta tu mostrador con redes sociales, menús o pagos digitales',
    category: 'senaletica-corte',
    serviceId: 'corte',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/43-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/43-marcas.webp',
    specs: ['Material y acabado por confirmar', 'Enlace o QR por definir', 'Base y ubicación por cotizar'],
    description: 'Referencia visual de una placa informativa. El soporte, los enlaces y el acabado se revisan para cada solicitud.',
    featured: true,
  },
  {
    id: 'trofeos-reconocimientos-acrilico',
    title: 'Reconocimientos y piezas conmemorativas',
    subtitle: 'Ideas de piezas personalizadas para eventos y equipos',
    category: 'senaletica-corte',
    serviceId: 'corte',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/23-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/23-marcas.webp',
    specs: ['Material y proceso por confirmar', 'Diseño según solicitud', 'Acabados por cotizar'],
    description: 'Referencia visual para conversar sobre piezas conmemorativas; configuración, proceso y materiales se confirman por proyecto.',
  },
  {
    id: 'porta-folletos-acrilico',
    title: 'Referencias de porta folletos y exhibidores',
    subtitle: 'Orden y visibilidad para volantes, menús y catálogos en mostrador',
    category: 'senaletica-corte',
    serviceId: 'corte',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/images/catalog-products/PORTA FOLLETOS ACRILICO.webp',
    imageBrandExample: '/inventory/VC-INV-LAS-002.webp',
    specs: ['Material por cotizar', 'Ubicación por confirmar', 'Medidas según proyecto'],
    description: 'Referencia para conversar sobre soportes de mesa o pared; materiales, medidas y configuración se confirman por proyecto.',
  },
  {
    id: 'llaveros-acrilico-laser',
    title: 'Llaveros promocionales personalizados',
    subtitle: 'Ideas de recuerdos y artículos de campaña',
    category: 'senaletica-corte',
    serviceId: 'corte',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/images/catalog-products/LLAVERO ACRILICO 1.webp',
    imageBrandExample: '/images/catalog-products/LLAVERO ACRILICO 2.webp',
    specs: ['Silueta por cotizar', 'Material y acabado por confirmar', 'Diseño según solicitud'],
    description: 'Referencia para cotizar recuerdos con identidad de marca; materiales, personalización y acabado se confirman por solicitud.',
  },

  // BTL, STANDS Y EXHIBICIÓN (CABECERAS DE GÓNDOLA / PUNTOS DE VENTA)
  {
    id: 'stand-publicitario-btl',
    title: 'Stands Publicitarios y Módulos de Activación',
    subtitle: 'Cabeceras de góndola, degustación y presencia en ferias',
    category: 'btl-exhibicion',
    serviceId: 'eventos',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/03-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/03-marcas.webp',
    specs: ['Elementos por definir', 'Transporte por confirmar', 'Gráfica intercambiable por cotizar'],
    description: 'Referencias para planificar exhibición en ferias o puntos de venta; piezas, transporte y montaje se acuerdan para cada solicitud.',
    featured: true,
  },
  {
    id: 'roll-up-publicitario',
    title: 'Roll Up Publicitario con Estructura',
    subtitle: 'El clásico indispensable para presentaciones, recepciones y eventos',
    category: 'btl-exhibicion',
    serviceId: 'eventos',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/01-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/01-marcas.webp',
    specs: ['Estructura por confirmar', 'Montaje y armado según proyecto', 'Opciones de transporte por cotizar'],
    description: 'Lleva el mensaje de tu marca a ruedas de prensa, congresos, salas de espera y entradas de negocio.',
    featured: true,
  },
  {
    id: 'banner-arana-tension',
    title: 'Banner Araña (X-Banner) y Respaldos',
    subtitle: 'Estructura ligera y versátil para campañas dinámicas',
    category: 'btl-exhibicion',
    serviceId: 'eventos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/02-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/02-marcas.webp',
    specs: ['Estructura por confirmar', 'Gráfica y soporte por cotizar', 'Uso según proyecto'],
    description: 'Referencia visual para conversar sobre gráficas de exhibición; estructura, materiales y disponibilidad se confirman por proyecto.',
  },
  {
    id: 'banner-en-a-caballete',
    title: 'Banner en A y Caballetes de Ingreso',
    subtitle: 'Capta el flujo peatonal justo en la entrada de tu local',
    category: 'btl-exhibicion',
    serviceId: 'eventos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/06-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/06-marcas.webp',
    specs: ['Caras y formato por confirmar', 'Ubicación según proyecto', 'Lectura a revisar en diseño'],
    description: 'Ideas para comunicar en ingresos y puntos de paso; formato, caras, ubicación y lectura se revisan para cada espacio.',
  },
  {
    id: 'exhibidor-hablador-mesa',
    title: 'Exhibidores de Mesa y Habladores POP',
    subtitle: 'Comunicación directa en mostradores, cajas y mesas',
    category: 'btl-exhibicion',
    serviceId: 'eventos',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/08-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/08-marcas.webp',
    imageRealPhoto: '/images/catalog-real/hablador.webp',
    specs: ['Formato por cotizar', 'Contenido según campaña', 'Medidas por revisar'],
    description: 'Referencias de piezas para comunicar promociones o información en mostradores y mesas; el formato se confirma por solicitud.',
  },
  {
    id: 'cubos-display-mostrador',
    title: 'Cubos Promocionales y Displays de Punto de Venta',
    subtitle: 'Volumen visual para vitrinas, islas comerciales y góndolas',
    category: 'btl-exhibicion',
    serviceId: 'eventos',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/images/catalog-products/CUBOS PROMOCIONALES.webp',
    imageBrandExample: '/images/catalog-products/DISPLAY MOSTRADOR.webp',
    specs: ['Caras y medidas por confirmar', 'Material y configuración por cotizar', 'Uso según proyecto'],
    description: 'Ideas de piezas tridimensionales para una vitrina, lanzamiento o exhibición; material, medidas y armado se revisan por solicitud.',
  },

  // IMPRESIÓN COMERCIAL Y PAPELERÍA
  {
    id: 'tarjetas-presentacion-acabados',
    title: 'Tarjetas de presentación',
    subtitle: 'Referencias para presentar tu marca en formato impreso',
    category: 'impresion-papeleria',
    serviceId: 'impresion',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/15-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/15-marcas.webp',
    imageRealPhoto: '/images/catalog-real/tarjeta-presentacion.webp',
    specs: ['Formato y papel por cotizar', 'Caras y acabados por confirmar', 'Diseño según solicitud'],
    description: 'Referencia de papelería comercial; papel, cantidad, acabados y disponibilidad se revisan por proyecto.',
    featured: true,
  },
  {
    id: 'flyers-volantes-comerciales',
    title: 'Flyers y Volantes Publicitarios',
    subtitle: 'Difusión ágil para campañas, aperturas, menús y promociones',
    category: 'impresion-papeleria',
    serviceId: 'impresion',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/16-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/16-marcas.webp',
    imageRealPhoto: '/images/catalog-real/flyer.webp',
    specs: ['Tamaño por cotizar', 'Color y caras por confirmar', 'Cantidad por revisar'],
    description: 'Ideas de piezas impresas para campañas, aperturas o promociones; formato, cantidad y disponibilidad se confirman por solicitud.',
  },
  {
    id: 'tripticos-folletos',
    title: 'Trípticos, Dípticos y Folletería Informativa',
    subtitle: 'Organiza tu catálogo de servicios de forma clara y plegable',
    category: 'impresion-papeleria',
    serviceId: 'impresion',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/25-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/25-marcas.webp',
    imageRealPhoto: '/images/catalog-real/triptico.webp',
    specs: ['Formato y plegado por cotizar', 'Contenido según proyecto', 'Papel y acabados por confirmar'],
    description: 'Referencias de folletos para organizar información de servicios, menús o portafolios; formato y acabados se revisan al cotizar.',
  },
  {
    id: 'carpetas-hojas-sobres',
    title: 'Carpetas, Hojas Membretadas y Sobres Corporativos',
    subtitle: 'Papelería institucional coherente para cotizaciones y contratos',
    category: 'impresion-papeleria',
    serviceId: 'impresion',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/17-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/17-marcas.webp',
    imageRealPhoto: '/images/catalog-real/carpeta-corporativa.webp',
    specs: ['Configuración por confirmar', 'Identidad según solicitud', 'Papel y acabado por cotizar'],
    description: 'Ideas de papelería institucional para propuestas o documentos; formatos, acabados y cantidades se confirman por proyecto.',
  },
  {
    id: 'cuadernos-agendas-calendarios',
    title: 'Cuadernos, Agendas y Calendarios Corporativos',
    subtitle: 'Ideas de papelería para equipos y campañas',
    category: 'impresion-papeleria',
    serviceId: 'impresion',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/21-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/26-marcas.webp',
    imageRealPhoto: '/images/catalog-real/cuaderno-corporativo.webp',
    specs: ['Portada por diseñar', 'Encuadernación por confirmar', 'Medidas y cantidad por cotizar'],
    description: 'Referencias de cuadernos, agendas y calendarios; formato, encuadernación, personalización y disponibilidad se revisan por solicitud.',
  },
  {
    id: 'stickers-etiquetas-producto',
    title: 'Stickers Troquelados y Etiquetas de Producto',
    subtitle: 'Personaliza envases, bolsas de entrega, cajas y frascos',
    category: 'impresion-papeleria',
    serviceId: 'impresion',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/22-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/44-marcas.webp',
    imageRealPhoto: '/images/catalog-real/etiqueta-producto.webp',
    specs: ['Corte por confirmar', 'Adhesivo y superficie por revisar', 'Uso según proyecto'],
    description: 'Ideas de etiquetas para envases, bolsas o cajas; material, adhesivo y uso previsto se revisan antes de cotizar.',
    featured: true,
  },

  // TEXTIL, UNIFORMES E IDENTIFICACIÓN
  {
    id: 'camisetas-sublimadas-estampadas',
    title: 'Camisetas y prendas personalizadas',
    subtitle: 'Prendas personalizadas para equipos, campañas, deportes y eventos',
    category: 'textil-indumentaria',
    serviceId: 'textil',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/10-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/10-marcas.webp',
    specs: ['Técnica de aplicación por confirmar', 'Acabado por cotizar', 'Tallas y disponibilidad por revisar'],
    description: 'Referencia para conversar sobre prendas para equipos, campañas o eventos; material, técnica, tallas y disponibilidad se confirman al cotizar.',
    featured: true,
  },
  {
    id: 'polos-sudaderas-corporativas',
    title: 'Polos y Sudaderas Corporativas',
    subtitle: 'Imagen ejecutiva y uniforme diario para atención al cliente',
    category: 'textil-indumentaria',
    serviceId: 'textil',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/27-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/24-marcas.webp',
    imageRealPhoto: '/images/catalog-real/polo.webp',
    specs: ['Ubicación del arte por definir', 'Prenda y tallas por confirmar', 'Técnica por cotizar'],
    description: 'Ideas de prendas personalizadas para equipos; producto, tallas, técnica y cantidad se revisan por solicitud.',
  },
  {
    id: 'gorras-personalizadas',
    title: 'Ideas de gorras personalizadas',
    subtitle: 'Visibilidad de marca en exteriores, entregas y promociones',
    category: 'textil-indumentaria',
    serviceId: 'textil',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/05-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/05-marcas.webp',
    imageRealPhoto: '/images/catalog-real/gorra-sublimada.webp',
    specs: ['Área de personalización por confirmar', 'Modelo y tallas por revisar', 'Cantidad por cotizar'],
    description: 'Referencias de gorras para equipos o campañas; modelo, personalización y disponibilidad se confirman por solicitud.',
  },
  {
    id: 'credenciales-lanyards-pulseras',
    title: 'Credenciales y elementos de identificación',
    subtitle: 'Ideas para identificar personas o equipos',
    category: 'textil-indumentaria',
    serviceId: 'textil',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/09-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/37-marcas.webp',
    imageRealPhoto: '/images/catalog-real/pulsera.webp',
    specs: ['Piezas y accesorios por definir', 'Material por confirmar', 'Uso y cantidad por revisar'],
    description: 'Referencias de elementos de identificación para equipos o eventos; piezas, materiales y configuración se confirman al cotizar.',
  },

  // PROMOCIONALES Y MERCHANDISING
  {
    id: 'tazas-personalizadas-magicas',
    title: 'Tazas personalizadas',
    subtitle: 'Una idea de artículo promocional para consultar',
    category: 'promocionales-merch',
    serviceId: 'textil',
    environment: 'Oficina y Corporativo',
    imageVisualCorp: '/inventory-reference-library/images/04-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/04-marcas.webp',
    imageRealPhoto: '/images/catalog-real/taza-personalizada.webp',
    specs: ['Área de personalización por confirmar', 'Producto y acabado por cotizar', 'Cantidad mínima por consultar'],
    description: 'Referencia para conversar sobre artículos promocionales personalizados; técnica, producto, cantidad y disponibilidad se confirman por solicitud.',
    featured: true,
  },
  {
    id: 'tomatodos-termos-corporativos',
    title: 'Tomatodos y Termos Personalizados',
    subtitle: 'Referencias de artículos para equipos o campañas',
    category: 'promocionales-merch',
    serviceId: 'textil',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/20-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/20-marcas.webp',
    specs: ['Material y técnica por confirmar', 'Producto y configuración por cotizar', 'Opciones para kits de bienvenida'],
    description: 'Ideas de artículos promocionales para equipos o campañas; producto, técnica, cantidad y disponibilidad se revisan por solicitud.',
  },
  {
    id: 'bolsas-mochilas-promocionales',
    title: 'Bolsas Boutique, Fundas y Mochilas de Cuerdas',
    subtitle: 'Referencias de bolsas y artículos para entrega',
    category: 'promocionales-merch',
    serviceId: 'textil',
    environment: 'Local Comercial',
    imageVisualCorp: '/inventory-reference-library/images/19-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/28-marcas.webp',
    imageRealPhoto: '/images/catalog-real/bolso.webp',
    specs: ['Producto y material por confirmar', 'Técnica por cotizar', 'Cantidad por revisar'],
    description: 'Referencias de bolsas o mochilas para entregas y eventos; producto, materiales, personalización y disponibilidad se confirman al cotizar.',
  },
  {
    id: 'boligrafos-mousepad-pines',
    title: 'Bolígrafos, Mousepads y Pines Publicitarios',
    subtitle: 'Ideas de artículos promocionales para consultar',
    category: 'promocionales-merch',
    serviceId: 'textil',
    environment: 'Eventos y Campañas',
    imageVisualCorp: '/inventory-reference-library/images/18-visual-corp.webp',
    imageBrandExample: '/inventory-reference-library/images/38-marcas.webp',
    imageRealPhoto: '/images/catalog-real/boligrafo-sublimado.webp',
    specs: ['Producto por definir', 'Personalización por confirmar', 'Cantidad y kit por cotizar'],
    description: 'Referencias de artículos promocionales para ferias, recepciones o campañas; producto y configuración se revisan por solicitud.',
  },
];

export type BrandingEnvironmentColumn = {
  id: 'local' | 'oficina' | 'vehiculo' | 'eventos';
  title: string;
  subtitle: string;
  serviceId: PublicServiceId;
  primaryImage: string;
  secondaryImage: string;
  items: string[];
};

/** Inspirado y ampliado a partir de los escenarios reales de rotulación y branding integral. */
export const brandingEnvironments: BrandingEnvironmentColumn[] = [
  {
    id: 'local',
    title: 'Local Comercial',
    subtitle: 'Fachadas, vitrinas y punto de venta que atraen clientes desde la calle',
    serviceId: 'rotulos',
    primaryImage: '/inventory-reference-library/images/11-marcas.webp',
    secondaryImage: '/inventory-reference-library/images/12-visual-corp.webp',
    items: [
      'Letreros con o sin iluminación',
      'Letras y elementos con volumen',
      'Gráfica para vitrinas y superficies',
      'Referencias para identificar fachadas',
      'Señalización y placas informativas',
      'Piezas visuales para puntos de atención',
      'Gráfica para paredes y espacios comerciales',
      'Ideas de gráfica para pisos y recorridos',
      'Exhibidores y elementos de mostrador',
      'Referencias para puertas y mamparas',
      'Banners y piezas promocionales',
    ],
  },
  {
    id: 'oficina',
    title: 'Oficina y Corporativo',
    subtitle: 'Espacios de trabajo, clínicas e instituciones con identidad ordenada',
    serviceId: 'corte',
    primaryImage: '/inventory-reference-library/images/32-marcas.webp',
    secondaryImage: '/inventory-reference-library/images/14-visual-corp.webp',
    items: [
      'Gráfica para cristales y superficies',
      'Letreros para áreas de recepción',
      'Murales motivacionales y cultura organizacional',
      'Paredes gráficas e historia de marca',
      'Señalización por departamentos y recorridos',
      'Logos en puertas, ventanas y salas de juntas',
      'Frases o valores corporativos en pared',
      'Porta folletos, directorios y soportes informativos',
      'Elementos de identificación para equipos',
      'Carpetas, cuadernos y papelería ejecutiva',
    ],
  },
  {
    id: 'vehiculo',
    title: 'Vehículo y Flota',
    subtitle: 'Transforma cada recorrido y entrega en publicidad móvil para tu negocio',
    serviceId: 'gran-formato',
    primaryImage: '/inventory-reference-library/images/33-marcas.webp',
    secondaryImage: '/inventory-reference-library/images/33-visual-corp.webp',
    items: [
      'Ideas de gráfica para furgones y camiones',
      'Referencias para identificar vehículos',
      'Elementos de marca y contacto por definir',
      'Gráfica para superficies vehiculares',
      'Diseños temáticos para campañas',
      'Identificación de flotas por consultar',
      'Adaptación visual según el vehículo',
    ],
  },
  {
    id: 'eventos',
    title: 'Ferias, Góndolas y BTL',
    subtitle: 'Activaciones, stands y exhibición para destacar en eventos y supermercados',
    serviceId: 'eventos',
    primaryImage: '/inventory-reference-library/images/03-marcas.webp',
    secondaryImage: '/inventory-reference-library/images/01-visual-corp.webp',
    items: [
      'Stands publicitarios y módulos de degustación',
      'Cabeceras de góndola y tótems verticales',
      'Roll-ups, banners araña y fondos de prensa',
      'Cubos promocionales y displays de mostrador',
      'Camisetas, gorras y polos para staff',
      'Tazas, tomatodos, bolsas y regalos de marca',
      'Flyers, trípticos, stickers y credenciales',
    ],
  },
];

export type StrategicBenefit = {
  id: string;
  title: string;
  description: string;
  highlight: string;
};

export const strategicBenefits: StrategicBenefit[] = [
  {
    id: 'visibilidad',
    title: 'Visibilidad',
    description: 'Piezas pensadas para captar la atención a corta y larga distancia, haciendo que tu local, stand o vehículo sea fácil de ubicar y recordar.',
    highlight: 'Presencia de marca en el espacio o durante el uso del vehículo',
  },
  {
    id: 'diferenciacion',
    title: 'Diferenciación',
    description: 'Un negocio, empaque o vehículo bien identificado proyecta orden y confianza inmediata, destacándote frente a opciones genéricas.',
    highlight: 'Identidad coherente en cada contacto',
  },
  {
    id: 'durabilidad',
    title: 'Materiales adecuados',
    description: 'La elección de material se conversa según el lugar, el uso y las condiciones que se confirmen para cada proyecto.',
    highlight: 'Material por confirmar según el espacio',
  },
  {
    id: 'cultura',
    title: 'Cultura corporativa',
    description: 'Desde la recepción y la señalética hasta el uniforme y el cuaderno de trabajo, fortaleces el sentido de pertenencia de tu equipo.',
    highlight: 'Orgullo de marca dentro y fuera',
  },
];

export type PanoramicStrip = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  serviceId: PublicServiceId;
  slices: Array<{
    id: string;
    title: string;
    tag: string;
    image: string;
    altImage: string;
    productQuery: string;
  }>;
};

/** Tiras verticales panorámicas inspiradas en catálogos BTL/industriales pero interactivas y conectadas al cotizador. */
export const panoramicProductStrips: PanoramicStrip[] = [
  {
    id: 'strip-vehicular-exterior',
    eyebrow: '01 · IMPACTO EN RUTA Y EXTERIOR',
    title: 'BRANDING VEHICULAR Y GRAN FORMATO',
    subtitle: 'Referencias de gráfica para vehículos, fachadas y espacios exteriores.',
    serviceId: 'gran-formato',
    slices: [
      { id: 'v1', title: 'Brandeo de Camiones y Furgones', tag: 'Flota comercial', image: '/inventory-reference-library/images/33-marcas.webp', altImage: '/inventory-reference-library/images/33-visual-corp.webp', productQuery: 'Brandeo vehicular' },
      { id: 'v2', title: 'Rotulación Corporativa Visual Corp', tag: 'Identidad móvil', image: '/inventory-reference-library/images/33-visual-corp.webp', altImage: '/inventory-reference-library/images/33-marcas.webp', productQuery: 'Rotulación vehicular' },
      { id: 'v3', title: 'Vallas y Carteleras Viales', tag: 'Exterior a distancia', image: '/inventory-reference-library/images/30-marcas.webp', altImage: '/inventory-reference-library/images/30-visual-corp.webp', productQuery: 'Valla publicitaria' },
      { id: 'v4', title: 'Gigantografías y Lonas Tensadas', tag: 'Gran formato', image: '/inventory-reference-library/images/40-marcas.webp', altImage: '/inventory-reference-library/images/40-visual-corp.webp', productQuery: 'Gigantografía en lona' },
      { id: 'v5', title: 'Viniles para Vitrinas y Paredes', tag: 'Locales y oficinas', image: '/inventory-reference-library/images/34-marcas.webp', altImage: '/inventory-reference-library/images/34-visual-corp.webp', productQuery: 'Vinil adhesivo' },
      { id: 'v6', title: 'Banderolas y Pendones Comerciales', tag: 'Activación en calle', image: '/inventory-reference-library/images/31-marcas.webp', altImage: '/inventory-reference-library/images/42-marcas.webp', productQuery: 'Banderola publicitaria' },
    ],
  },
  {
    id: 'strip-gondolas-btl',
    eyebrow: '02 · PUNTOS DE VENTA, SUPERMERCADOS Y FERIAS',
    title: 'CABECERAS DE GÓNDOLA, STANDS Y EXHIBICIÓN BTL',
    subtitle: 'Referencias de exhibición para puntos de venta y eventos.',
    serviceId: 'eventos',
    slices: [
      { id: 'g1', title: 'Stands y Módulos de Degustación', tag: 'Ferias y BTL', image: '/inventory-reference-library/images/03-marcas.webp', altImage: '/inventory-reference-library/images/03-visual-corp.webp', productQuery: 'Stand publicitario' },
      { id: 'g2', title: 'Tótems y Cabeceras Verticales', tag: 'Puntos de venta', image: '/inventory-reference-library/images/07-marcas.webp', altImage: '/inventory-reference-library/images/07-visual-corp.webp', productQuery: 'Tótem publicitario' },
      { id: 'g3', title: 'Roll Ups Enrollables de Aluminio', tag: 'Presentaciones', image: '/inventory-reference-library/images/01-marcas.webp', altImage: '/inventory-reference-library/images/01-visual-corp.webp', productQuery: 'Roll Up' },
      { id: 'g4', title: 'Banners Araña y Portapendones', tag: 'Promoción ágil', image: '/inventory-reference-library/images/02-marcas.webp', altImage: '/inventory-reference-library/images/02-visual-corp.webp', productQuery: 'Banner araña' },
      { id: 'g5', title: 'Exhibidores de Mostrador y Habladores', tag: 'Impulso en caja', image: '/inventory-reference-library/images/08-marcas.webp', altImage: '/images/catalog-real/hablador.webp', productQuery: 'Exhibidor de mesa' },
      { id: 'g6', title: 'Banners en A y Cubos Promocionales', tag: 'Ingreso y vitrina', image: '/inventory-reference-library/images/06-marcas.webp', altImage: '/images/catalog-products/CUBOS PROMOCIONALES.webp', productQuery: 'Banner en A' },
    ],
  },
  {
    id: 'strip-rotulos-senaletica',
    eyebrow: '03 · FACHADAS, RELIEVE Y SEÑALIZACIÓN',
    title: 'IDEAS DE RÓTULOS, LETRAS CON VOLUMEN Y SEÑALÉTICA',
    subtitle: 'Referencias para conversar sobre espacios, piezas y señalización.',
    serviceId: 'rotulos',
    slices: [
      { id: 'r1', title: 'Rótulos Principales de Fachada', tag: 'Exterior comercial', image: '/inventory-reference-library/images/11-marcas.webp', altImage: '/inventory-reference-library/images/11-visual-corp.webp', productQuery: 'Rótulo comercial' },
      { id: 'r2', title: 'Letreros con iluminación', tag: 'Técnica por confirmar', image: '/inventory-reference-library/images/12-marcas.webp', altImage: '/inventory-reference-library/images/12-visual-corp.webp', productQuery: 'Letrero luminoso' },
      { id: 'r3', title: 'Letreros luminosos para interiores', tag: 'Referencia visual', image: '/inventory-reference-library/images/13-marcas.webp', altImage: '/inventory-reference-library/images/13-visual-corp.webp', productQuery: 'Letrero luminoso' },
      { id: 'r4', title: 'Letras y formas con volumen', tag: 'Material por confirmar', image: '/inventory-reference-library/images/32-marcas.webp', altImage: '/inventory-reference-library/images/32-visual-corp.webp', productQuery: 'Letras con volumen' },
      { id: 'r5', title: 'Señalética informativa', tag: 'Uso por revisar', image: '/inventory-reference-library/images/14-marcas.webp', altImage: '/inventory-reference-library/images/14-visual-corp.webp', productQuery: 'Señalética' },
      { id: 'r6', title: 'Placas y piezas conmemorativas', tag: 'Pieza por cotizar', image: '/inventory-reference-library/images/43-marcas.webp', altImage: '/inventory-reference-library/images/23-marcas.webp', productQuery: 'Placa personalizada' },
    ],
  },
];

export function getPiecesForService(serviceId: PublicServiceId): ShowcasePiece[] {
  const direct = showcasePieces.filter((piece) => piece.serviceId === serviceId);
  if (direct.length >= 6) return direct;
  return showcasePieces.slice(0, 6);
}
