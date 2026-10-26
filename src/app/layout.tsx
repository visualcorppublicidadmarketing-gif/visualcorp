import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, ChevronRight, CircleHelp, LayoutDashboard, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useWorkspace } from './workspace';
import { useAuth } from '../auth/AuthProvider';
import { AdminCommandPalette } from '../components/AdminCommandPalette';
import { NumberTicker, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import { ContextMenu, type ContextMenuAction } from '../components/ui/ContextMenu';
import { motion, useReducedMotion } from 'motion/react';
import { canViewNavigationItem, workspaceNavigation, workspaceNavGroups, type AppNavLink } from './navigation';

const wordmark = '/brand/visualcorp-wordmark.png';
export type AppArea = 'admin' | 'operations';
export type { AppNavLink } from './navigation';
export interface BrandProps { dark?: boolean }
export function Brand({ dark = false }: BrandProps) {
  return <Link className={`brand ${dark ? 'brand-dark' : ''}`} to="/" aria-label="Visual Corp, página pública"><img src={wordmark} alt="Visual Corp — Agencia Creativa" /></Link>;
}
export interface AppFrameProps { area: AppArea; children: React.ReactNode }
export function AppFrame({ area, children }: AppFrameProps) {
  const { data } = useWorkspace();
  const { user, roles, profiles, hasPermission, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);
  const nav = workspaceNavigation.filter((link) => canViewNavigationItem(link, hasPermission));
  const navGroupDefinitions = workspaceNavGroups;
  const navGroups = navGroupDefinitions.map((group) => ({ ...group, items: nav.filter((link) => group.paths.includes(link.to)) })).filter((group) => group.items.length > 0);
  const activeNavGroup = navGroups.find((group) => group.items.some((link) => link.end ? pathname === link.to : pathname === link.to || pathname.startsWith(`${link.to}/`)));
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>(() => activeNavGroup ? { [activeNavGroup.id]: true } : {});
  useEffect(() => {
    if (activeNavGroup) setExpandedNavGroups((current) => ({ ...current, [activeNavGroup.id]: true }));
  }, [activeNavGroup?.id]);
  const areaTitle = 'Visual Corp Suite';
  const profileLabel = profiles.map((profile) => profile.name).join(' · ') || roles.join(' · ');
  const directNavLinks = nav.filter((link) => !navGroupDefinitions.some((group) => group.paths.includes(link.to)));
  const contextActions: ContextMenuAction[] = [
    { label: 'Ir al inicio del panel', icon: <LayoutDashboard size={14}/>, onSelect: () => navigate('/panel') },
    ...navGroups.map((group) => {
      const GroupIcon = group.icon;
      return {
        label: group.label,
        icon: <GroupIcon size={14}/>,
        onSelect: () => navigate(group.items[0]?.to || '/panel'),
        children: group.items.map((link) => {
          const Icon = link.icon;
          return { label: link.label, icon: <Icon size={13}/>, onSelect: () => navigate(link.to) };
        }),
      };
    }),
    ...directNavLinks.map((link) => {
      const Icon = link.icon;
      return { label: link.label, icon: <Icon size={14}/>, onSelect: () => navigate(link.to) };
    }),
    { kind: 'separator', label: '', onSelect: () => {} },
    { label: 'Volver arriba', icon: <ArrowUpRight size={14}/>, shortcut: '↑', onSelect: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
  ];
  const renderNavLink = ({ to, label, icon: Icon, end }: AppNavLink) => <NavLink key={to} end={end} to={to} title={label} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}><Icon size={18}/><span>{label}</span>{to === '/operaciones/crm' && data.leads.length > 0 && <b className="sidebar-count">{data.leads.length}</b>}</NavLink>;
  return <div className={`work-app area-${area}`}>
    <ContextMenu scope="document" trigger={false} label="Acciones de navegación" actions={contextActions}/>
    <aside id="sidebar-workspace" className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand/><button title="Ayuda" aria-label="Ayuda"><CircleHelp size={18}/></button></div>
      <div className="workspace-pill"><span className="status-dot"/> SESIÓN SEGURA <span>· {profileLabel}</span></div>
      <nav className="sidebar-navigation" aria-label="Navegación de Visual Corp Suite">
        <small className="sidebar-caption">ESPACIO DE TRABAJO</small>
        {directNavLinks.map(renderNavLink)}
        {navGroups.map((group) => {
          const GroupIcon = group.icon;
          const isExpanded = Boolean(expandedNavGroups[group.id]);
          const containsCurrentPage = group.id === activeNavGroup?.id;
          const groupControlId = `nav-group-${area}-${group.id}`;
          return <section className={`sidebar-nav-group ${containsCurrentPage ? 'has-active-page' : ''}`} key={group.id}>
            <button className="sidebar-group-toggle" type="button" aria-expanded={isExpanded} aria-controls={groupControlId} onClick={() => setExpandedNavGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}>
              <GroupIcon size={17}/><span>{group.label}</span><small>{group.items.length}</small><ChevronDown className="sidebar-group-chevron" size={15}/>
            </button>
            <div className="sidebar-group-items" id={groupControlId} hidden={!isExpanded}>{group.items.map(renderNavLink)}</div>
          </section>;
        })}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-profile"><div className="profile-avatar">VC</div><span><b>{user?.email || 'Visual Corp'}</b><small>{profileLabel}</small></span><button className="icon-button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)}/>}
    <div className="main-shell"><header className="topbar"><button className="mobile-menu-button" type="button" aria-label={mobileNavOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'} aria-expanded={mobileNavOpen} aria-controls="sidebar-workspace" onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={20}/> : <Menu size={20}/>}</button><div className="breadcrumbs"><span>{areaTitle}</span><ChevronRight size={14}/><b>{data.settings.name}</b></div><div className="topbar-right"><AdminCommandPalette items={nav}/><span className="local-badge"><span className="status-dot"/> Supabase conectado</span><button className="top-avatar" aria-label="Perfil" onClick={signOut}>VC</button></div></header><main className="main-content"><motion.div key={pathname} className="vc-route-frame" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>{children}</motion.div><footer className="local-footer">Acceso autenticado y permisos comprobados en Supabase.</footer></main></div>
  </div>;
}

function ProtectedPage({ area, children }) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);
  const allowed = area === 'website' ? ['website_admin'] : area === 'catalog' || area === 'team' ? ['admin','manager'] : ['admin','manager','advisor','warehouse','production','marketing'];
  if (auth.loading) return <main className="access-screen"><p>Verificando acceso seguro…</p></main>;
  if (!auth.user) return <main className="access-screen"><form className="access-card" onSubmit={async (event)=>{event.preventDefault();setError('');setMessage('');try{await auth.sendSignInLink(email.trim());setMessage('Te enviamos un enlace de acceso al correo. Ábrelo en este mismo navegador para continuar.');}catch(err){setError(err.message||'No pudimos iniciar sesión.');}}}><img src={wordmark} alt="Visual Corp"/><span className="site-eyebrow"><i/> ACCESO INTERNO</span><h1>{area==='website'?'Administración de la página web':'Administración POS y gestión interna'}</h1><p>Inicia sesión con tu cuenta de Google autorizada o solicita un enlace seguro por correo.</p><button className="site-primary-button" type="button" disabled={oauthLoading} onClick={async()=>{setError('');setMessage('');setOauthLoading(true);try{await auth.signInWithGoogle();}catch(err){setError(err.message||'No pudimos iniciar sesión con Google.');setOauthLoading(false);}}}>{oauthLoading?'Conectando con Google…':'Continuar con Google'} <ArrowUpRight size={16}/></button><div className="divider-label">O USA UN ENLACE POR CORREO</div><label>Correo de Visual Corp<input type="email" required autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)}/></label><button className="site-primary-button" type="submit">Enviar enlace de acceso <ArrowUpRight size={16}/></button>{message&&<small role="status">{message}</small>}{error&&<small className="access-error" role="alert">{error}</small>}</form></main>;
  if (!auth.canAccess(allowed)) return <main className="access-screen"><section className="access-card"><img src={wordmark} alt="Visual Corp"/><span className="site-eyebrow"><i/> PERMISOS</span><h1>Tu perfil no tiene acceso a este panel.</h1><p>La página web y las operaciones internas usan permisos separados. Solicita al propietario que asigne el rol correspondiente.</p><button className="site-primary-button" onClick={auth.signOut}>Cerrar sesión <LogOut size={16}/></button></section></main>;
  return children;
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
