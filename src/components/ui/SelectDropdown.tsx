import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import './select-dropdown.css';

export type SelectDropdownOption = {
  value: string;
  label: string;
  description?: string;
  dotColor?: string;
  badge?: string | number;
};

export type SelectDropdownProps = {
  label?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  value: string;
  defaultValue?: string;
  options: SelectDropdownOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
};

export function SelectDropdown({
  label,
  ariaLabel,
  icon,
  value,
  defaultValue,
  options,
  onChange,
  searchable,
  searchPlaceholder = 'Filtrar opciones…',
  size = 'sm',
  disabled = false,
  className = '',
}: SelectDropdownProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; top: number; minWidth: number } | null>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || options[0],
    [options, value],
  );

  const effectiveDefault = defaultValue ?? options[0]?.value ?? '';
  const isActiveFilter = Boolean(effectiveDefault && value !== effectiveDefault);
  const showSearch = searchable ?? options.length > 6;

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('es');
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLocaleLowerCase('es').includes(q) ||
        (opt.description && opt.description.toLocaleLowerCase('es').includes(q)),
    );
  }, [options, searchQuery]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    const idx = filteredOptions.findIndex((opt) => opt.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
  }, [isOpen, value]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return undefined;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const anchor = trigger.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const margin = 8;
      const gap = 5;

      const spaceBelow = window.innerHeight - anchor.bottom - margin;
      const spaceAbove = anchor.top - margin;
      const openAbove = spaceBelow < popRect.height + gap && spaceAbove > spaceBelow;

      const top = openAbove
        ? Math.max(margin, anchor.top - popRect.height - gap)
        : Math.min(window.innerHeight - popRect.height - margin, anchor.bottom + gap);

      const left = Math.max(
        margin,
        Math.min(anchor.left, window.innerWidth - Math.max(popRect.width, anchor.width) - margin),
      );

      setPlacement({
        left,
        top,
        minWidth: Math.max(210, Math.round(anchor.width)),
      });
    };

    updatePosition();
    if (showSearch) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, showSearch, filteredOptions.length]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyNavigation = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % filteredOptions.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      }
    } else if (event.key === 'Home' && !showSearch) {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === 'End' && !showSearch) {
      event.preventDefault();
      setHighlightedIndex(Math.max(0, filteredOptions.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const targetOption = filteredOptions[highlightedIndex];
      if (targetOption) {
        selectValue(targetOption.value);
      }
    } else if (event.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const listboxId = `${id}-listbox`;

  return (
    <div className={`vc-select-dropdown ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`vc-select-trigger is-${size}${isActiveFilter ? ' is-active-filter' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel || (label ? `${label}: ${selectedOption?.label || ''}` : selectedOption?.label)}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyNavigation}
      >
        {icon && <span className="vc-select-trigger-icon" aria-hidden="true">{icon}</span>}
        {label && <span className="vc-select-trigger-label">{label}:</span>}
        <span className="vc-select-trigger-value">
          {selectedOption?.dotColor && (
            <span
              className="vc-select-trigger-dot"
              style={{ backgroundColor: selectedOption.dotColor }}
              aria-hidden="true"
            />
          )}
          <span>{selectedOption?.label || value}</span>
        </span>
        <span className="vc-select-trigger-chevron" aria-hidden="true">
          <ChevronDown size={13} />
        </span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className="vc-select-popover"
            style={{
              left: placement?.left ?? -9999,
              top: placement?.top ?? -9999,
              minWidth: placement?.minWidth ?? 220,
              visibility: placement ? 'visible' : 'hidden',
            }}
            onKeyDown={handleKeyNavigation}
          >
            {label && (
              <div className="vc-select-popover-header">
                <span className="vc-select-popover-title">{label}</span>
                {isActiveFilter && effectiveDefault && (
                  <button
                    type="button"
                    className="vc-select-popover-reset"
                    onClick={() => selectValue(effectiveDefault)}
                  >
                    Restablecer
                  </button>
                )}
              </div>
            )}

            {showSearch && (
              <div className="vc-select-search-wrap">
                <Search size={13} className="vc-select-search-icon" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="vc-select-search-input"
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="vc-select-popover-reset"
                    aria-label="Limpiar búsqueda"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )}

            <div
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel || label || 'Opciones'}
              className="vc-select-options-list"
            >
              {filteredOptions.length === 0 ? (
                <div className="vc-select-empty">Sin coincidencias para «{searchQuery}»</div>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = option.value === value;
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`vc-select-option${isHighlighted ? ' is-highlighted' : ''}`}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => selectValue(option.value)}
                    >
                      <span className="vc-select-option-main">
                        {option.dotColor && (
                          <span
                            className="vc-select-option-dot"
                            style={{ backgroundColor: option.dotColor }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="vc-select-option-text">
                          <span className="vc-select-option-label">{option.label}</span>
                          {option.description && (
                            <span className="vc-select-option-desc">{option.description}</span>
                          )}
                        </span>
                      </span>
                      <span className="vc-select-option-end">
                        {option.badge !== undefined && (
                          <span className="vc-select-option-badge">{option.badge}</span>
                        )}
                        <span className="vc-select-option-check" aria-hidden="true">
                          {isSelected && <Check size={14} />}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
