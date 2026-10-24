import type { ReactNode } from 'react';
import './public-site-v2.css';
import './glass-system.css';

function safeHref(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    if (value.startsWith('**')) nodes.push(<strong key={`${keyPrefix}-${index}`}>{value.slice(2, -2)}</strong>);
    else if (value.startsWith('*')) nodes.push(<em key={`${keyPrefix}-${index}`}>{value.slice(1, -1)}</em>);
    else {
      const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeHref(link[2]) : undefined;
      nodes.push(href && link ? <a key={`${keyPrefix}-${index}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>{link[1]}</a> : link?.[1] || value);
    }
    cursor = index + value.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function ArticleMarkdown({ value }: { value: string }) {
  const blocks = value.split(/\r?\n\s*\r?\n/).map((block) => block.trim()).filter(Boolean);
  return <div className="article-markdown">{blocks.map((block, index) => {
    const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const url = image ? safeHref(image[2]) : undefined;
    if (image && url) return <figure key={index}><img src={url} alt={image[1]}/>{image[1] && <figcaption>{image[1]}</figcaption>}</figure>;
    if (/^(---|\*\*\*)$/.test(block)) return <hr key={index}/>;
    if (/^>\s?/.test(block)) return <blockquote key={index}>{block.replace(/^>\s?/gm, '').split(/\r?\n/).map((line, lineIndex) => <span key={lineIndex}>{inline(line, `${index}-${lineIndex}`)}</span>)}</blockquote>;
    if (/^#{1,4}\s/.test(block)) {
      const level = Math.min(3, (block.match(/^#+/)?.[0].length || 2));
      const Heading = level === 1 ? 'h2' : level === 2 ? 'h2' : 'h3';
      return <Heading key={index}>{inline(block.replace(/^#{1,4}\s+/, ''), `${index}`)}</Heading>;
    }
    if (/^(\* |\- |\d+\. )/.test(block)) {
      const lines = block.split(/\r?\n/);
      const ordered = /^\d+\. /.test(lines[0]);
      const List = ordered ? 'ol' : 'ul';
      return <List key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{inline(line.replace(/^(\* |\- |\d+\. )/, ''), `${index}-${lineIndex}`)}</li>)}</List>;
    }
    return <p key={index}>{block.split(/\r?\n/).map((line, lineIndex, lines) => <span key={lineIndex}>{inline(line, `${index}-${lineIndex}`)}{lineIndex < lines.length - 1 && <br/>}</span>)}</p>;
  })}</div>;
}

export function ArticlePreview({ title, excerpt, cover, body, kind }: { title: string; excerpt: string; cover: string; body: string; kind: 'blog' | 'publicaciones' | 'portafolio' }) {
  const kindLabel = kind === 'publicaciones' ? 'PUBLICACIÓN' : kind === 'portafolio' ? 'PORTAFOLIO VISUAL CORP' : 'BLOG VISUAL CORP';
  const safeCover = cover ? safeHref(cover) : undefined;
  return <div className="public-site site-content-live-preview"><header className="article-hero"><span className="site-eyebrow light"><i/>{kindLabel}</span><h1>{title || 'El título aparecerá aquí'}</h1>{excerpt && <p>{excerpt}</p>}</header><article className="article-body glass-card">{safeCover && <img className="article-cover" src={safeCover} alt=""/>}<ArticleMarkdown value={body}/></article></div>;
}
