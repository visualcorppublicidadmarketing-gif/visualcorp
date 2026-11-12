import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, Compass, Home, Layers3, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

type ServiceLink = { id: string; name: string };
type NavigationGroup = 'services' | 'company' | 'explore';

const exploreLinks = [
  { to: '/soluciones', label: 'Soluciones' },
  { to: '/portafolio', label: 'Portafolio' },
  { to: '/publicaciones', label: 'Publicaciones' },
  { to: '/blog', label: 'Blog' },
  { to: '/tienda', label: 'Tienda' },
  { to: '/tienda/promociones', label: 'Promociones y sorteos' },
  { to: '/pagos', label: 'Medios de pago' },
];

export function MobileBottomNavigation({ services }: { services: ServiceLink[] }) {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<NavigationGroup | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<NavigationGroup, HTMLButtonElement | null>>({ services: null, company: null, explore: null });

  const close = () => {
    setOpenGroup(null);
    triggerRefs.current[openGroup || 'services']?.focus();
  };

  useEffect(() => { setOpenGroup(null); }, [location.pathname]);

  useEffect(() => {
    const desktopLayout = window.matchMedia('(min-width: 1101px)');
    const closeOnDesktop = () => { if (desktopLayout.matches) setOpenGroup(null); };
    desktopLayout.addEventListener('change', closeOnDesktop);
    return () => desktopLayout.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!openGroup) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const firstLink = dialogRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])');
    firstLink?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [openGroup]);

  const isCompanyActive = ['/nosotros', '/como-trabajamos', '/contacto'].includes(location.pathname);
  const isExploreActive = exploreLinks.some(({ to }) => location.pathname === to || location.pathname.startsWith(`${to}/`));
  const isServicesActive = location.pathname.startsWith('/servicios');
  const toggle = (group: NavigationGroup) => setOpenGroup((current) => current === group ? null : group);

  return <>
    {openGroup && <>
      <button className="mobile-bottom-backdrop" type="button" onClick={close} aria-label="Cerrar navegación" />
      <div className="mobile-bottom-sheet" id="mobile-bottom-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="mobile-bottom-sheet-title">
        <div className="mobile-bottom-sheet-heading">
          <div><span>EXPLORA VISUAL CORP</span><h2 id="mobile-bottom-sheet-title">{openGroup === 'services' ? 'Nuestros servicios' : openGroup === 'company' ? 'La empresa' : 'Más secciones'}</h2></div>
          <button type="button" className="mobile-bottom-sheet-close" onClick={close} aria-label="Cerrar menú"><X size={19}/></button>
        </div>
        {openGroup === 'services' && <nav className="mobile-bottom-sheet-grid" aria-label="Servicios">
          <NavLink className={({ isActive }) => `mobile-bottom-sheet-link mobile-bottom-sheet-feature${isActive ? ' is-active' : ''}`} to="/servicios" end onClick={() => setOpenGroup(null)}><Layers3 size={18}/><span>Todos los servicios</span><ArrowUpRight size={15}/></NavLink>
          {services.map((service) => <NavLink className={({ isActive }) => `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`} key={service.id} to={`/servicios/${service.id}`} onClick={() => setOpenGroup(null)}><span>{service.name}</span><ArrowUpRight size={15}/></NavLink>)}
        </nav>}
        {openGroup === 'company' && <nav className="mobile-bottom-sheet-grid" aria-label="La empresa">
          <NavLink className={({ isActive }) => `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`} to="/nosotros" onClick={() => setOpenGroup(null)}><span>Quiénes somos</span><ArrowUpRight size={15}/></NavLink>
          <NavLink className={({ isActive }) => `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`} to="/como-trabajamos" onClick={() => setOpenGroup(null)}><span>Cómo trabajamos</span><ArrowUpRight size={15}/></NavLink>
          <NavLink className={({ isActive }) => `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`} to="/contacto" onClick={() => setOpenGroup(null)}><span>Contacto</span><ArrowUpRight size={15}/></NavLink>
        </nav>}
        {openGroup === 'explore' && <nav className="mobile-bottom-sheet-grid" aria-label="Otras secciones">
          {exploreLinks.map(({ to, label }) => <NavLink className={({ isActive }) => `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`} key={to} to={to} onClick={() => setOpenGroup(null)}><span>{label}</span><ArrowUpRight size={15}/></NavLink>)}
        </nav>}
      </div>
    </>}
    <nav className="mobile-bottom-navigation" aria-label="Navegación móvil">
      <NavLink to="/" end className={({ isActive }) => `mobile-bottom-item${isActive ? ' is-active' : ''}`}><Home size={20} aria-hidden="true"/><span>Inicio</span></NavLink>
      <button ref={(node) => { triggerRefs.current.services = node; }} type="button" className={`mobile-bottom-item${isServicesActive || openGroup === 'services' ? ' is-active' : ''}`} aria-expanded={openGroup === 'services'} aria-haspopup="dialog" aria-controls="mobile-bottom-sheet" onClick={() => toggle('services')}><Layers3 size={20} aria-hidden="true"/><span>Servicios</span></button>
      <button ref={(node) => { triggerRefs.current.company = node; }} type="button" className={`mobile-bottom-item${isCompanyActive || openGroup === 'company' ? ' is-active' : ''}`} aria-expanded={openGroup === 'company'} aria-haspopup="dialog" aria-controls="mobile-bottom-sheet" onClick={() => toggle('company')}><BriefcaseBusiness size={20} aria-hidden="true"/><span>Empresa</span></button>
      <button ref={(node) => { triggerRefs.current.explore = node; }} type="button" className={`mobile-bottom-item${isExploreActive || openGroup === 'explore' ? ' is-active' : ''}`} aria-expanded={openGroup === 'explore'} aria-haspopup="dialog" aria-controls="mobile-bottom-sheet" onClick={() => toggle('explore')}><Compass size={20} aria-hidden="true"/><span>Explorar</span></button>
      <NavLink to="/cotizador" className={({ isActive }) => `mobile-bottom-item mobile-bottom-quote${isActive ? ' is-active' : ''}`}><ArrowUpRight size={20} aria-hidden="true"/><span>Cotizar</span></NavLink>
    </nav>
  </>;
}
