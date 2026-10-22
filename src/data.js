import { assetPath, media } from './data/media.js';
import { estebanCatalogProducts, catalogCategories } from './catalog.js';
import { DEFAULT_BUSINESS_SCHEDULE } from './lib/scheduleEngine.js';

export { assetPath, media };

export const themePresets = [
  {
    id: 'default',
    name: 'Gigaprint base',
    eyebrow: 'Siempre activo',
    description: 'Naranja, tinta y crema: el sistema visual principal de Gigaprint.',
    palette: { accent: '#ea580c', accentDark: '#c2410c', accentSoft: '#fff1e8', secondary: '#171714' },
    label: 'Gigaprint',
    decorations: ['✦', '+', '∞'],
  },
  {
    id: 'navidad',
    name: 'Navidad Gigaprint',
    eyebrow: 'Temporada navideña',
    description: 'Rojo y verde festivos sin perder el naranja de la marca.',
    palette: { accent: '#c9362f', accentDark: '#982521', accentSoft: '#fde9e5', secondary: '#2f7447' },
    label: 'Navidad',
    decorations: ['✦', '❄', '✧', '🎄'],
  },
  {
    id: 'milagro',
    name: 'Fiestas de Milagro',
    eyebrow: 'Temporada de septiembre',
    description: 'Verde y dorado inspirados en Milagro, manteniendo el naranja como firma.',
    palette: { accent: '#2f8f5b', accentDark: '#1e6841', accentSoft: '#e5f4e9', secondary: '#d9a62e' },
    label: 'Milagro',
    decorations: ['✦', '●', '✧', '＋'],
  },
  {
    id: 'black-friday',
    name: 'Black Friday Gigaprint',
    eyebrow: 'Campaña comercial',
    description: 'Alto contraste para promociones, lanzamientos y temporadas de venta.',
    palette: { accent: '#ea580c', accentDark: '#c2410c', accentSoft: '#fff1e8', secondary: '#090909' },
    label: 'Black Friday',
    decorations: ['%', '✦', '↗', '+'],
  },
  {
    id: 'independencia',
    name: 'Fiestas de Ecuador',
    eyebrow: 'Temporada patria',
    description: 'Verde y dorado para campañas patrias, conservando la firma naranja de Gigaprint.',
    palette: { accent: '#0f766e', accentDark: '#115e59', accentSoft: '#e5f6f3', secondary: '#d97706' },
    label: 'Ecuador',
    decorations: ['✦', '◆', '✧', '＋'],
  },
  {
    id: 'verano',
    name: 'Verano en grande',
    eyebrow: 'Campaña de temporada',
    description: 'Una energía fresca para activaciones, eventos y productos promocionales.',
    palette: { accent: '#0891b2', accentDark: '#0e7490', accentSoft: '#e6f8fc', secondary: '#f59e0b' },
    label: 'Verano',
    decorations: ['☼', '✦', '≈', '＋'],
  },
];

export const initialData = {
  schemaVersion: 4,
  catalogVersion: 16,
  settings: {
    brand: 'Gigaprint',
    slogan: 'Tus ideas en grande',
    phone: '+593 98 765 4321',
    email: 'hola@gigaprint.ec',
    address: 'Av. García Moreno y 9 de Octubre, Milagro, Guayas - Ecuador',
    whatsapp: '593987654321',
    quoteWhatsappRoutes: [
      { id: 'ventas-principal', label: 'Ventas', number: '593987654321', categories: [], active: true, priority: 0 },
    ],
    quoteMessageIntro: '¡Hola Gigaprint! Acabo de generar una solicitud de cotización.',
    quoteMessageClosing: '¿Podrían confirmar disponibilidad, precio final y tiempo de entrega?',
    themePreset: 'default',
    heroKicker: 'Publicidad que se ve. Marcas que se recuerdan.',
    heroTitle: 'Haz que tu marca ocupe espacio.',
    heroText: 'Diseñamos, producimos e instalamos soluciones visuales para que tu negocio se vea profesional desde el primer vistazo.',
    businessSchedule: DEFAULT_BUSINESS_SCHEDULE,
  },
  calculatorSettings: {
    taxRate: 15,
    minDimensionCm: 1,
    maxDimensionCm: 5000,
    designAdaptationPrice: 5,
    designFromScratchPrice: 15,
    eyeletSmallPrice: 0.3,
    eyeletLargePrice: 0.5,
    flushCutPrice: 1.0, // Corte al ras opcional
    disclaimer: 'Los valores son referenciales y pueden variar según acabados, instalación y condiciones del proyecto.',
  },
  services: [
    { id: 'rotulos', name: 'Rótulos & fachadas', short: 'Tu local empieza a vender desde la calle.', detail: 'Rótulos sencillos, luminosos, corpóreos y fachadas completas con materiales pensados para durar.', icon: 'Building2', image: media.showcaseMampara, tag: 'Más solicitado' },
    { id: 'impresion', name: 'Impresión gran formato', short: 'Que tu campaña se vea a distancia.', detail: 'Lonas, viniles, microperforados, pendones y todo lo que necesitas para comunicar en grande.', icon: 'Printer', image: media.lona, tag: 'Producción rápida' },
    { id: 'personalizados', name: 'Personalizados & regalos', short: 'Detalles que hacen que te recuerden.', detail: 'Lámparas, neones, señalética, placas QR y piezas únicas para regalar o ambientar.', icon: 'Sparkles', image: media.showcaseDesigns, tag: 'A medida' },
    { id: 'laser', name: 'Corte y grabado láser', short: 'Precisión para ideas con carácter.', detail: 'Cortamos y grabamos MDF, acrílico, madera y otros materiales para proyectos especiales.', icon: 'ScanLine', image: media.laser, tag: 'Precisión' },
  ],
  products: [
    { id: 'lona', name: 'Lona publicitaria económica / estándar (13 oz)', category: 'Gran formato', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 5.0, price_inst: 8.5, price_corp: 4.50, unit: 'm²', image: media.lona, description: 'Lona resistente para fachadas, eventos y campañas. Alta resolución full color.', featured: true, specs: ['13 oz / 510 g', 'Full color CMYK', 'Acabado mate o brillante', 'Cálculo exacto por m²'] },
    { id: 'vinil', name: 'Vinilo adhesivo personalizado', category: 'Gran formato', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 9.5, price_inst: 14.0, price_corp: 8.75, unit: 'm²', image: media.vinil, description: 'Vinilo de impresión y corte para vitrinas, señalización y vehículos.', featured: true, specs: ['Corte opcional', 'Interior / exterior', 'Aplicación profesional', 'Cálculo exacto por m²'] },
    { id: 'banner-a', name: 'Banner en A (Porta-banner)', category: 'Gran formato', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 12.0, unit: 'm²', image: media.stand, description: 'Soporte publicitario de doble cara tipo A ideal para puntos de venta y ferias.', featured: false, specs: ['Estructura de aluminio', 'Lona intercambiable', 'Doble cara'] },
    { id: 'banner-arana', name: 'Banner Araña (Tensión en X 60x160cm)', category: 'Gran formato', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 18.0, unit: 'unidad', image: media.bannerX, description: 'Display con estructura de fibra tipo araña y lona tensada sin arrugas con ojales en las 4 esquinas.', featured: true, specs: ['Estructura ligera', 'Lona de alta tensión', 'Fácil armado', 'Incluye estuche'] },
    { id: 'vinil-microperforado', name: 'Vinil Microperforado para Vitrinas y Vehículos', category: 'Gran formato', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 12.5, price_inst: 16.0, unit: 'm²', image: media.vinilMicro, description: 'Visión unidireccional que permite ver hacia afuera manteniendo privacidad y publicidad desde el exterior.', featured: true, specs: ['Visión 1 vía', 'Protección solar UV', 'Ideal locales y autos', 'Cálculo por m²'] },
    { id: 'vinil-esmerilado', name: 'Vinil Esmerilado / Frosted Glass para Oficinas', category: 'Gran formato', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 14.0, price_inst: 18.5, unit: 'm²', image: media.vinilEsmerilado, description: 'Elegante film traslúcido para mamparas de vidrio con cortes geométricos y logotipos corporativos.', featured: true, specs: ['Privacidad elegante', 'Corte computarizado', 'Fácil limpieza', 'Acabado arenado'] },
    { id: 'rotulos', name: 'Rótulos Publicitarios', category: 'Rótulos', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 18.0, price_inst: 22.0, unit: 'm²', image: media.showcaseMampara, description: 'Señalética exterior e interior de alta durabilidad en vinilo sobre rígidos.', featured: true, specs: ['Interior y exterior', 'Resistente al sol y lluvia', 'Instalación disponible'] },
    { id: 'corporeo', name: 'Letras 3D Corpóreas en Acrílico y Relieve', category: 'Rótulos', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 35.0, unit: 'm²', image: media.letras3D, description: 'Letras y logos en relieve cortados con precisión láser en acrílico, PVC o MDF con iluminación LED.', featured: true, specs: ['Acrílico, PVC o MDF', 'Corte láser pulido', 'Iluminación LED opcional', 'Pernos distanciadores'] },
    { id: 'luminoso', name: 'Letreros Luminosos (Lightbox)', category: 'Rótulos', type: 'm2', calcType: 'm2', pricingMode: 'area', price: 45.0, price_inst: 55.0, unit: 'm²', image: media.luminoso, description: 'Cajas de luz con iluminación LED de bajo consumo y marco de aluminio anodizado.', featured: true, specs: ['Iluminación LED uniforme', 'Estructura de aluminio', 'Acrílico difusor'] },
    { id: 'rollup', name: 'Roll Up (Banner Retráctil)', category: 'Gran formato', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 45.0, priceScales: [{ qty: 1, price: 45.0 }, { qty: 3, price: 42.0 }, { qty: 5, price: 39.0 }, { qty: 10, price: 35.0 }], unit: 'unidad', image: media.rollupProduct, description: 'Banner retráctil de aluminio 85×200 cm con tela semirrígida antibrillo.', featured: false, specs: ['Estructura retráctil', '85 × 200 cm', 'Bolso de transporte incluido', 'Escalas por volumen'] },
    { id: 'almohada-sublimada', name: 'Almohada / Cojín Sublimado Personalizado', category: 'Personalizados', type: 'unit', calcType: 'unit', pricingMode: 'unit', price: 12.0, unit: 'unidad', image: media.almohada, description: 'Cojín decorativo con estampado full color de alta definición, tela suave lavable y cierre invisible.', featured: true, specs: ['40 × 40 cm', 'Sublimación textil HD', 'Relleno antialérgico', 'Cierre invisible'] },
    { id: 'tomatodo-aluminio', name: 'Tomatodo / Botella Térmica de Aluminio', category: 'Personalizados', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 9.5, priceScales: [{ qty: 1, price: 9.5 }, { qty: 6, price: 8.5 }, { qty: 12, price: 7.5 }, { qty: 50, price: 6.5 }], unit: 'unidad', image: media.tomatodo, description: 'Botella deportiva de aluminio con grabado láser o sublimación de logo y mosquetón.', featured: true, specs: ['Aluminio 600ml / 750ml', 'Tapa a rosca con mosquetón', 'Grabado láser o color', 'Ideal merchandising'] },
    { id: 'llaveros-acrilico', name: 'Llaveros Acrílicos con Corte Láser', category: 'Personalizados', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 2.5, priceScales: [{ qty: 1, price: 2.5 }, { qty: 12, price: 1.8 }, { qty: 50, price: 1.2 }, { qty: 100, price: 0.95 }], unit: 'unidad', image: media.llaveros, description: 'Llaveros transparentes troquelados en acrílico con argolla metálica y grabado o impresión UV full color.', featured: true, specs: ['Acrílico cristal 3mm', 'Corte láser pulido', 'Argolla niquelada', 'Siluetas personalizadas'] },
    { id: 'gorra-trucker', name: 'Gorra Trucker Publicitaria Personalizada', category: 'Personalizados', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 8.5, priceScales: [{ qty: 1, price: 8.5 }, { qty: 6, price: 7.5 }, { qty: 12, price: 6.5 }, { qty: 50, price: 5.5 }], unit: 'unidad', image: media.gorraTrucker, description: 'Gorra tipo trucker con malla transpirable, broche ajustable y parche bordado o sublimado frontal.', featured: true, specs: ['Malla transpirable', 'Parche HD sublimado/bordado', 'Ajuste snapback', 'Varios colores'] },
    { id: 'tarjetas-presentacion', name: 'Tarjetas de Presentación Premium con Barniz UV', category: 'Imprenta', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 18.0, priceScales: [{ qty: 100, price: 18.0 }, { qty: 500, price: 32.0 }, { qty: 1000, price: 45.0 }], unit: 'caja', image: media.tarjetas, description: 'Tarjetas corporativas en cartulina couché 350g con laminado mate y brillo UV sectorizado.', featured: true, specs: ['Couché 350g grueso', 'Laminado mate suave', 'Brillo UV sectorizado', 'Caja de 100/500/1000 u'] },
    { id: 'flyers-publicitarios', name: 'Flyers y Volantes Publicitarios Full Color', category: 'Imprenta', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 25.0, priceScales: [{ qty: 500, price: 25.0 }, { qty: 1000, price: 38.0 }, { qty: 2500, price: 75.0 }], unit: 'millar', image: media.flyers, description: 'Volantes comerciales impresos en papel couché brillante de 150g a todo color tiro y retiro.', featured: true, specs: ['Papel couché 150g', 'Impresión offset digital', 'Tamaño 1/4 oficio o A5', 'Full color 2 caras'] },
    { id: 'laser-acrilico', name: 'Letrero acrílico cortado en láser', category: 'Personalizados', type: 'unit', calcType: 'unit', pricingMode: 'unit', price: 35.0, unit: 'unidad', image: media.laser, description: 'Fabricación a medida con selección de color, espesor y sistema de sujeción.', featured: false, specs: ['Corte láser pulido', 'Pernos distanciadores', 'Acrílico importado'] },
    { id: 'placa-qr', name: 'Placa QR para negocios', category: 'Personalizados', type: 'scale', calcType: 'scale', pricingMode: 'unit', price: 18.0, unit: 'unidad', image: media.placa, description: 'Placa de mesa o pared con código QR verificado para menús, pagos o redes.', featured: false, specs: ['Acrílico y base madera', 'QR grabado o impreso', 'Diseño personalizado'] },
    { id: 'neon', name: 'Neón LED personalizado', category: 'Personalizados', type: 'unit', calcType: 'unit', pricingMode: 'unit', price: 95.0, unit: 'desde', image: media.neon, description: 'Tu frase o logo convertido en una pieza luminosa de neón flexible de última generación.', featured: false, specs: ['Base acrílica transparente', 'Fuente de alimentación 12V', 'Diseño a medida'] },
    { id: 'stickers', name: 'Stickers personalizados', category: 'Imprenta', type: 'unit', calcType: 'unit', pricingMode: 'unit', price: 0.35, unit: 'unidad', image: media.stickers, description: 'Vinil adhesivo troquelado en cualquier silueta para promociones y empaques.', featured: false, specs: ['Vinil adhesivo', 'Corte personalizado', 'Resistente al agua'] },
  ].concat(estebanCatalogProducts),
  promotions: [
    { id: 'promo-1', title: 'Kit apertura', eyebrow: 'Para nuevos negocios', description: 'Rótulo + tarjetas + stickers para abrir con una imagen que se sienta tuya.', price: 189, oldPrice: 245, badge: 'Ahorra 23%', active: true },
    { id: 'promo-2', title: 'Tu vitrina habla', eyebrow: 'Este mes', description: 'Diseño e instalación de vinil para vitrina hasta 4 m².', price: 79, oldPrice: 105, badge: 'Cupo limitado', active: true },
    { id: 'promo-3', title: 'Pack feria', eyebrow: 'Eventos y activaciones', description: 'Roll up + 500 tarjetas + 100 stickers para salir a vender.', price: 129, oldPrice: 168, badge: 'Más vendido', active: true },
  ],
  inquiries: [],
  homeBlocks: [
    { id: 'home-intro', type: 'text', visible: true, animation: 'none', content: '<div class="home-block-kicker">Gigaprint / sistema visual</div><h2>Una misma idea puede vivir en una fachada, una vitrina y una experiencia.</h2><p>Usa este espacio desde el editor para contar campañas, mostrar procesos o destacar un servicio de temporada.</p>' },
    { id: 'home-story', type: 'media-text', visible: true, animation: 'none', side: 'left', title: 'Diseñamos para que la producción tenga sentido.', content: '<p>El diseño no termina en la pantalla. Probamos proporciones, materiales y acabados para que tu idea llegue al mundo con la fuerza correcta.</p>', src: media.workspace, alt: 'Equipo de Gigaprint trabajando' },
    { id: 'home-gallery', type: 'gallery', visible: true, animation: 'none', layout: 'masonry', columns: 3, items: [media.showcaseMampara, media.showcaseCampaign, media.neon, media.showcaseDesigns, media.luminoso, media.rollupProduct].map((src) => ({ src, alt: 'Trabajo real de publicidad y producción Gigaprint' })) },
  ],
};

export const categories = Array.from(new Set([...catalogCategories, 'Gran formato', 'Rótulos', 'Personalizados', 'Imprenta']));

export function money(value) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);
}
