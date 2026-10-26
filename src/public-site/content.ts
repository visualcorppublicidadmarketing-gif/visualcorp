export type PublicServiceId = 'impresion' | 'gran-formato' | 'rotulos' | 'textil' | 'corte' | 'eventos';

export type PublicServiceFamily = {
  id: PublicServiceId;
  name: string;
  description: string;
  mark: string;
};

export const publicServiceFamilies: PublicServiceFamily[] = [
  { id: 'impresion', name: 'Impresión y papelería', description: 'Piezas gráficas para comunicar tu marca.', mark: '01' },
  { id: 'gran-formato', name: 'Publicidad de gran formato', description: 'Soluciones para que tu mensaje se vea.', mark: '02' },
  { id: 'rotulos', name: 'Rótulos y fachadas', description: 'Identidad visible para espacios y negocios.', mark: '03' },
  { id: 'textil', name: 'Textil y promocionales', description: 'Piezas personalizadas para marcas y equipos.', mark: '04' },
  { id: 'corte', name: 'Corte, grabado y señalética', description: 'Piezas gráficas y señalización a medida.', mark: '05' },
  { id: 'eventos', name: 'Exhibición y eventos', description: 'Material visual para presentar ideas y proyectos.', mark: '06' },
];

// Dirección y canales confirmados por Visual Corp el 8 de octubre de 2026.
export const publicAddress = 'Av. Jaime Roldós y General Andrade, Milagro';
export const multiProductQuoteService = 'Varios productos de la tienda';

export const serviceProjectPrompts: Record<PublicServiceId, string> = {
  impresion: 'Cuéntanos qué pieza impresa necesitas, la cantidad aproximada y si ya tienes un diseño.',
  'gran-formato': 'Comparte dónde se verá la pieza, las medidas aproximadas y el mensaje que quieres comunicar.',
  rotulos: 'Envíanos una foto del espacio, medidas aproximadas y la idea que tienes para tu marca.',
  textil: 'Indícanos el tipo de pieza, la cantidad aproximada y si tienes un arte o referencia.',
  corte: 'Descríbenos la pieza, las medidas aproximadas y el material que tienes en mente.',
  eventos: 'Cuéntanos el tipo de evento, el espacio disponible y las piezas visuales que imaginas.',
};

/** Guía pública para orientar el brief de cada familia, sin prometer disponibilidad ni condiciones comerciales. */
export const serviceDetailContent: Record<PublicServiceId, {
  headline: string;
  introduction: string;
  situations: [string, string, string];
  checklist: [string, string, string];
  preparation: string;
  relatedServices: [string, string, string];
}> = {
  impresion: {
    headline: 'Una idea también empieza en papel.',
    introduction: 'Cada pieza impresa tiene un propósito: presentar una marca, compartir un mensaje o acompañar un punto de atención. Cuéntanos qué quieres comunicar y encontraremos contigo el formato adecuado.',
    situations: ['Presentar tu marca con material gráfico', 'Compartir información de una campaña', 'Acompañar un punto de venta o atención'],
    checklist: ['La pieza o el uso que tienes en mente', 'La cantidad aproximada y el tamaño, si ya los conoces', 'El diseño, logotipo o referencia, si los tienes'],
    preparation: 'Si aún no definiste formato, envíanos el objetivo y te ayudamos a organizar los detalles para cotizar.',
    relatedServices: ['gran-formato', 'textil', 'eventos'],
  },
  'gran-formato': {
    headline: 'Haz que tu mensaje se vea en su espacio.',
    introduction: 'Las piezas de gran formato se entienden mejor con el lugar a la vista. La medida, la distancia y si se usarán dentro o fuera ayudan a orientar la propuesta.',
    situations: ['Comunicar una campaña a mayor distancia', 'Dar presencia gráfica a un espacio', 'Acompañar una presentación o actividad'],
    checklist: ['Dónde se colocará la pieza y si será interior o exterior', 'Las medidas aproximadas y cuántas piezas necesitas', 'Una foto del espacio y tu arte o referencia, si los tienes'],
    preparation: 'Una fotografía y medidas aproximadas ayudan a comprender el contexto. La solución y sus condiciones se confirman al revisar el proyecto.',
    relatedServices: ['rotulos', 'impresion', 'eventos'],
  },
  rotulos: {
    headline: 'Tu fachada es parte de la primera impresión.',
    introduction: 'Un rótulo reúne el nombre de tu negocio, la fachada y la manera en que quieres que las personas lo reconozcan. Empezamos por revisar el espacio y el objetivo de la pieza.',
    situations: ['Identificar un local o espacio de atención', 'Organizar la lectura de una fachada', 'Dar continuidad a la imagen entre exterior e interior'],
    checklist: ['Una foto frontal y, si puedes, otra desde donde se verá', 'Las medidas aproximadas y dónde va la pieza', 'Tu logotipo o referencia de cómo quieres que se vea'],
    preparation: 'Comparte también si deseas consultar por instalación. Materiales, alcance, disponibilidad, valores y tiempos se revisan para cada solicitud.',
    relatedServices: ['corte', 'gran-formato', 'impresion'],
  },
  textil: {
    headline: 'Una marca que también se lleva puesta.',
    introduction: 'Las prendas y los artículos promocionales permiten llevar una identidad a un equipo, una actividad o un regalo. Las cantidades y las características de la pieza orientan la consulta.',
    situations: ['Identificar un equipo o grupo', 'Llevar una imagen de marca a una actividad', 'Personalizar artículos para entregar o regalar'],
    checklist: ['Qué prenda o artículo tienes en mente', 'Cuántas piezas necesitas y qué tallas o colores consideras', 'El diseño, la ubicación y el tamaño aproximado del estampado'],
    preparation: 'Si aún estás definiendo la pieza, cuéntanos para quién es y cómo se usará. Las opciones se confirman contigo antes de cotizar.',
    relatedServices: ['eventos', 'impresion', 'gran-formato'],
  },
  corte: {
    headline: 'Dale forma a cada detalle.',
    introduction: 'El corte, el grabado y la señalética ayudan a definir formas y comunicar en un espacio. El diseño, las medidas y el uso previsto sirven para orientar cada solicitud.',
    situations: ['Identificar espacios o indicar recorridos', 'Crear una pieza personalizada para un negocio', 'Explorar un corte o grabado para tu idea'],
    checklist: ['Una imagen, dibujo o archivo de la forma deseada', 'Las dimensiones y la cantidad aproximada', 'El material, si ya lo tienes definido'],
    preparation: 'Si no conoces el material, describe dónde irá y qué resultado esperas. Revisaremos contigo el alcance y las alternativas disponibles.',
    relatedServices: ['rotulos', 'gran-formato', 'impresion'],
  },
  eventos: {
    headline: 'Que tu presentación tenga un hilo visual.',
    introduction: 'Una actividad, feria o presentación puede reunir varias piezas visuales. El tipo de encuentro, el espacio y la información principal ayudan a imaginar una propuesta coherente.',
    situations: ['Presentar una marca en una actividad', 'Organizar la información dentro de un espacio', 'Preparar apoyos visuales para una feria o presentación'],
    checklist: ['El tipo de evento y la fecha prevista', 'Una foto o descripción del espacio y sus medidas', 'Qué quieres comunicar y qué piezas estás imaginando'],
    preparation: 'Si todavía no sabes qué piezas elegir, cuéntanos qué quieres lograr y revisaremos contigo un punto de partida.',
    relatedServices: ['gran-formato', 'textil', 'impresion'],
  },
};

export const publicNavigation = [
  { label: 'Inicio', to: '/' },
  { label: 'Servicios', to: '/servicios', children: publicServiceFamilies.map(({ id, name }) => ({ label: name, to: `/servicios/${id}` })) },
  { label: 'La empresa', to: '/nosotros', children: [
    { label: 'Quiénes somos', to: '/nosotros' },
    { label: 'Cómo trabajamos', to: '/como-trabajamos' },
  ] },
  { label: 'Contacto', to: '/contacto' },
];
