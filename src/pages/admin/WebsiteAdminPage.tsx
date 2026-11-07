import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
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
import { saveWebsiteContent } from '../../lib/websiteAdminRepository';
import { SiteAdminNav } from './SiteAdminNav';

const symbol = '/brand/visualcorp-symbol.png';

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
  const canEdit = hasPermission('website', 'edit');

  const [draft, setDraft] = useState<any>(data.settings || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Local state for UI enhancements
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  useEffect(() => {
    setDraft(data.settings || {});
  }, [data.settings]);

  // Dirty state detection
  const isDirty = useMemo(() => {
    const origEyebrow = (data.settings?.heroEyebrow || '').trim();
    const origTitle = (data.settings?.heroTitle || '').trim();
    const origText = (data.settings?.heroText || '').trim();

    const curEyebrow = (draft?.heroEyebrow || '').trim();
    const curTitle = (draft?.heroTitle || '').trim();
    const curText = (draft?.heroText || '').trim();

    return (
      curEyebrow !== origEyebrow ||
      curTitle !== origTitle ||
      curText !== origText
    );
  }, [draft, data.settings]);

  // KPI Calculations
  const isHeroConfigured = Boolean(
    (draft?.heroTitle || '').trim() && (draft?.heroText || '').trim()
  );

  const totalServices = (data.services || []).length;
  const visibleServicesCount = (data.services || []).filter((s: any) => s.enabled).length;

  const contactKeys = ['location', 'contactPhone', 'instagram', 'facebook', 'tiktok'] as const;
  const activeContactsCount = contactKeys.filter((k) =>
    Boolean((draft?.[k] || data.settings?.[k] || '').trim())
  ).length;

  const totalSeoChars =
    ((draft?.heroTitle || '').trim().length) +
    ((draft?.heroText || '').trim().length);

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

  // Save handler
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      await saveWebsiteContent(draft, data.services, organizationId);
      setData((current: any) => ({ ...current, settings: draft }));
      flash('Cambios del sitio guardados en la base compartida.');
    } catch (err: any) {
      setError(err?.message || 'No se guardaron los cambios.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle single service visibility
  const toggleService = async (id: string) => {
    if (!canEdit) return;
    const next = (data.services || []).map((service: any) =>
      service.id === id ? { ...service, enabled: !service.enabled } : service
    );
    try {
      await saveWebsiteContent(draft, next, organizationId);
      setData((current: any) => ({ ...current, services: next }));
      flash('Visibilidad del servicio actualizada.');
    } catch (err: any) {
      setError(err?.message || 'No se guardó el servicio.');
    }
  };

  // Bulk set service visibility
  const setAllServices = async (enabled: boolean) => {
    if (!canEdit) return;
    const next = (data.services || []).map((service: any) => ({ ...service, enabled }));
    try {
      setSaving(true);
      await saveWebsiteContent(draft, next, organizationId);
      setData((current: any) => ({ ...current, services: next }));
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

  // Apply preset
  const applyPreset = (preset: typeof heroPresets[0]) => {
    if (!canEdit) return;
    setDraft((current: any) => ({
      ...current,
      heroEyebrow: preset.eyebrow,
      heroTitle: preset.title,
      heroText: preset.text,
    }));
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
          box-sizing: border-box;
        }
        .site-admin-kpi-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 13px 15px;
          background: #ffffff;
          border: 1px solid #e7e6ec;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          min-width: 0;
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
          border-radius: 8px;
          background: #faf4fb;
          color: #74136f;
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
          background: #e8f9ee;
          color: #0f766e;
          border: 1px solid #bbf2ce;
        }
        .site-admin-kpi-badge.is-warning {
          background: #fef7e7;
          color: #b45309;
          border: 1px solid #fde5a7;
        }
        .site-admin-kpi-badge.is-neutral {
          background: #f1f1f4;
          color: #555663;
          border: 1px solid #e1e1e6;
        }
        .site-admin-kpi-value {
          font-size: 18px;
          font-weight: 850;
          color: #1e1f29;
          line-height: 1.2;
        }
        .site-admin-kpi-label {
          font-size: 10.5px;
          font-weight: 750;
          color: #6a6b79;
          margin-top: 3px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .site-admin-kpi-meta {
          font-size: 11px;
          color: #8c8d99;
          margin-top: 4px;
          line-height: 1.35;
        }

        /* Unsaved Changes & Sync Badge */
        .site-hero-sync-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 750;
        }
        .site-hero-sync-badge.is-dirty {
          background: #fff6e9;
          color: #b45309;
          border: 1px solid #fed7aa;
        }
        .site-hero-sync-badge.is-synced {
          background: #eefbf3;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }

        /* Hero Presets */
        .site-hero-presets {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 11px 13px;
          background: #fbfafc;
          border: 1px solid #eceaf1;
          border-radius: 10px;
          margin-bottom: 16px;
        }
        .site-hero-presets-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 11px;
          font-weight: 700;
          color: #5d5e6e;
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
          padding: 5px 9px;
          background: #ffffff;
          border: 1px solid #dedde5;
          border-radius: 7px;
          color: #494a58;
          font-size: 10.5px;
          font-weight: 650;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-hero-preset-btn:hover {
          border-color: #bd7bb6;
          color: #74136f;
          background: #faf4fb;
        }
        .site-hero-preset-btn--reset {
          margin-left: auto;
          border-color: #fbcfe8;
          color: #9d174d;
          background: #fff1f2;
        }
        .site-hero-preset-btn--reset:hover {
          background: #ffe4e6;
          border-color: #f43f5e;
          color: #881337;
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
          background: #ecfdf5;
        }
        .site-char-counter.is-notice {
          color: #d97706;
          background: #fffbeb;
        }
        .site-char-counter.is-muted {
          color: #888996;
        }

        /* Live Preview Panel */
        .site-hero-live-preview {
          margin-top: 18px;
          background: #0f1015;
          border: 1px solid #232533;
          border-radius: 13px;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        .site-hero-preview-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 13px;
          background: #171821;
          border-bottom: 1px solid #282a3a;
        }
        .site-hero-preview-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #d1d2dc;
          font-size: 11px;
          font-weight: 750;
        }
        .site-hero-device-toggle {
          display: inline-flex;
          align-items: center;
          background: #0a0b0e;
          border: 1px solid #282a3a;
          border-radius: 7px;
          padding: 2px;
          gap: 2px;
        }
        .site-hero-device-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border: 0;
          border-radius: 5px;
          background: transparent;
          color: #808294;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-hero-device-btn.is-active {
          background: #2b2d3d;
          color: #ffffff;
        }
        .site-hero-preview-viewport-wrap {
          padding: 18px 14px;
          background: radial-gradient(circle at 50% 10%, rgba(116, 19, 111, 0.22) 0%, transparent 68%), #0c0d12;
          display: flex;
          justify-content: center;
          overflow: hidden;
        }
        .site-hero-preview-stage {
          width: 100%;
          transition: max-width 0.22s ease;
        }
        .site-hero-preview-stage.is-mobile {
          max-width: 360px;
          border: 1px solid #2a2c3a;
          border-radius: 16px;
          padding: 16px 14px;
          background: #0e0f16;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        }
        .site-hero-preview-stage.is-desktop {
          max-width: 100%;
          padding: 6px 2px;
        }
        .site-hero-preview-browser-dots {
          display: flex;
          gap: 5px;
          margin-bottom: 12px;
        }
        .site-hero-preview-browser-dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #2a2c3a;
        }
        .site-hero-preview-browser-dots span:nth-child(1) { background: #ef4444; }
        .site-hero-preview-browser-dots span:nth-child(2) { background: #f59e0b; }
        .site-hero-preview-browser-dots span:nth-child(3) { background: #10b981; }
        .site-hero-preview-kicker {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #27d5ec;
          margin-bottom: 10px;
          background: rgba(39, 213, 236, 0.09);
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid rgba(39, 213, 236, 0.25);
        }
        .site-hero-preview-kicker-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #27d5ec;
          box-shadow: 0 0 7px #27d5ec;
        }
        .site-hero-preview-h1 {
          font-size: 21px;
          font-weight: 850;
          color: #ffffff;
          line-height: 1.25;
          margin: 0 0 10px 0;
          letter-spacing: -0.02em;
        }
        .site-hero-preview-h1-gradient {
          background: linear-gradient(135deg, #27d5ec 0%, #ec4899 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .site-hero-preview-desc {
          font-size: 12px;
          line-height: 1.6;
          color: #a0a1b2;
          margin: 0 0 15px 0;
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
          padding: 6px 12px;
          border-radius: 7px;
          background: linear-gradient(135deg, #a51091, #74136f);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 750;
          box-shadow: 0 2px 7px rgba(165, 16, 145, 0.35);
        }
        .site-hero-preview-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #d8d9e2;
          font-size: 10.5px;
          font-weight: 700;
        }
        .site-hero-preview-services-tray {
          border-top: 1px solid #1f212e;
          padding-top: 12px;
        }
        .site-hero-preview-services-label {
          display: block;
          font-size: 9px;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6a6c7e;
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
          padding: 3px 8px;
          border-radius: 5px;
          background: #191b24;
          color: #b5b7c8;
          border: 1px solid #2b2e3e;
        }
        .site-hero-preview-empty-pill {
          font-size: 10px;
          color: #686979;
          font-style: italic;
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
          color: #8b8c98;
          pointer-events: none;
        }
        .site-services-search-input {
          width: 100%;
          padding: 7px 30px 7px 32px;
          border: 1px solid #e3e2e8;
          border-radius: 8px;
          font-size: 11px;
          background: #fafafc;
          color: #272832;
          transition: all 0.15s ease;
          box-sizing: border-box;
        }
        .site-services-search-input:focus {
          background: #fff;
          border-color: #a51091;
          outline: 3px solid rgba(165, 16, 145, 0.12);
        }
        .site-services-search-clear {
          position: absolute;
          right: 8px;
          border: 0;
          background: transparent;
          color: #8b8c98;
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
          background: #f1f0f4;
          padding: 2px;
          border-radius: 7px;
          gap: 2px;
        }
        .site-services-filter-btn {
          border: 0;
          background: transparent;
          color: #636472;
          padding: 4px 8px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-services-filter-btn.is-active {
          background: #fff;
          color: #74136f;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .site-services-bulk-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .site-services-bulk-btn {
          border: 1px solid #e1e0e7;
          background: #fff;
          color: #4b4c59;
          font-size: 10px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-services-bulk-btn:hover:not(:disabled) {
          background: #f7f6f9;
          border-color: #cccad5;
        }
        .site-services-bulk-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .site-services-edit-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #74136f;
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
          background: #e8f9ee;
          color: #0f766e;
          border: 1px solid #bbf2ce;
        }
        .site-service-status-pill.is-hidden {
          background: #f3f3f6;
          color: #7b7c88;
          border: 1px solid #e1e1e6;
        }
        .site-services-empty-state {
          padding: 20px;
          text-align: center;
          color: #7c7d8a;
          font-size: 11px;
          background: #fafafc;
          border-radius: 8px;
          border: 1px dashed #e3e2e8;
        }

        /* Error alert */
        .site-admin-alert-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          border-radius: 9px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 16px;
        }

        @media (max-width: 1100px) {
          .site-admin-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 600px) {
          .site-admin-kpi-grid {
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
        <form className="panel form-panel" onSubmit={save}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTENIDO PRINCIPAL</span>
              <h2>Mensajes del sitio</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className={`site-hero-sync-badge ${
                  isDirty ? 'is-dirty' : 'is-synced'
                }`}
              >
                {isDirty ? (
                  <>
                    <span style={{ fontSize: 9 }}>●</span> Cambios sin guardar
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} /> Sincronizado
                  </>
                )}
              </span>
              {canEdit && (
                <button className="button button-dark" type="submit" disabled={saving}>
                  <Check size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              )}
            </div>
          </div>

          {/* Quick preset chips */}
          {canEdit && (
            <div className="site-hero-presets">
              <div className="site-hero-presets-header">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={13} color="#74136f" /> Sugerencias de tono institucional:
                </span>
                {isDirty && (
                  <button
                    type="button"
                    className="site-hero-preset-btn site-hero-preset-btn--reset"
                    onClick={() => setDraft(data.settings || {})}
                    title="Restaurar a los textos guardados"
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
                    onClick={() => applyPreset(preset)}
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
              >
                <div className="site-hero-preview-browser-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
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
                    Cotizar proyecto <ArrowUpRight size={13} />
                  </span>
                  <span className="site-hero-preview-btn-secondary">
                    Ver portafolio
                  </span>
                </div>

                {/* Active Service Family Pills in Preview */}
                <div className="site-hero-preview-services-tray">
                  <span className="site-hero-preview-services-label">
                    Familias activas en la portada ({visibleServicesCount})
                  </span>
                  <div className="site-hero-preview-services-list">
                    {(data.services || [])
                      .filter((s: any) => s.enabled)
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
          <Globe2 size={17} /> La página pública se actualiza al guardar
        </span>
        <Link to="/" target="_blank" rel="noreferrer">
          Ver el resultado <ArrowUpRight size={15} />
        </Link>
      </div>
    </AppFrame>
  );
}
