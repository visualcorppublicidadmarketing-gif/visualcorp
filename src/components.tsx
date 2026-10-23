import React from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  Home,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Moon,
  Percent,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Sun,
  X,
  Zap
} from 'lucide-react';
import { media, money, themePresets, assetPath } from './data';
import { resourceUrls } from './data/resourceManifest';
import { getProductCalcType } from './catalog';
import { useSite, useAuth } from './store';
import { QuoteRequestDialog } from './components/QuoteRequestDialog';
import { buildWhatsAppUrl, resolveQuoteWhatsAppRoute } from './lib/whatsapp';
import {
  ContextMenu,
  MotionObserver,
  SearchCommand,
  SeasonalThemeLayer,
  ThemeToggle,
  ToastViewport,
  contextIcons
} from './components/studio/Chrome';

export function Brand({ compact = false }) {
  const { theme } = useSite();
  const logoSrc = theme === 'dark' ? media.logoDark : media.logoLight;
  return (
    <Link className={`brand brand-svg ${compact ? 'brand-compact' : ''}`} to="/" aria-label="Gigaprint — Tus ideas en grande">
      <img className="brand-logo-image" src={logoSrc} alt="Gigaprint — Tus ideas en grande" />
    </Link>
  );
}

export function Button({ children, to, onClick, variant = 'primary', className = '', type = 'button', showArrow = true }) {
  const content = (
    <>
      {children}
      {showArrow && <ArrowUpRight size={15} />}
    </>
  );
  return to ? (
    <Link className={`button button-${variant} ${className}`} to={to}>{content}</Link>
  ) : (
    <button type={type} onClick={onClick} className={`button button-${variant} ${className}`}>{content}</button>
  );
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export function BottomSheet({ isOpen, onClose }) {
  const { theme, setTheme } = useSite();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNav = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <>
      <div className="bottom-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="bottom-sheet-panel" role="dialog" aria-label="Menú principal">
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-head">
          <Brand compact />
          <button className="bottom-sheet-close" onClick={onClose} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>
        <div className="bottom-sheet-items">
          <button type="button" className="bottom-sheet-item" onClick={() => handleNav('/gigaprint')}>
            <Sparkles size={20} />
            <span>Nosotros & Taller</span>
            <ChevronRight size={16} className="bs-arrow" />
          </button>
          <button type="button" className="bottom-sheet-item" onClick={() => handleNav('/promociones')}>
            <Percent size={20} />
            <span>Promociones del Mes</span>
            <ChevronRight size={16} className="bs-arrow" />
          </button>
          <button type="button" className="bottom-sheet-item" onClick={() => handleNav('/seguimiento')}>
            <Search size={20} />
            <span>Rastrear mi Pedido</span>
            <ChevronRight size={16} className="bs-arrow" />
          </button>
          <button type="button" className="bottom-sheet-item" onClick={() => handleNav('/contacto')}>
            <Mail size={20} />
            <span>Contacto & Ubicación</span>
            <ChevronRight size={16} className="bs-arrow" />
          </button>
          <div className="bottom-sheet-separator" />
          <div className="bottom-sheet-utilities">
            <button
              type="button"
              className="bs-util-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
            </button>
            <button
              type="button"
              className="bs-util-btn"
              onClick={() => handleNav('/admin')}
            >
              <ArrowUpRight size={18} />
              <span>Acceso Admin</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function BottomNavBar() {
  const { cart } = useSite();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // No renderizar en rutas de admin
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  // En el cotizador, la barra sticky de cotización toma precedencia en móvil
  const isQuoter = location.pathname === '/cotizador';
  if (isQuoter) {
    return null;
  }

  const isCurrent = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="bottom-nav-bar" aria-label="Navegación inferior">
        <div className="bnb-items">
          <Link
            to="/"
            className={`bnb-item ${isCurrent('/') && location.pathname === '/' ? 'active' : ''}`}
            aria-label="Inicio"
          >
            <Home size={22} />
            <span>Inicio</span>
          </Link>

          <Link
            to="/tienda"
            className={`bnb-item ${isCurrent('/tienda') ? 'active' : ''}`}
            aria-label="Tienda"
          >
            <Store size={22} />
            <span>Tienda</span>
          </Link>

          <Link
            to="/cotizador"
            className="bnb-item bnb-cta"
            aria-label="Cotizador Inteligente"
          >
            <div className="bnb-cta-circle">
              <Zap size={22} />
            </div>
            <span>Cotizar</span>
          </Link>

          <Link
            to="/carrito"
            className={`bnb-item ${isCurrent('/carrito') ? 'active' : ''}`}
            aria-label="Carrito de compras"
          >
            <div className="bnb-icon-wrapper">
              <ShoppingBag size={22} />
              {cart.length > 0 && <span className="bnb-badge">{cart.length}</span>}
            </div>
            <span>Carrito</span>
          </Link>

          <button
            type="button"
            className={`bnb-item ${sheetOpen ? 'active' : ''}`}
            onClick={() => setSheetOpen(true)}
            aria-label="Más opciones"
          >
            <Menu size={22} />
            <span>Menú</span>
          </button>
        </div>
      </nav>
      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

export function Header() {
  const { cart, theme, setTheme } = useSite();
  const [open, setOpen] = React.useState(false);
  const items = [
    { to: '/', label: 'Inicio' },
    { to: '/tienda', label: 'Tienda' },
    { to: '/promociones', label: 'Promociones' },
    { to: '/gigaprint', label: 'Gigaprint' },
  ];
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav className={open ? 'main-nav open' : 'main-nav'}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              end={item.to === '/'}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span>{item.label}</span>
              {item.badge && <span className="nav-item-badge">{item.badge}</span>}
            </NavLink>
          ))}
          <details className="nav-more">
            <summary>Más <ChevronRight size={14} /></summary>
            <div className="nav-more-menu">
              <Link to="/seguimiento" onClick={() => setOpen(false)}><Search size={15} /> Rastrear pedido</Link>
              <Link to="/contacto" onClick={() => setOpen(false)}><Mail size={15} /> Contacto</Link>
            </div>
          </details>
          <Link className="cart-link" to="/carrito" onClick={() => setOpen(false)}>
            <ShoppingBag size={17} /> <span>Carrito</span><b>{cart.length}</b>
          </Link>
        </nav>
        <div className="header-actions">
          <SearchCommand />
          <ThemeToggle theme={theme} onChange={setTheme} compact={true} />
          <Link className="desktop-cart" to="/carrito" aria-label="Ver carrito" title="Carrito de compras">
            <ShoppingBag size={18} />
            {cart.length > 0 && <b>{cart.length}</b>}
          </Link>
          <Button to="/cotizador" className="header-cta" showArrow={true}>Cotizar</Button>
          <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label="Abrir menú">
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { data } = useSite();
  const route = resolveQuoteWhatsAppRoute(data.settings, []);
  const whatsappUrl = buildWhatsAppUrl(route?.number, '¡Hola Gigaprint! Quiero información sobre sus servicios.');
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Brand />
          <p>Publicidad, impresión gran formato y fabricación visual para marcas que quieren verse en grande.</p>
          <div className="socials">
            <a href="https://instagram.com/gigaprint.ec" target="_blank" rel="noreferrer" aria-label="Instagram"><Camera size={17} /></a>
            {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={17} /></a>}
            <a href={`mailto:${data.settings.email}`} aria-label="Correo"><Mail size={17} /></a>
          </div>
        </div>
        <div>
          <h4>Explora</h4>
          <Link to="/gigaprint">Nosotros & Taller</Link>
          <Link to="/promociones">Promociones</Link>
          <Link to="/tienda">Catálogo Tienda</Link>
          <Link to="/seguimiento">🔍 Rastrear mi Pedido</Link>
          <Link to="/contacto">Contacto</Link>
        </div>
        <div>
          <h4>Soluciones</h4>
          <Link to="/cotizador">Cotizador online (m² / volumen)</Link>
          <Link to="/tienda?familia=Gran%20formato">Gran formato & Lonas</Link>
          <Link to="/tienda?familia=Rótulos%20y%20Fachadas">Rótulos & Letras 3D</Link>
          <Link to="/tienda?familia=Textil%20y%20Promocionales">Textil & Promocionales</Link>
        </div>
        <div className="footer-contact">
          <h4>Taller Matriz</h4>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.settings.address || 'Av. García Moreno y 9 de Octubre, Milagro, Guayas')}`}
            target="_blank"
            rel="noreferrer"
            className="footer-address-link"
            title="Abrir ubicación en Google Maps"
            style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}
          >
            <MapPin size={16} style={{ color: 'var(--brand-orange)', flexShrink: 0, marginTop: '2px' }} />
            <span>{data.settings.address || 'Av. García Moreno y 9 de Octubre, Milagro, Guayas - Ecuador'}</span>
          </a>
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <MessageCircle size={15} style={{ color: 'var(--brand-orange)', flexShrink: 0 }} />
            <a href={whatsappUrl || `tel:${data.settings.phone}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
              {data.settings.phone}
            </a>
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <Mail size={15} style={{ color: 'var(--brand-orange)', flexShrink: 0 }} />
            <a href={`mailto:${data.settings.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {data.settings.email}
            </a>
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 Gigaprint Publicidad & Impresión S.A.S. RUC 0992345678001. Todos los derechos reservados.</span>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link to="/seguimiento">🔍 Rastrear Pedido</Link>
          <Link to="/pos">🛒 Terminal POS</Link>
          <Link to="/admin">Panel Admin</Link>
        </div>
      </div>
    </footer>
  );
}

function GlobalContextMenu({ admin = false }) {
  const navigate = useNavigate();
  const { theme, setTheme, siteTheme } = useSite();
  const items = admin
    ? [
        { label: 'Ir al resumen', icon: contextIcons.home, onClick: () => navigate('/admin') },
        { label: 'Editar productos', icon: contextIcons.store, onClick: () => navigate('/admin/productos') },
        { label: 'Editar temas', icon: contextIcons.palette, onClick: () => navigate('/admin/temas') },
        {
          label: theme === 'dark' ? 'Usar modo claro' : 'Usar modo oscuro',
          icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
          onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark')
        },
        {
          label: siteTheme === 'default' ? 'Abrir temas de temporada' : 'Volver al tema base',
          icon: contextIcons.palette,
          onClick: () => navigate('/admin/temas')
        }
      ]
    : [
        { label: 'Ir al inicio', icon: contextIcons.home, onClick: () => navigate('/') },
        { label: 'Abrir tienda', icon: contextIcons.store, onClick: () => navigate('/tienda') },
        { label: 'Abrir cotizador', icon: contextIcons.quote, onClick: () => navigate('/cotizador') },
        {
          label: theme === 'dark' ? 'Usar modo claro' : 'Usar modo oscuro',
          icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
          onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark')
        },
        { label: 'Volver arriba', icon: contextIcons.top, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }
      ];
  return <ContextMenu items={items} />;
}

export function PageShell({ children, className = '' }) {
  const { toast, siteTheme } = useSite();
  const preset = themePresets.find((item) => item.id === siteTheme) || themePresets[0];
  return (
    <>
      <ScrollToTop />
      <SeasonalThemeLayer preset={preset} />
      <GlobalContextMenu />
      <MotionObserver />
      <Header />
      <main className={className}>{children}</main>
      <Footer />
      <BottomNavBar />
      <ToastViewport items={toast ? [{ id: 'global', message: toast }] : []} />
    </>
  );
}

export function SectionHeading({ eyebrow, title, text, action }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <div className="section-heading-side">
        {text && <p>{text}</p>}
        {action}
      </div>
    </div>
  );
}

export function ServiceCard({ service, index = 0 }) {
  const isArea = service.id === 'impresion' || service.id === 'rotulos';
  const linkTarget = `/cotizador?categoria=${encodeURIComponent(service.name)}&mode=${isArea ? 'medidas' : 'unidades'}`;
  return (
    <article className={`service-card service-${index % 4}`}>
      <div className="service-card-image">
        <img src={assetPath(service.image)} alt={service.name} />
        <span>{service.tag}</span>
      </div>
      <div className="service-card-copy">
        <div className="service-number">0{index + 1}</div>
        <h3>{service.name}</h3>
        <p>{service.detail}</p>
        <Link to={linkTarget}>Cotizar servicio <ArrowUpRight size={15} /></Link>
      </div>
    </article>
  );
}

export function ProductCard({ product, onAdd }) {
  const navigate = useNavigate();
  const calcType = getProductCalcType(product);
  const isCustomConfig = calcType === 'm2' || product.pricingMode === 'tier-total' || (product.minQuantity && product.minQuantity > 1) || (product.variantOptions?.length > 0);
  const label = calcType === 'm2' ? 'Por medida' : product.pricingMode === 'tier-total' ? 'Por lote' : product.priceScales?.length ? 'Por volumen' : 'Personalizable';

  const handleAddClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCustomConfig) {
      navigate(`/tienda/${product.id}`);
    } else {
      onAdd(product);
    }
  };

  return (
    <article className="product-card">
      <Link to={`/tienda/${product.id}`} className="product-image">
        <img src={assetPath(product.image)} alt={product.name} />
        <span>{product.category}</span>
      </Link>
      <div className="product-copy">
        <div className="product-meta">
          <span>{label}</span>
          {product.featured && <span className="featured-dot">Destacado</span>}
        </div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="product-bottom">
          <strong>Desde {money(product.price)} <small>/ {product.unit}</small></strong>
          <button
            className="icon-button"
            onClick={handleAddClick}
            aria-label={isCustomConfig ? `Configurar ${product.name}` : `Agregar ${product.name}`}
            title={isCustomConfig ? 'Configurar opciones y medidas' : 'Agregar al carrito'}
          >
            {isCustomConfig ? <ArrowUpRight size={17} /> : <Plus size={18} />}
          </button>
        </div>
      </div>
    </article>
  );
}

export function CartSummary({ compact = false }) {
  const { cart, updateCartItem, removeCartItem, data } = useSite();
  const taxRate = Number(data?.calculatorSettings?.taxRate || 15);
  const total = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  const subtotalNet = cart.reduce((sum, item) => {
    const itemSub = Number(item.quoteBreakdown?.subtotal) || ((Number(item.price) || 0) / (1 + (taxRate / 100)));
    return sum + itemSub * (Number(item.quantity) || 1);
  }, 0);
  const ivaAmount = Math.max(0, total - subtotalNet);

  if (!cart.length) return (
    <div className="empty-cart">
      <ShoppingBag size={30} />
      <h3>Tu carrito está esperando ideas</h3>
      <p>Agrega productos o configura una pieza en el cotizador.</p>
      <Button to="/tienda">Explorar tienda</Button>
    </div>
  );

  return (
    <><div className={compact ? 'cart-summary compact' : 'cart-summary'}>
      {cart.map((item) => (
        <div className="cart-row" key={item.cartId}>
          <img src={assetPath(item.image)} alt="" />
          <div>
            <b>{item.name}</b>
            <small>{item.variant || 'Configuración estándar'}</small>
            <div className="qty">
              <button onClick={() => updateCartItem(item.cartId, item.quantity - 1)}><Minus size={13} /></button>
              <span>{item.quantity}</span>
              <button onClick={() => updateCartItem(item.cartId, item.quantity + 1)}><Plus size={13} /></button>
            </div>
          </div>
          <strong>{money(item.price * item.quantity)}</strong>
          <button className="remove-link" onClick={() => removeCartItem(item.cartId)} aria-label="Eliminar"><X size={14} /></button>
        </div>
      ))}
      <div className="cart-total" style={{ display: 'grid', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)' }}>
          <span>Subtotal (sin IVA):</span>
          <strong>{money(subtotalNet)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)' }}>
          <span>IVA SRI (15%):</span>
          <strong>{money(ivaAmount)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 900, color: 'var(--ink)', borderTop: '1px solid var(--line)', paddingTop: '6px', marginTop: '4px' }}>
          <span>Total con IVA:</span>
          <strong style={{ color: 'var(--orange)', fontFamily: 'Space Grotesk' }}>{money(total)}</strong>
        </div>
      </div>
      {!compact && (
        <div className="cart-action-buttons">
          <button type="button" className="button button-primary cart-primary-action" onClick={() => setRequestOpen(true)}>
            Enviar solicitud <ChevronRight size={16} />
          </button>
          <button type="button" className="whatsapp-action-btn cart-whatsapp-action" onClick={() => setRequestOpen(true)}>
            <MessageCircle size={17} /> Cotizar todo el carrito por WhatsApp
          </button>
        </div>
      )}
    </div><QuoteRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} items={cart} totals={{ subtotal: subtotalNet, taxRate, taxAmount: ivaAmount, total }} source="carrito" /></>
  );
}

export function AdminNav() {
  const location = useLocation();
  const { theme, setTheme } = useSite();
  const { logout } = useAuth();
  
  const sections = [
    {
      title: 'RESUMEN & VENTAS',
      items: [
        ['/admin', '🏠 Resumen ejecutivo', '/admin'],
        ['/admin/pos/dashboard', '📊 Dashboard Ejecutivo', '/admin/pos/dashboard'],
        ['/admin/pos', '🛒 Punto de Venta & Caja', '/admin/pos'],
        ['/admin/solicitudes', '📬 Cotizaciones web', '/admin/solicitudes'],
      ]
    },
    {
      title: 'CLIENTES & PRODUCCIÓN',
      items: [
        ['/admin/whatsapp', '💬 Centro WhatsApp', '/admin/whatsapp'],
        ['/admin/crm', '👥 Clientes & CRM 360°', '/admin/crm'],
        ['/admin/taller', '🗓️ Coordinación de trabajos', '/admin/taller'],
        ['/admin/estaciones', '🏭 Estaciones de producción', '/admin/estaciones'],
        ['/admin/operaciones', '✅ Calidad & postventa', '/admin/operaciones'],
      ]
    },
    {
      title: 'RECURSOS & EQUIPO',
      items: [
        ['/admin/pos/inventario', '📦 Inventario de materiales', '/admin/pos/inventario'],
        ['/admin/pos/compras', '🚚 Compras & proveedores', '/admin/pos/compras'],
        ['/admin/equipo', '🔐 Equipo, roles y accesos', '/admin/equipo'],
      ]
    },
    {
      title: 'WEB & CMS',
      items: [
        ['/admin/editor', '🎨 Visual Studio Editor', '/admin/editor'],
        ['/admin/contenido', '📝 Textos & Contacto', '/admin/contenido'],
        ['/admin/productos', '📦 Catálogo Web', '/admin/productos'],
        ['/admin/promociones', '🏷️ Promociones', '/admin/promociones'],
        ['/admin/temas', '✨ Temas de Temporada', '/admin/temas']
      ]
    }
  ];

  return (
    <aside className="admin-sidebar">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <Brand compact />
        <span style={{ fontSize: '10px', fontWeight: 900, background: 'var(--orange-soft)', color: 'var(--orange-dark)', padding: '2px 6px', borderRadius: '6px' }}>
          ADMIN
        </span>
      </div>

      <nav style={{ display: 'grid', gap: '14px' }}>
        {sections.map((sec) => (
          <div key={sec.title} style={{ display: 'grid', gap: '4px' }}>
            <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--muted)', letterSpacing: '0.06em', padding: '0 8px' }}>
              {sec.title}
            </div>
            {sec.items.map(([path, label]) => (
              <NavLink
                key={path}
                end={path === '/admin'}
                className={location.pathname === path ? 'active' : ''}
                to={path}
                style={{ padding: '7px 10px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
              >
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="admin-sidebar-footer" style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid var(--line)', display: 'grid', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <ThemeToggle theme={theme} onChange={setTheme} />
          <button
            type="button"
            onClick={logout}
            style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
          >
            Salir
          </button>
        </div>
        <Link to="/" className="admin-back" style={{ fontSize: '12px', fontWeight: 700 }}>
          ← Ver Sitio Web
        </Link>
      </div>
    </aside>
  );
}

export function AdminShell({ children }) {
  const { toast, siteTheme } = useSite();
  const preset = themePresets.find((item) => item.id === siteTheme) || themePresets[0];
  return (
    <div className="admin-shell">
      <SeasonalThemeLayer preset={preset} />
      <GlobalContextMenu admin />
      <MotionObserver />
      <AdminNav />
      <section className="admin-content">{children}</section>
      <ToastViewport items={toast ? [{ id: 'admin', message: toast }] : []} />
    </div>
  );
}

export function AdminHeader({ eyebrow, title, text, action }) {
  return (
    <header className="admin-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </header>
  );
}

export const imageLibrary = [
  media.lona,
  media.vinil,
  media.letrero,
  media.laser,
  media.stickers,
  media.workspace,
  ...resourceUrls.filter((item) => item.type === 'image').map((item) => item.url)
];
