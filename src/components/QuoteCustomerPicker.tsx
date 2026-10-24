import React, { useMemo, useState } from 'react';
import { Check, Search, UserRound, X } from 'lucide-react';
import './quote-customer-picker.css';

type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  documentReference?: string;
};

type Props = {
  customers: Customer[];
  customerId: string;
  value: string;
  onNameChange: (value: string) => void;
  onSelect: (customer: Customer | null) => void;
};

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

export function QuoteCustomerPicker({ customers, customerId, value, onNameChange, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selected = customers.find((customer) => customer.id === customerId);
  const matches = useMemo(() => {
    const query = normalize(value);
    if (!query) return customers.slice(0, 6);
    const queryDigits = digits(query);
    const tokens = query.split(/\s+/).filter(Boolean);
    return customers.map((customer) => {
      const name = normalize(customer.name);
      const phone = normalize(customer.phone);
      const phoneDigits = digits(customer.phone);
      const email = normalize(customer.email);
      const document = digits(customer.documentReference);
      const found = name.includes(query)
        || tokens.length > 1 && tokens.every((token) => name.includes(token))
        || phone.includes(query)
        || queryDigits.length >= 3 && phoneDigits.includes(queryDigits)
        || email.includes(query)
        || document.includes(queryDigits) && queryDigits.length >= 4;
      const rank = name === query || email === query || document === queryDigits || phoneDigits === queryDigits ? 0 : name.startsWith(query) || phone.startsWith(query) || phoneDigits.startsWith(queryDigits) || document.startsWith(queryDigits) ? 1 : 2;
      return { customer, found, rank };
    }).filter((entry) => entry.found)
      .sort((a, b) => a.rank - b.rank || a.customer.name.localeCompare(b.customer.name, 'es'))
      .slice(0, 8).map((entry) => entry.customer);
  }, [customers, value]);

  const choose = (customer: Customer | null) => {
    onSelect(customer);
    if (!customer) onNameChange('');
    setOpen(false);
    setActiveIndex(-1);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index < 0 ? 0 : index + 1, Math.max(0, matches.length - 1))); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((index) => index < 0 ? Math.max(0, matches.length - 1) : Math.max(0, index - 1)); }
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
  };

  return <div className="quote-customer-picker">
    <label htmlFor="quote-customer-search">Cliente (opcional)</label>
    <div className="quote-customer-search-wrap">
      <Search size={16} aria-hidden="true"/>
      <input id="quote-customer-search" role="combobox" aria-expanded={open} aria-controls="quote-customer-results" aria-activedescendant={open && activeIndex >= 0 && matches[activeIndex] ? `quote-customer-option-${matches[activeIndex].id}` : undefined} aria-autocomplete="list" autoComplete="off" value={value} onChange={(event) => { onNameChange(event.target.value); onSelect(null); setActiveIndex(-1); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} onBlur={(event) => { if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget as Node | null)) setOpen(false); }} placeholder="Nombre, teléfono, correo o RUC"/>
      {value&&<button type="button" aria-label="Limpiar cliente" onClick={()=>choose(null)}><X size={15}/></button>}
      {open&&<div className="quote-customer-results" id="quote-customer-results" role="listbox" aria-label="Clientes para la cotización">
        {matches.map((customer,index)=><button id={`quote-customer-option-${customer.id}`} type="button" role="option" aria-selected={index===activeIndex} className={index===activeIndex?'active':''} key={customer.id} onPointerDown={(event)=>event.preventDefault()} onClick={()=>choose(customer)}>
          <span className="quote-customer-avatar">{customer.name?.trim().slice(0,1).toLocaleUpperCase('es')||<UserRound size={14}/>}</span>
          <span><b>{customer.name}</b><small>{[customer.phone,customer.email,customer.documentReference].filter(Boolean).join(' · ')||'Sin datos de contacto'}</small></span>
          {customer.id===customerId&&<Check size={15}/>}
        </button>)}
        {value.trim().length>=2&&matches.length===0&&<p>No hay coincidencias. Se guardará como nombre libre; puedes crear su ficha después.</p>}
        {value.trim().length<2&&customers.length>0&&<p>Clientes recientes · empieza a escribir para filtrar</p>}
        {customers.length===0&&<p>No hay fichas disponibles para este perfil. Puedes escribir el nombre y teléfono manualmente.</p>}
      </div>}
    </div>
    {selected&&<div className="quote-customer-selected"><span><Check size={14}/></span><div><b>Ficha vinculada</b><small>{[selected.phone,selected.email,selected.documentReference].filter(Boolean).join(' · ')||'Cliente registrado'}</small></div><button type="button" onClick={()=>choose(null)}>Cambiar</button></div>}
  </div>;
}
