/**
 * SKUs verified against published product identity/specs and quote-catalog
 * entries. The keys are legacy fallback IDs; live quotes resolve by SKU.
 * Products without a verified alias stay as free text for direct prefill.
 */
const storefrontQuoteSourceKeyBySku: Record<string, string> = {
  PF001: 'store-funda_camiseta_t3_30',
  PF002: 'store-gorra_malla_sub',
  PF003: 'parsed-souvenirs-jarro-blanco-con-sublimacion',
  PF004: 'store-tarjeta_couche_brillante',
  PF005: 'store-funda_boutique_1',
  PF006: 'store-gorra_malla_dtf',
  PF008: 'store-tarjeta_couche_mate',
  PF009: 'store-camiseta_alg_dtf_std',
  PF010: 'store-tomatodo_al_500',
  PF011: 'store-volante_a5_tiro',
  PF012: 'store-pin_58mm',
  PF013: 'store-polo_bordado_std',
  PF014: 'parsed-precios-imprenta-volantes-tamano-a5-en-papel-couche-de-115-gr-tiro-y-retiro',
  PF015: 'store-cuaderno_a5',
  PF016: 'store-diptico_a4',
  PF017: 'store-triptico_29x21',
  SV001: 'store-cintra_pvc_6mm',
  SV002: 'store-lona_premium_13oz_brillante',
  SV003: 'store-rotulo_1c_1a3m2',
  SV004: 'store-cintra_pvc_3mm',
  SV005: 'store-lona_standard_11oz_brillante',
  SV006: 'store-rotulo_2c_1a5m2',
  SV007: 'store-cintra_pvc_3mm_laminado',
  SV008: 'store-letrero_lum_1c',
  SV009: 'store-lona_campana_9oz_brillante',
  SV010: 'store-cintra_pvc_2mm',
  SV011: 'store-letrero_lum_2c',
  SV012: 'store-lona_premium_12oz_mate',
  SV013: 'store-cintra_pvc_1mm',
  SV014: 'store-panaflex_traslucida_13oz',
  SV015: 'store-foamboard_pvc_5mm',
  SV016: 'store-vinil_adh_brillante',
  SV017: 'store-plancha_galv_fc',
  SV018: 'store-vinil_adh_mate',
  SV019: 'store-alucobond_3mm_int',
  SV020: 'store-vinil_adh_transparente',
  SV021: 'store-alucobond_4mm_ext',
  SV022: 'store-vinil_adh_laminado',
  SV024: 'store-lapida_acrilico_3mm_relieve',
  SV025: 'store-microperforado',
  SV026: 'store-vinil_reflectivo_impreso',
  SV027: 'store-vinil_arenado',
  SV028: 'store-backlight_translucido',
  SV029: 'store-floor_graphic',
  SV030: 'store-paper_blue_150',
  SV031: 'store-papel_fotografico_120',
  SV032: 'store-tela_sintetica_120',
  SV033: 'store-lienzo_impreso_120',
  SV159: 'parsed-radiografia-alta-densidad-radiografia-alta-densidad-pliego-1-2',
  SV161: 'parsed-radiografia-alta-densidad-radiografia-alta-densidad-pliego-3',
  SV162: 'parsed-radiografia-alta-densidad-radiografia-alta-densidad-pliego-5',
  SV163: 'parsed-boutique-manija-baja-densidad-boutique-manija-baja-densidad-tamano-1-0',
  SV164: 'parsed-boutique-manija-baja-densidad-boutique-manija-baja-densidad-tamano-2-0',
  SV165: 'parsed-boutique-manija-baja-densidad-boutique-manija-baja-densidad-tamano-3-0',
  SV166: 'parsed-boutique-manija-baja-densidad-boutique-manija-baja-densidad-tamano-4-0',
  SV167: 'parsed-boutique-manija-baja-densidad-boutique-manija-baja-densidad-tamano-5-0',
};

const totalBasisSkuSet = new Set(['PF014', 'SV159', 'SV161', 'SV162', 'SV163', 'SV164', 'SV165', 'SV166', 'SV167']);

export function getStorefrontQuoteSourceKey(sku: string | null | undefined) {
  const normalizedSku = sku?.trim().toLocaleUpperCase('es');
  return normalizedSku ? storefrontQuoteSourceKeyBySku[normalizedSku] : undefined;
}

export function getStorefrontQuotePriceBasis(sku: string | null | undefined): 'unit' | 'total' | undefined {
  const normalizedSku = sku?.trim().toLocaleUpperCase('es');
  if (!normalizedSku || !storefrontQuoteSourceKeyBySku[normalizedSku]) return undefined;
  return totalBasisSkuSet.has(normalizedSku) ? 'total' : 'unit';
}
