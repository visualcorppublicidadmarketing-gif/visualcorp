import React from 'react';
import { Boxes, Check, Disc3, Layers, RefreshCw, Search, X } from 'lucide-react';
import type { InventoryItem, MaterialCategoryTab } from './types';

export type RollMaterialSelectorCardProps = {
  selectedMaterial: InventoryItem | null;
  isChangingMaterial: boolean;
  onToggleChangingMaterial: (isChanging: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  activeTab: MaterialCategoryTab;
  onTabChange: (tab: MaterialCategoryTab) => void;
  candidates: InventoryItem[];
  selectedVariantId?: string;
  onSelectMaterial: (item: InventoryItem) => void;
  width?: string;
  stepNumber?: number;
  disabled?: boolean;
};

const CATEGORY_TABS: Array<{ id: MaterialCategoryTab; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'vinil', label: 'Vinilos' },
  { id: 'lona', label: 'Lonas' },
  { id: 'micro', label: 'Microperforados' },
  { id: 'especial', label: 'Especiales' },
];

export const RollMaterialSelectorCard: React.FC<RollMaterialSelectorCardProps> = ({
  selectedMaterial,
  isChangingMaterial,
  onToggleChangingMaterial,
  searchQuery,
  onSearchQueryChange,
  activeTab,
  onTabChange,
  candidates,
  selectedVariantId,
  onSelectMaterial,
  width,
  stepNumber = 2,
  disabled = false,
}) => {
  const showSummary = selectedMaterial && !isChangingMaterial;

  const widthDisplay = React.useMemo(() => {
    if (!width) return 'Ancho estándar';
    const num = Number(width);
    if (!Number.isFinite(num) || num <= 0) return `${width} cm`;
    return `${width} cm (${(num / 100).toFixed(2)}m)`;
  }, [width]);

  return (
    <div className="roll-reception__card roll-reception__material-card">
      <div className="roll-reception__card-header">
        <span className="roll-reception__step-badge">{stepNumber}</span>
        <div className="roll-reception__card-title-group">
          <h3>Material y variante</h3>
          <p>Selecciona o busca el rollo específico (Lona, Vinil, Microperforado...)</p>
        </div>
      </div>

      <div className="roll-reception__card-body">
        {showSummary ? (
          /* Tarjeta de Material Seleccionado */
          <div className="roll-reception__selected-material-card">
            <div className="roll-reception__selected-material-icon" aria-hidden="true">
              <Disc3 size={24} />
            </div>

            <div className="roll-reception__selected-material-info">
              <span className="roll-reception__selected-kicker">Material seleccionado</span>
              <h4 className="roll-reception__selected-name">{selectedMaterial.name}</h4>
              <div className="roll-reception__selected-tags">
                {selectedMaterial.variant && (
                  <span className="roll-reception__tag-chip finish">
                    {selectedMaterial.variant}
                  </span>
                )}
                <span className="roll-reception__tag-chip width">
                  {widthDisplay}
                </span>
                {(selectedMaterial.sku || selectedMaterial.variantSku) && (
                  <span className="roll-reception__tag-chip sku">
                    {selectedMaterial.sku || selectedMaterial.variantSku}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className="roll-reception__btn-change-material"
              disabled={disabled}
              onClick={() => onToggleChangingMaterial(true)}
              aria-label="Cambiar material seleccionado"
            >
              <RefreshCw size={14} className="roll-reception__btn-icon" />
              Cambiar material
            </button>
          </div>
        ) : (
          /* Selector Inteligente con Buscador y Pestañas Responsivas */
          <div className="roll-reception__material-picker">
            {/* Cabecera de búsqueda y pestañas (separadas para evitar superposiciones horizontales) */}
            <div className="roll-reception__material-toolbar">
              <div className="roll-reception__search-wrapper">
                <Search size={16} className="roll-reception__search-icon" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, medida (127, 310...), acabado o SKU..."
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  disabled={disabled}
                  className="roll-reception__search-input"
                  aria-label="Buscar material de rollo"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchQueryChange('')}
                    className="roll-reception__search-clear-btn"
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div
                className="roll-reception__category-tabs"
                role="tablist"
                aria-label="Filtrar materiales por tipo"
              >
                {CATEGORY_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`roll-reception__category-tab ${isActive ? 'is-active' : ''}`}
                      onClick={() => onTabChange(tab.id)}
                      disabled={disabled}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {selectedMaterial && isChangingMaterial && (
                <div className="roll-reception__cancel-change-row">
                  <button
                    type="button"
                    className="roll-reception__btn-revert"
                    onClick={() => onToggleChangingMaterial(false)}
                  >
                    Mantener material previo: <b>{selectedMaterial.name}</b>
                  </button>
                </div>
              )}
            </div>

            {/* Listado de Candidatos de Material */}
            <div
              className="roll-reception__candidates-list"
              role="listbox"
              aria-label="Resultados de materiales disponibles"
            >
              {candidates.length === 0 ? (
                <div className="roll-reception__candidates-empty">
                  <Boxes size={24} className="roll-reception__empty-icon" aria-hidden="true" />
                  <p>No se encontraron rollos con esa búsqueda.</p>
                  <small>Intenta con otro término o selecciona la pestaña &quot;Todos&quot;.</small>
                </div>
              ) : (
                candidates.map((item) => {
                  const isChosen = selectedVariantId === item.variantId;
                  const sku = item.sku || item.variantSku;
                  return (
                    <button
                      key={item.variantId || item.id}
                      type="button"
                      role="option"
                      aria-selected={isChosen}
                      className={`roll-reception__candidate-card ${isChosen ? 'is-selected' : ''}`}
                      onClick={() => onSelectMaterial(item)}
                      disabled={disabled}
                    >
                      <div className="roll-reception__candidate-avatar" aria-hidden="true">
                        <Layers size={16} />
                      </div>

                      <div className="roll-reception__candidate-details">
                        <div className="roll-reception__candidate-name-row">
                          <strong className="roll-reception__candidate-title">
                            {item.name}
                          </strong>
                        </div>
                        <div className="roll-reception__candidate-meta">
                          {item.variant && (
                            <span className="roll-reception__candidate-variant">
                              {item.variant}
                            </span>
                          )}
                          {sku && (
                            <span className="roll-reception__candidate-sku">
                              SKU: {sku}
                            </span>
                          )}
                          {item.category && (
                            <span className="roll-reception__candidate-category">
                              {item.category}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="roll-reception__candidate-action">
                        <span className={`roll-reception__select-badge ${isChosen ? 'is-active' : ''}`}>
                          {isChosen ? (
                            <>
                              <Check size={12} aria-hidden="true" />
                              <span>Elegido</span>
                            </>
                          ) : (
                            <span>Elegir</span>
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
