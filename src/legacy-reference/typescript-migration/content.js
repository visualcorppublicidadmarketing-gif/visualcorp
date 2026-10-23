export const publicServiceFamilies = [
  { id: 'impresion', name: 'Impresión y papelería', description: 'Piezas gráficas para comunicar tu marca.', mark: '01' },
  { id: 'gran-formato', name: 'Publicidad de gran formato', description: 'Soluciones para que tu mensaje se vea.', mark: '02' },
  { id: 'rotulos', name: 'Rótulos y fachadas', description: 'Identidad visible para espacios y negocios.', mark: '03' },
  { id: 'textil', name: 'Textil y promocionales', description: 'Piezas personalizadas para marcas y equipos.', mark: '04' },
  { id: 'corte', name: 'Corte, grabado y señalética', description: 'Piezas gráficas y señalización a medida.', mark: '05' },
  { id: 'eventos', name: 'Exhibición y eventos', description: 'Material visual para presentar ideas y proyectos.', mark: '06' },
];

// Dirección y canales confirmados por Visual Corp el 8 de octubre de 2026.
export const publicAddress = 'Av. Jaime Roldós y General Andrade, Milagro';

export const serviceProjectPrompts = {
  impresion: 'Cuéntanos qué pieza impresa necesitas, la cantidad aproximada y si ya tienes un diseño.',
  'gran-formato': 'Comparte dónde se verá la pieza, las medidas aproximadas y el mensaje que quieres comunicar.',
  rotulos: 'Envíanos una foto del espacio, medidas aproximadas y la idea que tienes para tu marca.',
  textil: 'Indícanos el tipo de pieza, la cantidad aproximada y si tienes un arte o referencia.',
  corte: 'Descríbenos la pieza, las medidas aproximadas y el material que tienes en mente.',
  eventos: 'Cuéntanos el tipo de evento, el espacio disponible y las piezas visuales que imaginas.',
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
