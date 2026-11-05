import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { PulsingBeacon } from '../components/ui/MagicComponents';
import type { AppNavLink, AppNavGroup } from './navigation';
import './sidebar.css';

const wordmark = '/brand/visualcorp-wordmark.png';
const brandSymbol = '/brand/visualcorp-symbol.png';

export type SidebarGroupWithItems = AppNavGroup & { items: AppNavLink[] };

export type SidebarProps = {
  area: 'admin' | 'operations';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  navGroups: SidebarGroupWithItems[];
  activeNavGroup?: SidebarGroupWithItems;
  directNavLinks: AppNavLink[];
  userDisplayName: string;
  userEmail: string;
  profileLabel: string;
  googleAvatarUrl?: string;
  signOut: () => void;
  leadsCount: number;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
};

export function Sidebar({
  area,
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  navGroups,
  activeNavGroup,
  directNavLinks,
  userDisplayName,
  userEmail,
  profileLabel,
  googleAvatarUrl,
  signOut,
  leadsCount,
  theme = 'light',
  toggleTheme,
}: SidebarProps) {
  const { pathname } = useLocation();

  // Acordeón en modo desplegado
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    activeNavGroup ? { [activeNavGroup.id]: true } : { [navGroups[0]?.id || '']: true }
  );

  // Mantener abierto el grupo que contenga la ruta actual
  useEffect(() => {
    if (activeNavGroup) {
      setExpandedGroups((curr) => ({ ...curr, [activeNavGroup.id]: true }));
    }
  }, [activeNavGroup?.id]);

  // Estado de flyout flotante para grupos en modo compactado
  const [activeFlyout, setActiveFlyout] = useState<{
    groupId: string;
    top: number;
  } | null>(null);

  // Estado de tooltip flotante en modo compactado
  const [tooltip, setTooltip] = useState<{
    text: string;
    top: number;
  } | null>(null);

  // Popover de perfil de usuario en modo compactado
  const [profileFlyout, setProfileFlyout] = useState<{ top: number } | null>(null);

  const sidebarRef = useRef<HTMLElement>(null);

  // Cerrar flyouts flotantes en resize, scroll o escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveFlyout(null);
        setProfileFlyout(null);
        setTooltip(null);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setActiveFlyout(null);
        setProfileFlyout(null);
        setTooltip(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  // Al navegar, cerrar drawers y flyouts
  useEffect(() => {
    setActiveFlyout(null);
    setProfileFlyout(null);
    setTooltip(null);
    onCloseMobile();
  }, [pathname]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((curr) => ({ ...curr, [groupId]: !curr[groupId] }));
  };

  const showTooltip = (text: string, e: React.MouseEvent<HTMLElement>) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text, top: rect.top + rect.height / 2 - 12 });
  };

  const hideTooltip = () => {
    setTooltip(null);
  };

  const handleGroupTriggerMouseEnter = (
    groupId: string,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip(null);
    setActiveFlyout({ groupId, top: Math.max(12, Math.min(rect.top - 10, window.innerHeight - 340)) });
  };

  const handleProfileMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip(null);
    setProfileFlyout({ top: Math.max(12, rect.top - 120) });
  };

  const renderNavLinkItem = (link: AppNavLink, isSubitem = false, inFlyout = false) => {
    const Icon = link.icon;
    const isCrm = link.to === '/operaciones/crm';
    const badgeCount = isCrm && leadsCount > 0 ? leadsCount : undefined;

    return (
      <NavLink
        key={link.to}
        end={link.end}
        to={link.to}
        title={isCollapsed && !inFlyout ? undefined : link.label}
        aria-label={link.label}
        onMouseEnter={(e) => {
          if (!inFlyout) showTooltip(link.label, e);
        }}
        onMouseLeave={hideTooltip}
        onClick={() => {
          setActiveFlyout(null);
          onCloseMobile();
        }}
        className={({ isActive }) =>
          `sidebar-nav-item${isActive ? ' is-active' : ''}${isSubitem ? ' is-subitem' : ''}${inFlyout ? ' is-flyout-item' : ''}`
        }
      >
        <span className="sidebar-nav-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="sidebar-nav-label">{link.label}</span>
        {badgeCount !== undefined && (
          <span className="sidebar-item-badge" title={`${badgeCount} solicitudes nuevas`}>
            {badgeCount}
          </span>
        )}
      </NavLink>
    );
  };

  const currentFlyoutGroup = navGroups.find((g) => g.id === activeFlyout?.groupId);

  return (
    <>
      <aside
        id="sidebar-workspace"
        ref={sidebarRef}
        className={`sidebar ${mobileOpen ? 'is-mobile-open' : ''}`}
        aria-label="Panel de navegación principal"
      >
        {/* Cabecera de marca con alternador */}
        <div className="sidebar-brand-wrapper">
          <Link
            to="/"
            className="sidebar-brand-link"
            aria-label="Visual Corp, ir a la página pública"
            title="Visual Corp — Ir a la página pública"
          >
            <img
              src={brandSymbol}
              alt="Visual Corp"
              className="sidebar-brand-symbol"
            />
            <img
              src={wordmark}
              alt="Visual Corp"
              className="sidebar-brand-wordmark"
            />
          </Link>

          <button
            type="button"
            className="sidebar-toggle-inline-btn"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expandir barra lateral (Ctrl+B)' : 'Contraer barra lateral (Ctrl+B)'}
            title={isCollapsed ? 'Expandir barra lateral (Ctrl+B)' : 'Contraer barra lateral (Ctrl+B)'}
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Píldora de estado de sesión */}
        <div
          className="sidebar-session-banner"
          title={`Sesión segura · ${profileLabel}`}
          onMouseEnter={(e) => showTooltip(`Sesión segura · ${profileLabel}`, e)}
          onMouseLeave={hideTooltip}
        >
          <PulsingBeacon size={7} color="#10b981" />
          <span className="sidebar-session-text">
            SESIÓN SEGURA
            {profileLabel && <span className="sidebar-session-role"> · {profileLabel}</span>}
          </span>
        </div>

        {/* Lista de navegación */}
        <nav className="sidebar-nav-container" aria-label="Navegación de módulos">
          <span className="sidebar-section-kicker">Espacio de trabajo</span>

          {/* Enlaces directos (ej. Inicio) */}
          {directNavLinks.map((link) => renderNavLinkItem(link, false))}

          {/* Grupos de navegación */}
          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const isExpanded = Boolean(expandedGroups[group.id]);
            const containsCurrentPage = group.id === activeNavGroup?.id;
            const groupControlId = `nav-group-${area}-${group.id}`;

            // En modo compactado (Collapsed)
            if (isCollapsed) {
              return (
                <div key={group.id} className="sidebar-collapsed-group-wrapper">
                  <button
                    type="button"
                    className={`sidebar-collapsed-trigger-btn${
                      containsCurrentPage ? ' has-active-child' : ''
                    }${activeFlyout?.groupId === group.id ? ' is-flyout-open' : ''}`}
                    aria-label={group.label}
                    title={group.label}
                    onMouseEnter={(e) => handleGroupTriggerMouseEnter(group.id, e)}
                    onClick={(e) => handleGroupTriggerMouseEnter(group.id, e)}
                  >
                    <GroupIcon size={18} />
                    {containsCurrentPage && <span className="sidebar-collapsed-active-dot" />}
                  </button>
                </div>
              );
            }

            // En modo desplegado (Expanded)
            return (
              <section
                key={group.id}
                className={`sidebar-accordion-group${containsCurrentPage ? ' has-active-child' : ''}${
                  isExpanded ? ' is-open' : ''
                }`}
              >
                <button
                  type="button"
                  className="sidebar-group-header-btn"
                  aria-expanded={isExpanded}
                  aria-controls={groupControlId}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="sidebar-nav-icon" aria-hidden="true">
                    <GroupIcon size={17} />
                  </span>
                  <span className="sidebar-nav-label">{group.label}</span>
                  <span className="sidebar-group-badge">{group.items.length}</span>
                  <ChevronDown size={14} className="sidebar-group-chevron" aria-hidden="true" />
                </button>

                {isExpanded && (
                  <div className="sidebar-group-subitems" id={groupControlId}>
                    {group.items.map((link) => renderNavLinkItem(link, true))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        {/* Tarjeta de perfil inferior */}
        <div
          className="sidebar-profile-card"
          onMouseEnter={handleProfileMouseEnter}
          onMouseLeave={hideTooltip}
        >
          <Avatar
            name={userDisplayName}
            src={googleAvatarUrl}
            size="md"
            className="profile-avatar"
            badge={googleAvatarUrl ? <span className="vc-google-avatar-mark">G</span> : undefined}
          />
          <div className="sidebar-profile-info">
            <b className="sidebar-profile-name" title={userDisplayName}>
              {userDisplayName}
            </b>
            <small className="sidebar-profile-role" title={userEmail || profileLabel}>
              {profileLabel || userEmail}
            </small>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={signOut}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Flyout flotante de grupos (modo compactado) */}
      {isCollapsed && currentFlyoutGroup && activeFlyout && (
        <div
          className="sidebar-flyout-popover"
          style={{ top: activeFlyout.top }}
          onMouseLeave={() => setActiveFlyout(null)}
          role="menu"
          aria-label={`Opciones de ${currentFlyoutGroup.label}`}
        >
          <div className="sidebar-flyout-header">
            <span className="sidebar-flyout-title">{currentFlyoutGroup.label}</span>
            <span className="sidebar-group-badge">{currentFlyoutGroup.items.length}</span>
          </div>
          {currentFlyoutGroup.items.map((link) => renderNavLinkItem(link, false, true))}
        </div>
      )}

      {/* Popover flotante de perfil (modo compactado) */}
      {isCollapsed && profileFlyout && (
        <div
          className="sidebar-flyout-popover sidebar-profile-popover"
          style={{ top: profileFlyout.top }}
          onMouseLeave={() => setProfileFlyout(null)}
          role="menu"
          aria-label="Perfil de usuario"
        >
          <div style={{ padding: '6px 10px 8px 10px', borderBottom: '1px solid var(--vc-sidebar-border)' }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{userDisplayName}</div>
            <div style={{ fontSize: 10, color: '#8c8596', marginTop: 2 }}>{userEmail}</div>
            <div style={{ fontSize: 9.5, color: '#a51091', fontWeight: 600, marginTop: 4 }}>
              {profileLabel}
            </div>
          </div>
          {toggleTheme && (
            <button
              type="button"
              className="sidebar-nav-item"
              style={{ width: '100%', marginTop: 3 }}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span className="sidebar-nav-label">
                Modo {theme === 'dark' ? 'claro' : 'oscuro'}
              </span>
            </button>
          )}
          <button
            type="button"
            className="sidebar-nav-item"
            style={{ width: '100%', marginTop: 4, color: '#ef4444' }}
            onClick={() => {
              setProfileFlyout(null);
              signOut();
            }}
          >
            <LogOut size={16} />
            <span className="sidebar-nav-label">Cerrar sesión</span>
          </button>
        </div>
      )}

      {/* Tooltip simple flotante en modo compactado */}
      {isCollapsed && tooltip && !activeFlyout && !profileFlyout && (
        <div className="sidebar-tooltip" style={{ top: tooltip.top }} role="tooltip">
          {tooltip.text}
        </div>
      )}
    </>
  );
}
