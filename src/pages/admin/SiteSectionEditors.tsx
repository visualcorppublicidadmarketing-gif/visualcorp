import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck,
  Globe,
  Layers,
  MapPin,
  MessageCircle,
  PanelsTopLeft,
  Phone,
  Printer,
  RotateCcw,
  Save,
  ScanLine,
  Scissors,
  Search,
  Share2,
  Shirt,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { saveServiceVisibility, saveWebsiteSettings } from '../../lib/websiteAdminRepository';
import { SiteAdminNav } from './SiteAdminNav';

const serviceIcons: Record<string, typeof Sparkles> = {
  impresion: Printer,
  'gran-formato': PanelsTopLeft,
  rotulos: Store,
  textil: Shirt,
  corte: Scissors,
  eventos: ScanLine,
};

const socialHosts: Record<string, string[]> = {
  instagram: ['instagram.com', 'www.instagram.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
};

function normalizeWhatsApp(phone: string): { international: string; display: string; url: string } {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return { international: '', display: 'Sin número', url: '' };
  const international = digits.startsWith('593') ? digits : `593${digits.replace(/^0/, '')}`;
  return {
    international,
    display: `+${international}`,
    url: `https://wa.me/${international}?text=${encodeURIComponent('Hola Visual Corp, mensaje de prueba desde administración.')}`,
  };
}

function resolveSocialUrl(platform: 'instagram' | 'facebook' | 'tiktok', value: string): string {
  const input = String(value || '').trim();
  if (!input) return '';
  if (/^(?:https?:\/\/)?(?:www\.)?(?:instagram|facebook|tiktok)\.com(?:\/|$)/i.test(input)) {
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (!socialHosts[platform]?.includes(url.hostname.toLowerCase())) return '';
      url.protocol = 'https:';
      return url.toString();
    } catch {
      return '';
    }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) return '';
  const handle = input.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  if (!handle || !/^[\w.-]+$/.test(handle)) return '';
  if (platform === 'tiktok') return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
  return `https://www.${platform}.com/${encodeURIComponent(handle)}/`;
}

function formatSocialDisplay(value: string): string {
  const input = String(value || '').trim();
  if (!input) return 'Sin configurar';
  if (input.startsWith('@')) return input;
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
      return parts[0] ? `@${parts[0]}` : url.hostname;
    } catch {
      return input;
    }
  }
  return `@${input.replace(/^\/+|\/+$/g, '')}`;
}

const siteEditorStyles = `
.site-admin-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
  box-sizing: border-box;
  max-width: 100%;
}
.site-admin-kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border: 1px solid #ebe8ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
  transition: transform 0.18s ease, border-color 0.18s ease;
  min-width: 0;
  box-sizing: border-box;
}
.site-admin-kpi-card:hover {
  transform: translateY(-1px);
  border-color: #d6b5da;
}
.site-admin-kpi-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.site-admin-kpi-icon.purple { background: #f5e8f7; color: #8e1787; }
.site-admin-kpi-icon.blue { background: #e0f2fe; color: #0284c7; }
.site-admin-kpi-icon.amber { background: #fef3c7; color: #d97706; }
.site-admin-kpi-icon.emerald { background: #dcfce7; color: #16a34a; }
.site-admin-kpi-info {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.site-admin-kpi-label {
  font-size: 10.5px;
  color: #6b7280;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.site-admin-kpi-value {
  font-size: 19px;
  font-weight: 750;
  color: #111827;
  line-height: 1.2;
}
.site-admin-kpi-hint {
  font-size: 10px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.site-admin-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
  padding: 10px 14px;
  border: 1px solid #ecebf0;
  border-radius: 12px;
  background: #fafafc;
  box-sizing: border-box;
  max-width: 100%;
}
.site-admin-toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 260px;
  flex-wrap: wrap;
}
.site-admin-search-box {
  position: relative;
  flex: 1;
  min-width: 210px;
  max-width: 420px;
}
.site-admin-search-box svg.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
}
.site-admin-search-box input {
  width: 100%;
  height: 36px;
  padding: 0 30px 0 33px;
  border: 1px solid #e4e4e9;
  border-radius: 8px;
  background: #fff;
  color: #252630;
  font-size: 11px;
  box-sizing: border-box;
}
.site-admin-search-box input:focus {
  outline: 2px solid #8e1787;
  border-color: #8e1787;
}
.site-admin-search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: #e5e7eb;
  color: #4b5563;
  cursor: pointer;
}
.site-admin-filters {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid #e4e4e9;
  border-radius: 8px;
  background: #fff;
}
.site-filter-pill {
  padding: 5px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.site-filter-pill.is-active {
  background: #8e1787;
  color: #fff;
  box-shadow: 0 1px 3px rgba(142, 23, 135, 0.25);
}
.site-dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.site-char-counter-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
.site-char-meter {
  flex: 1;
  height: 4px;
  background: #ecebf0;
  border-radius: 999px;
  overflow: hidden;
}
.site-char-meter-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.2s ease, background 0.2s ease;
}
.site-service-mini-preview {
  margin-top: 4px;
  padding: 13px 14px;
  border-radius: 10px;
  background: #0d0f17;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f1f3f9;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  box-sizing: border-box;
}
.site-service-mini-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.site-service-mini-tag {
  font-size: 8.5px;
  font-weight: 750;
  letter-spacing: 0.07em;
  color: #8b8ea2;
  text-transform: uppercase;
}
.site-service-mini-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: rgba(229, 0, 126, 0.16);
  color: #ff3da3;
  display: grid;
  place-items: center;
}
.site-service-mini-title {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 3px;
  letter-spacing: -0.01em;
}
.site-service-mini-desc {
  font-size: 10.5px;
  line-height: 1.45;
  color: #9ba0b4;
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.site-service-mini-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 650;
  color: #00b4d8;
  letter-spacing: 0.01em;
}
.site-contact-admin-layout {
  display: grid;
  grid-template-columns: minmax(360px, 1.15fr) minmax(320px, 0.85fr);
  gap: 18px;
  align-items: start;
  box-sizing: border-box;
  max-width: 100%;
}
.site-contact-section {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #ebe8ef;
  border-radius: 10px;
  background: #fafafc;
  margin-bottom: 12px;
  box-sizing: border-box;
}
.site-contact-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 750;
  color: #2b2b36;
}
.site-contact-section-title svg {
  color: #8e1787;
}
.site-field-helper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  color: #6b7280;
  margin-top: 4px;
  flex-wrap: wrap;
}
.site-field-helper a {
  color: #8e1787;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  text-decoration: none;
}
.site-field-helper a:hover {
  text-decoration: underline;
}
.site-dirty-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 13px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 11px;
  font-weight: 650;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.site-contact-preview-panel {
  position: sticky;
  top: 16px;
  border-radius: 14px;
  background: #0d0f17;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  color: #f1f3f9;
  overflow: hidden;
  box-sizing: border-box;
  max-width: 100%;
}
.site-contact-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.site-contact-preview-body {
  padding: 16px;
  display: grid;
  gap: 14px;
  box-sizing: border-box;
}
.site-contact-preview-card {
  padding: 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.site-preview-channel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
}
.site-preview-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
}
.site-preview-status-badge.connected {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}
.site-preview-status-badge.pending {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
}
.site-contact-diagnostic-list {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.site-diagnostic-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  color: #a5a9bd;
}
.site-diagnostic-item.is-ready {
  color: #86efac;
}
@media (max-width: 1024px) {
  .site-admin-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 960px) {
  .site-contact-admin-layout {
    grid-template-columns: 1fr;
  }
  .site-contact-preview-panel {
    position: static;
  }
}
@media (max-width: 600px) {
  .site-admin-kpi-grid {
    grid-template-columns: 1fr;
  }
  .site-admin-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .site-admin-toolbar-left {
    min-width: 0;
  }
  .site-admin-search-box {
    max-width: 100%;
  }
}
`;

export function ServicesAdminPage() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const canEdit = hasPermission('website', 'edit');
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const [savingId, setSavingId] = useState('');
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        data.services.map((service) => [service.id, { name: service.name, description: service.description }])
      )
    );
  }, [data.services]);

  const totalServices = data.services.length;
  const visibleCount = useMemo(() => data.services.filter((service) => service.enabled).length, [data.services]);
  const hiddenCount = totalServices - visibleCount;

  const completeTextCount = useMemo(() => {
    return data.services.filter((service) => {
      const draft = drafts[service.id] || { name: service.name, description: service.description };
      return draft.name.trim().length > 0 && draft.description.trim().length >= 20;
    }).length;
  }, [data.services, drafts]);

  const dirtyServices = useMemo(() => {
    return data.services.filter((service) => {
      const draft = drafts[service.id];
      if (!draft) return false;
      return draft.name !== service.name || draft.description !== service.description;
    });
  }, [data.services, drafts]);

  const dirtyCount = dirtyServices.length;

  const filteredServices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return data.services.filter((service) => {
      const draft = drafts[service.id] || { name: service.name, description: service.description };
      const matchesSearch =
        !query ||
        service.name.toLowerCase().includes(query) ||
        draft.name.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query) ||
        draft.description.toLowerCase().includes(query);

      if (!matchesSearch) return false;
      if (filter === 'visible') return service.enabled;
      if (filter === 'hidden') return !service.enabled;
      return true;
    });
  }, [data.services, drafts, searchTerm, filter]);

  const save = async (event: FormEvent<HTMLFormElement>, serviceId: string) => {
    event.preventDefault();
    if (!canEdit || !supabase || !organizationId || isSavingAll) return;
    const draft = drafts[serviceId];
    if (!draft?.name.trim()) {
      setError('Cada servicio necesita un nombre.');
      return;
    }
    setSavingId(serviceId);
    setError('');
    try {
      const { data: row, error: saveError } = await supabase
        .from('services')
        .update({
          name: draft.name.trim(),
          short: draft.description.trim(),
          detail: draft.description.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', serviceId)
        .eq('organization_id', organizationId)
        .select('id')
        .single();
      if (saveError) throw saveError;
      if (!row) throw new Error('No se encontró el servicio para guardar.');
      setData((current) => ({
        ...current,
        services: current.services.map((service) =>
          service.id === serviceId
            ? { ...service, name: draft.name.trim(), description: draft.description.trim() }
            : service
        ),
      }));
      flash('Servicio actualizado en la página pública.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el servicio.');
    } finally {
      setSavingId('');
    }
  };

  const saveAll = async () => {
    if (!canEdit || !supabase || !organizationId || isSavingAll || dirtyCount === 0) return;
    const invalidService = dirtyServices.find((s) => !drafts[s.id]?.name.trim());
    if (invalidService) {
      setError(`El servicio "${invalidService.name}" necesita un nombre.`);
      return;
    }
    setIsSavingAll(true);
    setError('');
    try {
      const results = await Promise.all(
        dirtyServices.map(async (service) => {
          const draft = drafts[service.id];
          const { data: row, error: saveError } = await supabase
            .from('services')
            .update({
              name: draft.name.trim(),
              short: draft.description.trim(),
              detail: draft.description.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', service.id)
            .eq('organization_id', organizationId)
            .select('id')
            .single();
          if (saveError) throw saveError;
          if (!row) throw new Error(`No se encontró el servicio "${service.name}".`);
          return { id: service.id, name: draft.name.trim(), description: draft.description.trim() };
        })
      );
      const updatedMap = new Map(results.map((r) => [r.id, r]));
      setData((current) => ({
        ...current,
        services: current.services.map((service) => {
          const updated = updatedMap.get(service.id);
          return updated ? { ...service, name: updated.name, description: updated.description } : service;
        }),
      }));
      flash(`${dirtyServices.length} ${dirtyServices.length === 1 ? 'servicio guardado' : 'servicios guardados'} en la web.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los servicios.');
    } finally {
      setIsSavingAll(false);
    }
  };

  const discardChanges = (serviceId: string) => {
    const original = data.services.find((s) => s.id === serviceId);
    if (original) {
      setDrafts((current) => ({
        ...current,
        [serviceId]: { name: original.name, description: original.description },
      }));
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await saveServiceVisibility(id, enabled, organizationId);
      setData((current) => ({
        ...current,
        services: current.services.map((service) => (service.id === id ? { ...service, enabled } : service)),
      }));
      flash(enabled ? 'Servicio visible en la página.' : 'Servicio oculto en la página.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la visibilidad.');
    }
  };

  return (
    <AppFrame area="admin">
      <style>{siteEditorStyles}</style>
      <PageHeading
        eyebrow="EDITOR DEL SITIO"
        title="Servicios"
        description="Edita los nombres, resúmenes y visibilidad de las familias que aparecen en la web."
        action={
          <Link className="button button-outline" to="/servicios" target="_blank" rel="noreferrer">
            Ver página pública <ArrowUpRight size={16} />
          </Link>
        }
      />
      <SiteAdminNav active="/admin/servicios" />

      {error && (
        <div className="op-flow-alert error" role="alert" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Executive KPI Strip */}
      <section className="site-admin-kpi-grid" aria-label="Resumen ejecutivo de servicios">
        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon purple" aria-hidden="true">
            <Layers size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">Total familias</span>
            <strong className="site-admin-kpi-value">{totalServices}</strong>
            <small className="site-admin-kpi-hint">Especialidades activas</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon emerald" aria-hidden="true">
            <Eye size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">Visibles en la web</span>
            <strong className="site-admin-kpi-value">{visibleCount}</strong>
            <small className="site-admin-kpi-hint">Publicados en el sitio</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon amber" aria-hidden="true">
            <EyeOff size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">Ocultas</span>
            <strong className="site-admin-kpi-value">{hiddenCount}</strong>
            <small className="site-admin-kpi-hint">En revisión o pausadas</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon blue" aria-hidden="true">
            <FileCheck size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">Estado de textos</span>
            <strong className="site-admin-kpi-value">
              {completeTextCount}/{totalServices}
            </strong>
            <small className="site-admin-kpi-hint">Nombre y descripción listos</small>
          </div>
        </article>
      </section>

      {/* Toolbar with Search, Filter Pills & Bulk Save */}
      <div className="site-admin-toolbar" role="toolbar" aria-label="Controles de búsqueda y filtro de servicios">
        <div className="site-admin-toolbar-left">
          <div className="search-box site-admin-search-box">
            <Search className="search-icon" size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar familia de servicio por nombre o descripción"
              placeholder="Buscar familia de servicio por nombre o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="site-admin-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="site-admin-filters" role="group" aria-label="Filtrar por visibilidad">
            <button
              type="button"
              className={`site-filter-pill ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              Todos ({totalServices})
            </button>
            <button
              type="button"
              className={`site-filter-pill ${filter === 'visible' ? 'is-active' : ''}`}
              onClick={() => setFilter('visible')}
            >
              Visibles ({visibleCount})
            </button>
            <button
              type="button"
              className={`site-filter-pill ${filter === 'hidden' ? 'is-active' : ''}`}
              onClick={() => setFilter('hidden')}
            >
              Ocultos ({hiddenCount})
            </button>
          </div>
        </div>

        <div className="site-admin-toolbar-actions">
          {dirtyCount > 0 && (
            <button
              className="button button-dark"
              type="button"
              onClick={() => void saveAll()}
              disabled={!canEdit || isSavingAll}
              aria-label={`Guardar todos los ${dirtyCount} servicios con cambios`}
            >
              <Save size={15} />
              {isSavingAll ? 'Guardando todos…' : `Guardar todos (${dirtyCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Service Family Cards */}
      <div className="site-service-editor-grid">
        {filteredServices.map((service) => {
          const draft = drafts[service.id] || { name: service.name, description: service.description };
          const isDirty = draft.name !== service.name || draft.description !== service.description;
          const ServiceIcon = serviceIcons[service.id] || Sparkles;
          const charPercent = Math.min(100, Math.round((draft.description.length / 220) * 100));

          return (
            <form
              className="panel site-service-editor"
              key={service.id}
              onSubmit={(event) => void save(event, service.id)}
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">FAMILIA DE SERVICIO</span>
                  <h2>{service.name}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {isDirty && (
                    <span className="site-dirty-badge" role="status">
                      <AlertCircle size={12} aria-hidden="true" /> Sin guardar
                    </span>
                  )}
                  <span className={`site-content-status${service.enabled ? ' published' : ''}`}>
                    {service.enabled ? 'Visible' : 'Oculto'}
                  </span>
                </div>
              </div>

              <label>
                Nombre visible
                <input
                  disabled={!canEdit}
                  required
                  maxLength={90}
                  value={draft.name}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [service.id]: { ...draft, name: event.target.value },
                    }))
                  }
                />
              </label>

              <label>
                Resumen
                <textarea
                  disabled={!canEdit}
                  rows={3}
                  maxLength={220}
                  value={draft.description}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [service.id]: { ...draft, description: event.target.value },
                    }))
                  }
                />
                <div className="site-char-counter-wrap">
                  <div
                    className="site-char-meter"
                    role="progressbar"
                    aria-valuenow={draft.description.length}
                    aria-valuemin={0}
                    aria-valuemax={220}
                    aria-label="Límite de caracteres para el resumen"
                  >
                    <div
                      className="site-char-meter-fill"
                      style={{
                        width: `${charPercent}%`,
                        background:
                          draft.description.length > 200
                            ? '#e11d48'
                            : draft.description.length > 160
                            ? '#f59e0b'
                            : '#8e1787',
                      }}
                    />
                  </div>
                  <small className="field-hint">{draft.description.length}/220 caracteres</small>
                </div>
              </label>

              {/* Live mini-preview of how the service card appears on /servicios */}
              <div className="site-service-mini-preview" aria-label={`Vista previa de ${draft.name || service.name}`}>
                <div className="site-service-mini-preview-header">
                  <span className="site-service-mini-tag">VISTA PREVIA EN /SERVICIOS</span>
                  <span className="site-service-mini-icon">
                    <ServiceIcon size={15} aria-hidden="true" />
                  </span>
                </div>
                <h3 className="site-service-mini-title">{draft.name.trim() || service.name}</h3>
                <p className="site-service-mini-desc">
                  {draft.description.trim() ||
                    'Sin descripción. Este texto se muestra en las tarjetas interactivas de la página de servicios.'}
                </p>
                <span className="site-service-mini-cta" aria-hidden="true">
                  Solicitar cotización →
                </span>
              </div>

              <div className="site-service-actions">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="button button-dark"
                    type="submit"
                    disabled={!canEdit || savingId === service.id || isSavingAll}
                  >
                    <Save size={15} />
                    {savingId === service.id ? 'Guardando…' : 'Guardar texto'}
                  </button>
                  {isDirty && (
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => discardChanges(service.id)}
                      disabled={!canEdit || savingId === service.id || isSavingAll}
                    >
                      <RotateCcw size={14} />
                      Descartar cambios
                    </button>
                  )}
                </div>
                <label className="site-service-visibility">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={service.enabled}
                    onChange={(event) => void toggle(service.id, event.target.checked)}
                  />{' '}
                  Mostrar en el sitio
                </label>
              </div>
            </form>
          );
        })}
      </div>

      {filteredServices.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: '#6b7280' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            No se encontraron familias de servicio que coincidan con los filtros.
          </p>
        </div>
      )}

      {!canEdit && (
        <div className="notice-box" style={{ marginTop: 20 }}>
          <span>
            <Check size={17} />
          </span>
          <div>
            <b>Acceso de solo lectura</b>
            <p>Tu perfil puede consultar estos servicios, pero no tiene permiso para editarlos.</p>
          </div>
        </div>
      )}
    </AppFrame>
  );
}

export function ContactAdminPage() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const canEdit = hasPermission('website', 'edit');
  const [draft, setDraft] = useState(data.settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(data.settings);
  }, [data.settings]);

  const isDirty = useMemo(() => {
    return (
      (draft.location || '') !== (data.settings.location || '') ||
      (draft.contactPhone || '') !== (data.settings.contactPhone || '') ||
      (draft.whatsappSecondary || '') !== (data.settings.whatsappSecondary || '') ||
      (draft.instagram || '') !== (data.settings.instagram || '') ||
      (draft.facebook || '') !== (data.settings.facebook || '') ||
      (draft.tiktok || '') !== (data.settings.tiktok || '')
    );
  }, [draft, data.settings]);

  const mainWa = useMemo(() => normalizeWhatsApp(draft.contactPhone), [draft.contactPhone]);
  const secondaryWa = useMemo(() => normalizeWhatsApp(draft.whatsappSecondary || ''), [draft.whatsappSecondary]);

  const igUrl = useMemo(() => resolveSocialUrl('instagram', draft.instagram || ''), [draft.instagram]);
  const fbUrl = useMemo(() => resolveSocialUrl('facebook', draft.facebook || ''), [draft.facebook]);
  const ttUrl = useMemo(() => resolveSocialUrl('tiktok', draft.tiktok || ''), [draft.tiktok]);

  // Executive KPI metrics
  const activeChannelsCount = useMemo(() => {
    const list = [
      draft.location,
      draft.contactPhone,
      draft.whatsappSecondary,
      draft.instagram,
      draft.facebook,
      draft.tiktok,
    ];
    return list.filter((item) => Boolean(String(item || '').trim())).length;
  }, [draft]);

  const socialsConnectedCount = useMemo(() => {
    return [igUrl, fbUrl, ttUrl].filter(Boolean).length;
  }, [igUrl, fbUrl, ttUrl]);

  const locationVerified = Boolean(String(draft.location || '').trim());
  const whatsappOperational = Boolean(mainWa.international);

  const resetDraft = () => {
    setDraft(data.settings);
  };

  const usePresetLocation = () => {
    setDraft((current) => ({
      ...current,
      location: 'Av. Juan X. Marcos y calle 5ta, Milagro, Guayas, Ecuador',
    }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    setError('');
    try {
      await saveWebsiteSettings(draft, organizationId);
      setData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          location: draft.location,
          contactPhone: draft.contactPhone,
          whatsappSecondary: draft.whatsappSecondary,
          instagram: draft.instagram,
          facebook: draft.facebook,
          tiktok: draft.tiktok,
        },
      }));
      flash('Datos de contacto guardados.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppFrame area="admin">
      <style>{siteEditorStyles}</style>
      <PageHeading
        eyebrow="EDITOR DEL SITIO"
        title="Contacto"
        description="Actualiza los datos que se muestran en la web. Verifica cada valor antes de guardarlo."
        action={
          <Link className="button button-outline" to="/contacto" target="_blank" rel="noreferrer">
            Ver página pública <ArrowUpRight size={16} />
          </Link>
        }
      />
      <SiteAdminNav active="/admin/contacto" />

      {/* 1. Executive KPI Strip */}
      <section className="site-admin-kpi-grid" aria-label="Estado general de canales de contacto">
        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon purple" aria-hidden="true">
            <Globe size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">Canales activos</span>
            <strong className="site-admin-kpi-value">{activeChannelsCount}/6</strong>
            <small className="site-admin-kpi-hint">Canales configurados</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className={`site-admin-kpi-icon ${whatsappOperational ? 'emerald' : 'amber'}`} aria-hidden="true">
            <MessageCircle size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">WhatsApp ventas</span>
            <strong className="site-admin-kpi-value">{whatsappOperational ? 'Operativo' : 'Sin número'}</strong>
            <small className="site-admin-kpi-hint">{mainWa.display || 'Falta configurar'}</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className={`site-admin-kpi-icon ${socialsConnectedCount > 0 ? 'blue' : 'amber'}`} aria-hidden="true">
            <Share2 size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">Redes conectadas</span>
            <strong className="site-admin-kpi-value">{socialsConnectedCount}/3</strong>
            <small className="site-admin-kpi-hint">Instagram, FB, TikTok</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className={`site-admin-kpi-icon ${locationVerified ? 'emerald' : 'amber'}`} aria-hidden="true">
            <MapPin size={19} />
          </div>
          <div className="site-admin-kpi-info">
            <span className="site-admin-kpi-label">Ubicación verificada</span>
            <strong className="site-admin-kpi-value">{locationVerified ? 'Verificada' : 'Pendiente'}</strong>
            <small className="site-admin-kpi-hint">{locationVerified ? 'Milagro, Guayas' : 'Falta dirección'}</small>
          </div>
        </article>
      </section>

      {/* 2. Two-Column Layout */}
      <div className="site-contact-admin-layout">
        {/* Left Column: Form Editor */}
        <form className="panel form-panel site-contact-editor" onSubmit={save}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DATOS COMPARTIDOS</span>
              <h2>Configuración de contacto</h2>
            </div>
            <Phone size={19} aria-hidden="true" />
          </div>

          {error && (
            <div className="op-flow-alert error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {isDirty && (
            <div className="site-dirty-banner" role="status">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={15} /> Tienes cambios sin guardar en los datos de contacto.
              </span>
              <button
                type="button"
                className="button button-outline button-small"
                style={{ fontSize: 10, padding: '3px 8px', height: 26 }}
                onClick={resetDraft}
              >
                <RotateCcw size={12} /> Restaurar valores guardados
              </button>
            </div>
          )}

          {/* Section 1: Ubicación y atención */}
          <section className="site-contact-section" aria-labelledby="section-location-heading">
            <div className="site-contact-section-title" id="section-location-heading">
              <MapPin size={16} aria-hidden="true" />
              <span>Ubicación y atención</span>
            </div>
            <label>
              Ubicación física del local
              <input
                disabled={!canEdit}
                placeholder="Ej. Av. Juan X. Marcos y calle 5ta, Milagro, Ecuador"
                value={draft.location}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              />
            </label>
            <div className="site-field-helper">
              <span>Se utiliza en el pie del sitio web, sección de mapa y consultas de clientes.</span>
              <button
                type="button"
                className="button button-outline"
                style={{ fontSize: 10, padding: '2px 8px', height: 24, cursor: 'pointer' }}
                onClick={usePresetLocation}
                disabled={!canEdit}
              >
                Usar dirección matriz
              </button>
            </div>
          </section>

          {/* Section 2: Líneas de WhatsApp y ventas */}
          <section className="site-contact-section" aria-labelledby="section-whatsapp-heading">
            <div className="site-contact-section-title" id="section-whatsapp-heading">
              <MessageCircle size={16} aria-hidden="true" />
              <span>Líneas de WhatsApp y ventas</span>
            </div>

            <label>
              WhatsApp principal
              <input
                disabled={!canEdit}
                inputMode="tel"
                placeholder="0999999999 o +593999999999"
                value={draft.contactPhone}
                onChange={(event) => setDraft({ ...draft, contactPhone: event.target.value })}
              />
              <div className="site-field-helper">
                <span>
                  Normalizado para enlaces directos: <b>{mainWa.display}</b>
                </span>
                {mainWa.url && (
                  <a href={mainWa.url} target="_blank" rel="noreferrer">
                    Probar WhatsApp <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
              </div>
            </label>

            <label>
              WhatsApp alternativo (opcional)
              <input
                disabled={!canEdit}
                inputMode="tel"
                placeholder="0988888888 o +593988888888"
                value={draft.whatsappSecondary || ''}
                onChange={(event) => setDraft({ ...draft, whatsappSecondary: event.target.value })}
              />
              <div className="site-field-helper">
                <span>
                  Línea secundaria: <b>{secondaryWa.display}</b>
                </span>
                {secondaryWa.url && (
                  <a href={secondaryWa.url} target="_blank" rel="noreferrer">
                    Probar WhatsApp <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
              </div>
            </label>
          </section>

          {/* Section 3: Redes sociales oficiales */}
          <section className="site-contact-section" aria-labelledby="section-social-heading">
            <div className="site-contact-section-title" id="section-social-heading">
              <Share2 size={16} aria-hidden="true" />
              <span>Redes sociales oficiales</span>
            </div>
            <p className="panel-intro" style={{ margin: 0, fontSize: 10.5 }}>
              Ingresa el usuario con @ (ej. @visualcorp.ec) o el enlace completo de la cuenta.
            </p>

            <label>
              Instagram
              <input
                disabled={!canEdit}
                autoComplete="url"
                placeholder="@usuario o URL del perfil"
                value={draft.instagram || ''}
                onChange={(event) => setDraft({ ...draft, instagram: event.target.value })}
              />
              {igUrl && (
                <div className="site-field-helper">
                  <span>Enlace detectado: {igUrl}</span>
                  <a href={igUrl} target="_blank" rel="noreferrer">
                    Abrir perfil <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
              )}
            </label>

            <label>
              Facebook
              <input
                disabled={!canEdit}
                autoComplete="url"
                placeholder="URL o nombre de la página"
                value={draft.facebook || ''}
                onChange={(event) => setDraft({ ...draft, facebook: event.target.value })}
              />
              {fbUrl && (
                <div className="site-field-helper">
                  <span>Enlace detectado: {fbUrl}</span>
                  <a href={fbUrl} target="_blank" rel="noreferrer">
                    Abrir perfil <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
              )}
            </label>

            <label>
              TikTok
              <input
                disabled={!canEdit}
                autoComplete="url"
                placeholder="@usuario o URL del perfil"
                value={draft.tiktok || ''}
                onChange={(event) => setDraft({ ...draft, tiktok: event.target.value })}
              />
              {ttUrl && (
                <div className="site-field-helper">
                  <span>Enlace detectado: {ttUrl}</span>
                  <a href={ttUrl} target="_blank" rel="noreferrer">
                    Abrir perfil <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
              )}
            </label>
          </section>

          <button className="button button-dark" type="submit" disabled={!canEdit || saving}>
            <Check size={16} />
            {saving ? 'Guardando…' : 'Guardar contacto'}
          </button>
        </form>

        {/* Right Column: Live Interactive Preview Panel */}
        <aside className="site-contact-preview-panel" aria-label="Previsualización en tiempo real de canales públicos">
          <div className="site-contact-preview-header">
            <div>
              <span style={{ fontSize: 9, fontWeight: 750, letterSpacing: '0.08em', color: '#8e92a8', display: 'block' }}>
                VISTA PREVIA EN VIVO
              </span>
              <strong style={{ fontSize: 13, color: '#fff' }}>Tarjeta de contacto (/contacto)</strong>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10,
                color: '#6ee7b7',
                background: 'rgba(16, 185, 129, 0.12)',
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }}
              />{' '}
              Pública
            </span>
          </div>

          <div className="site-contact-preview-body">
            {/* Location card */}
            <div className="site-contact-preview-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(229,0,126,0.18)',
                    color: '#ff3da3',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <small style={{ fontSize: 8.5, letterSpacing: '0.06em', color: '#9ca3af', textTransform: 'uppercase' }}>
                    VISÍTANOS EN
                  </small>
                  <strong style={{ display: 'block', fontSize: 12.5, color: '#fff', margin: '1px 0 2px' }}>
                    Milagro, Ecuador
                  </strong>
                  <span style={{ display: 'block', fontSize: 10.5, color: '#a5a9bd', lineHeight: 1.4 }}>
                    {draft.location || 'Sin dirección ingresada'}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct WhatsApp Callouts */}
            <div style={{ display: 'grid', gap: 6 }}>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: whatsappOperational ? 'rgba(34, 197, 94, 0.14)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${whatsappOperational ? 'rgba(34, 197, 94, 0.28)' : 'rgba(255, 255, 255, 0.08)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: whatsappOperational ? '#86efac' : '#9ca3af',
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <MessageCircle size={15} />
                  Escribir al WhatsApp principal
                </span>
                <span style={{ fontSize: 10, color: whatsappOperational ? '#bbf7d0' : '#6b7280' }}>
                  {mainWa.display}
                </span>
              </div>

              {secondaryWa.international && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: '#86efac',
                    fontSize: 11,
                    fontWeight: 650,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <MessageCircle size={15} />
                    WhatsApp secundario
                  </span>
                  <span style={{ fontSize: 10, color: '#bbf7d0' }}>{secondaryWa.display}</span>
                </div>
              )}
            </div>

            {/* Social Channels Preview List */}
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 750, letterSpacing: '0.07em', color: '#8e92a8', textTransform: 'uppercase' }}>
                CANALES SOCIALES DETECTADOS
              </span>

              <div className="site-preview-channel-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#e1306c', fontWeight: 700 }}>Instagram</span>
                  <span style={{ color: '#9ca3af', fontSize: 10.5 }}>{formatSocialDisplay(draft.instagram || '')}</span>
                </div>
                <span className={`site-preview-status-badge ${igUrl ? 'connected' : 'pending'}`}>
                  {igUrl ? 'Conectado' : 'Pendiente'}
                </span>
              </div>

              <div className="site-preview-channel-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#1877f2', fontWeight: 700 }}>Facebook</span>
                  <span style={{ color: '#9ca3af', fontSize: 10.5 }}>{formatSocialDisplay(draft.facebook || '')}</span>
                </div>
                <span className={`site-preview-status-badge ${fbUrl ? 'connected' : 'pending'}`}>
                  {fbUrl ? 'Conectado' : 'Pendiente'}
                </span>
              </div>

              <div className="site-preview-channel-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#00f2fe', fontWeight: 700 }}>TikTok</span>
                  <span style={{ color: '#9ca3af', fontSize: 10.5 }}>{formatSocialDisplay(draft.tiktok || '')}</span>
                </div>
                <span className={`site-preview-status-badge ${ttUrl ? 'connected' : 'pending'}`}>
                  {ttUrl ? 'Conectado' : 'Pendiente'}
                </span>
              </div>
            </div>

            {/* Diagnostic Checklist */}
            <div className="site-contact-diagnostic-list" aria-label="Diagnóstico de integridad de canales">
              <span style={{ fontSize: 9, fontWeight: 750, letterSpacing: '0.07em', color: '#8e92a8', textTransform: 'uppercase', marginBottom: 2 }}>
                DIAGNÓSTICO DE INTEGRIDAD
              </span>

              <div className={`site-diagnostic-item ${locationVerified ? 'is-ready' : ''}`}>
                {locationVerified ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                <span>Ubicación física: {locationVerified ? 'Completa y georreferenciable' : 'Falta dirección'}</span>
              </div>

              <div className={`site-diagnostic-item ${whatsappOperational ? 'is-ready' : ''}`}>
                {whatsappOperational ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                <span>Línea principal: {whatsappOperational ? `${mainWa.display} verificado` : 'Sin WhatsApp configurado'}</span>
              </div>

              <div className={`site-diagnostic-item ${secondaryWa.international ? 'is-ready' : ''}`}>
                {secondaryWa.international ? <CheckCircle2 size={13} /> : <ChevronRight size={13} />}
                <span>
                  Línea secundaria:{' '}
                  {secondaryWa.international ? `${secondaryWa.display} lista` : 'Opcional (no establecida)'}
                </span>
              </div>

              <div className={`site-diagnostic-item ${socialsConnectedCount >= 2 ? 'is-ready' : ''}`}>
                {socialsConnectedCount >= 2 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                <span>Redes oficiales: {socialsConnectedCount} de 3 perfiles listos para redirigir</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </AppFrame>
  );
}
