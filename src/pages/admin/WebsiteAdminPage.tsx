import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  Globe2,
  Layers,
  Monitor,
  RotateCcw,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { saveServiceVisibility, saveWebsiteSettings } from '../../lib/websiteAdminRepository';
import { usePersistentDraft } from '../../lib/usePersistentDraft';
import { DraftRecoveryBanner, PublishConfirmBar } from '../../components/ui/PublishConfirmBar';
import { Dialog, useConfirm } from '../../components/ui/OperationalKit';
import { SiteAdminNav } from './SiteAdminNav';

const symbol = '/brand/visualcorp-symbol.png';
const heroOpeningPoster = '/public-site/home-film/apertura.webp';
const heroMobilePoster = '/public-site/home-film/apertura-portrait.webp';

type HeroDraft = {
  heroEyebrow: string;
  heroTitle: string;
  heroText: string;
};

const heroPresets = [
  {
    id: 'corporativo',
    name: 'Corporativo & Visibilidad',
    eyebrow: 'AGENCIA DE PUBLICIDAD & MARKETING',
    title: 'Transformamos ideas en impacto visual para marcas líderes',
    text: 'Estrategia creativa, diseño publicitario, rotulación y producción integral para potenciar la visibilidad y presencia de tu negocio en Milagro y Ecuador.',
  },
  {
    id: 'rotulacion',
    name: 'Rotulación & Gran Formato',
    eyebrow: 'FABRICACIÓN PUBLICITARIA & ROTULACIÓN',
    title: 'Fachadas comerciales, gigantografías y rotulación de alto nivel',
    text: 'Desde microperforados y señalética arquitectónica hasta branding vehicular e instalaciones comerciales con precisión y máxima durabilidad.',
  },
  {
    id: 'branding',
    name: 'Branding & Identidad',
    eyebrow: 'BRANDING, CAMPAÑAS & EXPERIENCIAS',
    title: 'Construimos identidades memorables que conectan con tus clientes',
    text: 'Diseño gráfico especializado, material corporativo y soluciones visuales a medida para acelerar el posicionamiento y crecimiento de tu empresa.',
  },
];

export function WebsiteAdmin() {
  const { data, setData, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasPermission('website', 'edit');

  const serverHero = useMemo<HeroDraft>(
    () => ({
      heroEyebrow: String(data.settings?.heroEyebrow || ''),
      heroTitle: String(data.settings?.heroTitle || ''),
      heroText: String(data.settings?.heroText || ''),
    }),
    [data.settings?.heroEyebrow, data.settings?.heroTitle, data.settings?.heroText]
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
  } = usePersistentDraft<HeroDraft>({
    orgId: organizationId,
    draftKey: 'website-hero',
    serverValue: serverHero,
    isEqual: (a, b) =>
      a.heroEyebrow.trim() === b.heroEyebrow.trim() &&
      a.heroTitle.trim() === b.heroTitle.trim() &&
      a.heroText.trim() === b.heroText.trim(),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Local state for UI enhancements
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  // KPI Calculations
  const isHeroConfigured = Boolean(
    draft.heroTitle.trim() && draft.heroText.trim()
  );

  const totalServices = (data.services || []).length;
  const visibleServices = useMemo(
    () => (data.services || []).filter((s: any) => s.enabled),
    [data.services]
  );
  const visibleServicesCount = visibleServices.length;

  const contactKeys = ['location', 'contactPhone', 'instagram', 'facebook', 'tiktok'] as const;
  const activeContactsCount = contactKeys.filter((k) =>
    Boolean((data.settings?.[k] || '').trim())
  ).length;

  const totalSeoChars =
    draft.heroTitle.trim().length +
    draft.heroText.trim().length;

  const seoStatus = useMemo(() => {
    if (totalSeoChars === 0) {
      return { label: 'Incompleto', badgeClass: 'is-warning', hint: 'Agrega titular y descripción' };
    }
    if (totalSeoChars < 90) {
      return { label: 'Breve', badgeClass: 'is-warning', hint: 'Recomendado ampliar (ideal 105–245 car.)' };
    }
    if (totalSeoChars <= 245) {
      return { label: 'Óptimo', badgeClass: 'is-success', hint: 'Longitud ideal para indexación y lectura' };
    }
    return { label: 'Extenso', badgeClass: 'is-warning', hint: 'Puede truncarse en pantallas móviles' };
  }, [totalSeoChars]);

  // Publish Hero settings only (never leaks or mixes service visibility toggles)
  const publishHero = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError('');
    const nextSettings = {
      ...(data.settings || {}),
      heroEyebrow: draft.heroEyebrow.trim(),
      heroTitle: draft.heroTitle.trim(),
      heroText: draft.heroText.trim(),
    };
    const savedSnapshot: HeroDraft = {
      heroEyebrow: nextSettings.heroEyebrow,
      heroTitle: nextSettings.heroTitle,
      heroText: nextSettings.heroText,
    };
    try {
      await saveWebsiteSettings(nextSettings, organizationId);
      setData((current: any) => ({ ...current, settings: nextSettings }));
      markSaved(savedSnapshot);
      flash('Mensajes de portada publicados en la web.');
    } catch (err: any) {
      setError(err?.message || 'No se guardaron los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || (!isDirty && !isRecovered) || saving) return;
    const accepted = await confirm({
      eyebrow: 'CONFIRMAR PUBLICACIÓN EN VIVO',
      title: '¿Publicar cambios en la portada principal (Hero)?',
      description:
        'Los textos de antetítulo, titular y descripción reemplazarán la apertura pública del sitio de inmediato.',
      summaryItems: [
        { label: 'Antetítulo', value: draft.heroEyebrow.trim() || '(vacío)' },
        { label: 'Titular', value: draft.heroTitle.trim() || '(vacío)' },
      ],
      consequences: [
        'Se actualiza la apertura de la página de inicio (/) para todos los visitantes.',
        'La visibilidad de familias de servicio no se altera en esta acción.',
      ],
      tone: 'brand',
      confirmLabel: 'Publicar en vivo',
      cancelLabel: 'Revisar antes',
    });
    if (accepted) {
      await publishHero();
    }
  };

  // Toggle single service visibility WITHOUT saving unsaved Hero drafts
  const toggleService = async (id: string) => {
    if (!canEdit || saving) return;
    const target = (data.services || []).find((service: any) => service.id === id);
    if (!target) return;
    const nextEnabled = !target.enabled;
    const accepted = await confirm({
      eyebrow: 'VISIBILIDAD EN PORTADA',
      title: nextEnabled
        ? `¿Mostrar "${target.name}" en el sitio público?`
        : `¿Ocultar "${target.name}" del sitio público?`,
      description: nextEnabled
        ? 'Esta familia volverá a mostrarse en la portada (/), en /servicios y en el selector público.'
        : 'Esta familia dejará de aparecer en la portada (/), en /servicios y en el selector público.',
      consequences: isDirty
        ? ['Tu borrador local del Hero se conservará intacto y no se publicará todavía.']
        : undefined,
      tone: nextEnabled ? 'brand' : 'warning',
      confirmLabel: nextEnabled ? 'Sí, mostrar en vivo' : 'Sí, ocultar en vivo',
      cancelLabel: 'Cancelar',
    });
    if (!accepted) return;

    setSaving(true);
    setError('');
    try {
      await saveServiceVisibility(id, nextEnabled, organizationId);
      setData((current: any) => ({
        ...current,
        services: (current.services || []).map((service: any) =>
          service.id === id ? { ...service, enabled: nextEnabled } : service
        ),
      }));
      flash(
        nextEnabled
          ? `Servicio "${target.name}" publicado como visible.`
          : `Servicio "${target.name}" ocultado de la portada.`
      );
    } catch (err: any) {
      setError(err?.message || 'No se guardó el servicio.');
    } finally {
      setSaving(false);
    }
  };

  // Bulk set service visibility WITHOUT saving unsaved Hero drafts
  const setAllServices = async (enabled: boolean) => {
    if (!canEdit || saving) return;
    const changed = (data.services || []).filter((service: any) => service.enabled !== enabled);
    if (changed.length === 0) return;

    const accepted = await confirm({
      eyebrow: 'CAMBIO MASIVO DE VISIBILIDAD',
      title: enabled
        ? `¿Mostrar todas las familias (${changed.length}) en la portada?`
        : `¿Ocultar todas las familias (${changed.length}) de la portada?`,
      description: enabled
        ? 'Todas las familias de servicio aparecerán en la web pública.'
        : 'Todas las familias dejarán de mostrarse en la portada y /servicios hasta reactivarlas.',
      consequences: isDirty
        ? ['Tu borrador sin guardar del Hero permanecerá local y no se publicará.']
        : undefined,
      tone: enabled ? 'brand' : 'warning',
      confirmLabel: enabled ? 'Mostrar todas' : 'Ocultar todas',
      cancelLabel: 'Cancelar',
    });
    if (!accepted) return;

    try {
      setSaving(true);
      setError('');
      await Promise.all(
        changed.map((service: any) => saveServiceVisibility(service.id, enabled, organizationId))
      );
      setData((current: any) => ({
        ...current,
        services: (current.services || []).map((service: any) => ({ ...service, enabled })),
      }));
      flash(
        enabled
          ? 'Todas las familias de servicio quedaron visibles.'
          : 'Todas las familias de servicio quedaron ocultas.'
      );
    } catch (err: any) {
      setError(err?.message || 'No se pudieron actualizar los servicios.');
    } finally {
      setSaving(false);
    }
  };

  // Apply preset with confirmation
  const applyPreset = async (preset: typeof heroPresets[0]) => {
    if (!canEdit) return;
    const accepted = await confirm({
      eyebrow: 'APLICAR SUGERENCIA DE TONO',
      title: `¿Cargar plantilla "${preset.name}" en el borrador?`,
      description:
        'Se reemplazarán los campos actuales del editor únicamente en tu borrador local. Nada se publicará hasta que presiones "Publicar en vivo".',
      tone: 'info',
      confirmLabel: 'Cargar en borrador',
      cancelLabel: 'Mantener actual',
    });
    if (!accepted) return;
    setDraft({
      heroEyebrow: preset.eyebrow,
      heroTitle: preset.title,
      heroText: preset.text,
    });
  };

  // Restore original with confirmation
  const handleRestoreOriginal = async () => {
    if (!isDirty && !isRecovered) return;
    const accepted = await confirm({
      eyebrow: 'RESTAURAR VERSIÓN EN VIVO',
      title: '¿Descartar cambios locales y restaurar el Hero actual?',
      description:
        'El editor recuperará los textos publicados actualmente y eliminará el borrador guardado en este navegador.',
      tone: 'danger',
      destructive: true,
      confirmLabel: 'Sí, restaurar original',
      cancelLabel: 'Seguir editando',
    });
    if (accepted) {
      discardDraft();
    }
  };

  // Filtered services list
  const filteredServices = useMemo(() => {
    return (data.services || []).filter((service: any) => {
      const q = serviceSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        service.name.toLowerCase().includes(q) ||
        (service.description || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (serviceFilter === 'visible') return service.enabled;
      if (serviceFilter === 'hidden') return !service.enabled;
      return true;
    });
  }, [data.services, serviceSearch, serviceFilter]);

  // Character counter helper
  const getCounterClass = (length: number, min: number, max: number) => {
    if (length === 0) return 'is-muted';
    if (length >= min && length <= max) return 'is-ideal';
    return 'is-notice';
  };

  // Split title for preview gradient highlight
  const previewTitleRaw = (draft?.heroTitle || 'Hacemos visible lo que imaginas.').trim();
  const previewWords = previewTitleRaw.split(/\s+/);
  const previewLastWord = previewWords.length > 1 ? previewWords.pop() : '';
  const previewLeadingWords = previewWords.join(' ');

  return (
    <AppFrame area="admin">
      <style>{`
        /* Executive KPI Strip */
        .site-admin-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 22px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .site-admin-kpi-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 13px 15px;
          background: var(--admin-frosted-bg, #ffffff);
          border: 1px solid var(--admin-frosted-border, #e7e6ec);
          border-radius: 14px;
          box-shadow: var(--admin-frosted-shadow, 0 4px 16px rgba(16, 17, 24, 0.05));
          backdrop-filter: blur(var(--admin-frosted-blur, 16px));
          -webkit-backdrop-filter: blur(var(--admin-frosted-blur, 16px));
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        .site-admin-kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .site-admin-kpi-icon-wrap {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: rgba(165, 16, 145, 0.1);
          color: #a51091;
          border: 1px solid rgba(165, 16, 145, 0.16);
        }
        .site-admin-kpi-badge {
          font-size: 10px;
          font-weight: 750;
          padding: 2px 8px;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .site-admin-kpi-badge.is-success {
          background: rgba(16, 185, 129, 0.12);
          color: #0f766e;
          border: 1px solid rgba(16, 185, 129, 0.28);
        }
        .site-admin-kpi-badge.is-warning {
          background: rgba(245, 158, 11, 0.13);
          color: #b45309;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .site-admin-kpi-badge.is-neutral {
          background: var(--admin-clear-bg, rgba(16, 17, 24, 0.04));
          color: var(--admin-glass-muted, #555663);
          border: 1px solid var(--admin-frosted-border, #e1e1e6);
        }
        .site-admin-kpi-value {
          font-size: 18px;
          font-weight: 850;
          color: var(--admin-glass-ink, #1e1f29);
          line-height: 1.2;
        }
        .site-admin-kpi-label {
          font-size: 10.5px;
          font-weight: 750;
          color: var(--admin-glass-muted, #6a6b79);
          margin-top: 3px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .site-admin-kpi-meta {
          font-size: 11px;
          color: var(--admin-glass-muted, #6a6b79);
          margin-top: 4px;
          line-height: 1.35;
        }

        /* Unsaved Changes & Sync Badge */
        .site-hero-sync-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 750;
        }
        .site-hero-sync-badge.is-dirty {
          background: rgba(245, 158, 11, 0.14);
          color: #b45309;
          border: 1px solid rgba(245, 158, 11, 0.35);
        }
        .site-hero-sync-badge.is-synced {
          background: rgba(16, 185, 129, 0.12);
          color: #065f46;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        /* Hero Presets */
        .site-hero-presets {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 11px 13px;
          background: var(--admin-clear-bg, rgba(255, 255, 255, 0.6));
          border: 1px solid var(--admin-frosted-border, #eceaf1);
          border-radius: 12px;
          margin-bottom: 16px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .site-hero-presets-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          font-size: 11px;
          font-weight: 700;
          color: var(--admin-glass-muted, #5d5e6e);
        }
        .site-hero-preset-chips {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }
        .site-hero-preset-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          background: var(--admin-frosted-bg, #ffffff);
          border: 1px solid var(--admin-frosted-border, #dedde5);
          border-radius: 8px;
          color: var(--admin-glass-ink, #494a58);
          font-size: 10.5px;
          font-weight: 650;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-hero-preset-btn:hover {
          border-color: rgba(165, 16, 145, 0.45);
          color: #a51091;
          background: rgba(165, 16, 145, 0.08);
        }
        .site-hero-preset-btn--reset {
          margin-left: auto;
          border-color: rgba(225, 29, 72, 0.28);
          color: #be123c;
          background: rgba(225, 29, 72, 0.07);
        }
        .site-hero-preset-btn--reset:hover {
          background: rgba(225, 29, 72, 0.14);
          border-color: rgba(225, 29, 72, 0.45);
          color: #9f1239;
        }

        /* Field header with counter */
        .site-field-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          margin-bottom: 4px;
        }
        .site-char-counter {
          font-size: 10px;
          font-weight: 650;
          padding: 1px 6px;
          border-radius: 4px;
        }
        .site-char-counter.is-ideal {
          color: #059669;
          background: rgba(16, 185, 129, 0.12);
        }
        .site-char-counter.is-notice {
          color: #d97706;
          background: rgba(245, 158, 11, 0.13);
        }
        .site-char-counter.is-muted {
          color: var(--admin-glass-muted, #888996);
        }

        /* Live Preview Panel (faithful public HomeFilm aesthetic) */
        .site-hero-live-preview {
          margin-top: 18px;
          background: #0a0910;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 14px 36px rgba(6, 5, 12, 0.3);
          max-width: 100%;
          box-sizing: border-box;
        }
        .site-hero-preview-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          padding: 10px 14px;
          background: rgba(18, 16, 28, 0.92);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .site-hero-preview-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #e6e4f2;
          font-size: 11px;
          font-weight: 750;
        }
        .site-hero-device-toggle {
          display: inline-flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          padding: 2px;
          gap: 2px;
        }
        .site-hero-device-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #9ea1b8;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-hero-device-btn.is-active {
          background: rgba(165, 16, 145, 0.34);
          color: #ffffff;
        }
        .site-hero-preview-viewport-wrap {
          padding: 18px 14px;
          background: radial-gradient(circle at 75% 15%, rgba(39, 213, 236, 0.16) 0%, transparent 50%),
                      radial-gradient(circle at 20% 25%, rgba(165, 16, 145, 0.24) 0%, transparent 58%),
                      #08070d;
          display: flex;
          justify-content: center;
          overflow: hidden;
          max-width: 100%;
          box-sizing: border-box;
        }
        .site-hero-preview-stage {
          position: relative;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          border-radius: 16px;
          padding: 20px 18px;
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 12px 32px rgba(0, 0, 0, 0.45);
          transition: max-width 0.22s ease;
          overflow: hidden;
        }
        .site-hero-preview-stage.is-mobile {
          max-width: 360px;
          padding: 18px 15px;
        }
        .site-hero-preview-browser-dots {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
        }
        .site-hero-preview-dots-group {
          display: inline-flex;
          gap: 5px;
        }
        .site-hero-preview-dots-group span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .site-hero-preview-dots-group span:nth-child(1) { background: #ef4444; }
        .site-hero-preview-dots-group span:nth-child(2) { background: #f59e0b; }
        .site-hero-preview-dots-group span:nth-child(3) { background: #10b981; }
        .site-hero-preview-url-chip {
          font-size: 9.5px;
          color: rgba(244, 241, 248, 0.72);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          padding: 2px 9px;
          backdrop-filter: blur(10px);
        }
        .site-hero-preview-kicker {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: #f4f1f8;
          margin-bottom: 12px;
          background: rgba(255, 255, 255, 0.09);
          padding: 4px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(12px);
        }
        .site-hero-preview-kicker-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #27d5ec;
          box-shadow: 0 0 8px #27d5ec;
        }
        .site-hero-preview-h1 {
          font-size: 22px;
          font-weight: 850;
          color: #ffffff;
          line-height: 1.2;
          margin: 0 0 10px 0;
          letter-spacing: -0.025em;
          overflow-wrap: anywhere;
        }
        .site-hero-preview-h1-gradient {
          background: linear-gradient(110deg, #ff70df 0%, #27d5ec 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .site-hero-preview-desc {
          font-size: 12px;
          line-height: 1.6;
          color: rgba(235, 232, 246, 0.84);
          margin: 0 0 16px 0;
          max-width: 52ch;
          overflow-wrap: anywhere;
        }
        .site-hero-preview-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        .site-hero-preview-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 999px;
          background: linear-gradient(135deg, #a51091, #74136f);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 750;
          box-shadow: 0 6px 16px rgba(165, 16, 145, 0.4);
        }
        .site-hero-preview-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.22);
          backdrop-filter: blur(12px);
          color: #f3f1fa;
          font-size: 10.5px;
          font-weight: 700;
        }
        .site-hero-preview-services-tray {
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          padding-top: 12px;
        }
        .site-hero-preview-services-label {
          display: block;
          font-size: 9px;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(226, 224, 240, 0.65);
          margin-bottom: 7px;
        }
        .site-hero-preview-services-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .site-hero-preview-pill {
          font-size: 9.5px;
          font-weight: 650;
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: #e6e4f4;
          border: 1px solid rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(8px);
        }
        .site-hero-preview-empty-pill {
          font-size: 10px;
          color: rgba(226, 224, 240, 0.58);
          font-style: italic;
        }

        .site-hero-modal-services-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
        }
        .site-hero-modal-service-card {
          padding: 12px;
          border-radius: 12px;
          background: var(--admin-frosted-bg, rgba(255, 255, 255, 0.85));
          border: 1px solid var(--admin-frosted-border, rgba(16, 17, 24, 0.1));
          min-width: 0;
        }
        .site-hero-modal-service-card b {
          display: block;
          font-size: 12.5px;
          color: var(--admin-glass-ink, #1e1f29);
          margin-bottom: 4px;
        }
        .site-hero-modal-service-card small {
          display: block;
          font-size: 11px;
          line-height: 1.45;
          color: var(--admin-glass-muted, #5c5d6b);
        }

        /* Services Toolbar & Filtering */
        .site-services-toolbar {
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin: 12px 0 14px;
        }
        .site-services-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }
        .site-services-search-icon {
          position: absolute;
          left: 10px;
          color: var(--admin-glass-muted, #8b8c98);
          pointer-events: none;
        }
        .site-services-search-input {
          width: 100%;
          padding: 7px 30px 7px 32px;
          border: 1px solid var(--admin-frosted-border, #e3e2e8);
          border-radius: 9px;
          font-size: 11px;
          background: var(--admin-clear-bg, #fafafc);
          color: var(--admin-glass-ink, #272832);
          transition: all 0.15s ease;
          box-sizing: border-box;
        }
        .site-services-search-input:focus {
          background: var(--admin-frosted-bg, #fff);
          border-color: #a51091;
          outline: 3px solid rgba(165, 16, 145, 0.14);
        }
        .site-services-search-clear {
          position: absolute;
          right: 8px;
          border: 0;
          background: transparent;
          color: var(--admin-glass-muted, #8b8c98);
          cursor: pointer;
          display: grid;
          place-items: center;
          padding: 2px;
        }
        .site-services-filter-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .site-services-filters {
          display: inline-flex;
          flex-wrap: wrap;
          background: var(--admin-clear-bg, #f1f0f4);
          border: 1px solid var(--admin-frosted-border, #e5e4eb);
          padding: 2px;
          border-radius: 8px;
          gap: 2px;
        }
        .site-services-filter-btn {
          border: 0;
          background: transparent;
          color: var(--admin-glass-muted, #636472);
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-services-filter-btn.is-active {
          background: var(--admin-frosted-bg, #fff);
          color: #a51091;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        .site-services-bulk-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .site-services-bulk-btn {
          border: 1px solid var(--admin-frosted-border, #e1e0e7);
          background: var(--admin-frosted-bg, #fff);
          color: var(--admin-glass-ink, #4b4c59);
          font-size: 10px;
          font-weight: 700;
          padding: 4px 9px;
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-services-bulk-btn:hover:not(:disabled) {
          background: rgba(165, 16, 145, 0.08);
          border-color: rgba(165, 16, 145, 0.3);
        }
        .site-services-bulk-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .site-services-edit-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #a51091;
          font-size: 10.5px;
          font-weight: 750;
          text-decoration: none;
          margin-left: 2px;
        }
        .site-services-edit-link:hover {
          text-decoration: underline;
        }

        /* Service row status badge */
        .site-service-row-header {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .site-service-status-pill {
          display: inline-flex;
          align-items: center;
          font-size: 9px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }
        .site-service-status-pill.is-visible {
          background: rgba(16, 185, 129, 0.13);
          color: #0f766e;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .site-service-status-pill.is-hidden {
          background: var(--admin-clear-bg, #f3f3f6);
          color: var(--admin-glass-muted, #7b7c88);
          border: 1px solid var(--admin-frosted-border, #e1e1e6);
        }
        .site-services-empty-state {
          padding: 20px;
          text-align: center;
          color: var(--admin-glass-muted, #7c7d8a);
          font-size: 11px;
          background: var(--admin-clear-bg, #fafafc);
          border-radius: 10px;
          border: 1px dashed var(--admin-frosted-border, #e3e2e8);
        }

        /* Error alert */
        .site-admin-alert-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(225, 29, 72, 0.08);
          border: 1px solid rgba(225, 29, 72, 0.28);
          color: #be123c;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 16px;
        }

        /* Dark Mode Glass Overrides */
        .work-app.theme-dark .site-admin-kpi-badge.is-success,
        .work-app.theme-dark .site-hero-sync-badge.is-synced,
        .work-app.theme-dark .site-service-status-pill.is-visible {
          color: #6ee7b7;
        }
        .work-app.theme-dark .site-admin-kpi-badge.is-warning,
        .work-app.theme-dark .site-hero-sync-badge.is-dirty {
          color: #fcd34d;
        }
        .work-app.theme-dark .site-services-edit-link,
        .work-app.theme-dark .site-services-filter-btn.is-active {
          color: #f0abfc;
        }
        .work-app.theme-dark .site-hero-preset-btn--reset {
          color: #fda4af;
        }
        .work-app.theme-dark .site-admin-alert-error {
          color: #fda4af;
        }

        @media (max-width: 1260px) {
          .site-admin-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .site-hero-modal-services-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 600px) {
          .site-admin-kpi-grid,
          .site-hero-modal-services-grid {
            grid-template-columns: 1fr;
          }
          .site-services-filter-row {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>

      <PageHeading
        eyebrow="EDITOR DEL SITIO"
        title="Inicio"
        description="Actualiza el mensaje principal y consulta qué familias de servicio están visibles en la portada pública."
        action={
          <Link className="button button-outline" to="/" target="_blank" rel="noreferrer">
            Abrir vista pública <ArrowUpRight size={16} />
          </Link>
        }
      />

      <SiteAdminNav active="/admin/sitio" />

      <DraftRecoveryBanner
        pendingRecovery={pendingRecovery}
        itemLabel="el Hero de portada"
        onRecover={recoverDraft}
        onDismiss={dismissRecovery}
      />

      <PublishConfirmBar
        isDirty={isDirty}
        isRecovered={isRecovered}
        draftSavedAt={draftSavedAt}
        sectionName="Portada principal (Hero)"
        statusNote={
          isDirty
            ? 'Los cambios del Hero se mantienen en borrador local; activar o desactivar familias a la derecha no los publicará.'
            : undefined
        }
        canPublish={canEdit}
        publishing={saving}
        previewLabel="Vista previa completa"
        publishConfirmTitle="¿Publicar cambios en la portada principal?"
        publishConfirmDescription="Los textos de antetítulo, titular y descripción reemplazarán la apertura visible de Visual Corp."
        publishSummaryItems={[
          { label: 'Antetítulo', value: draft.heroEyebrow.trim() || '(vacío)' },
          { label: 'Titular', value: draft.heroTitle.trim() || '(vacío)' },
          { label: 'Familias activas', value: `${visibleServicesCount} de ${totalServices}` },
        ]}
        publishConsequences={[
          'Se actualizará en vivo la apertura de la página principal (/).',
          'Los cambios locales pendientes quedarán sincronizados.',
        ]}
        onPreview={() => setPreviewOpen(true)}
        onDiscard={discardDraft}
        onPublish={publishHero}
      />

      {/* 1. Executive KPI Strip */}
      <section className="site-admin-kpi-grid" aria-label="Métricas y estado general del sitio">
        {/* KPI 1: Estado del Hero */}
        <div className="site-admin-kpi-card">
          <div className="site-admin-kpi-top">
            <div className="site-admin-kpi-icon-wrap">
              <Sparkles size={16} aria-hidden="true" />
            </div>
            <span
              className={`site-admin-kpi-badge ${
                isHeroConfigured ? 'is-success' : 'is-warning'
              }`}
            >
              {isHeroConfigured ? 'Listo' : 'Pendiente'}
            </span>
          </div>
          <div>
            <div className="site-admin-kpi-value">
              {isHeroConfigured ? 'Configurado' : 'Incompleto'}
            </div>
            <div className="site-admin-kpi-label">Estado del Hero</div>
            <div className="site-admin-kpi-meta">
              {isHeroConfigured ? 'Titular y descripción activos' : 'Falta titular o descripción'}
            </div>
          </div>
        </div>

        {/* KPI 2: Familias Visibles */}
        <div className="site-admin-kpi-card">
          <div className="site-admin-kpi-top">
            <div className="site-admin-kpi-icon-wrap">
              <Layers size={16} aria-hidden="true" />
            </div>
            <span className="site-admin-kpi-badge is-neutral">
              {Math.round((visibleServicesCount / Math.max(1, totalServices)) * 100)}% en portada
            </span>
          </div>
          <div>
            <div className="site-admin-kpi-value">
              {visibleServicesCount} de {totalServices}
            </div>
            <div className="site-admin-kpi-label">Familias Visibles</div>
            <div className="site-admin-kpi-meta">Servicios activos en la página pública</div>
          </div>
        </div>

        {/* KPI 3: Canales de Contacto */}
        <div className="site-admin-kpi-card">
          <div className="site-admin-kpi-top">
            <div className="site-admin-kpi-icon-wrap">
              <Share2 size={16} aria-hidden="true" />
            </div>
            <span
              className={`site-admin-kpi-badge ${
                activeContactsCount >= 4 ? 'is-success' : 'is-warning'
              }`}
            >
              {activeContactsCount >= 4 ? 'Completo' : 'Básico'}
            </span>
          </div>
          <div>
            <div className="site-admin-kpi-value">{activeContactsCount} de 5</div>
            <div className="site-admin-kpi-label">Canales de Contacto</div>
            <div className="site-admin-kpi-meta">WhatsApp, redes y dirección física</div>
          </div>
        </div>

        {/* KPI 4: Longitud SEO */}
        <div className="site-admin-kpi-card">
          <div className="site-admin-kpi-top">
            <div className="site-admin-kpi-icon-wrap">
              <Type size={16} aria-hidden="true" />
            </div>
            <span className={`site-admin-kpi-badge ${seoStatus.badgeClass}`}>
              {seoStatus.label}
            </span>
          </div>
          <div>
            <div className="site-admin-kpi-value">{totalSeoChars} car.</div>
            <div className="site-admin-kpi-label">Longitud SEO</div>
            <div className="site-admin-kpi-meta">{seoStatus.hint}</div>
          </div>
        </div>
      </section>

      {error && (
        <div className="site-admin-alert-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="editor-grid">
        {/* 2. Main Hero Editor */}
        <form className="panel form-panel" onSubmit={handleFormSubmit}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTENIDO PRINCIPAL</span>
              <h2>Mensajes del sitio</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                className={`site-hero-sync-badge ${
                  isDirty || isRecovered ? 'is-dirty' : 'is-synced'
                }`}
              >
                {isRecovered ? (
                  <>
                    <span style={{ fontSize: 9 }}>●</span> Borrador recuperado
                  </>
                ) : isDirty ? (
                  <>
                    <span style={{ fontSize: 9 }}>●</span> Cambios sin guardar
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} /> Sincronizado
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Quick preset chips */}
          {canEdit && (
            <div className="site-hero-presets">
              <div className="site-hero-presets-header">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={13} color="#a51091" /> Sugerencias de tono institucional:
                </span>
                {(isDirty || isRecovered) && (
                  <button
                    type="button"
                    className="site-hero-preset-btn site-hero-preset-btn--reset"
                    onClick={() => void handleRestoreOriginal()}
                    title="Restaurar a los textos guardados en vivo"
                  >
                    <RotateCcw size={12} /> Restaurar original
                  </button>
                )}
              </div>
              <div className="site-hero-preset-chips">
                {heroPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="site-hero-preset-btn"
                    onClick={() => void applyPreset(preset)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field-grid">
            {/* Antetítulo */}
            <label>
              <div className="site-field-header">
                <span>Antetítulo</span>
                <span
                  className={`site-char-counter ${getCounterClass(
                    (draft.heroEyebrow || '').length,
                    20,
                    45
                  )}`}
                >
                  {(draft.heroEyebrow || '').length}/45 <small>(ideal 20–45)</small>
                </span>
              </div>
              <input
                disabled={!canEdit}
                value={draft.heroEyebrow || ''}
                placeholder="Ej. AGENCIA DE PUBLICIDAD & ROTULACIÓN"
                onChange={(e) => setDraft({ ...draft, heroEyebrow: e.target.value })}
              />
            </label>

            {/* Titular principal */}
            <label>
              <div className="site-field-header">
                <span>Titular principal</span>
                <span
                  className={`site-char-counter ${getCounterClass(
                    (draft.heroTitle || '').length,
                    25,
                    65
                  )}`}
                >
                  {(draft.heroTitle || '').length}/65 <small>(ideal 25–65)</small>
                </span>
              </div>
              <input
                disabled={!canEdit}
                value={draft.heroTitle || ''}
                placeholder="Ej. Hacemos visible lo que imaginas."
                onChange={(e) => setDraft({ ...draft, heroTitle: e.target.value })}
              />
            </label>

            {/* Descripción */}
            <label className="span-two">
              <div className="site-field-header">
                <span>Descripción</span>
                <span
                  className={`site-char-counter ${getCounterClass(
                    (draft.heroText || '').length,
                    80,
                    180
                  )}`}
                >
                  {(draft.heroText || '').length}/180 <small>(ideal 80–180)</small>
                </span>
              </div>
              <textarea
                disabled={!canEdit}
                rows={3}
                value={draft.heroText || ''}
                placeholder="Resumen del valor de la empresa, servicios y trayectoria..."
                onChange={(e) => setDraft({ ...draft, heroText: e.target.value })}
              />
            </label>
          </div>

          {/* Live Interactive Hero Preview */}
          <div className="site-hero-live-preview">
            <div className="site-hero-preview-topbar">
              <div className="site-hero-preview-title">
                <Eye size={14} color="#a855f7" />
                <span>Vista previa interactiva en tiempo real</span>
              </div>
              <div className="site-hero-device-toggle">
                <button
                  type="button"
                  className={`site-hero-device-btn ${
                    previewDevice === 'desktop' ? 'is-active' : ''
                  }`}
                  onClick={() => setPreviewDevice('desktop')}
                  title="Simular pantalla de escritorio"
                >
                  <Monitor size={12} /> Desktop
                </button>
                <button
                  type="button"
                  className={`site-hero-device-btn ${
                    previewDevice === 'mobile' ? 'is-active' : ''
                  }`}
                  onClick={() => setPreviewDevice('mobile')}
                  title="Simular pantalla de teléfono"
                >
                  <Smartphone size={12} /> Móvil
                </button>
              </div>
            </div>

            <div className="site-hero-preview-viewport-wrap">
              <div
                className={`site-hero-preview-stage ${
                  previewDevice === 'mobile' ? 'is-mobile' : 'is-desktop'
                }`}
                style={{
                  backgroundImage: `linear-gradient(112deg, rgba(8, 7, 13, 0.92) 0%, rgba(15, 11, 24, 0.8) 54%, rgba(116, 19, 111, 0.36) 100%), url(${
                    previewDevice === 'mobile' ? heroMobilePoster : heroOpeningPoster
                  })`,
                }}
              >
                <div className="site-hero-preview-browser-dots" aria-hidden="true">
                  <div className="site-hero-preview-dots-group">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="site-hero-preview-url-chip">visualcorp.ec/</span>
                </div>

                {/* Eyebrow Kicker */}
                <div className="site-hero-preview-kicker">
                  <span className="site-hero-preview-kicker-dot" />
                  <span>{draft.heroEyebrow || 'AGENCIA DE PUBLICIDAD & ROTULACIÓN'}</span>
                </div>

                {/* Main H1 Title */}
                <h3 className="site-hero-preview-h1">
                  {previewLeadingWords}{' '}
                  <span className="site-hero-preview-h1-gradient">
                    {previewLastWord || previewTitleRaw}
                  </span>
                </h3>

                {/* Description */}
                <p className="site-hero-preview-desc">
                  {draft.heroText ||
                    'Diseño publicitario, rotulación comercial, gran formato y branding integral para impulsar tu marca en Milagro y Ecuador.'}
                </p>

                {/* CTA Buttons */}
                <div className="site-hero-preview-actions">
                  <span className="site-hero-preview-btn-primary">
                    Solicitar cotización <ArrowUpRight size={13} />
                  </span>
                  <span className="site-hero-preview-btn-secondary">
                    Explorar servicios
                  </span>
                </div>

                {/* Active Service Family Pills in Preview */}
                <div className="site-hero-preview-services-tray">
                  <span className="site-hero-preview-services-label">
                    Familias activas en la portada ({visibleServicesCount})
                  </span>
                  <div className="site-hero-preview-services-list">
                    {visibleServices
                      .slice(0, 6)
                      .map((s: any) => (
                        <span key={s.id} className="site-hero-preview-pill">
                          {s.name}
                        </span>
                      ))}
                    {visibleServicesCount > 6 && (
                      <span className="site-hero-preview-pill">
                        +{visibleServicesCount - 6} más
                      </span>
                    )}
                    {visibleServicesCount === 0 && (
                      <span className="site-hero-preview-empty-pill">
                        No hay servicios activos en portada
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* 3. Service Families Panel */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTENIDO VISIBLE</span>
              <h2>Familias de servicio</h2>
            </div>
            <span className="muted-count">{visibleServicesCount} visibles</span>
          </div>

          <p className="panel-intro">
            Edita nombres y descripciones desde la pestaña Servicios. Los materiales, disponibilidad,
            valores y tiempos se confirman por proyecto.
          </p>

          {/* Search & Filters Toolbar */}
          <div className="site-services-toolbar">
            <div className="site-services-search-box">
              <Search size={14} className="site-services-search-icon" aria-hidden="true" />
              <input
                type="text"
                className="site-services-search-input"
                placeholder="Buscar familia o descripción..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
              />
              {serviceSearch && (
                <button
                  type="button"
                  className="site-services-search-clear"
                  onClick={() => setServiceSearch('')}
                  title="Limpiar búsqueda"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="site-services-filter-row">
              <div className="site-services-filters">
                <button
                  type="button"
                  className={`site-services-filter-btn ${
                    serviceFilter === 'all' ? 'is-active' : ''
                  }`}
                  onClick={() => setServiceFilter('all')}
                >
                  Todos ({totalServices})
                </button>
                <button
                  type="button"
                  className={`site-services-filter-btn ${
                    serviceFilter === 'visible' ? 'is-active' : ''
                  }`}
                  onClick={() => setServiceFilter('visible')}
                >
                  Visibles ({visibleServicesCount})
                </button>
                <button
                  type="button"
                  className={`site-services-filter-btn ${
                    serviceFilter === 'hidden' ? 'is-active' : ''
                  }`}
                  onClick={() => setServiceFilter('hidden')}
                >
                  Ocultos ({totalServices - visibleServicesCount})
                </button>
              </div>

              {canEdit && (
                <div className="site-services-bulk-actions">
                  <button
                    type="button"
                    className="site-services-bulk-btn"
                    disabled={saving || visibleServicesCount === totalServices}
                    onClick={() => setAllServices(true)}
                    title="Mostrar todas las familias en la portada"
                  >
                    Mostrar todos
                  </button>
                  <button
                    type="button"
                    className="site-services-bulk-btn"
                    disabled={saving || visibleServicesCount === 0}
                    onClick={() => setAllServices(false)}
                    title="Ocultar todas las familias de la portada"
                  >
                    Ocultar todos
                  </button>
                  <Link to="/admin/servicios" className="site-services-edit-link">
                    Editar textos en Servicios →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Service Toggle List */}
          <div className="service-toggle-list">
            {filteredServices.length === 0 ? (
              <div className="site-services-empty-state">
                No se encontraron familias de servicio que coincidan con el filtro actual.
              </div>
            ) : (
              filteredServices.map((service: any) => (
                <label className="toggle-row" key={service.id}>
                  <span>
                    <div className="site-service-row-header">
                      <span
                        className={`site-service-status-pill ${
                          service.enabled ? 'is-visible' : 'is-hidden'
                        }`}
                      >
                        {service.enabled ? 'Visible' : 'Oculto'}
                      </span>
                      <b>{service.name}</b>
                    </div>
                    <small>{service.description}</small>
                  </span>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={service.enabled}
                    onChange={() => toggleService(service.id)}
                  />
                </label>
              ))
            )}
          </div>

          <div className="brand-note">
            <img src={symbol} alt="" />
            <span>
              <b>Logotipo Visual Corp</b>
              <small>El sitio usa el recurso gráfico de la empresa.</small>
            </span>
          </div>
        </section>
      </div>

      <div className="preview-strip">
        <span>
          <Globe2 size={17} /> Publica el borrador cuando confirmes la vista previa. Las familias visibles se guardan de forma independiente.
        </span>
        <Link to="/" target="_blank" rel="noreferrer">
          Abrir sitio público <ArrowUpRight size={15} />
        </Link>
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        size="xl"
        tone="brand"
        eyebrow="VISTA PREVIA EN VIVO · PORTADA PÚBLICA (/)"
        title="Simulación de Hero y familias visibles"
        description="Revisa cómo lucirá tu borrador antes de confirmar la publicación."
        footer={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', width: '100%' }}>
            <div className="site-hero-device-toggle" style={{ background: 'var(--admin-clear-bg)', borderColor: 'var(--admin-frosted-border)' }}>
              <button
                type="button"
                className={`site-hero-device-btn ${previewDevice === 'desktop' ? 'is-active' : ''}`}
                onClick={() => setPreviewDevice('desktop')}
              >
                <Monitor size={12} /> Escritorio
              </button>
              <button
                type="button"
                className={`site-hero-device-btn ${previewDevice === 'mobile' ? 'is-active' : ''}`}
                onClick={() => setPreviewDevice('mobile')}
              >
                <Smartphone size={12} /> Móvil
              </button>
            </div>
            <button type="button" className="button button-outline" onClick={() => setPreviewOpen(false)}>
              Cerrar vista previa
            </button>
          </div>
        }
      >
        <div className="site-hero-preview-viewport-wrap" style={{ borderRadius: 14 }}>
          <div
            className={`site-hero-preview-stage ${previewDevice === 'mobile' ? 'is-mobile' : 'is-desktop'}`}
            style={{
              backgroundImage: `linear-gradient(112deg, rgba(8, 7, 13, 0.92) 0%, rgba(15, 11, 24, 0.8) 54%, rgba(116, 19, 111, 0.36) 100%), url(${
                previewDevice === 'mobile' ? heroMobilePoster : heroOpeningPoster
              })`,
            }}
          >
            <div className="site-hero-preview-kicker">
              <span className="site-hero-preview-kicker-dot" />
              <span>{draft.heroEyebrow || 'AGENCIA DE PUBLICIDAD & ROTULACIÓN'}</span>
            </div>
            <h3 className="site-hero-preview-h1" style={{ fontSize: previewDevice === 'mobile' ? 20 : 28 }}>
              {previewLeadingWords}{' '}
              <span className="site-hero-preview-h1-gradient">{previewLastWord || previewTitleRaw}</span>
            </h3>
            <p className="site-hero-preview-desc" style={{ fontSize: 13 }}>
              {draft.heroText ||
                'Diseño publicitario, rotulación comercial, gran formato y branding integral para impulsar tu marca en Milagro y Ecuador.'}
            </p>
            <div className="site-hero-preview-actions">
              <span className="site-hero-preview-btn-primary">
                Solicitar cotización <ArrowUpRight size={13} />
              </span>
              <span className="site-hero-preview-btn-secondary">Explorar servicios</span>
            </div>
          </div>
        </div>

        <div className="site-hero-modal-services-grid" aria-label="Familias visibles en la portada">
          {visibleServices.map((service: any, idx: number) => (
            <article key={service.id} className="site-hero-modal-service-card">
              <b>
                {String(idx + 1).padStart(2, '0')} · {service.name}
              </b>
              <small>{service.description || 'Sin descripción pública.'}</small>
            </article>
          ))}
        </div>
      </Dialog>
    </AppFrame>
  );
}
