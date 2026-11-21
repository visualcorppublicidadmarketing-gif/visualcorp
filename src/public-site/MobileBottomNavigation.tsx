import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, Compass, Home, Layers3, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { Drawer } from 'vaul';

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

const groupMeta: Record<NavigationGroup, { title: string; description: string }> = {
  services: {
    title: 'Nuestros servicios',
    description: 'Explora las familias de trabajo y especialidades de Visual Corp.',
  },
  company: {
    title: 'La empresa',
    description: 'Conoce quiénes somos, cómo trabajamos y nuestros canales de contacto.',
  },
  explore: {
    title: 'Más secciones',
    description: 'Accede a soluciones, portafolio, publicaciones, tienda y medios de pago.',
  },
};

export function MobileBottomNavigation({ services }: { services: ServiceLink[] }) {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<NavigationGroup | null>(null);
  const lastGroupRef = useRef<NavigationGroup>('services');
  const triggerRefs = useRef<Record<NavigationGroup, HTMLButtonElement | null>>({
    services: null,
    company: null,
    explore: null,
  });

  if (openGroup) {
    lastGroupRef.current = openGroup;
  }

  const close = () => {
    setOpenGroup(null);
  };

  useEffect(() => {
    setOpenGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    const desktopLayout = window.matchMedia('(min-width: 1101px)');
    const closeOnDesktop = () => {
      if (desktopLayout.matches) setOpenGroup(null);
    };
    closeOnDesktop();
    desktopLayout.addEventListener('change', closeOnDesktop);
    return () => desktopLayout.removeEventListener('change', closeOnDesktop);
  }, []);

  const isCompanyActive = ['/nosotros', '/como-trabajamos', '/contacto'].includes(location.pathname);
  const isExploreActive = exploreLinks.some(
    ({ to }) => location.pathname === to || location.pathname.startsWith(`${to}/`),
  );
  const isServicesActive = location.pathname.startsWith('/servicios');
  const toggle = (group: NavigationGroup) =>
    setOpenGroup((current) => (current === group ? null : group));

  const activeGroup = openGroup ?? lastGroupRef.current;
  const meta = groupMeta[activeGroup];

  return (
    <>
      <Drawer.Root
        open={openGroup !== null}
        onOpenChange={(open) => {
          if (!open) setOpenGroup(null);
        }}
        direction="bottom"
        dismissible
      >
        <Drawer.Portal>
          <Drawer.Overlay className="mobile-bottom-drawer-overlay" />
          <Drawer.Content
            className="mobile-bottom-drawer"
            id="mobile-bottom-sheet"
            onCloseAutoFocus={(event) => {
              const trigger = triggerRefs.current[lastGroupRef.current];
              if (trigger) {
                event.preventDefault();
                trigger.focus();
              }
            }}
          >
            <div className="mobile-bottom-drawer-scroll">
              <div className="mobile-bottom-drawer-handle-wrap">
                <Drawer.Handle className="mobile-bottom-drawer-handle" />
              </div>

              <div className="mobile-bottom-sheet-heading">
                <div>
                  <span>EXPLORA VISUAL CORP</span>
                  <Drawer.Title className="mobile-bottom-sheet-title">{meta.title}</Drawer.Title>
                  <Drawer.Description className="mobile-bottom-sheet-description">
                    {meta.description}
                  </Drawer.Description>
                </div>
                <button
                  type="button"
                  className="mobile-bottom-sheet-close"
                  onClick={close}
                  aria-label="Cerrar menú"
                >
                  <X size={19} aria-hidden="true" />
                </button>
              </div>

              {openGroup === 'services' && (
                <nav className="mobile-bottom-sheet-grid" aria-label="Servicios">
                  <NavLink
                    className={({ isActive }) =>
                      `mobile-bottom-sheet-link mobile-bottom-sheet-feature${isActive ? ' is-active' : ''}`
                    }
                    to="/servicios"
                    end
                    onClick={close}
                  >
                    <Layers3 size={18} aria-hidden="true" />
                    <span>Todos los servicios</span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </NavLink>
                  {services.map((service) => (
                    <NavLink
                      className={({ isActive }) =>
                        `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`
                      }
                      key={service.id}
                      to={`/servicios/${service.id}`}
                      onClick={close}
                    >
                      <span>{service.name}</span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </NavLink>
                  ))}
                </nav>
              )}

              {openGroup === 'company' && (
                <nav className="mobile-bottom-sheet-grid" aria-label="La empresa">
                  <NavLink
                    className={({ isActive }) =>
                      `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`
                    }
                    to="/nosotros"
                    onClick={close}
                  >
                    <span>Quiénes somos</span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </NavLink>
                  <NavLink
                    className={({ isActive }) =>
                      `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`
                    }
                    to="/como-trabajamos"
                    onClick={close}
                  >
                    <span>Cómo trabajamos</span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </NavLink>
                  <NavLink
                    className={({ isActive }) =>
                      `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`
                    }
                    to="/contacto"
                    onClick={close}
                  >
                    <span>Contacto</span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </NavLink>
                </nav>
              )}

              {openGroup === 'explore' && (
                <nav className="mobile-bottom-sheet-grid" aria-label="Otras secciones">
                  {exploreLinks.map(({ to, label }) => (
                    <NavLink
                      className={({ isActive }) =>
                        `mobile-bottom-sheet-link${isActive ? ' is-active' : ''}`
                      }
                      key={to}
                      to={to}
                      onClick={close}
                    >
                      <span>{label}</span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </NavLink>
                  ))}
                </nav>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <nav className="mobile-bottom-navigation" aria-label="Navegación móvil">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `mobile-bottom-item${isActive ? ' is-active' : ''}`}
        >
          <Home size={20} aria-hidden="true" />
          <span>Inicio</span>
        </NavLink>
        <button
          ref={(node) => {
            triggerRefs.current.services = node;
          }}
          type="button"
          className={`mobile-bottom-item${isServicesActive || openGroup === 'services' ? ' is-active' : ''}`}
          aria-expanded={openGroup === 'services'}
          aria-haspopup="dialog"
          aria-controls="mobile-bottom-sheet"
          onClick={() => toggle('services')}
        >
          <Layers3 size={20} aria-hidden="true" />
          <span>Servicios</span>
        </button>
        <button
          ref={(node) => {
            triggerRefs.current.company = node;
          }}
          type="button"
          className={`mobile-bottom-item${isCompanyActive || openGroup === 'company' ? ' is-active' : ''}`}
          aria-expanded={openGroup === 'company'}
          aria-haspopup="dialog"
          aria-controls="mobile-bottom-sheet"
          onClick={() => toggle('company')}
        >
          <BriefcaseBusiness size={20} aria-hidden="true" />
          <span>Empresa</span>
        </button>
        <button
          ref={(node) => {
            triggerRefs.current.explore = node;
          }}
          type="button"
          className={`mobile-bottom-item${isExploreActive || openGroup === 'explore' ? ' is-active' : ''}`}
          aria-expanded={openGroup === 'explore'}
          aria-haspopup="dialog"
          aria-controls="mobile-bottom-sheet"
          onClick={() => toggle('explore')}
        >
          <Compass size={20} aria-hidden="true" />
          <span>Explorar</span>
        </button>
        <NavLink
          to="/cotizador"
          className={({ isActive }) =>
            `mobile-bottom-item mobile-bottom-quote${isActive ? ' is-active' : ''}`
          }
        >
          <ArrowUpRight size={20} aria-hidden="true" />
          <span>Cotizar</span>
        </NavLink>
      </nav>
    </>
  );
}
