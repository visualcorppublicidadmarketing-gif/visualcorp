export type PublicServiceId = 'impresion' | 'gran-formato' | 'rotulos' | 'textil' | 'corte' | 'eventos';

export type PublicServiceFamily = {
  id: PublicServiceId;
  name: string;
  description: string;
  mark: string;
};

export const publicServiceFamilies: PublicServiceFamily[] = [
  { id: 'impresion', name: 'Impresi├│n y papeler├¡a', description: 'Piezas gr├íficas para comunicar tu marca.', mark: '01' },
  { id: 'gran-formato', name: 'Publicidad de gran formato', description: 'Soluciones para que tu mensaje se vea.', mark: '02' },
  { id: 'rotulos', name: 'R├│tulos y fachadas', description: 'Identidad visible para espacios y negocios.', mark: '03' },
  { id: 'textil', name: 'Textil y promocionales', description: 'Piezas personalizadas para marcas y equipos.', mark: '04' },
  { id: 'corte', name: 'Corte, grabado y se├▒al├®tica', description: 'Piezas gr├íficas y se├▒alizaci├│n a medida.', mark: '05' },
  { id: 'eventos', name: 'Exhibici├│n y eventos', description: 'Material visual para presentar ideas y proyectos.', mark: '06' },
];

// Direcci├│n y canales confirmados por Visual Corp el 8 de octubre de 2026.
export const publicAddress = 'Av. Jaime Rold├│s y General Andrade, Milagro';

export const serviceProjectPrompts: Record<PublicServiceId, string> = {
  impresion: 'Cu├®ntanos qu├® pieza impresa necesitas, la cantidad aproximada y si ya tienes un dise├▒o.',
  'gran-formato': 'Comparte d├│nde se ver├í la pieza, las medidas aproximadas y el mensaje que quieres comunicar.',
  rotulos: 'Env├¡anos una foto del espacio, medidas aproximadas y la idea que tienes para tu marca.',
  textil: 'Ind├¡canos el tipo de pieza, la cantidad aproximada y si tienes un arte o referencia.',
  corte: 'Descr├¡benos la pieza, las medidas aproximadas y el material que tienes en mente.',
  eventos: 'Cu├®ntanos el tipo de evento, el espacio disponible y las piezas visuales que imaginas.',
};

export const publicNavigation = [
  { label: 'Inicio', to: '/' },
  { label: 'Servicios', to: '/servicios', children: publicServiceFamilies.map(({ id, name }) => ({ label: name, to: `/servicios/${id}` })) },
  { label: 'La empresa', to: '/nosotros', children: [
    { label: 'Qui├®nes somos', to: '/nosotros' },
    { label: 'C├│mo trabajamos', to: '/como-trabajamos' },
  ] },
  { label: 'Contacto', to: '/contacto' },
];
