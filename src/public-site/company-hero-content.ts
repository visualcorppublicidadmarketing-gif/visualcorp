import type { Title3DKey } from './Title3D';

export const studioSpecialties = [
  { name: 'Diseño', lines: ['Todo empieza', 'con una idea.'], detail: 'Identidad y dirección visual', description: 'Damos forma a lo que quieres comunicar.' },
  { name: 'Publicidad', lines: ['Una marca.', 'Muchos espacios.'], detail: 'Piezas para comunicar', description: 'Tu mensaje en papel, en tu local y en gran formato.' },
  { name: 'Producción', lines: ['De la idea', 'a la pieza.'], detail: 'Coordinación y producción', description: 'Revisamos formatos, materiales y alcance según tu proyecto.' },
] as const;

export const companyProcessSteps: ReadonlyArray<{
  n: string;
  label: string;
  title: string;
  text: string;
  titleKey: Title3DKey;
}> = [
  { n: '01', label: 'Tu idea', title: 'Nos cuentas la idea', text: 'Comparte el objetivo, el espacio o la necesidad que quieres resolver.', titleKey: 'disenando' },
  { n: '02', label: 'Los detalles', title: 'Revisamos los detalles', text: 'Conversamos sobre referencias, medidas, cantidades y el alcance del proyecto.', titleKey: 'corporeos' },
  { n: '03', label: 'El siguiente paso', title: 'Definimos el siguiente paso', text: 'Te orientamos sobre cómo avanzar. Valores, disponibilidad y tiempos se confirman según cada solicitud.', titleKey: 'instalacion' },
];
