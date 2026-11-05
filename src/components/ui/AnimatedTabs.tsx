import React, { useRef, useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './animated-tabs.css';

export type TabItem<T extends string = string> = {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: number | string;
  disabled?: boolean;
  tooltip?: string;
};

export type AnimatedTabsProps<T extends string = string> = {
  tabs: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
  variant?: 'pills' | 'segmented' | 'underline' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  layoutId?: string;
};

export function AnimatedTabs<T extends string = string>({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  className = '',
  variant = 'segmented',
  size = 'md',
  layoutId,
}: AnimatedTabsProps<T>) {
  const generatedId = useId();
  const effectiveLayoutId = layoutId || `vc-tab-pill-${generatedId}`;
  const reduceMotion = useReducedMotion();
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const enabledCurrentIndex = enabledTabs.findIndex((t) => t.id === tabs[currentIndex].id);
    if (enabledCurrentIndex === -1) return;

    let targetIndex = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      targetIndex = (enabledCurrentIndex + 1) % enabledTabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      targetIndex = (enabledCurrentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      targetIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      targetIndex = enabledTabs.length - 1;
    }

    if (targetIndex !== -1) {
      const nextTab = enabledTabs[targetIndex];
      onChange(nextTab.id);
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])');
      buttons?.[targetIndex]?.focus();
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`vc-animated-tabs vc-tabs-${variant} vc-tabs-${size} ${className}`}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`vc-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`vc-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            title={tab.tooltip}
            onClick={() => !tab.disabled && onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`vc-tab-button${isActive ? ' is-active' : ''}${tab.disabled ? ' is-disabled' : ''}`}
          >
            {isActive && (
              <motion.span
                layoutId={reduceMotion ? undefined : effectiveLayoutId}
                className="vc-tab-active-indicator"
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 36,
                }}
              />
            )}
            <span className="vc-tab-label-wrap">
              {tab.icon && <span className="vc-tab-icon" aria-hidden="true">{tab.icon}</span>}
              <span className="vc-tab-text">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`vc-tab-badge${isActive ? ' is-active' : ''}`}>
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
