import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookOpen, Copy, ExternalLink, Globe2, Home, Image as ImageIcon, Megaphone, Newspaper, Package, Share2, Sparkles } from 'lucide-react';
import { ContextMenu, type ContextMenuAction } from '../components/ui/ContextMenu';

type ContextTarget = { link?: string; image?: string };

/** Branded, accessible page actions for mouse, keyboard and touch context menus. */
export function PublicSiteContextMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const targetRef = useRef<ContextTarget>({});
  const [target, setTarget] = useState<ContextTarget>({});
  const [status, setStatus] = useState('');

  useEffect(() => {
    const rememberTarget = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest('a[href]') as HTMLAnchorElement | null;
      const image = element?.closest('img[src]') as HTMLImageElement | null;
      const next = {
        link: anchor?.href && /^https?:$/.test(new URL(anchor.href).protocol) ? anchor.href : undefined,
        image: image?.currentSrc || image?.src,
      };
      targetRef.current = next;
      setTarget(next);
      setStatus('');
    };
    window.addEventListener('contextmenu', rememberTarget, true);
    return () => window.removeEventListener('contextmenu', rememberTarget, true);
  }, []);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copiado.`);
    } catch {
      setStatus('El navegador no permitió copiar el enlace.');
    }
  };

  const actions = useMemo<ContextMenuAction[]>(() => {
    const item = (label: string, path: string, icon: ReactNode): ContextMenuAction => ({ label, icon, onSelect: () => navigate(path) });
    const contextual: ContextMenuAction[] = [];
    if (target.link) {
      contextual.push({ label: 'Abrir enlace en pestaña nueva', icon: <ExternalLink size={14}/>, onSelect: () => window.open(targetRef.current.link, '_blank', 'noopener,noreferrer') });
      contextual.push({ label: 'Copiar enlace', icon: <Copy size={14}/>, onSelect: () => void copyText(targetRef.current.link || '', 'El enlace') });
    }
    if (target.image) {
      contextual.push({ label: 'Abrir imagen en pestaña nueva', icon: <ImageIcon size={14}/>, onSelect: () => window.open(targetRef.current.image, '_blank', 'noopener,noreferrer') });
      contextual.push({ label: 'Copiar dirección de imagen', icon: <Copy size={14}/>, onSelect: () => void copyText(targetRef.current.image || '', 'La dirección de imagen') });
    }

    return [
      { label: 'Navegación del sitio', kind: 'label', onSelect: () => {} },
      item('Inicio', '/', <Home size={14}/>),
      item('Servicios', '/servicios', <Sparkles size={14}/>),
      item('Portafolio', '/portafolio', <ImageIcon size={14}/>),
      item('Publicaciones', '/publicaciones', <Newspaper size={14}/>),
      item('Blog', '/blog', <BookOpen size={14}/>),
      item('Tienda', '/tienda', <Package size={14}/>),
      item('Contacto', '/contacto', <Globe2 size={14}/>),
      { label: 'Acciones de esta página', kind: 'label', onSelect: () => {} },
      { label: 'Solicitar cotización', icon: <Megaphone size={14}/>, onSelect: () => navigate('/cotizador') },
      { label: 'Copiar enlace de la página', icon: <Copy size={14}/>, onSelect: () => void copyText(window.location.href, 'El enlace de la página') },
      { label: 'Compartir página', icon: <Share2 size={14}/>, onSelect: () => { const share = navigator.share; if (share) void share.call(navigator, { title: document.title, url: window.location.href }).catch(() => {}); else void copyText(window.location.href, 'El enlace de la página'); } },
      ...(contextual.length ? [{ label: 'Elemento seleccionado', kind: 'label' as const, onSelect: () => {} }, ...contextual] : []),
      { kind: 'separator', label: '', onSelect: () => {} },
      { label: 'Volver arriba', icon: <ArrowUp size={14}/>, onSelect: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
      { label: 'Ir al final', icon: <ArrowDown size={14}/>, onSelect: () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }) },
    ];
  }, [location.pathname, navigate, target]);

  return <>
    <ContextMenu scope="document" trigger={false} className="vc-context-public-site" label="Menú de contexto del sitio público" actions={actions}/>
    <span className="vc-public-context-status" role="status" aria-live="polite">{status}</span>
  </>;
}
