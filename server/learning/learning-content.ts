export type LearningTone =
  | 'neutral'
  | 'gold'
  | 'cyan'
  | 'green'
  | 'red'
  | 'violet'
  | 'blue'
  | 'amber'
  | 'mint';

export type LearningBadgeCell = {
  text: string;
  mono?: boolean;
  highlight?: boolean;
  badge?: string;
  badgeTone?: LearningTone;
};

export type LearningCardItem = {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  badge?: string;
  badgeTone?: LearningTone;
  hex?: string;
  gradient?: string;
  darkText?: boolean;
  items?: string[];
};

export type LearningBlock =
  | {
      type: 'media';
      src: string;
      alt: string;
      caption?: string;
      badge?: string;
    }
  | {
      type: 'cards';
      columns?: 2 | 3 | 4;
      variant?: 'default' | 'compact' | 'swatch-solid' | 'platform' | 'metric';
      title?: string;
      items: LearningCardItem[];
    }
  | {
      type: 'tokens';
      title?: string;
      filename: string;
      parts: {
        token: string;
        label: string;
        help: string;
        tone: 'violet' | 'blue' | 'green' | 'amber' | 'red';
      }[];
    }
  | {
      type: 'color-layers';
      title?: string;
      layers: {
        name: string;
        swatch: string;
        subtitle: string;
        description: string;
        tag: string;
        tone: 'neutral' | 'blue' | 'red';
      }[];
    }
  | {
      type: 'diagram';
      kind:
        | 'rgb-vs-cmyk'
        | 'bleed-safe-zone'
        | 'laser-ai-file'
        | 'export-flow'
        | 'laser-focus-7mm'
        | 'workshop-kit'
        | 'quality-cards';
      eyebrow?: string;
      title?: string;
      subtitle?: string;
      labels: Record<string, string>;
      highlights?: string[];
      groups?: { title: string; tone?: LearningTone; items: string[] }[];
    }
  | {
      type: 'table';
      title?: string;
      headers: string[];
      rows: {
        group?: string;
        groupTone?: LearningTone;
        cells: LearningBadgeCell[];
      }[];
    }
  | {
      type: 'compare';
      items: {
        icon?: string;
        title: string;
        subtitle?: string;
        tone?: 'neutral' | 'danger' | 'success' | 'cyan' | 'amber' | 'violet';
        description?: string;
        points?: { text: string; highlight?: string }[];
      }[];
    }
  | {
      type: 'specs-grid';
      title?: string;
      items: {
        icon?: string;
        title: string;
        badge?: string;
        badgeTone?: LearningTone;
        specs: { label: string; value: string }[];
        note?: string;
      }[];
    }
  | {
      type: 'flow';
      title?: string;
      steps: {
        icon?: string;
        title: string;
        subtitle?: string;
        code?: string;
      }[];
    }
  | {
      type: 'tree';
      title?: string;
      lines: {
        text: string;
        tone?: 'root' | 'folder' | 'highlight' | 'file' | 'comment';
      }[];
    }
  | {
      type: 'steps';
      title?: string;
      layout?: 'list' | 'row';
      items: {
        number?: number;
        title: string;
        description: string;
        code?: string;
      }[];
    }
  | {
      type: 'callout';
      tone: 'tip' | 'warning' | 'danger' | 'success';
      icon?: string;
      title: string;
      text: string;
    }
  | {
      type: 'schedule';
      title?: string;
      items: {
        icon?: string;
        days: string;
        hours: string;
        note?: string;
        highlight?: string;
      }[];
    }
  | {
      type: 'quote';
      text: string;
      author?: string;
    }
  | {
      type: 'swatches';
      title?: string;
      items: {
        label: string;
        hex?: string;
        gradient?: string;
        darkText?: boolean;
      }[];
    }
  | {
      type: 'tool-links';
      title?: string;
      items: {
        title: string;
        description: string;
        practiceId: string;
        tone?: LearningTone;
      }[];
    };

export type LearningSection = {
  id: string;
  eyebrow?: string;
  icon?: string;
  title: string;
  intro: string;
  points: string[];
  note?: string;
  blocks?: LearningBlock[];
};

export type LearningGuide = {
  id: string;
  areaId: string;
  title: string;
  subtitle: string;
  duration: string;
  outcome: string;
  coverImage?: string;
  badge?: string;
  sections: LearningSection[];
  checklist: string[];
  source: string;
};

export type LearningArea = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  accent: string;
  icon: string;
  coverImage?: string;
  guideIds: string[];
};

export const learningAreas: LearningArea[] = [
  {
    id: 'inicio',
    title: 'Primeros pasos',
    eyebrow: 'INTEGRACIÓN',
    description: 'Conoce la cultura de Visual Corp, ubicaciones clave, reglas de convivencia y hábitos iniciales.',
    accent: 'mint',
    icon: 'Compass',
    guideIds: ['induccion'],
  },
  {
    id: 'seguridad',
    title: 'Seguridad',
    eyebrow: 'CUIDADO Y PREVENCIÓN',
    description: 'EPP obligatorio, químicos y solventes, riesgos eléctricos y protocolos de emergencia.',
    accent: 'coral',
    icon: 'ShieldCheck',
    guideIds: ['seguridad'],
  },
  {
    id: 'ventas',
    title: 'Ventas y atención',
    eyebrow: 'EXPERIENCIA DEL CLIENTE',
    description: 'Atención, seguimiento de pedidos, control de ventas, cotizaciones y matemáticas por m².',
    accent: 'amber',
    icon: 'MessagesSquare',
    guideIds: ['asesores'],
  },
  {
    id: 'diseno-produccion',
    title: 'Diseño y producción',
    eyebrow: 'DEL ARTE AL ACABADO',
    description: 'Fundamentos, nomenclatura de archivos, Galaxy ecosolvente, corte láser 60W e instalación en taller.',
    accent: 'violet',
    icon: 'PanelsTopLeft',
    coverImage: '/manual-aprendizaje/fuente/img/disenador_workspace.png',
    guideIds: ['fundamentos', 'disenadores', 'impresores', 'laser', 'taller'],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    eyebrow: 'COMUNICACIÓN DE MARCA',
    description: 'Redes sociales, fotografía de instalaciones, identidad de marca, atención digital y métricas.',
    accent: 'cyan',
    icon: 'Megaphone',
    guideIds: ['marketing'],
  },
  {
    id: 'practicas',
    title: 'Prácticas y herramientas',
    eyebrow: 'APRENDER HACIENDO',
    description: 'Calculadoras de área, visibilidad de rótulos, catálogo Pantone, trivia técnica y listas de apoyo.',
    accent: 'pink',
    icon: 'Activity',
    guideIds: [],
  },
];

export const learningPractices = [
  { id: 'calculadora', title: 'Calculadora de áreas', description: 'Calcula el metraje total por pieza y cantidad antes de producir.', icon: 'Calculator', category: 'Medidas', duration: '2 min' },
  { id: 'distancia', title: 'Distancia visual', description: 'Simula la altura de letra adecuada según la distancia de lectura.', icon: 'Ruler', category: 'Medidas', duration: '3 min' },
  { id: 'pantone', title: 'Catálogo de color', description: 'Busca referencias Pantone por nombre, código o valor HEX.', icon: 'SwatchBook', category: 'Color', duration: 'Libre' },
  { id: 'colormatch', title: 'Color Match', description: 'Entrena el ojo distinguiendo matices y saturaciones.', icon: 'Palette', category: 'Color', duration: '3 min' },
  { id: 'quiz', title: 'Trivia de Visual Corp', description: 'Evaluación rápida sobre seguridad, diseño, láser e impresión.', icon: 'Brain', category: 'Repaso', duration: '4 min' },
  { id: 'checklist', title: 'Listas de apoyo', description: 'Checklist personal por etapa antes de liberar o instalar un pedido.', icon: 'CheckCircle2', category: 'Flujo', duration: 'Libre' },
];

export const learningChecklists = [
  { id: 'asesoria', label: 'Asesoría', tasks: ['Confirmar objetivo, medidas y cantidad', 'Verificar precio y condiciones vigentes', 'Dejar visible el dato pendiente', 'Asignar responsable y próximo paso'] },
  { id: 'diseno', label: 'Diseño', tasks: ['Confirmar proceso y material', 'Revisar dimensiones y orientación', 'Comprobar textos, vínculos y capas', 'Exportar el formato acordado y avisar a producción'] },
  { id: 'impresion', label: 'Impresión', tasks: ['Cruzar archivo con la orden', 'Confirmar material y perfil actual', 'Revisar la prueba inicial', 'Etiquetar y proteger el trabajo terminado'] },
  { id: 'taller', label: 'Taller', tasks: ['Confirmar alcance, contacto y acceso', 'Revisar piezas, herramientas y EPP', 'Evaluar las condiciones del sitio', 'Registrar resultado y pendientes'] },
];

const STANDARD_SCHEDULES: LearningBlock = {
  type: 'schedule',
  items: [
    {
      icon: 'briefcase',
      days: 'Lunes a Viernes',
      hours: '8:20 — 18:00',
      highlight: 'Lunes = Reunión de equipo',
      note: 'puntual a las 8:20 am para revisar pendientes y metas.',
    },
    {
      icon: 'clock',
      days: 'Sábados',
      hours: '8:20 — 13:00',
      highlight: 'Cierre semanal y quincena',
      note: 'en los sábados correspondientes al período vigente.',
    },
  ],
};

export const learningGuides: LearningGuide[] = [
  {
    id: 'induccion',
    areaId: 'inicio',
    title: 'Tu primer día en Visual Corp',
    subtitle: 'Cultura de servicio, normas base, ubicaciones clave y cuidado compartido del taller.',
    duration: '8 min',
    badge: 'INDUCCIÓN',
    outcome: 'Sabrás cómo nos organizamos desde el primer día, dónde están los recursos esenciales y qué hábitos mantienen seguro el taller.',
    source: 'Manual interno Visual Corp · Inducción y convivencia. Los horarios o turnos vigentes se confirman en Equipo → Horarios.',
    sections: [
      {
        id: 'cultura',
        eyebrow: '⭐ SECCIÓN 01',
        title: 'Cultura Visual Corp',
        intro: 'Una bienvenida común para entrar al ritmo del taller y las áreas operativas sin suposiciones ni improvisación.',
        points: [
          'En Visual Corp ayudamos a otros negocios a verse profesionales y crecer mediante rótulos, impresiones, corte láser e instalaciones.',
          'Cada banner, pieza en acrílico o instalación representa directamente la imagen de nuestro cliente y la firma de Visual Corp.',
        ],
        blocks: [
          {
            type: 'quote',
            text: '“Hacer que nuestros clientes destaquen mediante soluciones gráficas de alta calidad, entregadas a tiempo y con un servicio excepcional.”',
            author: 'Nuestra misión compartida · Visual Corp',
          },
          {
            type: 'callout',
            tone: 'tip',
            icon: 'sparkles',
            title: 'Tus aportes son escuchados',
            text: 'Si detectas una oportunidad para mejorar un proceso, ordenar materiales o prevenir errores, compártelo con el equipo en la reunión semanal o con tu coordinador.',
          },
        ],
      },
      {
        id: 'reglas',
        eyebrow: '📜 SECCIÓN 02',
        title: 'Reglas básicas de operación',
        intro: 'Tres hábitos simples que protegen los tiempos de entrega, la seguridad y el ambiente de equipo.',
        points: [],
        blocks: [
          {
            type: 'steps',
            items: [
              {
                number: 1,
                title: 'Puntualidad y arranque ordenado',
                description: 'Prepárate unos minutos antes de iniciar tu jornada para abrir estaciones, revisar órdenes y arrancar sin carreras. Los lunes revisamos prioridades del equipo a primera hora.',
              },
              {
                number: 2,
                title: 'Pausas activas breves',
                description: 'A mitad de mañana y tarde, tómate 5 minutos para estirarte, hidratarte y descansar la vista frente a monitores o mesas de armado.',
              },
              {
                number: 3,
                title: 'Reporte temprano de incidencias',
                description: 'Si una máquina muestra fallas, falta material o un archivo no coincide con el pedido, avisa de inmediato antes de continuar o forzar el equipo.',
              },
            ],
          },
        ],
      },
      {
        id: 'ubicaciones',
        eyebrow: '📍 SECCIÓN 03',
        title: 'Ubicaciones clave en el taller',
        intro: 'Identifica desde tu primer día dónde se encuentran los implementos de respuesta rápida, reciclaje y herramientas comunes.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 2,
            items: [
              {
                icon: '🩹',
                badge: 'PRIMEROS AUXILIOS',
                badgeTone: 'red',
                title: 'Botiquín de primeros auxilios',
                description: 'En la pared principal del taller de armados, junto a la puerta de oficina. Repórtanos siempre que se consuma un insumo para reponerlo.',
              },
              {
                icon: '🧯',
                badge: 'EMERGENCIAS',
                badgeTone: 'amber',
                title: 'Extintores despejados',
                description: 'Ubicados junto a la máquina láser y en el acceso principal. Nunca bloquees su acceso con rollos, cajas o escaleras.',
              },
              {
                icon: '♻️',
                badge: 'APROVECHAMIENTO',
                badgeTone: 'green',
                title: 'Reciclaje y retazos útiles',
                description: 'Retazos de acrílico mayores a 10 cm van a la caja asignada y sobrantes de lona mayores a 50 cm se almacenan en el estante posterior.',
              },
              {
                icon: '🧰',
                badge: 'USO COMPARTIDO',
                badgeTone: 'cyan',
                title: 'Herramientas comunes',
                description: 'Después de usar taladros, pistolas de calor, niveles o reglas, límpialos y regrésalos al tablero correspondiente.',
              },
            ],
          },
        ],
      },
      {
        id: 'convivencia',
        eyebrow: '🤝 SECCIÓN 04',
        title: 'Convivencia, limpieza y cuidado de áreas',
        intro: 'Un taller ordenado reduce daños sobre impresiones frescas, acrílicos y herramientas.',
        points: [
          'Deja tu mesa de armado o escritorio despejado y sin basura al cerrar la jornada.',
          'Utiliza únicamente el área designada para alimentos y bebidas: está prohibido comer o dejar vasos cerca de impresoras Galaxy, láser CO₂ o estaciones de diseño.',
          'Coordina dudas de archivo o materiales directamente con diseño, impresión o bodega dentro de Visual Corp Suite.',
        ],
      },
    ],
    checklist: [
      'Ubiqué el botiquín, los extintores y las salidas principales.',
      'Conozco con quién confirmar órdenes y novedades diarias.',
      'Mantengo bebidas y alimentos lejos de máquinas y computadoras.',
    ],
  },
  {
    id: 'seguridad',
    areaId: 'seguridad',
    title: 'Seguridad industrial y prevención de riesgos',
    subtitle: 'EPP obligatorio, químicos y solventes, peligros eléctricos y acción rápida ante emergencias.',
    duration: '8 min',
    badge: 'SEGURIDAD',
    outcome: 'Reconocerás los riesgos reales del taller antes de operar máquinas láser, químicos, herramientas eléctricas o realizar instalaciones.',
    source: 'Manual interno Visual Corp · Seguridad en taller. Ninguna urgencia justifica omitir una protección.',
    sections: [
      {
        id: 'epp',
        eyebrow: '🦺 SECCIÓN 01',
        title: 'Equipos de Protección Personal (EPP)',
        intro: 'El uso de EPP forma parte del uniforme de trabajo según cada tarea. Si falta una protección necesaria, detén la tarea y repórtalo.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 2,
            items: [
              {
                icon: '🥽',
                badge: 'OBLIGATORIO',
                badgeTone: 'amber',
                title: 'Gafas de seguridad',
                description: 'Indispensables al trabajar cerca del láser CO₂, amoladoras, cortadoras de disco, soldadura y perforaciones en altura.',
              },
              {
                icon: '🧤',
                badge: 'REGLA CRÍTICA',
                badgeTone: 'cyan',
                title: 'Guantes de trabajo',
                description: 'Úsalos al manipular planchas metálicas, vidrio, acrílico con filo vivo o tubería. NUNCA uses guantes holgados en taladros de banco ni piezas rotativas.',
              },
              {
                icon: '🥾',
                badge: 'TALLER Y MONTAJE',
                badgeTone: 'green',
                title: 'Calzado cerrado',
                description: 'Prohibidas sandalias o calzado abierto en taller e instalaciones por riesgo de caída de planchas, chispas o herramientas.',
              },
              {
                icon: '😷',
                badge: 'VAPORES Y POLVO',
                badgeTone: 'violet',
                title: 'Mascarilla o respirador',
                description: 'Requerido al lijar MDF, aplicar pintura en spray, manipular solventes fuertes o limpiar residuos finos.',
              },
            ],
          },
        ],
      },
      {
        id: 'quimicos',
        eyebrow: '🧪 SECCIÓN 02',
        title: 'Manejo de químicos, tintas y solventes',
        intro: 'Trabajamos con insumos inflamables y volátiles que exigen ventilación, guantes y envases bien cerrados.',
        points: [
          'Tintas ecosolventes y UV: evita contacto con la piel. Si salpica a los ojos, lava de inmediato en el lavadero con agua continua al menos 15 minutos y busca atención médica.',
          'Thinner, alcohol isopropílico y cloroformo para fusión de acrílico: úsalos únicamente con ventilación activa o extractor encendido y lejos de chispas.',
          'Todo envase químico debe permanecer etiquetado y herméticamente cerrado fuera de áreas de calor.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            icon: 'shield',
            title: 'Nunca trasvases químicos en botellas de bebidas',
            text: 'Todo líquido técnico (thinner, alcohol, solvente de limpieza o cloroformo) debe conservar su etiqueta original visible para evitar confusiones graves.',
          },
        ],
      },
      {
        id: 'riesgos',
        eyebrow: '⚡ SECCIÓN 03',
        title: 'Riesgos eléctricos y alta tensión',
        intro: 'Convivimos con tubos láser de alto voltaje, calentadores de plóter y tableros eléctricos.',
        points: [
          'Láser CO₂ 60W: nunca abras la compuerta trasera del tubo láser mientras la máquina esté energizada; maneja voltajes potencialmente letales.',
          'Plotters Galaxy: sus resistencias frontales y traseras mantienen temperaturas altas. Desenchufa siempre desde el cuerpo del conector, nunca halando el cable.',
          'Mantén líquidos, botellas y cables dañados completamente alejados de tomacorrientes, UPS y consolas de impresión.',
        ],
      },
      {
        id: 'emergencias',
        eyebrow: '🚨 SECCIÓN 04',
        title: 'Protocolos de acción rápida en emergencias',
        intro: 'Ante un incidente, prioriza la integridad física de las personas y corta la energía o fuente de riesgo.',
        points: [],
        blocks: [
          {
            type: 'compare',
            items: [
              {
                icon: 'flame',
                title: 'Conato de incendio (láser / taller)',
                subtitle: 'Respuesta inmediata',
                tone: 'danger',
                points: [
                  { text: 'Pausa el equipo y apaga la alimentación/extracción de inmediato.' },
                  { text: 'Si persiste llama abierta, aplica el extintor de CO₂ a la base del fuego.' },
                  { text: 'NUNCA lances agua sobre circuitos eléctricos ni sobre la cama del láser.', highlight: 'Solo CO₂' },
                ],
              },
              {
                icon: 'shield',
                title: 'Cortaduras o golpes en sitio/taller',
                subtitle: 'Atención y reporte',
                tone: 'amber',
                points: [
                  { text: 'Detén la labor de inmediato y retira el riesgo eléctrico o cortante.' },
                  { text: 'Aplica presión limpia con gasa del botiquín y notifica al responsable.' },
                  { text: 'Si el corte es profundo o hay compromiso ocular, acude de inmediato a urgencias.' },
                ],
              },
            ],
          },
        ],
      },
    ],
    checklist: [
      'Verifico gafas, guantes y calzado antes de iniciar cortes o instalaciones.',
      'Confirmo ventilación y envases cerrados al usar solventes.',
      'Conozco la ubicación exacta del extintor de CO₂ más cercano.',
    ],
  },
  {
    id: 'asesores',
    areaId: 'ventas',
    title: 'Guía integral para asesores comerciales',
    subtitle: 'Atención al cliente, consulta de precios vigentes, control de órdenes, matemáticas por m² y seguimiento.',
    duration: '12 min',
    badge: 'COMERCIAL',
    outcome: 'Podrás recibir un pedido completo, cotizar sin improvisar, evitar errores en hojas compartidas o POS y acompañar al cliente hasta su entrega.',
    source: 'Manual interno Visual Corp · Asesores. Los precios oficiales y el registro operativo vigente se gestionan en Visual Corp Suite.',
    sections: [
      {
        id: 'habilidades',
        eyebrow: '💼 SECCIÓN 01',
        title: 'Habilidades esenciales del asesor',
        intro: 'Un asesor comercial de Visual Corp domina producto, trato humano y orden operativo.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              { icon: 'message', badge: 'BÁSICO', badgeTone: 'green', title: 'Comunicación clara', description: 'WhatsApp, llamadas y atención presencial ágil, cordial y sin ambigüedades.' },
              { icon: 'calculator', badge: 'ESENCIAL', badgeTone: 'gold', title: 'Cotización por m² y escala', description: 'Convertir cm a metros, sumar diseño y diferenciar tirajes por volumen.' },
              { icon: 'layers', badge: 'INTERMEDIO', badgeTone: 'cyan', title: 'Criterio de materiales', description: 'Distinguir cuándo recomendar lona económica, backlight, vinil, PVC o rótulo.' },
              { icon: 'clipboard', badge: 'INTERMEDIO', badgeTone: 'cyan', title: 'Seguimiento activo', description: 'Saber en qué etapa está cada orden para informar al cliente antes que pregunte.' },
              { icon: 'target', badge: 'DIARIO', badgeTone: 'violet', title: 'Orden en abonos y saldos', description: 'Registrar correctamente proforma, abono inicial, saldo por cobrar y entrega.' },
              { icon: 'sparkles', badge: 'CRÍTICO', badgeTone: 'amber', title: 'Cero promesas imposibles', description: 'Confirmar tiempos reales con diseño, impresión o taller antes de comprometer fecha.' },
            ],
          },
        ],
      },
      {
        id: 'precios',
        eyebrow: '💵 SECCIÓN 02',
        title: 'Consulta de precios vigentes sin improvisar',
        intro: 'Los costos de materiales cambian. Dar una cifra de memoria genera pérdidas o malestar al ajustar luego.',
        points: [],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            icon: 'alert',
            title: 'Nunca cotices de memoria ni inventes tarifas',
            text: 'Consulta siempre el Catálogo y el Cotizador vigente dentro de Visual Corp Suite (o la tarifa oficial confirmada por administración) antes de enviar un valor definitivo.',
          },
          {
            type: 'callout',
            tone: 'success',
            icon: 'check',
            title: 'Servicio justo y competitivo',
            text: 'El negocio sostenible viene de orientar bien al cliente con el material correcto y un precio claro desde el catálogo, no de inflar márgenes arbitrariamente.',
          },
        ],
      },
      {
        id: 'atencion',
        eyebrow: '😊 SECCIÓN 03',
        title: 'Cinco pasos en la atención al cliente',
        intro: 'La forma en que escuchas y aclaras el pedido define la confianza del cliente desde el primer minuto.',
        points: [],
        blocks: [
          {
            type: 'steps',
            items: [
              { number: 1, title: 'Saluda con energía y disposición', description: 'Recibe al cliente de inmediato por ventanilla o chat: “¡Buen día! ¿En qué proyecto podemos ayudarte hoy?”.' },
              { number: 2, title: 'Escucha primero, pregunta lo técnico después', description: 'Anota para qué usará la pieza, si irá en interior/exterior, medidas aproximadas y si ya cuenta con archivo editable.' },
              { number: 3, title: 'Sé honesto con las fechas de entrega', description: 'Es mil veces mejor confirmar entrega para mañana tras validar con taller, que prometer en dos horas e incumplir.' },
              { number: 4, title: 'Verifica diseño, medidas y material antes de liberar', description: 'Antes de aprobar a producción, cruza proforma/orden vs arte para evitar impresiones al revés o en material errado.' },
              { number: 5, title: 'Avisa proactivamente al terminar', description: 'Comunica al cliente apenas el trabajo pase a listo para retiro o coordinar su instalación.' },
            ],
          },
          {
            type: 'quote',
            text: '“Recuerda servir al prójimo con un buen servicio y un buen producto al mejor precio. La satisfacción del cliente es nuestra mejor publicidad.”',
            author: 'Esteban Nicola · Dirección Visual Corp',
          },
        ],
      },
      {
        id: 'excel',
        eyebrow: '📊 SECCIÓN 04',
        title: 'Registro comercial en POS / Suite y hoja de respaldo',
        intro: 'El sistema operativo principal de ventas, abonos y seguimiento vive en Visual Corp Suite; donde aún se concilie la hoja semanal compartida, respeta sus columnas automáticas.',
        points: [],
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            icon: 'shield',
            title: '¡CRÍTICO en hoja semanal! No tocar columnas G, H, L y M',
            text: 'Esas columnas calculan día automático, saldo por cobrar (Venta − Abonado) y totales con fórmula. Sobrescribirlas rompe los cierres del equipo.',
          },
          {
            type: 'table',
            title: 'Estructura de columnas de la hoja compartida (referencia)',
            headers: ['Col.', 'Campo', 'Descripción', 'Ingreso asesor'],
            rows: [
              { cells: [{ text: 'A', mono: true }, { text: 'N° Proforma', highlight: true }, { text: 'Número de orden/proforma o nombre de cliente.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'B', mono: true }, { text: 'Descripción', highlight: true }, { text: 'Qué se fabrica (ej. Lona EC, Vinilo, Rótulo).' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'C', mono: true }, { text: 'Medidas', highlight: true }, { text: 'Dimensiones exactas ANCHO × ALTO.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'D', mono: true }, { text: 'Material', highlight: true }, { text: 'Lona EC, PVC, Vinil, Microperforado, Traslúcida, etc.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'E', mono: true }, { text: 'Forma de Pago', highlight: true }, { text: 'Efectivo, Transferencia o Cheque.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'F', mono: true }, { text: 'Fecha', highlight: true }, { text: 'Fecha de toma de pedido.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'G', mono: true }, { text: 'DÍA (Número)', highlight: true }, { text: 'Fórmula automática de día.' }, { text: '🔴 NO TOCAR', badge: 'auto', badgeTone: 'red' }] },
              { cells: [{ text: 'H', mono: true }, { text: 'DÍA (Nombre)', highlight: true }, { text: 'Fórmula automática (lunes, martes…).' }, { text: '🔴 NO TOCAR', badge: 'auto', badgeTone: 'red' }] },
              { cells: [{ text: 'I', mono: true }, { text: 'Fecha de Entrega', highlight: true }, { text: 'Fecha comprometida con el cliente.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'J', mono: true }, { text: 'Venta Realizada', highlight: true }, { text: 'Monto total acordado.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'K', mono: true }, { text: 'Abonado / Entrada', highlight: true }, { text: 'Anticipo recibido al cerrar el pedido.' }, { text: '✅ SÍ', badge: 'manual', badgeTone: 'green' }] },
              { cells: [{ text: 'L', mono: true }, { text: 'Por Cobrar', highlight: true }, { text: 'Fórmula automática: Venta − Abonado.' }, { text: '🔴 NO TOCAR', badge: 'auto', badgeTone: 'red' }] },
              { cells: [{ text: 'M', mono: true }, { text: 'Totales / Resumen', highlight: true }, { text: 'Totales acumulados automáticos.' }, { text: '🔴 NO TOCAR', badge: 'auto', badgeTone: 'red' }] },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            icon: 'lightbulb',
            title: 'Cuadre diario antes del cierre',
            text: 'Al final de cada jornada, valida que los registros en Visual Corp Suite y tus abonos recibidos cuadren con efectivo y comprobantes de transferencia.',
          },
        ],
      },
      {
        id: 'seguimiento',
        eyebrow: '🔄 SECCIÓN 05',
        title: 'Seguimiento de trabajos de principio a fin',
        intro: 'Tu labor no termina al emitir la nota de venta; termina cuando el cliente recibe a satisfacción y queda saldado.',
        points: [],
        blocks: [
          {
            type: 'steps',
            items: [
              { number: 1, title: 'Toma completa del pedido', description: 'Medidas, material, cantidad, archivo/brief, fecha comprometida y anticipo completo.' },
              { number: 2, title: 'Traspaso limpio a diseño o impresión', description: 'Deja visible cada instrucción o pendiente en la orden para evitar preguntas repetidas.' },
              { number: 3, title: 'Monitoreo antes de la hora límite', description: 'Consulta el avance en producción o taller con tiempo si la entrega se acerca.' },
              { number: 4, title: 'Notificación proactiva', description: 'Avisa apenas el producto esté listo en mostrador o programado para ruta.' },
              { number: 5, title: 'Cobro del saldo contra entrega', description: 'Confirma el monto restante antes de despachar y registra el pago final.' },
            ],
          },
        ],
      },
      {
        id: 'cotizaciones',
        eyebrow: '🧮 SECCIÓN 06',
        title: 'Fórmula de metraje y cálculo rápido',
        intro: 'Verifica medidas en metros antes de calcular áreas y confirma siempre las tarifas activas en el catálogo.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 2,
            items: [
              { icon: 'ruler', badge: 'FÓRMULA', badgeTone: 'cyan', title: 'Conversión y área en m²', description: 'Divide medidas en centímetros para 100 (ej. 200 × 100 cm = 2 m × 1 m = 2 m²). Total = Ancho (m) × Alto (m) × tarifa vigente del catálogo × cantidad.' },
              { icon: 'package', badge: 'ESCALAS', badgeTone: 'amber', title: 'Precios por cantidad y diseño', description: 'Tarjetas, jarros, llaveros o cortes especiales escalan según cantidad. Aclara por separado si incluye servicio de diseño gráfico o instalación.' },
            ],
          },
          {
            type: 'tool-links',
            title: 'Practica con las herramientas integradas',
            items: [
              { title: 'Calculadora de áreas (m²)', description: 'Calcula m² por pieza y por tiraje sin equivocar decimales.', practiceId: 'calculadora', tone: 'cyan' },
              { title: 'Checklist de Asesoría', description: 'Repasa los 4 controles antes de pasar la orden a producción.', practiceId: 'checklist', tone: 'mint' },
            ],
          },
        ],
      },
      {
        id: 'horarios',
        eyebrow: '🕐 SECCIÓN 07',
        title: 'Horarios y reunión semanal',
        intro: 'Horario de referencia del manual (confirma novedades de turno en Equipo → Horarios dentro de la Suite).',
        points: [],
        blocks: [STANDARD_SCHEDULES],
      },
    ],
    checklist: [
      'Confirmé medidas exactas (Ancho × Alto), material y cantidad.',
      'Verifiqué la tarifa oficial en el Catálogo / Cotizador de la Suite.',
      'Registré abono, fecha comprometida y próximo responsable.',
    ],
  },
  {
    id: 'fundamentos',
    areaId: 'diseno-produccion',
    title: 'Fundamentos visuales, color y preprensa',
    subtitle: 'Psicología del color, RGB vs CMYK, DPI, tipografía, formatos, sangría, zona segura y glosario gráfico.',
    duration: '14 min',
    badge: 'FUNDAMENTAL',
    coverImage: '/manual-aprendizaje/fuente/img/disenador_workspace.png',
    outcome: 'Dominarás el criterio técnico común entre asesores, diseñadores e impresores para evitar archivos pixelados, colores apagados o textos cortados.',
    source: 'Manual interno Visual Corp · Fundamentos de diseño e impresión (13 módulos visuales).',
    sections: [
      {
        id: 'color',
        eyebrow: '🎨 SECCIÓN 01',
        title: 'Teoría y psicología del color',
        intro: 'Cada color comunica emociones distintas según el rubro del negocio que estamos diseñando.',
        points: [
          'Complementarios: opuestos en el círculo cromático para máximo contraste y llamada de atención.',
          'Análogos: colores vecinos que brindan armonía suave y continuidad visual.',
          'Monocromáticos: variaciones de brillo de un mismo tono para piezas sobrias y uniformes.',
        ],
        blocks: [
          {
            type: 'cards',
            columns: 4,
            variant: 'swatch-solid',
            items: [
              { title: 'Azul', description: 'Confianza, serenidad y respaldo. Ideal para banca, salud o tecnología.', hex: '#1e3a8a' },
              { title: 'Rojo', description: 'Urgencia, energía y apetito. Ideal para promociones y comida rápida.', hex: '#b91c1c' },
              { title: 'Amarillo / Naranja', description: 'Optimismo, cercanía y foco de atención visual inmediata.', hex: '#f59e0b', darkText: true },
              { title: 'Verde', description: 'Crecimiento, frescura, agro y productos naturales o ecológicos.', hex: '#15803d' },
            ],
          },
        ],
      },
      {
        id: 'formatos',
        eyebrow: '🖨️ SECCIÓN 02',
        title: '¿Qué es RGB, CMYK o Pantone?',
        intro: 'La pantalla emite luz (RGB) y la lona o vinil absorben tinta (CMYK). Entender esa diferencia explica por qué cambian ciertos neones o azules.',
        points: [],
        blocks: [
          {
            type: 'compare',
            items: [
              {
                icon: 'monitor',
                title: 'RGB (Red · Green · Blue)',
                subtitle: 'Pantallas, redes sociales y web',
                tone: 'cyan',
                description: 'Funciona sumando luz brillante en monitores y celulares. Úsalo para redes sociales, portafolio web y presentaciones digitales.',
              },
              {
                icon: 'printer',
                title: 'CMYK (Cian · Magenta · Yellow · Key)',
                subtitle: 'Impresión física y máquinas Galaxy',
                tone: 'violet',
                description: 'Combina pigmentos ecosolventes sobre sustrato real. Todo archivo para impresión debe configurarse en CMYK desde el origen.',
              },
            ],
          },
          {
            type: 'diagram',
            kind: 'rgb-vs-cmyk',
            eyebrow: 'DIAGRAMA COMPARATIVO DE GAMUT',
            title: 'Por qué el color impreso cambia frente al monitor',
            labels: {
              eyeLabel: 'Espectro visible humano',
              rgbLabel: 'sRGB (Pantalla / Luz)',
              cmykLabel: 'CMYK (Tinta impresa)',
              caption: 'El monitor sRGB reproduce tonos fosforescentes o muy saturados que las tintas CMYK físicas no alcanzan. Ajusta siempre en CMYK antes de exportar.',
            },
          },
          {
            type: 'callout',
            tone: 'tip',
            icon: 'sparkles',
            title: 'Vectores vs Píxeles (Rasterizado)',
            text: 'Vector (Illustrator / .AI): trazos matemáticos escalables al tamaño de un edificio sin pixelarse; obligatorios para corte láser y cuchilla. Píxel (Photoshop / fotos): formado por cuadros de color que se ven borrosos si estiras una foto pequeña.',
          },
        ],
      },
      {
        id: 'fotografia',
        eyebrow: '📸 SECCIÓN 03',
        title: 'Fotografía, exposición e iluminación',
        intro: 'Ya sea que tomes producto terminado o revises fotos enviadas por un cliente, la luz define la nitidez.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              { icon: 'sparkles', title: 'Sensibilidad ISO', description: 'Usa ISO bajo (100) con buena luz natural. Evita ISO alto en exteriores porque añade grano visible al ampliar.' },
              { icon: 'clock', title: 'Velocidad de obturación', description: 'Rápida (1/1000) congela movimiento sin trepidación; lenta capta más luz pero exige pulso firme o trípode.' },
              { icon: 'camera', title: 'Dirección de iluminación', description: 'Prioriza luz frontal o lateral en 3/4 para resaltar relieve de letras corpóreas sin quemar brillos sobre acrílico.' },
            ],
          },
        ],
      },
      {
        id: 'composicion',
        eyebrow: '📐 SECCIÓN 04',
        title: 'Composición y principios visuales',
        intro: 'Un buen diseño guía la vista en menos de 3 segundos sin saturar el formato.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              { icon: 'target', title: 'Regla de tercios y énfasis', description: 'Divide mentalmente en 3×3 y define UN elemento protagonista claro en lugar de competir con diez textos grandes.' },
              { icon: 'layers', title: 'Balance y contraste', description: 'Compensa pesos visuales y separa texto de fondo mediante alto contraste (claro sobre oscuro o viceversa).' },
              { icon: 'trending', title: 'Lectura y ritmo', description: 'Ordena la lectura en Z o F: marca/gancho arriba, beneficio al centro y dato de contacto limpio abajo.' },
            ],
          },
        ],
      },
      {
        id: 'principios',
        eyebrow: 'Aa SECCIÓN 05',
        title: 'Familias tipográficas y legibilidad',
        intro: 'En rótulos vistos en movimiento desde un vehículo, la tipografía define si el mensaje se lee o se pierde.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 4,
            items: [
              { title: 'Serif (Con remate)', badge: 'CLÁSICO', badgeTone: 'amber', description: 'Formal, tradicional y editorial. Útil en estudios jurídicos o restaurantes clásicos.' },
              { title: 'Sans Serif (Sin remate)', badge: 'ROTULACIÓN TOP', badgeTone: 'green', description: 'Limpia, directa y muy legible a gran distancia. La mejor elección para rótulos y fachadas.' },
              { title: 'Script / Cursiva', badge: 'USAR CON CUIDADO', badgeTone: 'red', description: 'Decorativa o elegante; evita usarla en párrafos largos o teléfonos lejanos.' },
              { title: 'Display', badge: 'SOLO TÍTULOS', badgeTone: 'violet', description: 'Expresiva para titulares cortos; nunca para direcciones ni listados de servicios.' },
            ],
          },
        ],
      },
      {
        id: 'archivos',
        eyebrow: '📁 SECCIÓN 06',
        title: 'Formatos de archivo y su uso exacto',
        intro: 'Elegir la extensión equivocada puede degradar horas de diseño o impedir abrir el archivo en la máquina.',
        points: [],
        blocks: [
          {
            type: 'table',
            headers: ['Formato', 'Propósito', '¿Tiene pérdida?', 'Uso en Visual Corp'],
            rows: [
              { cells: [{ text: '.AI', mono: true }, { text: 'Vector editable de Adobe Illustrator' }, { text: 'Sin pérdida', badgeTone: 'green', badge: 'ok' }, { text: 'Diseño original y corte láser (v8)' }] },
              { cells: [{ text: '.PSD', mono: true }, { text: 'Editable por capas en Photoshop' }, { text: 'Sin pérdida' }, { text: 'Composición fotográfica previa al TIFF' }] },
              { cells: [{ text: '.TIFF', mono: true }, { text: 'Mapa de bits de alta calidad' }, { text: 'Sin pérdida', badgeTone: 'green', badge: 'top' }, { text: '⭐ Lo que enviamos a FlexiPRINT', highlight: true }] },
              { cells: [{ text: '.PNG', mono: true }, { text: 'Imagen sin fondo (canal alfa)' }, { text: 'Sin pérdida' }, { text: 'Trazos limpios para cuchilla (SignMaster)' }] },
              { cells: [{ text: '.JPG', mono: true }, { text: 'Comprimido ligero web/chat' }, { text: 'CON pérdida', badgeTone: 'red', badge: 'warn' }, { text: 'Solo redes/WhatsApp. Evitar como fuente final' }] },
              { cells: [{ text: '.PDF', mono: true }, { text: 'Documento universal' }, { text: 'Variable' }, { text: 'Aprobaciones con cliente y proformas' }] },
              { cells: [{ text: '.SVG', mono: true }, { text: 'Vector web escalable' }, { text: 'Sin pérdida' }, { text: 'Logos e interfaces digitales' }] },
            ],
          },
          {
            type: 'callout',
            tone: 'danger',
            icon: 'alert',
            title: 'Nunca envíes capturas o JPG recomprimidos directo a Galaxy',
            text: 'Cada reenvío de WhatsApp reduce drásticamente los píxeles. Solicita archivos originales o reprocesa al tamaño real en TIFF a la resolución adecuada.',
          },
        ],
      },
      {
        id: 'resolucion',
        eyebrow: '🔍 SECCIÓN 07',
        title: 'Resolución (DPI) y distancia visual',
        intro: 'DPI significa puntos por pulgada. No todo trabajo se arma a 300 DPI porque pesaría gigabytes innecesariamente en gran formato.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              { badge: 'PANTALLA / WEB', badgeTone: 'cyan', title: '72 DPI', subtitle: 'Solo digital', description: 'Suficiente para redes sociales y WhatsApp. Insuficiente para papelería vista en mano.' },
              { badge: 'GRAN FORMATO GALAXY', badgeTone: 'gold', title: '72–150 DPI reales', subtitle: 'Lonas y vallas', description: 'Estándar a tamaño real 1:1 para banners, rótulos y vallas vistos a más de 2 metros.' },
              { badge: 'ALTA NITIDEZ', badgeTone: 'green', title: '300 DPI', subtitle: 'Vista cercana', description: 'Necesario para tarjetas personales, stickers, empaques y etiquetas leídas de cerca.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            icon: 'lightbulb',
            title: 'No estires fotos de 500 px a 3 metros',
            text: 'En Photoshop o Illustrator haz zoom al 100% a tamaño real: así verás exactamente si la fotografía se ve nítida o pixelada antes de imprimir.',
          },
          {
            type: 'tool-links',
            title: 'Simula distancia y legibilidad',
            items: [
              { title: 'Simulador de distancia visual', description: 'Prueba altura de letra según la distancia del espectador.', practiceId: 'distancia', tone: 'amber' },
            ],
          },
        ],
      },
      {
        id: 'materiales',
        eyebrow: '🧵 SECCIÓN 08',
        title: 'Materiales frecuentes de impresión y corte',
        intro: 'Cada sustrato responde distinto al sol, retroiluminación y montaje físico.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              { icon: '🖼️', title: 'Vinil adhesivo', description: 'Se adhiere sobre vidrio, aluminio, paredes lisas o vehículos. Alta saturación con acabado brillante o mate.' },
              { icon: '📐', title: 'Lona / Banner', description: 'Económica, de campaña o mate. Resistente para exteriores, estructuras tensadas y bastidores.' },
              { icon: '💡', title: 'Backlight / Translúcida', description: 'Deja pasar la iluminación LED interna de cajas de luz de forma pareja.' },
              { icon: '🪟', title: 'Vinil microperforado', description: 'Para vitrinas de locales y vidrios posteriores: muestra gráfico afuera y deja ver hacia adentro.' },
              { icon: '✨', title: 'Acrílico', description: 'Planchas rígidas transparentes o de color aptas para corte láser CO₂, letras corpóreas y trofeos.' },
              { icon: '🪵', title: 'MDF / Madera', description: 'Base estructural económica para cuadros, señalética decorativa y piezas láser.' },
            ],
          },
        ],
      },
      {
        id: 'sangria',
        eyebrow: '📏 SECCIÓN 09',
        title: 'Márgenes, sangría (bleed) y zona segura',
        intro: 'Las máquinas y estiletes tienen una tolerancia mecánica natural. La sangría evita filos blancos y la zona segura protege tus textos.',
        points: [],
        blocks: [
          {
            type: 'diagram',
            kind: 'bleed-safe-zone',
            eyebrow: 'ANATOMÍA DE MÁRGENES DE PRODUCCIÓN',
            title: 'Sangría, línea de corte y zona segura',
            labels: {
              bleed: 'SANGRÍA (Bleed) — Extiende el fondo 3–5 mm',
              trim: 'LÍNEA DE CORTE — Medida final del producto',
              safe: 'ZONA SEGURA — Textos y logos adentro',
              mockupTitle: 'TÍTULO PRINCIPAL DEL RÓTULO',
              mockupLogo: 'LOGO AQUÍ',
              bleedHint: '3–5 mm extra fuera del corte',
              safeHint: '5–15 mm margen interno libre',
            },
          },
          {
            type: 'callout',
            tone: 'danger',
            icon: 'alert',
            title: 'Error común: poner teléfonos o logos pegados al borde',
            text: 'En Illustrator configura Archivo → Nuevo → Sangrado de 3 mm; para lonas grandes deja mínimo 10–15 mm libres alrededor de textos críticos.',
          },
        ],
      },
      {
        id: 'glosario',
        eyebrow: '📖 SECCIÓN 10',
        title: 'Glosario rápido del taller',
        intro: 'Conceptos que escucharás todos los días entre asesores, diseñadores e impresores.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 2,
            items: [
              { title: 'Arte final / Ripear', description: 'Arte listo en TIFF guardado en Artes Finales; “ripear” es convertirlo en FlexiPRINT al lenguaje de la impresora.' },
              { title: 'Troquelado / Laminado', description: 'Troquelado corta contornos personalizados en cuchilla o láser; laminado protege el vinil con película mate o brillante.' },
              { title: 'Curvas (Ctrl+Shift+O)', description: 'Convertir fuentes tipográficas a trazos para evitar errores de fuentes faltantes al abrir el archivo en otro PC.' },
              { title: 'Mockup y Pantone', description: 'Mockup es la vista previa sobre fachada real; Pantone fija referencias estándar de color entre clientes y pruebas.' },
            ],
          },
          {
            type: 'tool-links',
            items: [
              { title: 'Explorar catálogo Pantone', description: 'Busca códigos PMS, valores CMYK y copias HEX en un clic.', practiceId: 'pantone', tone: 'violet' },
              { title: 'Practicar en Color Match', description: 'Agudiza tu criterio visual identificando variaciones cromáticas.', practiceId: 'colormatch', tone: 'cyan' },
            ],
          },
        ],
      },
      {
        id: 'checklist-preprensa',
        eyebrow: '✅ SECCIÓN 11',
        title: 'Verificación de 8 pasos antes de exportar',
        intro: 'Una última inspección de 60 segundos ahorra reimpresiones de varios metros de material.',
        points: [],
        blocks: [
          {
            type: 'steps',
            items: [
              { number: 1, title: 'Modo CMYK confirmado', description: 'Archivo → Modo de color CMYK para cualquier trabajo impreso en Galaxy.' },
              { number: 2, title: 'Resolución verificada al tamaño real', description: '300 DPI si va de cerca; 72–150 DPI reales 1:1 en lonas y gran formato.' },
              { number: 3, title: 'Sangría y zona segura libres', description: 'Fondo extendido y textos importantes alejados del filo de corte.' },
              { number: 4, title: 'Textos convertidos a curvas e imágenes incrustadas', description: 'Ctrl+Shift+O y Ventana → Vínculos → Incrustar antes de guardar.' },
              { number: 5, title: 'Revisión ortográfica completa', description: 'Lee teléfonos, fechas, RUC, tildes y nombres propios letra por letra.' },
              { number: 6, title: 'Nomenclatura exacta', description: 'Material + descripción + ancho×alto + asesor + copias.' },
            ],
          },
        ],
      },
    ],
    checklist: [
      'Comprobé modo de color (RGB web / CMYK impresión) y DPI a tamaño real.',
      'Textos en curvas, imágenes incrustadas y zona segura respetada.',
      'Ortografía y medidas confirmadas antes de enviar a producción.',
    ],
  },
  {
    id: 'disenadores',
    areaId: 'diseno-produccion',
    title: 'Guía operativa para diseñadores',
    subtitle: 'Programas de taller, nomenclatura estricta de archivos, preparación láser/cuchilla y exportación TIFF.',
    duration: '12 min',
    badge: 'DISEÑO',
    coverImage: '/manual-aprendizaje/fuente/img/disenador_workspace.png',
    outcome: 'Entregarás archivos con nomenclatura exacta, colores vectoriales precisos para láser y exportaciones TIFF listas sin retrabajos.',
    source: 'Manual interno Visual Corp · Área de Diseño.',
    sections: [
      {
        id: 'programas',
        eyebrow: '💻 SECCIÓN 01',
        title: 'Programas que usamos en diseño',
        intro: 'Cada software cumple un papel específico entre vectorizado de producción, retoque fotográfico y piezas rápidas de redes.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/disenador_workspace.png',
            alt: 'Estación de diseño gráfico de Visual Corp con doble monitor y tableta digitalizadora',
            badge: 'ESTACIÓN DE DISEÑO',
            caption: 'Estación de trabajo estándar: preprensa vectorial en pantalla principal y verificación de arte/mockup en pantalla auxiliar.',
          },
          {
            type: 'cards',
            columns: 4,
            items: [
              { icon: 'pen', badge: 'IMPRESCINDIBLE', badgeTone: 'gold', title: 'Adobe Illustrator', description: 'Diseño vectorial puro. Obligatorio para corte láser, cuchilla de vinil y artes finales limpios.' },
              { icon: 'image', badge: 'IMPRESIÓN TIFF', badgeTone: 'cyan', title: 'Adobe Photoshop', description: 'Retoque fotográfico y empaque final en .TIFF al tamaño real hacia la carpeta Artes Finales.' },
              { icon: 'palette', badge: 'ALTERNATIVA PRO', badgeTone: 'green', title: 'Affinity Designer', description: 'Entorno vectorial profesional compatible para piezas, mockups e identidades rápidas.' },
              { icon: 'sparkles', badge: 'SOLO REDES', badgeTone: 'amber', title: 'Canva', description: 'Plantillas ágiles de redes sociales. No usar como fuente directa para máquinas de corte.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            icon: 'lightbulb',
            title: 'Illustrator es la columna vertebral de producción',
            text: 'Cualquier corte láser o plóter de cuchilla exige vectores exactos generados en Illustrator, nunca imágenes planas de Canva o capturas.',
          },
        ],
      },
      {
        id: 'nomenclatura',
        eyebrow: '📝 SECCIÓN 02',
        title: 'Nomenclatura estricta de archivos',
        intro: 'Todos los archivos siguen un orden exacto para que impresores entiendan material, medida, asesor y copias sin detenerse a preguntar.',
        points: [],
        blocks: [
          {
            type: 'tokens',
            title: 'Anatomía del nombre estándar',
            filename: 'vn foto recuerdo 40x50 jessy (3V)',
            parts: [
              { token: 'vn', label: 'Material', help: 'vn=vinil · ec=econ. · lc=campaña · bl=backlight · tl=traslúcida', tone: 'violet' },
              { token: 'foto recuerdo', label: 'Nombre', help: 'Descripción breve del trabajo o cliente', tone: 'blue' },
              { token: '40x50', label: 'Medidas', help: 'ANCHO × ALTO en cm (siempre en ese orden)', tone: 'green' },
              { token: 'jessy', label: 'Asesor', help: 'Quien tomó la orden comercial', tone: 'amber' },
              { token: '(3V)', label: 'Cantidad', help: 'Número de copias a imprimir', tone: 'red' },
            ],
          },
          {
            type: 'table',
            title: '📌 Más ejemplos de nomenclatura',
            headers: ['Nombre del archivo', 'Interpretación inmediata en impresión'],
            rows: [
              { cells: [{ text: 'ec se alquila 100x100 vicky (10V)', mono: true }, { text: 'Lona económica · “Se Alquila” · 100 × 100 cm · asesora Vicky · 10 copias' }] },
              { cells: [{ text: 'vn logo empresa 30x30 jessy (1V)', mono: true }, { text: 'Vinil adhesivo · logo de empresa · 30 × 30 cm · asesora Jessy · 1 copia' }] },
              { cells: [{ text: 'bl farmacia menu 60x90 pedro (2V)', mono: true }, { text: 'Backlight caja de luz · menú farmacia · 60 × 90 cm · asesor Pedro · 2 copias' }] },
              { cells: [{ text: 'lc candidato 150x100 vicky (5V)', mono: true }, { text: 'Lona de campaña · 150 × 100 cm · asesora Vicky · 5 copias' }] },
            ],
          },
          {
            type: 'callout',
            tone: 'danger',
            icon: 'alert',
            title: 'Medidas: siempre ANCHO × ALTO',
            text: 'Nunca inviertas las medidas. 40x50 significa 40 cm de ancho por 50 cm de alto; invertirlo desperdicia rollo y retrasa toda la cola de impresión.',
          },
        ],
      },
      {
        id: 'laser',
        eyebrow: '🔴 SECCIÓN 03',
        title: 'Preparar archivos para corte láser en Illustrator',
        intro: 'RDWorks interpreta cada acción mecánica según tres colores hexadecimales exactos enviados desde Illustrator.',
        points: [
          'Texto convertido a curvas (Ctrl+Shift+O): la PC de corte no tiene instaladas todas las tipografías.',
          'Formas superpuestas unidas (Pathfinder → Unir) y archivo guardado en formato compatible Illustrator versión 8 hacia la carpeta /Láser.',
        ],
        blocks: [
          {
            type: 'color-layers',
            layers: [
              {
                name: 'NEGRO — Trazo negro, sin relleno',
                swatch: '#000000',
                subtitle: 'Stroke: #000000 · Fill: none',
                description: 'Corte total que atraviesa todo el espesor del acrílico o MDF.',
                tag: 'CORTE TOTAL',
                tone: 'neutral',
              },
              {
                name: 'AZUL — Trazo azul, sin relleno',
                swatch: '#0000ff',
                subtitle: 'Stroke: #0000FF · Fill: none',
                description: 'Delineado superficial: marca líneas de doblez o guías sin cortar de lado a lado.',
                tag: 'DELINEADO',
                tone: 'blue',
              },
              {
                name: 'ROJO — Relleno rojo (sin trazo necesario)',
                swatch: '#ff0000',
                subtitle: 'Fill: #FF0000 · Modo “Escaneo” en RDWorks',
                description: 'Grabado por barrido superficial de textos, escudos o texturas.',
                tag: 'GRABADO',
                tone: 'red',
              },
            ],
          },
          {
            type: 'diagram',
            kind: 'laser-ai-file',
            eyebrow: '🎨 VISUAL — ARCHIVO CORRECTO PARA LÁSER EN ILLUSTRATOR',
            labels: {
              fileLabel: 'Archivo .ai (Versión 8)',
              redBadge: 'Relleno rojo',
              redEq: '= Grabado',
              blackTitle: 'Trazo negro',
              blackDesc: 'Corte total del material',
              blueTitle: 'Trazo azul',
              blueDesc: 'Delineado superficial',
              redTitle: 'Relleno rojo',
              redDesc: 'Grabado por barrido',
            },
            highlights: [
              '✓ Texto en curva (Ctrl+Shift+O)',
              '✓ Formas unidas (Pathfinder)',
              '✓ Guardar como .ai versión 8',
            ],
          },
        ],
      },
      {
        id: 'cuchilla',
        eyebrow: '✂️ SECCIÓN 04',
        title: 'Preparar para corte con cuchilla (vinil / SignMaster)',
        intro: 'El plóter de cuchilla trabaja siluetas limpias sin fondo para stickers, letras o rotulación adhesiva.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/vinyl_cutter.png',
            alt: 'Plóter de corte con cuchilla recortando vinil adhesivo con sistema óptico ARMS',
            badge: 'PLÓTER CUCHILLA',
            caption: 'Sistema óptico ARMS leyendo marcas de registro sobre vinil impreso antes del troquelado.',
          },
          {
            type: 'steps',
            items: [
              { number: 1, title: 'Diseño finalizado en Illustrator', description: 'Contornos limpios, sin líneas dobles ocultas.' },
              { number: 2, title: 'Eliminar el fondo por completo', description: 'Verificar que no existan cajas blancas bloqueando la transparencia.' },
              { number: 3, title: 'Exportar como PNG transparente o vector limpio', description: 'Alta resolución para detectar perfectamente el contorno de corte.' },
              { number: 4, title: 'Importar en SignMaster y generar marcas ARMS', description: 'Alinear registro antes de mandar la orden al cabezal de corte.' },
            ],
          },
        ],
      },
      {
        id: 'exportacion',
        eyebrow: '📤 SECCIÓN 05',
        title: 'Exportar a la carpeta Artes Finales (.TIFF)',
        intro: 'Todo arte que entra a impresión de gran formato debe viajar sin pérdida hacia FlexiPRINT.',
        points: [],
        blocks: [
          {
            type: 'diagram',
            kind: 'export-flow',
            eyebrow: 'FLUJO DE EXPORTACIÓN SIN PÉRDIDA',
            labels: {},
            groups: [
              { title: '1. Illustrator', items: ['Diseño CMYK', 'Ctrl+A → Ctrl+C'] },
              { title: '2. Photoshop', items: ['Pegar al 1:1', 'Ajustar DPI reales'] },
              { title: '3. Acoplar', items: ['Acoplar imagen', 'Verificar perfil'] },
              { title: '4. Guardar TIFF', items: ['Nomenclatura exacta', 'Sin compresión'] },
              { title: '5. Red local', items: ['Carpeta Artes', 'Finales'] },
            ],
          },
          {
            type: 'callout',
            tone: 'success',
            icon: 'check',
            title: '¿Por qué TIFF y no JPG?',
            text: 'El .TIFF conserva detalle íntegro sin artefactos de compresión y es el estándar directo de entrada en FlexiPRINT para nuestras impresoras Galaxy.',
          },
        ],
      },
      {
        id: 'practicas',
        eyebrow: '⭐ SECCIÓN 06',
        title: 'Buenas prácticas diarias del diseñador',
        intro: 'Hábitos que evitan paros de máquinas y protegen la fidelidad del color.',
        points: [
          'Escucha primero al asesor para saber si el proyecto irá a sol directo, interior o caja de luz antes de definir tonos.',
          'Trabaja siempre en modo CMYK y conserva tu .ai original con capas editables por si el cliente solicita ajustes futuros.',
          'Verifica ortografía, teléfonos, medidas, sangría y comunícate realista con el equipo cuando un arte complejo tome más tiempo.',
        ],
      },
      {
        id: 'horarios',
        eyebrow: '🕐 SECCIÓN 07',
        title: 'Horarios de trabajo',
        intro: 'Horarios de referencia del área (consulta novedades vigentes en Equipo → Horarios dentro de la Suite).',
        points: [],
        blocks: [STANDARD_SCHEDULES],
      },
    ],
    checklist: [
      'Apliqué nomenclatura exacta: material + descripción + ancho×alto + asesor + (copias).',
      'Si va a láser: usé #000000 / #0000FF / #FF0000, texto en curvas y .AI v8.',
      'Si va a impresión Galaxy: exporté en CMYK como .TIFF a Artes Finales.',
    ],
  },
  {
    id: 'impresores',
    areaId: 'diseno-produccion',
    title: 'Guía operativa para impresores Galaxy',
    subtitle: 'Especificaciones Galaxy 3.2m y 2.5m, cabezal i3200-E1, flujo FlexiPRINT → Hosonsoft, pasadas y mantenimiento.',
    duration: '14 min',
    badge: 'IMPRESIÓN',
    coverImage: '/manual-aprendizaje/fuente/img/galaxy_printer.png',
    outcome: 'Operarás ambas máquinas Galaxy con perfiles correctos, cuidarás el cabezal i3200-E1 a diario y entregarás rollos secos e identificados.',
    source: 'Manual interno Visual Corp · Operación de impresión de gran formato.',
    sections: [
      {
        id: 'habilidades',
        eyebrow: '💡 SECCIÓN 01',
        title: 'Habilidades esenciales del impresor',
        intro: 'El impresor controla la calidad final del color, el aprovechamiento del rollo y la salud mecánica del equipo.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              { icon: 'monitor', badge: 'AVANZADO', badgeTone: 'gold', title: 'FlexiPRINT (RIP)', description: 'Rasterizar archivos, escalar al 100%, asignar perfil CMYK y configurar pasadas.' },
              { icon: 'printer', badge: 'AVANZADO', badgeTone: 'gold', title: 'Hosonsoft', description: 'Controlar máquina, márgenes, copias, velocidad y monitorear errores en vivo.' },
              { icon: 'wrench', badge: 'AVANZADO', badgeTone: 'cyan', title: 'Mantenimiento de cabezal', description: 'Ink injection, Clean Strong, nozzle check y limpieza perimetral ecosolvente.' },
              { icon: 'palette', badge: 'INTERMEDIO', badgeTone: 'cyan', title: 'Gestión de color', description: 'Detectar bandeo, cabezal tapado o perfil equivocado antes de imprimir todo el rollo.' },
              { icon: 'layers', badge: 'BÁSICO', badgeTone: 'green', title: 'Carga de material', description: 'Alinear rollos pesados sin arrugas ni roce con los cabezales.' },
              { icon: 'scissors', badge: 'BÁSICO', badgeTone: 'green', title: 'Corte y rotulado', description: 'Cortar recto con estilete y regla metálica, dejar secar y etiquetar al cliente.' },
            ],
          },
        ],
      },
      {
        id: 'maquinas',
        eyebrow: '⚙️ SECCIÓN 02',
        title: 'Nuestras máquinas Galaxy y cabezales Epson i3200-E1',
        intro: 'Visual Corp opera con dos plotters de gran formato Galaxy alimentados con tintas ecosolventes CMYK.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/galaxy_printer.png',
            alt: 'Impresora gran formato Galaxy con cabezales piezoeléctricos en operación',
            badge: 'GRAN FORMATO GALAXY',
            caption: 'Plóter ecosolvente Galaxy: siempre confirmar altura del carro y sujeción antes de iniciar tiraje.',
          },
          {
            type: 'specs-grid',
            items: [
              {
                icon: 'printer',
                title: 'Galaxy 3.2m',
                badge: 'PRINCIPAL',
                badgeTone: 'gold',
                specs: [
                  { label: 'Ancho máximo', value: 'Hasta 3.2 metros' },
                  { label: 'Cabezales instalados', value: '2 (posiciones 3 y 4)' },
                  { label: 'Capacidad total', value: '4 cabezales' },
                  { label: 'Modelo de cabezal', value: 'Epson i3200-E1' },
                  { label: 'Tinta y software', value: 'Ecosolvente CMYK · FlexiPRINT + Hosonsoft' },
                ],
              },
              {
                icon: 'printer',
                title: 'Galaxy 2.5m',
                badge: 'SECUNDARIA',
                badgeTone: 'cyan',
                specs: [
                  { label: 'Ancho máximo', value: 'Hasta 2.5 metros' },
                  { label: 'Cabezales instalados', value: '1 cabezal' },
                  { label: 'Capacidad total', value: '4 cabezales' },
                  { label: 'Modelo de cabezal', value: 'Epson i3200-E1' },
                  { label: 'Tinta y software', value: 'Ecosolvente CMYK · FlexiPRINT + Hosonsoft' },
                ],
              },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            icon: 'lightbulb',
            title: '¿Qué es el cabezal Epson i3200-E1?',
            text: 'Cabezal piezoeléctrico de hasta 720×1440 dpi con 3200 boquillas (800 por canal C, M, Y, K). Es el componente más costoso y sensible de la máquina: un roce o tinta seca prolongada lo arruina.',
          },
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/tintas_ecosolventes.png',
            alt: 'Botellas de tintas ecosolventes Cian, Magenta, Amarillo y Negro',
            badge: 'SISTEMA CMYK',
            caption: 'Tintas ecosolventes resistentes a intemperie y radiación UV. Compatibles únicamente con sustratos ecosolventes.',
          },
        ],
      },
      {
        id: 'software',
        eyebrow: '💻 SECCIÓN 03',
        title: 'Flujo de software: FlexiPRINT → Hosonsoft',
        intro: 'Todo archivo debe procesarse primero en el RIP antes de llegar al controlador directo de máquina.',
        points: [],
        blocks: [
          {
            type: 'compare',
            items: [
              {
                icon: 'monitor',
                title: 'FlexiPRINT',
                subtitle: 'Paso 1 — Software de RIP',
                tone: 'cyan',
                points: [
                  { text: 'Importa el archivo (.TIFF, .PDF) desde Artes Finales.' },
                  { text: 'Configura medidas reales, perfil de color según sustrato y número de pasadas.' },
                  { text: 'Ripea el trabajo para convertir píxeles/trazos en datos legibles de inyección.' },
                ],
              },
              {
                icon: 'printer',
                title: 'Hosonsoft',
                subtitle: 'Paso 2 — Control directo de máquina',
                tone: 'amber',
                points: [
                  { text: 'Selecciona el archivo ya procesado en cola desde FlexiPRINT.' },
                  { text: 'Para Lona Traslúcida de color activa la opción específica:', highlight: 'color 2' },
                  { text: 'Define copias, márgenes, dirección y velocidad; nunca cierres Hosonsoft mientras imprime.' },
                ],
              },
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            icon: 'alert',
            title: 'Flujo obligatorio: siempre FlexiPRINT PRIMERO, luego Hosonsoft',
            text: 'Nunca intentes enviar un archivo crudo directo a Hosonsoft. Si detectas medida invertida o color raro, corrígelo en FlexiPRINT antes de gastar material.',
          },
        ],
      },
      {
        id: 'archivos',
        eyebrow: '📁 SECCIÓN 04',
        title: 'Archivos, red interna y formatos aceptados',
        intro: 'Accede directamente a los artes finales en red local sin copiar archivos viejos ni perder versiones.',
        points: [],
        blocks: [
          {
            type: 'flow',
            steps: [
              { icon: 'palette', title: 'Diseñador', subtitle: 'Prepara archivo CMYK' },
              { icon: 'folder', title: 'Carpeta compartida', subtitle: 'Artes Finales (red)' },
              { icon: 'network', title: 'Red local', subtitle: 'Sin USB ni duplicados' },
              { icon: 'monitor', title: 'PC Impresora', subtitle: 'FlexiPRINT → Hosonsoft' },
              { icon: 'printer', title: 'Galaxy', subtitle: 'Impresión final' },
            ],
          },
          {
            type: 'table',
            headers: ['Formato', 'Calidad', 'Uso operativo en cola de impresión'],
            rows: [
              { cells: [{ text: '.TIFF', mono: true }, { text: '⭐ Máxima', badge: 'preferido', badgeTone: 'green' }, { text: 'Formato oficial sin pérdida para lonas y viniles.', highlight: true }] },
              { cells: [{ text: '.PDF', mono: true }, { text: 'Alta', badge: 'válido', badgeTone: 'cyan' }, { text: 'Aceptado si proviene de Illustrator/Photoshop sin recompresión.' }] },
              { cells: [{ text: '.JPG', mono: true }, { text: 'Media', badge: 'evitar', badgeTone: 'red' }, { text: 'Solo excepción cuando no exista fuente mejor (máxima calidad 100%).' }] },
            ],
          },
        ],
      },
      {
        id: 'materiales',
        eyebrow: '🧵 SECCIÓN 05',
        title: 'Materiales y tabla de pasadas (passes)',
        intro: 'Más pasadas depositan mayor cobertura y nitidez a menor velocidad; menos pasadas aceleran lonas porosas.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/materiales.png',
            alt: 'Muestrario de lonas, viniles y sustratos de impresión gran formato',
            badge: 'SUSTRATOS GALAXY',
          },
          {
            type: 'callout',
            tone: 'danger',
            icon: 'shield',
            title: 'PROHIBIDO: No pasar telas de sublimación en las Galaxy',
            text: 'Las tintas ecosolventes y de sublimación son incompatibles. Imprimir telas de sublimación en estas máquinas contamina boquillas y daña los cabezales.',
          },
          {
            type: 'table',
            title: 'Guía estándar de pasadas por material',
            headers: ['Material', 'Pasadas', 'Descripción / Aplicación'],
            rows: [
              { group: '⚡ 4 Pasadas — Lonas y materiales porosos', groupTone: 'green', cells: [] },
              { cells: [{ text: '🟢 Lona Económica' }, { text: '4 📌', badge: '4', badgeTone: 'green' }, { text: 'Banners estándar de costo competitivo y gigantografías.' }] },
              { cells: [{ text: '🟢 Lona de Campaña' }, { text: '4 📌', badge: '4', badgeTone: 'green' }, { text: 'Mayor cuerpo y resistencia para exteriores prolongados.' }] },
              { cells: [{ text: '🟢 Lona Op Mate' }, { text: '4 📌', badge: '4', badgeTone: 'green' }, { text: 'Acabado sin reflejo, ideal bajo reflectores o sol directo.' }] },
              { cells: [{ text: '🔵 Microperforado' }, { text: '4 📌', badge: '4', badgeTone: 'cyan' }, { text: 'Para vitrinas y vidrios de locales comerciales.' }] },
              { cells: [{ text: '🟤 Tela Sintética' }, { text: '4 📌', badge: '4', badgeTone: 'amber' }, { text: 'Banderas, pendones textiles con recubrimiento compatible.' }] },
              { cells: [{ text: '💡 Backlight' }, { text: '4 📌', badge: '4', badgeTone: 'cyan' }, { text: 'Sustrato para cajas de luz retroiluminadas.' }] },
              { group: '🔷 6 Pasadas — Viniles y acabados lisos de alta saturación', groupTone: 'cyan', cells: [] },
              { cells: [{ text: '✨ Vinil Brillante' }, { text: '6 🔷', badge: '6', badgeTone: 'cyan' }, { text: 'Alta saturación efecto espejo para adhesivos, rótulos y decoración.' }] },
              { cells: [{ text: '🔲 Vinil Mate' }, { text: '6 🔷', badge: '6', badgeTone: 'cyan' }, { text: 'Cero reflejo para decoración interior y rotulación vehicular.' }] },
              { cells: [{ text: '💎 Lona Traslúcida' }, { text: '6 🔷', badge: '6', badgeTone: 'violet' }, { text: 'Semitransparente retroiluminada (activar “color 2” en Hosonsoft).' }] },
            ],
          },
        ],
      },
      {
        id: 'mantenimiento',
        eyebrow: '🔧 SECCIÓN 06',
        title: 'Mantenimiento preventivo del cabezal i3200-E1',
        intro: 'Cada minuto invertido en el mantenimiento diario previene líneas faltantes y reemplazos costosos de cabezal.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/mantenimiento_cabezal.png',
            alt: 'Limpieza técnica preventiva del cabezal de impresión e inspectado de boquillas',
            badge: 'CUIDADO DIARIO',
          },
          {
            type: 'callout',
            tone: 'danger',
            icon: 'alert',
            title: 'Cabezal obstruido = líneas blancas + desperdicio de material',
            text: 'Nunca lances un trabajo largo sin revisar el Nozzle Check previo. Verifica que todos los canales C, M, Y y K impriman continuos.',
          },
          {
            type: 'cards',
            columns: 2,
            items: [
              { badge: 'AL ENCENDER', badgeTone: 'amber', title: 'Ink Injection (15–20 s)', description: 'Purga breve para cargar tinta fresca y eliminar burbujas de aire en los dampers.' },
              { badge: 'AL ENCENDER', badgeTone: 'cyan', title: 'Clean Strong', description: 'Ciclo de limpieza después del injection para destapar boquillas con tinta reseca.' },
              { badge: 'ANTES DE IMPRIMIR', badgeTone: 'green', title: 'Nozzle Check obligatorio', description: 'Imprime prueba de boquillas; si falta algún trazo, repite clean o realiza limpieza perimetral.' },
              { badge: 'PERIÓDICO', badgeTone: 'violet', title: 'Lubricación de rieles y estación de tapado', description: 'Mantén rieles con grasa limpia y captop libre de tinta seca acumulada.' },
            ],
          },
        ],
      },
      {
        id: 'proceso',
        eyebrow: '✅ SECCIÓN 07',
        title: 'Proceso post-impresión, corte e identificación',
        intro: 'Cuidar el rollo al salir de la máquina evita rayones, manchas por enrollado húmedo y trabajos extraviados.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/corte_lona.png',
            alt: 'Mesa de corte de lona impresa usando regla metálica y estilete',
            badge: 'POST-IMPRESIÓN',
          },
          {
            type: 'steps',
            items: [
              { number: 1, title: 'Espera el secado completo de tintas ecosolventes', description: 'No toques ni enrolles el arte fresco inmediatamente al finalizar la pasada.' },
              { number: 2, title: 'Corta recto con regla metálica y cuchilla afilada', description: 'Cambia segmentos de cuchilla en cuanto pierdan filo para no desgarrar el vinil o lona.' },
              { number: 3, title: 'Enrolla uniforme sin apretar en exceso', description: 'Cara impresa protegida y bordes alineados para evitar pliegues.' },
              { number: 4, title: 'Coloca etiqueta visible con cliente y trabajo', description: 'Todo rollo terminado debe llevar nombre del cliente, medidas y asesor responsable.' },
              { number: 5, title: 'Ubica en el área de listas y avisa', description: 'Almacena en posición segura sin deformar y notifica a taller/asesoría.' },
            ],
          },
        ],
      },
      {
        id: 'horarios',
        eyebrow: '🕐 SECCIÓN 08',
        title: 'Cultura y horarios del área de impresión',
        intro: 'La precisión diaria de impresión sostiene todo el ritmo de taller y entregas.',
        points: [],
        blocks: [STANDARD_SCHEDULES],
      },
    ],
    checklist: [
      'Realicé Ink Injection, Clean Strong y comprobé el Nozzle Check sin cortes.',
      'Ripeé primero en FlexiPRINT con medidas exactas y lo envié por Hosonsoft.',
      'Dejé secar el material antes de enrollar, cortar e identificar al cliente.',
    ],
  },
  {
    id: 'laser',
    areaId: 'diseno-produccion',
    title: 'Guía de corte láser Galaxy CO₂ 60W',
    subtitle: 'Especificaciones 60W, materiales prohibidos, RDWorks, capas RGB, calibración focal 7 mm y parámetros base.',
    duration: '14 min',
    badge: 'LÁSER 60W',
    coverImage: '/manual-aprendizaje/fuente/img/laser_maquina.png',
    outcome: 'Configurarás RDWorks con seguridad, calibrarás exactamente a 7 mm el foco, evitarás materiales tóxicos y organizarás los archivos reutilizables.',
    source: 'Manual interno Visual Corp · Operación láser CO₂ 60W. Todos los parámetros son bases iniciales que exigen prueba previa.',
    sections: [
      {
        id: 'maquina',
        eyebrow: '⚡ SECCIÓN 01',
        title: 'La máquina Galaxy CO₂ 60W y materiales permitidos',
        intro: 'El haz láser CO₂ es invisible al ojo humano y genera calor extremo al instante. Nunca operes con tapa abierta ni sin extracción activa.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/laser_maquina.png',
            alt: 'Máquina de corte y grabado láser Galaxy CO₂ 60W',
            badge: 'GALAXY CO₂ 60W',
          },
          {
            type: 'compare',
            items: [
              {
                icon: 'zap',
                title: 'Especificaciones clave',
                tone: 'amber',
                points: [
                  { text: 'Potencia del tubo:', highlight: '60W CO₂' },
                  { text: 'Distancia focal boquilla–material:', highlight: '7 mm exactos' },
                  { text: 'Controlador / Software:', highlight: 'Ruida · RDWorks' },
                  { text: 'Enfriamiento:', highlight: 'Chiller de agua destilada' },
                  { text: 'Extracción:', highlight: 'Blower encendido siempre' },
                ],
              },
              {
                icon: 'shield',
                title: '✅ Permitidos vs 🚫 Prohibidos',
                tone: 'danger',
                points: [
                  { text: '✅ Acrílico, MDF, madera, cuero, corcho, papel y cartón.' },
                  { text: '🚫 Metal desnudo: rebota el haz y daña la óptica interna.' },
                  { text: '🚫 PVC y vinil clorinado: liberan gas cloro tóxico y corrosivo.', highlight: 'PROHIBIDO' },
                ],
              },
            ],
          },
          {
            type: 'callout',
            tone: 'danger',
            icon: 'shield',
            title: 'Seguridad crítica: rayo invisible y extractor obligatorio',
            text: 'Mantén cerrada la tapa protectora durante cada pasada, verifica que el chiller y el blower estén encendidos antes de disparar y nunca dejes la máquina cortando sin supervisión.',
          },
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/laser_acrilico.png',
            alt: 'Piezas de acrílico dorado y MDF grabadas y cortadas en máquina láser',
            badge: 'RESULTADO EN ACRÍLICO Y MDF',
          },
        ],
      },
      {
        id: 'rdworks',
        eyebrow: '💻 SECCIÓN 02',
        title: 'Software RDWorks e interfaz Ruida',
        intro: 'RDWorks importa tus vectores y traduce cada color a velocidad, potencia mínima y potencia máxima.',
        points: [
          'Formatos vectoriales aceptados: .AI (Illustrator versión 8), .DXF, .PLT y SVG; guarda trabajos repetitivos como .RD para reabrir con parámetros listos.',
          'Botón Download envía el trabajo directamente a la memoria interna de la máquina para correrlo desde el panel físico.',
        ],
        blocks: [
          {
            type: 'cards',
            columns: 2,
            items: [
              { icon: 'layers', title: 'Canvas central y Barra de colores', description: 'Visualiza la ubicación sobre la cama y asigna velocidades/potencias desde la paleta inferior.' },
              { icon: 'wrench', title: 'Panel derecho “Work” y Download', description: 'Configura modos Cut/Scan, potencia Min/Max y transfiere directo a memoria de corte.' },
            ],
          },
        ],
      },
      {
        id: 'colores',
        eyebrow: '🎨 SECCIÓN 03',
        title: 'Sistema oficial de colores en RDWorks',
        intro: 'Cada trazo o relleno del diseño debe corresponder exactamente a uno de los 3 colores estándar.',
        points: [],
        blocks: [
          {
            type: 'color-layers',
            layers: [
              { name: 'NEGRO (#000000) — Trazo sin relleno', swatch: '#000000', subtitle: 'Modo Cut · Potencia alta / Velocidad baja', description: 'Corte total que separa por completo el acrílico o MDF.', tag: 'CORTE TOTAL', tone: 'neutral' },
              { name: 'AZUL (#0000FF) — Trazo sin relleno', swatch: '#0000ff', subtitle: 'Modo Cut · Velocidad alta (900 mm/s)', description: 'Delineado superficial suave para líneas guía o dobleces.', tag: 'DELINEADO', tone: 'blue' },
              { name: 'ROJO (#FF0000) — Relleno sólido', swatch: '#ff0000', subtitle: 'Modo Scan (Escaneo) · Gap 0.06 mm', description: 'Grabado por barrido horizontal sobre superficies y textos.', tag: 'GRABADO', tone: 'red' },
            ],
          },
        ],
      },
      {
        id: 'foco',
        eyebrow: '🎯 SECCIÓN 04',
        title: 'Calibración del foco — 7 mm exactos',
        intro: 'Si la distancia focal falla, el rayo pierde densidad energética, quema bordes o deja cortes incompletos.',
        points: [],
        blocks: [
          {
            type: 'diagram',
            kind: 'laser-focus-7mm',
            labels: {
              kicker: 'DISTANCIA FOCAL CORRECTA',
              headline: '7 mm exactos',
              measureLabel: '7 mm',
              surfaceLabel: 'Superficie del material',
              summary: 'Entre la punta de la boquilla metálica y la cara superior del material deben existir exactamente 7 milímetros usando la galga acrílica de calibración.',
            },
            highlights: [
              'Usa siempre la galga calibradora de 7 mm al cargar una lámina.',
              'Ajusta la altura de la mesa hasta que la pieza guía entre justa sin rozar.',
              'Recalibra el foco CADA VEZ que cambies de material o espesor (ej. 2 mm → 3 mm).',
              'Foco muy lejano produce corte ancho sin fuerza; muy cercano arriesga chocar la boquilla.',
            ],
          },
        ],
      },
      {
        id: 'materiales',
        eyebrow: '⚙️ SECCIÓN 05',
        title: 'Tabla de materiales y parámetros base',
        intro: 'Estos valores son referencias de arranque. Realiza siempre una pequeña prueba en retazo según humedad y limpieza de espejos.',
        points: [],
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            icon: 'alert',
            title: 'Límite de protección del tubo: MÁXIMO 80% de potencia',
            text: 'Nunca subas la potencia por encima del 80% continuo; sobreexigir el tubo CO₂ reduce drásticamente su vida útil. Si falta penetración, reduce velocidad en mm/s.',
          },
          {
            type: 'table',
            headers: ['Tipo de trabajo', 'Velocidad (mm/s)', 'Potencia Mín.', 'Potencia Máx.', 'Notas de operación'],
            rows: [
              { group: '🟡 ACRÍLICO DORADO — 2 MM DE ESPESOR', groupTone: 'gold', cells: [] },
              { cells: [{ text: '🔴 Escaneo / Grabado', highlight: true }, { text: '750 mm/s', mono: true }, { text: '12%', mono: true }, { text: '14%', mono: true }, { text: 'Gap 0.06 mm horizontal', badge: 'scan', badgeTone: 'cyan' }] },
              { cells: [{ text: '🔵 Delineado', highlight: true }, { text: '900 mm/s', mono: true }, { text: '12%', mono: true }, { text: '14%', mono: true }, { text: 'Marca superficial suave' }] },
              { cells: [{ text: '⚫ Corte total', highlight: true }, { text: '25 mm/s', mono: true }, { text: '60%', mono: true }, { text: '70%', mono: true }, { text: 'Corte limpio y frío' }] },
              { group: '🪵 MDF — 3 MM DE ESPESOR', groupTone: 'amber', cells: [] },
              { cells: [{ text: '🔴 Escaneo / Grabado', highlight: true }, { text: '750 mm/s', mono: true }, { text: '12%', mono: true }, { text: '14%', mono: true }, { text: 'Gap 0.06 mm horizontal', badge: 'scan', badgeTone: 'cyan' }] },
              { cells: [{ text: '🔵 Delineado', highlight: true }, { text: '900 mm/s', mono: true }, { text: '12%', mono: true }, { text: '14%', mono: true }, { text: 'Marca para doblez o guía' }] },
              { cells: [{ text: '⚫ Corte total', highlight: true }, { text: '21 mm/s', mono: true }, { text: '70%', mono: true }, { text: '80%', mono: true }, { text: '⚠️ Tope máximo 80%', badge: 'límite', badgeTone: 'red' }] },
              { group: '📋 OTROS MATERIALES (PREVIA PRUEBA)', groupTone: 'neutral', cells: [] },
              { cells: [{ text: 'Papel / Cartón / Cuero' }, { text: 'Validar en retazo', mono: true }, { text: '—' }, { text: '—' }, { text: 'Confirmar prueba con el operador responsable' }] },
            ],
          },
        ],
      },
      {
        id: 'mantenimiento',
        eyebrow: '🔧 SECCIÓN 06',
        title: 'Mantenimiento óptico y enfriamiento',
        intro: 'Un poco de polvo o vapor graso en el lente absorbe energía del haz y puede trizar el cristal.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/laser_limpieza.png',
            alt: 'Limpieza preventiva del lente óptico de la boquilla láser',
            badge: 'ÓPTICA DELICADA',
          },
          {
            type: 'cards',
            columns: 2,
            items: [
              { badge: 'DIARIO AL INICIAR', badgeTone: 'amber', title: 'Lente de enfoque', description: 'Limpia suavemente en movimiento circular con hisopo limpio y alcohol isopropílico al 90%+ sin presionar ni rayar.' },
              { badge: 'SEMANAL', badgeTone: 'cyan', title: '3 espejos de trayectoria', description: 'Limpia los 3 espejos guía con alcohol isopropílico; reporta de inmediato si ves marcas oscuras o picaduras.' },
              { badge: 'MENSUAL', badgeTone: 'violet', title: 'Limpieza de tubo y blower', description: 'Retira polvillo alrededor del tubo CO₂ y limpia las aspas del extractor blower de residuos resinosos.' },
              { badge: 'CADA 2 MESES', badgeTone: 'green', title: 'Cambio de agua del chiller', description: 'Renueva el agua usando únicamente agua destilada pura — nunca agua común de grifo.' },
            ],
          },
        ],
      },
      {
        id: 'archivos',
        eyebrow: '📁 SECCIÓN 07',
        title: 'Archivos, flujo y reutilización por categorías',
        intro: 'Clasificar bien los modelos repetibles en PC_Laser ahorra horas de trazado en futuros pedidos.',
        points: [],
        blocks: [
          {
            type: 'flow',
            steps: [
              { icon: 'palette', title: 'Diseñador', subtitle: 'Crea .ai v8' },
              { icon: 'folder', title: 'Carpeta /Láser', subtitle: 'Entrega en red' },
              { icon: 'clock', title: 'PC Láser (Hoy)', subtitle: 'Trabajos diarios' },
              { icon: 'zap', title: 'Máquina Láser', subtitle: 'RDWorks → Corte' },
            ],
          },
          {
            type: 'compare',
            items: [
              {
                icon: 'shield',
                title: '🚫 NO guardar en categorías',
                tone: 'danger',
                description: 'Diseños irrepetibles con nombres propios, fechas exactas o eventos únicos. Ej: “Trofeo para Juan Pérez, bodas de plata 2026”.',
              },
              {
                icon: 'folder',
                title: '✅ SÍ guardar en categorías',
                tone: 'success',
                description: 'Modelos reutilizables: cajas, lámparas, portarretratos, letras base o soportes de celular en categorias/cajas/caja_lampara.rld.',
              },
            ],
          },
          {
            type: 'tree',
            title: 'Ejemplo oficial de estructura de carpetas',
            lines: [
              { text: '📁 PC_Laser/', tone: 'root' },
              { text: '├── 📅 2026-03-08/ (fecha de hoy - trabajos del día)', tone: 'highlight' },
              { text: '│   ├── trofeo_juan_perez.rld', tone: 'file' },
              { text: '│   └── caja_lampara_v2.rld', tone: 'file' },
              { text: '└── 📂 categorias/', tone: 'folder' },
              { text: '    ├── 📂 cajas/', tone: 'folder' },
              { text: '    │   ├── caja_lampara.rld', tone: 'file' },
              { text: '    │   └── caja_regalo_pequena.rld', tone: 'file' },
              { text: '    ├── 📂 letras/', tone: 'folder' },
              { text: '    ├── 📂 porta_retratos/', tone: 'folder' },
              { text: '    ├── 📂 decoracion/', tone: 'folder' },
              { text: '    └── 📂 recuerdos_genericos/', tone: 'folder' },
            ],
          },
        ],
      },
      {
        id: 'horarios',
        eyebrow: '🕐 SECCIÓN 08',
        title: 'Horarios y precisión operativa',
        intro: 'Cada milímetro calibrado y cada corte limpio elevan el estándar de acabados de Visual Corp.',
        points: [],
        blocks: [STANDARD_SCHEDULES],
      },
    ],
    checklist: [
      'Confirmé material apto para láser (cero PVC ni metales desnudos).',
      'Encendí chiller de agua destilada y blower extractor.',
      'Calibré distancia focal exacta a 7 mm y mantuve potencia ≤ 80%.',
    ],
  },
  {
    id: 'taller',
    areaId: 'diseno-produccion',
    title: 'Guía de taller, fabricación e instalaciones',
    subtitle: 'Productos fabricados, kit de herramientas, protocolo antes/durante instalación, trato en sitio y acabados.',
    duration: '14 min',
    badge: 'TALLER Y MONTAJE',
    coverImage: '/manual-aprendizaje/fuente/img/instalacion_equipo.png',
    outcome: 'Prepararás herramientas completas antes de salir, instalarás con nivelación segura, cuidarás el trato frente al cliente y entregarás acabados sin fallas.',
    source: 'Manual interno Visual Corp · Taller, ensamblaje e instalaciones.',
    sections: [
      {
        id: 'rol',
        eyebrow: '🔧 SECCIÓN 01',
        title: 'Tu rol transformando diseños en piezas reales',
        intro: 'El personal de taller convierte impresiones, acrílicos y estructuras en proyectos reales instalados en el negocio del cliente.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/instalacion_equipo.png',
            alt: 'Equipo técnico de Visual Corp instalando letras corpóreas en fachada comercial',
            badge: 'INSTALACIÓN EN CAMPO',
          },
          {
            type: 'cards',
            columns: 4,
            items: [
              { icon: '🏭', title: 'Ensamblaje', description: 'Armar estructuras, cajas de luz y letras en taller con prueba previa.' },
              { icon: '🔧', title: 'Instalación', description: 'Montaje preciso en fachada, vidrio, pared o vehículo con nivelación firme.' },
              { icon: '✨', title: 'Acabados', description: 'Limpieza de bordes, siliconado invisible y cero burbujas ni cables sueltos.' },
              { icon: '🤝', title: 'Cara de la empresa', description: 'En campo el cliente nos evalúa directamente en trato, orden y puntualidad.' },
            ],
          },
        ],
      },
      {
        id: 'productos',
        eyebrow: '🏆 SECCIÓN 02',
        title: 'Productos principales que fabricamos e instalamos',
        intro: 'Dominar cada línea de producto garantiza elegir el anclaje, adhesivo y prueba eléctrica correcta.',
        points: [],
        blocks: [
          {
            type: 'media',
            src: '/manual-aprendizaje/fuente/img/letras_corporeas.png',
            alt: 'Letras corpóreas con iluminación LED montadas con acabado profesional',
            badge: 'LETRAS CORPÓREAS LED',
          },
          {
            type: 'cards',
            columns: 4,
            items: [
              { icon: '🔤', title: 'Letras Corpóreas', description: 'Volumétricas en acrílico, PVC o metal, con o sin halo de iluminación LED.' },
              { icon: '🪧', title: 'Rótulos Sencillos', description: 'Impresión en vinil o lona montada sobre bastidor o sustratos rígidos.' },
              { icon: '🎪', title: 'Roll Up / Banner', description: 'Estructuras portátiles retráctiles revisadas en tensión y base.' },
              { icon: '🖼️', title: 'Cuadros de Madera', description: 'Piezas impresas y montadas sobre MDF o bastidor sin bordes levantados.' },
              { icon: '💡', title: 'Cajas de Luz', description: 'Cuerpo metálico/acrílico iluminado internamente sobre material backlight.' },
              { icon: '🏪', title: 'Fachadas Comerciales', description: 'Integración completa de rótulo principal, iluminación, cenefas y viniles.' },
              { icon: '🚗', title: 'Rotulación Vehicular', description: 'Aplicación uniforme de vinil moldeable sobre flotillas y vehículos.' },
              { icon: '📋', title: 'Señalética', description: 'Rótulos de seguridad, directorio e identificación interior y exterior.' },
            ],
          },
        ],
      },
      {
        id: 'herramientas',
        eyebrow: '🧰 SECCIÓN 03',
        title: 'Checklist de herramientas esenciales antes de salir',
        intro: 'Salir sin un taladro, broca o espátula correcta retrasa toda la jornada y daña la imagen frente al cliente.',
        points: [],
        blocks: [
          {
            type: 'diagram',
            kind: 'workshop-kit',
            eyebrow: 'KIT OBLIGATORIO DE SALIDA A INSTALACIONES',
            labels: {},
            groups: [
              { title: '🔩 Montaje e instalación', tone: 'green', items: ['✓ Taladro + brocas concreto/hierro', '✓ Nivel de burbuja / láser', '✓ Cinta métrica y marcador', '✓ Tacos, tornillos y silicona/cinta 3M', '✓ Espátulas, estilete y pistola de calor'] },
              { title: '⚡ Eléctrico y pruebas', tone: 'amber', items: ['✓ Multímetro y cinta aislante', '✓ Transformadores y cables de reserva', '✓ Extensión eléctrica probada', '✓ Alcohol/paños para limpiar superficie'] },
              { title: '🦺 Seguridad (EPP)', tone: 'cyan', items: ['✓ Gafas de seguridad y guantes', '✓ Calzado cerrado de trabajo', '✓ Escaleras revisadas y aseguradas', '✓ Protección para piso del cliente'] },
            ],
          },
        ],
      },
      {
        id: 'antes',
        eyebrow: '📋 SECCIÓN 04',
        title: 'Protocolo antes, durante y al cerrar la instalación',
        intro: 'Una instalación profesional sigue un método de 5 etapas y jamás perfora a ciegas.',
        points: [
          'Antes de salir: lee la Orden de Trabajo completa, prueba LED/acrílicos encendidos en taller y protege las piezas en el traslado.',
          'En sitio: identifica material de pared (concreto, drywall, vidrio) y detecta posibles cables o tuberías antes de perforar.',
          'Mide dos veces con nivel antes de marcar; mantén el área limpia con plástico/cartón protector durante todo el trabajo.',
        ],
        blocks: [
          {
            type: 'diagram',
            kind: 'quality-cards',
            eyebrow: 'ESTÁNDARES FINALES DE ACABADO POR PRODUCTO',
            labels: {},
            groups: [
              { title: 'Letras Corpóreas', tone: 'green', items: ['✓ Bordes lijados y limpios', '✓ Sin manchas exteriores de pegamento', '✓ LED parejo sin puntos muertos', '✓ Cables ocultos o mimetizados'] },
              { title: 'Vinil y Rótulos', tone: 'amber', items: ['✓ Cero burbujas ni pliegues', '✓ Cortes y cantos alineados', '✓ Superficie desengrasada previa', '✓ Fijación nivelada a burbuja'] },
              { title: 'Roll Up y Cajas de Luz', tone: 'cyan', items: ['✓ Mecanismo suave sin atascos', '✓ Tensión firme sin panza', '✓ Iluminación sin sombras', '✓ Prueba encendida ante el cliente'] },
            ],
          },
        ],
      },
      {
        id: 'cliente',
        eyebrow: '🤝 SECCIÓN 05',
        title: 'Conducta y atención al cliente en sitio',
        intro: 'Mientras instalas eres el representante visible de Visual Corp.',
        points: [
          'Presentación limpia, uniforme si corresponde y puntualidad en la hora acordada (o aviso temprano si ocurre un imprevisto de tráfico).',
          'Si el cliente pide un trabajo adicional fuera de la orden: “Permítame consultarlo con oficina/asesoría y se lo confirmamos”; nunca improvises cobros.',
          'Antes de retirarte y tras limpiar todo, toma fotos claras del resultado final con buena luz (y con permiso del cliente).',
        ],
        blocks: [
          {
            type: 'compare',
            items: [
              {
                icon: 'check',
                title: '✅ Lo que SÍ hacer siempre',
                tone: 'success',
                points: [
                  { text: 'Saludar al llegar: “Buenos días, venimos de Visual Corp a instalar su trabajo”.' },
                  { text: 'Pedir permiso antes de mover muebles o vitrinas.' },
                  { text: 'Recoger polvo, recortes de cable y despedirte agradeciendo.' },
                ],
              },
              {
                icon: 'shield',
                title: '🚫 Lo que NO hacer nunca',
                tone: 'danger',
                points: [
                  { text: 'Nunca música en altavoz, bromas pesadas o discusiones entre compañeros frente al cliente.' },
                  { text: 'Nunca uso recreativo del celular en horario de montaje.' },
                  { text: 'Nunca dejar basura ni huellas sobre paredes o vitrinas.' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'horarios',
        eyebrow: '🕐 SECCIÓN 06',
        title: 'Cultura y horarios del taller',
        intro: 'Cada acabado cuidado consolida a clientes recurrentes y referencias reales en Milagro y la región.',
        points: [],
        blocks: [
          {
            type: 'quote',
            text: '“Los clientes no ven el esfuerzo del taller, ven el resultado instalado. Haz cada montaje con el estándar con el que pondrías tu propio letrero.”',
            author: 'Cultura de Taller · Visual Corp',
          },
          STANDARD_SCHEDULES,
        ],
      },
    ],
    checklist: [
      'Verifiqué orden de trabajo, piezas probadas y kit de herramientas completo.',
      'Inspeccioné la pared/estructura buscando tuberías o cableado antes de perforar.',
      'Limpié el área, probé iluminación/firmeza y tomé evidencia del acabado final.',
    ],
  },
  {
    id: 'marketing',
    areaId: 'marketing',
    title: 'Guía de marketing y presencia digital',
    subtitle: 'Canales activos, fotografía de instalaciones, identidad de marca #F2B705, respuesta en redes y métricas clave.',
    duration: '10 min',
    badge: 'MARKETING',
    outcome: 'Producirás piezas alineadas a la identidad de Visual Corp, respetarás permisos de publicación del cliente y responderás leads digitales en tiempo récord.',
    source: 'Manual interno Visual Corp · Marketing y redes sociales.',
    sections: [
      {
        id: 'rol',
        eyebrow: '📢 SECCIÓN 01',
        title: 'Rol del marketing en Visual Corp',
        intro: 'Sin comunicación visual constante, incluso el rótulo mejor fabricado pasa desapercibido para nuevos prospectos.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 4,
            items: [
              { icon: 'megaphone', title: 'Redes Sociales', description: 'Presencia semanal constante con trabajos reales y claridad de oferta.' },
              { icon: 'camera', title: 'Portafolio Visual', description: 'Convertir cada instalación real en vitrina tangible de capacidad técnica.' },
              { icon: 'heart', title: 'Fidelización', description: 'Agradecer proyectos, mostrar clientes felices y construir recompra.' },
              { icon: 'target', title: 'Posicionamiento', description: 'Consolidar a Visual Corp como primera opción publicitaria en Milagro.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            icon: 'sparkles',
            title: 'Todo el equipo contribuye al marketing',
            text: 'Taller capta las instalaciones limpias, diseño cuida las plantillas de marca y asesores recopilan testimonios y casos de éxito.',
          },
        ],
      },
      {
        id: 'redes',
        eyebrow: '📱 SECCIÓN 02',
        title: 'Estrategia por plataforma social',
        intro: 'Cada canal cumple un papel distinto entre confianza local, catálogo visual y alcance orgánico.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              {
                badge: 'PRINCIPAL LOCAL',
                badgeTone: 'cyan',
                title: '📘 Facebook',
                description: 'Comunidad empresarial local, alcance por ubicación y consultas directas.',
                items: [
                  'Publicar mínimo 3 veces por semana.',
                  'Fotos de proyectos terminados con detalle técnico claro.',
                  'Responder comentarios e inbox dentro del SLA.',
                ],
              },
              {
                badge: 'PORTAFOLIO VISUAL',
                badgeTone: 'violet',
                title: '📸 Instagram',
                description: 'Vitrina cuidada con estética de agencia y proceso detrás de cámaras.',
                items: [
                  'Feed consistente con fotos nítidas y buen encuadre.',
                  'Stories mostrando taller, láser e instalaciones del día.',
                  'Reels antes/después y Highlights organizados.',
                ],
              },
              {
                badge: 'ALCANCE VIRAL',
                badgeTone: 'amber',
                title: '🎵 TikTok',
                description: 'Videos cortos (15–60 s) dinámicos de fabricación y montaje real.',
                items: [
                  'El corte láser e impresión muestran resultados muy satisfactorios.',
                  'Transformación clara: local vacío → fachada encendida.',
                  'Hook claro, subtítulos legibles y llamado a cotizar.',
                ],
              },
            ],
          },
          {
            type: 'callout',
            tone: 'danger',
            icon: 'shield',
            title: 'Regla de oro: NUNCA publicar sin autorización del cliente',
            text: 'Cumplir la producción no autoriza automáticamente difundir fachadas, logos o interiores en redes. Pide consentimiento previo expreso.',
          },
        ],
      },
      {
        id: 'fotografia',
        eyebrow: '📸 SECCIÓN 03',
        title: 'Fotografía de productos y fachadas',
        intro: 'Con un teléfono limpio y 3 encuadres intencionales puedes lograr portafolio de alto impacto.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 3,
            items: [
              { icon: '☀️', title: 'Luz natural suave', description: 'Evita flash directo sobre acrílicos; busca iluminación uniforme mañana o tarde.' },
              { icon: '📐', title: 'Mínimo 3 ángulos', description: 'Plano frontal recto + ángulo 3/4 lateral + detalle cercano del acabado.' },
              { icon: '🧹', title: 'Entorno y lente limpios', description: 'Retira cables, cartones o basura del encuadre y limpia el lente del celular.' },
              { icon: '🏪', title: 'Contexto real del local', description: 'Una foto en fachada real transmite escala y confianza mejor que el banco de taller.' },
              { icon: '🌙', title: 'Tomas nocturnas LED', description: 'En letras corpóreas luminosas y cajas de luz, dispara al atardecer o noche para lucir la luz.' },
              { icon: '🔄', title: 'Antes y Después', description: 'Registra la pared vacía antes de perforar para contrastar la transformación final.' },
            ],
          },
        ],
      },
      {
        id: 'identidad',
        eyebrow: '🎨 SECCIÓN 04',
        title: 'Identidad visual de Visual Corp',
        intro: 'La consistencia visual entre redes, cotizaciones y portafolio transmite solidez inmediata.',
        points: [
          'Usa exclusivamente el logotipo oficial sin deformar ni recolorar arbitrariamente.',
          'Máximo 2 familias tipográficas limpias por publicación; textos breves con buena jerarquía.',
          'Nunca publiques imágenes pixeladas, faltas ortográficas o plantillas improvisadas fuera de línea gráfica.',
        ],
        blocks: [
          {
            type: 'swatches',
            title: 'Paleta oficial de identidad',
            items: [
              { label: '#F2B705', hex: '#f2b705', darkText: true },
              { label: '#0A0F1E', hex: '#0a0f1e' },
              { label: 'Gradiente Marca', gradient: 'linear-gradient(135deg, #f2b705, #06b6d4)' },
              { label: '#06B6D4', hex: '#06b6d4', darkText: true },
              { label: '#FFFFFF', hex: '#ffffff', darkText: true },
            ],
          },
        ],
      },
      {
        id: 'atencion',
        eyebrow: '💬 SECCIÓN 05',
        title: 'Atención online rápida y con propósito',
        intro: 'Cada mensaje por WhatsApp, DM o Messenger es una oportunidad comercial activa.',
        points: [],
        blocks: [
          {
            type: 'compare',
            items: [
              {
                icon: 'check',
                title: '✅ Ejemplo de BUENA respuesta',
                subtitle: 'Meta: respuesta < 30 minutos',
                tone: 'success',
                description: '“¡Hola! 👋 Gracias por escribirnos a Visual Corp. Claro que fabricamos letras corpóreas con LED. ¿Nos compartes el texto y medidas aproximadas para cotizarte rápido?”',
              },
              {
                icon: 'alert',
                title: '🚫 Ejemplo de MALA respuesta',
                subtitle: '6 horas después sin seguimiento',
                tone: 'danger',
                description: '“si hacemos”. Sin saludo, sin guía técnica ni preguntas de medidas ni referencias visuales — el prospecto escribe a otro proveedor.',
              },
            ],
          },
        ],
      },
      {
        id: 'metricas',
        eyebrow: '📊 SECCIÓN 06',
        title: 'Métricas clave que revisamos',
        intro: 'Medimos lo que genera conversaciones reales y ventas confirmadas en Visual Corp Suite.',
        points: [],
        blocks: [
          {
            type: 'cards',
            columns: 4,
            items: [
              { icon: 'eye', badge: 'CRECIMIENTO SEMANAL', badgeTone: 'cyan', title: 'Alcance', description: 'Cuentas alcanzadas que conocen nuestros productos y servicios.' },
              { icon: 'heart', badge: 'META: > 3%', badgeTone: 'gold', title: 'Interacción', description: 'Guardados, compartidos y comentarios reales por publicación.' },
              { icon: 'message', badge: 'META: < 30 MIN', badgeTone: 'green', title: 'Mensajes y DMs', description: 'Consultas entrantes atendidas con preguntas claras para cotizar.' },
              { icon: 'trending', badge: 'OBJETIVO CENTRAL', badgeTone: 'violet', title: 'Conversión a venta', description: 'Porcentaje de consultas digitales que terminan cerrando orden.' },
            ],
          },
        ],
      },
      {
        id: 'horarios',
        eyebrow: '🕐 SECCIÓN 07',
        title: 'Horarios de trabajo',
        intro: 'La planificación y el tracking de campañas viven directamente en el módulo Marketing de Visual Corp Suite.',
        points: [],
        blocks: [STANDARD_SCHEDULES],
      },
    ],
    checklist: [
      'Obtuve autorización expresa del cliente antes de fotografiar o publicar su trabajo.',
      'Respeté los colores de marca (#F2B705, #0A0F1E, #06B6D4) y nitidez visual.',
      'Respondí mensajes entrantes con saludo, preguntas de medida y rapidez.',
    ],
  },
];

export const findArea = (id: string) => learningAreas.find((area) => area.id === id);
