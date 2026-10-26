import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import './marketing-calendar.css';

export type MarketingCalendarPost = {
  id: string; title: string; status: string; scheduled_date: string; scheduled_time?: string;
  platform?: string; format?: string; owner?: string; content_line?: string;
};

type Props = {
  posts: MarketingCalendarPost[];
  canEdit: boolean;
  onSelect: (post: MarketingCalendarPost) => void;
  onCreate: (date: string) => void;
  onReschedule: (post: MarketingCalendarPost, date: string) => void;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' });
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function MarketingCalendar({ posts, canEdit, onSelect, onCreate, onReschedule }: Props) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [dragging, setDragging] = useState<string | null>(null);
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [month]);
  const byDate = useMemo(() => {
    const result = new Map<string, MarketingCalendarPost[]>();
    posts.filter((post) => /^\d{4}-\d{2}-\d{2}/.test(post.scheduled_date || '')).forEach((post) => {
      const key = post.scheduled_date.slice(0, 10);
      result.set(key, [...(result.get(key) || []), post]);
    });
    return result;
  }, [posts]);
  const undated = posts.filter((post) => !/^\d{4}-\d{2}-\d{2}/.test(post.scheduled_date || ''));
  const today = dateKey(new Date());

  return <section className="vc-marketing-calendar" aria-label="Calendario editorial mensual">
    <header className="vc-marketing-calendar-head">
      <div><span className="eyebrow">PLANIFICACIÓN EDITORIAL</span><h2>{monthLabel.format(month)}</h2><p>Selecciona un día para crear una publicación. Arrastra una ficha a otra fecha para reprogramarla.</p></div>
      <div className="vc-marketing-calendar-controls">
        <button className="button button-outline" type="button" onClick={() => setMonth(new Date())}>Hoy</button>
        <button className="icon-button" type="button" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17}/></button>
        <button className="icon-button" type="button" aria-label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17}/></button>
      </div>
    </header>
    <div className="vc-marketing-calendar-grid" role="grid" aria-label={monthLabel.format(month)}>
      {weekdays.map((day) => <div key={day} className="vc-marketing-calendar-weekday" role="columnheader">{day}</div>)}
      {cells.map((date) => {
        const key = dateKey(date);
        const items = byDate.get(key) || [];
        const inMonth = date.getMonth() === month.getMonth();
        return <div key={key} role="gridcell" aria-label={`${key}, ${items.length} publicaciones`} className={`vc-marketing-calendar-day${inMonth ? '' : ' is-outside'}${key === today ? ' is-today' : ''}${dragging ? ' can-drop' : ''}`}
          onDragOver={(event) => { if (canEdit && dragging) event.preventDefault(); }}
          onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('is-drop-target'); const post = posts.find((item) => item.id === (event.dataTransfer.getData('text/plain') || dragging)); if (post && post.scheduled_date.slice(0, 10) !== key) onReschedule(post, key); setDragging(null); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.classList.remove('is-drop-target'); }}
          onDragEnter={(event) => { if (dragging) event.currentTarget.classList.add('is-drop-target'); }}
          onClick={() => { if (canEdit) onCreate(key); }}>
          <div className="vc-marketing-calendar-day-head"><span>{date.getDate()}</span>{canEdit && <button type="button" aria-label={`Crear publicación el ${key}`} onClick={(event) => { event.stopPropagation(); onCreate(key); }}><Plus size={13}/></button>}</div>
          <div className="vc-marketing-calendar-events">{items.slice(0, 3).map((post) => <button key={post.id} type="button" draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData('text/plain', post.id); event.dataTransfer.effectAllowed = 'move'; setDragging(post.id); }} onDragEnd={() => setDragging(null)} onClick={(event) => { event.stopPropagation(); onSelect(post); }} className={`vc-marketing-calendar-event tone-${/publicad/i.test(post.status) ? 'published' : /revisi/i.test(post.status) ? 'review' : /bloque/i.test(post.status) ? 'blocked' : 'active'}`} title={`${post.title} · ${post.status}${post.scheduled_time ? ` · ${post.scheduled_time}` : ''}`}>
            {post.scheduled_time && <time>{post.scheduled_time}</time>}<span>{post.title || 'Sin título'}</span>
          </button>)}{items.length > 3 && <span className="vc-marketing-calendar-more">+{items.length - 3} más</span>}</div>
        </div>;
      })}
    </div>
    <footer className="vc-marketing-calendar-foot"><span><i className="tone-active"/>Planificada</span><span><i className="tone-review"/>En revisión</span><span><i className="tone-published"/>Publicada</span><span><i className="tone-blocked"/>Bloqueada</span>{undated.length > 0 && <span className="vc-marketing-undated">{undated.length} sin fecha asignada</span>}</footer>
  </section>;
}
