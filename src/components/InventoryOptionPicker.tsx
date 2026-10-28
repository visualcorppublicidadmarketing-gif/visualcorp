import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';

type Props = {
  label: string;
  mode: 'single' | 'multiple';
  value: string | string[];
  options: string[];
  placeholder: string;
  helpText: string;
  className?: string;
  autoFocus?: boolean;
  onChange: (value: string | string[]) => void;
};

const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const uniqueValues = (values: string[]) => [...new Map(values.map((value) => [normalize(value), value.trim()])).values()].filter(Boolean);

export function InventoryOptionPicker({ label, mode, value, options, placeholder, helpText, className = '', autoFocus = false, onChange }: Props) {
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = mode === 'single'
    ? (typeof value === 'string' && value.trim() ? [value.trim()] : [])
    : (Array.isArray(value) ? uniqueValues(value) : []);
  const availableOptions = useMemo(() => uniqueValues([...options, ...selected]).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })), [options, selected.join('\u0000')]);
  const filteredOptions = useMemo(() => {
    const query = normalize(search);
    return query ? availableOptions.filter((option) => normalize(option).includes(query)) : availableOptions;
  }, [availableOptions, search]);
  const activeOptionId = activeIndex >= 0 && filteredOptions[activeIndex] ? `${pickerId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (customOpen) customInputRef.current?.focus();
  }, [customOpen]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const close = () => {
    setOpen(false);
    setSearch('');
    setActiveIndex(-1);
  };

  const selectOption = (option: string) => {
    if (mode === 'single') {
      onChange(option);
      close();
      return;
    }
    const current = selected;
    const exists = current.some((tag) => normalize(tag) === normalize(option));
    if (exists) onChange(current.filter((tag) => normalize(tag) !== normalize(option)));
    else if (current.length < 40) onChange([...current, option]);
  };

  const addCustom = (rawValue: string) => {
    const next = rawValue.trim().slice(0, mode === 'multiple' ? 48 : 100);
    if (!next) return;
    if (mode === 'single') {
      onChange(next);
      setCustomOpen(false);
      setCustomDraft('');
      close();
      return;
    }
    const current = selected;
    if (current.length >= 40 && !current.some((tag) => normalize(tag) === normalize(next))) return;
    if (!current.some((tag) => normalize(tag) === normalize(next))) onChange([...current, next]);
    setCustomDraft('');
    window.requestAnimationFrame(() => customInputRef.current?.focus());
  };

  const startCustom = () => {
    setCustomDraft(search.trim());
    close();
    setCustomOpen(true);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!filteredOptions.length) return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + direction + filteredOptions.length) % filteredOptions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && filteredOptions[activeIndex]) selectOption(filteredOptions[activeIndex]);
      else if (search.trim()) {
        const exactMatch = filteredOptions.find((option) => normalize(option) === normalize(search));
        if (exactMatch) selectOption(exactMatch);
        else if (mode === 'multiple') addCustom(search);
        else startCustom();
      }
    }
  };

  const selectedLabel = selected.length ? selected.join(', ') : placeholder;

  return <div className={`inventory-option-picker ${className}${mode === 'multiple' ? ' is-multiple' : ''}`} ref={rootRef} role="group" aria-labelledby={`${pickerId}-label`}>
    <span className="inventory-editor-field-label" id={`${pickerId}-label`}>{label}</span>

    {mode === 'multiple' && selected.length > 0 && <div className="inventory-option-chips" aria-label={`${label} seleccionadas`}>
      {selected.map((tag) => <span className="inventory-option-chip" key={normalize(tag)}>{tag}<button type="button" aria-label={`Quitar etiqueta ${tag}`} onClick={() => selectOption(tag)}><X size={12}/></button></span>)}
    </div>}

    <button autoFocus={autoFocus} type="button" className="inventory-option-trigger" aria-label={`${label}: ${selectedLabel}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${pickerId}-listbox`} onClick={() => { setOpen((current) => !current); setCustomOpen(false); setSearch(''); setActiveIndex(-1); }}>
      <span>{mode === 'multiple' ? (selected.length ? 'Agregar o buscar etiquetas' : placeholder) : selectedLabel}</span><ChevronDown size={15}/>
    </button>

    {open && <div className="inventory-option-popover">
      <label className="inventory-option-search"><Search size={14}/><span className="inventory-option-sr-only">Buscar {mode === 'single' ? 'tipos de artículo' : 'etiquetas'}</span><input ref={searchRef} type="search" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={`${pickerId}-listbox`} aria-activedescendant={activeOptionId} value={search} onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }} onKeyDown={handleSearchKeyDown} placeholder={`Buscar ${mode === 'single' ? 'un tipo' : 'etiquetas'}…`}/></label>
      <div className="inventory-option-list" role="listbox" id={`${pickerId}-listbox`} aria-label={mode === 'single' ? 'Tipos de artículo disponibles' : 'Etiquetas disponibles'} aria-multiselectable={mode === 'multiple' || undefined}>
        {filteredOptions.map((option, index) => {
          const isSelected = selected.some((current) => normalize(current) === normalize(option));
          return <div id={`${pickerId}-option-${index}`} key={normalize(option)} role="option" aria-selected={isSelected} className={`inventory-option-item${activeIndex === index ? ' is-active' : ''}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectOption(option)}><span>{option}</span>{isSelected && <Check size={14}/>}</div>;
        })}
        {!filteredOptions.length && <p className="inventory-option-empty">No hay coincidencias. Puedes escribir una opción nueva.</p>}
      </div>
      <button type="button" className="inventory-option-custom-action" disabled={mode === 'multiple' && selected.length >= 40} onClick={startCustom}><Plus size={14}/>{mode === 'multiple' && selected.length >= 40 ? 'Límite de 40 etiquetas' : mode === 'single' ? (search.trim() ? `Escribir “${search.trim()}”` : 'Escribir otro tipo') : (search.trim() ? `Escribir etiqueta “${search.trim()}”` : 'Escribir otra etiqueta')}</button>
    </div>}

    {customOpen && <div className="inventory-option-custom-entry">
      <input ref={customInputRef} autoFocus maxLength={mode === 'multiple' ? 48 : 100} aria-label={mode === 'single' ? 'Escribir tipo de artículo personalizado' : 'Escribir etiqueta personalizada'} value={customDraft} onChange={(event) => setCustomDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setCustomOpen(false); setCustomDraft(''); } else if (event.key === 'Enter') { event.preventDefault(); addCustom(customDraft); } }} placeholder={mode === 'single' ? 'Ej. material, herramienta…' : 'Ej. vinil mate, rollo…'}/>
      <button type="button" disabled={!customDraft.trim() || (mode === 'multiple' && selected.length >= 40)} onClick={() => addCustom(customDraft)}>{mode === 'single' ? 'Usar tipo' : selected.length >= 40 ? 'Límite alcanzado' : 'Agregar etiqueta'}</button>
      <button type="button" className="inventory-option-cancel-custom" aria-label="Cancelar escritura personalizada" onClick={() => { setCustomOpen(false); setCustomDraft(''); }}><X size={14}/></button>
    </div>}
    <small>{helpText}</small>
  </div>;
}
