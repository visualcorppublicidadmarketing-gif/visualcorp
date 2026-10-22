export const publicServiceFamilies = [
  { id: 'impresion', name: 'Impresión y papelería', description: 'Piezas gráficas para comunicar tu marca.', mark: '01' },
  { id: 'gran-formato', name: 'Publicidad de gran formato', description: 'Soluciones para que tu mensaje se vea.', mark: '02' },
  { id: 'rotulos', name: 'Rótulos y fachadas', description: 'Identidad visible para espacios y negocios.', mark: '03' },
  { id: 'textil', name: 'Textil y promocionales', description: 'Piezas personalizadas para marcas y equipos.', mark: '04' },
  { id: 'corte', name: 'Corte, grabado y señalética', description: 'Piezas gráficas y señalización a medida.', mark: '05' },
  { id: 'eventos', name: 'Exhibición y eventos', description: 'Material visual para presentar ideas y proyectos.', mark: '06' },
];

export const publicNavigation = [
  { label: 'Inicio', to: '/' },
  { label: 'Servicios', to: '/servicios', children: publicServiceFamilies.map(({ id, name }) => ({ label: name, to: `/servicios/${id}` })) },
  { label: 'La empresa', to: '/nosotros', children: [
    { label: 'Quiénes somos', to: '/nosotros' },
    { label: 'Cómo trabajamos', to: '/como-trabajamos' },
  ] },
  { label: 'Contacto', to: '/contacto' },
];
