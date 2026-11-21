import React, { useEffect, useRef, useState } from 'react';
import { Check, LayoutGrid, List, Monitor, PanelLeft, Search, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import { DEFAULT_NAVIGATION_PREFERENCES, navigationStyleOptions, type NavigationDensity, type NavigationPreferences, type NavigationWidth } from './navigation';
import './navigation-style-picker.css';

type NavigationStylePickerProps = {
  value: NavigationPreferences;
  isCollapsed: boolean;
  onSave: (preferences: NavigationPreferences) => void;
};

const styleIcons: Record<NavigationPreferences['style'], LucideIcon> = {
  categories: List,
  rail: PanelLeft,
  grid: LayoutGrid,
  dropdown: Search,
  adaptive: Monitor,
};

export function NavigationStylePicker({ value, isCollapsed, onSave }: NavigationStylePickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState<NavigationPreferences>(value);

  useEffect(() => setDraftPreferences(value), [value]);

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
        aria-label="Configurar el panel"
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        title="Configuración del panel"
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>Configuración</span>
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
            <h2 id="nav-style-dialog-title">Configuración del panel</h2>
            <p id="nav-style-dialog-description">Personaliza la navegación y el espacio de trabajo.</p>
          </div>
          <button type="button" className="nav-style-dialog-close" aria-label="Cerrar" onClick={closeDialog}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <section className="nav-settings-section" aria-labelledby="nav-style-section-title">
          <div className="nav-settings-heading">
            <div>
              <h3 id="nav-style-section-title">Estilo de navegación</h3>
              <p>Compara las opciones y elige cómo recorrer las secciones.</p>
            </div>
          </div>
          <div className="nav-style-options" role="group" aria-label="Estilos de navegación">
          {navigationStyleOptions.map((option) => {
            const Icon = styleIcons[option.id];
            const selected = draftPreferences.style === option.id;
            return (
              <button
                type="button"
                key={option.id}
                className={'nav-style-option' + (selected ? ' is-selected' : '')}
                aria-pressed={selected}
                onClick={() => setDraftPreferences((current) => ({ ...current, style: option.id }))}
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
        </section>

        <section className="nav-settings-section nav-display-settings" aria-labelledby="nav-display-section-title">
          <div className="nav-settings-heading">
            <div>
              <h3 id="nav-display-section-title">Visualización</h3>
              <p>Ajusta el espacio de la barra para mostrar más o menos secciones.</p>
            </div>
            <button
              type="button"
              className="nav-settings-reset"
              onClick={() => setDraftPreferences(DEFAULT_NAVIGATION_PREFERENCES)}
            >
              Restaurar recomendados
            </button>
          </div>

          <div className="nav-settings-grid">
            <fieldset className="nav-settings-control">
              <legend>Densidad</legend>
              <p>Elige cuánto espacio dejar entre las opciones.</p>
              <div className="nav-settings-choices" role="group" aria-label="Densidad de navegación">
                {([
                  ['comfortable', 'Cómoda', 'Más espacio'],
                  ['compact', 'Compacta', 'Más opciones a la vista'],
                ] as [NavigationDensity, string, string][]).map(([density, label, description]) => (
                  <button
                    type="button"
                    key={density}
                    className={'nav-settings-choice' + (draftPreferences.density === density ? ' is-selected' : '')}
                    aria-pressed={draftPreferences.density === density}
                    onClick={() => setDraftPreferences((current) => ({ ...current, density }))}
                  >
                    <span>{label}</span>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="nav-settings-control">
              <legend>Ancho de la barra</legend>
              <p>Se aplica a las vistas con barra expandida en escritorio.</p>
              <div className="nav-settings-choices nav-settings-width-choices" role="group" aria-label="Ancho de la barra lateral">
                {([
                  ['narrow', 'Estrecha'],
                  ['standard', 'Estándar'],
                  ['wide', 'Amplia'],
                ] as [NavigationWidth, string][]).map(([width, label]) => (
                  <button
                    type="button"
                    key={width}
                    className={'nav-settings-choice nav-settings-width-choice' + (draftPreferences.width === width ? ' is-selected' : '')}
                    aria-pressed={draftPreferences.width === width}
                    onClick={() => setDraftPreferences((current) => ({ ...current, width }))}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <small className="nav-settings-note">El rail compacto conserva su ancho para mantener los iconos accesibles.</small>
            </fieldset>
          </div>
        </section>

        <footer className="nav-style-dialog-footer">
          <span>Los ajustes se guardan para tu cuenta en este navegador.</span>
          <div>
            <button type="button" className="nav-style-cancel" onClick={closeDialog}>Cancelar</button>
            <button
              type="button"
              className="nav-style-save"
              onClick={() => {
                onSave(draftPreferences);
                closeDialog();
              }}
            >
              Guardar cambios
            </button>
          </div>
        </footer>
      </dialog>
    </>
  );
}
