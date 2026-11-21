import React, { useEffect, useRef, useState } from 'react';
import { Check, LayoutGrid, List, Monitor, PanelLeft, Search, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import { navigationStyleOptions, type NavigationStyle } from './navigation';
import './navigation-style-picker.css';

type NavigationStylePickerProps = {
  value: NavigationStyle;
  isCollapsed: boolean;
  onSave: (style: NavigationStyle) => void;
};

const styleIcons: Record<NavigationStyle, LucideIcon> = {
  categories: List,
  rail: PanelLeft,
  grid: LayoutGrid,
  dropdown: Search,
  adaptive: Monitor,
};

export function NavigationStylePicker({ value, isCollapsed, onSave }: NavigationStylePickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftStyle, setDraftStyle] = useState<NavigationStyle>(value);

  useEffect(() => setDraftStyle(value), [value]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const closeDialog = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        className={'nav-style-picker-trigger' + (isCollapsed ? ' is-compact' : '')}
        aria-label="Elegir estilo de navegación"
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        title="Estilo de navegación"
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>Estilo de navegación</span>
      </button>

      <dialog
        ref={dialogRef}
        className="nav-style-dialog"
        aria-labelledby="nav-style-dialog-title"
        aria-describedby="nav-style-dialog-description"
        onClose={() => setIsOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog();
        }}
      >
        <header className="nav-style-dialog-header">
          <div>
            <span className="nav-style-dialog-eyebrow">PERSONALIZA EL PANEL</span>
            <h2 id="nav-style-dialog-title">Estilo de navegación</h2>
            <p id="nav-style-dialog-description">Compara las opciones y elige cómo recorrer las secciones.</p>
          </div>
          <button type="button" className="nav-style-dialog-close" aria-label="Cerrar" onClick={closeDialog}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="nav-style-options" role="group" aria-label="Estilos de navegación">
          {navigationStyleOptions.map((option) => {
            const Icon = styleIcons[option.id];
            const selected = draftStyle === option.id;
            return (
              <button
                type="button"
                key={option.id}
                className={'nav-style-option' + (selected ? ' is-selected' : '')}
                aria-pressed={selected}
                onClick={() => setDraftStyle(option.id)}
              >
                <span className="nav-style-option-heading">
                  <span className="nav-style-option-icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="nav-style-option-title">{option.label}</span>
                  {selected && <Check className="nav-style-option-check" size={16} aria-hidden="true" />}
                </span>
                <span className={'nav-style-preview nav-style-preview-' + option.id} aria-hidden="true">
                  <span className="nav-preview-sidebar">
                    <i /><i /><i />
                  </span>
                  <span className="nav-preview-content">
                    {option.id === 'categories' && <><i /><i /><i /><i /></>}
                    {option.id === 'rail' && <><b /><b /><b /><b /></>}
                    {option.id === 'grid' && <><b /><b /><b /><b /></>}
                    {option.id === 'dropdown' && <><strong /><i /><i /><i /></>}
                    {option.id === 'adaptive' && <><b /><i /><i /></>}
                  </span>
                </span>
                <span className="nav-style-option-description">{option.description}</span>
              </button>
            );
          })}
        </div>

        <footer className="nav-style-dialog-footer">
          <span>La elección se guarda para tu cuenta en este navegador.</span>
          <div>
            <button type="button" className="nav-style-cancel" onClick={closeDialog}>Cancelar</button>
            <button
              type="button"
              className="nav-style-save"
              onClick={() => {
                onSave(draftStyle);
                closeDialog();
              }}
            >
              Guardar preferencia
            </button>
          </div>
        </footer>
      </dialog>
    </>
  );
}