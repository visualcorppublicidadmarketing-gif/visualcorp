import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowUpRight, Boxes, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChevronRight, CircleHelp, ClipboardList, Database, FileText, Globe2, History, Image, LayoutDashboard, LogOut, Megaphone, Menu, Search, Settings2, ShoppingBag, ShoppingCart, Truck, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useWorkspace } from './workspace';
import { useAuth } from '../auth/AuthProvider';
import { AdminCommandPalette } from '../components/AdminCommandPalette';

const wordmark = '/brand/visualcorp-wordmark.png';
export type AppArea = 'admin' | 'operations';
export type AppNavLink = { to: string; label: string; icon: LucideIcon; end?: boolean; roles?: string[] };

export const adminLinks: AppNavLink[] = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/admin/sitio', label: 'Página pública', icon: Globe2 },
  { to: '/admin/contenido', label: 'Blog y portafolio', icon: FileText },
  { to: '/admin/solicitudes', label: 'Solicitudes CRM', icon: Users },
  { to: '/admin/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/admin/cambios', label: 'Novedades', icon: History },
  { to: '/admin/respaldo', label: 'Respaldo y migración', icon: Database },
];
export const operationsLinks: AppNavLink[] = [
  { to: '/operaciones', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/operaciones/pos', label: 'Punto de venta', icon: ShoppingCart },
  { to: '/operaciones/flujos', label: 'Caja y producción', icon: ClipboardList },
  { to: '/operaciones/cambios', label: 'Novedades', icon: History },
  { to: '/operaciones/cotizador', label: 'Cotizador', icon: FileText },
  { to: '/operaciones/inventario', label: 'Inventario', icon: Boxes },
  { to: '/operaciones/compras', label: 'Compras', icon: Truck },
  { to: '/operaciones/crm', label: 'CRM', icon: Users },
  { to: '/operaciones/clientes', label: 'Clientes', icon: Users },
  { to: '/operaciones/marketing', label: 'Marketing', icon: CalendarDays },
  { to: '/operaciones/equipo', label: 'Equipo y permisos', icon: Users, roles: ['admin','manager'] },
  { to: '/operaciones/catalogo', label: 'Catálogo y tarifas', icon: ShoppingBag, roles: ['admin','manager'] },
];
export interface BrandProps { dark?: boolean }
export function Brand({ dark = false }: BrandProps) {
  return <Link className={`brand ${dark ? 'brand-dark' : ''}`} to="/" aria-label="Visual Corp, página pública"><img src={wordmark} alt="Visual Corp — Agencia Creativa" /></Link>;
}
export interface AppFrameProps { area: AppArea; children: React.ReactNode }
export function AppFrame({ area, children }: AppFrameProps) {
  const { data } = useWorkspace();
  const { user, roles, signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);
  const nav = (area === 'admin' ? adminLinks : operationsLinks).filter((link) => !link.roles || roles.includes('owner') || link.roles.some((role) => roles.includes(role)));
  const areaTitle = area === 'admin' ? 'Administración web' : 'Operaciones';
  return <div className={`work-app area-${area}`}><aside id={`sidebar-${area}`} className={`sidebar ${mobileNavOpen?'sidebar-open':''}`}><div className="sidebar-brand"><Brand/><button title="Ayuda"><CircleHelp size={18}/></button></div><div className="workspace-pill"><span className="status-dot"/> SESIÓN SEGURA <span>· {roles.join(', ')}</span></div><div className="sidebar-group"><small className="sidebar-caption">{areaTitle.toUpperCase()}</small>{nav.map(({to,label,icon:Icon,end})=><NavLink key={to} end={end} to={to} title={label} onClick={()=>setMobileNavOpen(false)} className={({isActive})=>`sidebar-link ${isActive?'active':''}`}><Icon size={18}/><span>{label}</span>{label==='Solicitudes CRM'&&data.leads.length>0&&<b className="sidebar-count">{data.leads.length}</b>}</NavLink>)}</div><div className="sidebar-bottom">{roles.includes('owner')&&<Link to={area==='admin'?'/operaciones':'/admin'} onClick={()=>setMobileNavOpen(false)} className="switch-app"><span className="switch-icon"><ArrowUpRight size={16}/></span><span><b>{area==='admin'?'Abrir Operaciones':'Abrir Admin web'}</b><small>Cambiar de espacio</small></span><ChevronRight size={15}/></Link>}<div className="sidebar-profile"><div className="profile-avatar">VC</div><span><b>{user?.email || 'Visual Corp'}</b><small>{roles.join(' · ')}</small></span><button className="icon-button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16}/></button></div></div></aside>{mobileNavOpen&&<button className="mobile-nav-backdrop" aria-label="Cerrar menú" onClick={()=>setMobileNavOpen(false)}/>}<div className="main-shell"><header className="topbar"><button className="mobile-menu-button" type="button" aria-label={mobileNavOpen?'Cerrar menú de navegación':'Abrir menú de navegación'} aria-expanded={mobileNavOpen} aria-controls={`sidebar-${area}`} onClick={()=>setMobileNavOpen((open)=>!open)}>{mobileNavOpen?<X size={20}/>:<Menu size={20}/>}</button><div className="breadcrumbs"><span>{areaTitle}</span><ChevronRight size={14}/><b>{data.settings.name}</b></div><div className="topbar-right"><AdminCommandPalette area={area} items={nav}/><span className="local-badge"><span className="status-dot"/> Supabase conectado</span><button className="top-avatar" aria-label="Perfil" onClick={signOut}>VC</button></div></header><main className="main-content">{children}<footer className="local-footer">Acceso basado en el perfil autenticado; los datos se protegen con permisos en Supabase.</footer></main></div></div>;
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
  return <article className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div className="stat-meta"><span>{label}</span><b>{value}</b><small>{note}</small></div></article>;
}
