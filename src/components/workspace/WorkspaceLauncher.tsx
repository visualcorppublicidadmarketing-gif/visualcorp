import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search, Star, X } from 'lucide-react';
import type { AppNavGroup, AppNavLink } from '../../app/navigation';
import './workspace-launcher.css';

export type WorkspaceLauncherProps = {
  userId: string;
  groups: (AppNavGroup & { items: AppNavLink[] })[];
  descriptions: Record<string, string>;
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Receives only permission-filtered routes. Favorites never grant access. */
export function WorkspaceLauncher({ userId, groups, descriptions }: WorkspaceLauncherProps) {
  const searchId = useId();
  const storageKey = `vc-workspace-favorites-v1:${userId}`;
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
    } catch { return []; }
  });
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const allowedFavorites = groups.flatMap(group => group.items).filter(item => favorites.includes(item.to));
  const filteredGroups = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return groups.flatMap(group => {
      if (area !== 'all' && group.id !== area) return [];
      const items = group.items.filter(item => (!onlyFavorites || favorites.includes(item.to))
        && words.every(word => normalize(`${item.label} ${descriptions[item.to] || ''} ${group.label}`).includes(word)));
      return items.length ? [{ ...group, items }] : [];
    });
  }, [groups, query, area, onlyFavorites, favorites, descriptions]);
  const count = filteredGroups.reduce((sum, group) => sum + group.items.length, 0);
  const toggleFavorite = (path: string) => {
    const next = favorites.includes(path) ? favorites.filter(item => item !== path) : [...favorites, path];
    setFavorites(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  };
  const reset = () => { setQuery(''); setArea('all'); setOnlyFavorites(false); };
  return <section className="workspace-launcher" aria-labelledby={`${searchId}-heading`}>
    <header className="workspace-launcher-heading"><div><span>Tu espacio de trabajo</span><h2 id={`${searchId}-heading`}>Encuentra tu siguiente herramienta</h2><p>Marca con una estrella los accesos que más utilizas. Se guardan para tu cuenta en este navegador.</p></div><span className="workspace-launcher-total">{groups.reduce((sum, group) => sum + group.items.length, 0)} herramientas</span></header>
    {allowedFavorites.length > 0 && <nav className="workspace-favorites" aria-label="Tus accesos favoritos"><span><Star size={15} aria-hidden="true"/> A mano</span>{allowedFavorites.map(({to,label,icon:Icon}) => <Link key={to} to={to}><Icon size={15} aria-hidden="true"/>{label}<ArrowUpRight size={13} aria-hidden="true"/></Link>)}</nav>}
    <div className="workspace-launcher-controls">
      <div className="workspace-tool-search"><label className="sr-only" htmlFor={searchId}>Buscar herramientas</label><Search size={19} aria-hidden="true"/><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Busca una herramienta o tarea…"/>{query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => {setQuery(''); document.getElementById(searchId)?.focus();}}><X size={17}/></button>}</div>
      <button className="workspace-favorites-toggle" type="button" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(value => !value)}><Star size={16} aria-hidden="true"/> Favoritos <span>{allowedFavorites.length}</span></button>
    </div>
    <div className="workspace-area-filters" role="group" aria-label="Filtrar herramientas por área"><button type="button" aria-pressed={area === 'all'} onClick={() => setArea('all')}>Todas las áreas</button>{groups.map(({id,label,icon:Icon}) => <button key={id} type="button" aria-pressed={area === id} onClick={() => setArea(id)}><Icon size={15} aria-hidden="true"/>{label}</button>)}</div>
    <p className="workspace-tool-count" role="status" aria-live="polite">{count} {count === 1 ? 'herramienta disponible' : 'herramientas disponibles'}{query && ` para “${query}”`}</p>
    {storageWarning && <p className="workspace-storage-warning" role="status">Tus favoritos funcionan durante esta sesión, pero el navegador no permitió guardarlos.</p>}
    {filteredGroups.map(({id,label,icon:GroupIcon,items}) => <section key={id} className="workspace-tool-group" aria-labelledby={`${searchId}-${id}`}><h3 id={`${searchId}-${id}`}><GroupIcon size={17} aria-hidden="true"/>{label}<span>{items.length}</span></h3><div className="workspace-tool-grid">{items.map(({to,label: name,icon:Icon}) => <article className="workspace-tool-card" key={to}><Link to={to}><span className="workspace-tool-icon"><Icon size={21} aria-hidden="true"/></span><span><strong>{name}</strong><small>{descriptions[to] || 'Consulta y gestiona los registros de este módulo.'}</small></span><ArrowUpRight size={17} aria-hidden="true"/></Link><button className="workspace-pin" type="button" aria-pressed={favorites.includes(to)} aria-label={`${favorites.includes(to) ? 'Quitar' : 'Añadir'} ${name} ${favorites.includes(to) ? 'de' : 'a'} favoritos`} onClick={() => toggleFavorite(to)}><Star size={17} fill={favorites.includes(to) ? 'currentColor' : 'none'} aria-hidden="true"/></button></article>)}</div></section>)}
    {!count && <div className="workspace-tools-empty"><Search size={26} aria-hidden="true"/><h3>{!groups.length ? 'Sin herramientas asignadas' : onlyFavorites && !allowedFavorites.length ? 'Tus favoritos empiezan aquí' : 'No encontramos herramientas'}</h3><p>{!groups.length ? 'Solicita al responsable revisar los permisos de tu perfil.' : onlyFavorites && !allowedFavorites.length ? 'Vuelve a todas las herramientas y marca las que utilizas a diario.' : 'Prueba con otra palabra o cambia los filtros.'}</p>{groups.length > 0 && <button type="button" onClick={reset}>Ver todas las herramientas</button>}</div>}
  </section>;
}
