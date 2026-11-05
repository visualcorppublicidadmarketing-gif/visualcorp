import React, { useState } from 'react';
import { CalendarDays, CheckCircle2, CirclePlus, FileImage, Megaphone, Pencil, Plus, Target } from 'lucide-react';
import { StageBadge } from '../../../components/feedback';
import { SelectDropdown } from '../../../components/ui/SelectDropdown';
import { MarketingPostArtwork, type MarketingArtworkAsset } from './MarketingPostArtwork';
import './marketing-campaign-planning.css';

export type MarketingCampaign = {
  id: string;
  title: string;
  brief: string;
  start_date: string | null;
  end_date: string | null;
  owner: string;
  status: string;
  source_id?: string;
};

export type MarketingCampaignTask = {
  id: string;
  campaign_id: string | null;
  activity_type: string;
  custom_activity_type: string;
  title: string;
  brief: string;
  start_date: string | null;
  due_date: string | null;
  start_time: string | null;
  end_time: string | null;
  owner: string;
  priority: string;
  status: string;
  next_action: string;
  source_id?: string;
};

export type MarketingCampaignPost = {
  id: string;
  campaign_id?: string | null;
  title: string;
  status: string;
  scheduled_date?: string;
  platform?: string;
  owner?: string;
};

export type PlanningKind = 'campaign' | 'post' | 'task';
export type MarketingTaskRange = { startDate: string; endDate: string; startTime?: string; endTime?: string };
export const taskStatuses = ['Pendiente', 'En proceso', 'En revisión', 'Listo', 'Bloqueado', 'Cancelado'];
export const campaignStatuses = ['Planificada', 'En curso', 'Finalizada', 'Cancelada'];
export const activityTypes = [
  'Decoración o ambientación',
  'Diseño interno de campaña',
  'Material promocional o recuerdos',
  'Otro',
];

export type CampaignDraft = {
  title: string;
  brief: string;
  start_date: string;
  end_date: string;
  owner: string;
  status: string;
};

export type CampaignTaskDraft = {
  campaign_id: string;
  activity_type: string;
  custom_activity_type: string;
  title: string;
  brief: string;
  start_date: string;
  due_date: string;
  start_time: string;
  end_time: string;
  owner: string;
  priority: string;
  status: string;
  next_action: string;
};

export type PlanningFormProps = {
  organizationId: string;
  canEdit: boolean;
  canDelete: boolean;
  saving: boolean;
  draftFile: File | null;
  onDraftFileChange: (file: File | null) => void;
  onReferenceSaved: () => void | Promise<void>;
};

const emptyAssetMap = new Map<string, MarketingArtworkAsset>();

export function MarketingPlanningChooser({ onChoose, onClose }: { onChoose: (kind: PlanningKind) => void; onClose: () => void }) {
  const [kind, setKind] = useState<PlanningKind>('campaign');
  const options: { kind: PlanningKind; title: string; description: string; icon: React.ElementType }[] = [
    { kind: 'campaign', title: 'Campaña', description: 'Define el objetivo y periodo; luego agrupa sus publicaciones y actividades.', icon: Target },
    { kind: 'post', title: 'Publicación social', description: 'Planifica canal, formato, fecha y mensaje como hasta ahora.', icon: Megaphone },
    { kind: 'task', title: 'Actividad o entregable', description: 'Organiza decoración, diseños internos, materiales y otros trabajos.', icon: CheckCircle2 },
  ];
  return <div className="vc-marketing-plan-chooser" role="radiogroup" aria-label="Tipo de planificación">
    {options.map(({ kind: optionKind, title, description, icon: Icon }) => <label className={`vc-marketing-plan-choice${kind === optionKind ? ' is-selected' : ''}`} key={optionKind}>
      <input type="radio" name="marketing-plan-kind" value={optionKind} checked={kind === optionKind} onChange={() => setKind(optionKind)}/>
      <span className="vc-marketing-plan-choice-icon"><Icon size={18}/></span><span><b>{title}</b><small>{description}</small></span>
    </label>)}
    <div className="vc-marketing-plan-choice-actions"><button type="button" className="button button-outline" onClick={onClose}>Cerrar</button><button type="button" className="button button-dark" onClick={() => onChoose(kind)}>Continuar</button></div>
  </div>;
}

export function CampaignFields({ draft, onChange, canEdit, organizationId, canDelete, draftFile, onDraftFileChange, campaign, artwork, onReferenceSaved }: {
  draft: CampaignDraft;
  onChange: (field: keyof CampaignDraft, value: string) => void;
  campaign: MarketingCampaign | null;
  artwork?: MarketingArtworkAsset;
  onReferenceSaved: () => void | Promise<void>;
} & PlanningFormProps) {
  return <div className="vc-marketing-planning-fields">
    <label className="vc-publication-field is-wide"><span>Nombre de la campaña</span><input required autoFocus maxLength={180} value={draft.title} onChange={(event) => onChange('title', event.target.value)} placeholder="Ej.: Navidad"/></label>
    <label className="vc-publication-field is-wide"><span>Objetivo o brief</span><textarea rows={4} maxLength={3000} value={draft.brief} onChange={(event) => onChange('brief', event.target.value)} placeholder="Qué se busca lograr y qué hace falta coordinar"/></label>
    <label className="vc-publication-field"><span>Inicio del periodo</span><input type="date" value={draft.start_date} onChange={(event) => onChange('start_date', event.target.value)}/></label>
    <label className="vc-publication-field"><span>Fin del periodo</span><input type="date" min={draft.start_date || undefined} value={draft.end_date} onChange={(event) => onChange('end_date', event.target.value)}/></label>
    <label className="vc-publication-field"><span>Responsable</span><input maxLength={120} value={draft.owner} onChange={(event) => onChange('owner', event.target.value)} placeholder="Por asignar"/></label>
    <div className="vc-publication-field"><span>Estado</span><SelectDropdown size="md" fullWidth value={draft.status} options={campaignStatuses.map((status) => ({ value: status, label: status }))} onChange={(val) => onChange('status', val)}/></div>
    <section className="vc-publication-editor-artwork vc-marketing-planning-artwork is-wide" aria-label="Imagen de referencia de la campaña">
      <div className="vc-publication-editor-artwork-copy"><span className="eyebrow">MATERIAL VISUAL</span><b>Referencia de campaña</b><small>{campaign ? 'Imagen de apoyo guardada en la biblioteca privada.' : 'Guarda primero la campaña para poder asociar la imagen de referencia.'}</small></div>
      <MarketingPostArtwork organizationId={organizationId} post={{ id: campaign?.id || '', source_id: campaign?.source_id, title: draft.title || 'nueva campaña', scheduled_date: draft.start_date }} association={campaign ? { kind: 'campaign', campaignId: campaign.id } : { kind: 'campaign', campaignId: '' }} asset={artwork} canEdit={canEdit} canDelete={canDelete} variant="editor" isDraft={!campaign} draftFile={draftFile} onDraftFileChange={onDraftFileChange} onSaved={onReferenceSaved}/>
    </section>
  </div>;
}

export function TaskFields({ draft, onChange, campaigns, campaignTask, artwork, organizationId, canEdit, canDelete, draftFile, onDraftFileChange, onReferenceSaved }: {
  draft: CampaignTaskDraft;
  onChange: (field: keyof CampaignTaskDraft, value: string) => void;
  campaigns: MarketingCampaign[];
  campaignTask: MarketingCampaignTask | null;
  artwork?: MarketingArtworkAsset;
  organizationId: string;
  canEdit: boolean;
  canDelete: boolean;
  draftFile: File | null;
  onDraftFileChange: (file: File | null) => void;
  onReferenceSaved: () => void | Promise<void>;
}) {
  const customType = draft.activity_type === 'Otro';
  const relationCampaign = campaigns.find((campaign) => campaign.id === draft.campaign_id);
  return <div className="vc-marketing-planning-fields">
    <div className="vc-publication-field"><span>Tipo de actividad</span><SelectDropdown size="md" fullWidth value={draft.activity_type} options={activityTypes.map((type) => ({ value: type, label: type }))} onChange={(val) => onChange('activity_type', val)}/></div>
    {customType && <label className="vc-publication-field"><span>Tipo personalizado</span><input required maxLength={80} value={draft.custom_activity_type} onChange={(event) => onChange('custom_activity_type', event.target.value)} placeholder="Escribe el tipo de trabajo"/></label>}
    <label className={`vc-publication-field${customType ? '' : ' is-wide'}`}><span>Título de la actividad</span><input required autoFocus maxLength={180} value={draft.title} onChange={(event) => onChange('title', event.target.value)} placeholder="Ej.: Decorar el local"/></label>
    <div className="vc-publication-field is-wide"><span>Campaña relacionada</span><SelectDropdown size="md" fullWidth searchable searchPlaceholder="Buscar campaña…" value={draft.campaign_id} options={[{ value: '', label: 'Sin campaña (actividad independiente)' }, ...campaigns.filter((campaign) => !/cancelad/i.test(campaign.status)).map((campaign) => ({ value: campaign.id, label: campaign.title }))]} onChange={(val) => onChange('campaign_id', val)}/></div>
    <label className="vc-publication-field is-wide"><span>Brief de trabajo</span><textarea rows={4} maxLength={3000} value={draft.brief} onChange={(event) => onChange('brief', event.target.value)} placeholder="Alcance, resultado esperado o detalles por confirmar"/></label>
    <label className="vc-publication-field"><span>Fecha de inicio (opcional)</span><input type="date" max={draft.due_date || undefined} value={draft.start_date} onChange={(event) => onChange('start_date', event.target.value)}/></label>
    <label className="vc-publication-field"><span>Fecha límite</span><input required type="date" min={draft.start_date || undefined} value={draft.due_date} onChange={(event) => onChange('due_date', event.target.value)}/></label>
    <label className="vc-publication-field"><span>Hora de inicio (opcional)</span><input type="time" step={1800} value={draft.start_time} onChange={(event) => onChange('start_time', event.target.value)}/></label>
    <label className="vc-publication-field"><span>Hora de fin (opcional)</span><input type="time" step={1800} value={draft.end_time} onChange={(event) => onChange('end_time', event.target.value)}/></label>
    <label className="vc-publication-field"><span>Responsable</span><input maxLength={120} value={draft.owner} onChange={(event) => onChange('owner', event.target.value)} placeholder="Por asignar"/></label>
    <div className="vc-publication-field"><span>Prioridad</span><SelectDropdown size="md" fullWidth value={draft.priority} options={[{ value: 'Baja', label: 'Baja', dotColor: '#94a3b8' }, { value: 'Normal', label: 'Normal', dotColor: '#38bdf8' }, { value: 'Alta', label: 'Alta', dotColor: '#f43f5e' }]} onChange={(val) => onChange('priority', val)}/></div>
    <div className="vc-publication-field"><span>Etapa</span><SelectDropdown size="md" fullWidth value={draft.status} options={taskStatuses.map((status) => ({ value: status, label: status }))} onChange={(val) => onChange('status', val)}/></div>
    <label className="vc-publication-field"><span>Siguiente paso</span><input maxLength={500} value={draft.next_action} onChange={(event) => onChange('next_action', event.target.value)} placeholder="Acción concreta para avanzar"/></label>
    <section className="vc-publication-editor-artwork vc-marketing-planning-artwork is-wide" aria-label="Imagen de referencia de la actividad">
      <div className="vc-publication-editor-artwork-copy"><span className="eyebrow">MATERIAL VISUAL</span><b>Referencia visual</b><small>{campaignTask ? 'Imagen de apoyo guardada en la biblioteca privada.' : 'Guarda primero la actividad para poder asociar la imagen.'}</small></div>
      <MarketingPostArtwork organizationId={organizationId} post={{ id: campaignTask?.id || '', source_id: campaignTask?.source_id, title: draft.title || 'nueva actividad', scheduled_date: draft.due_date }} association={campaignTask ? { kind: 'item', itemId: campaignTask.id } : { kind: 'item', itemId: '' }} asset={artwork} canEdit={canEdit} canDelete={canDelete} variant="editor" isDraft={!campaignTask} draftFile={draftFile} onDraftFileChange={onDraftFileChange} onSaved={onReferenceSaved}/>
      {relationCampaign && <small className="vc-marketing-task-campaign-note">Esta actividad pertenece a «{relationCampaign.title}».</small>}
    </section>
  </div>;
}

export function CampaignPlanningSection({ campaigns, tasks, posts, campaignArtwork = emptyAssetMap, taskArtwork = emptyAssetMap, canEdit, organizationId, onArtworkSaved, onNewCampaign, onNewTask, onEditCampaign, onEditTask, onAddPost, onOpenPost, onOpenTask }: {
  campaigns: MarketingCampaign[];
  tasks: MarketingCampaignTask[];
  posts: MarketingCampaignPost[];
  campaignArtwork?: ReadonlyMap<string, MarketingArtworkAsset>;
  taskArtwork?: ReadonlyMap<string, MarketingArtworkAsset>;
  canEdit: boolean;
  organizationId: string;
  onArtworkSaved: () => void;
  onNewCampaign: () => void;
  onNewTask: (campaignId?: string) => void;
  onEditCampaign: (campaign: MarketingCampaign) => void;
  onEditTask: (task: MarketingCampaignTask) => void;
  onAddPost: (campaignId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const standaloneTasks = tasks.filter((task) => !task.campaign_id);
  return <section className="vc-marketing-campaigns-section">
    <div className="vc-content-toolbar vc-content-toolbar-inline"><div><span className="vc-content-section-icon"><Target size={16}/></span><div><b>Campañas y actividades</b><small>{campaigns.length} campañas · {tasks.length} actividades no sociales · {posts.filter((post) => post.campaign_id).length} publicaciones vinculadas</small></div></div>{canEdit && <div className="vc-marketing-planning-section-actions"><button className="button button-outline" type="button" onClick={() => onNewTask()}><CirclePlus size={15}/>Actividad independiente</button><button className="button button-dark" type="button" onClick={onNewCampaign}><Plus size={15}/>Nueva campaña</button></div>}</div>
    {campaigns.length === 0 && tasks.length === 0 ? <div className="vc-marketing-planning-empty"><Target size={22}/><b>Organiza una campaña completa</b><span>Une publicaciones, tareas y materiales en un mismo periodo.</span>{canEdit && <button type="button" className="button button-dark" onClick={onNewCampaign}><Plus size={15}/>Crear campaña</button>}</div> : <div className="vc-marketing-campaign-list">
      {campaigns.map((campaign) => {
        const campaignTasks = tasks.filter((task) => task.campaign_id === campaign.id);
        const campaignPosts = posts.filter((post) => post.campaign_id === campaign.id);
        return <article className="vc-marketing-campaign-card" key={campaign.id}>
          <header className="vc-marketing-campaign-card-head"><div className="vc-marketing-campaign-art"><MarketingPostArtwork organizationId={organizationId} post={{ id: campaign.id, source_id: campaign.source_id, title: campaign.title, scheduled_date: campaign.start_date || '' }} association={{ kind: 'campaign', campaignId: campaign.id }} asset={campaignArtwork.get(campaign.id)} canEdit={canEdit} variant="compact" onSaved={onArtworkSaved}/></div><div className="vc-marketing-campaign-card-title"><span className="eyebrow">CAMPAÑA</span><h3>{campaign.title}</h3><StageBadge stage={campaign.status}/><p>{campaign.brief || 'Objetivo o brief pendiente.'}</p><small><CalendarDays size={13}/>{campaign.start_date || campaign.end_date ? `${campaign.start_date || 'Inicio pendiente'} — ${campaign.end_date || 'fin pendiente'}` : 'Periodo pendiente'}{campaign.owner ? ` · ${campaign.owner}` : ''}</small></div>{canEdit && <button type="button" className="icon-button" aria-label={`Editar campaña ${campaign.title}`} onClick={() => onEditCampaign(campaign)}><Pencil size={15}/></button>}</header>
          <div className="vc-marketing-campaign-children" aria-label={`Actividades de ${campaign.title}`}>
            {campaignTasks.map((task) => <CampaignTaskRow key={task.id} task={task} asset={taskArtwork.get(task.id)} canEdit={canEdit} organizationId={organizationId} onArtworkSaved={onArtworkSaved} onEdit={() => onEditTask(task)} onOpen={() => onOpenTask(task.id)}/>)}
            {campaignPosts.map((post) => <button type="button" className="vc-marketing-campaign-post" key={post.id} onClick={() => onOpenPost(post.id)}><span><Megaphone size={15}/></span><div><b>{post.title}</b><small>{post.platform || 'Canal pendiente'} · {post.scheduled_date || 'Fecha pendiente'}{post.owner ? ` · ${post.owner}` : ''}</small></div><StageBadge stage={post.status}/></button>)}
            {campaignTasks.length + campaignPosts.length === 0 && <p className="vc-marketing-campaign-no-children">Aún no hay actividades. Agrega una publicación social o una tarea.</p>}
          </div>
          {canEdit && <footer className="vc-marketing-campaign-actions"><button type="button" onClick={() => onNewTask(campaign.id)}><Plus size={14}/>Agregar actividad</button><button type="button" onClick={() => onAddPost(campaign.id)}><Megaphone size={14}/>Agregar publicación</button></footer>}
        </article>;
      })}
    </div>}
    {standaloneTasks.length > 0 && <section className="vc-marketing-standalone-tasks"><header><div><span className="eyebrow">ACTIVIDADES INDEPENDIENTES</span><b>Sin campaña asociada</b></div><span>{standaloneTasks.length}</span></header><div>{standaloneTasks.map((task) => <CampaignTaskRow key={task.id} task={task} asset={taskArtwork.get(task.id)} canEdit={canEdit} organizationId={organizationId} onArtworkSaved={onArtworkSaved} onEdit={() => onEditTask(task)} onOpen={() => onOpenTask(task.id)}/>)}</div></section>}
  </section>;
}

function CampaignTaskRow({ task, asset, canEdit, organizationId, onArtworkSaved, onEdit, onOpen }: {
  task: MarketingCampaignTask;
  asset?: MarketingArtworkAsset;
  canEdit: boolean;
  organizationId: string;
  onArtworkSaved: () => void;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const typeName = task.activity_type === 'Otro' ? task.custom_activity_type || 'Otro' : task.activity_type;
  return <article className={`vc-marketing-campaign-task is-${task.status.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')}`}>
    <div className="vc-marketing-task-artwork"><MarketingPostArtwork organizationId={organizationId} post={{ id: task.id, source_id: task.source_id, title: task.title, scheduled_date: task.due_date || '' }} association={{ kind: 'item', itemId: task.id }} asset={asset} canEdit={canEdit} variant="compact" onSaved={onArtworkSaved}/></div>
    <button type="button" className="vc-marketing-campaign-task-main" onClick={onOpen}><span>{typeName}</span><b>{task.title}</b><small>{task.brief || task.next_action || 'Brief y siguiente paso pendientes.'}</small></button>
    <div className="vc-marketing-campaign-task-meta"><StageBadge stage={task.status}/><span className={task.priority === 'Alta' ? 'is-high' : ''}>{task.priority}</span><small>{task.due_date ? `Límite ${task.due_date}` : 'Sin fecha límite'}{task.owner ? ` · ${task.owner}` : ''}</small></div>
    {canEdit && <button type="button" className="icon-button" aria-label={`Editar actividad ${task.title}`} onClick={onEdit}><Pencil size={14}/></button>}
  </article>;
}

export function PlanningDateLabel({ startDate, endDate }: { startDate?: string | null; endDate?: string | null }) {
  if (!startDate && !endDate) return <>Periodo pendiente</>;
  return <>{startDate || 'Inicio pendiente'} — {endDate || 'fin pendiente'}</>;
}

