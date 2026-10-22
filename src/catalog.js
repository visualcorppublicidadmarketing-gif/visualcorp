import rawCatalog from './data/estebanCatalog.json' with { type: 'json' };
import { media } from './data/media.js';

const numberFromLabel = (value) => {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const quantityLabel = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || !/\d/.test(text)) return false;
  if (/^precio\s*\d/i.test(text)) return false;
  if (/^pvp/i.test(text)) return false;
  return /^\d+(?:[.,]\d+)?(?:\s*(?:-|–|—|a|x|\/|hasta)\s*\d+(?:[.,]\d+)?)?(?:\s*(?:m2|m²|cm|unidades?|uds?|millar|millares|resma|resmas))?$/i.test(text);
};

const slugify = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  .slice(0, 70) || 'producto';

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

export function imageFor(category = '', text = '') {
  const haystack = `${category} ${text}`.toLowerCase();

  // 1. Souvenirs, Jarros & Regalos
  if (haystack.includes('color interior') || haystack.includes('asa de color')) return media.jarroColorInterior || media.taza;
  if (haystack.includes('jarro') && (haystack.includes('revelado') || (haystack.includes('magico') && haystack.includes('negro')))) return media.jarroMagicoReveladoTermico || media.jarroMagico;
  if (haystack.includes('jarro') && haystack.includes('escarchad')) return media.jarroEscarchadoAzulSublimable || media.jarroEscarchado;
  if (haystack.includes('escarchado')) return media.jarroEscarchado || media.jarroMagico;
  if (haystack.includes('jarro') && (haystack.includes('oro') || haystack.includes('espejo') || haystack.includes('metalizado'))) return media.jarroMetalizadoOroEspejo || media.jarroMetalizado;
  if ((haystack.includes('jarro') || haystack.includes('taza')) && (haystack.includes('metalizado') || haystack.includes('dorado') || haystack.includes('plateado'))) return media.jarroMetalizado || media.taza;
  if (haystack.includes('porta taza') || haystack.includes('caja taza')) return media.portaTazaCaja || media.taza;
  if (haystack.includes('magico') || haystack.includes('mágico')) return media.jarroMagico || media.taza;
  if (haystack.includes('jarro') && (haystack.includes('cervecero') || haystack.includes('vidrio') || haystack.includes('arenado'))) return media.jarroCerveceroVidrioSatinado || media.jarroCervecero;
  if (haystack.includes('cervecero') || haystack.includes('chopp')) return media.jarroCervecero || media.taza;
  if (haystack.includes('mason')) return media.jarroMason || media.taza;
  if (haystack.includes('taz') || haystack.includes('jarro') || haystack.includes('plato')) return media.taza;
  if (haystack.includes('almohada') && haystack.includes('escarchad')) return media.almohadaEscarchadaLentejuela || media.almohadasBlancoRelleno;
  if (haystack.includes('almohadas blanco') || (haystack.includes('almohada') && haystack.includes('blanco'))) return media.almohadasBlancoRelleno || media.almohada;
  if (haystack.includes('almohada') || haystack.includes('cojin') || haystack.includes('cojín')) return media.almohada;
  if (haystack.includes('500 ml') || (haystack.includes('tomatodo') && haystack.includes('aluminio') && haystack.includes('sublimac'))) return media.tomatodoAluminio500ml || media.tomatodoBlancoSublimado;
  if (haystack.includes('tomatodo') && haystack.includes('aluminio')) return media.tomatodoBlancoSublimado || media.tomatodo;
  if (haystack.includes('tomatodo') && (haystack.includes('plast') || haystack.includes('dtf'))) return media.tomatodoPlastico || media.tomatodo;
  if (haystack.includes('tomatodo') || haystack.includes('termo') || haystack.includes('botella')) return media.tomatodo;
  if (haystack.includes('10 cm') || (haystack.includes('llavero') && haystack.includes('un lado'))) return media.llaverosAcrilico10cm || media.llaverosSilueta;
  if (haystack.includes('predeterminada') || (haystack.includes('llavero') && (haystack.includes('ambos lados') || haystack.includes('2 lados')))) return media.llaverosAcrilicoDobleLado || media.llaverosSilueta;
  if (haystack.includes('llavero')) return media.llaveros;
  if (haystack.includes('pin') || haystack.includes('pines') || haystack.includes('boton') || haystack.includes('botón')) return media.pinesMetalicos || media.souvenirsPack;
  if (haystack.includes('sello') && (haystack.includes('grande') || haystack.includes('ruc') || haystack.includes('firma'))) return media.selloAutomaticoGrandeRUC || media.sellosTrodat;
  if (haystack.includes('sello') && (haystack.includes('4911') || haystack.includes('38x14') || haystack.includes('compacto'))) return media.selloAutomaticoTrodat4911 || media.sellosTrodat;
  if (haystack.includes('sello') && (haystack.includes('4912') || haystack.includes('47x18') || haystack.includes('mediano'))) return media.selloAutomaticoTrodat4912 || media.sellosTrodat;
  if (haystack.includes('sello') || haystack.includes('fechador') || haystack.includes('trodat')) return media.selloAutomaticoTrodat4912 || media.sellosTrodat;
  if (haystack.includes('lapiz') || haystack.includes('lápiz') || haystack.includes('ecologico') || haystack.includes('ecológico')) return media.lapicesEcologicos || media.souvenirsPack;
  if (haystack.includes('semiejecutivo') || (haystack.includes('boligrafo') && haystack.includes('metal'))) return media.boligrafosSemiejecutivosMetal || media.boligrafosEjecutivos;
  if (haystack.includes('promocional') || (haystack.includes('boligrafo') && haystack.includes('dtf'))) return media.boligrafosPromocionalesDTF || media.boligrafosEjecutivos;
  if (haystack.includes('boligrafo') || haystack.includes('bolígrafo') || haystack.includes('esfero')) return media.boligrafosEjecutivos || media.souvenirsPack;
  if (haystack.includes('cuaderno') || haystack.includes('agenda') || haystack.includes('pasta dura')) return media.cuadernoPastaDura || media.folletosPack;

  // 2. Textil, Gorras & Confección
  if (haystack.includes('campana camisetas') && (haystack.includes('50.0') || haystack.includes('50 u'))) return media.campanaCamisetasLote50u || media.campanaCamisetasMasivas;
  if (haystack.includes('campana camisetas') && (haystack.includes('100.0') || haystack.includes('100 u'))) return media.campanaCamisetasLote100u || media.campanaCamisetasMasivas;
  if (haystack.includes('campana camisetas') && (haystack.includes('500.0') || haystack.includes('500 u'))) return media.campanaCamisetasLote500u || media.campanaCamisetasMasivas;
  if (haystack.includes('campana camisetas') && (haystack.includes('1000') || haystack.includes('5000') || haystack.includes('10000'))) return media.campanaCamisetasLote1000u || media.campanaCamisetasMasivas;
  if (haystack.includes('kiana')) return media.camisetasTelaKianaSublimada || media.camisetasSublimadasTextil;
  if (haystack.includes('jersey')) return media.camisetasTelaJerseyAlgodon || media.camiseta;
  if (haystack.includes('campana camisetas')) return media.campanaCamisetasMasivas || media.camiseta;
  if (haystack.includes('body') || haystack.includes('bebe') || haystack.includes('bebé') || haystack.includes('recien nacido')) return media.bodyBebe || media.camiseta;
  if (haystack.includes('polo') && (haystack.includes('xxl') || haystack.includes('xxxl'))) return media.poloPiqueTallaEspecialXXL || media.poloPique;
  if (haystack.includes('polo') && (haystack.includes('2 lados') || haystack.includes('dos lados') || haystack.includes('espalda'))) return media.poloPiqueBordadoDoble || media.poloPique;
  if (haystack.includes('polo') && haystack.includes('bordad')) return media.poloPiqueBordadoPecho || media.poloPique;
  if (haystack.includes('polo') || haystack.includes('pique') || haystack.includes('piqué')) return media.poloPique || media.camisetaPolo;
  if ((haystack.includes('trucker') || haystack.includes('malla')) && haystack.includes('dtf')) return media.gorraMallaDTF || media.gorraTrucker;
  if ((haystack.includes('trucker') || haystack.includes('malla')) && (haystack.includes('sublimac') || haystack.includes('bco'))) return media.gorraMallaSublimada || media.gorraTrucker;
  if (haystack.includes('gabardina') && haystack.includes('dtf')) return media.gorraGabardinaDTF || media.gorraBordada;
  if (haystack.includes('gabardina') || (haystack.includes('gorra') && haystack.includes('bordad'))) return media.gorraBordada;
  if (haystack.includes('trucker') || haystack.includes('malla')) return media.gorraTrucker;
  if (haystack.includes('gorra ecuador') || haystack.includes('patria')) return media.gorraPatria || media.gorraEcuador || media.gorra;
  if (haystack.includes('gorra') || haystack.includes('vicera') || haystack.includes('visera')) return media.gorraPatria || media.gorra;
  if (haystack.includes('dtf') && (haystack.includes('xxl') || haystack.includes('xxxl'))) return media.dtfTextilTallasEspecialesXXL || media.dtfTextilA3Fullcolor;
  if (haystack.includes('dtf') && (haystack.includes('25') || haystack.includes('mayorista'))) return media.dtfTextilA4LoteMayorista || media.dtfTextilA4Pecho;
  if (haystack.includes('dtf') && haystack.includes('a3')) return media.dtfTextilA3Fullcolor || media.camisetasDTFEstampado;
  if (haystack.includes('dtf') && haystack.includes('a4') && (haystack.includes('xxl') || haystack.includes('xxxl'))) return media.dtfTextilA4TallasEspeciales || media.dtfTextilA4Pecho;
  if (haystack.includes('dtf') && haystack.includes('a4')) return media.dtfTextilA4PechoStandar || media.dtfTextilA4Pecho;
  if (haystack.includes('dtf')) return media.camisetasDTFEstampado || media.camiseta;
  if (haystack.includes('sublimacion') && (haystack.includes('xxl') || haystack.includes('xxxl'))) return media.sublimacionTextilTallasEspeciales || media.sublimacionTextilA3Full;
  if (haystack.includes('sublimacion') && (haystack.includes('25') || haystack.includes('mayorista'))) return media.sublimacionTextilA4Mayorista || media.sublimacionTextilA4Pecho;
  if (haystack.includes('sublimacion') && haystack.includes('a3')) return media.sublimacionTextilA3Full || media.camisetasSublimadasTextil;
  if (haystack.includes('sublimacion') && haystack.includes('a4') && (haystack.includes('xxl') || haystack.includes('xxxl'))) return media.sublimacionTextilA4Especiales || media.sublimacionTextilA4Pecho;
  if (haystack.includes('sublimacion') && haystack.includes('a4')) return media.sublimacionTextilA4Standar || media.sublimacionTextilA4Pecho;
  if (haystack.includes('sublimacion') || haystack.includes('sublimación')) return media.camisetasSublimadasTextil || media.camiseta;
  if (!haystack.includes('funda') && !haystack.includes('bolsa') && haystack.includes('camiseta')) return media.camiseta;

  // 3. Credenciales PVC & Accesorios de Identificación
  if (haystack.includes('combo') && haystack.includes('brazo') && haystack.includes('reflectivo')) return media.comboCredencialBrazoReflectivo || media.portacredencialBrazoNeon;
  if (haystack.includes('combo') && haystack.includes('brazo')) return media.comboCredencialBrazoEstandar || media.portacredencialBrazo;
  if (haystack.includes('portacredencial') && haystack.includes('brazo') && haystack.includes('reflectivo')) return media.portacredencialBrazoReflectivoSeguridad || media.portacredencialBrazoNeon;
  if (haystack.includes('portacredencial') && haystack.includes('brazo')) return media.portacredencialBrazoEstandar || media.portacredencialBrazo;
  if (haystack.includes('horizontal') && (haystack.includes('arenada') || haystack.includes('portacredencial'))) return media.portacredencialArenadaHorizontal || media.portacredencialArenadaRigida;
  if (haystack.includes('vertical') && haystack.includes('clip')) return media.portacredencialVerticalClip || media.portacredencialArenadaRigida;
  if (haystack.includes('combo') && (haystack.includes('dos lados') || haystack.includes('2 lados')) && haystack.includes('clip')) return media.comboCredencial2LadosClip || media.comboCredencialEstucheClip;
  if (haystack.includes('combo') && (haystack.includes('un lado') || haystack.includes('1 lado')) && haystack.includes('clip')) return media.comboCredencial1LadoClip || media.comboCredencialEstucheClip;
  if (haystack.includes('combo') && (haystack.includes('dos lados') || haystack.includes('2 lados')) && haystack.includes('portacredencial') && haystack.includes('cordon')) return media.comboCredencial2LadosPortacredencialCordon || media.comboCredencialEstucheCordon;
  if (haystack.includes('combo') && (haystack.includes('un lado') || haystack.includes('1 lado')) && haystack.includes('portacredencial') && haystack.includes('cordon')) return media.comboCredencial1LadoPortacredencialCordon || media.comboCredencialEstucheCordon;
  if (haystack.includes('portacredencial') && haystack.includes('clip')) return media.comboCredencialEstucheClip || media.portacredencialArenadaRigida;
  if (haystack.includes('portacredencial') && (haystack.includes('cordon') || haystack.includes('cordón'))) return media.comboCredencialEstucheCordon || media.portacredencialArenadaRigida;
  if (haystack.includes('arenada') || haystack.includes('portacredencial')) return media.portacredencialArenadaRigida || media.portacredencialAcrilica;
  if (haystack.includes('yoyo') || haystack.includes('retractil')) return media.yoyoRetractil || media.credencialesCombo;
  if ((haystack.includes('dos lados') || haystack.includes('2 lados')) && (haystack.includes('cordon') || haystack.includes('cordón'))) return media.comboCredencial2LadosCordon || media.credencialesCombo;
  if ((haystack.includes('un lado') || haystack.includes('1 lado')) && (haystack.includes('cordon') || haystack.includes('cordón'))) return media.comboCredencial1LadoCordon || media.credencialesCombo;
  if (haystack.includes('combo credencial') || (haystack.includes('credencial') && haystack.includes('combo'))) return media.credencialesCombo;
  if ((haystack.includes('cordon') || haystack.includes('cordón') || haystack.includes('lanyard')) && haystack.includes('llano')) return media.cordonLanyardLlano || media.cordonLanyardSublimado;
  if (haystack.includes('cordon') || haystack.includes('cordón') || haystack.includes('lanyard')) return media.cordonLanyardSublimado || media.credencialesLanyard;
  if (haystack.includes('credencial') && (haystack.includes('dos lados') || haystack.includes('2 lados'))) return media.credencialPVCDosLados || media.credencialesLanyard;
  if (haystack.includes('credencial') || haystack.includes('carnet')) return media.credencialesLanyard;

  // 4. Imprenta Comercial & Papelería
  if (haystack.includes('tarjeta') && (haystack.includes('uv') || haystack.includes('selectivo') || haystack.includes('sectorizado')) && haystack.includes('solo tiro')) return media.tarjetasCoucheUVSoloTiro || media.tarjetasUVSectorizado;
  if (haystack.includes('tarjeta') && (haystack.includes('uv') || haystack.includes('selectivo') || haystack.includes('sectorizado'))) return media.tarjetasUVSectorizado || media.tarjetas;
  if (haystack.includes('tarjeta') && haystack.includes('brillante')) return media.tarjetasCoucheBrillante || media.tarjetas;
  if (haystack.includes('tarjeta') && haystack.includes('mate')) return media.tarjetasCoucheMate || media.tarjetas;
  if (haystack.includes('tarjeta') || haystack.includes('presentacion') || haystack.includes('presentación')) return media.tarjetas;
  if (haystack.includes('volante') && haystack.includes('a5') && haystack.includes('solo tiro')) return media.volantesA5CoucheSoloTiro || media.volantesA5DobleCara;
  if (haystack.includes('a5') && (haystack.includes('tiro y retiro') || haystack.includes('dos lados') || haystack.includes('2 lados'))) return media.volantesA5DobleCara || media.flyers;
  if (haystack.includes('a6') && (haystack.includes('tiro y retiro') || haystack.includes('dos lados') || haystack.includes('2 lados'))) return media.volantesA6DobleCara || media.volantesA6Compactos;
  if (haystack.includes('a6')) return media.volantesA6Compactos || media.flyers;
  if (haystack.includes('volante') || haystack.includes('flyer') || haystack.includes('afiche')) return media.flyers;
  if (haystack.includes('diptico') || haystack.includes('díptico')) return media.dipticosPlegablesA4 || media.folletosPack;
  if (haystack.includes('20 x 21') || haystack.includes('20x21')) return media.tripticoCuadrado20x21 || media.tripticosCorporativosA4;
  if (haystack.includes('triptico') || haystack.includes('tríptico') || haystack.includes('folleto') || haystack.includes('brochure')) return media.tripticosCorporativosA4 || media.folletosPack;
  if (haystack.includes('12 hojas') || (haystack.includes('escritorio') && haystack.includes('anillo'))) return media.calendarioMesa12Hojas || media.calendarioSobremesa;
  if (haystack.includes('21 x 15') || haystack.includes('21x15')) return media.calendarioEscritorio21x15 || media.calendarioSobremesa;
  if (haystack.includes('21 x 18') || haystack.includes('21x18')) return media.calendarioEscritorio21x18 || media.calendarioSobremesa;
  if (haystack.includes('escritorio') || haystack.includes('sobremesa') || haystack.includes('wire-o')) return media.calendarioSobremesa || media.calendariosPack;
  if (haystack.includes('21 x 43') || haystack.includes('21x43')) return media.calendarioParedCouche21x43 || media.calendarioParedVarilla;
  if (haystack.includes('31 x 43') || haystack.includes('31x43')) return media.calendarioParedCouche31x43 || media.calendarioParedVarilla;
  if (haystack.includes('personalizado a3') || haystack.includes('a3 tiro') || (haystack.includes('santoral') && haystack.includes('a3'))) return media.calendarioParedA3Santoral || media.calendarioParedVarilla;
  if (haystack.includes('350 gr') || haystack.includes('santoral') || haystack.includes('varilla')) return media.calendarioParedVarilla || media.calendarioPared;
  if (haystack.includes('calendario') || haystack.includes('almanaque')) return media.calendarioPared || media.calendariosPack;
  if (haystack.includes('imprenta') || haystack.includes('factura')) return media.folletosPack;

  // 5. Diseño, Identidad & Accesorios de Montaje
  if (haystack.includes('brief') || haystack.includes('manual') || haystack.includes('identidad')) return media.manualIdentidadMarca || media.folletosPack;
  if (haystack.includes('2 propuestas')) return media.disenoLogotipo2Propuestas || media.disenoLogotipoBranding;
  if (haystack.includes('3 propuestas')) return media.disenoLogotipo3Propuestas || media.disenoLogotipoBranding;
  if (haystack.includes('logotipo') || haystack.includes('ilustrator')) return media.disenoLogotipoBranding || media.folletosPack;
  if (haystack.includes('pequeño') || haystack.includes('pequeno')) return media.ojalesPequenosLona || media.ojalesAccesoriosMontaje;
  if (haystack.includes('grande') && haystack.includes('ojal')) return media.ojalesGrandesLona || media.ojalesAccesoriosMontaje;
  if (haystack.includes('ojal') || haystack.includes('ojales')) return media.ojalesAccesoriosMontaje || media.stickers;
  if (haystack.includes('tubo de hierro') || (haystack.includes('tubo') && haystack.includes('hierro'))) return media.tuboHierroGuindola || media.tubosGuindolaDorados;
  if (haystack.includes('media x') || (haystack.includes('tubo') && haystack.includes('media'))) return media.tuboCortinaDoradoMedia || media.tuboDoradoMediaPulgada;
  if (haystack.includes('3/4') || (haystack.includes('tubo') && haystack.includes('3/4'))) return media.tuboDoradoTresCuartos || media.tubosGuindolaDorados;
  if (haystack.includes('1 pulg') || (haystack.includes('tubo') && haystack.includes('1 pulg'))) return media.tuboDoradoUnaPulgada || media.tubosGuindolaDorados;
  if (haystack.includes('tubo') && (haystack.includes('dorado') || haystack.includes('cortina') || haystack.includes('guindola'))) return media.tubosGuindolaDorados || media.tubosDoradosGuindola;
  if (haystack.includes('tubo') || haystack.includes('guindola')) return media.tubosDoradosGuindola || media.bannerX;

  // 6. Fundas, Bolsos & Empaques
  if (haystack.includes('radiografia') && (haystack.includes('5000') || haystack.includes('4000') || haystack.includes('3000') || haystack.includes('2000') || haystack.includes('1000'))) return media.fundasRadiografia1000u || media.fundasRadiografia2TintasClinica;
  if (haystack.includes('radiografia') && haystack.includes('500')) return media.fundasRadiografia500u || media.fundasRadiografia1TintaMedica;
  if (haystack.includes('radiografia') && (haystack.includes('2 color') || haystack.includes('dos color'))) return media.fundasRadiografia2TintasClinica || media.fundasRadiografiaMedica;
  if (haystack.includes('radiografia') || haystack.includes('radiografía') || haystack.includes('alta densidad')) return media.fundasRadiografia1TintaMedica || media.fundasRadiografiaAlta;
  if (haystack.includes('pastillera')) return media.fundasPastilleraMiniExtra || media.fundasPastilleraMini;
  if (haystack.includes('mega jumbo')) return media.fundasMegaJumboMayorista || media.fundasCamisetaMegaJumbo;
  if (haystack.includes('jumbo')) return media.fundasJumboBlanca || media.fundasCamisetaJumbo;
  if (haystack.includes('t3 - 30') || haystack.includes('t3-30') || (haystack.includes('t3') && haystack.includes('30'))) return media.fundasCamisetaT3_30 || media.fundasCamisetaT3;
  if (haystack.includes('t3 - 40') || haystack.includes('t3-40') || (haystack.includes('t3') && haystack.includes('40'))) return media.fundasCamisetaT3_40 || media.fundasCamisetaT3;
  if (haystack.includes('t3')) return media.fundasCamisetaT3_30 || media.fundasCamisetaT3;
  if (haystack.includes('t6')) return media.fundasCamisetaT6_46 || media.fundasCamisetaT6;
  if (haystack.includes('t8 - 58') || haystack.includes('t8-58') || (haystack.includes('t8') && haystack.includes('58'))) return media.fundasCamisetaT8_58 || media.fundasCamisetaT8;
  if (haystack.includes('t8 - 60') || haystack.includes('t8-60') || (haystack.includes('t8') && haystack.includes('60'))) return media.fundasCamisetaT8_60 || media.fundasCamisetaT8;
  if (haystack.includes('t8')) return media.fundasCamisetaT8_58 || media.fundasCamisetaT8;
  if (haystack.includes('boutique') && (haystack.includes('5000') || haystack.includes('4000') || haystack.includes('3000'))) return media.fundasBoutiqueMillar5000u || media.fundasBoutique2ColoresTinta;
  if (haystack.includes('boutique') && (haystack.includes('1000') || haystack.includes('2000'))) return media.fundasBoutiqueMillar1000u || media.fundasBoutique1ColorTinta;
  if (haystack.includes('boutique') && haystack.includes('500')) return media.fundasBoutiqueMillar500u || media.fundasBoutique1ColorTinta;
  if (haystack.includes('boutique') && (haystack.includes('2 color') || haystack.includes('dos color'))) return media.fundasBoutique2ColoresTinta || media.fundasBoutique;
  if (haystack.includes('boutique') || haystack.includes('manija') || haystack.includes('baja densidad') || haystack.includes('troquelada')) return media.fundasBoutique1ColorTinta || media.fundasBoutique;
  if (haystack.includes('funda') || haystack.includes('bolsa') || (haystack.includes('camiseta') && haystack.includes('funda'))) return media.fundasCamiseta || media.fundasPlasticas;
  if (haystack.includes('cambrella') || haystack.includes('bolso')) return media.bolsosCambrellaTote || media.bolsoCambrella;
  if (haystack.includes('mochila') || haystack.includes('rodeo') || haystack.includes('gymsack')) return media.mochilaGymsack || media.mochilaRodeo;
  if (haystack.includes('funda roll') || haystack.includes('funda para roll')) return media.fundaRollup || media.bolso;
  if (haystack.includes('funda banner') || haystack.includes('funda araña') || haystack.includes('funda arana')) return media.fundaBannerX || media.bolso;

  // 7. Rótulos, Gran Formato & Señalética
  if (haystack.includes('campana lonas') && (haystack.includes('1 a 50') || haystack.includes('50 m2'))) return media.campanaLonasVolumen50m2 || media.campanaLonasIndustrial;
  if (haystack.includes('campana lonas') && (haystack.includes('51 a 200') || haystack.includes('200 m2'))) return media.campanaLonasVolumen200m2 || media.campanaLonasIndustrial;
  if (haystack.includes('campana lonas') && (haystack.includes('201 a 500') || haystack.includes('1000 m2') || haystack.includes('500 m2'))) return media.campanaLonasVolumen1000m2 || media.campanaLonasIndustrial;
  if (haystack.includes('9 onzas') || haystack.includes('300x500')) return media.lona9OnzasEconomica || media.lona;
  if (haystack.includes('11 onzas')) return media.lona11OnzasEstandar || media.lona;
  if (haystack.includes('13 onzas')) return media.lona13OnzasPesada || media.lona;
  if (haystack.includes('80 micras')) return media.vinil80MicrasBrillante || media.vinil;
  if (haystack.includes('banner en a') || haystack.includes('caballete')) return media.bannerEnACaballete || media.stand;
  if (haystack.includes('campana lonas')) return media.campanaLonasIndustrial || media.rolloLona;
  if (haystack.includes('60 x 40') || haystack.includes('60x40')) return media.pancartaDeportiva60x40 || media.pancartasMadera;
  if (haystack.includes('80x60') || haystack.includes('80 x 60')) return media.pancartaDeportiva80x60 || media.pancartasMadera;
  if (haystack.includes('100 x 80') || haystack.includes('100x80')) return media.pancartaDeportiva100x80 || media.pancartasMadera;
  if (haystack.includes('pancarta') || haystack.includes('desfile')) return media.pancartasMadera;
  if (haystack.includes('microperforado')) return media.vinilMicro;
  if (haystack.includes('esmerilado') || haystack.includes('frosted')) return media.vinilEsmerilado;
  if (haystack.includes('banner x') || haystack.includes('aranita') || haystack.includes('araña')) return media.bannerX;
  if (haystack.includes('roll up') || haystack.includes('rollup') || haystack.includes('dummy')) return media.rollupProduct;
  if (haystack.includes('stand')) return media.stand || media.bannerX;
  if (haystack.includes('corporeo') || haystack.includes('corpóreo') || haystack.includes('3d') || haystack.includes('relieve')) return media.letras3D;
  if (haystack.includes('lightbox') || haystack.includes('caja de luz')) return media.lightboxAluminioLED || media.cajasLuzPack;
  if (haystack.includes('laser-acrilico') || (haystack.includes('laser') && haystack.includes('acril'))) return media.letreroAcrilicoStandoff || media.letreroAcrilicoLaser;
  if ((haystack.includes('letrero') || haystack.includes('rotulo') || haystack.includes('placa')) && haystack.includes('acril')) return media.letreroAcrilicoLaser || media.placaVidrio;
  if (haystack.includes('placa') || haystack.includes('vidrio') || haystack.includes('acril') || haystack.includes('laser')) return media.placaVidrio || media.laser;
  if (haystack.includes('neon') || haystack.includes('neón')) return media.neon;
  if (haystack.includes('totem') || haystack.includes('tótem') || haystack.includes('parado')) return media.luminosoTotem;
  if (haystack.includes('luminoso')) return media.luminoso;
  if (haystack.includes('rotulos publicitarios') || (haystack.includes('rotulo') && haystack.includes('publicit'))) return media.rotulosFachadaComercial || media.cajasLuzPack;
  if (haystack.includes('rotulo') || haystack.includes('rótulo') || haystack.includes('letrero') || haystack.includes('fachada')) return media.cajasLuzPack || media.letrero;
  if (haystack.includes('lona') || haystack.includes('panaflex') || haystack.includes('banner')) return media.lona;
  if (haystack.includes('sticker') || haystack.includes('etiqueta') || haystack.includes('troquel')) return media.stickers;
  if (haystack.includes('vinil') || haystack.includes('adhesivo')) return media.vinil;

  return media.stickers;
}

export function isAreaProduct(category = '', text = '') {
  const haystack = `${category} ${text}`.toLowerCase();
  return (
    /campana\s+lonas|\bm2\b|m²|gran formato/i.test(haystack) ||
    /lona|vinil|microperforado|panaflex|tela.*bandera/i.test(haystack) ||
    /rótulo|rotulo|fachada|caja de luz|luminoso|lightbox|corpóreo|corporeo/i.test(haystack) ||
    /porta-banner|banner en a|banner araña|banner arana/i.test(haystack)
  );
}

export function isTotalTierProduct(category = '') {
  return /imprenta|precios imprenta|radiografia|boutique|fundas camiseta/i.test(String(category).toLowerCase());
}

function buildGroupKey(row) {
  const cat = String(row.categoria).trim();
  const productIsQuantity = quantityLabel(row.producto);
  const variantIsQuantity = quantityLabel(row.variante);
  
  if (['Extras', 'Precios Imprenta', 'Souvenirs'].includes(cat)) {
    return `${cat}::${row.producto}`;
  }
  
  if (productIsQuantity && !variantIsQuantity) return cat;
  if (productIsQuantity && variantIsQuantity) return cat;
  return `${cat}::${row.producto}`;
}

function buildOptionRows(rows, key) {
  const sourceKey = key === 'producto' ? 'producto' : 'variante';
  const values = unique(rows.map((row) => row[sourceKey])).map((label) => ({
    id: slugify(label),
    label: String(label),
    value: String(label),
  }));
  if (values.length < 2) return [];
  return [{ id: 'variant', key: 'variant', label: 'Variante', type: 'select', values }];
}

function makeProduct(rows, index) {
  const first = rows[0];
  const category = String(first.categoria).trim();
  const groupKey = buildGroupKey(first);
  const [categoryKey, productKey] = groupKey.split('::');
  const productIsQuantity = quantityLabel(first.producto);
  const variantIsQuantity = quantityLabel(first.variante);
  const groupedCategory = groupKey === category;
  const optionKey = groupedCategory && !productIsQuantity ? 'producto' : groupedCategory ? 'variante' : null;
  const options = optionKey ? buildOptionRows(rows, optionKey) : [];
  const pricingMode = isTotalTierProduct(category) ? 'tier-total' : isAreaProduct(category, productKey || category) ? 'area' : 'unit';
  const pricesByVariant = {};

  const variantLabels = options[0]?.values.map((option) => option.label) || [null];
  variantLabels.forEach((variantLabel) => {
    const variantRows = variantLabel == null
      ? rows
      : rows.filter((row) => String(row[optionKey]) === String(variantLabel));
    const quantityKey = optionKey === 'producto' ? 'variante' : optionKey === 'variante' ? 'producto' : 'variante';
    const tiers = variantRows
      .map((row) => ({ qty: numberFromLabel(row[quantityKey]), price: Number(row.precio) || 0, label: String(row[quantityKey]) }))
      .filter((row) => row.qty != null)
      .sort((a, b) => a.qty - b.qty)
      .filter((row, rowIndex, list) => rowIndex === list.findIndex((item) => item.qty === row.qty));
    const fallbackRows = variantRows.map((row) => ({ qty: 1, price: Number(row.precio) || 0, label: String(row[quantityKey]) }));
    pricesByVariant[variantLabel || 'default'] = tiers.length ? tiers : fallbackRows;
  });

  const defaultVariant = variantLabels[0] || null;
  const priceScales = pricesByVariant[defaultVariant || 'default'] || [];
  const basePrice = priceScales[0]?.price || Number(first.precio) || 0;
  const name = groupedCategory ? category : String(productKey || category).trim();
  const id = `esteban-${slugify(category)}-${slugify(name)}-${index}`;
  const displayUnit = pricingMode === 'area' ? 'm²' : pricingMode === 'tier-total' ? 'lote' : 'unidad';

  return {
    id,
    source: 'esteban',
    name,
    category: category,
    type: pricingMode === 'area' ? 'm2' : pricingMode === 'tier-total' ? 'scale-total' : 'scale',
    calcType: pricingMode === 'area' ? 'm2' : pricingMode === 'tier-total' ? 'scale-total' : 'scale',
    pricingMode,
    price: basePrice,
    unit: displayUnit,
    image: imageFor(category, name),
    description: `Tarifas profesionales del catálogo Gigaprint · ${rows.length} reglas de escala y volumen.`,
    specs: unique([category, options[0] ? 'Variantes seleccionables' : null, pricingMode === 'area' ? 'Cálculo exacto por m²' : pricingMode === 'tier-total' ? 'Precio por lote completo' : 'Escala por volumen']),
    featured: index < 8,
    isPublished: true,
    variantOptions: options,
    priceScales,
    priceMatrix: pricesByVariant,
    customOptions: {
      allowDesign: true,
      allowEyelets: pricingMode === 'area' && /lona|vinil|microperforado|panaflex|tela/i.test(name),
    },
    sourceRows: rows,
    minQuantity: Math.max(1, priceScales[0]?.qty || 1),
    quantityStep: 1,
  };
}

const grouped = new Map();
rawCatalog.forEach((row) => {
  const key = buildGroupKey(row);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
});

export const estebanCatalogProducts = Array.from(grouped.values())
  .map((rows, index) => makeProduct(rows, index))
  .sort((a, b) => `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`, 'es'));

export const catalogCategories = ['Todos', ...unique(estebanCatalogProducts.map((product) => product.category))];

export function getProductCalcType(product) {
  if (
    product?.calcType === 'm2' ||
    product?.type === 'm2' ||
    product?.unit === 'm²' ||
    product?.unit === 'm2' ||
    product?.pricingMode === 'area' ||
    isAreaProduct(product?.category, product?.name)
  ) {
    return 'm2';
  }
  if (product?.pricingMode === 'tier-total' || product?.calcType === 'scale-total') {
    return 'scale-total';
  }
  return product?.calcType || product?.type || 'scale';
}

export function getVariantOptions(product) {
  return product?.variantOptions || product?.options || [];
}

export function getSelectedVariantKey(product, selection = {}) {
  const firstOption = getVariantOptions(product)[0];
  if (!firstOption) return 'default';
  return String(selection[firstOption.key] || firstOption.values?.[0]?.value || 'default');
}

export function getPriceTiers(product, selection = {}) {
  const matrix = product?.priceMatrix || {};
  const key = getSelectedVariantKey(product, selection);
  return (matrix[key] || product?.priceScales || []).slice().sort((a, b) => Number(a.qty) - Number(b.qty));
}

function tierPrice(tier, fallback = 0) {
  return Number(tier?.price ?? tier?.pvp ?? tier?.unitPrice ?? tier?.total ?? fallback) || 0;
}

export function getTier(product, quantity, selection = {}) {
  const tiers = getPriceTiers(product, selection);
  return tiers.reduce((current, tier) => Number(quantity) >= Number(tier.qty) ? tier : current, tiers[0] || { qty: 1, price: Number(product?.price) || 0 });
}

export function getSavingsPercentage(product, quantity, selection = {}) {
  const tiers = getPriceTiers(product, selection);
  if (!tiers.length || tiers.length === 1) return 0;
  const baseTier = tiers[0];
  const activeTier = getTier(product, quantity, selection);
  const basePrice = tierPrice(baseTier, product?.price);
  const activePrice = tierPrice(activeTier, product?.price);
  if (!basePrice || activePrice >= basePrice) return 0;
  return Math.round(((basePrice - activePrice) / basePrice) * 100);
}

export const PARENT_CATEGORIES = [
  'Todos',
  'Gran formato',
  'Rótulos y Fachadas',
  'Imprenta y Papelería',
  'Textil y Promocionales',
  'Corte y Grabado Láser'
];

export function getParentCategory(category = '') {
  const c = String(category).toLowerCase();
  if (c.includes('gran formato') || c.includes('campana') || c.includes('lona') || c.includes('vinil') || c.includes('microperforado') || c.includes('panaflex') || c.includes('roll up') || c.includes('stand') || c.includes('banner')) {
    return 'Gran formato';
  }
  if (c.includes('rótulo') || c.includes('rotulo') || c.includes('fachada') || c.includes('caja de luz') || c.includes('luminoso') || c.includes('neón') || c.includes('neon') || c.includes('corpóreo') || c.includes('corporeo')) {
    return 'Rótulos y Fachadas';
  }
  if (c.includes('imprenta') || c.includes('tarjeta') || c.includes('volante') || c.includes('tríptico') || c.includes('carpeta') || c.includes('factura') || c.includes('radiografia') || c.includes('boutique') || c.includes('funda') || c.includes('credencial')) {
    return 'Imprenta y Papelería';
  }
  if (c.includes('textil') || c.includes('camiseta') || c.includes('polo') || c.includes('gorra') || c.includes('taza') || c.includes('souvenir') || c.includes('almohada') || c.includes('bolso') || c.includes('mochila') || c.includes('regalo') || c.includes('promocional')) {
    return 'Textil y Promocionales';
  }
  if (c.includes('láser') || c.includes('laser') || c.includes('grabado') || c.includes('corte') || c.includes('acrílico') || c.includes('acril') || c.includes('placa')) {
    return 'Corte y Grabado Láser';
  }
  return 'Gran formato';
}

export function getLeadTimeEstimate(product) {
  const mode = product?.pricingMode || (getProductCalcType(product) === 'm2' ? 'area' : 'unit');
  const cat = String(product?.category || '').toLowerCase();
  if (mode === 'area') {
    return '24 a 48 horas hábiles';
  }
  if (mode === 'tier-total' || cat.includes('imprenta')) {
    return '3 a 5 días hábiles';
  }
  if (cat.includes('rótulo') || cat.includes('neón') || cat.includes('luminoso') || cat.includes('corpóreo')) {
    return '4 a 7 días hábiles';
  }
  return '24 a 72 horas hábiles';
}

export function calculateCatalogQuote(product, config = {}) {
  const calcType = getProductCalcType(product);
  const isArea = calcType === 'm2';
  const isTierTotal = product?.pricingMode === 'tier-total' || calcType === 'scale-total';
  const mode = isArea ? 'area' : isTierTotal ? 'tier-total' : 'unit';
  const quantity = Math.max(Number(product?.minQuantity || 1), Number(config.quantity) || 1);
  const width = Math.max(0.01, Number(config.width) || 1);
  const height = Math.max(0.01, Number(config.height) || 1);
  const area = width * height;
  const totalArea = area * quantity;
  // Los escalones de Campana Lonas están expresados en m² totales, no en piezas.
  const tierBasis = mode === 'area' ? totalArea : quantity;
  const tier = getTier(product, tierBasis, config.options || {});
  const tiers = getPriceTiers(product, config.options || {});
  const baseRate = tierPrice(tiers[0], product?.price);
  const rate = tierPrice(tier, product?.price);
  const design = Number(config.designCost) || 0;
  const extras = (config.extras || []).reduce((sum, extra) => sum + Number(extra.price || 0), 0);
  const optionAdjustment = Number(config.optionAdjustment) || 0;
  
  const material = mode === 'area' ? area * rate * quantity : mode === 'tier-total' ? rate : rate * quantity;
  const subtotal = Math.max(0, material + design + extras + optionAdjustment);
  const taxRate = Math.max(0, Number(config.taxRate) || 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;
  const unitEffectivePrice = mode === 'tier-total' ? (total / Math.max(1, Number(tier.qty) || 1)) : (total / quantity);
  const savingsPercent = baseRate > rate ? Math.round(((baseRate - rate) / baseRate) * 100) : 0;
  const leadTime = getLeadTimeEstimate(product);

  return {
    quantity,
    tier,
    tiers,
    tierBasis,
    rate,
    baseRate,
    mode,
    width,
    height,
    area,
    totalArea,
    material,
    design,
    extras,
    optionAdjustment,
    subtotal,
    taxRate,
    tax,
    total,
    unitEffectivePrice,
    savingsPercent,
    leadTime,
  };
}
