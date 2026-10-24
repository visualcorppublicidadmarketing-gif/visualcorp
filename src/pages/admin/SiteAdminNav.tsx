import { NavLink } from 'react-router-dom';
import { BookOpen, BriefcaseBusiness, Globe2, Image, Mail, Newspaper, ShoppingBag } from 'lucide-react';
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

export function SiteAdminNav({ active }: { active: string }) {
  return <nav className="site-admin-tabs" aria-label="Editores de la página pública">
    {tabs.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end className={active === to ? 'is-active' : ''}>
      <Icon size={15} aria-hidden="true"/><span>{label}</span>
    </NavLink>)}
  </nav>;
}
