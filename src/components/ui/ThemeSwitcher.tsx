import React, { useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import './theme-switcher.css';

export interface ThemeSwitcherProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
  variant?: 'capsule' | 'row' | 'icon';
  className?: string;
}

export function ThemeSwitcher({
  theme,
  onToggle,
  variant = 'capsule',
  className = '',
}: ThemeSwitcherProps) {
  const isDark = theme === 'dark';

  // Atajo global Ctrl+Shift+L para alternar modo claro/oscuro
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggle]);

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`vc-theme-icon-btn ${isDark ? 'is-dark' : 'is-light'} ${className}`}
        onClick={onToggle}
        aria-label={isDark ? 'Cambiar a modo claro (Ctrl+Shift+L)' : 'Cambiar a modo oscuro (Ctrl+Shift+L)'}
        title={isDark ? 'Modo oscuro activo · Clic para modo claro (Ctrl+Shift+L)' : 'Modo claro activo · Clic para modo oscuro (Ctrl+Shift+L)'}
      >
        <span className="vc-theme-icon-inner">
          {isDark ? <Moon size={16} className="vc-theme-moon" /> : <Sun size={16} className="vc-theme-sun" />}
        </span>
      </button>
    );
  }

  if (variant === 'row') {
    return (
      <div className={`vc-theme-row-container ${className}`}>
        <div className="vc-theme-row-label">
          <span className="vc-theme-row-title">Tema visual</span>
          <span className="vc-theme-row-shortcut">Ctrl+Shift+L</span>
        </div>
        <div className="vc-theme-row-segmented" role="radiogroup" aria-label="Seleccionar tema visual">
          <button
            type="button"
            className={`vc-theme-seg-btn ${!isDark ? 'is-active' : ''}`}
            role="radio"
            aria-checked={!isDark}
            onClick={() => { if (isDark) onToggle(); }}
            title="Activar modo claro"
          >
            <Sun size={14} className="vc-theme-sun" />
            <span>Claro</span>
          </button>
          <button
            type="button"
            className={`vc-theme-seg-btn ${isDark ? 'is-active' : ''}`}
            role="radio"
            aria-checked={isDark}
            onClick={() => { if (!isDark) onToggle(); }}
            title="Activar modo oscuro"
          >
            <Moon size={14} className="vc-theme-moon" />
            <span>Oscuro</span>
          </button>
        </div>
      </div>
    );
  }

  // Por defecto: variant="capsule" (Ideal para Topbar)
  return (
    <div
      className={`vc-theme-capsule-switcher ${isDark ? 'theme-is-dark' : 'theme-is-light'} ${className}`}
      role="group"
      aria-label="Selector de modo claro y oscuro"
    >
      <button
        type="button"
        className={`vc-capsule-opt ${!isDark ? 'is-selected' : ''}`}
        onClick={() => { if (isDark) onToggle(); }}
        aria-pressed={!isDark}
        title="Modo Claro (Ctrl+Shift+L)"
      >
        <Sun size={14} className="vc-theme-sun" aria-hidden="true" />
        <span className="vc-capsule-text">Claro</span>
      </button>
      <button
        type="button"
        className={`vc-capsule-opt ${isDark ? 'is-selected' : ''}`}
        onClick={() => { if (!isDark) onToggle(); }}
        aria-pressed={isDark}
        title="Modo Oscuro (Ctrl+Shift+L)"
      >
        <Moon size={14} className="vc-theme-moon" aria-hidden="true" />
        <span className="vc-capsule-text">Oscuro</span>
      </button>
    </div>
  );
}
