import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Globe2,
  Image,
  Mail,
  Newspaper,
  ShoppingBag,
} from 'lucide-react';
import './site-admin.css';

const tabs = [
  { to: '/admin/sitio', label: 'Inicio', icon: Globe2 },
  { to: '/admin/servicios', label: 'Servicios', icon: BriefcaseBusiness },
  { to: '/admin/tienda', label: 'Tienda', icon: ShoppingBag },
  { to: '/admin/blog', label: 'Blog', icon: BookOpen },
  { to: '/admin/publicaciones', label: 'Publicaciones', icon: Newspaper },
  { to: '/admin/portafolio', label: 'Portafolio', icon: Image },
  { to: '/admin/contacto', label: 'Contacto', icon: Mail },
];

const publicLinks: Record<string, { to: string; label: string; badge: string }> = {
  '/admin/sitio': { to: '/', label: 'Ver inicio público', badge: 'Portada' },
  '/admin/servicios': { to: '/#servicios', label: 'Ver servicios públicos', badge: 'Servicios' },
  '/admin/tienda': { to: '/tienda', label: 'Ver tienda pública', badge: 'Catálogo' },
  '/admin/blog': { to: '/blog', label: 'Ver blog público', badge: 'Artículos' },
  '/admin/publicaciones': { to: '/publicaciones', label: 'Ver publicaciones', badge: 'Editorial' },
  '/admin/portafolio': { to: '/portafolio', label: 'Ver portafolio', badge: 'Galería' },
  '/admin/contacto': { to: '/#contacto', label: 'Ver contacto', badge: 'Canales' },
};

export function SiteAdminNav({ active }: { active: string }) {
  const currentTab = tabs.find((t) => t.to === active) || tabs[0];
  const publicTarget = publicLinks[active] || { to: '/', label: 'Ver sitio público', badge: 'En vivo' };

  return (
    <div className="site-admin-nav-bar">
      <style>{`
        .site-admin-nav-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: -7px 0 22px;
          max-width: 100%;
          min-width: 0;
          flex-wrap: wrap;
        }
        .site-admin-nav-bar .site-admin-tabs {
          margin: 0;
          flex: 1 1 auto;
          min-width: 0;
        }
        .site-admin-nav-meta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .site-admin-nav-context-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 11px;
          border-radius: 999px;
          background: #f4f3f7;
          border: 1px solid #e3e2e8;
          color: #525363;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .site-admin-nav-context-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 5px rgba(16, 185, 129, 0.7);
          flex-shrink: 0;
        }
        .site-admin-nav-public-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 13px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid #dfc6e1;
          color: #74136f;
          font-size: 11px;
          font-weight: 750;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(116, 19, 111, 0.06);
          transition: all 0.16s ease;
        }
        .site-admin-nav-public-link:hover {
          background: #faf4fb;
          border-color: #a51091;
          color: #5a0e56;
          box-shadow: 0 2px 5px rgba(116, 19, 111, 0.12);
        }
        @media (max-width: 900px) {
          .site-admin-nav-bar {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .site-admin-nav-meta {
            justify-content: space-between;
            width: 100%;
          }
        }
        @media (max-width: 520px) {
          .site-admin-nav-meta {
            flex-wrap: wrap;
            gap: 6px;
          }
          .site-admin-nav-context-pill,
          .site-admin-nav-public-link {
            font-size: 10px;
            padding: 5px 9px;
          }
        }
      `}</style>
      <nav className="site-admin-tabs" aria-label="Editores de la página pública">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end className={active === to ? 'is-active' : ''}>
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="site-admin-nav-meta">
        <span className="site-admin-nav-context-pill" title="Sección activa en edición">
          <span className="site-admin-nav-context-dot" aria-hidden="true" />
          <span>{currentTab.label}</span>
        </span>
        <a
          href={publicTarget.to}
          target="_blank"
          rel="noreferrer"
          className="site-admin-nav-public-link"
          title={`Abrir ${publicTarget.label} en nueva pestaña`}
        >
          <span>{publicTarget.label}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
