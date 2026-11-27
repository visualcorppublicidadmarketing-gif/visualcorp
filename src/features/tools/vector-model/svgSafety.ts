const MAX_SVG_BYTES = 8 * 1024 * 1024;
const MAX_SVG_NODES = 30_000;
const MAX_SVG_DEPTH = 64;
const MAX_VECTOR_PATH_TOKENS = 250_000;
const MAX_VECTOR_PATHS = 600;
const OMIT_TAGS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'style', 'use', 'image', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set', 'discard', 'mpath']);
const NUMERIC_GEOMETRY_ATTRIBUTES = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'transform']);
const CSS_REFERENCE_ATTRIBUTES = new Set(['style', 'fill', 'stroke', 'filter', 'clip-path', 'mask', 'cursor', 'marker', 'marker-start', 'marker-mid', 'marker-end']);

export interface SanitizedVectorSvg {
  svgText: string;
  removedActiveElements: number;
  removedExternalReferences: number;
  removedStylesheets: number;
  removedReferencedGeometry: number;
  pathCount: number;
}

/** Parses and strips active or externally linked SVG content before it can be saved or interpreted. */
export function sanitizeVectorSvg(text: string): SanitizedVectorSvg {
  if (new TextEncoder().encode(text).byteLength > MAX_SVG_BYTES) throw new Error('El SVG guardado supera el máximo de 8 MB.');
  if (/<!\s*entity\b/i.test(text)) throw new Error('El SVG contiene entidades XML personalizadas. Expórtalo nuevamente sin entidades definidas por el usuario.');
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (parsed.querySelector('parsererror') || root?.localName.toLowerCase() !== 'svg') {
    throw new Error('El archivo no es un SVG válido. Vuelve a exportarlo e inténtalo de nuevo.');
  }

  assertSvgTreeLimits(root);
  let removedActiveElements = 0;
  let removedStylesheets = 0;
  let removedReferencedGeometry = 0;
  for (const node of Array.from(root.querySelectorAll('*'))) {
    const tag = node.localName.toLowerCase();
    if (!OMIT_TAGS.has(tag)) continue;
    if (tag === 'style') removedStylesheets += 1;
    else if (tag === 'use' || tag === 'image') removedReferencedGeometry += 1;
    else removedActiveElements += 1;
    node.remove();
  }

  let removedExternalReferences = 0;
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const isReferenceAttribute = attribute.localName.toLowerCase() === 'href' || name === 'href' || name === 'xlink:href';
      const isXmlBase = name === 'xml:base' || (attribute.localName.toLowerCase() === 'base' && attribute.namespaceURI === 'http://www.w3.org/XML/1998/namespace');
      const hasExternalReference = isReferenceAttribute && value.length > 0 && !value.startsWith('#');
      const hasExternalUrl = /url\(\s*(?!['"]?#)/i.test(value) || /@import/i.test(value);
      const unsafeCss = CSS_REFERENCE_ATTRIBUTES.has(name) && (value.includes('\\') || /expression\s*\(|-moz-binding|behavior\s*:|javascript:|vbscript:/i.test(value));
      if (isXmlBase || name.startsWith('on') || hasExternalReference || hasExternalUrl || unsafeCss) {
        element.removeAttribute(attribute.name);
        removedExternalReferences += 1;
      }
    }
  }

  const geometry = Array.from(root.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon'));
  if (geometry.length > MAX_VECTOR_PATHS) throw new Error(`El SVG supera el límite de ${MAX_VECTOR_PATHS} piezas geométricas. Agrupa o simplifica el diseño e inténtalo de nuevo.`);
  const tokenPattern = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  let pathTokens = 0;
  for (const path of geometry) {
    const data = `${path.getAttribute('d') ?? ''} ${path.getAttribute('points') ?? ''}`;
    tokenPattern.lastIndex = 0;
    let token: RegExpExecArray | null;
    while ((token = tokenPattern.exec(data))) {
      pathTokens += 1;
      if (pathTokens > MAX_VECTOR_PATH_TOKENS) throw new Error('El SVG supera el límite de complejidad de las rutas. Simplifica los contornos e inténtalo de nuevo.');
      if (!/^[AaCcHhLlMmQqSsTtVvZz]$/.test(token[0])) {
        const value = Number(token[0]);
        if (!Number.isFinite(value) || Math.abs(value) > 1e8) throw new Error('Una coordenada del SVG está fuera de los límites compatibles. Normaliza el vector e inténtalo de nuevo.');
      }
    }
  }

  const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (!NUMERIC_GEOMETRY_ATTRIBUTES.has(attribute.localName.toLowerCase())) continue;
      numberPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = numberPattern.exec(attribute.value))) {
        const value = Number(match[0]);
        if (!Number.isFinite(value) || Math.abs(value) > 1e8) throw new Error('Una coordenada del SVG está fuera de los límites compatibles. Normaliza el vector e inténtalo de nuevo.');
      }
    }
  }

  return {
    svgText: new XMLSerializer().serializeToString(root),
    removedActiveElements,
    removedExternalReferences,
    removedStylesheets,
    removedReferencedGeometry,
    pathCount: geometry.length,
  };
}

function assertSvgTreeLimits(root: Element) {
  const pending: Array<{ element: Element; depth: number }> = [{ element: root, depth: 1 }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    count += 1;
    if (count > MAX_SVG_NODES) throw new Error(`El SVG supera el límite de ${MAX_SVG_NODES.toLocaleString('es-EC')} elementos. Simplifica el archivo.`);
    if (current.depth > MAX_SVG_DEPTH) throw new Error(`El SVG tiene más de ${MAX_SVG_DEPTH} niveles anidados. Reorganiza los grupos e inténtalo de nuevo.`);
    for (const child of Array.from(current.element.children)) pending.push({ element: child, depth: current.depth + 1 });
  }
}
