import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertCircle,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  MapPin,
  Package,
  Wallet,
  Edit3,
  Printer,
  Plus,
  Trash2,
  Save,
  Loader2,
  X,
  CheckCircle2
} from 'lucide-react';
import { useWorkspace, formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { Spinner } from './ui/OperationalKit';
import './commercial-document-details.css';
import './commercial-quote-detail.css';
import { CommercialAssetsGallery } from './commercial/CommercialAssetsGallery';
import { GoogleMapsPreview } from './commercial/GoogleMapsPreview';
import { RichTextContent } from './commercial/RichTextContent';

export type CommercialDocumentKind = 'quote' | 'sale';

type Props = {
  kind: CommercialDocumentKind;
  documentId: string;
  initialDocument?: Record<string, any> | null;
  compact?: boolean;
  onAmended?: () => void;
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const valueAsNumber = Number(value);
  return Number.isFinite(valueAsNumber) ? valueAsNumber : null;
};

const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium' }).format(new Date(value))
  : '—';

const quoteTier = (value?: string | null) => ({
  normal: 'Normal', pvp: 'Normal', installation: 'Con instalación', instalacion: 'Con instalación',
  corporate: 'Corporativo', corporativo: 'Corporativo',
} as Record<string, string>)[String(value || '').toLowerCase()] || 'Sin tarifa seleccionada';

const quoteTierKey = (value?: string | null) => ({
  normal: 'normal_total', pvp: 'normal_total', installation: 'installation_total', instalacion: 'installation_total',
  corporate: 'corporate_total', corporativo: 'corporate_total',
} as Record<string, string>)[String(value || '').toLowerCase()] || 'normal_total';

const statusLabel = (value?: string | null) => ({
  draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', expired: 'Vencida', converted: 'Convertida',
  confirmed: 'Confirmada', cancelled: 'Anulada',
} as Record<string, string>)[String(value || '').toLowerCase()] || value || 'Sin estado';

const paymentLabel = (value?: string | null) => ({
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro',
} as Record<string, string>)[String(value || '').toLowerCase()] || value || 'Otro';

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function optionalMoney(record: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = numberOrNull(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function imageFromProduct(product: Record<string, any> | undefined) {
  if (!product) return '';
  const image = typeof product.image === 'string' ? product.image : typeof product.image_url === 'string' ? product.image_url : '';
  if (image) return image;
  const images = Array.isArray(product.images) ? product.images : [];
  const first = images.find((item: any) => typeof item === 'string' && item.trim()) || images.find((item: any) => typeof item?.url === 'string')?.url;
  return typeof first === 'string' ? first : '';
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="commercial-detail-meta"><dt>{label}</dt><dd>{value || '—'}</dd></div>;
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className={`commercial-detail-image${!src || failed ? ' is-empty' : ''}`}>
    {src && !failed ? <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <><ImageIcon size={20}/><span>Imagen no disponible</span></>}
  </div>;
}

export function CommercialDocumentDetails({ kind, documentId, initialDocument, compact = false, onAmended }: Props) {
  const { organizationId, hasPermission } = useAuth();
  const { data } = useWorkspace();
  const [document, setDocument] = useState<Record<string, any> | null>(initialDocument || null);
  const [loading, setLoading] = useState(!initialDocument);
  const [error, setError] = useState('');
  const products = useMemo(() => new Map<string, any>((data.catalog || []).map((product: any) => [String(product.id), product])), [data.catalog]);

  const isQuote = kind === 'quote';
  const canEdit = hasPermission(isQuote ? 'quotes' : 'sales', 'edit');

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Sale editable form state
  const [saleCustomerName, setSaleCustomerName] = useState('');
  const [saleCustomerPhone, setSaleCustomerPhone] = useState('');
  const [saleLines, setSaleLines] = useState<Array<{
    id?: string;
    description_snapshot: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    sku_snapshot?: string;
    catalog_product_id?: string;
    variant_id?: string;
  }>>([]);
  const [saleDiscount, setSaleDiscount] = useState<number>(0);
  const [saleDiscountReason, setSaleDiscountReason] = useState<string>('');
  const [saleNote, setSaleNote] = useState<string>('');
  const [salePayments, setSalePayments] = useState<Array<{
    id?: string;
    method: string;
    amount: number;
    reference: string;
    note?: string;
  }>>([]);
  const [amendmentReason, setAmendmentReason] = useState<string>('Ajuste comercial confirmado');

  // Quote editable form state
  const [quoteCustomerName, setQuoteCustomerName] = useState('');
  const [quoteCustomerPhone, setQuoteCustomerPhone] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [quotePriceConfirmed, setQuotePriceConfirmed] = useState(false);
  const [quoteItems, setQuoteItems] = useState<Array<{
    id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    description?: string;
  }>>([]);

  const fetchDocument = useCallback(async () => {
    if (!supabase || !organizationId || !documentId) return;
    try {
      const result = isQuote
        ? await supabase.from('central_quotes').select('*').eq('organization_id', organizationId).eq('id', documentId).maybeSingle()
        : await supabase.from('sales').select('*,branches(name),customers(full_name,phone),sale_lines(id,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,returned_quantity,unit_price,line_total,catalog_product_id,variant_id),sale_payments(id,method,amount,reference,note,created_at),sale_fulfillment_details(installation_required,installation_address,installation_maps_url,installation_latitude,installation_longitude,installation_estimated_at,delivery_due_at)').eq('organization_id', organizationId).eq('id', documentId).maybeSingle();
      if (result.error) throw result.error;
      if (result.data) {
        setDocument(result.data);
      }
    } catch (cause: any) {
      console.error('Error fetching document:', cause);
    }
  }, [isQuote, organizationId, documentId]);

  useEffect(() => {
    let active = true;
    setDocument(initialDocument || null);
    setError('');
    if (initialDocument) {
      setLoading(false);
      return () => { active = false; };
    }
    if (!supabase || !organizationId || !documentId) {
      setLoading(false);
      setError('No se pudo iniciar la consulta de esta ficha.');
      return () => { active = false; };
    }

    setLoading(true);
    void (async () => {
      try {
        const result = isQuote
          ? await supabase.from('central_quotes').select('*').eq('organization_id', organizationId).eq('id', documentId).maybeSingle()
          : await supabase.from('sales').select('*,branches(name),customers(full_name,phone),sale_lines(id,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,returned_quantity,unit_price,line_total,catalog_product_id,variant_id),sale_payments(id,method,amount,reference,note,created_at),sale_fulfillment_details(installation_required,installation_address,installation_maps_url,installation_latitude,installation_longitude,installation_estimated_at,delivery_due_at)').eq('organization_id', organizationId).eq('id', documentId).maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) throw new Error('No se encontró la ficha o tu perfil no tiene acceso a ella.');
        if (active) setDocument(result.data);
      } catch (cause: any) {
        if (active) setError(cause?.message || 'No se pudieron cargar los detalles del registro.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isQuote, documentId, organizationId, initialDocument]);

  const startEditing = useCallback(() => {
    if (!document) return;
    setEditError('');
    setSaveSuccessNotice(false);

    if (isQuote) {
      setQuoteCustomerName(document.customer_name || '');
      setQuoteCustomerPhone(document.customer_phone || '');
      setQuoteNotes(document.notes || '');
      setQuoteStatus(document.status || 'draft');
      setQuotePriceConfirmed(Boolean(document.price_confirmed));
      const items = Array.isArray(document.items) ? document.items : [];
      setQuoteItems(items.map((it: any, index: number) => ({
        id: it.id || `quote-item-${index}`,
        name: it.name || it.product_name || `Artículo ${index + 1}`,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        total: Number(it.total) || (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
        description: it.description || '',
      })));
    } else {
      const cust = relation(document.customers);
      setSaleCustomerName(cust?.full_name || '');
      setSaleCustomerPhone(cust?.phone || '');
      const lines = Array.isArray(document.sale_lines) ? document.sale_lines : [];
      setSaleLines(lines.map((l: any, index: number) => ({
        id: l.id,
        description_snapshot: l.description_snapshot || `Artículo ${index + 1}`,
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        line_total: Number(l.line_total) || (Number(l.quantity) || 1) * (Number(l.unit_price) || 0),
        sku_snapshot: l.sku_snapshot || '',
        catalog_product_id: l.catalog_product_id || '',
        variant_id: l.variant_id || '',
      })));
      setSaleDiscount(Number(document.discount_total) || 0);
      setSaleDiscountReason(document.discount_reason || '');
      setSaleNote(document.note || '');
      const pays = Array.isArray(document.sale_payments) ? document.sale_payments : [];
      setSalePayments(pays.map((p: any) => ({
        id: p.id,
        method: p.method || 'cash',
        amount: Number(p.amount) || 0,
        reference: p.reference || '',
        note: p.note || '',
      })));
      setAmendmentReason('Ajuste comercial en ficha');
    }
    setIsEditing(true);
  }, [document, isQuote]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditError('');
  }, []);

  // Live calculations during editing
  const liveEditSaleSubtotal = useMemo(() => {
    return saleLines.reduce((sum, l) => sum + ((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)), 0);
  }, [saleLines]);

  const liveEditSaleTotal = useMemo(() => {
    const disc = Number(saleDiscount) || 0;
    const tax = Number(document?.tax_amount) || 0;
    const ship = Number(document?.shipping_cost) || 0;
    return Math.max(0, Math.round((liveEditSaleSubtotal - disc + tax + ship) * 100) / 100);
  }, [liveEditSaleSubtotal, saleDiscount, document]);

  const liveEditSalePaid = useMemo(() => {
    return salePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [salePayments]);

  const liveEditSaleBalance = useMemo(() => {
    return Math.max(0, Math.round((liveEditSaleTotal - liveEditSalePaid) * 100) / 100);
  }, [liveEditSaleTotal, liveEditSalePaid]);

  const liveEditQuoteTotal = useMemo(() => {
    return quoteItems.reduce((sum, it) => sum + ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0);
  }, [quoteItems]);

  const handleSaveSale = async () => {
    if (!supabase || !document) return;
    setSaving(true);
    setEditError('');
    try {
      if (!saleLines.length) {
        throw new Error('La venta debe tener al menos una línea de producto o servicio.');
      }
      const p_lines = saleLines.map((l, index) => {
        const qty = Number(l.quantity) || 1;
        const price = Number(l.unit_price) || 0;
        return {
          id: l.id,
          sku_snapshot: l.sku_snapshot || `ART-${index + 1}`,
          description_snapshot: l.description_snapshot.trim() || `Artículo ${index + 1}`,
          quantity: qty,
          unit_price: price,
          line_total: Math.round(qty * price * 100) / 100,
          catalog_product_id: l.catalog_product_id || null,
          variant_id: l.variant_id || null,
        };
      });

      const p_payments = salePayments.map((p) => ({
        id: p.id,
        method: p.method || 'cash',
        amount: Number(p.amount) || 0,
        reference: p.reference?.trim() || '',
        note: p.note?.trim() || '',
      }));

      const { error: rpcError } = await supabase.rpc('amend_confirmed_pos_sale', {
        p_sale_id: document.id,
        p_customer_id: document.customer_id || null,
        p_customer_data: {
          full_name: saleCustomerName.trim() || 'Cliente General',
          phone: saleCustomerPhone.trim() || '',
        },
        p_discount: Number(saleDiscount) || 0,
        p_discount_reason: saleDiscountReason.trim(),
        p_note: saleNote.trim(),
        p_lines,
        p_payments,
        p_amendment_reason: amendmentReason.trim() || 'Ajuste comercial confirmado',
      });

      if (rpcError) throw rpcError;

      await fetchDocument();
      setIsEditing(false);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 4000);
      onAmended?.();
    } catch (err: any) {
      setEditError(err?.message || 'Error al guardar los cambios de la venta.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQuote = async () => {
    if (!supabase || !document) return;
    setSaving(true);
    setEditError('');
    try {
      if (!quoteItems.length) {
        throw new Error('La cotización debe tener al menos un artículo.');
      }
      const updatedItems = quoteItems.map((it, index) => {
        const qty = Number(it.quantity) || 1;
        const price = Number(it.unit_price) || 0;
        return {
          ...it,
          name: it.name.trim() || `Artículo ${index + 1}`,
          quantity: qty,
          unit_price: price,
          total: Math.round(qty * price * 100) / 100,
        };
      });

      const newTotal = updatedItems.reduce((sum, it) => sum + it.total, 0);

      const { error: quoteUpdateError } = await supabase
        .from('central_quotes')
        .update({
          customer_name: quoteCustomerName.trim() || 'Cliente General',
          customer_phone: quoteCustomerPhone.trim() || '',
          notes: quoteNotes.trim(),
          status: quoteStatus,
          price_confirmed: quotePriceConfirmed,
          items: updatedItems,
          selected_total: newTotal,
          total_normal: newTotal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (quoteUpdateError) throw quoteUpdateError;

      await fetchDocument();
      setIsEditing(false);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 4000);
      onAmended?.();
    } catch (err: any) {
      setEditError(err?.message || 'Error al guardar la cotización.');
    } finally {
      setSaving(false);
    }
  };

  const firstQuoteItem = isQuote && Array.isArray(document?.items) ? document.items[0] : null;
  const embeddedQuoteDetails = firstQuoteItem?.document_details && typeof firstQuoteItem.document_details === 'object' ? firstQuoteItem.document_details : {};
  const quoteDetails = isQuote && document?.document_details && typeof document.document_details === 'object' ? document.document_details : embeddedQuoteDetails;
  const quoteFinancial = quoteDetails.financial && typeof quoteDetails.financial === 'object' ? quoteDetails.financial : {};

  const lineRows = useMemo(() => {
    if (!document) return [];
    const rows = isQuote
      ? (Array.isArray(document.items) ? document.items : []).map((line: any, index: number) => {
        const product = products.get(String(line.product_id));
        const lineTotal = numberOrNull(line.total) ?? numberOrNull(line[quoteTierKey(document.chosen_tier)]);
        const billedQuantity = numberOrNull(line.quantity);
        const pieceQuantity = numberOrNull(line.piece_quantity);
        const isMeasuredArea = Boolean(product?.mode === 'area' || (line.width_cm && line.height_cm));
        const lineUnit = line.unit || (product?.mode === 'area' ? 'm²' : product?.unit || 'unidad');
        return {
          key: String(line.id || `${line.product_id || 'quote'}-${index}`),
          title: line.name || line.product_name || product?.name || `Artículo ${index + 1}`,
          description: line.description || line.additional_description || product?.description || '',
          category: line.category || product?.family || (line.custom ? 'Concepto libre' : ''),
          image: (typeof line.image === 'string' && line.image) || imageFromProduct(product),
          sku: line.sku || '',
          quantity: pieceQuantity ?? billedQuantity,
          billedQuantity,
          unit: pieceQuantity !== null && isMeasuredArea ? 'piezas' : lineUnit,
          billedUnit: lineUnit,
          showBilledQuantity: pieceQuantity !== null && isMeasuredArea && billedQuantity !== null,
          unitPrice: numberOrNull(line.unit_price) ?? (lineTotal !== null && billedQuantity ? lineTotal / billedQuantity : null),
          lineTotal,
          discount: numberOrNull(line.discount_amount),
          taxAmount: numberOrNull(line.tax_amount),
          shipping: numberOrNull(line.shipping_share),
          measurement: line.width_cm && line.height_cm ? `${line.width_cm} × ${line.height_cm} cm por pieza` : '',
          option: line.option || '',
          estimated: !document.price_confirmed,
          fulfilled: null,
          backordered: null,
          returned: null,
        };
      })
      : (Array.isArray(document.sale_lines) ? document.sale_lines : []).map((line: any, index: number) => {
        const product = products.get(String(line.catalog_product_id));
        const quantity = numberOrNull(line.quantity);
        return {
          key: String(line.id || index),
          title: line.description_snapshot || product?.name || `Artículo ${index + 1}`,
          description: line.description_snapshot || '',
          category: product?.family || '',
          image: imageFromProduct(product),
          sku: line.sku_snapshot || product?.sku || '',
          quantity,
          billedQuantity: quantity,
          unit: product?.unit || 'unidad',
          billedUnit: product?.unit || 'unidad',
          showBilledQuantity: false,
          unitPrice: numberOrNull(line.unit_price),
          lineTotal: numberOrNull(line.line_total),
          measurement: '',
          option: '',
          estimated: false,
          fulfilled: numberOrNull(line.fulfilled_quantity),
          backordered: numberOrNull(line.backordered_quantity),
          returned: numberOrNull(line.returned_quantity),
        };
      });
    return rows;
  }, [document, isQuote, products]);

  const lineSubtotal = lineRows.length && lineRows.every((line: any) => line.lineTotal !== null)
    ? lineRows.reduce((sum: number, line: any) => sum + Number(line.lineTotal || 0), 0)
    : null;
  const quoteTotal = isQuote ? numberOrNull(document?.selected_total) ?? numberOrNull(quoteFinancial.total) ?? lineSubtotal : null;
  const quoteSubtotal = isQuote ? numberOrNull(quoteFinancial.subtotal) ?? lineSubtotal : null;
  const quoteDiscount = isQuote ? numberOrNull(quoteFinancial.discount_amount) : null;
  const quoteShipping = isQuote ? numberOrNull(quoteFinancial.shipping_cost) : null;
  const saleTotal = !isQuote ? numberOrNull(document?.total) : null;
  const saleSubtotal = !isQuote ? numberOrNull(document?.subtotal) ?? lineSubtotal : null;
  const discount = !isQuote ? numberOrNull(document?.discount_total) : null;
  const saleShipping = !isQuote ? numberOrNull(document?.shipping_cost) : null;
  const taxAmount = document ? optionalMoney(document, ['iva_amount', 'iva_total', 'vat_amount', 'vat_total', 'tax_amount', 'tax_total']) ?? (isQuote ? numberOrNull(quoteFinancial.iva_amount) : null) : null;
  const taxRate = document ? optionalMoney(document, ['iva_rate', 'vat_rate', 'tax_rate']) ?? (isQuote ? numberOrNull(quoteFinancial.iva_rate) : null) : null;
  const payments = !isQuote && Array.isArray(document?.sale_payments) ? document.sale_payments : [];
  const paid = payments.reduce((sum: number, payment: any) => sum + (numberOrNull(payment.amount) || 0), 0);
  const balance = saleTotal === null ? null : Math.max(0, saleTotal - paid);
  const fulfillment = !isQuote ? relation(document?.sale_fulfillment_details) : null;
  const customer = !isQuote ? relation(document?.customers) : null;
  const branch = !isQuote ? relation(document?.branches) : null;
  const selectedTierKey = quoteTierKey(document?.chosen_tier);
  const tierTotals = isQuote ? [
    { label: 'Normal', value: numberOrNull(document?.total_normal), active: selectedTierKey === 'normal_total' },
    { label: 'Con instalación', value: numberOrNull(document?.total_installation), active: selectedTierKey === 'installation_total' },
    { label: 'Corporativo', value: numberOrNull(document?.total_corporate), active: selectedTierKey === 'corporate_total' },
  ] : [];

  if (loading) return <div className="commercial-detail-state"><Spinner label="Cargando ficha completa…"/></div>;
  if (error) return <div className="commercial-detail-state is-error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>;
  if (!document) return <div className="commercial-detail-state">No hay información disponible para mostrar.</div>;

  const code = isQuote ? document.quote_code : document.sale_code;
  const customerName = isQuote ? document.customer_name || 'Sin cliente' : customer?.full_name || 'Sin cliente';
  const createdAt = document.created_at;
  const taxLabel = isQuote && quoteDetails.version && !quoteFinancial.iva_applied
    ? 'No aplicado a esta cotización.'
    : taxAmount === null ? 'No se guardó el desglose de IVA en este registro.' : `${taxRate !== null ? `IVA ${taxRate}%` : 'IVA registrado'} · ${formatMoney(taxAmount)}`;

  return (
    <div className={`commercial-detail${compact ? ' is-compact' : ''}`}>
      {/* Top action toolbar during edit mode */}
      {isEditing && (
        <section className="commercial-edit-bar" aria-label="Controles de edición">
          <div className="commercial-edit-bar-info">
            <Edit3 size={16} />
            <div>
              <strong>Modo de edición completa activo</strong>
              <span>Ajusta cliente, artículos, precios, observaciones y cobros en tiempo real.</span>
            </div>
          </div>
          <div className="commercial-edit-bar-actions">
            <button
              type="button"
              className="commercial-edit-btn is-cancel"
              onClick={cancelEditing}
              disabled={saving}
            >
              <X size={14} /> Cancelar
            </button>
            <button
              type="button"
              className="commercial-edit-btn is-save"
              onClick={isQuote ? handleSaveQuote : handleSaveSale}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Save size={14} />}
              <span>{saving ? 'Guardando…' : 'Guardar cambios'}</span>
            </button>
          </div>
        </section>
      )}

      {editError && (
        <div className="commercial-detail-state is-error" role="alert">
          <AlertCircle size={18} />
          <span>{editError}</span>
        </div>
      )}

      {saveSuccessNotice && (
        <div className="commercial-detail-success-banner" role="status">
          <CheckCircle2 size={16} />
          <span>Cambios guardados exitosamente en la base de datos.</span>
        </div>
      )}

      {/* Main Overview Box */}
      <section className="commercial-detail-overview" aria-label="Resumen del documento">
        <div className="commercial-detail-overview-top">
          <div className="commercial-detail-badges">
            <span className={`commercial-detail-kind ${isQuote ? 'is-quote' : 'is-sale'}`}>
              <FileText size={14}/>{isQuote ? 'Cotización' : 'Venta confirmada'}
            </span>
            <span className={`commercial-detail-status status-${String(document.status || '').toLowerCase()}`}>
              {statusLabel(document.status)}
            </span>
          </div>

          <div className="commercial-detail-overview-actions">
            {!isQuote && (
              <button
                type="button"
                className="commercial-detail-action-btn"
                onClick={() => window.print()}
                title="Imprimir comprobante o ticket"
              >
                <Printer size={13} />
                <span>Imprimir recibo</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                className={`commercial-detail-action-btn ${isEditing ? 'is-editing-active' : ''}`}
                onClick={isEditing ? cancelEditing : startEditing}
                title={isEditing ? 'Cerrar edición sin guardar' : 'Editar todos los campos de este documento'}
              >
                {isEditing ? <X size={13} /> : <Edit3 size={13} />}
                <span>{isEditing ? 'Cancelar edición' : 'Editar todo'}</span>
              </button>
            )}
          </div>
        </div>

        <h3>{code || String(document.id || documentId).slice(0, 10)}</h3>

        {/* View mode metadata */}
        {!isEditing && (
          <dl className="commercial-detail-meta-grid">
            <Meta label="Cliente" value={customerName}/>
            <Meta label="Fecha" value={formatDateTime(createdAt)}/>
            {!isQuote && <Meta label="Contacto" value={customer?.phone || '—'}/>}
            {!isQuote && <Meta label="Sucursal" value={branch?.name || '—'}/>}
            {isQuote && <Meta label="Contacto" value={document.customer_phone || '—'}/>}
            {isQuote && quoteDetails.customer?.email && <Meta label="Correo" value={quoteDetails.customer.email}/>}
            {isQuote && quoteDetails.customer?.document_reference && <Meta label="Cédula / RUC" value={quoteDetails.customer.document_reference}/>}
            {!isQuote && <Meta label="Tipo de pago" value={paymentLabel(document.payment_method)}/>}
            {isQuote && <Meta label="Tarifa" value={quoteTier(document.chosen_tier)}/>}
            {isQuote && quoteDetails.job_name && <Meta label="Trabajo" value={quoteDetails.job_name}/>}
            {isQuote && quoteDetails.delivery_date && <Meta label="Entrega solicitada" value={formatDate(quoteDetails.delivery_date)}/>}
            {!isQuote && <Meta label="Referencia de cotización" value={document.central_quote_id ? 'Vinculada' : 'Venta directa'}/>}
          </dl>
        )}

        {/* Edit mode metadata for Sale */}
        {isEditing && !isQuote && (
          <div className="commercial-edit-form-grid">
            <div className="commercial-edit-field">
              <label>Nombre del cliente</label>
              <input
                type="text"
                className="commercial-edit-input"
                value={saleCustomerName}
                onChange={(e) => setSaleCustomerName(e.target.value)}
                placeholder="Nombre y apellido o razón social"
              />
            </div>
            <div className="commercial-edit-field">
              <label>Teléfono de contacto</label>
              <input
                type="text"
                className="commercial-edit-input"
                value={saleCustomerPhone}
                onChange={(e) => setSaleCustomerPhone(e.target.value)}
                placeholder="0987654321 / +593..."
              />
            </div>
            <div className="commercial-edit-field is-full">
              <label>Motivo de la edición (Auditoría)</label>
              <input
                type="text"
                className="commercial-edit-input"
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="Motivo de la modificación..."
              />
            </div>
          </div>
        )}

        {/* Edit mode metadata for Quote */}
        {isEditing && isQuote && (
          <div className="commercial-edit-form-grid">
            <div className="commercial-edit-field">
              <label>Nombre del cliente</label>
              <input
                type="text"
                className="commercial-edit-input"
                value={quoteCustomerName}
                onChange={(e) => setQuoteCustomerName(e.target.value)}
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="commercial-edit-field">
              <label>Teléfono de contacto</label>
              <input
                type="text"
                className="commercial-edit-input"
                value={quoteCustomerPhone}
                onChange={(e) => setQuoteCustomerPhone(e.target.value)}
                placeholder="Teléfono o celular"
              />
            </div>
            <div className="commercial-edit-field">
              <label>Estado de la cotización</label>
              <select
                className="commercial-edit-select"
                value={quoteStatus}
                onChange={(e) => setQuoteStatus(e.target.value)}
              >
                <option value="draft">Borrador</option>
                <option value="sent">Enviada</option>
                <option value="accepted">Aceptada</option>
                <option value="rejected">Rechazada</option>
              </select>
            </div>
            <div className="commercial-edit-field is-checkbox-wrap">
              <label className="commercial-edit-checkbox-label">
                <input
                  type="checkbox"
                  checked={quotePriceConfirmed}
                  onChange={(e) => setQuotePriceConfirmed(e.target.checked)}
                />
                <span>Precio confirmado (sin tarifas estimadas)</span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Items & Lines Section */}
      <section className="commercial-detail-section" aria-labelledby={`commercial-items-${document.id}`}>
        <div className="commercial-detail-section-heading">
          <div>
            <span className="eyebrow">DESGLOSE COMPLETO</span>
            <h4 id={`commercial-items-${document.id}`}>Productos y servicios</h4>
          </div>
          <span className="commercial-detail-count">
            {isEditing ? (isQuote ? quoteItems.length : saleLines.length) : lineRows.length} {((isEditing ? (isQuote ? quoteItems.length : saleLines.length) : lineRows.length) === 1) ? 'artículo' : 'artículos'}
          </span>
        </div>

        {/* View mode line list */}
        {!isEditing && (
          lineRows.length ? (
            <div className="commercial-detail-lines">
              {lineRows.map((line: any, index: number) => (
                <article className="commercial-detail-line" key={line.key}>
                  <ProductImage src={line.image} alt={line.title}/>
                  <div className="commercial-detail-line-copy">
                    <span className="commercial-detail-line-index">ARTÍCULO {String(index + 1).padStart(2, '0')}{line.sku ? ` · ${line.sku}` : ''}</span>
                    <h5>{line.title}</h5>
                    {line.description && line.description !== line.title && <p>{line.description}</p>}
                    <div className="commercial-detail-line-tags">
                      {line.category && <span>{line.category}</span>}
                      {line.option && <span>{line.option}</span>}
                      {line.measurement && <span>{line.measurement}</span>}
                      {line.estimated && <span className="is-estimated">Valor estimado · tarifa sin confirmar</span>}
                    </div>
                    {!isQuote && (
                      <div className="commercial-detail-line-tags is-fulfillment">
                        {line.fulfilled !== null && <span>Entregado: {line.fulfilled}</span>}
                        {line.backordered !== null && line.backordered > 0 && <span>Pendiente: {line.backordered}</span>}
                        {line.returned !== null && line.returned > 0 && <span>Devuelto: {line.returned}</span>}
                      </div>
                    )}
                  </div>
                  <div className="commercial-detail-line-values">
                    <span className="commercial-detail-line-quantity"><b>Cantidad:</b> {line.quantity ?? '—'} {line.unit}</span>
                    {line.showBilledQuantity && <span className="commercial-detail-line-quantity"><b>Área facturada:</b> {line.billedQuantity} {line.billedUnit}</span>}
                    <small>Unitario base: {line.unitPrice === null ? '—' : formatMoney(line.unitPrice)}</small>
                    {isQuote && line.discount > 0 && <small>Descuento asignado: −{formatMoney(line.discount)}</small>}
                    {isQuote && line.taxAmount > 0 && <small>IVA asignado: {formatMoney(line.taxAmount)}</small>}
                    {isQuote && line.shipping > 0 && <small>Envío / cargo asignado: {formatMoney(line.shipping)}</small>}
                    <strong>{line.lineTotal === null ? 'Por confirmar' : formatMoney(line.lineTotal)}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="commercial-detail-state"><Package size={17}/>Este registro no contiene líneas de productos.</div>
          )
        )}

        {/* Edit mode line list for Sale */}
        {isEditing && !isQuote && (
          <div className="commercial-edit-lines-container">
            {saleLines.map((line, idx) => (
              <div key={line.id || idx} className="commercial-edit-line-card">
                <div className="commercial-edit-line-card-top">
                  <span className="commercial-edit-line-badge">Artículo #{idx + 1}</span>
                  <button
                    type="button"
                    className="commercial-edit-delete-line-btn"
                    onClick={() => setSaleLines(saleLines.filter((_, i) => i !== idx))}
                    title="Eliminar este artículo"
                  >
                    <Trash2 size={14} /> <span>Eliminar</span>
                  </button>
                </div>
                <div className="commercial-edit-line-card-grid">
                  <div className="field-group is-desc">
                    <label>Descripción / Detalle del trabajo</label>
                    <input
                      type="text"
                      className="commercial-edit-input"
                      value={line.description_snapshot}
                      onChange={(e) => {
                        const copy = [...saleLines];
                        copy[idx] = { ...copy[idx], description_snapshot: e.target.value };
                        setSaleLines(copy);
                      }}
                      placeholder="Ej: Lona 13oz con bastidor metálico"
                    />
                  </div>
                  <div className="field-group is-qty">
                    <label>Cantidad</label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      className="commercial-edit-input"
                      value={line.quantity}
                      onChange={(e) => {
                        const copy = [...saleLines];
                        const q = parseFloat(e.target.value) || 0;
                        copy[idx] = {
                          ...copy[idx],
                          quantity: q,
                          line_total: Math.round(q * (copy[idx].unit_price || 0) * 100) / 100
                        };
                        setSaleLines(copy);
                      }}
                    />
                  </div>
                  <div className="field-group is-price">
                    <label>Precio Unitario ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="commercial-edit-input"
                      value={line.unit_price}
                      onChange={(e) => {
                        const copy = [...saleLines];
                        const p = parseFloat(e.target.value) || 0;
                        copy[idx] = {
                          ...copy[idx],
                          unit_price: p,
                          line_total: Math.round((copy[idx].quantity || 0) * p * 100) / 100
                        };
                        setSaleLines(copy);
                      }}
                    />
                  </div>
                  <div className="field-group is-total">
                    <label>Total Línea</label>
                    <div className="commercial-edit-computed-total">
                      {formatMoney((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="commercial-add-line-btn"
              onClick={() => {
                setSaleLines([
                  ...saleLines,
                  {
                    description_snapshot: 'Nuevo producto o servicio',
                    quantity: 1,
                    unit_price: 10,
                    line_total: 10,
                    sku_snapshot: `ART-${saleLines.length + 1}`,
                  }
                ]);
              }}
            >
              <Plus size={15} /> <span>+ Agregar línea de producto / servicio</span>
            </button>
          </div>
        )}

        {/* Edit mode line list for Quote */}
        {isEditing && isQuote && (
          <div className="commercial-edit-lines-container">
            {quoteItems.map((item, idx) => (
              <div key={item.id || idx} className="commercial-edit-line-card">
                <div className="commercial-edit-line-card-top">
                  <span className="commercial-edit-line-badge">Artículo #{idx + 1}</span>
                  <button
                    type="button"
                    className="commercial-edit-delete-line-btn"
                    onClick={() => setQuoteItems(quoteItems.filter((_, i) => i !== idx))}
                    title="Eliminar este artículo"
                  >
                    <Trash2 size={14} /> <span>Eliminar</span>
                  </button>
                </div>
                <div className="commercial-edit-line-card-grid">
                  <div className="field-group is-desc">
                    <label>Nombre del producto o servicio cotizado</label>
                    <input
                      type="text"
                      className="commercial-edit-input"
                      value={item.name}
                      onChange={(e) => {
                        const copy = [...quoteItems];
                        copy[idx] = { ...copy[idx], name: e.target.value };
                        setQuoteItems(copy);
                      }}
                      placeholder="Nombre del artículo"
                    />
                  </div>
                  <div className="field-group is-qty">
                    <label>Cantidad</label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      className="commercial-edit-input"
                      value={item.quantity}
                      onChange={(e) => {
                        const copy = [...quoteItems];
                        const q = parseFloat(e.target.value) || 0;
                        copy[idx] = {
                          ...copy[idx],
                          quantity: q,
                          total: Math.round(q * (copy[idx].unit_price || 0) * 100) / 100
                        };
                        setQuoteItems(copy);
                      }}
                    />
                  </div>
                  <div className="field-group is-price">
                    <label>Precio Unitario ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="commercial-edit-input"
                      value={item.unit_price}
                      onChange={(e) => {
                        const copy = [...quoteItems];
                        const p = parseFloat(e.target.value) || 0;
                        copy[idx] = {
                          ...copy[idx],
                          unit_price: p,
                          total: Math.round((copy[idx].quantity || 0) * p * 100) / 100
                        };
                        setQuoteItems(copy);
                      }}
                    />
                  </div>
                  <div className="field-group is-total">
                    <label>Total Artículo</label>
                    <div className="commercial-edit-computed-total">
                      {formatMoney((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="commercial-add-line-btn"
              onClick={() => {
                setQuoteItems([
                  ...quoteItems,
                  {
                    name: 'Nuevo producto o servicio cotizado',
                    quantity: 1,
                    unit_price: 15,
                    total: 15,
                  }
                ]);
              }}
            >
              <Plus size={15} /> <span>+ Agregar artículo a la cotización</span>
            </button>
          </div>
        )}
      </section>

      {/* Totals & Payments Section */}
      <section className="commercial-detail-bottom">
        <div className="commercial-detail-section commercial-detail-totals">
          <div className="commercial-detail-section-heading">
            <div><span className="eyebrow">VALORES</span><h4>Resumen económico</h4></div>
          </div>

          {!isEditing ? (
            isQuote ? (
              <>
                {tierTotals.map((tier) => <div className={`commercial-detail-total-row${tier.active ? ' is-selected' : ''}`} key={tier.label}><span>{tier.label}{tier.active && <em>Seleccionada</em>}</span><b>{tier.value === null ? 'Por confirmar' : formatMoney(tier.value)}</b></div>)}
                {quoteSubtotal !== null && <div className="commercial-detail-total-row"><span>Subtotal de artículos</span><b>{formatMoney(quoteSubtotal)}</b></div>}
                {quoteDiscount !== null && quoteDiscount > 0 && <div className="commercial-detail-total-row"><span>Descuento {quoteFinancial.discount_percent ? `(${quoteFinancial.discount_percent}%)` : ''}</span><b>−{formatMoney(quoteDiscount)}</b></div>}
                {quoteDiscount !== null && quoteDiscount > 0 && quoteFinancial.discount_reason && <p className="commercial-detail-tax-reason">Motivo: {quoteFinancial.discount_reason}</p>}
                <div className="commercial-detail-tax-note"><span>Desglose de IVA</span><b>{taxLabel}</b></div>
                {quoteShipping !== null && quoteShipping > 0 && <div className="commercial-detail-total-row"><span>Envío / otros cargos</span><b>{formatMoney(quoteShipping)}</b></div>}
                <div className="commercial-detail-total-row is-grand"><span>{document.price_confirmed ? 'Total cotizado' : 'Total estimado'}</span><b>{quoteTotal === null ? 'Por confirmar' : formatMoney(quoteTotal)}</b></div>
              </>
            ) : (
              <>
                <div className="commercial-detail-total-row"><span>Subtotal de la venta</span><b>{saleSubtotal === null ? '—' : formatMoney(saleSubtotal)}</b></div>
                <div className="commercial-detail-total-row"><span>Descuento registrado</span><b>{discount === null ? '—' : formatMoney(discount)}</b></div>
                {discount !== null && discount > 0 && document?.discount_reason && <p className="commercial-detail-tax-reason">Motivo del descuento: {document.discount_reason}</p>}
                <div className="commercial-detail-tax-note"><span>IVA</span><b>{taxLabel}</b></div>
                {saleShipping !== null && saleShipping > 0 && <div className="commercial-detail-total-row"><span>Envío / otros cargos</span><b>{formatMoney(saleShipping)}</b></div>}
                <div className="commercial-detail-total-row is-grand"><span>Total registrado</span><b>{saleTotal === null ? '—' : formatMoney(saleTotal)}</b></div>
                <div className="commercial-detail-total-row is-balance"><span>Abonado · saldo pendiente</span><b>{formatMoney(paid)} · {balance === null ? '—' : formatMoney(balance)}</b></div>
              </>
            )
          ) : (
            isQuote ? (
              <div className="commercial-edit-totals-container">
                <div className="commercial-detail-total-row">
                  <span>Subtotal acumulado:</span>
                  <b>{formatMoney(liveEditQuoteTotal)}</b>
                </div>
                <div className="commercial-detail-total-row is-grand">
                  <span>Total cotizado:</span>
                  <b>{formatMoney(liveEditQuoteTotal)}</b>
                </div>
              </div>
            ) : (
              <div className="commercial-edit-totals-container">
                <div className="commercial-detail-total-row">
                  <span>Subtotal calculado:</span>
                  <b>{formatMoney(liveEditSaleSubtotal)}</b>
                </div>
                <div className="commercial-edit-discount-row">
                  <div className="field-group">
                    <label>Descuento ($):</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="commercial-edit-input"
                      value={saleDiscount}
                      onChange={(e) => setSaleDiscount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="field-group">
                    <label>Motivo del descuento:</label>
                    <input
                      type="text"
                      className="commercial-edit-input"
                      value={saleDiscountReason}
                      onChange={(e) => setSaleDiscountReason(e.target.value)}
                      placeholder="Motivo..."
                    />
                  </div>
                </div>
                <div className="commercial-detail-total-row is-grand">
                  <span>Total recalculado:</span>
                  <b>{formatMoney(liveEditSaleTotal)}</b>
                </div>
                <div className="commercial-detail-total-row is-balance">
                  <span>Abonado · Saldo pendiente:</span>
                  <b>{formatMoney(liveEditSalePaid)} · {formatMoney(liveEditSaleBalance)}</b>
                </div>
              </div>
            )
          )}
        </div>

        {/* Payments Section for Sales */}
        {!isQuote && (
          <div className="commercial-detail-section commercial-detail-payments">
            <div className="commercial-detail-section-heading">
              <div><span className="eyebrow">COBROS</span><h4>Pagos registrados</h4></div>
              <Wallet size={17}/>
            </div>

            {!isEditing ? (
              payments.length ? (
                <ul>
                  {payments.map((payment: any, index: number) => (
                    <li key={payment.id || index}>
                      <span>
                        <b>{paymentLabel(payment.method)}</b>
                        <small>{formatDateTime(payment.created_at)}{payment.reference ? ` · ${payment.reference}` : ''}{payment.note ? ` · ${payment.note}` : ''}</small>
                      </span>
                      <strong>{formatMoney(numberOrNull(payment.amount) || 0)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="commercial-detail-small-empty">No hay abonos registrados.</div>
              )
            ) : (
              <div className="commercial-edit-payments-container">
                {salePayments.map((p, idx) => (
                  <div key={p.id || idx} className="commercial-edit-payment-card">
                    <div className="commercial-edit-payment-inputs">
                      <div className="field-group is-method">
                        <label>Método</label>
                        <select
                          className="commercial-edit-select"
                          value={p.method}
                          onChange={(e) => {
                            const copy = [...salePayments];
                            copy[idx] = { ...copy[idx], method: e.target.value };
                            setSalePayments(copy);
                          }}
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transferencia</option>
                          <option value="card">Tarjeta</option>
                          <option value="other">Otro</option>
                        </select>
                      </div>
                      <div className="field-group is-amount">
                        <label>Monto ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="commercial-edit-input"
                          value={p.amount}
                          onChange={(e) => {
                            const copy = [...salePayments];
                            copy[idx] = { ...copy[idx], amount: parseFloat(e.target.value) || 0 };
                            setSalePayments(copy);
                          }}
                        />
                      </div>
                      <div className="field-group is-ref">
                        <label>Referencia</label>
                        <input
                          type="text"
                          className="commercial-edit-input"
                          value={p.reference}
                          onChange={(e) => {
                            const copy = [...salePayments];
                            copy[idx] = { ...copy[idx], reference: e.target.value };
                            setSalePayments(copy);
                          }}
                          placeholder="Nro. referencia o banco"
                        />
                      </div>
                      <button
                        type="button"
                        className="commercial-edit-delete-line-btn is-icon-only"
                        onClick={() => setSalePayments(salePayments.filter((_, i) => i !== idx))}
                        title="Eliminar este cobro"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="commercial-add-line-btn"
                  onClick={() => {
                    setSalePayments([
                      ...salePayments,
                      {
                        method: 'cash',
                        amount: liveEditSaleBalance > 0 ? liveEditSaleBalance : 0,
                        reference: '',
                      }
                    ]);
                  }}
                >
                  <Plus size={14} /> <span>+ Agregar pago</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Notes & Observations Section */}
      {!isEditing ? (
        <>
          {isQuote && quoteDetails.installation && (quoteDetails.installation.required || quoteDetails.installation.address || quoteDetails.installation.maps_url) && (
            <section className="commercial-detail-section commercial-detail-delivery">
              <div className="commercial-detail-section-heading"><div><span className="eyebrow">INSTALACIÓN</span><h4>Ubicación y condiciones</h4></div><MapPin size={17}/></div>
              <dl className="commercial-detail-meta-grid">
                <Meta label="Dirección" value={quoteDetails.installation.address}/>
                <Meta label="Piso / nivel" value={quoteDetails.installation.floor}/>
                <Meta label="Altura" value={quoteDetails.installation.height}/>
                <Meta label="Acceso" value={quoteDetails.installation.access}/>
              </dl>
              <GoogleMapsPreview url={quoteDetails.installation.maps_url || ''} address={quoteDetails.installation.address || ''}/>
            </section>
          )}

          {isQuote && quoteDetails.notes && !document.notes && (
            <section className="commercial-detail-section commercial-detail-notes">
              <div className="commercial-detail-section-heading"><div><span className="eyebrow">NOTAS DE LA PROPUESTA</span><h4>Información adicional</h4></div></div>
              <p>{quoteDetails.notes}</p>
            </section>
          )}

          {fulfillment && (fulfillment.installation_required || fulfillment.delivery_due_at) && (
            <section className="commercial-detail-section commercial-detail-delivery">
              <div className="commercial-detail-section-heading"><div><span className="eyebrow">ENTREGA</span><h4>{fulfillment.installation_required ? 'Instalación y entrega' : 'Fecha de entrega'}</h4></div><CalendarDays size={17}/></div>
              {fulfillment.installation_required && <p><MapPin size={15}/>{fulfillment.installation_address || 'Dirección pendiente'}</p>}
              {fulfillment.delivery_due_at && <p>Entrega prevista: <b>{formatDate(fulfillment.delivery_due_at)}</b></p>}
              {fulfillment.installation_estimated_at && <p>Instalación prevista: <b>{formatDateTime(fulfillment.installation_estimated_at)}</b></p>}
              {(fulfillment.installation_maps_url || (fulfillment.installation_latitude !== null && fulfillment.installation_longitude !== null)) && <GoogleMapsPreview url={fulfillment.installation_maps_url || ''} address={fulfillment.installation_address || ''} coordinates={fulfillment.installation_latitude !== null && fulfillment.installation_longitude !== null ? `${fulfillment.installation_latitude},${fulfillment.installation_longitude}` : ''}/>}
            </section>
          )}

          {isQuote && document.notes && (
            <section className="commercial-detail-section commercial-detail-notes">
              <div className="commercial-detail-section-heading"><div><span className="eyebrow">NOTAS DE LA PROPUESTA</span><h4>Condiciones y detalles</h4></div></div>
              <p>{document.notes}</p>
            </section>
          )}

          {document.client_brief_html && document.client_brief_html !== '<p></p>' && (
            <section className="commercial-detail-section commercial-detail-notes">
              <div className="commercial-detail-section-heading"><div><span className="eyebrow">DESCRIPCIÓN DEL TRABAJO</span><h4>Indicaciones y objetivo</h4></div></div>
              <RichTextContent html={document.client_brief_html}/>
            </section>
          )}

          {!isQuote && document.note && (
            <section className="commercial-detail-section commercial-detail-notes">
              <div className="commercial-detail-section-heading"><div><span className="eyebrow">NOTA DE LA VENTA</span><h4>Observaciones</h4></div></div>
              <p>{document.note}</p>
            </section>
          )}
        </>
      ) : (
        <section className="commercial-detail-section commercial-detail-notes">
          <div className="commercial-detail-section-heading">
            <div>
              <span className="eyebrow">OBSERVACIONES</span>
              <h4>{isQuote ? 'Condiciones y notas de la cotización' : 'Nota y observaciones de la venta'}</h4>
            </div>
          </div>
          {isQuote ? (
            <div className="commercial-edit-field">
              <label>Notas de la propuesta / Validez</label>
              <textarea
                rows={3}
                className="commercial-edit-textarea"
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Indica condiciones de pago, tiempo de entrega, validez de la oferta..."
              />
            </div>
          ) : (
            <div className="commercial-edit-field">
              <label>Nota u observaciones de la venta</label>
              <textarea
                rows={3}
                className="commercial-edit-textarea"
                value={saleNote}
                onChange={(e) => setSaleNote(e.target.value)}
                placeholder="Observaciones de taller, entrega especial, etc."
              />
            </div>
          )}

          {/* Bottom Save Bar inside Edit Mode */}
          <div className="commercial-edit-bottom-actions">
            <button
              type="button"
              className="commercial-edit-btn is-cancel"
              onClick={cancelEditing}
              disabled={saving}
            >
              <X size={14} /> Cancelar edición
            </button>
            <button
              type="button"
              className="commercial-edit-btn is-save"
              onClick={isQuote ? handleSaveQuote : handleSaveSale}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Save size={14} />}
              <span>{saving ? 'Guardando cambios…' : 'Guardar todos los cambios'}</span>
            </button>
          </div>
        </section>
      )}

      <CommercialAssetsGallery kind={kind} documentId={documentId}/>
      {!isQuote && document.urgent_backorder && (
        <div className="commercial-detail-warning" role="status"><AlertCircle size={16}/>La venta tiene un artículo marcado para compra urgente.</div>
      )}
    </div>
  );
}
