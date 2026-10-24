import { useEffect, useRef, useState } from 'react';
import { AlignLeft, ArrowDown, ArrowUp, Image, Link2, List, Minus, Plus, Quote, Trash2, Type } from 'lucide-react';

type BlockType = 'heading' | 'paragraph' | 'image' | 'quote' | 'divider' | 'list' | 'link';
type ContentBlock = { id: string; type: BlockType; content: string; url?: string; level?: number; ordered?: boolean };
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function parseMarkdown(markdown: string): ContentBlock[] {
  return markdown.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part): ContentBlock => {
    if (/^#{1,4}\s/.test(part)) return { id: makeId(), type: 'heading', content: part.replace(/^#{1,4}\s+/, ''), level: Math.max(2, Math.min(3, (part.match(/^#+/)?.[0].length || 2))) };
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(part)) { const match = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/); return { id: makeId(), type: 'image', content: match?.[1] || '', url: match?.[2] || '' }; }
    if (/^>\s?/.test(part)) return { id: makeId(), type: 'quote', content: part.replace(/^>\s?/gm, '') };
    if (/^(---|\*\*\*)$/.test(part)) return { id: makeId(), type: 'divider', content: '' };
    if (/^(\* |\- |\d+\. )/.test(part)) return { id: makeId(), type: 'list', content: part.replace(/^(\* |\- |\d+\. )/gm, ''), ordered: /^\d+\. /.test(part) };
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return { id: makeId(), type: 'link', content: link[1], url: link[2] };
    return { id: makeId(), type: 'paragraph', content: part };
  });
}
function serializeMarkdown(blocks: ContentBlock[]) {
  return blocks.map((block) => {
    if (block.type === 'heading') return `${'#'.repeat(block.level || 2)} ${block.content.trim()}`;
    if (block.type === 'image') return block.url.trim() ? `![${block.content.trim()}](${block.url.trim()})` : '';
    if (block.type === 'quote') return block.content.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
    if (block.type === 'divider') return '---';
    if (block.type === 'list') return block.content.split(/\r?\n/).filter(Boolean).map((line, index) => block.ordered ? `${index + 1}. ${line}` : `- ${line}`).join('\n');
    if (block.type === 'link') return block.url?.trim() ? `[${block.content.trim() || 'Abrir enlace'}](${block.url.trim()})` : '';
    return block.content.trim();
  }).filter(Boolean).join('\n\n');
}
const blockTypes: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: 'heading', label: 'Título', icon: Type }, { type: 'paragraph', label: 'Texto', icon: AlignLeft },
  { type: 'image', label: 'Imagen', icon: Image }, { type: 'quote', label: 'Cita', icon: Quote }, { type: 'list', label: 'Lista', icon: List }, { type: 'link', label: 'Enlace', icon: Link2 }, { type: 'divider', label: 'Separador', icon: Minus },
];

export function MarkdownBlockEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => parseMarkdown(value));
  const lastSerialized = useRef(value);
  useEffect(() => {
    if (value === lastSerialized.current) return;
    lastSerialized.current = value;
    setBlocks(parseMarkdown(value));
  }, [value]);
  const change = (next: ContentBlock[]) => { const serialized = serializeMarkdown(next); lastSerialized.current = serialized; setBlocks(next); onChange(serialized); };
  const add = (type: BlockType) => change([...blocks, { id: makeId(), type, content: type === 'divider' ? '' : '', ...(type === 'image' ? { url: '' } : {}) }]);
  const update = (id: string, fields: Partial<ContentBlock>) => change(blocks.map((block) => block.id === id ? { ...block, ...fields } : block));
  const move = (index: number, delta: -1 | 1) => { const target = index + delta; if (target < 0 || target >= blocks.length) return; const next = [...blocks]; [next[index], next[target]] = [next[target], next[index]]; change(next); };
  return <div className="markdown-block-editor">
    <div className="markdown-block-toolbar" aria-label="Añadir bloque">{blockTypes.map(({ type, label, icon: Icon }) => <button key={type} type="button" onClick={() => add(type)}><Icon size={14}/><span>{label}</span><Plus size={12}/></button>)}</div>
    {blocks.length === 0 && <div className="empty-state">Empieza con un título, un párrafo o una imagen.</div>}
    <div className="markdown-block-list">{blocks.map((block, index) => {
      const label = blockTypes.find((item) => item.type === block.type)?.label || 'Bloque';
      return <section className="markdown-block" key={block.id}>
        <header><span>{index + 1} · {label}</span><div><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Mover bloque arriba"><ArrowUp size={14}/></button><button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label="Mover bloque abajo"><ArrowDown size={14}/></button><button type="button" onClick={() => change(blocks.filter((item) => item.id !== block.id))} aria-label="Eliminar bloque"><Trash2 size={14}/></button></div></header>
        {block.type === 'heading' && <div className="markdown-heading-fields"><select aria-label="Nivel del título" value={block.level || 2} onChange={(event) => update(block.id, { level: Number(event.target.value) })}><option value={2}>Título de sección</option><option value={3}>Subtítulo</option></select><input aria-label="Texto del título" value={block.content} onChange={(event) => update(block.id, { content: event.target.value })} placeholder="Título de sección"/></div>}
        {block.type === 'paragraph' && <textarea aria-label="Texto del párrafo" rows={4} value={block.content} onChange={(event) => update(block.id, { content: event.target.value })} placeholder="Escribe el contenido del párrafo"/>}
        {block.type === 'quote' && <textarea aria-label="Texto de la cita" rows={3} value={block.content} onChange={(event) => update(block.id, { content: event.target.value })} placeholder="Escribe la cita"/>}
        {block.type === 'list' && <><select aria-label="Tipo de lista" value={block.ordered ? 'ordered' : 'unordered'} onChange={(event) => update(block.id, { ordered: event.target.value === 'ordered' })}><option value="unordered">Viñetas</option><option value="ordered">Numerada</option></select><textarea aria-label="Elementos de la lista" rows={4} value={block.content} onChange={(event) => update(block.id, { content: event.target.value })} placeholder={'Un elemento por línea'}/></>}
        {block.type === 'link' && <div className="markdown-heading-fields"><input aria-label="Texto del enlace" value={block.content} onChange={(event) => update(block.id, { content: event.target.value })} placeholder="Texto visible"/><input aria-label="Destino del enlace" type="url" value={block.url || ''} onChange={(event) => update(block.id, { url: event.target.value })} placeholder="https://…"/></div>}
        {block.type === 'image' && <div className="markdown-image-fields"><input aria-label="URL de la imagen" type="url" value={block.url || ''} onChange={(event) => update(block.id, { url: event.target.value })} placeholder="URL de imagen https://…"/><input aria-label="Texto alternativo de la imagen" value={block.content} onChange={(event) => update(block.id, { content: event.target.value })} placeholder="Texto alternativo"/>{block.url && <img src={block.url} alt="Vista previa" loading="lazy"/>}</div>}
        {block.type === 'divider' && <p className="markdown-divider-preview">Separador visual</p>}
      </section>;
    })}</div>
  </div>;
}
