import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Boxes, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Database, FileText, Globe2, History, Image, LayoutDashboard, LogOut, Megaphone, Menu, Newspaper, Settings2, ShoppingBag, ShoppingCart, Truck, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useWorkspace } from './workspace';
import { useAuth } from '../auth/AuthProvider';
import { AdminCommandPalette } from '../components/AdminCommandPalette';
import { NumberTicker, SpotlightLayer, clearSpotlight, updateSpotlight } from '../components/ui/MagicComponents';
import { ContextMenu, type ContextMenuAction } from '../components/ui/ContextMenu';
import { motion, useReducedMotion } from 'motion/react';

const wordmark = '/brand/visualcorp-wordmark.png';
export type AppArea = 'admin' | 'operations';
export type AppNavLink = { to: string; label: string; icon: LucideIcon; end?: boolean; module: string };
type AppNavGroup = { id: string; label: string; icon: LucideIcon; paths: string[] };

export const adminLinks: AppNavLink[] = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true, module: 'dashboard' },
  { to: '/admin/manual-aprendizaje', label: 'Manual/aprendizaje', icon: BookOpen, module: 'dashboard' },
  { to: '/admin/sitio', label: 'Inicio', icon: Globe2, module: 'website' },
  { to: '/admin/servicios', label: 'Servicios', icon: BriefcaseBusiness, module: 'website' },
  { to: '/admin/tienda', label: 'Tienda', icon: ShoppingBag, module: 'website' },
  { to: '/admin/blog', label: 'Blog', icon: BookOpen, module: 'website' },
  { to: '/admin/publicaciones', label: 'Publicaciones', icon: Newspaper, module: 'website' },
  { to: '/admin/portafolio', label: 'Portafolio', icon: Image, module: 'website' },
  { to: '/admin/contacto', label: 'Contacto', icon: Users, module: 'website' },
  { to: '/admin/solicitudes', label: 'Solicitudes CRM', icon: Users, module: 'crm' },
  { to: '/admin/marketing', label: 'Marketing', icon: Megaphone, module: 'marketing' },
  { to: '/admin/cambios', label: 'Novedades', icon: History, module: 'team' },
  { to: '/admin/respaldo', label: 'Respaldo y migración', icon: Database, module: 'backup' },
];
export const operationsLinks: AppNavLink[] = [
  { to: '/operaciones', label: 'Resumen', icon: LayoutDashboard, end: true, module: 'dashboard' },
  { to: '/operaciones/manual-aprendizaje', label: 'Manual/aprendizaje', icon: BookOpen, module: 'dashboard' },
  { to: '/operaciones/pos', label: 'Punto de venta', icon: ShoppingCart, module: 'sales' },
  { to: '/operaciones/finanzas', label: 'Finanzas', icon: ChartNoAxesCombined, module: 'sales' },
  { to: '/operaciones/flujos', label: 'Caja y producción', icon: ClipboardList, module: 'workshop' },
  { to: '/operaciones/cambios', label: 'Novedades', icon: History, module: 'team' },
  { to: '/operaciones/cotizador', label: 'Cotizador', icon: FileText, module: 'quotes' },
  { to: '/operaciones/inventario', label: 'Inventario', icon: Boxes, module: 'inventory' },
  { to: '/operaciones/equipos', label: 'Equipos', icon: BriefcaseBusiness, module: 'inventory' },
  { to: '/operaciones/compras', label: 'Compras', icon: Truck, module: 'purchases' },
  { to: '/operaciones/crm', label: 'CRM', icon: Users, module: 'crm' },
  { to: '/operaciones/clientes', label: 'Clientes', icon: Users, module: 'crm' },
  { to: '/operaciones/marketing', label: 'Marketing', icon: CalendarDays, module: 'marketing' },
  { to: '/operaciones/personal', label: 'Personal', icon: Users, module: 'personnel' },
  { to: '/operaciones/equipo', label: 'Equipo y permisos', icon: Users, module: 'team' },
  { to: '/operaciones/catalogo', label: 'Catálogo y tarifas', icon: ShoppingBag, module: 'catalog_admin' },
];
const adminNavGroups: AppNavGroup[] = [
  { id: 'content', label: 'Sitio y contenido', icon: Globe2, paths: ['/admin/sitio', '/admin/servicios', '/admin/tienda', '/admin/blog', '/admin/publicaciones', '/admin/portafolio', '/admin/contacto'] },
  { id: 'customers', label: 'Clientes', icon: Users, paths: ['/admin/solicitudes'] },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, paths: ['/admin/marketing'] },
  { id: 'system', label: 'Administración', icon: Settings2, paths: ['/admin/cambios', '/admin/respaldo', '/admin/manual-aprendizaje'] },
];
const operationsNavGroups: AppNavGroup[] = [
  { id: 'sales', label: 'Ventas', icon: BriefcaseBusiness, paths: ['/operaciones/pos', '/operaciones/finanzas', '/operaciones/cotizador'] },
  { id: 'customers', label: 'Clientes y CRM', icon: Users, paths: ['/operaciones/crm', '/operaciones/clientes'] },
  { id: 'operations', label: 'Producción e inventario', icon: Boxes, paths: ['/operaciones/flujos', '/operaciones/inventario', '/operaciones/equipos', '/operaciones/compras', '/operaciones/catalogo'] },
  { id: 'team', label: 'Equipo', icon: Settings2, paths: ['/operaciones/cambios', '/operaciones/personal', '/operaciones/equipo'] },
  { id: 'learning', label: 'Aprendizaje', icon: BookOpen, paths: ['/operaciones/manual-aprendizaje'] },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, paths: ['/operaciones/marketing'] },
];
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
  const nav = (area === 'admin' ? adminLinks : operationsLinks).filter((link) => hasPermission(link.module, 'view'));
  const navGroupDefinitions = area === 'admin' ? adminNavGroups : operationsNavGroups;
  const navGroups = navGroupDefinitions.map((group) => ({ ...group, items: nav.filter((link) => group.paths.includes(link.to)) })).filter((group) => group.items.length > 0);
  const activeNavGroup = navGroups.find((group) => group.items.some((link) => link.end ? pathname === link.to : pathname === link.to || pathname.startsWith(`${link.to}/`)));
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>(() => activeNavGroup ? { [activeNavGroup.id]: true } : {});
  useEffect(() => {
    if (activeNavGroup) setExpandedNavGroups((current) => ({ ...current, [activeNavGroup.id]: true }));
  }, [activeNavGroup?.id]);
  const areaTitle = area === 'admin' ? 'Administración web' : 'Operaciones';
  const profileLabel = profiles.map((profile) => profile.name).join(' · ') || roles.join(' · ');
  const canSwitch = area === 'admin' ? operationsLinks.some((link) => hasPermission(link.module, 'view')) : adminLinks.some((link) => hasPermission(link.module, 'view'));
  const directNavLinks = nav.filter((link) => !navGroupDefinitions.some((group) => group.paths.includes(link.to)));
  const contextActions: ContextMenuAction[] = [
    { label: `Ir al resumen de ${areaTitle}`, icon: <LayoutDashboard size={14}/>, onSelect: () => navigate(area === 'admin' ? '/admin' : '/operaciones') },
    ...navGroups.map((group) => {
      const GroupIcon = group.icon;
      return {
        label: group.label,
        icon: <GroupIcon size={14}/>,
        onSelect: () => navigate(group.items[0]?.to || (area === 'admin' ? '/admin' : '/operaciones')),
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
  const renderNavLink = ({ to, label, icon: Icon, end }: AppNavLink) => <NavLink key={to} end={end} to={to} title={label} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}><Icon size={18}/><span>{label}</span>{label === 'Solicitudes CRM' && data.leads.length > 0 && <b className="sidebar-count">{data.leads.length}</b>}</NavLink>;
  return <div className={`work-app area-${area}`}>
    <ContextMenu scope="document" trigger={false} label="Acciones de navegación" actions={contextActions}/>
    <aside id={`sidebar-${area}`} className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand/><button title="Ayuda" aria-label="Ayuda"><CircleHelp size={18}/></button></div>
      <div className="workspace-pill"><span className="status-dot"/> SESIÓN SEGURA <span>· {profileLabel}</span></div>
      <nav className="sidebar-navigation" aria-label={`Navegación de ${areaTitle}`}>
        <small className="sidebar-caption">{areaTitle.toUpperCase()}</small>
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
      <div className="sidebar-bottom">{canSwitch && <Link to={area === 'admin' ? '/operaciones' : '/admin'} onClick={() => setMobileNavOpen(false)} className="switch-app"><span className="switch-icon"><ArrowUpRight size={16}/></span><span><b>{area === 'admin' ? 'Abrir Operaciones' : 'Abrir Admin web'}</b><small>Cambiar de espacio</small></span><ChevronRight size={15}/></Link>}<div className="sidebar-profile"><div className="profile-avatar">VC</div><span><b>{user?.email || 'Visual Corp'}</b><small>{profileLabel}</small></span><button className="icon-button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)}/>}
    <div className="main-shell"><header className="topbar"><button className="mobile-menu-button" type="button" aria-label={mobileNavOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'} aria-expanded={mobileNavOpen} aria-controls={`sidebar-${area}`} onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={20}/> : <Menu size={20}/>}</button><div className="breadcrumbs"><span>{areaTitle}</span><ChevronRight size={14}/><b>{data.settings.name}</b></div><div className="topbar-right"><AdminCommandPalette area={area} items={nav}/><span className="local-badge"><span className="status-dot"/> Supabase conectado</span><button className="top-avatar" aria-label="Perfil" onClick={signOut}>VC</button></div></header><main className="main-content"><motion.div key={pathname} className="vc-route-frame" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>{children}</motion.div><footer className="local-footer">Acceso basado en el perfil autenticado; los datos se protegen con permisos en Supabase.</footer></main></div>
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
