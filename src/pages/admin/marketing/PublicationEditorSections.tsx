import { useState, type CSSProperties } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, CopyCheck, MessageSquareText, Target } from 'lucide-react';
import { MARKETING_COLORS } from './marketingColors';
import './publication-editor-sections.css';

export type PublicationDraft = {
  title: string;
  content_line: string;
  platform: string;
  format: string;
  scheduled_date: string;
  scheduled_time: string;
  owner: string;
  status: string;
  caption: string;
  next_action: string;
  due_date: string;
  objective: string;
  audience: string;
  offer: string;
  call_in: string;
  callout: string;
  cta: string;
  cta_destination: string;
  external_url: string;
  hashtags: string;
  visual_direction: string;
  tags: string;
  calendar_color: string;
};

type HistoryEvent = { id: string; field_name: string; previous_value: string; new_value: string; created_at: string };
type ChecklistItem = readonly [string, string];
export type PublicationEditorTab = 'plan' | 'copy' | 'production';

type Props = {
  draft: PublicationDraft;
  onChange: (field: keyof PublicationDraft, value: string) => void;
  canEdit: boolean;
  isNew: boolean;
  activeTab: PublicationEditorTab;
  onTabChange: (tab: PublicationEditorTab) => void;
  selectedPost?: Record<string, any> | null;
  checklistFields: readonly ChecklistItem[];
  events: HistoryEvent[];
  formatDate: (value?: string) => string;
  knownTags?: string[];
};

type PublicationFieldProps = {
  draft: PublicationDraft;
  onChange: Props['onChange'];
  name: keyof PublicationDraft;
  label: string;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  wide?: boolean;
  rows?: number;
};

function PublicationField({ draft, onChange, name, label, hint, placeholder, multiline = false, wide = false, rows = 3 }: PublicationFieldProps) {
  const maxLength = name === 'caption' ? 5000 : ['offer','call_in','callout','hashtags'].includes(name) ? 1200 : name === 'visual_direction' ? 1500 : name === 'cta_destination' ? 300 : 500;
  return <label className={`vc-publication-field${wide ? ' is-wide' : ''}`}>
    <span>{label}</span>
    {hint && <small>{hint}</small>}
    {multiline
      ? <textarea rows={rows} value={draft[name]} onChange={(event) => onChange(name, event.target.value)} placeholder={placeholder} maxLength={maxLength}/>
      : <input type={name === 'due_date' ? 'date' : name === 'external_url' ? 'url' : 'text'} value={draft[name]} onChange={(event) => onChange(name, event.target.value)} placeholder={placeholder} maxLength={maxLength}/>}
  </label>;
}

const tabs = [
  { id: 'plan', label: 'Plan', icon: CalendarDays, hint: 'Canal, fecha y objetivo' },
  { id: 'copy', label: 'Mensaje', icon: MessageSquareText, hint: 'Gancho, beneficio y acción' },
  { id: 'production', label: 'Producción', icon: ClipboardList, hint: 'Tareas y revisión' },
] as const;

export const DEFAULT_MARKETING_TAGS = ['Campaña','Producto','Proceso','Educativo','Temporada','Promoción','Marca','Pendiente'];

function TagPicker({ value, onChange, calendarColor, onCalendarColorChange, knownTags = [], disabled }: { value: string; onChange: (value: string) => void; calendarColor: string; onCalendarColorChange: (value: string) => void; knownTags?: string[]; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
  const add = (next: string) => {
    const clean = next.trim().replace(/^#/, '');
    if (clean && !tags.some((tag) => tag.toLocaleLowerCase('es') === clean.toLocaleLowerCase('es'))) onChange([...tags, clean].join(', '));
    setDraft('');
  };
  const suggestions = [...new Set([...DEFAULT_MARKETING_TAGS, ...knownTags])].filter((tag) => !tags.some((selected) => selected.toLocaleLowerCase('es') === tag.toLocaleLowerCase('es')));
  return <section className="vc-marketing-tags-editor is-wide" aria-label="Etiquetas y color de calendario">
    <div><b>Etiquetas</b><small>Elige una sugerida o crea una personalizada. Sirven para filtrar las fichas.</small></div>
    <div className="vc-marketing-tag-chips">{tags.map((tag, index) => <button type="button" key={tag} disabled={disabled} onClick={() => onChange(tags.filter((item) => item !== tag).join(', '))} title={`Quitar ${tag}`} style={{ '--tag-color': MARKETING_COLORS[index % MARKETING_COLORS.length] } as CSSProperties}>{tag}<span aria-hidden="true">×</span></button>)}</div>
    <div className="vc-marketing-tag-add"><input disabled={disabled} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(draft); } }} placeholder="Escribe un tag y pulsa Enter"/><button type="button" disabled={disabled || !draft.trim()} onClick={() => add(draft)}>Crear tag</button></div>
    {!!suggestions.length && <div className="vc-marketing-tag-suggestions">{suggestions.slice(0, 16).map((tag) => <button type="button" disabled={disabled} key={tag} onClick={() => add(tag)}>+ {tag}</button>)}</div>}
    <div className="vc-marketing-color-picker"><b>Color en calendario</b><span>Color personalizado para localizarla de un vistazo.</span><div>{MARKETING_COLORS.map((color) => <button type="button" key={color} aria-label={`Usar color ${color}`} aria-pressed={calendarColor === color} disabled={disabled} style={{ '--tag-color': color } as CSSProperties} onClick={() => onCalendarColorChange(calendarColor === color ? '' : color)}/>)}</div></div>
  </section>;
}

export function PublicationEditorSections({ draft, onChange, canEdit, isNew, activeTab, onTabChange, selectedPost, checklistFields, events, formatDate, knownTags }: Props) {
  return <>
    <nav className="vc-publication-steps" aria-label="Secciones de la ficha de publicación">
      {tabs.map(({ id, label, icon: Icon, hint }, index) => <button key={id} type="button" className={activeTab === id ? 'is-active' : ''} aria-current={activeTab === id ? 'step' : undefined} onClick={() => onTabChange(id)}>
        <span className="vc-publication-step-number">{activeTab === id ? <Icon size={15}/> : index + 1}</span><span><b>{label}</b><small>{hint}</small></span>
      </button>)}
    </nav>

    <fieldset className="vc-post-form-fieldset vc-publication-fieldset" disabled={!canEdit}>
      {activeTab === 'plan' && <div className="vc-post-form-grid vc-publication-grid">
        <label className="vc-publication-field is-wide"><span>Título de la publicación</span><input required autoFocus value={draft.title} onChange={(event) => onChange('title', event.target.value)} placeholder="Ej.: Presentación del servicio de impresión" maxLength={180}/></label>
        <label className="vc-publication-field"><span>Canal</span><select value={draft.platform} onChange={(event) => onChange('platform', event.target.value)}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>WhatsApp</option><option>LinkedIn</option><option>Multicanal</option><option>Por definir</option></select></label>
        <label className="vc-publication-field"><span>Formato</span><select value={draft.format} onChange={(event) => onChange('format', event.target.value)}><option>Post</option><option>Historia</option><option>Carrusel</option><option>Reel</option><option>Video</option><option>Diseño</option><option>Por definir</option></select></label>
        <label className="vc-publication-field"><span>Fecha de publicación</span><input type="date" value={draft.scheduled_date} onChange={(event) => onChange('scheduled_date', event.target.value)}/></label>
        <label className="vc-publication-field"><span>Hora</span><input type="time" value={draft.scheduled_time} onChange={(event) => onChange('scheduled_time', event.target.value)}/></label>
        <label className="vc-publication-field"><span>Responsable</span><input value={draft.owner} onChange={(event) => onChange('owner', event.target.value)} placeholder="Por asignar" maxLength={120}/></label>
        <label className="vc-publication-field"><span>Etapa</span><select value={draft.status} onChange={(event) => onChange('status', event.target.value)}>{[...new Set(['Por iniciar','En diseño','En revisión','Aprobada','Programada','Publicada','Bloqueada',draft.status])].map((status) => <option key={status}>{status}</option>)}</select></label>
        <PublicationField draft={draft} onChange={onChange} name="content_line" label="Tema o línea de contenido" hint="Resume de qué trata la pieza." placeholder="Qué queremos comunicar" wide/>
        <TagPicker value={draft.tags} onChange={(value) => onChange('tags', value)} calendarColor={draft.calendar_color} onCalendarColorChange={(value) => onChange('calendar_color', value)} knownTags={knownTags} disabled={!canEdit}/>
        <PublicationField draft={draft} onChange={onChange} name="objective" label="Objetivo" hint="¿Qué debería lograr esta publicación?" placeholder="Informar, atraer consultas, mostrar un proceso…"/>
        <PublicationField draft={draft} onChange={onChange} name="audience" label="Audiencia" hint="¿A quién queremos llegar?" placeholder="Audiencia o segmento por definir"/>
      </div>}

      {activeTab === 'copy' && <div className="vc-publication-copy-layout">
        <section className="vc-publication-copy-fields" aria-label="Componentes del mensaje">
          <div className="vc-publication-section-heading"><span className="vc-publication-heading-icon"><Target size={16}/></span><div><b>Construye el mensaje por partes</b><small>Los campos son opcionales. Usa solo los que ayuden a comunicar la idea.</small></div></div>
          <div className="vc-post-form-grid vc-publication-grid">
            <PublicationField draft={draft} onChange={onChange} name="call_in" label="Call-in · frase de entrada" hint="Abre con una pregunta, tensión o idea que detenga el scroll." placeholder="La primera frase que capta atención" wide/>
            <PublicationField draft={draft} onChange={onChange} name="offer" label="Oferta o tema central" hint="Beneficio, servicio o propuesta; deja pendiente lo que falte confirmar." placeholder="Qué ofrecemos o queremos destacar" wide/>
            <PublicationField draft={draft} onChange={onChange} name="callout" label="Call-out · beneficio o respaldo" hint="La razón concreta que sostiene el mensaje: característica, prueba o detalle confirmado." placeholder="Qué valor debe recordar la audiencia" wide/>
            <PublicationField draft={draft} onChange={onChange} name="caption" label="Caption · texto completo" hint="Versión corrida para revisar, copiar y adaptar al canal." placeholder="Desarrolla la idea en el tono y extensión adecuados." multiline wide rows={5}/>
            <div className="vc-publication-cta-block">
              <div className="vc-publication-section-heading"><span className="vc-publication-heading-icon is-cta"><CopyCheck size={16}/></span><div><b>Acción para la audiencia (CTA)</b><small>Indica qué hacer y a dónde dirigir esa acción.</small></div></div>
              <div className="vc-post-form-grid vc-publication-grid"><PublicationField draft={draft} onChange={onChange} name="cta" label="Texto del CTA" placeholder="Escríbenos, cotiza, agenda…"/><PublicationField draft={draft} onChange={onChange} name="cta_destination" label="Destino o canal de respuesta" placeholder="WhatsApp, DM, web, llamada…"/><PublicationField draft={draft} onChange={onChange} name="external_url" label="Enlace de destino" hint="Opcional. Solo agrega una URL confirmada." placeholder="https://…" wide/></div>
            </div>
            <PublicationField draft={draft} onChange={onChange} name="hashtags" label="Hashtags" hint="Sepáralos con espacios. No se agregan automáticamente al caption." placeholder="#VisualCorp #Impresión" wide/>
            <PublicationField draft={draft} onChange={onChange} name="visual_direction" label="Notas para arte o producción" hint="Referencias, jerarquía, formato visual o elementos por resolver." placeholder="Pendiente de definir por el equipo" multiline wide rows={3}/>
          </div>
        </section>
        <aside className="vc-publication-copy-preview" aria-label="Vista previa de la estructura del mensaje">
          <span className="eyebrow">ESTRUCTURA DEL MENSAJE</span><h3>De la atención a la acción</h3>
          <ol><li><i>1</i><div><small>ENTRADA</small><p>{draft.call_in || 'Agrega una frase que capte atención'}</p></div></li><li><i>2</i><div><small>BENEFICIO O RESPALDO</small><p>{draft.callout || draft.offer || 'Explica el valor o motivo para creer'}</p></div></li><li><i>3</i><div><small>ACCIÓN</small><p>{draft.cta || 'Indica qué quieres que haga la persona'}</p></div></li></ol>
          <small className="vc-publication-preview-note">Vista de estructura para el equipo. No publica ni completa datos por sí sola.</small>
        </aside>
      </div>}

      {activeTab === 'production' && <div className="vc-post-form-grid vc-publication-grid">
        <PublicationField draft={draft} onChange={onChange} name="next_action" label="Siguiente paso" hint="Una acción concreta que desbloquee el trabajo." placeholder="Acción pendiente"/>
        <PublicationField draft={draft} onChange={onChange} name="due_date" label="Fecha límite"/>
        {!isNew && selectedPost && <div className="vc-post-checklist is-production-checklist is-wide"><div className="vc-publication-section-heading"><span className="vc-publication-heading-icon"><CheckCircle2 size={16}/></span><div><b>Revisión de entregables</b><small>Estado importado del checklist; “Por confirmar” requiere revisión del equipo.</small></div></div><div>{checklistFields.map(([field,label]) => <span key={field}><i className={/complet|aprob|listo|hecho/i.test(selectedPost[field] || '') ? 'is-done' : ''}/>{label}<small>{selectedPost[field] || 'Por confirmar'}</small></span>)}</div></div>}
        {events.length > 0 && <div className="vc-post-checklist is-wide"><span className="eyebrow">ACTIVIDAD RECIENTE</span><p>{events.slice(0, 5).map((entry) => <span key={entry.id}>{entry.field_name}: {entry.previous_value || 'vacío'} → {entry.new_value} · {formatDate(String(entry.created_at).slice(0,10))}</span>)}</p></div>}
        <div className="vc-publication-production-note is-wide"><CheckCircle2 size={16}/><p><b>El estado describe el flujo interno.</b><br/>Marcar una pieza como aprobada o publicada no la envía a redes; conserva esa etapa hasta que la persona responsable confirme el avance.</p></div>
      </div>}
    </fieldset>
  </>;
}
