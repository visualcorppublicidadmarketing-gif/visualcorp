import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle, CalendarDays, Check, CircleCheck, Clock3, Globe2, Lightbulb,
  LoaderCircle, Plus, RefreshCw, Search, Store, Users, Workflow,
  type LucideIcon,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, supabaseConfigured } from '../../lib/supabaseClient';
import './admin-suggestions.css';

type SuggestionCategory = 'website' | 'physical_store' | 'customer_service' | 'process' | 'team' | 'other';
type SuggestionPriority = 'low' | 'normal' | 'high';
type SuggestionStatus = 'new' | 'reviewing' | 'planned' | 'in_progress' | 'completed';

type Suggestion = {
  id: string;
  title: string;
  description: string;
  category: SuggestionCategory;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  created_at: string;
};

type SuggestionDraft = Pick<Suggestion, 'title' | 'description' | 'category' | 'priority'>;

const initialDraft: SuggestionDraft = {
  title: '',
  description: '',
  category: 'website',
  priority: 'normal',
};

const categories: Array<{ value: SuggestionCategory; label: string; icon: LucideIcon }> = [
  { value: 'website', label: 'Sitio web', icon: Globe2 },
  { value: 'physical_store', label: 'Local físico', icon: Store },
  { value: 'customer_service', label: 'Atención al cliente', icon: Users },
  { value: 'process', label: 'Procesos y operación', icon: Workflow },
  { value: 'team', label: 'Equipo', icon: Users },
  { value: 'other', label: 'Otro', icon: Lightbulb },
];

const statuses: Array<{ value: SuggestionStatus; label: string }> = [
  { value: 'new', label: 'Nueva' },
  { value: 'reviewing', label: 'En revisión' },
  { value: 'planned', label: 'Planificada' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Implementada' },
];

const priorities: Array<{ value: SuggestionPriority; label: string }> = [
  { value: 'low', label: 'Puede esperar' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Prioritaria' },
];

function categoryLabel(category: SuggestionCategory) {
  return categories.find((item) => item.value === category)?.label || 'Otro';
}

function statusLabel(status: SuggestionStatus) {
  return statuses.find((item) => item.value === status)?.label || 'Nueva';
}

function formatSuggestionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeZone: 'America/Guayaquil',
  }).format(date);
}

export function AdminSuggestionsPage() {
  const { organizationId, hasPermission } = useAuth();
  const canUpdateStatus = hasPermission('team', 'manage_suggestions');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [draft, setDraft] = useState<SuggestionDraft>(initialDraft);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const loadSuggestions = useCallback(async () => {
    if (!supabaseConfigured || !supabase || !organizationId) {
      setSuggestions([]);
      setLoadError('El tablero necesita una conexión activa y la migración de sugerencias aplicada.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('admin_suggestions')
      .select('id,title,description,category,priority,status,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError('No se pudo cargar el tablero. Revisa la conexión, los permisos y que la migración esté aplicada.');
      setLoading(false);
      return;
    }

    setSuggestions((data || []) as Suggestion[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const visibleSuggestions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-EC');
    return suggestions.filter((suggestion) => {
      const matchesSearch = !query
        || `${suggestion.title} ${suggestion.description} ${categoryLabel(suggestion.category)}`
          .toLocaleLowerCase('es-EC').includes(query);
      const matchesCategory = categoryFilter === 'all' || suggestion.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || suggestion.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [suggestions, search, categoryFilter, statusFilter]);

  const reviewingCount = suggestions.filter((item) => item.status === 'reviewing').length;
  const completedCount = suggestions.filter((item) => item.status === 'completed').length;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (title.length < 3 || description.length < 8) {
      setFormError('Escribe un título de al menos 3 caracteres y una descripción de al menos 8.');
      return;
    }
    if (!supabase || !organizationId) {
      setFormError('No hay una organización conectada para guardar esta sugerencia.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('admin_suggestions').insert({
      organization_id: organizationId,
      title,
      description,
      category: draft.category,
      priority: draft.priority,
    });

    if (error) {
      setFormError('No se pudo guardar. Verifica tus permisos e inténtalo de nuevo.');
      setSaving(false);
      return;
    }

    setDraft(initialDraft);
    setNotice('Sugerencia agregada al tablero.');
    setSaving(false);
    await loadSuggestions();
  };

  const updateStatus = async (suggestion: Suggestion, status: SuggestionStatus) => {
    if (!supabase || !organizationId || !canUpdateStatus || suggestion.status === status) return;
    setUpdatingId(suggestion.id);
    setFormError('');
    setNotice('');

    const { data, error } = await supabase
      .from('admin_suggestions')
      .update({ status })
      .eq('id', suggestion.id)
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      setFormError('No se pudo actualizar el estado. Comprueba tus permisos e inténtalo de nuevo.');
      setUpdatingId(null);
      return;
    }

    setSuggestions((current) => current.map((item) => item.id === suggestion.id ? { ...item, status } : item));
    setUpdatingId(null);
  };

  return <AppFrame area="operations">
    <PageHeading
      eyebrow="ADMINISTRACIÓN · MEJORA CONTINUA"
      title="Sugerencias"
      description="Registra oportunidades para mejorar el sitio web, el local físico, la atención y los procesos."
    />

    <div className="admin-suggestions">
      <section className="suggestions-overview">
        <div className="suggestions-intro">
          <span className="suggestions-intro-icon"><Lightbulb size={20}/></span>
          <div>
            <p className="suggestions-kicker">IDEAS DEL EQUIPO</p>
            <h2>Lo que observamos puede mejorar.</h2>
            <p>Describe una oportunidad concreta y el equipo podrá revisarla y darle seguimiento.</p>
          </div>
        </div>
        <div className="suggestions-metrics" aria-label="Resumen del tablero">
          <div><span>Registradas</span><strong>{suggestions.length}</strong></div>
          <div><span>En revisión</span><strong>{reviewingCount}</strong></div>
          <div><span>Implementadas</span><strong>{completedCount}</strong></div>
        </div>
      </section>

      {loadError && <div className="suggestions-alert" role="alert"><AlertCircle size={18}/><span>{loadError}</span><button type="button" onClick={() => void loadSuggestions()}>Reintentar</button></div>}
      {formError && <div className="suggestions-alert" role="alert"><AlertCircle size={18}/><span>{formError}</span></div>}
      {notice && <div className="suggestions-success" role="status"><Check size={17}/>{notice}</div>}

      <div className="suggestions-workspace">
        <section className="suggestions-panel suggestions-form-panel" aria-labelledby="suggestions-form-title">
          <div className="suggestions-panel-heading">
            <div className="suggestions-panel-icon"><Plus size={18}/></div>
            <div><h2 id="suggestions-form-title">Agregar sugerencia</h2><p>Registra qué podría funcionar mejor.</p></div>
          </div>

          <form className="suggestions-form" onSubmit={handleSubmit}>
            <label className="suggestions-field">
              <span>Título</span>
              <input
                required
                minLength={3}
                maxLength={120}
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ej. Mejorar la información de contacto"
              />
            </label>

            <label className="suggestions-field">
              <span>Área de mejora</span>
              <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as SuggestionCategory }))}>
                {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>

            <fieldset className="suggestions-priority-field">
              <legend>Prioridad</legend>
              <div className="suggestions-priority-options">
                {priorities.map((priority) => <button
                  key={priority.value}
                  type="button"
                  className={draft.priority === priority.value ? 'is-selected' : ''}
                  aria-pressed={draft.priority === priority.value}
                  onClick={() => setDraft((current) => ({ ...current, priority: priority.value }))}
                >{priority.label}</button>)}
              </div>
            </fieldset>

            <label className="suggestions-field">
              <span>¿Qué propones mejorar?</span>
              <textarea
                required
                minLength={8}
                maxLength={2400}
                rows={5}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Cuéntanos qué observaste, qué cambio propones y a quién ayudaría."
              />
              <small>{draft.description.length}/2400 caracteres</small>
            </label>

            <button className="suggestions-submit" type="submit" disabled={saving}>
              {saving ? <LoaderCircle size={17} className="suggestions-spinner"/> : <Plus size={17}/>}
              {saving ? 'Guardando…' : 'Agregar al tablero'}
            </button>
          </form>
        </section>

        <section className="suggestions-panel suggestions-list-panel" aria-labelledby="suggestions-list-title">
          <div className="suggestions-list-heading">
            <div className="suggestions-panel-heading">
              <div className="suggestions-panel-icon is-list"><Lightbulb size={18}/></div>
              <div><h2 id="suggestions-list-title">Ideas registradas</h2><p>{visibleSuggestions.length} {visibleSuggestions.length === 1 ? 'resultado' : 'resultados'}</p></div>
            </div>
            <button className="suggestions-refresh" type="button" onClick={() => void loadSuggestions()} disabled={loading} aria-label="Actualizar sugerencias" title="Actualizar">
              <RefreshCw size={16} className={loading ? 'suggestions-spinner' : ''}/>
            </button>
          </div>

          <div className="suggestions-filters">
            <label className="suggestions-search">
              <Search size={16}/><span className="sr-only">Buscar sugerencias</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar una idea" />
            </label>
            <label className="suggestions-filter-field">
              <span className="sr-only">Filtrar por área</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">Todas las áreas</option>
                {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label className="suggestions-filter-field">
              <span className="sr-only">Filtrar por estado</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todos los estados</option>
                {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>

          {loading ? <div className="suggestions-state" role="status"><LoaderCircle size={20} className="suggestions-spinner"/><span>Cargando sugerencias…</span></div>
            : loadError ? <div className="suggestions-state"><span>No se pudo mostrar la lista hasta recuperar la conexión.</span></div>
            : visibleSuggestions.length === 0 ? <div className="suggestions-state suggestions-empty">
              <span><Lightbulb size={22}/></span>
              <h3>{suggestions.length === 0 ? 'El tablero está listo' : 'No hay coincidencias'}</h3>
              <p>{suggestions.length === 0 ? 'Agrega la primera idea para empezar a reunir oportunidades de mejora.' : 'Prueba con otra búsqueda o cambia los filtros.'}</p>
            </div>
            : <div className="suggestions-cards">
              {visibleSuggestions.map((suggestion) => {
                const CategoryIcon = categories.find((item) => item.value === suggestion.category)?.icon || Lightbulb;
                return <article className="suggestion-card" key={suggestion.id}>
                  <div className="suggestion-card-topline">
                    <span className="suggestion-category"><CategoryIcon size={14}/>{categoryLabel(suggestion.category)}</span>
                    <span className={`suggestion-priority priority-${suggestion.priority}`}>
                      {priorities.find((item) => item.value === suggestion.priority)?.label || 'Normal'}
                    </span>
                  </div>
                  <h3>{suggestion.title}</h3>
                  <p className="suggestion-description">{suggestion.description}</p>
                  <div className="suggestion-card-footer">
                    <span className={`suggestion-status status-${suggestion.status}`}>
                      {suggestion.status === 'completed' ? <CircleCheck size={14}/> : <Clock3 size={14}/>}
                      {statusLabel(suggestion.status)}
                    </span>
                    <span className="suggestion-date"><CalendarDays size={14}/>{formatSuggestionDate(suggestion.created_at)}</span>
                  </div>
                  {canUpdateStatus && <label className="suggestion-status-control">
                    <span>Actualizar seguimiento</span>
                    <select
                      value={suggestion.status}
                      disabled={updatingId === suggestion.id}
                      onChange={(event) => void updateStatus(suggestion, event.target.value as SuggestionStatus)}
                    >
                      {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>}
                </article>;
              })}
            </div>}
        </section>
      </div>
    </div>
  </AppFrame>;
}
