/**
 * Visual Corp - Categorización Financiera e Inteligencia Operativa
 * Familias de Productos (Ventas/Ingresos) y Grupos de Egresos Operativos (Compras/Gastos).
 */

export type ProductFamilyKey =
  | 'gran_formato'
  | 'rotulos_corporeos'
  | 'textil_confeccion'
  | 'promocionales_souvenirs'
  | 'imprenta_papeleria'
  | 'corte_laser'
  | 'exhibicion_stands'
  | 'diseno_creatividad'
  | 'otros';

export interface ProductFamily {
  key: ProductFamilyKey;
  label: string;
  shortLabel: string;
  color: string;
  badgeBg: string;
  borderColor: string;
  description: string;
}

export const PRODUCT_FAMILIES: ProductFamily[] = [
  {
    key: 'gran_formato',
    label: 'Gran Formato & Gigantografía',
    shortLabel: 'Gran Formato',
    color: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    borderColor: 'rgba(2, 132, 199, 0.35)',
    description: 'Lonas front/back, vinilos adhesivos, microperforados, banners y gigantografías',
  },
  {
    key: 'rotulos_corporeos',
    label: 'Rótulos, Letras 3D & Fachadas',
    shortLabel: 'Rótulos & 3D',
    color: '#793fa0',
    badgeBg: 'rgba(121, 63, 160, 0.12)',
    borderColor: 'rgba(121, 63, 160, 0.35)',
    description: 'Letreros acrílicos, letras corpóreas, cajas de luz, neón LED y alucobond',
  },
  {
    key: 'textil_confeccion',
    label: 'Textil, Gorras & Confección',
    shortLabel: 'Textil & Gorras',
    color: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    borderColor: 'rgba(217, 119, 6, 0.35)',
    description: 'Camisetas, polos piqué, gorras trucker/gabardina, DTF textil y uniformes',
  },
  {
    key: 'promocionales_souvenirs',
    label: 'Artículos Promocionales & Souvenirs',
    shortLabel: 'Promocionales',
    color: '#e11d48',
    badgeBg: 'rgba(225, 29, 72, 0.12)',
    borderColor: 'rgba(225, 29, 72, 0.35)',
    description: 'Jarros sublimados, tomatodos, llaveros, credenciales PVC, sellos y regalos',
  },
  {
    key: 'imprenta_papeleria',
    label: 'Imprenta & Papelería Comercial',
    shortLabel: 'Imprenta',
    color: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    borderColor: 'rgba(5, 150, 105, 0.35)',
    description: 'Tarjetas de presentación, volantes, dípticos/trípticos, talonarios y calendarios',
  },
  {
    key: 'corte_laser',
    label: 'Corte Láser & Grabado CNC',
    shortLabel: 'Corte Láser',
    color: '#4f46e5',
    badgeBg: 'rgba(79, 70, 229, 0.12)',
    borderColor: 'rgba(79, 70, 229, 0.35)',
    description: 'MDF troquelado, acrílico grabado, placas conmemorativas y detalles a medida',
  },
  {
    key: 'exhibicion_stands',
    label: 'Exhibición, Displays & Stands',
    shortLabel: 'Exhibición & Stands',
    color: '#ea580c',
    badgeBg: 'rgba(234, 88, 12, 0.12)',
    borderColor: 'rgba(234, 88, 12, 0.35)',
    description: 'Roll-ups, displays araña, backings publicitarios y caballetes portátiles',
  },
  {
    key: 'diseno_creatividad',
    label: 'Diseño Gráfico & Creatividad',
    shortLabel: 'Diseño',
    color: '#9333ea',
    badgeBg: 'rgba(147, 51, 234, 0.12)',
    borderColor: 'rgba(147, 51, 234, 0.35)',
    description: 'Diseño de logotipos, identidad corporativa, diagramación y artes para producción',
  },
  {
    key: 'otros',
    label: 'Otros & Servicios Especiales',
    shortLabel: 'Otros',
    color: '#64748b',
    badgeBg: 'rgba(100, 116, 139, 0.12)',
    borderColor: 'rgba(100, 116, 139, 0.35)',
    description: 'Instalaciones en sitio, acabados especiales e ingresos no clasificados',
  },
];

const FAMILY_BY_KEY = new Map<ProductFamilyKey, ProductFamily>(
  PRODUCT_FAMILIES.map((f) => [f.key, f])
);

export function getFamilyDef(key: string): ProductFamily {
  return FAMILY_BY_KEY.get(key as ProductFamilyKey) || FAMILY_BY_KEY.get('otros')!;
}

/**
 * Clasifica una línea de venta o cotización en una de las familias oficiales de Visual Corp.
 */
export function classifyLineToFamily(line: any): ProductFamilyKey {
  if (!line) return 'otros';
  const text = [
    line.description_snapshot,
    line.sku_snapshot,
    line.catalog_product_id,
    line.label,
    line.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!text.trim()) return 'otros';

  // 1. Gran Formato & Gigantografía
  if (
    /lona|gigantograf|vinil|microperforad|esmerilad|banner|valla|pancarta|backlight|frontlight|blackout|ojal|guindola|reflec/i.test(text)
  ) {
    return 'gran_formato';
  }

  // 2. Rótulos, Letras 3D & Fachadas
  if (
    /rotulo|corporeo|letra.*3d|acrilic|caja.*luz|neon|led|alucobond|senaletica|letrero|fachada|galvanizad/i.test(text)
  ) {
    return 'rotulos_corporeos';
  }

  // 3. Textil, Gorras & Confección
  if (
    /camiseta|polo|pique|gorra|trucker|gabardina|dtf.*textil|sublimaci.*textil|bordad|jersey|kiana|chaleco|mandil|overol|confeccion|uniforme/i.test(text)
  ) {
    return 'textil_confeccion';
  }

  // 4. Promocionales & Souvenirs
  if (
    /jarro|taza|tomatodo|termo|llavero|credencial|carnet|yoyo|lanyard|cordon|pin\b|pines|boton|sello|trodat|esfero|boligrafo|funda|bolso|cambrella|almohada|cojin|souvenir/i.test(text)
  ) {
    return 'promocionales_souvenirs';
  }

  // 5. Imprenta & Papelería
  if (
    /tarjeta|volante|flyer|diptico|triptico|folleto|brochure|talonario|recetario|calendario|almanaque|carpeta.*corporativa|membretad|couche|comanda|nota.*venta/i.test(text)
  ) {
    return 'imprenta_papeleria';
  }

  // 6. Corte Láser & CNC
  if (
    /corte.*laser|grabado.*laser|mdf|troquelad|reconocimiento|trofeo|cnc|placa.*acrilic/i.test(text)
  ) {
    return 'corte_laser';
  }

  // 7. Exhibición & Stands
  if (
    /roll.*up|display|arana|backing|stand|caballete|exhibidor|hablador/i.test(text)
  ) {
    return 'exhibicion_stands';
  }

  // 8. Diseño & Creatividad
  if (
    /diseno|logotipo|logo|identidad|manual.*marca|vectorizaci|brief/i.test(text)
  ) {
    return 'diseno_creatividad';
  }

  return 'otros';
}

/**
 * Grupos y Categorías de Egresos Operativos para la Agencia y Taller de Visual Corp.
 */
export interface ExpenseGroup {
  group: string;
  description: string;
  categories: string[];
}

export const EXPENSE_GROUPS: ExpenseGroup[] = [
  {
    group: 'Producción, Insumos y Taller',
    description: 'Materia prima gráfica, materiales rígidos, LEDs, insumos y mantenimiento de maquinaria',
    categories: [
      'Materia prima gráfica (lonas, vinilos, tintas)',
      'Materiales rígidos (acrílicos, PVC, MDF, alucobond)',
      'Ferretería, LEDs, perfiles y montaje',
      'Textil, sublimación y artículos promocionales',
      'Mantenimiento y repuestos de maquinaria / plotters',
      'Compras e insumos', // Compatibilidad histórica
    ],
  },
  {
    group: 'Operación de Local y Sucursales',
    description: 'Arriendos, servicios básicos, conectividad y suministros de administración',
    categories: [
      'Arriendos de locales y talleres',
      'Arriendo', // Compatibilidad histórica
      'Servicios básicos (luz, agua)',
      'Servicios básicos', // Compatibilidad histórica
      'Internet, telefonía, software y hosting',
      'Internet y telefonía', // Compatibilidad histórica
      'Limpieza, seguridad e insumos de oficina',
    ],
  },
  {
    group: 'Logística e Instalaciones',
    description: 'Transporte de materiales, fletes, combustible y viáticos para instalaciones en sitio',
    categories: [
      'Transporte, fletes y combustible',
      'Transporte', // Compatibilidad histórica
      'Viáticos y hospedaje en instalaciones',
    ],
  },
  {
    group: 'Comercial, Marketing y Marca',
    description: 'Pauta publicitaria, muestras para clientes, material POP y uniformes',
    categories: [
      'Publicidad, pauta digital y marketing',
      'Marketing', // Compatibilidad histórica
      'Muestras, exhibidores y material POP',
      'Uniformes corporativos',
    ],
  },
  {
    group: 'Servicios Profesionales y Tercerización',
    description: 'Trabajos metalmecánicos externos, acabados especiales y honorarios profesionales',
    categories: [
      'Tercerización de talleres / metalmecánica',
      'Honorarios contables, legales y técnicos',
      'Honorarios', // Compatibilidad histórica
      'Mantenimiento', // Compatibilidad histórica
      'Otros gastos operativos',
      'Otros', // Compatibilidad histórica
    ],
  },
];

export const ALL_EXPENSE_CATEGORIES = Array.from(
  new Set(EXPENSE_GROUPS.flatMap((g) => g.categories))
);

export function getExpenseGroupForCategory(category: string): string {
  for (const group of EXPENSE_GROUPS) {
    if (group.categories.includes(category)) {
      return group.group;
    }
  }
  return 'Otros gastos operativos';
}
