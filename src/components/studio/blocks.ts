import { assetPath } from '../../data/media';

export const blockCatalog = [
  { type: 'text', label: 'Texto enriquecido', description: 'Titulares, párrafos, listas y enlaces', icon: 'Type' },
  { type: 'columns', label: 'Columnas', description: 'Combina bloques en 2 o 3 columnas', icon: 'Columns3' },
  { type: 'image', label: 'Imagen', description: 'Imagen adaptable con texto alternativo', icon: 'Image' },
  { type: 'gallery', label: 'Galería', description: 'Mosaico, masonry o carrusel', icon: 'Images' },
  { type: 'media-text', label: 'Imagen + texto', description: 'Composición editorial reversible', icon: 'PanelLeft' },
  { type: 'banner', label: 'Imagen banner', description: 'Imagen de ancho completo', icon: 'RectangleHorizontal' },
  { type: 'video', label: 'Video', description: 'Embed o enlace a video', icon: 'Video' },
  { type: 'divider', label: 'Divisor / espacio', description: 'Ritmo y separación visual', icon: 'Minus' },
  { type: 'button', label: 'Botón / CTA', description: 'Llamada a la acción', icon: 'MousePointerClick' },
  { type: 'social', label: 'Redes sociales', description: 'Links sociales de la marca', icon: 'Share2' },
  { type: 'map', label: 'Mapa', description: 'Ubicación y contacto', icon: 'MapPinned' },
  { type: 'embed', label: 'HTML incrustado', description: 'Código seguro para embeds', icon: 'Code2' },
  { type: 'form', label: 'Formulario', description: 'Preguntas y encuestas configurables', icon: 'ClipboardList' },
];

export function createBlock(type) {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const common = { id, type, visible: true, animation: 'none' };
  if (type === 'text') return { ...common, content: '<h2>Una idea que merece verse en grande.</h2><p>Escribe aquí el contenido de tu página con una jerarquía clara y una voz propia.</p>' };
  if (type === 'columns') return { ...common, columns: [{ id: `${id}-a`, width: 50, blocks: [createBlock('text')] }, { id: `${id}-b`, width: 50, blocks: [createBlock('image')] }] };
  if (type === 'image') return { ...common, src: assetPath('/images/gigaprint/impresion_gran_formato.png'), alt: 'Publicidad Gigaprint', caption: '', size: 'medium', fit: 'cover', radius: 'large' };
  if (type === 'gallery') return { ...common, layout: 'grid', columns: 3, items: ['/images/gigaprint/lona_banner.png', '/images/gigaprint/vinil_adhesivo.png', '/images/gigaprint/letras_corporeas.png'].map((src) => ({ src: assetPath(src), alt: 'Proyecto Gigaprint' })) };
  if (type === 'media-text') return { ...common, side: 'left', title: 'La producción también cuenta una historia.', content: '<p>Una imagen bien elegida y un mensaje claro convierten una visita en una conversación.</p>', src: assetPath('/images/gigaprint/disenador_workspace.png'), alt: 'Equipo Gigaprint' };
  if (type === 'banner') return { ...common, src: assetPath('/images/gigaprint/lona_banner.png'), alt: 'Lona publicitaria', height: 'medium', overlay: 0.25 };
  if (type === 'video') return { ...common, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Mira cómo trabajamos', poster: assetPath('/images/gigaprint/galaxy_printer.png') };
  if (type === 'divider') return { ...common, style: 'line', space: 32 };
  if (type === 'button') return { ...common, label: 'Cuéntanos tu idea', href: '/contacto', variant: 'primary', align: 'left' };
  if (type === 'social') return { ...common, title: 'Síguenos y ve más ideas', links: [{ label: 'Instagram', href: 'https://instagram.com' }, { label: 'WhatsApp', href: 'https://wa.me/593999999999' }] };
  if (type === 'map') return { ...common, title: 'Visítanos', address: 'Milagro, Guayas - Ecuador', embedUrl: '' };
  if (type === 'embed') return { ...common, html: '<div style="padding:24px;border:1px dashed #ea580c">Embed externo</div>', label: 'Embed HTML' };
  if (type === 'form') return { ...common, title: 'Cuéntanos tu proyecto', fields: [{ key: 'name', label: 'Tu nombre', type: 'text', required: true }, { key: 'email', label: 'Correo', type: 'email', required: true }, { key: 'message', label: '¿Qué necesitas producir?', type: 'textarea', required: true }] };
  return common;
}
