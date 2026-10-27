import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, CopyPlus, Pencil, X, Check, Eye } from 'lucide-react';
import { ContextMenu, type ContextMenuAction } from '../../../components/ui/ContextMenu';
import { Badge } from '../../../components/ui/OperationalKit';
import { DatePicker } from '../../../components/ui/Calendar';
import './marketing-calendar.css';

export type MarketingCalendarPost = {
  id: string; title: string; status: string; scheduled_date: string; scheduled_time?: string;
  platform?: string; format?: string; owner?: string; content_line?: string; tags?: string[]; calendar_color?: string;
};

type Props = {
  posts: MarketingCalendarPost[];
  canEdit: boolean;
  canDelete: boolean;
  selectedIds: Set<string>;
  onToggle: (postId: string) => void;
  onSelect: (post: MarketingCalendarPost) => void;
  onCreate: (date: string) => void;
  onReschedule: (post: MarketingCalendarPost, date: string) => void;
  onDuplicate: (post: MarketingCalendarPost) => void;
  onDelete: (post: MarketingCalendarPost) => void;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' });
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const statusClass = (post: MarketingCalendarPost) => /publicad/i.test(post.status) ? 'published' : /revisi/i.test(post.status) ? 'review' : /bloque/i.test(post.status) ? 'blocked' : 'active';
const shiftDate = (source: string, days: number) => {
  const [year, month, day] = source.slice(0, 10).split('-').map(Number);
  const shifted = new Date(year, month - 1, day + days, 12);
  return dateKey(shifted);
};
const weekOfMonth = (date: Date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Math.floor((monday.getTime() - first.getTime()) / 604800000) + 1;
};

export function MarketingCalendar({ posts, canEdit, canDelete, selectedIds, onToggle, onSelect, onCreate, onReschedule, onDuplicate, onDelete }: Props) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [dragging, setDragging] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const cells = useMemo(() => {
    if (view === 'week') {
      const start = new Date(anchor); start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [anchor, view]);
  const byDate = useMemo(() => {
    const result = new Map<string, MarketingCalendarPost[]>();
    posts.filter((post) => /^\d{4}-\d{2}-\d{2}/.test(post.scheduled_date || '')).forEach((post) => {
      const key = post.scheduled_date.slice(0, 10);
      result.set(key, [...(result.get(key) || []), post].sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || '')));
    });
    return result;
  }, [posts]);
  const undated = posts.filter((post) => !/^\d{4}-\d{2}-\d{2}/.test(post.scheduled_date || ''));
  const today = dateKey(new Date());
  const move = (amount: number) => setAnchor((current) => view === 'month' ? new Date(current.getFullYear(), current.getMonth() + amount, 1) : new Date(current.getFullYear(), current.getMonth(), current.getDate() + amount * 7));
  const contextualActions = (post: MarketingCalendarPost): ContextMenuAction[] => [
    { kind: 'label', label: 'Publicación', onSelect: () => {} },
    { label: 'Editar ficha', icon: <Pencil size={14}/>, onSelect: () => onSelect(post), disabled: !canEdit },
    { label: 'Duplicar como borrador', icon: <CopyPlus size={14}/>, onSelect: () => onDuplicate(post), disabled: !canEdit },
    ...(canEdit || canDelete ? [{ label: selectedIds.has(post.id) ? 'Quitar de seleccionadas' : 'Seleccionar publicación', icon: <Check size={14}/>, kind: 'checkbox' as const, checked: selectedIds.has(post.id), onSelect: () => {}, onCheckedChange: () => onToggle(post.id), disabled: !(canEdit || canDelete) }] : []),
    { label: 'Ver agenda de esta fecha', icon: <CalendarDays size={14}/>, onSelect: () => setExpandedDate(post.scheduled_date.slice(0, 10)) },
    { label: 'Reprogramar', icon: <CalendarDays size={14}/>, disabled: !canEdit || !post.scheduled_date, onSelect: () => {}, children: [
      { label: 'Un día después', onSelect: () => onReschedule(post, shiftDate(post.scheduled_date, 1)) },
      { label: 'Una semana después', onSelect: () => onReschedule(post, shiftDate(post.scheduled_date, 7)) },
      { label: 'Un día antes', onSelect: () => onReschedule(post, shiftDate(post.scheduled_date, -1)) },
    ] },
    { kind: 'separator', label: '', onSelect: () => {} },
    { label: 'Eliminar publicación', icon: <Trash2 size={14}/>, onSelect: () => onDelete(post), destructive: true, disabled: !canDelete },
  ];
  const dayActions = (date: string): ContextMenuAction[] => [
    { kind: 'label', label: `Calendario · ${date}`, onSelect: () => {} },
    { label: 'Crear publicación en esta fecha', icon: <Plus size={14}/>, onSelect: () => onCreate(date), disabled: !canEdit },
    { label: 'Abrir agenda del día', icon: <Eye size={14}/>, onSelect: () => setExpandedDate(date) },
    { label: 'Ver esta semana', icon: <CalendarDays size={14}/>, onSelect: () => { const [year, month, day] = date.split('-').map(Number); setAnchor(new Date(year, month - 1, day, 12)); setView('week'); setExpandedDate(date); } },
  ];
  const calendarActions: ContextMenuAction[] = [
    { kind: 'label', label: 'Calendario editorial', onSelect: () => {} },
    { label: 'Ir a hoy', icon: <CalendarDays size={14}/>, onSelect: () => { setAnchor(new Date()); setExpandedDate(null); } },
    { label: 'Publicación para esta fecha', icon: <Plus size={14}/>, onSelect: () => onCreate(dateKey(anchor)), disabled: !canEdit },
    { label: 'Vista del calendario', icon: <CalendarDays size={14}/>, onSelect: () => {}, children: [
      { label: 'Mes', kind: 'radio', checked: view === 'month', onSelect: () => { setView('month'); setExpandedDate(null); } },
      { label: 'Semana', kind: 'radio', checked: view === 'week', onSelect: () => { setView('week'); setExpandedDate(null); } },
    ] },
    { label: 'Anterior', onSelect: () => move(-1) },
    { label: 'Siguiente', onSelect: () => move(1) },
  ];

  return <section className={`vc-marketing-calendar is-${view}`} aria-label={`Calendario editorial en vista ${view}`}>
    <header className="vc-marketing-calendar-head">
      <div><span className="eyebrow">PLANIFICACIÓN EDITORIAL</span><h2>{view === 'month' ? monthLabel.format(anchor) : `Semana del ${new Intl.DateTimeFormat('es-EC',{day:'numeric',month:'short'}).format(cells[0])}`}</h2><p>Arrastra una ficha a otra fecha para reprogramarla. Usa clic derecho o ⋯ para sus acciones.</p></div>
      <div className="vc-marketing-calendar-toolbar"><div className="vc-marketing-calendar-view"><button type="button" className={view==='month'?'active':''} aria-pressed={view==='month'} onClick={()=>{setView('month');setExpandedDate(null);}}>Mes</button><button type="button" className={view==='week'?'active':''} aria-pressed={view==='week'} onClick={()=>{setView('week');setExpandedDate(null);}}>Semana</button></div><div className="vc-marketing-calendar-controls"><DatePicker label="Ir a fecha" value={dateKey(anchor)} onChange={(value)=>{if(!value)return;const [year,month,day]=value.split('-').map(Number);setAnchor(new Date(year,month-1,day,12));setExpandedDate(null);}}/><button className="button button-outline" type="button" onClick={()=>{setAnchor(new Date());setExpandedDate(null);}}>Hoy</button><button className="icon-button" type="button" aria-label="Anterior" onClick={()=>move(-1)}><ChevronLeft size={17}/></button><button className="icon-button" type="button" aria-label="Siguiente" onClick={()=>move(1)}><ChevronRight size={17}/></button><ContextMenu className="vc-calendar-toolbar-context" label="Acciones del calendario" actions={calendarActions}><span aria-hidden="true"/></ContextMenu></div></div>
    </header>
    <div className="vc-marketing-calendar-grid" role="grid" aria-label={monthLabel.format(anchor)} style={{'--calendar-cols':8} as React.CSSProperties}>
      <div className="vc-marketing-calendar-weekday vc-marketing-calendar-week-number-heading" role="columnheader" aria-label="Semana del mes">Sem.</div>{weekdays.map((day)=><div key={day} className="vc-marketing-calendar-weekday" role="columnheader">{day}</div>)}
      {cells.map((date,cellIndex)=>{
        const key=dateKey(date), items=byDate.get(key)||[];
        const inMonth=view==='week'||date.getMonth()===anchor.getMonth();
        const firstDateOfRow = cells.slice(cellIndex - (cellIndex % 7), cellIndex - (cellIndex % 7) + 7);
        const monthRepresentative = firstDateOfRow.find((rowDate) => rowDate.getMonth() === anchor.getMonth() && rowDate.getFullYear() === anchor.getFullYear());
        const weekLabel = weekOfMonth(view === 'month' ? monthRepresentative || date : date);
        const maxVisible=view==='week'?12:6;
        const visible=items.slice(0,maxVisible), remaining=items.length-visible.length;
        return <React.Fragment key={key}>{cellIndex % 7 === 0 && <div className="vc-marketing-calendar-week-number" role="rowheader" aria-label={`Semana ${weekLabel}`}>{weekLabel}</div>}<ContextMenu displayContents trigger={false} className="vc-calendar-day-scope" label={`Acciones del ${key}`} actions={dayActions(key)}><div role="gridcell" aria-label={`${key}, ${items.length} publicaciones`} className={`vc-marketing-calendar-day${inMonth?'':' is-outside'}${key===today?' is-today':''}${dragging?' can-drop':''}${expandedDate===key?' is-expanded':''}`} style={{'--calendar-day-index':cellIndex} as React.CSSProperties}
          onDragOver={(event)=>{if(canEdit&&dragging)event.preventDefault();}}
          onDrop={(event)=>{event.preventDefault();const post=posts.find((item)=>item.id===(event.dataTransfer.getData('text/plain')||dragging));if(post&&post.scheduled_date.slice(0,10)!==key)onReschedule(post,key);setDragging(null);}}
          onDragLeave={(event)=>{if(!event.currentTarget.contains(event.relatedTarget as Node))event.currentTarget.classList.remove('is-drop-target');}}
          onDragEnter={(event)=>{if(dragging)event.currentTarget.classList.add('is-drop-target');}}>
          <div className="vc-marketing-calendar-day-head"><span>{date.getDate()}</span>{items.length>0&&<button type="button" className="vc-marketing-calendar-day-agenda-toggle" aria-label={`Abrir agenda del ${key}`} onClick={()=>setExpandedDate(expandedDate===key?null:key)}>{items.length}</button>}{canEdit&&<button type="button" aria-label={`Crear publicación el ${key}`} onClick={()=>onCreate(key)}><Plus size={13}/></button>}</div>
          <div className="vc-marketing-calendar-events">{visible.map((post)=>{
            const color=post.calendar_color||'';
            return <div className="vc-marketing-event-row" key={post.id}>
              {(canEdit||canDelete)&&<input className="vc-marketing-event-select" type="checkbox" aria-label={`Seleccionar ${post.title}`} checked={selectedIds.has(post.id)} onChange={()=>onToggle(post.id)}/>}
              <ContextMenu className="vc-marketing-event-context" label={`Acciones para ${post.title}`} actions={contextualActions(post)}>
                <button type="button" draggable={canEdit} onDragStart={(event)=>{event.dataTransfer.setData('text/plain',post.id);event.dataTransfer.effectAllowed='move';setDragging(post.id);}} onDragEnd={()=>setDragging(null)} onClick={()=>onSelect(post)} className={`vc-marketing-calendar-event tone-${statusClass(post)}`} style={color?{'--event-color':color,'--event-tint':`${color}18`} as React.CSSProperties:undefined} title={`${post.title} · ${post.status}${post.tags?.length?` · ${post.tags.join(', ')}`:''}`}>
                  {post.scheduled_time&&<time>{post.scheduled_time}</time>}<span>{post.title||'Sin título'}</span>{post.tags?.length>0&&<Badge color={color||undefined} title={`Etiquetas: ${post.tags.join(', ')}`}>{post.tags[0]}</Badge>}
                </button>
              </ContextMenu>
            </div>;
          })}{remaining>0&&<button type="button" className="vc-marketing-calendar-more" onClick={()=>setExpandedDate(expandedDate===key?null:key)}>+{remaining} más · ver agenda</button>}</div>
        </div></ContextMenu></React.Fragment>;
      })}
    </div>
    {expandedDate&&<section className="vc-marketing-day-agenda" aria-label={`Agenda del ${expandedDate}`}><header><div><span className="eyebrow">AGENDA DEL DÍA</span><b>{new Intl.DateTimeFormat('es-EC',{dateStyle:'full'}).format(new Date(`${expandedDate}T12:00:00`))} · {(byDate.get(expandedDate)||[]).length} publicaciones</b></div><button type="button" className="icon-button" aria-label="Cerrar agenda" onClick={()=>setExpandedDate(null)}><X size={15}/></button></header>{(byDate.get(expandedDate)||[]).map((post)=><article key={post.id}><span className="vc-marketing-agenda-time">{post.scheduled_time||'Sin hora'}</span><button type="button" className="vc-marketing-agenda-title" onClick={()=>onSelect(post)}><b>{post.title}</b><small>{post.platform||'Canal pendiente'} · {post.status}{post.tags?.length?` · ${post.tags.join(', ')}`:''}</small></button><ContextMenu label={`Acciones para ${post.title}`} actions={contextualActions(post)}><span/></ContextMenu></article>)}{canEdit&&<button type="button" className="button button-outline" onClick={()=>onCreate(expandedDate)}><Plus size={14}/>Crear publicación</button>}</section>}
    <footer className="vc-marketing-calendar-foot"><span><i className="tone-active"/>Planificada</span><span><i className="tone-review"/>En revisión</span><span><i className="tone-published"/>Publicada</span><span><i className="tone-blocked"/>Bloqueada</span>{undated.length>0&&<span className="vc-marketing-undated">{undated.length} sin fecha asignada</span>}</footer>
  </section>;
}
