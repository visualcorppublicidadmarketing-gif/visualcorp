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
  design_ready: boolean;
  video_ready: boolean;
  canvas_width: string;
  canvas_height: string;
};

type HistoryEvent = { id: string; field_name: string; previous_value: string; new_value: string; created_at: string };
type ChecklistItem = readonly [string, string];
export type PublicationEditorTab = 'plan' | 'copy' | 'production';

type Props = {
  draft: PublicationDraft;
  onChange: (field: keyof PublicationDraft, value: string | boolean) => void;
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
      ? <textarea rows={rows} value={String(draft[name] ?? '')} onChange={(event) => onChange(name, event.target.value)} placeholder={placeholder} maxLength={maxLength}/>
      : <input type={name === 'due_date' ? 'date' : name === 'external_url' ? 'url' : 'text'} value={String(draft[name] ?? '')} onChange={(event) => onChange(name, event.target.value)} placeholder={placeholder} maxLength={maxLength}/>}
  </label>;
}

const tabs = [
  { id: 'plan', label: 'Plan', icon: CalendarDays, hint: 'Canal, fecha y objetivo' },
  { id: 'copy', label: 'Mensaje', icon: MessageSquareText, hint: 'Gancho, beneficio y acción' },
  { id: 'production', label: 'Producción', icon: ClipboardList, hint: 'Tareas y revisión' },
] as const;

export const DEFAULT_MARKETING_TAGS = ['Campaña','Producto','Proceso','Educativo','Temporada','Promoción','Marca','Pendiente'];

const canvasPresets = [
  { label: 'Vertical · 9:16 · 1080 × 1920 px', width: '1080', height: '1920' },
  { label: 'Retrato · 4:5 · 1080 × 1350 px', width: '1080', height: '1350' },
  { label: 'Retrato · 3:4 · 1080 × 1440 px', width: '1080', height: '1440' },
  { label: 'Cuadrado · 1:1 · 1080 × 1080 px', width: '1080', height: '1080' },
  { label: 'Horizontal · 16:9 · 1920 × 1080 px', width: '1920', height: '1080' },
  { label: 'Horizontal · 4:3 · 1200 × 900 px', width: '1200', height: '900' },
  { label: 'Horizontal · 3:2 · 1200 × 800 px', width: '1200', height: '800' },
  { label: 'Banner · 2:1 · 1200 × 600 px', width: '1200', height: '600' },
];

function simplifyRatio(width: number, height: number) {
  let a = width, b = height;
  while (b) [a, b] = [b, a % b];
  return `${width / a}:${height / a}`;
}

function CanvasDimensions({ draft, onChange }: { draft: PublicationDraft; onChange: Props['onChange'] }) {
  const width = Number(draft.canvas_width), height = Number(draft.canvas_height);
  const hasWidth = draft.canvas_width !== '', hasHeight = draft.canvas_height !== '';
  const valid = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
  const preset = canvasPresets.find((item) => item.width === draft.canvas_width && item.height === draft.canvas_height);
  const choosePreset = (value: string) => {
    const selected = canvasPresets.find((item) => `${item.width}x${item.height}` === value);
    onChange('canvas_width', selected?.width || '');
    onChange('canvas_height', selected?.height || '');
  };
  return <section className="vc-marketing-canvas-size is-wide" aria-label="Tamaño de la pieza">
    <div className="vc-publication-section-heading"><span className="vc-publication-heading-icon"><Target size={16}/></span><div><b>Medida de la pieza</b><small>Elige un tamaño habitual o escribe el ancho y el alto en píxeles.</small></div></div>
    <label className="vc-publication-field vc-marketing-canvas-preset"><span>Medidas rápidas</span><select value={preset ? `${preset.width}x${preset.height}` : ''} onChange={(event) => choosePreset(event.target.value)}><option value="">Personalizada / sin medida</option>{canvasPresets.map((item) => <option key={`${item.width}x${item.height}`} value={`${item.width}x${item.height}`}>{item.label}</option>)}</select></label>
    <div className="vc-marketing-canvas-dimensions">
      <label className="vc-publication-field"><span>Ancho (px)</span><input type="number" min="1" max="20000" step="1" inputMode="numeric" value={draft.canvas_width} onChange={(event) => onChange('canvas_width', event.target.value)} placeholder="1080" aria-label="Ancho de la pieza en píxeles"/></label>
      <span className="vc-marketing-canvas-times" aria-hidden="true">×</span>
      <label className="vc-publication-field"><span>Alto (px)</span><input type="number" min="1" max="20000" step="1" inputMode="numeric" value={draft.canvas_height} onChange={(event) => onChange('canvas_height', event.target.value)} placeholder="1920" aria-label="Alto de la pieza en píxeles"/></label>
      <output className={`vc-marketing-canvas-ratio${valid ? ' is-valid' : ''}`} aria-live="polite"><small>Proporción</small><b>{valid ? simplifyRatio(width, height) : hasWidth && hasHeight ? 'Usa enteros de 1 a 20 000' : hasWidth || hasHeight ? 'Completa ambas medidas' : 'Sin definir'}</b></output>
    </div>
  </section>;
}

function ReadinessChecklist({ draft, onChange }: { draft: PublicationDraft; onChange: Props['onChange'] }) {
  return <section className="vc-marketing-readiness is-wide" aria-label="Avance de producción">
    <div className="vc-publication-section-heading"><span className="vc-publication-heading-icon"><CheckCircle2 size={16}/></span><div><b>Avance de producción</b><small>Marca cada recurso cuando esté listo para revisión o publicación.</small></div></div>
    <div className="vc-marketing-readiness-options">
      <label><input type="checkbox" checked={draft.design_ready} onChange={(event) => onChange('design_ready', event.target.checked)}/><span><b>Diseño listo</b><small>Arte final preparado</small></span></label>
      <label><input type="checkbox" checked={draft.video_ready} onChange={(event) => onChange('video_ready', event.target.checked)}/><span><b>Vídeo listo</b><small>Edición final preparada</small></span></label>
    </div>
  </section>;
}

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
    <nav className="vc-publication-steps" role="tablist" aria-label="Secciones de la ficha de publicación">
      {tabs.map(({ id, label, icon: Icon, hint }, index) => <button key={id} type="button" role="tab" id={`vc-publication-tab-${id}`} aria-controls="vc-publication-tabpanel" aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1} className={activeTab === id ? 'is-active' : ''} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; onTabChange(tabs[nextIndex].id); document.getElementById(`vc-publication-tab-${tabs[nextIndex].id}`)?.focus(); } }} onClick={() => onTabChange(id)}>
        <span className="vc-publication-step-number">{activeTab === id ? <Icon size={15}/> : index + 1}</span><span><b>{label}</b><small>{hint}</small></span>
      </button>)}
    </nav>

    <fieldset id="vc-publication-tabpanel" role="tabpanel" aria-labelledby={`vc-publication-tab-${activeTab}`} tabIndex={0} className="vc-post-form-fieldset vc-publication-fieldset" disabled={!canEdit}>
      {activeTab === 'plan' && <div className="vc-post-form-grid vc-publication-grid">
        <label className="vc-publication-field is-wide"><span>Título de la publicación</span><input required autoFocus value={draft.title} onChange={(event) => onChange('title', event.target.value)} placeholder="Ej.: Presentación del servicio de impresión" maxLength={180}/></label>
        <label className="vc-publication-field"><span>Canal</span><select value={draft.platform} onChange={(event) => onChange('platform', event.target.value)}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>WhatsApp</option><option>LinkedIn</option><option>Multicanal</option><option>Por definir</option></select></label>
        <label className="vc-publication-field"><span>Formato</span><select value={draft.format} onChange={(event) => onChange('format', event.target.value)}><option>Post</option><option>Historia</option><option>Carrusel</option><option>Reel</option><option>Video</option><option>Diseño</option><option>Por definir</option></select></label>
        <label className="vc-publication-field"><span>Fecha de publicación</span><input type="date" value={draft.scheduled_date} onChange={(event) => onChange('scheduled_date', event.target.value)}/></label>
        <label className="vc-publication-field"><span>Hora</span><input type="time" value={draft.scheduled_time} onChange={(event) => onChange('scheduled_time', event.target.value)}/></label>
        <label className="vc-publication-field"><span>Responsable</span><input value={draft.owner} onChange={(event) => onChange('owner', event.target.value)} placeholder="Por asignar" maxLength={120}/></label>
        <label className="vc-publication-field"><span>Etapa</span><select value={draft.status} onChange={(event) => onChange('status', event.target.value)}>{[...new Set(['Por iniciar','Planificada','En diseño','En revisión','Aprobada','Programada','Publicada','Completada','Terminada','Bloqueada','Cancelada',draft.status])].map((status) => <option key={status}>{status}</option>)}</select></label>
        <CanvasDimensions draft={draft} onChange={onChange}/>
        <PublicationField draft={draft} onChange={onChange} name="content_line" label="Tema o línea de contenido" hint="Resume de qué trata la pieza." placeholder="Qué queremos comunicar" wide/>
        <TagPicker value={draft.tags} onChange={(value) => onChange('tags', value)} calendarColor={draft.calendar_color} onCalendarColorChange={(value) => onChange('calendar_color', value)} knownTags={knownTags} disabled={!canEdit}/>
        <PublicationField draft={draft} onChange={onChange} name="objective" label="Objetivo" hint="¿Qué debería lograr esta publicación?" placeholder="Informar, atraer consultas, mostrar un proceso…"/>
        <PublicationField draft={draft} onChange={onChange} name="audience" label="Audiencia" hint="¿A quién queremos llegar?" placeholder="Audiencia o segmento por definir"/>
      </div>}

      {activeTab === 'copy' && <div className="vc-publication-copy-layout">
        <section className="vc-publication-copy-fields" aria-label="Componentes del mensaje">
          <div className="vc-publication-section-heading"><span className="vc-publication-heading-icon"><Target size={16}/></span><div><b>Construye el mensaje por partes</b><small>Los campos son opcionales. Usa solo los que ayuden a comunicar la idea.</small></div></div>
          <div className="vc-post-form-grid vc-publication-grid">
            <PublicationField draft={draft} onChange={onChange} name="call_in" label="Frase de entrada" hint="Abre con una pregunta, tensión o idea que capte atención." placeholder="La primera frase que capta atención" wide/>
            <PublicationField draft={draft} onChange={onChange} name="offer" label="Oferta o tema central" hint="Beneficio, servicio o propuesta; deja pendiente lo que falte confirmar." placeholder="Qué ofrecemos o queremos destacar" wide/>
            <PublicationField draft={draft} onChange={onChange} name="callout" label="Beneficio o respaldo" hint="La razón concreta que sostiene el mensaje: característica, prueba o detalle confirmado." placeholder="Qué valor debe recordar la audiencia" wide/>
            <PublicationField draft={draft} onChange={onChange} name="caption" label="Texto para la publicación" hint="Versión corrida para revisar, copiar y adaptar al canal." placeholder="Desarrolla la idea en el tono y extensión adecuados." multiline wide rows={5}/>
            <div className="vc-publication-cta-block">
              <div className="vc-publication-section-heading"><span className="vc-publication-heading-icon is-cta"><CopyCheck size={16}/></span><div><b>Acción para la audiencia</b><small>Indica qué hacer y a dónde dirigir esa acción.</small></div></div>
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
        <ReadinessChecklist draft={draft} onChange={onChange}/>
        {!isNew && selectedPost && <div className="vc-post-checklist is-production-checklist is-wide"><div className="vc-publication-section-heading"><span className="vc-publication-heading-icon"><CheckCircle2 size={16}/></span><div><b>Revisión de entregables</b><small>Estado importado del checklist; “Por confirmar” requiere revisión del equipo.</small></div></div><div>{checklistFields.map(([field,label]) => <span key={field}><i className={/complet|aprob|listo|hecho/i.test(selectedPost[field] || '') ? 'is-done' : ''}/>{label}<small>{selectedPost[field] || 'Por confirmar'}</small></span>)}</div></div>}
        {events.length > 0 && <div className="vc-post-checklist is-wide"><span className="eyebrow">ACTIVIDAD RECIENTE</span><p>{events.slice(0, 5).map((entry) => <span key={entry.id}>{entry.field_name}: {entry.previous_value || 'vacío'} → {entry.new_value} · {formatDate(String(entry.created_at).slice(0,10))}</span>)}</p></div>}
        <div className="vc-publication-production-note is-wide"><CheckCircle2 size={16}/><p><b>El estado describe el flujo interno.</b><br/>Marcar una pieza como aprobada o publicada no la envía a redes; conserva esa etapa hasta que la persona responsable confirme el avance.</p></div>
      </div>}
    </fieldset>
  </>;
}
