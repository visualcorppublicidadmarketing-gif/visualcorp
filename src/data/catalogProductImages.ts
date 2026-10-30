import realProductImages from './catalog-real-product-images.json';

const realPhotos = realProductImages.products as Array<{ keywords: string[]; name: string; image: string }>;

const examples = [
  ['roll up', '01_Roll_Up_Tia', 'roll_up_base', ['banner x']],
  ['banner araña', '02_Banner_Arana_Aki', 'banner_arana_base', ['banner arana', 'tension']],
  ['stand publicitario', '03_Stand_Coca_Cola', 'stand_publicitario_base', ['pop up']],
  ['jarro', '04_Taza_Cafe_Sol', 'taza_base', ['taza']],
  ['gorra', '05_Gorra_Nike', 'gorra_base', []],
  ['lápiz ecológico', '18_Boligrafo_BIC', 'boligrafo_base', ['lapiz ecologico', 'lápices ecológicos']],
  ['banner en a', '06_Banner_A_McDonalds', 'banner_en_a_base', []],
  ['totem', '07_Totem_Netlife', 'totem_publicitario_base', []],
  ['exhibidor de mesa', '08_Exhibidor_Oreo', 'exhibidor_de_mesa_base', ['menudero']],
  ['credencial', '09_Credencial_Evento', 'credencial_base', ['porta credencial']],
  ['camiseta', '10_Camiseta_Sublimada_Milagro', 'camiseta_base', []],
  ['rotulo', '11_Rotulo_Adidas', 'rotulo_base', ['rótulo']],
  ['círculo led', '12_Letrero_Netflix', 'letrero_luminoso_base', ['círculo luminoso']],
  ['letrero luminoso', '12_Letrero_Netflix', 'letrero_luminoso_base', ['lightbox']],
  ['neon', '13_Neon_Barbie', 'neon_base', ['neón']],
  ['senal pvc', '14_Senaletica_IKEA', 'senal_pvc_base', ['señaletica']],
  ['tarjeta', '15_Tarjetas_Apple', 'tarjetas_base', []],
  ['flyer', '16_Flyer_KFC', 'flyer_base', ['volante']],
  ['carpeta', '17_Carpeta_Samsung', 'carpeta_base', []],
  ['boligrafo', '18_Boligrafo_BIC', 'boligrafo_base', ['bolígrafo']],
  ['bolsa', '19_Bolsa_HM', 'bolsa_base', ['funda boutique']],
  ['tomatodo', '20_Tomatodo_Gatorade', 'tomatodo_base', ['termo']],
  ['cuaderno', '21_Cuaderno_Comics', 'cuaderno_base', []],
  ['stickers', '22_Stickers_Amor', 'stickers_base', []],
  ['trofeo', '23_Trofeo_RedBull', 'trofeo_base', []],
  ['sudadera', '24_Sudadera_Pepsi', 'sudadera_base', []],
  ['triptico academia', '25_Triptico_Academia', 'triptico_base', []],
  ['calendario', '26_Calendario_Netlife', 'calendario_base', []],
  ['polo', '27_Polo_Puma', 'polo_base', []],
  ['mochila', '28_Mochila_Spotify', 'mochila_base', []],
  ['pin', '29_Pin_CocaCola', 'pin_base', ['pines']],
  ['valla', '30_Valla_Toyota', 'valla_base', []],
  ['banderola', '31_Banderola_Pepsi', 'banderola_base', []],
  ['corporeo', '32_Formas_Acrilicas_TikTok', 'corporeo_base', ['forma acrílica']],
  ['vehiculo', '33_Brandeo_Vehiculo_DHL', 'vehiculo_base', ['brandeo']],
  ['vinil', '34_Vinil_Airbnb', 'vinil_base', []],
  ['sobre', '35_Sobre_Mastercard', 'sobre_base', []],
  ['hoja membretada', '36_Hoja_Google', 'hoja_membretada_base', ['hoja membreta']],
  ['lanyard', '37_Lanyard_Spotify', 'lanyard_base', []],
  ['mousepad', '38_Mousepad_PlayStation', 'mousepad_base', ['mouse pad']],
  ['pulsera', '39_Pulsera_Barbie', 'pulsera_base', []],
  ['gigantografia', '40_Gigantografia_Ecuador', 'gigantografia_base', []],
  ['backlight', '41_Backlight_CocaCola', 'backlight_base', []],
  ['pendon', '42_Pendon_Tia', 'pendon_base', ['pendón']],
  ['placa qr', '43_Placa_QR_Instagram', 'placa_qr_base', []],
  ['etiqueta', '44_Etiquetas_Fanta', 'etiqueta_base', []],
];

export function catalogImagesForProduct(product) {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const search = normalize(`${product.id} ${product.name} ${product.family}`);
  if (String(product.id || '').startsWith('std-') || String(product.id || '').toLowerCase().startsWith('vc-std-') || product.product_kind === 'standard_custom') {
    const images = (product.images || []).filter(Boolean);
    const primaryImage = product.image || product.image_url;
    if (primaryImage && !images.includes(primaryImage)) images.unshift(primaryImage);
    return images.slice(0, 10);
  }
  const realPhoto = realPhotos.find(({ keywords }) => keywords.some((keyword) => search.includes(normalize(keyword))));
  if (realPhoto) return [realPhoto.image];
  const [base, brand, corporate] = examples.find(([key, , , aliases]) =>
    [key, ...aliases].some((term) => search.includes(normalize(term)))
  ) || [];
  if (!brand) {
    const images = (product.images || []).filter(Boolean);
    const primaryImage = product.image || product.image_url;
    if (primaryImage && !images.includes(primaryImage)) images.unshift(primaryImage);
    return images.slice(0, 2);
  }
  const paths = [`/images/catalog-products/${corporate}.webp`, `/images/catalog-products/${brand}.webp`];
  return paths;
}

