import React, { useMemo, useState } from 'react';
import { ArrowUpRight, BadgeCheck, Building2, Clock3, Mail, MessageCircle, Phone, Search, UserRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatMoney } from '../../../app/workspace';
import { Avatar } from '../../../components/ui/Avatar';

type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  documentReference?: string;
  notes?: string;
  preferences?: Record<string, unknown>;
  tags?: string[];
};

type RecentPurchase = { id: string; code?: string; total: number; date: string; description?: string };
type CustomerHistorySummary = { netSpent: number; netPaid: number; refunded: number; balanceDue: number; lastPurchaseAt?: string; topProducts: { name: string; quantity: number }[] };

type Props = {
  customers: Customer[];
  remoteMatches: Customer[] | null;
  searchingCustomers: boolean;
  searchError: string;
  onRetrySearch: () => void;
  canShowMore: boolean;
  onShowMore: () => void;
  selectedCustomer: Customer | undefined;
  duplicateCustomer?: Customer;
  customerName: string;
  onNewNameChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (customer: Customer | null) => void;
  phone: string;
  email: string;
  documentReference: string;
  onContactChange: (field: 'phone' | 'email' | 'documentReference', value: string) => void;
  canViewSales: boolean;
  historyLoading: boolean;
  historyCount: number;
  historySummary: CustomerHistorySummary | null;
  recentPurchases: RecentPurchase[];
  onOpenPurchase?: (purchase: RecentPurchase) => void;
};

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeEcuadorPhone = (value: unknown) => {
  const valueDigits = digits(value);
  if (!valueDigits.startsWith('593')) return valueDigits;
  return `0${valueDigits.slice(3).replace(/^0/, '')}`;
};
const whatsappHref = (customer: Customer) => {
  const value = digits(customer.phone);
  const number = value.startsWith('593') ? value : value.startsWith('0') ? `593${value.slice(1)}` : `593${value}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(`Hola ${customer.name}, te saluda Visual Corp. Estamos dando seguimiento a tu pedido.`)}`;
};

export function POSCustomerPicker({ customers, remoteMatches, searchingCustomers, searchError, onRetrySearch, canShowMore, onShowMore, selectedCustomer, duplicateCustomer, customerName, onNewNameChange, query, onQueryChange, onSelect, phone, email, documentReference, onContactChange, canViewSales, historyLoading, historyCount, historySummary, recentPurchases, onOpenPurchase }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = normalize(query);
  const matched = useMemo(() => {
    if (remoteMatches !== null) return remoteMatches.slice(0, 20);
    const terms = [normalizedQuery, normalize(phone), normalize(email), normalize(documentReference)].filter((term) => term.length >= 2);
    if (!terms.length) return customers.slice(0, 6);
    const queryDigits = digits(query);
    const queryPhone = normalizeEcuadorPhone(queryDigits);
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return customers.map((customer) => {
      const name = normalize(customer.name);
      const phoneValue = normalizeEcuadorPhone(customer.phone);
      const documentValue = digits(customer.documentReference);
      const fields = [name, normalize(customer.phone), normalize(customer.email), normalize(customer.documentReference), normalize(customer.notes), ...(customer.tags || []).map(normalize)];
      const allNameTokensMatch = queryTokens.length > 1 && queryTokens.every((token) => name.includes(token));
      const phoneMatches = queryPhone.length >= 3 && phoneValue.includes(queryPhone);
      const documentMatches = queryDigits.length >= 4 && documentValue.includes(queryDigits);
      const found = terms.some((term) => fields.some((field) => field.includes(term))) || allNameTokensMatch || phoneMatches || documentMatches;
      const rank = name === normalizedQuery || normalize(customer.email) === normalizedQuery || documentValue === queryDigits || (queryPhone.length >= 7 && phoneValue === queryPhone) ? 0 : name.startsWith(normalizedQuery) || (queryPhone.length >= 3 && phoneValue.startsWith(queryPhone)) || (queryDigits.length >= 4 && documentValue.startsWith(queryDigits)) ? 1 : 2;
      return { customer, found, rank };
    }).filter((entry) => entry.found).sort((a, b) => a.rank - b.rank || a.customer.name.localeCompare(b.customer.name, 'es')).slice(0, 8).map((entry) => entry.customer);
  }, [customers, remoteMatches, normalizedQuery, query, phone, email, documentReference]);
  const hasLookupTerm = Boolean(query.trim() || phone.trim() || email.trim() || documentReference.trim());

  const choose = (customer: Customer) => {
    onSelect(customer);
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index < 0 ? 0 : index + 1, Math.max(0, matched.length - 1))); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((index) => index < 0 ? Math.max(0, matched.length - 1) : Math.max(0, index - 1)); }
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && open && matched[activeIndex]) { event.preventDefault(); choose(matched[activeIndex]); }
  };

  const changeQuery = (value: string) => {
    onQueryChange(value);
    setActiveIndex(-1);
    setOpen(true);
  };

  return <section className="pos-customer-picker" aria-label="Cliente de la venta">
    <div className="pos-customer-picker-heading"><span><UserRound size={15}/> Cliente</span><small>Opcional · busca antes de crear uno nuevo</small></div>
    <div className="pos-customer-search-wrap">
      <Search size={17} aria-hidden="true"/>
      <input
        role="combobox"
        aria-label="Buscar cliente por nombre, teléfono, correo o identificación"
        aria-expanded={open}
        aria-controls="pos-customer-results"
        aria-activedescendant={open && activeIndex >= 0 && matched[activeIndex] ? `pos-customer-option-${matched[activeIndex].id}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(event) => changeQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={(event) => { if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
        placeholder="Nombre, teléfono, correo o cédula/RUC"
      />
      {query && <button type="button" className="pos-customer-clear" aria-label="Limpiar búsqueda de cliente" onClick={() => { changeQuery(''); onSelect(null); }}><X size={15}/></button>}
      {open && <div className="pos-customer-results" id="pos-customer-results" role="listbox" aria-label="Clientes encontrados" aria-live="polite">
        {matched.map((customer, index) => <button id={`pos-customer-option-${customer.id}`} type="button" role="option" tabIndex={-1} aria-selected={index === activeIndex} className={`pos-customer-result${index === activeIndex ? ' active' : ''}`} key={customer.id} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(customer)}>
          <Avatar name={customer.name || 'Cliente'} src={customer.avatarUrl} size="sm" badge={customer.avatarUrl ? <span className="vc-google-avatar-mark">G</span> : undefined} />
          <span className="pos-customer-result-copy"><b>{customer.name}</b><small>{[customer.phone, customer.email, customer.documentReference].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small></span>
          {customer.tags?.length ? <span className="pos-customer-result-tag">{customer.tags[0]}</span> : null}
        </button>)}
        {searchingCustomers && <div className="pos-customer-result-hint">Buscando coincidencias en la base completa…</div>}
        {searchError && <div className="pos-customer-search-error" role="alert"><span>{matched.length ? 'No se pudo consultar el directorio completo. Estas son coincidencias entre los clientes cargados; selecciona una existente o reintenta.' : 'No se pudo consultar el directorio completo. Reintenta antes de registrar un cliente nuevo.'}</span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={onRetrySearch}>Reintentar</button></div>}
        {!searchingCustomers && !searchError && hasLookupTerm && matched.length === 0 && <div className="pos-customer-no-match"><b>No encontramos coincidencias.</b><span>Completa los datos para registrar un cliente nuevo.</span></div>}
        {!hasLookupTerm && customers.length === 0 && <div className="pos-customer-no-match"><b>Directorio no disponible</b><span>Comprueba el permiso de clientes o escribe los datos para asociarlos a la venta.</span></div>}
        {canShowMore && !searchingCustomers && <button type="button" className="pos-customer-show-more" onPointerDown={(event) => event.preventDefault()} onClick={onShowMore}>Mostrar más coincidencias</button>}
        {matched.length > 0 && <div className="pos-customer-result-hint">Usa ↑ ↓ y Enter para elegir</div>}
      </div>}
    </div>

    {duplicateCustomer && !selectedCustomer && <div className="pos-customer-duplicate" role="alert"><b>Posible cliente duplicado: {duplicateCustomer.name}</b><span>Coincide el teléfono, correo o identificación. Asocia la venta al registro existente para conservar su historial.</span><button type="button" onClick={() => choose(duplicateCustomer)}>Usar este cliente</button></div>}
    {selectedCustomer ? <div className="pos-customer-selected">
      <div className="pos-customer-selected-top"><Avatar name={selectedCustomer.name || 'Cliente'} src={selectedCustomer.avatarUrl} size="md" badge={selectedCustomer.avatarUrl ? <span className="vc-google-avatar-mark">G</span> : undefined}/><span className="pos-customer-selected-icon"><BadgeCheck size={18}/></span><span className="pos-customer-selected-name"><b>{selectedCustomer.name}</b><small>Cliente asociado a esta venta</small></span><button type="button" className="pos-customer-change" onClick={() => { onSelect(null); setOpen(true); }}>Cambiar</button></div>
      <div className="pos-customer-contact-row">{selectedCustomer.phone && <a href={`tel:${selectedCustomer.phone}`}><Phone size={13}/>{selectedCustomer.phone}</a>}{selectedCustomer.email && <a href={`mailto:${selectedCustomer.email}`}><Mail size={13}/>{selectedCustomer.email}</a>}{selectedCustomer.documentReference && <span><Building2 size={13}/>CI/RUC {selectedCustomer.documentReference}</span>}</div>
      {selectedCustomer.phone && <div className="pos-customer-actions"><a className="pos-customer-whatsapp" href={whatsappHref(selectedCustomer)} target="_blank" rel="noreferrer"><MessageCircle size={14}/> Abrir WhatsApp</a></div>}
      {selectedCustomer.tags?.length ? <div className="pos-customer-tags">{selectedCustomer.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      {String(selectedCustomer.preferences?.interests || '').trim() && <p className="pos-customer-interest">Preferencias: {String(selectedCustomer.preferences?.interests)}</p>}
      <div className="pos-customer-history">
        <div className="pos-customer-history-heading"><span><Clock3 size={14}/> Compras recientes</span>{canViewSales && <small>{historyLoading ? 'Consultando…' : `${historyCount} registrada${historyCount === 1 ? '' : 's'}`}</small>}</div>
        {!canViewSales ? <small className="pos-customer-history-empty">Tu perfil no permite consultar el historial comercial.</small> : historyLoading ? <small className="pos-customer-history-empty">Cargando historial…</small> : recentPurchases.length ? recentPurchases.map((sale) => <button type="button" className="pos-customer-purchase" key={sale.id} onClick={() => onOpenPurchase?.(sale)} aria-label={`Abrir ficha completa de ${sale.code || 'la compra'}`}><span><b>{sale.description || sale.code || 'Compra'}</b><small>{formatDate(sale.date)}</small></span><strong>{formatMoney(sale.total)}</strong><em>Ver ficha</em></button>) : <small className="pos-customer-history-empty">Aún no tiene compras confirmadas.</small>}
        {canViewSales && !historyLoading && historySummary && <>
          <div className="pos-customer-lifetime" aria-label="Resumen de compras del cliente">
            <div><small>Acumulado neto</small><b>{formatMoney(historySummary.netSpent)}</b></div>
            <div><small>Abonado neto</small><b>{formatMoney(historySummary.netPaid)}</b></div>
            <div><small>Saldo por cobrar</small><b>{formatMoney(historySummary.balanceDue)}</b></div>
          </div>
          {historySummary.refunded > 0 && <small className="pos-customer-refund-note">Reembolsos completados: {formatMoney(historySummary.refunded)}</small>}
          {historySummary.topProducts.length > 0 && <div className="pos-customer-favorites"><small>Compra con más frecuencia</small><div>{historySummary.topProducts.map((product) => <span key={product.name}>{product.name} <b>× {product.quantity}</b></span>)}</div></div>}
          {historySummary.lastPurchaseAt && <small className="pos-customer-last-purchase">Última compra: {formatDate(historySummary.lastPurchaseAt)}</small>}
        </>}
      </div>
      <Link className="pos-customer-profile-link" to={`/operaciones/clientes?cliente=${encodeURIComponent(selectedCustomer.id)}`}>Abrir ficha completa <ArrowUpRight size={13}/></Link>
    </div> : <div className="pos-customer-new">
      <p>{searchError ? 'No se pudo comprobar toda la base de clientes. Selecciona una coincidencia cargada o reintenta; no registres como nuevo hasta completar la búsqueda.' : query.trim() ? 'Si es un cliente nuevo, completa sus datos y se guardarán junto con la venta. Si ya existe, selecciónalo en los resultados para conservar su historial.' : 'Busca un cliente existente o deja los datos vacíos para una venta de mostrador.'}</p>
      {query.trim() && <div className="pos-customer-new-fields">
        <label>Nombre o razón social<input autoComplete="name" value={customerName} onChange={(event) => onNewNameChange(event.target.value)} placeholder="Nombre del cliente"/></label>
        <label>Teléfono<input type="tel" autoComplete="tel" value={phone} onChange={(event) => onContactChange('phone', event.target.value)} placeholder="09…"/></label>
        <label>Correo<input type="email" autoComplete="email" value={email} onChange={(event) => onContactChange('email', event.target.value)} placeholder="cliente@correo.com"/></label>
        <label>Documento / RUC<input inputMode="numeric" value={documentReference} onChange={(event) => onContactChange('documentReference', event.target.value)} placeholder="Opcional"/></label>
      </div>}
    </div>}
  </section>;
}
