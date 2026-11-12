import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertCircle,
  Check,
  CreditCard,
  DollarSign,
  FileText,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { Dialog } from '../../../components/ui/OperationalKit';
import { useAuth } from '../../../auth/AuthProvider';
import { supabase } from '../../../lib/supabaseClient';
import { formatMoney } from '../../../app/workspace';
import { snapshotCommercialFinishing } from '../../../lib/commercialFinishing';
import { canAdminDeleteSales, formatAdminControlError } from '../../../lib/adminCashSalesControl';
import { AdminDeleteRecordModal } from '../../../components/AdminDeleteRecordModal';

export interface POSSaleEditorModalProps {
  open: boolean;
  saleId: string | null;
  organizationId: string;
  branchName: string;
  onSaved: () => void;
  onDeleted?: (message: string) => void;
  onClose: () => void;
}

interface EditableLine {
  id?: string;
  catalog_product_id?: string | null;
  variant_id?: string | null;
  sku?: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  finishing_options?: Record<string, unknown>;
  material_requests?: unknown[];
}

interface EditablePayment {
  id?: string;
  method: 'cash' | 'transfer' | 'card' | 'other';
  amount: number | string;
  reference?: string;
  note?: string;
}

const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function POSSaleEditorModal({
  open,
  saleId,
  organizationId,
  branchName,
  onSaved,
  onDeleted,
  onClose,
}: POSSaleEditorModalProps) {
  const { roles, hasPermission } = useAuth();
  const canDeleteSale = canAdminDeleteSales(roles, hasPermission);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saleCode, setSaleCode] = useState('');
  const [saleStatus, setSaleStatus] = useState('confirmed');
  const [saleTotal, setSaleTotal] = useState(0);
  const [paymentMethodSummary, setPaymentMethodSummary] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Customer
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerData, setCustomerData] = useState({
    full_name: '',
    phone: '',
    email: '',
    document_reference: '',
  });

  // Lines
  const [lines, setLines] = useState<EditableLine[]>([]);

  // Discount & notes
  const [discount, setDiscount] = useState('0');
  const [discountReason, setDiscountReason] = useState('');
  const [note, setNote] = useState('');

  // Payments
  const [payments, setPayments] = useState<EditablePayment[]>([]);

  // Amendment audit reason
  const [amendmentReason, setAmendmentReason] = useState('Ajuste de orden en POS');

  // Load sale data on open
  useEffect(() => {
    if (!open || !saleId || !supabase) return;

    let active = true;
    setLoading(true);
    setError('');

    const loadData = async () => {
      try {
        const { data: sale, error: saleErr } = await supabase
          .from('sales')
          .select('id, sale_code, status, customer_id, discount_total, discount_reason, tax_rate, tax_amount, shipping_cost, note, total, payment_method, branch_id, created_at')
          .eq('id', saleId)
          .single();

        if (saleErr) throw saleErr;
        if (!sale) throw new Error('Venta no encontrada.');

        if (!active) return;
        setSaleCode(sale.sale_code || sale.id.slice(0, 8));
        setSaleStatus(sale.status || 'confirmed');
        setSaleTotal(Number(sale.total) || 0);
        setPaymentMethodSummary(sale.payment_method || '');
        setTaxRate(Number(sale.tax_rate) || 0);
        setShippingCost(Number(sale.shipping_cost) || 0);
        setCustomerId(sale.customer_id || null);
        setDiscount(String(sale.discount_total || 0));
        setDiscountReason(sale.discount_reason || '');
        setNote(sale.note || '');

        // Extract discount reason from note if present and column is empty
        if (!sale.discount_reason && sale.note && sale.note.includes('Descuento comercial')) {
          const match = sale.note.match(/Descuento comercial(?:\s*\([^)]*\))?:\s*([^\n\r]+)/i);
          if (match && match[1]) {
            setDiscountReason(match[1].trim());
          }
        }

        // Customer details
        if (sale.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id, full_name, phone, email, document_reference')
            .eq('id', sale.customer_id)
            .maybeSingle();

          if (active && customer) {
            setCustomerData({
              full_name: customer.full_name || '',
              phone: customer.phone || '',
              email: customer.email || '',
              document_reference: customer.document_reference || '',
            });
          }
        } else {
          setCustomerData({ full_name: 'Venta de mostrador', phone: '', email: '', document_reference: '' });
        }

        // Lines
        const { data: saleLines, error: linesErr } = await supabase
          .from('sale_lines')
          .select('id, catalog_product_id, variant_id, sku_snapshot, description_snapshot, quantity, unit_price, finishing_options, material_requests')
          .eq('sale_id', saleId)
          .order('id', { ascending: true });

        if (linesErr) throw linesErr;
        if (active) {
          setLines(
            (saleLines || []).map((l: any) => ({
              id: l.id,
              catalog_product_id: l.catalog_product_id || null,
              variant_id: l.variant_id || null,
              sku: l.sku_snapshot || '',
              description: l.description_snapshot || '',
              quantity: l.quantity,
              unit_price: l.unit_price,
              finishing_options: l.finishing_options && typeof l.finishing_options === 'object' ? l.finishing_options : {},
              material_requests: Array.isArray(l.material_requests) ? l.material_requests : [],
            })),
          );
        }

        // Payments
        const { data: salePayments, error: payErr } = await supabase
          .from('sale_payments')
          .select('id, method, amount, reference, note')
          .eq('sale_id', saleId)
          .order('id', { ascending: true });

        if (payErr) throw payErr;
        if (active) {
          setPayments(
            (salePayments && salePayments.length > 0)
              ? salePayments.map((p: any) => ({
                  id: p.id,
                  method: (p.method as any) || 'cash',
                  amount: p.amount,
                  reference: p.reference || '',
                  note: p.note || '',
                }))
              : [
                  {
                    method: (sale.payment_method as any) || 'cash',
                    amount: sale.total,
                    reference: '',
                    note: '',
                  },
                ],
          );
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Error al cargar la venta');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [open, saleId]);

  // Calculations
  const linesSubtotal = useMemo(() => {
    return roundMoney(
      lines.reduce((sum, l) => {
        const q = Number(l.quantity) || 0;
        const p = Number(l.unit_price) || 0;
        return sum + q * p;
      }, 0),
    );
  }, [lines]);

  const discountAmount = useMemo(() => {
    const d = Number(discount) || 0;
    return Math.max(0, Math.min(linesSubtotal, roundMoney(d)));
  }, [linesSubtotal, discount]);

  const computedTaxAmount = useMemo(() => {
    const taxableBase = Math.max(0, roundMoney(linesSubtotal - discountAmount));
    return roundMoney((taxableBase * (Number(taxRate) || 0)) / 100);
  }, [linesSubtotal, discountAmount, taxRate]);

  const computedTotal = useMemo(() => {
    const netBase = Math.max(0, roundMoney(linesSubtotal - discountAmount));
    return Math.max(0, roundMoney(netBase + computedTaxAmount + (Number(shippingCost) || 0)));
  }, [linesSubtotal, discountAmount, computedTaxAmount, shippingCost]);

  const paymentsTotal = useMemo(() => {
    return roundMoney(
      payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    );
  }, [payments]);

  const balanceDue = useMemo(() => {
    return Math.max(0, roundMoney(computedTotal - paymentsTotal));
  }, [computedTotal, paymentsTotal]);

  const changeDue = useMemo(() => {
    const cashTotal = payments
      .filter((p) => p.method === 'cash')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const nonCashTotal = payments
      .filter((p) => p.method !== 'cash')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const remainingToCover = Math.max(0, computedTotal - nonCashTotal);
    return Math.max(0, roundMoney(cashTotal - remainingToCover));
  }, [computedTotal, payments]);

  // Actions on lines
  const updateLine = (index: number, field: keyof EditableLine, val: any) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [field]: val } : line)),
    );
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, i) => i !== index));
  };

  const addLine = () => {
    setLines((current) => [
      ...current,
      {
        description: 'Nuevo concepto acordado',
        quantity: 1,
        unit_price: 10,
        finishing_options: {},
        material_requests: [],
      },
    ]);
  };

  // Actions on payments
  const updatePayment = (index: number, field: keyof EditablePayment, val: any) => {
    setPayments((current) =>
      current.map((pm, i) => (i === index ? { ...pm, [field]: val } : pm)),
    );
  };

  const removePayment = (index: number) => {
    setPayments((current) => current.filter((_, i) => i !== index));
  };

  const addPayment = () => {
    const remaining = Math.max(0, roundMoney(computedTotal - paymentsTotal));
    setPayments((current) => [
      ...current,
      {
        method: 'transfer',
        amount: remaining > 0 ? remaining : '',
        reference: '',
        note: '',
      },
    ]);
  };

  // Save changes
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleId || saving) return;

    if (!customerData.full_name.trim()) {
      setError('El nombre del cliente no puede estar vacío.');
      return;
    }
    if (lines.length === 0) {
      setError('La orden debe tener al menos un artículo.');
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.description.trim()) {
        setError(`El artículo #${i + 1} requiere una descripción.`);
        return;
      }
      if (!Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0) {
        setError(`El artículo #${i + 1} tiene una cantidad inválida.`);
        return;
      }
      if (!Number.isFinite(Number(l.unit_price)) || Number(l.unit_price) < 0) {
        setError(`El artículo #${i + 1} tiene un precio unitario inválido.`);
        return;
      }
    }
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) {
        setError(`El pago #${i + 1} debe tener un monto mayor a cero.`);
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const sanitizedLines = lines.map((l) => ({
        id: l.id || null,
        catalog_product_id: l.catalog_product_id || null,
        variant_id: l.variant_id || null,
        sku: l.sku || '',
        sku_snapshot: l.sku || '',
        description: l.description.trim(),
        description_snapshot: l.description.trim(),
        quantity: Number(l.quantity),
        unit_price: roundMoney(Number(l.unit_price)),
        finishing_options: snapshotCommercialFinishing(l.finishing_options, Number(l.quantity)),
        material_requests: Array.isArray(l.material_requests) ? l.material_requests : [],
      }));

      const sanitizedPayments = payments.map((p) => ({
        id: p.id || null,
        method: p.method,
        amount: roundMoney(Number(p.amount)),
        reference: (p.reference || '').trim(),
        note: (p.note || '').trim(),
      }));

      // Call authoritative amend_confirmed_pos_sale RPC (handles inventory + roll logs + closed cash session recalc)
      const { error: rpcError } = await supabase.rpc('amend_confirmed_pos_sale', {
        p_sale_id: saleId,
        p_customer_id: customerId || null,
        p_customer_data: {
          full_name: customerData.full_name.trim(),
          phone: customerData.phone.trim(),
          email: customerData.email.trim(),
          document_reference: customerData.document_reference.trim(),
        },
        p_discount: discountAmount,
        p_discount_reason: discountReason.trim(),
        p_note: note.trim(),
        p_lines: sanitizedLines,
        p_payments: sanitizedPayments,
        p_amendment_reason: amendmentReason.trim() || 'Ajuste de orden en POS',
      });

      if (rpcError) {
        throw rpcError;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(formatAdminControlError(err, 'Error al guardar las modificaciones.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="xl"
      title={`Editar venta confirmada · ${saleCode || 'Cargando…'}`}
      eyebrow={`MODIFICACIÓN POST-VENTA · ${branchName.toUpperCase()}`}
      description="Modifica cliente, descripción de artículos, cantidades, precios unitarios, descuentos y métodos de pago sin anular la venta."
      footer={
        <div className="pos-editor-modal-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', width: '100%' }}>
          {canDeleteSale && saleId && (
            <button
              type="button"
              className="button button-outline"
              style={{ color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.45)', marginRight: 'auto' }}
              onClick={() => setDeleteModalOpen(true)}
              disabled={saving || loading}
            >
              <Trash2 size={14} /> Eliminar venta
            </button>
          )}
          <button
            type="button"
            className="button button-outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button-dark"
            onClick={handleSave}
            disabled={saving || loading || lines.length === 0}
          >
            {saving ? (
              <>
                <Loader2 size={15} className="spin" /> Guardando cambios…
              </>
            ) : (
              <>
                <Check size={15} /> Confirmar modificaciones
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="pos-sale-editor-container">
        {loading ? (
          <div className="pos-editor-loading">
            <Loader2 size={24} className="spin" />
            <span>Cargando datos completos de la orden…</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="pos-editor-form">
            {error && (
              <div className="pos-editor-alert" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* SECCIÓN 1: DATOS DEL CLIENTE */}
            <section className="pos-editor-section">
              <div className="pos-editor-section-header">
                <User size={16} />
                <h4>Datos del cliente</h4>
              </div>
              <div className="pos-editor-grid-4">
                <label>
                  <span>Nombre / Razón Social *</span>
                  <input
                    type="text"
                    required
                    value={customerData.full_name}
                    onChange={(e) =>
                      setCustomerData((c) => ({ ...c, full_name: e.target.value }))
                    }
                    placeholder="Nombre completo o Empresa"
                  />
                </label>
                <label>
                  <span>Teléfono / WhatsApp</span>
                  <input
                    type="tel"
                    value={customerData.phone}
                    onChange={(e) =>
                      setCustomerData((c) => ({ ...c, phone: e.target.value }))
                    }
                    placeholder="0991234567"
                  />
                </label>
                <label>
                  <span>Correo electrónico</span>
                  <input
                    type="email"
                    value={customerData.email}
                    onChange={(e) =>
                      setCustomerData((c) => ({ ...c, email: e.target.value }))
                    }
                    placeholder="cliente@ejemplo.com"
                  />
                </label>
                <label>
                  <span>Cédula / RUC</span>
                  <input
                    type="text"
                    value={customerData.document_reference}
                    onChange={(e) =>
                      setCustomerData((c) => ({ ...c, document_reference: e.target.value }))
                    }
                    placeholder="0912345678001"
                  />
                </label>
              </div>
            </section>

            {/* SECCIÓN 2: LÍNEAS / PRODUCTOS */}
            <section className="pos-editor-section">
              <div className="pos-editor-section-header">
                <ShoppingBag size={16} />
                <div className="pos-editor-section-title-wrap">
                  <h4>Artículos y conceptos facturados</h4>
                  <small>Edita la descripción, cantidad o precio unitario de cada línea.</small>
                </div>
                <button
                  type="button"
                  className="button button-outline pos-editor-add-btn"
                  onClick={addLine}
                >
                  <Plus size={14} /> Agregar línea
                </button>
              </div>

              <div className="pos-editor-lines-list">
                {lines.map((line, idx) => {
                  const lineTotal = roundMoney(
                    (Number(line.quantity) || 0) * (Number(line.unit_price) || 0),
                  );
                  return (
                    <div className="pos-editor-line-row" key={line.id || `line-${idx}`}>
                      <div className="pos-editor-line-idx">#{idx + 1}</div>
                      <div className="pos-editor-line-desc">
                        <label>
                          <span>Descripción del producto / concepto</span>
                          <input
                            type="text"
                            required
                            value={line.description}
                            onChange={(e) => updateLine(idx, 'description', e.target.value)}
                            placeholder="Detalle del artículo"
                          />
                        </label>
                      </div>
                      <div className="pos-editor-line-qty">
                        <label>
                          <span>Cantidad</span>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            required
                            value={line.quantity}
                            onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="pos-editor-line-price">
                        <label>
                          <span>Precio unit. ($)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={line.unit_price}
                            onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="pos-editor-line-subtotal">
                        <span>Total línea</span>
                        <strong>{formatMoney(lineTotal)}</strong>
                      </div>
                      <button
                        type="button"
                        className="icon-button danger pos-editor-line-delete"
                        title="Eliminar línea"
                        disabled={lines.length <= 1}
                        onClick={() => removeLine(idx)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SECCIÓN 3: DESCUENTOS Y NOTAS */}
            <section className="pos-editor-section">
              <div className="pos-editor-section-header">
                <FileText size={16} />
                <h4>Ajustes comerciales y notas</h4>
              </div>
              <div className="pos-editor-grid-3">
                <label>
                  <span>Descuento global ($)</span>
                  <input
                    type="number"
                    min="0"
                    max={linesSubtotal}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </label>
                <label className="pos-editor-span-2">
                  <span>Motivo del descuento {discountAmount > 0 ? '*' : ''}</span>
                  <input
                    type="text"
                    required={discountAmount > 0}
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Ej.: Acuerdo por volumen, cliente VIP"
                  />
                </label>
              </div>
              <div className="pos-editor-row-full">
                <label>
                  <span>Notas internas / Observaciones de la orden</span>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Detalles sobre materiales, entrega o especificaciones acordadas…"
                  />
                </label>
              </div>
            </section>

            {/* SECCIÓN 4: FORMAS DE PAGO */}
            <section className="pos-editor-section">
              <div className="pos-editor-section-header">
                <Wallet size={16} />
                <div className="pos-editor-section-title-wrap">
                  <h4>Pagos registrados</h4>
                  <small>Modifica montos, métodos o agrega un nuevo abono.</small>
                </div>
                <button
                  type="button"
                  className="button button-outline pos-editor-add-btn"
                  onClick={addPayment}
                >
                  <Plus size={14} /> Agregar pago
                </button>
              </div>

              <div className="pos-editor-payments-list">
                {payments.map((pm, idx) => (
                  <div className="pos-editor-payment-row" key={pm.id || `pay-${idx}`}>
                    <label>
                      <span>Método</span>
                      <select
                        value={pm.method}
                        onChange={(e) =>
                          updatePayment(idx, 'method', e.target.value as any)
                        }
                      >
                        <option value="cash">Efectivo</option>
                        <option value="transfer">Transferencia</option>
                        <option value="card">Tarjeta</option>
                        <option value="other">Otro</option>
                      </select>
                    </label>
                    <label>
                      <span>Monto ($)</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={pm.amount}
                        onChange={(e) => updatePayment(idx, 'amount', e.target.value)}
                      />
                    </label>
                    <label className="pos-editor-span-2">
                      <span>Referencia / Comprobante (opcional)</span>
                      <input
                        type="text"
                        value={pm.reference || ''}
                        onChange={(e) => updatePayment(idx, 'reference', e.target.value)}
                        placeholder="Ej.: Transf #9821 / Lote 451"
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button danger pos-editor-payment-delete"
                      title="Quitar forma de pago"
                      disabled={payments.length <= 1}
                      onClick={() => removePayment(idx)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* RESUMEN FINANCIERO Y AUDITORÍA */}
            <section className="pos-editor-financial-card">
              <div className="pos-editor-financial-row">
                <span>Subtotal de líneas:</span>
                <strong>{formatMoney(linesSubtotal)}</strong>
              </div>
              {discountAmount > 0 && (
                <div className="pos-editor-financial-row is-discount">
                  <span>Descuento aplicado:</span>
                  <strong>−{formatMoney(discountAmount)}</strong>
                </div>
              )}
              {taxRate > 0 && (
                <div className="pos-editor-financial-row">
                  <span>IVA ({taxRate}%):</span>
                  <strong>+{formatMoney(computedTaxAmount)}</strong>
                </div>
              )}
              {shippingCost > 0 && (
                <div className="pos-editor-financial-row">
                  <span>Envío / instalación:</span>
                  <strong>+{formatMoney(shippingCost)}</strong>
                </div>
              )}
              <div className="pos-editor-financial-row is-total">
                <span>Total recalculado:</span>
                <strong>{formatMoney(computedTotal)}</strong>
              </div>
              <div className="pos-editor-financial-row">
                <span>Total pagado:</span>
                <strong>{formatMoney(paymentsTotal)}</strong>
              </div>
              {changeDue > 0 && (
                <div className="pos-editor-financial-row is-change">
                  <span>Vuelto a entregar:</span>
                  <strong>{formatMoney(changeDue)}</strong>
                </div>
              )}
              <div
                className={`pos-editor-financial-row ${
                  balanceDue > 0 ? 'is-balance-due' : 'is-paid'
                }`}
              >
                <span>Saldo pendiente:</span>
                <strong>{formatMoney(balanceDue)}</strong>
              </div>
            </section>

            {/* MOTIVO DE AUDITORÍA */}
            <div className="pos-editor-amendment-reason">
              <label>
                <span>Motivo de la edición (para registro de auditoría) *</span>
                <input
                  type="text"
                  required
                  value={amendmentReason}
                  onChange={(e) => setAmendmentReason(e.target.value)}
                  placeholder="Ej.: Corrección de medidas, cambio de método de pago, etc."
                />
              </label>
            </div>
          </form>
        )}
      </div>
    </Dialog>
    <AdminDeleteRecordModal
      open={deleteModalOpen}
      onOpenChange={setDeleteModalOpen}
      target={
        saleId
          ? {
              kind: 'sale',
              saleId,
              saleCode: saleCode || saleId.slice(0, 8),
              customerName: customerData.full_name,
              total: computedTotal || saleTotal,
              status: saleStatus,
              paymentMethod: paymentMethodSummary,
            }
          : null
      }
      onDeleted={async (msg) => {
        onClose();
        onSaved();
        onDeleted?.(msg);
      }}
    />
    </>
  );
}
