import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowUpRight, ChevronDown, ChevronRight, Copy, LayoutDashboard, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, X, type LucideIcon } from 'lucide-react';
import { useWorkspace } from './workspace';
import { useAuth } from '../auth/AuthProvider';
import { AdminCommandPalette } from '../components/AdminCommandPalette';
import { NumberTicker, PulsingBeacon, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import { ContextMenu, type ContextMenuAction } from '../components/ui/ContextMenu';
import { motion, useReducedMotion } from 'motion/react';
import { canViewNavigationItem, workspaceNavigation, workspaceNavGroups, DEFAULT_NAVIGATION_PREFERENCES, readNavigationPreferences, saveNavigationPreferences, type AppNavLink, type NavigationPreferences } from './navigation';
import { Avatar, getGoogleAvatarUrl } from '../components/ui/Avatar';
import { ProductionAttention } from '../pages/operations/ProductionAttention';
import { Sidebar } from './Sidebar';
import { ThemeSwitcher } from '../components/ui/ThemeSwitcher';
import { requestGlobalCommandPaletteOpen } from '../components/ui/GlobalCommandPalette';
import { useTheme } from './ThemeProvider';
import './admin-dark-theme.css';
import './admin-dark-refinements.css';
import './admin-glass-theme.css';

const wordmark = '/brand/visualcorp-wordmark.png';
const brandSymbol = '/brand/visualcorp-symbol.png';
export type AppArea = 'admin' | 'operations';
export type { AppNavLink } from './navigation';
export interface BrandProps { dark?: boolean }
export function Brand({ dark = false }: BrandProps) {
  return <Link className={`brand ${dark ? 'brand-dark' : ''}`} to="/" aria-label="Visual Corp, página pública"><img className="brand-wordmark" src={wordmark} alt="Visual Corp — Agencia Creativa"/><img className="brand-symbol" src={brandSymbol} alt="" aria-hidden="true"/></Link>;
}
export interface AppFrameProps { area: AppArea; children: React.ReactNode }
export function AppFrame({ area, children }: AppFrameProps) {
  const { data, connectionStatus } = useWorkspace();
  const { user, roles, profiles, hasPermission, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { theme, toggleTheme } = useTheme();
  const connectionLabel = connectionStatus === 'connected' ? 'Conexión con Supabase activa' : connectionStatus === 'checking' ? 'Comprobando conexión con Supabase' : connectionStatus === 'unavailable' ? 'Supabase no está configurado' : 'Sin conexión con Supabase';
  const connectionColor = connectionStatus === 'connected' ? '#10b981' : connectionStatus === 'checking' ? '#d88928' : '#e05d70';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('vc-suite-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [navigationPreference, setNavigationPreference] = useState<NavigationPreferences & { userId: string | null }>({
    userId: null,
    ...DEFAULT_NAVIGATION_PREFERENCES,
  });
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const savedNavigationPreferences = navigationPreference.userId === (user?.id || null)
    ? navigationPreference
    : { ...DEFAULT_NAVIGATION_PREFERENCES, userId: user?.id || null };
  const { style: navigationStyle, density: navigationDensity, width: navigationWidth } = savedNavigationPreferences;
  const isAdaptiveTablet = navigationStyle === 'adaptive' && viewportWidth >= 768 && viewportWidth <= 1100;
  const isCompactSidebar = navigationStyle === 'rail'
    || isAdaptiveTablet
    || ((navigationStyle === 'categories' || navigationStyle === 'adaptive') && sidebarCollapsed);

  useEffect(() => {
    const userId = user?.id || null;
    setNavigationPreference({ userId, ...readNavigationPreferences(userId) });
  }, [user?.id]);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  const saveNavigationSettings = (preferences: NavigationPreferences) => {
    const userId = user?.id || null;
    setNavigationPreference({ userId, ...preferences });
    saveNavigationPreferences(userId, preferences);
    setSidebarCollapsed(false);
    try { window.localStorage.setItem('vc-suite-sidebar-collapsed', 'false'); } catch { /* Storage can be unavailable in private browsing. */ }
  };
  const toggleSidebar = () => setSidebarCollapsed((collapsed) => {
    const next = !collapsed;
    try { window.localStorage.setItem('vc-suite-sidebar-collapsed', String(next)); } catch { /* Storage can be unavailable in private browsing. */ }
    return next;
  });

  // Atajo global Ctrl+B para expandir/contraer
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (navigationStyle !== 'categories' && navigationStyle !== 'adaptive') return;
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [navigationStyle]);
  const nav = workspaceNavigation.filter((link) => canViewNavigationItem(link, hasPermission));
  const navGroupDefinitions = workspaceNavGroups;
  const navGroups = navGroupDefinitions.map((group) => ({ ...group, items: nav.filter((link) => group.paths.includes(link.to)) })).filter((group) => group.items.length > 0);
  const isNavigationItemActive = (link: AppNavLink) => {
    const matchesPath = (path: string) => link.end ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
    return matchesPath(link.to) || Boolean(link.aliases?.includes(pathname));
  };
  const currentNavigationItem = nav.filter(isNavigationItemActive).sort((left, right) => right.to.length - left.to.length)[0];
  const activeNavGroup = navGroups
    .flatMap((group) => group.items
      .filter(isNavigationItemActive)
      .map((link) => ({ group, pathLength: link.to.length })))
    .sort((left, right) => right.pathLength - left.pathLength)[0]?.group;
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>(() => activeNavGroup ? { [activeNavGroup.id]: true } : {});
  useEffect(() => {
    if (activeNavGroup) setExpandedNavGroups((current) => ({ ...current, [activeNavGroup.id]: true }));
  }, [activeNavGroup?.id]);
  const areaTitle = 'Visual Corp Suite';
  const profileLabel = profiles.map((profile) => profile.name).join(' · ') || roles.join(' · ');
  const userDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Visual Corp';
  const googleAvatarUrl = getGoogleAvatarUrl(user);
  const directNavLinks = nav.filter((link) => !navGroupDefinitions.some((group) => group.paths.includes(link.to)));
  const [contextFeedback, setContextFeedback] = useState('');
  const contextFeedbackTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (contextFeedbackTimer.current !== null) window.clearTimeout(contextFeedbackTimer.current);
  }, []);
  const announceContextFeedback = (message: string) => {
    setContextFeedback(message);
    if (contextFeedbackTimer.current !== null) window.clearTimeout(contextFeedbackTimer.current);
    contextFeedbackTimer.current = window.setTimeout(() => {
      setContextFeedback('');
      contextFeedbackTimer.current = null;
    }, 2600);
  };
  const copyCurrentPageLink = async () => {
    let copied = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(window.location.href);
      copied = true;
    } catch {
      try {
        const field = document.createElement('textarea');
        field.value = window.location.href;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.left = '-9999px';
        document.body.append(field);
        field.select();
        copied = document.execCommand('copy');
        field.remove();
      } catch {
        copied = false;
      }
    }
    announceContextFeedback(copied ? 'Enlace de esta página copiado.' : 'No se pudo copiar el enlace.');
  };
  const contextActions: ContextMenuAction[] = [
    { label: 'Buscar en toda la Suite', icon: <Search size={14}/>, shortcut: 'Ctrl+K / ⌘K', group: 'Herramientas', onSelect: requestGlobalCommandPaletteOpen },
    { label: 'Copiar enlace de esta página', icon: <Copy size={14}/>, group: 'Herramientas', onSelect: () => { void copyCurrentPageLink(); } },
    { label: theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', icon: theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>, group: 'Vista', onSelect: toggleTheme },
    { kind: 'checkbox', label: 'Barra lateral compacta', icon: <PanelLeftClose size={14}/>, checked: isCompactSidebar, disabled: isAdaptiveTablet || (navigationStyle !== 'categories' && navigationStyle !== 'adaptive'), shortcut: 'Ctrl+B', group: 'Vista', onSelect: () => {}, onCheckedChange: toggleSidebar },
    { kind: 'separator', label: '', onSelect: () => {} },
    ...directNavLinks.map((link) => {
      const Icon = link.icon;
      return { label: link.label, icon: <Icon size={14}/>, current: currentNavigationItem?.to === link.to, group: 'Navegación', onSelect: () => navigate(link.to) };
    }),
    ...navGroups.map((group) => {
      const GroupIcon = group.icon;
      return {
        label: group.label,
        icon: <GroupIcon size={14}/>,
        current: group.id === activeNavGroup?.id,
        group: 'Navegación',
        onSelect: () => navigate(group.items[0]?.to || '/panel'),
        children: group.items.map((link) => {
          const Icon = link.icon;
          return { label: link.label, icon: <Icon size={13}/>, current: currentNavigationItem?.to === link.to, onSelect: () => navigate(link.to) };
        }),
      };
    }),
    { kind: 'separator', label: '', onSelect: () => {} },
    { label: 'Volver arriba', icon: <ArrowUp size={14}/>, onSelect: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
  ];
  return <div className={`work-app area-${area}${isCompactSidebar ? ' sidebar-collapsed' : ''}${theme === 'dark' ? ' theme-dark' : ' theme-light'}`} data-theme={theme} data-navigation-style={navigationStyle} data-navigation-density={navigationDensity} data-navigation-width={navigationWidth} data-adaptive-compact={isAdaptiveTablet ? 'true' : undefined}>
    <div className="vc-admin-context-feedback" role="status" aria-live="polite" aria-atomic="true">{contextFeedback}</div>
    <Sidebar
      area={area}
      isCollapsed={isCompactSidebar}
      onToggleCollapse={toggleSidebar}
      mobileOpen={mobileNavOpen}
      onCloseMobile={() => setMobileNavOpen(false)}
      navGroups={navGroups}
      navigationStyle={navigationStyle}
      navigationPreferences={savedNavigationPreferences}
      onNavigationPreferencesChange={saveNavigationSettings}
      activeNavGroup={activeNavGroup}
      directNavLinks={directNavLinks}
      userDisplayName={userDisplayName}
      userEmail={user?.email || ''}
      profileLabel={profileLabel}
      googleAvatarUrl={googleAvatarUrl}
      signOut={signOut}
      leadsCount={data.leads.length}
      theme={theme}
      toggleTheme={toggleTheme}
    />
    {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)}/>}
    <div className="main-shell"><header className="topbar"><button className="desktop-sidebar-toggle" type="button" aria-label={isCompactSidebar ? 'Expandir barra lateral (Ctrl+B)' : 'Contraer barra lateral (Ctrl+B)'} aria-pressed={isCompactSidebar} title={isCompactSidebar ? 'Expandir barra lateral (Ctrl+B)' : 'Contraer barra lateral (Ctrl+B)'} onClick={toggleSidebar}>{isCompactSidebar ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button><button className="mobile-menu-button" type="button" aria-label={mobileNavOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'} aria-expanded={mobileNavOpen} aria-controls="sidebar-workspace" onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={20}/> : <Menu size={20}/>}</button><div className="breadcrumbs"><span>{areaTitle}</span><ChevronRight size={14}/><b>{data.settings.name}</b></div><div className="topbar-right"><ThemeSwitcher theme={theme} onToggle={toggleTheme} variant="capsule" /><AdminCommandPalette items={nav}/><ContextMenu scope="document" label="Acciones de navegación" actions={contextActions}/><ProductionAttention/><span className="local-badge connection-indicator" title={connectionLabel}><PulsingBeacon size={8} color={connectionColor} label={connectionLabel}/></span><button className="top-avatar" aria-label={`Cerrar sesión de ${userDisplayName}`} title={userDisplayName} onClick={signOut}><Avatar name={userDisplayName} src={googleAvatarUrl} size="sm" badge={googleAvatarUrl ? <span className="vc-google-avatar-mark">G</span> : undefined}/></button></div></header><main className="main-content"><motion.div key={pathname} className="vc-route-frame" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>{children}</motion.div><footer className="local-footer">Acceso autenticado y permisos comprobados en Supabase.</footer></main></div>
  </div>;
}

export interface PageHeadingProps { eyebrow: string; title: string; description?: string; action?: React.ReactNode }
export function PageHeading({ eyebrow, title, description, action }: PageHeadingProps) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action&&<div className="heading-action">{action}</div>}</div>;
}

export interface StatCardProps { label: string; value: React.ReactNode; icon: LucideIcon; note: string; tone?: string }
export function StatCard({ label, value, icon: Icon, note, tone = '' }: StatCardProps) {
  const reduceMotion = useReducedMotion();
  const displayedValue = typeof value === 'number' && Number.isFinite(value) ? <NumberTicker value={value}/> : value;
  return <motion.article className="stat-card vc-magic-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight} initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={reduceMotion ? undefined : { y: -2 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: 'easeOut' }}><SpotlightLayer/><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div className="stat-meta"><span>{label}</span><b>{displayedValue}</b><small>{note}</small></div></motion.article>;
}
