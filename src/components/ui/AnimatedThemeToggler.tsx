import React from 'react';
import { flushSync } from 'react-dom';

type AnimatedThemeTogglerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  children: React.ReactNode;
};

/** Reusable circular theme reveal inspired by Magic UI's Animated Theme Toggler. */
export function AnimatedThemeToggler({ theme, onThemeChange, children, ...buttonProps }: AnimatedThemeTogglerProps) {
  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const update = () => onThemeChange(nextTheme);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !document.startViewTransition) { update(); return; }
    const { top, left, width, height } = event.currentTarget.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.style.setProperty('--theme-transition-x', `${x}px`);
    document.documentElement.style.setProperty('--theme-transition-y', `${y}px`);
    document.documentElement.style.setProperty('--theme-transition-radius', `${endRadius}px`);
    document.startViewTransition(() => flushSync(update));
  };
  return <button {...buttonProps} type="button" className={`animated-theme-toggler${buttonProps.className ? ` ${buttonProps.className}` : ''}`} aria-pressed={theme === 'light'} onClick={toggle}>{children}</button>;
}
