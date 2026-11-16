import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type SuiteTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: SuiteTheme;
  isSuiteRoute: boolean;
  setTheme: (theme: SuiteTheme) => void;
  toggleTheme: () => void;
}

interface ThemeSnapshot {
  htmlTheme: string | null;
  htmlVcTheme: string | null;
  bodyTheme: string | null;
  bodyVcTheme: string | null;
}

const STORAGE_KEY = 'vc-suite-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function preferredTheme(): SuiteTheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function isSuiteRoute(pathname: string) {
  return pathname === '/panel'
    || pathname.startsWith('/panel/')
    || pathname === '/admin'
    || pathname.startsWith('/admin/')
    || pathname === '/operaciones'
    || pathname.startsWith('/operaciones/');
}

function readSnapshot(): ThemeSnapshot {
  return {
    htmlTheme: document.documentElement.getAttribute('data-theme'),
    htmlVcTheme: document.documentElement.getAttribute('data-vc-theme'),
    bodyTheme: document.body.getAttribute('data-theme'),
    bodyVcTheme: document.body.getAttribute('data-vc-theme'),
  };
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [theme, setThemeState] = useState<SuiteTheme>(preferredTheme);
  const snapshotRef = useRef<ThemeSnapshot | null>(null);
  const onSuiteRoute = isSuiteRoute(pathname);

  const setTheme = useCallback((nextTheme: SuiteTheme) => {
    setThemeState(nextTheme);
    try { window.localStorage.setItem(STORAGE_KEY, nextTheme); } catch { /* Storage may be unavailable. */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage may be unavailable. */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => {
      try {
        if (window.localStorage.getItem(STORAGE_KEY) === null) setThemeState(media.matches ? 'dark' : 'light');
      } catch { /* Keep the in-memory theme when storage is unavailable. */ }
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue === 'dark' || event.newValue === 'light') setThemeState(event.newValue);
      else setThemeState(media.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', syncSystemTheme);
    window.addEventListener('storage', syncStorage);
    return () => {
      media.removeEventListener?.('change', syncSystemTheme);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  useBrowserLayoutEffect(() => {
    if (onSuiteRoute) {
      if (!snapshotRef.current) snapshotRef.current = readSnapshot();
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-vc-theme', theme);
      document.body.setAttribute('data-theme', theme);
      document.body.setAttribute('data-vc-theme', theme);
      return;
    }

    const previous = snapshotRef.current;
    if (previous) {
      restoreAttribute(document.documentElement, 'data-theme', previous.htmlTheme);
      restoreAttribute(document.documentElement, 'data-vc-theme', previous.htmlVcTheme);
      restoreAttribute(document.body, 'data-theme', previous.bodyTheme);
      restoreAttribute(document.body, 'data-vc-theme', previous.bodyVcTheme);
      snapshotRef.current = null;
    }
  }, [onSuiteRoute, theme]);

  const value = useMemo(() => ({ theme, isSuiteRoute: onSuiteRoute, setTheme, toggleTheme }), [theme, onSuiteRoute, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider.');
  return context;
}
