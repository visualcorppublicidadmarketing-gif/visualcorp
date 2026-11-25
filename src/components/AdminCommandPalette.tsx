import { Search } from 'lucide-react';
import type { AppNavLink } from '../app/navigation';
import { requestGlobalCommandPaletteOpen } from './ui/GlobalCommandPalette';

type Props = { items: AppNavLink[] };

/** Topbar entry point for the one shared command palette mounted at the app root. */
export function AdminCommandPalette({ items }: Props) {
  return (
    <button
      type="button"
      className="admin-command-trigger"
      aria-label={`Buscar en Visual Corp Suite (${items.length} secciones disponibles)`}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      onClick={requestGlobalCommandPaletteOpen}
    >
      <Search size={15}/><span>Buscar en la Suite</span><kbd>Ctrl / ⌘ K</kbd>
    </button>
  );
}
