import React, { useMemo, useState } from 'react';
import { Check, LoaderCircle, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { useSite } from '../store';
import { buildQuoteWhatsAppMessage, buildWhatsAppUrl, resolveQuoteWhatsAppRoute } from '../lib/whatsapp';

const cleanItems = (items = []) => items.map((item) => ({
  productId: item.productId || item.id || null,
  name: item.name || item.productName || 'Producto',
  category: item.category || 'General',
  quantity: Number(item.quantity || 1),
  price: Number(item.price || item.unitPrice || 0),
  total: Number(item.total ?? item.totalPrice ?? (Number(item.price || item.unitPrice || 0) * Number(item.quantity || 1))),
  variant: item.variant || item.description || '',
  quoteBreakdown: item.quoteBreakdown || null,
}));

export function QuoteRequestDialog({ open, onClose, items = [], totals = {}, source = 'cotizador' }) {
  const { data, saveQuoteRequest, notify } = useSite();
  const [form, setForm] = useState({ name: '', phone: '', city: '', email: '', company: '', notes: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const normalizedItems = useMemo(() => cleanItems(items), [items]);
  const destination = useMemo(() => resolveQuoteWhatsAppRoute(data.settings, normalizedItems), [data.settings, normalizedItems]);

  if (!open) return null;

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.city.trim()) {
      setError('Completa nombre, WhatsApp y ciudad o sector.');
      return;
    }
    if (!destination?.number) {
      setError('Gigaprint todavía no ha configurado un número de WhatsApp para cotizaciones.');
      return;
    }

    setSending(true);
    setError('');
    const localReference = `GIGA-WEB-${Date.now().toString().slice(-8)}`;
    const payload = {
      customerName: form.name.trim(),
      customerPhone: form.phone.trim(),
      customerCity: form.city.trim(),
      customerEmail: form.email.trim(),
      customerCompany: form.company.trim(),
      items: normalizedItems,
      subtotal: Number(totals.subtotal || 0),
      taxRate: Number(totals.taxRate || 0),
      taxAmount: Number(totals.taxAmount || 0),
      total: Number(totals.total || 0),
      notes: form.notes.trim(),
      source,
      destinationWhatsapp: destination.number,
      destinationLabel: destination.label,
    };
    const saved = await saveQuoteRequest(payload);
    const reference = saved?.quote_number || saved?.quoteNumber || localReference;
    const message = buildQuoteWhatsAppMessage({
      reference,
      customer: form,
      items: normalizedItems,
      subtotal: payload.subtotal,
      taxRate: payload.taxRate,
      taxAmount: payload.taxAmount,
      total: payload.total,
      notes: payload.notes,
      settings: data.settings,
    });
    const url = buildWhatsAppUrl(destination.number, message);
    notify(saved ? `Solicitud ${reference} guardada. Abriendo WhatsApp…` : 'Abriendo WhatsApp. Conserva el mensaje para seguimiento.');
    setSending(false);
    window.location.assign(url);
  };

  return (
    <div className="quote-request-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className="quote-request-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-request-title">
        <button type="button" className="quote-request-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        <div className="quote-request-icon"><MessageCircle size={24} /></div>
        <span className="eyebrow orange">Último paso</span>
        <h2 id="quote-request-title">Envía tu cotización a Gigaprint</h2>
        <p>Guardaremos la solicitud y prepararemos el mensaje para el equipo de <b>{destination?.label || 'Ventas'}</b>.</p>
        <form onSubmit={submit} className="quote-request-form">
          <div className="quote-request-fields">
            <label>Nombre y apellido *<input value={form.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" /></label>
            <label>WhatsApp *<input value={form.phone} onChange={(event) => update('phone', event.target.value)} inputMode="tel" autoComplete="tel" placeholder="09…" /></label>
            <label>Ciudad / sector *<input value={form.city} onChange={(event) => update('city', event.target.value)} autoComplete="address-level2" /></label>
            <label>Correo (opcional)<input value={form.email} onChange={(event) => update('email', event.target.value)} type="email" autoComplete="email" /></label>
            <label>Empresa (opcional)<input value={form.company} onChange={(event) => update('company', event.target.value)} autoComplete="organization" /></label>
            <label className="wide">Observaciones (opcional)<textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} rows="3" placeholder="Fecha deseada, instalación, referencias…" /></label>
          </div>
          {error && <div className="quote-request-error">{error}</div>}
          <div className="quote-request-assurance"><ShieldCheck size={17} /><span>La solicitud queda registrada antes de abrir WhatsApp.</span></div>
          <button type="submit" className="button button-primary quote-request-submit" disabled={sending}>
            {sending ? <><LoaderCircle className="spin" size={18} /> Guardando…</> : <><Check size={18} /> Guardar y abrir WhatsApp</>}
          </button>
        </form>
      </section>
    </div>
  );
}
