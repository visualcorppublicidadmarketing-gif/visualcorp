import type { ProductBase } from './types';

export const PRODUCT_BASES: ProductBase[] = [
  {
    id: 'camiseta', name: 'Camiseta', family: 'Textil y promocionales', image: '/images/catalog-products/camiseta_base.webp',
    quoteProduct: 'Camiseta personalizada', ratio: 1263 / 1246, model: 'apparel',
    printArea: { x: 31, y: 24, width: 38, height: 43 }, defaultX: 50, defaultY: 43, defaultSize: 18, hint: 'Pecho · área referencial',
  },
  {
    id: 'sudadera', name: 'Buso', family: 'Textil y promocionales', image: '/images/catalog-products/sudadera_base.webp',
    quoteProduct: 'Sudadera personalizada', ratio: 1212 / 1297, model: 'apparel',
    printArea: { x: 31, y: 25, width: 38, height: 40 }, defaultX: 50, defaultY: 42, defaultSize: 18, hint: 'Pecho · área referencial',
  },
  {
    id: 'polo', name: 'Polo', family: 'Textil y promocionales', image: '/images/catalog-products/polo_base.webp',
    quoteProduct: 'Polo personalizado', ratio: 1145 / 1374, model: 'apparel',
    printArea: { x: 34, y: 28, width: 32, height: 40 }, defaultX: 50, defaultY: 43, defaultSize: 16, hint: 'Pecho · área referencial',
  },
  {
    id: 'taza', name: 'Taza', family: 'Textil y promocionales', image: '/images/catalog-products/taza_base.webp',
    quoteProduct: 'Taza personalizada', ratio: 1, model: 'mug',
    printArea: { x: 26, y: 30, width: 48, height: 38 }, defaultX: 50, defaultY: 49, defaultSize: 23, hint: 'Cara frontal · área referencial',
  },
  {
    id: 'gorra', name: 'Gorra', family: 'Textil y promocionales', image: '/images/catalog-products/gorra_base.webp',
    quoteProduct: 'Gorra personalizada', ratio: 1388 / 1133, model: 'cap',
    printArea: { x: 34, y: 34, width: 32, height: 28 }, defaultX: 50, defaultY: 47, defaultSize: 18, hint: 'Frente · área referencial',
  },
  {
    id: 'bolsa', name: 'Bolso Tote', family: 'Textil y promocionales', image: '/images/catalog-products/bolsa_base.webp',
    quoteProduct: 'Bolso corporativo personalizado', ratio: 1199 / 1312, model: 'tote',
    printArea: { x: 25, y: 24, width: 50, height: 53 }, defaultX: 50, defaultY: 51, defaultSize: 21, hint: 'Cara frontal · área referencial',
  },
  {
    id: 'rotulo', name: 'Rótulo', family: 'Rótulos y fachadas', image: '/images/catalog-products/rotulo_base.webp',
    quoteProduct: 'Rótulo comercial', ratio: 1024 / 1536, model: 'sign',
    printArea: { x: 17, y: 16, width: 66, height: 64 }, defaultX: 50, defaultY: 48, defaultSize: 25, hint: 'Panel central · área referencial',
  },
  {
    id: 'rollup', name: 'Roll-up', family: 'Exhibición y eventos', image: '/images/catalog-products/roll_up_base.webp',
    quoteProduct: 'Roll-Up publicitario', ratio: 1024 / 1536, model: 'rollup',
    printArea: { x: 22, y: 9, width: 56, height: 78 }, defaultX: 50, defaultY: 46, defaultSize: 25, hint: 'Lona visible · área referencial',
  },
  {
    id: 'banner-arana', name: 'Banner X / araña', family: 'Exhibición y eventos', image: '/images/catalog-products/banner_arana_base.webp',
    quoteProduct: 'Banner tipo araña', ratio: 1024 / 1536, model: 'banner-x',
    printArea: { x: 27, y: 9, width: 48, height: 80 }, defaultX: 50, defaultY: 48, defaultSize: 24, hint: 'Lona visible · área referencial',
  },
  {
    id: 'banner-en-a', name: 'Banner en A', family: 'Exhibición y eventos', image: '/images/catalog-products/banner_en_a_base.webp',
    quoteProduct: 'Banner en A', ratio: 1312 / 1199, model: 'banner-a',
    printArea: { x: 24, y: 14, width: 52, height: 68 }, defaultX: 50, defaultY: 49, defaultSize: 24, hint: 'Panel frontal · área referencial',
  },
];

export const DEFAULT_PRODUCT_ID = 'camiseta';

export function getDefaultLogoLayer(product: ProductBase) {
  return {
    id: 'brand-logo',
    kind: 'image' as const,
    name: 'Logo de muestra',
    src: '/brand/visualcorp-symbol.png',
    x: product.defaultX,
    y: product.defaultY,
    size: product.defaultSize,
    rotation: 0,
    opacity: 96,
    color: '#ffffff',
    fontFamily: 'DM Sans',
    visible: true,
    locked: false,
  };
}
