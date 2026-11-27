import { useMemo, useState, type FormEvent } from 'react';
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
  Phone,
  RotateCcw,
  Save,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { saveServiceVisibility, saveWebsiteSettings } from '../../lib/websiteAdminRepository';
import { usePersistentDraft } from '../../lib/usePersistentDraft';
import { DraftRecoveryBanner, PublishConfirmBar } from '../../components/ui/PublishConfirmBar';
import { Dialog, useConfirm } from '../../components/ui/OperationalKit';
import { ServiceCard } from '../../public-site/PublicSite';
import { publicAddress } from '../../public-site/content';
import { SiteAdminNav } from './SiteAdminNav';

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
  border: 1px solid var(--admin-frosted-border, #ebe8ef);
  border-radius: 14px;
  background: var(--admin-frosted-bg, #fff);
  backdrop-filter: blur(var(--admin-frosted-blur, 16px));
  -webkit-backdrop-filter: blur(var(--admin-frosted-blur, 16px));
  box-shadow: var(--admin-frosted-shadow, 0 2px 8px rgba(0,0,0,0.03));
  transition: transform 0.18s ease, border-color 0.18s ease;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.site-admin-kpi-card:hover {
  transform: translateY(-1px);
  border-color: rgba(165, 16, 145, 0.36);
}
.site-admin-kpi-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.site-admin-kpi-icon.purple { background: rgba(165, 16, 145, 0.12); color: #a51091; }
.site-admin-kpi-icon.blue { background: rgba(14, 165, 233, 0.14); color: #0284c7; }
.site-admin-kpi-icon.amber { background: rgba(245, 158, 11, 0.14); color: #d97706; }
.site-admin-kpi-icon.emerald { background: rgba(16, 185, 129, 0.14); color: #16a34a; }
.site-admin-kpi-info {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.site-admin-kpi-label {
  font-size: 10.5px;
  color: var(--admin-glass-muted, #6b7280);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.site-admin-kpi-value {
  font-size: 19px;
  font-weight: 750;
  color: var(--admin-glass-ink, #111827);
  line-height: 1.2;
}
.site-admin-kpi-hint {
  font-size: 10px;
  color: var(--admin-glass-muted, #9ca3af);
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
  border: 1px solid var(--admin-frosted-border, #ecebf0);
  border-radius: 14px;
  background: var(--admin-frosted-bg, #fafafc);
  backdrop-filter: blur(var(--admin-frosted-blur, 14px));
  -webkit-backdrop-filter: blur(var(--admin-frosted-blur, 14px));
  box-sizing: border-box;
  max-width: 100%;
}
.site-admin-toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 240px;
  flex-wrap: wrap;
}
.site-admin-search-box {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 420px;
}
.site-admin-search-box svg.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--admin-glass-muted, #9ca3af);
  pointer-events: none;
}
.site-admin-search-box input {
  width: 100%;
  height: 36px;
  padding: 0 30px 0 33px;
  border: 1px solid var(--admin-frosted-border, #e4e4e9);
  border-radius: 9px;
  background: var(--admin-clear-bg, #fff);
  color: var(--admin-glass-ink, #252630);
  font-size: 11px;
  box-sizing: border-box;
}
.site-admin-search-box input:focus {
  outline: 2px solid #a51091;
  border-color: #a51091;
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
  background: var(--admin-clear-bg, #e5e7eb);
  color: var(--admin-glass-muted, #4b5563);
  cursor: pointer;
}
.site-admin-filters {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--admin-frosted-border, #e4e4e9);
  border-radius: 9px;
  background: var(--admin-clear-bg, #fff);
}
.site-filter-pill {
  padding: 5px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--admin-glass-muted, #6b7280);
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
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.32);
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
  background: var(--admin-clear-bg, #ecebf0);
  border-radius: 999px;
  overflow: hidden;
}
.site-char-meter-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.2s ease, background 0.2s ease;
}
.vc-service-preview-stage {
  margin-top: 4px;
  padding: 12px;
  border-radius: 14px;
  background: radial-gradient(circle at 80% 10%, rgba(39, 213, 236, 0.12), transparent 52%),
              radial-gradient(circle at 15% 20%, rgba(165, 16, 145, 0.16), transparent 55%),
              #0d0c14;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f4f1f8;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
}
.vc-service-preview-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 9.5px;
  font-weight: 750;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(235, 232, 246, 0.68);
}
.vc-service-preview-stage .site-service-card-link.is-preview {
  display: block;
  text-decoration: none;
  color: inherit;
}
.vc-service-preview-stage .site-service-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f4f1f8;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.vc-service-preview-stage .site-service-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.vc-service-preview-stage .site-service-index {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #27d5ec;
}
.vc-service-preview-stage .site-service-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: rgba(165, 16, 145, 0.22);
  color: #f472b6;
}
.vc-service-preview-stage .site-service-card-3d-wrap {
  max-height: 44px;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.vc-service-preview-stage .site-service-card-3d-wrap img {
  max-height: 42px;
  width: auto;
  object-fit: contain;
}
.vc-service-preview-stage .site-service-card h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 750;
  color: #ffffff;
}
.vc-service-preview-stage .site-service-card p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: rgba(235, 232, 246, 0.78);
}
.vc-service-preview-stage .site-service-tags-label {
  font-size: 9px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(235, 232, 246, 0.56);
}
.vc-service-preview-stage .site-service-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.vc-service-preview-stage .site-service-tags li {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #e6e4f2;
}
.vc-service-preview-stage .site-card-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #27d5ec;
  margin-top: 4px;
}
.vc-services-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.site-contact-admin-layout {
  display: grid;
  grid-template-columns: minmax(320px, 1.15fr) minmax(300px, 0.85fr);
  gap: 18px;
  align-items: start;
  box-sizing: border-box;
  max-width: 100%;
}
.site-contact-section {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--admin-frosted-border, #ebe8ef);
  border-radius: 12px;
  background: var(--admin-clear-bg, #fafafc);
  margin-bottom: 12px;
  box-sizing: border-box;
}
.site-contact-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 750;
  color: var(--admin-glass-ink, #2b2b36);
}
.site-contact-section-title svg {
  color: #a51091;
}
.site-field-helper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  color: var(--admin-glass-muted, #6b7280);
  margin-top: 4px;
  flex-wrap: wrap;
}
.site-field-helper a {
  color: #a51091;
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
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.34);
  color: #92400e;
  font-size: 11px;
  font-weight: 650;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.site-contact-preview-panel {
  position: sticky;
  top: 16px;
  border-radius: 16px;
  background: radial-gradient(circle at 80% 10%, rgba(39, 213, 236, 0.1), transparent 55%),
              #0d0f17;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  color: #f1f3f9;
  overflow: hidden;
  box-sizing: border-box;
  max-width: 100%;
}
.site-contact-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.site-contact-preview-body {
  padding: 16px;
  display: grid;
  gap: 12px;
  box-sizing: border-box;
}
.site-contact-preview-card {
  padding: 13px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  backdrop-filter: blur(10px);
}
.site-preview-channel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
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
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
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
.work-app.theme-dark .site-dirty-badge,
.work-app.theme-dark .site-dirty-banner {
  color: #fcd34d;
}
.work-app.theme-dark .site-field-helper a {
  color: #f0abfc;
}
@media (max-width: 1260px) {
  .site-admin-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 960px) {
  .site-contact-admin-layout,
  .vc-services-modal-grid {
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

type ServiceDraftMap = Record<string, { name: string; description: string }>;

export function ServicesAdminPage() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasPermission('website', 'edit');
  const [savingId, setSavingId] = useState('');
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  const serverDrafts = useMemo<ServiceDraftMap>(
    () =>
      Object.fromEntries(
        data.services.map((service) => [service.id, { name: service.name, description: service.description }])
      ),
    [data.services]
  );

  const {
    draft: drafts,
    setDraft: setDrafts,
    isDirty: anyServicesDirty,
    draftSavedAt,
    isRecovered,
    pendingRecovery,
    recoverDraft,
    dismissRecovery,
    discardDraft,
    markSaved,
  } = usePersistentDraft<ServiceDraftMap>({
    orgId: organizationId,
    draftKey: 'services',
    serverValue: serverDrafts,
    enabled: data.services.length > 0,
  });

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
    const original = data.services.find((service) => service.id === serviceId);
    if (!draft?.name.trim()) {
      setError('Cada servicio necesita un nombre.');
      return;
    }
    const accepted = await confirm({
      eyebrow: 'CONFIRMAR PUBLICACIÓN',
      title: `¿Publicar cambios en "${draft.name.trim()}"?`,
      description:
        'El nombre y resumen de esta familia se actualizarán de inmediato en la portada, /servicios y cotizador.',
      summaryItems: [
        { label: 'Nombre visible', value: draft.name.trim() },
        { label: 'Estado en la web', value: original?.enabled ? 'Visible' : 'Oculto' },
      ],
      tone: 'brand',
      confirmLabel: 'Publicar servicio',
      cancelLabel: 'Revisar antes',
    });
    if (!accepted) return;

    setSavingId(serviceId);
    setError('');
    try {
      const trimmedName = draft.name.trim();
      const trimmedDesc = draft.description.trim();
      const { data: row, error: saveError } = await supabase
        .from('services')
        .update({
          name: trimmedName,
          short: trimmedDesc,
          detail: trimmedDesc,
          updated_at: new Date().toISOString(),
        })
        .eq('id', serviceId)
        .eq('organization_id', organizationId)
        .select('id')
        .single();
      if (saveError) throw saveError;
      if (!row) throw new Error('No se encontró el servicio para guardar.');
      const nextDrafts: ServiceDraftMap = {
        ...drafts,
        [serviceId]: { name: trimmedName, description: trimmedDesc },
      };
      setDrafts(nextDrafts);
      if (dirtyCount <= 1) {
        markSaved({
          ...serverDrafts,
          [serviceId]: { name: trimmedName, description: trimmedDesc },
        });
      }
      setData((current) => ({
        ...current,
        services: current.services.map((service) =>
          service.id === serviceId
            ? { ...service, name: trimmedName, description: trimmedDesc }
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
          const trimmedName = draft.name.trim();
          const trimmedDesc = draft.description.trim();
          const { data: row, error: saveError } = await supabase
            .from('services')
            .update({
              name: trimmedName,
              short: trimmedDesc,
              detail: trimmedDesc,
              updated_at: new Date().toISOString(),
            })
            .eq('id', service.id)
            .eq('organization_id', organizationId)
            .select('id')
            .single();
          if (saveError) throw saveError;
          if (!row) throw new Error(`No se encontró el servicio "${service.name}".`);
          return { id: service.id, name: trimmedName, description: trimmedDesc };
        })
      );
      const updatedMap = new Map(results.map((r) => [r.id, r]));
      const nextSavedSnapshot: ServiceDraftMap = Object.fromEntries(
        data.services.map((service) => {
          const updated = updatedMap.get(service.id);
          return [
            service.id,
            updated
              ? { name: updated.name, description: updated.description }
              : { name: service.name, description: service.description },
          ];
        })
      );
      setData((current) => ({
        ...current,
        services: current.services.map((service) => {
          const updated = updatedMap.get(service.id);
          return updated ? { ...service, name: updated.name, description: updated.description } : service;
        }),
      }));
      markSaved(nextSavedSnapshot);
      flash(`${dirtyServices.length} ${dirtyServices.length === 1 ? 'servicio guardado' : 'servicios guardados'} en la web.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los servicios.');
    } finally {
      setIsSavingAll(false);
    }
  };

  const discardChanges = async (serviceId: string) => {
    const original = data.services.find((s) => s.id === serviceId);
    if (!original) return;
    const accepted = await confirm({
      eyebrow: 'DESCARTAR EDICIÓN DE FAMILIA',
      title: `¿Descartar los cambios en "${original.name}"?`,
      description: 'Esta tarjeta recuperará el nombre y resumen publicados actualmente.',
      tone: 'danger',
      destructive: true,
      confirmLabel: 'Sí, descartar',
      cancelLabel: 'Seguir editando',
    });
    if (!accepted) return;
    setDrafts((current) => ({
      ...current,
      [serviceId]: { name: original.name, description: original.description },
    }));
  };

  const toggle = async (id: string, enabled: boolean) => {
    const target = data.services.find((service) => service.id === id);
    if (!target) return;
    const accepted = await confirm({
      eyebrow: 'VISIBILIDAD EN EL SITIO',
      title: enabled
        ? `¿Mostrar "${target.name}" en el sitio público?`
        : `¿Ocultar "${target.name}" del sitio público?`,
      description: enabled
        ? 'La familia volverá a mostrarse en portada (/) y en /servicios.'
        : 'La familia dejará de aparecer en el sitio público hasta que vuelvas a activarla.',
      tone: enabled ? 'brand' : 'warning',
      confirmLabel: enabled ? 'Sí, mostrar' : 'Sí, ocultar',
      cancelLabel: 'Cancelar',
    });
    if (!accepted) return;
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

      <DraftRecoveryBanner
        pendingRecovery={pendingRecovery}
        itemLabel="las familias de servicio"
        onRecover={recoverDraft}
        onDismiss={dismissRecovery}
      />

      <PublishConfirmBar
        isDirty={anyServicesDirty || dirtyCount > 0}
        isRecovered={isRecovered}
        draftSavedAt={draftSavedAt}
        sectionName="Familias de servicio (/servicios)"
        statusNote={
          dirtyCount > 0
            ? `${dirtyCount} ${dirtyCount === 1 ? 'familia con cambios locales pendientes' : 'familias con cambios locales pendientes'} de publicación.`
            : undefined
        }
        canPublish={canEdit && dirtyCount > 0}
        publishing={isSavingAll}
        previewLabel="Vista previa de tarjetas"
        publishLabel={dirtyCount > 0 ? `Publicar cambios (${dirtyCount})` : 'Publicar en vivo'}
        publishConfirmTitle={`¿Publicar ${dirtyCount} ${dirtyCount === 1 ? 'familia editada' : 'familias editadas'} en /servicios?`}
        publishConfirmDescription="Los nuevos títulos y resúmenes serán visibles de inmediato en la portada (/), en /servicios y en el selector de cotizaciones."
        publishSummaryItems={dirtyServices.slice(0, 5).map((service) => ({
          label: service.name,
          value: drafts[service.id]?.name.trim() || service.name,
        }))}
        publishConsequences={[
          'Se actualizarán en vivo todas las familias editadas.',
          'Las familias ocultas conservan sus nuevos textos hasta que las actives.',
        ]}
        onPreview={() => setPreviewOpen(true)}
        onDiscard={discardDraft}
        onPublish={saveAll}
      />

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
              {isSavingAll ? 'Guardando todos…' : `Publicar cambios (${dirtyCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Service Family Cards */}
      <div className="site-service-editor-grid">
        {filteredServices.map((service, idx) => {
          const draft = drafts[service.id] || { name: service.name, description: service.description };
          const isDirty = draft.name !== service.name || draft.description !== service.description;
          const charPercent = Math.min(100, Math.round((draft.description.length / 220) * 100));
          const previewService = {
            ...service,
            name: draft.name.trim() || service.name,
            description:
              draft.description.trim() ||
              'Sin descripción. Este texto se muestra en las tarjetas interactivas de la página de servicios.',
          };

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

              {/* Faithful preview using shared ServiceCard component */}
              <div className="vc-service-preview-stage" aria-label={`Vista previa de ${previewService.name}`}>
                <div className="vc-service-preview-caption">
                  <span>VISTA PREVIA REAL EN /SERVICIOS</span>
                  <span>{service.enabled ? 'VISIBLE' : 'OCULTA EN WEB'}</span>
                </div>
                <ServiceCard service={previewService} index={idx} previewOnly />
              </div>

              <div className="site-service-actions">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="button button-dark"
                    type="submit"
                    disabled={!canEdit || !isDirty || savingId === service.id || isSavingAll}
                  >
                    <Save size={15} />
                    {savingId === service.id ? 'Publicando…' : 'Publicar servicio'}
                  </button>
                  {isDirty && (
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => void discardChanges(service.id)}
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
        <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--admin-glass-muted, #6b7280)' }}>
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

      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        size="xl"
        tone="brand"
        eyebrow="VISTA PREVIA EN VIVO · /SERVICIOS"
        title="Tarjetas públicas con los borradores actuales"
        description={`Se muestran ${visibleCount} familias visibles en el sitio web y cualquier cambio local aún no publicado.`}
        footer={
          <button type="button" className="button button-outline" onClick={() => setPreviewOpen(false)}>
            Cerrar vista previa
          </button>
        }
      >
        <div className="vc-service-preview-stage" style={{ padding: 16 }}>
          <div className="vc-services-modal-grid">
            {data.services.map((service, idx) => {
              const draft = drafts[service.id] || { name: service.name, description: service.description };
              const previewService = {
                ...service,
                name: draft.name.trim() || service.name,
                description: draft.description.trim() || service.description,
              };
              return (
                <div key={service.id} style={{ opacity: service.enabled ? 1 : 0.45 }}>
                  <div className="vc-service-preview-caption" style={{ marginBottom: 6 }}>
                    <span>{service.enabled ? 'Visible en web' : 'Oculta en web'}</span>
                    <span>{draft.name !== service.name || draft.description !== service.description ? 'Editado' : 'Sincronizado'}</span>
                  </div>
                  <ServiceCard service={previewService} index={idx} previewOnly />
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>
    </AppFrame>
  );
}

type ContactDraft = {
  location: string;
  contactPhone: string;
  whatsappSecondary: string;
  instagram: string;
  facebook: string;
  tiktok: string;
};

export function ContactAdminPage() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasPermission('website', 'edit');
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState('');

  const serverContact = useMemo<ContactDraft>(
    () => ({
      location: String(data.settings?.location || ''),
      contactPhone: String(data.settings?.contactPhone || ''),
      whatsappSecondary: String(data.settings?.whatsappSecondary || ''),
      instagram: String(data.settings?.instagram || ''),
      facebook: String(data.settings?.facebook || ''),
      tiktok: String(data.settings?.tiktok || ''),
    }),
    [
      data.settings?.location,
      data.settings?.contactPhone,
      data.settings?.whatsappSecondary,
      data.settings?.instagram,
      data.settings?.facebook,
      data.settings?.tiktok,
    ]
  );

  const {
    draft,
    setDraft,
    isDirty,
    draftSavedAt,
    isRecovered,
    pendingRecovery,
    recoverDraft,
    dismissRecovery,
    discardDraft,
    markSaved,
  } = usePersistentDraft<ContactDraft>({
    orgId: organizationId,
    draftKey: 'contact',
    serverValue: serverContact,
  });

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

  const handleResetWithConfirm = async () => {
    if (!isDirty && !isRecovered) return;
    const accepted = await confirm({
      eyebrow: 'DESCARTAR CAMBIOS DE CONTACTO',
      title: '¿Restaurar los datos de contacto publicados?',
      description: 'Se perderán tus ediciones locales y se restaurarán los valores actuales en vivo.',
      tone: 'danger',
      destructive: true,
      confirmLabel: 'Sí, restaurar',
      cancelLabel: 'Seguir editando',
    });
    if (accepted) discardDraft();
  };

  const usePresetLocation = async () => {
    if (!canEdit) return;
    if (draft.location.trim() && draft.location.trim() !== publicAddress) {
      const accepted = await confirm({
        eyebrow: 'DIRECCIÓN MATRIZ VERIFICADA',
        title: '¿Reemplazar la ubicación actual con la dirección matriz?',
        description: `Se cargará "${publicAddress}" en tu borrador local de ubicación de pie de página.`,
        tone: 'info',
        confirmLabel: 'Aplicar dirección matriz',
        cancelLabel: 'Mantener actual',
      });
      if (!accepted) return;
    }
    setDraft((current) => ({
      ...current,
      location: publicAddress,
    }));
  };

  const publishContact = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError('');
    const nextSettings = {
      ...(data.settings || {}),
      location: draft.location.trim(),
      contactPhone: draft.contactPhone.trim(),
      whatsappSecondary: draft.whatsappSecondary.trim(),
      instagram: draft.instagram.trim(),
      facebook: draft.facebook.trim(),
      tiktok: draft.tiktok.trim(),
    };
    const savedContact: ContactDraft = {
      location: nextSettings.location,
      contactPhone: nextSettings.contactPhone,
      whatsappSecondary: nextSettings.whatsappSecondary,
      instagram: nextSettings.instagram,
      facebook: nextSettings.facebook,
      tiktok: nextSettings.tiktok,
    };
    try {
      await saveWebsiteSettings(nextSettings, organizationId);
      setData((current) => ({
        ...current,
        settings: nextSettings,
      }));
      markSaved(savedContact);
      flash('Datos de contacto publicados en la web.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || (!isDirty && !isRecovered) || saving) return;
    const accepted = await confirm({
      eyebrow: 'CONFIRMAR PUBLICACIÓN EN VIVO',
      title: '¿Publicar cambios de contacto y redes en la web?',
      description:
        'Se actualizarán el botón de WhatsApp, los enlaces de llamada, las redes sociales y la dirección de pie de página en todo el sitio público.',
      summaryItems: [
        { label: 'WhatsApp principal', value: mainWa.display },
        { label: 'WhatsApp secundario', value: secondaryWa.international ? secondaryWa.display : 'Sin configurar' },
        { label: 'Ubicación pie/nosotros', value: draft.location.trim() || '(sin cambios)' },
      ],
      consequences: [
        'Los enlaces directos de /contacto y el botón flotante de WhatsApp usarán estos números.',
        `La página /contacto mantiene además la matriz fija verificada (${publicAddress}).`,
      ],
      tone: 'brand',
      confirmLabel: 'Publicar en vivo',
      cancelLabel: 'Revisar antes',
    });
    if (accepted) {
      await publishContact();
    }
  };

  const renderContactPreviewContent = () => (
    <div className="site-contact-preview-body">
      {/* Direct Contact Cards aligned with ContactPage */}
      <div style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 750, letterSpacing: '0.07em', color: '#8e92a8', textTransform: 'uppercase' }}>
          CANALES DIRECTOS EN /CONTACTO
        </span>

        <div
          style={{
            padding: '10px 12px',
            borderRadius: 9,
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
            WhatsApp principal
          </span>
          <span style={{ fontSize: 10, color: whatsappOperational ? '#bbf7d0' : '#6b7280' }}>
            {mainWa.display}
          </span>
        </div>

        {secondaryWa.international && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 9,
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
              WhatsApp alternativo
            </span>
            <span style={{ fontSize: 10, color: '#bbf7d0' }}>{secondaryWa.display}</span>
          </div>
        )}

        <div
          style={{
            padding: '10px 12px',
            borderRadius: 9,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#bae6fd',
            fontSize: 11,
            fontWeight: 650,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Phone size={14} />
            Llámanos directo (tel:)
          </span>
          <span style={{ fontSize: 10, color: '#e0f2fe' }}>{mainWa.display}</span>
        </div>
      </div>

      {/* Location distinction: /contacto matrix vs footer/nosotros */}
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
          <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
            <div>
              <small style={{ fontSize: 8.5, letterSpacing: '0.06em', color: '#27d5ec', textTransform: 'uppercase', fontWeight: 750 }}>
                MATRIZ VERIFICADA EN /CONTACTO Y MAPA
              </small>
              <strong style={{ display: 'block', fontSize: 12, color: '#fff', marginTop: 2 }}>
                {publicAddress}
              </strong>
            </div>
            <div style={{ paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <small style={{ fontSize: 8.5, letterSpacing: '0.06em', color: '#a5a9bd', textTransform: 'uppercase', fontWeight: 700 }}>
                TEXTO EDITABLE EN PIE DE PÁGINA Y /NOSOTROS
              </small>
              <span style={{ display: 'block', fontSize: 10.5, color: '#d4d7e6', lineHeight: 1.4, marginTop: 2 }}>
                {draft.location.trim() || `Sin dirección personalizada (usa ${publicAddress})`}
              </span>
            </div>
          </div>
        </div>
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
          <span>Pie de página y Nosotros: {locationVerified ? 'Dirección configurada' : 'Falta dirección'}</span>
        </div>

        <div className={`site-diagnostic-item ${whatsappOperational ? 'is-ready' : ''}`}>
          {whatsappOperational ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          <span>Línea principal y Llámanos: {whatsappOperational ? `${mainWa.display} verificado` : 'Sin WhatsApp configurado'}</span>
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
  );

  return (
    <AppFrame area="admin">
      <style>{siteEditorStyles}</style>
      <PageHeading
        eyebrow="EDITOR DEL SITIO"
        title="Contacto"
        description="Actualiza WhatsApp, redes sociales y la ubicación compartida del sitio. Revisa la vista previa antes de publicar."
        action={
          <Link className="button button-outline" to="/contacto" target="_blank" rel="noreferrer">
            Ver página pública <ArrowUpRight size={16} />
          </Link>
        }
      />
      <SiteAdminNav active="/admin/contacto" />

      <DraftRecoveryBanner
        pendingRecovery={pendingRecovery}
        itemLabel="los datos de contacto"
        onRecover={recoverDraft}
        onDismiss={dismissRecovery}
      />

      <PublishConfirmBar
        isDirty={isDirty}
        isRecovered={isRecovered}
        draftSavedAt={draftSavedAt}
        sectionName="Contacto, WhatsApp y redes"
        canPublish={canEdit}
        publishing={saving}
        previewLabel="Vista previa /contacto"
        publishConfirmTitle="¿Publicar cambios de contacto en vivo?"
        publishConfirmDescription="Se actualizarán WhatsApp, enlace de llamada, redes sociales y pie de página en el sitio público."
        publishSummaryItems={[
          { label: 'WhatsApp principal', value: mainWa.display },
          { label: 'WhatsApp alternativo', value: secondaryWa.international ? secondaryWa.display : 'Opcional (vacío)' },
          { label: 'Pie / Nosotros', value: draft.location.trim() || '(sin cambios)' },
        ]}
        publishConsequences={[
          'Los botones de WhatsApp, Llámanos y redes sociales usarán de inmediato estos datos.',
          `La página /contacto conserva la dirección verificada de la matriz (${publicAddress}).`,
        ]}
        onPreview={() => setPreviewOpen(true)}
        onDiscard={discardDraft}
        onPublish={publishContact}
      />

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
            <span className="site-admin-kpi-label">Ubicación pie/nosotros</span>
            <strong className="site-admin-kpi-value">{locationVerified ? 'Configurada' : 'Pendiente'}</strong>
            <small className="site-admin-kpi-hint">{locationVerified ? 'Milagro, Guayas' : 'Usa matriz verificada'}</small>
          </div>
        </article>
      </section>

      {/* 2. Two-Column Layout */}
      <div className="site-contact-admin-layout">
        {/* Left Column: Form Editor */}
        <form className="panel form-panel site-contact-editor" onSubmit={(event) => void save(event)}>
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

          {(isDirty || isRecovered) && (
            <div className="site-dirty-banner" role="status">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={15} /> Tienes cambios sin publicar en los datos de contacto.
              </span>
              <button
                type="button"
                className="button button-outline button-small"
                style={{ fontSize: 10, padding: '3px 8px', height: 26 }}
                onClick={() => void handleResetWithConfirm()}
              >
                <RotateCcw size={12} /> Restaurar valores publicados
              </button>
            </div>
          )}

          {/* Section 1: Ubicación y atención */}
          <section className="site-contact-section" aria-labelledby="section-location-heading">
            <div className="site-contact-section-title" id="section-location-heading">
              <MapPin size={16} aria-hidden="true" />
              <span>Ubicación en pie de página y /nosotros</span>
            </div>
            <label>
              Dirección mostrada en el pie y páginas institucionales
              <input
                disabled={!canEdit}
                placeholder={`Ej. ${publicAddress}`}
                value={draft.location}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              />
            </label>
            <div className="site-field-helper">
              <span>
                Actualiza el pie de página y /nosotros. La ficha principal, el mapa y las FAQ de /contacto muestran la dirección matriz oficial ({publicAddress}).
              </span>
              <button
                type="button"
                className="button button-outline"
                style={{ fontSize: 10, padding: '2px 8px', height: 24, cursor: 'pointer' }}
                onClick={() => void usePresetLocation()}
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
              <span>Líneas de WhatsApp y llamadas</span>
            </div>

            <label>
              WhatsApp principal (también alimenta "Llámanos")
              <input
                disabled={!canEdit}
                inputMode="tel"
                placeholder="0999999999 o +593999999999"
                value={draft.contactPhone}
                onChange={(event) => setDraft({ ...draft, contactPhone: event.target.value })}
              />
              <div className="site-field-helper">
                <span>
                  Normalizado para WhatsApp y llamada directa: <b>{mainWa.display}</b>
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

          <button className="button button-dark" type="submit" disabled={!canEdit || (!isDirty && !isRecovered) || saving}>
            <Check size={16} />
            {saving ? 'Publicando…' : 'Publicar contacto en vivo'}
          </button>
        </form>

        {/* Right Column: Live Interactive Preview Panel */}
        <aside className="site-contact-preview-panel" aria-label="Previsualización en tiempo real de canales públicos">
          <div className="site-contact-preview-header">
            <div>
              <span style={{ fontSize: 9, fontWeight: 750, letterSpacing: '0.08em', color: '#8e92a8', display: 'block' }}>
                VISTA PREVIA EN VIVO
              </span>
              <strong style={{ fontSize: 13, color: '#fff' }}>Canales y ubicación (/contacto y pie)</strong>
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

          {renderContactPreviewContent()}
        </aside>
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        size="lg"
        tone="brand"
        eyebrow="VISTA PREVIA EN VIVO · /CONTACTO Y PIE DEL SITIO"
        title="Cómo verán tus clientes los canales de contacto"
        description="Incluye los enlaces directos de /contacto y la distinción entre la dirección matriz fija y la ubicación de pie de página."
        footer={
          <button type="button" className="button button-outline" onClick={() => setPreviewOpen(false)}>
            Cerrar vista previa
          </button>
        }
      >
        <div className="site-contact-preview-panel" style={{ position: 'static' }}>
          {renderContactPreviewContent()}
        </div>
      </Dialog>
    </AppFrame>
  );
}
