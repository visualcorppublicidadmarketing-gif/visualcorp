const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEMPLATE', 'META', 'BASE', 'LINK']);
const allowedStyleProperties = new Set(['color', 'background-color', 'font-family', 'font-size', 'text-align', 'list-style-type']);

function safeLink(value: string) {
  const raw = value.trim();
  if (!raw || raw.startsWith('//')) return raw.startsWith('//') ? `https:${raw}` : null;
  if (raw.startsWith('/') || raw.startsWith('#')) return raw;
  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(candidate.protocol) ? candidate.href : null;
  } catch {
    return null;
  }
}

function safeImage(value: string) {
  const raw = value.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  const href = safeLink(raw);
  if (!href) return null;
  try {
    const url = new URL(href, typeof document === 'undefined' ? 'https://visualcorp.local' : document.baseURI);
    return ['http:', 'https:'].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

function cleanStyle(element: HTMLElement) {
  const declarations: string[] = [];
  for (const property of allowedStyleProperties) {
    const value = element.style.getPropertyValue(property).trim();
    if (!value || /url\s*\(|expression\s*\(|[<>]/i.test(value)) continue;
    if (property === 'text-align' && !['left', 'center', 'right', 'justify'].includes(value)) continue;
    if (property === 'font-size' && !/^\d{1,3}(?:\.\d+)?(?:px|pt|em|rem|%)$/.test(value)) continue;
    if (property === 'list-style-type' && !/^(decimal|lower-alpha|upper-alpha|lower-roman|upper-roman|lower-greek|disc|circle|square)$/.test(value)) continue;
    declarations.push(`${property}:${value}`);
  }
  return declarations.join(';');
}

/** Sanitizes imported/pasted rich HTML before Tiptap parses it into the shared schema. */
export function sanitizeRichTextHtml(html: string | null | undefined) {
  const source = String(html || '');
  if (!source) return '<p></p>';
  if (typeof DOMParser === 'undefined') {
    const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`;
  }
  const documentValue = new DOMParser().parseFromString(source, 'text/html');
  documentValue.querySelectorAll('*').forEach((node) => {
    if (dangerousTags.has(node.tagName)) {
      node.remove();
      return;
    }
    const element = node as HTMLElement;
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
        element.removeAttribute(attribute.name);
      } else if (name === 'href') {
        const value = safeLink(attribute.value);
        if (value) element.setAttribute('href', value);
        else element.removeAttribute('href');
      } else if (name === 'src') {
        const value = safeImage(attribute.value);
        if (value) element.setAttribute('src', value);
        else element.removeAttribute('src');
      } else if (name === 'style') {
        const value = cleanStyle(element);
        if (value) element.setAttribute('style', value);
        else element.removeAttribute('style');
      } else if (!['alt', 'title', 'width', 'height', 'start', 'colspan', 'rowspan', 'scope'].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === 'IMG' && !element.getAttribute('src')) element.remove();
  });
  return documentValue.body.innerHTML.trim() || '<p></p>';
}
