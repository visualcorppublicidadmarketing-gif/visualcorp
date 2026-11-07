import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  X,
  Image as ImageIcon,
  Search,
  DollarSign,
  Check,
  ExternalLink,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import './payment-receipt-modal.css';

export type PaymentBankName =
  | 'Banco Pichincha'
  | 'Banco Guayaquil'
  | 'Deuna!'
  | 'Efectivo'
  | 'Datafast / Tarjeta'
  | 'Otro';

export type PaymentReconciliationStatus = 'conciliado' | 'pendiente';

export interface PaymentReceiptFile {
  name: string;
  size: number;
  mimeType: string;
  dataUrl?: string;
}

export interface PaymentReceiptRecord {
  id: string;
  saleOrOrderId?: string;
  customerName?: string;
  bank: PaymentBankName | string;
  referenceNumber: string;
  amount: number;
  expectedAmount?: number;
  paidAt: string; // ISO datetime o YYYY-MM-DDTHH:mm
  reconciliationStatus: PaymentReconciliationStatus;
  notes?: string;
  receiptFile?: PaymentReceiptFile;
  createdAt: string;
  updatedAt: string;
  verifiedBy?: string;
  isDemoReference?: boolean;
}

export interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleOrOrderId?: string;
  customerName?: string;
  expectedAmount?: number;
  onReceiptSaved?: (receipt: PaymentReceiptRecord) => void;
}

const STORAGE_KEY_RECEIPTS = 'visualcorp_payment_receipts';
const STORAGE_KEY_VAULT_DOCS = 'visualcorp_vault_documents';
const STORAGE_KEY_ENTERPRISE_VAULT = 'vc-enterprise-vault-v1';

const BANK_OPTIONS: PaymentBankName[] = [
  'Banco Pichincha',
  'Banco Guayaquil',
  'Deuna!',
  'Efectivo',
  'Datafast / Tarjeta',
  'Otro',
];

// Comprobantes de referencia inicial para agencias sin registros previos
const SEED_DEMO_RECEIPTS: PaymentReceiptRecord[] = [
  {
    id: 'demo-rcpt-pichincha-01',
    saleOrOrderId: 'ORD-2026-084',
    customerName: 'Agripac S.A. Milagro',
    bank: 'Banco Pichincha',
    referenceNumber: 'TRANS-892401',
    amount: 145.5,
    expectedAmount: 145.5,
    paidAt: '2026-11-06T10:30',
    reconciliationStatus: 'conciliado',
    notes: 'Transferencia directa Cta. Corriente Banco Pichincha verificada por tesorería.',
    createdAt: '2026-11-06T10:35:00.000Z',
    updatedAt: '2026-11-06T10:35:00.000Z',
    verifiedBy: 'Tesorería Visual Corp',
    isDemoReference: true,
  },
  {
    id: 'demo-rcpt-deuna-02',
    saleOrOrderId: 'ORD-2026-091',
    customerName: 'Farmacias Cruz Azul Milagro',
    bank: 'Deuna!',
    referenceNumber: 'DEUNA-552190',
    amount: 38.0,
    expectedAmount: 38.0,
    paidAt: '2026-11-07T09:15',
    reconciliationStatus: 'pendiente',
    notes: 'Captura enviada por WhatsApp. Pendiente validar en reporte diario de caja.',
    createdAt: '2026-11-07T09:20:00.000Z',
    updatedAt: '2026-11-07T09:20:00.000Z',
    verifiedBy: 'Pendiente',
    isDemoReference: true,
  },
];

function formatCurrencyUSD(val: number): string {
  const safe = Number.isFinite(val) ? val : 0;
  return safe.toLocaleString('es-EC', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getCurrentLocalDateTime(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localIso = new Date(now.getTime() - offset).toISOString().slice(0, 16);
  return localIso;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  saleOrOrderId = '',
  customerName = '',
  expectedAmount = 0,
  onReceiptSaved,
}) => {
  // Form State
  const [bank, setBank] = useState<PaymentBankName>('Banco Pichincha');
  const [customBank, setCustomBank] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState<string>(
    expectedAmount > 0 ? String(expectedAmount) : ''
  );
  const [paidAt, setPaidAt] = useState<string>(getCurrentLocalDateTime);
  const [reconciliationStatus, setReconciliationStatus] =
    useState<PaymentReconciliationStatus>('conciliado');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<PaymentReceiptFile | null>(null);

  // UI state
  const [receiptsList, setReceiptsList] = useState<PaymentReceiptRecord[]>([]);
  const [filterScope, setFilterScope] = useState<'current' | 'all'>('current');
  const [searchFilter, setSearchFilter] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxReceipt, setLightboxReceipt] = useState<PaymentReceiptRecord | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Sincronizar campo de monto cuando expectedAmount cambia
  useEffect(() => {
    if (expectedAmount > 0) {
      setAmount(String(expectedAmount));
    }
  }, [expectedAmount]);

  // Cargar comprobantes existentes desde localStorage
  const loadReceipts = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_RECEIPTS);
      if (stored) {
        const parsed = JSON.parse(stored) as PaymentReceiptRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReceiptsList(parsed);
          return;
        }
      }
      // Si la colección está vacía, se cargan comprobantes de referencia operativa
      setReceiptsList(SEED_DEMO_RECEIPTS);
      localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(SEED_DEMO_RECEIPTS));
    } catch (e) {
      console.warn('Error leyendo comprobantes en localStorage:', e);
      setReceiptsList(SEED_DEMO_RECEIPTS);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadReceipts();
      setPaidAt(getCurrentLocalDateTime());
      setSuccessToast(null);
      setErrorMessage(null);
    }
  }, [isOpen, loadReceipts]);

  // Manejo de pegado desde el portapapeles (Ctrl+V de capturas bancarias)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            processFile(file);
            setSuccessToast('¡Captura pegada directamente desde el portapapeles!');
            setTimeout(() => setSuccessToast(null), 3500);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Procesamiento del archivo de imagen o PDF
  const processFile = (file: File) => {
    setErrorMessage(null);

    // Límite de 8 MB para base64 en localStorage
    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('El archivo supera los 8 MB. Selecciona una captura optimizada.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target?.result as string;
      setReceiptFile({
        name: file.name || `comprobante-${Date.now()}.png`,
        size: file.size,
        mimeType: file.type || 'image/png',
        dataUrl,
      });
    };
    reader.onerror = () => {
      setErrorMessage('No se pudo leer el archivo. Intenta con otra imagen.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleClearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReceiptFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Guardar Comprobante y sincronizar con Vault
  const handleSaveReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Ingresa un monto de pago válido mayor a $0.00.');
      return;
    }

    const cleanRef = referenceNumber.trim();
    if (!cleanRef) {
      setErrorMessage('Ingresa el número de referencia o código de transferencia.');
      return;
    }

    const effectiveBank = bank === 'Otro' ? (customBank.trim() || 'Otro') : bank;

    const newRecord: PaymentReceiptRecord = {
      id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      saleOrOrderId: saleOrOrderId.trim() || 'ORD-VENTA-MOSTRADOR',
      customerName: customerName.trim() || 'Cliente Mostrador Visual Corp',
      bank: effectiveBank,
      referenceNumber: cleanRef,
      amount: Math.round(parsedAmount * 100) / 100,
      expectedAmount: expectedAmount > 0 ? expectedAmount : undefined,
      paidAt: paidAt || getCurrentLocalDateTime(),
      reconciliationStatus,
      notes: notes.trim(),
      receiptFile: receiptFile || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verifiedBy:
        reconciliationStatus === 'conciliado'
          ? 'Conciliado en Suite Visual Corp'
          : 'Pendiente de Confirmación Bancaria',
      isDemoReference: false,
    };

    try {
      // 1. Guardar en 'visualcorp_payment_receipts'
      const existingRaw = localStorage.getItem(STORAGE_KEY_RECEIPTS);
      const existing: PaymentReceiptRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
      const updatedList = [newRecord, ...existing.filter((item) => item.id !== newRecord.id)];
      localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(updatedList));
      setReceiptsList(updatedList);

      // 2. Registrar en 'visualcorp_vault_documents' con tag 'comprobante_pago'
      const vaultRaw = localStorage.getItem(STORAGE_KEY_VAULT_DOCS);
      const vaultDocs = vaultRaw ? JSON.parse(vaultRaw) : [];
      const newVaultEntry = {
        id: `vault-doc-${newRecord.id}`,
        title: `Comprobante ${newRecord.bank} — Ref: ${newRecord.referenceNumber}`,
        fileName: newRecord.receiptFile?.name || `comprobante-${newRecord.referenceNumber}.png`,
        fileSizeBytes: newRecord.receiptFile?.size || 0,
        fileSizeFormatted: newRecord.receiptFile?.size
          ? `${Math.round(newRecord.receiptFile.size / 1024)} KB`
          : 'Registro Digital',
        mimeType: newRecord.receiptFile?.mimeType || 'image/png',
        fileUrl: newRecord.receiptFile?.dataUrl || '',
        category: 'comprobante_pago',
        approvalStatus: newRecord.reconciliationStatus === 'conciliado' ? 'aprobado' : 'en_revision',
        colorProfile: 'RGB Web',
        version: '1.0',
        customerId: newRecord.customerName,
        customerName: newRecord.customerName,
        orderCode: newRecord.saleOrOrderId,
        tags: [
          'comprobante_pago',
          'bancos_ecuador',
          newRecord.bank.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          newRecord.reconciliationStatus,
          `monto_${newRecord.amount}`,
        ],
        notes: `Comprobante bancario registrado por $${newRecord.amount}. Ref: ${newRecord.referenceNumber}. ${newRecord.notes || ''}`.trim(),
        storageProvider: 'local',
        createdAt: newRecord.createdAt,
        updatedAt: newRecord.updatedAt,
      };
      vaultDocs.unshift(newVaultEntry);
      localStorage.setItem(STORAGE_KEY_VAULT_DOCS, JSON.stringify(vaultDocs));

      // 3. Sincronizar también con vc-enterprise-vault-v1 si existe
      try {
        const entVaultRaw = localStorage.getItem(STORAGE_KEY_ENTERPRISE_VAULT);
        if (entVaultRaw) {
          const entDocs = JSON.parse(entVaultRaw);
          if (Array.isArray(entDocs)) {
            entDocs.unshift(newVaultEntry);
            localStorage.setItem(STORAGE_KEY_ENTERPRISE_VAULT, JSON.stringify(entDocs));
          }
        }
      } catch {
        // Silencioso si no está inicializado
      }

      // Notificar al componente invocador
      if (onReceiptSaved) {
        onReceiptSaved(newRecord);
      }

      setSuccessToast(`¡Comprobante ${newRecord.referenceNumber} guardado y conciliado con éxito!`);
      // Limpiar campos para permitir otro comprobante si se requiere
      setReferenceNumber('');
      setNotes('');
      setReceiptFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setTimeout(() => setSuccessToast(null), 4000);
    } catch (saveError) {
      console.error('Error guardando comprobante bancario:', saveError);
      setErrorMessage('Error al escribir en almacenamiento local. Revisa el tamaño del comprobante.');
    }
  };

  // Acción rápida para conciliar un comprobante pendiente existente
  const handleToggleReconciliation = (recordToToggle: PaymentReceiptRecord) => {
    const nextStatus: PaymentReconciliationStatus =
      recordToToggle.reconciliationStatus === 'conciliado' ? 'pendiente' : 'conciliado';

    const updated = receiptsList.map((item) => {
      if (item.id === recordToToggle.id) {
        return {
          ...item,
          reconciliationStatus: nextStatus,
          updatedAt: new Date().toISOString(),
          verifiedBy:
            nextStatus === 'conciliado'
              ? 'Verificado en Cuenta Bancaria (Visual Corp)'
              : 'Pendiente de Conciliación',
        };
      }
      return item;
    });

    setReceiptsList(updated);
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(updated));

    setSuccessToast(
      nextStatus === 'conciliado'
        ? `Comprobante ${recordToToggle.referenceNumber} marcado como CONCILIADO.`
        : `Comprobante ${recordToToggle.referenceNumber} marcado como PENDIENTE.`
    );
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Filtrado de comprobantes asociados
  const filteredReceipts = useMemo(() => {
    return receiptsList.filter((item) => {
      // Filtrar por ámbito (orden actual vs histórico total)
      if (filterScope === 'current' && saleOrOrderId) {
        const matchesOrder =
          item.saleOrOrderId?.toLowerCase().trim() === saleOrOrderId.toLowerCase().trim();
        const matchesCustomer =
          customerName && item.customerName?.toLowerCase().includes(customerName.toLowerCase());
        if (!matchesOrder && !matchesCustomer) {
          return false;
        }
      }

      // Filtro de búsqueda textual
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const inBank = item.bank.toLowerCase().includes(q);
        const inRef = item.referenceNumber.toLowerCase().includes(q);
        const inCustomer = item.customerName?.toLowerCase().includes(q);
        const inOrder = item.saleOrOrderId?.toLowerCase().includes(q);
        const inNotes = item.notes?.toLowerCase().includes(q);
        return inBank || inRef || inCustomer || inOrder || inNotes;
      }

      return true;
    });
  }, [receiptsList, filterScope, saleOrOrderId, customerName, searchFilter]);

  if (!isOpen) return null;

  return (
    <div className="vcorp-payment-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="receipt-modal-title">
      <div className="vcorp-payment-modal-backdrop" onClick={onClose} />

      <div className="vcorp-payment-modal-container" ref={modalContainerRef}>
        {/* Cabecera del Modal */}
        <header className="vcorp-payment-modal-header">
          <div className="vcorp-payment-modal-header-info">
            <div className="vcorp-payment-modal-badge">
              <ShieldCheck className="vcorp-icon-sm" />
              <span>Conciliación Bancaria Ecuador</span>
            </div>
            <h2 id="receipt-modal-title" className="vcorp-payment-modal-title">
              Registro y Verificación de Comprobantes
            </h2>
            <p className="vcorp-payment-modal-subtitle">
              Adjunta transferencias de Banco Pichincha, Banco Guayaquil o Deuna! y valida el abono en el Vault.
            </p>
          </div>

          <div className="vcorp-payment-modal-header-actions">
            {saleOrOrderId && (
              <span className="vcorp-payment-order-pill">
                <FileText className="vcorp-icon-xs" />
                <strong>{saleOrOrderId}</strong>
              </span>
            )}
            <button
              type="button"
              className="vcorp-payment-btn-icon"
              onClick={onClose}
              title="Cerrar modal (Esc)"
              aria-label="Cerrar modal"
            >
              <X className="vcorp-icon-md" />
            </button>
          </div>
        </header>

        {/* Toasts y Alertas */}
        {successToast && (
          <div className="vcorp-payment-toast success animate-slide-down">
            <CheckCircle2 className="vcorp-icon-sm" />
            <span>{successToast}</span>
          </div>
        )}

        {errorMessage && (
          <div className="vcorp-payment-toast error animate-slide-down">
            <X className="vcorp-icon-sm" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Cuerpo del Modal (2 columnas responsive) */}
        <div className="vcorp-payment-modal-body">
          {/* Columna Izquierda: Formulario de Registro */}
          <section className="vcorp-payment-form-pane">
            <h3 className="vcorp-pane-title">
              <CreditCard className="vcorp-icon-sm text-brand" />
              <span>Nuevo Comprobante de Pago</span>
            </h3>

            <form onSubmit={handleSaveReceipt} className="vcorp-payment-form">
              {/* Banco Emisor / Receptor Selector de Pastillas */}
              <div className="vcorp-form-group">
                <label className="vcorp-form-label">
                  Banco emisor / receptor <span className="text-red">*</span>
                </label>
                <div className="vcorp-pill-group" role="radiogroup" aria-label="Seleccionar banco">
                  {BANK_OPTIONS.map((bankOption) => (
                    <button
                      type="button"
                      key={bankOption}
                      className={`vcorp-pill-btn ${bank === bankOption ? 'is-active' : ''}`}
                      onClick={() => setBank(bankOption)}
                    >
                      {bank === bankOption && <Check className="vcorp-icon-xs" />}
                      <span>{bankOption}</span>
                    </button>
                  ))}
                </div>

                {bank === 'Otro' && (
                  <input
                    type="text"
                    className="vcorp-form-input mt-2"
                    placeholder="Especificar banco, cooperativa o billetera..."
                    value={customBank}
                    onChange={(e) => setCustomBank(e.target.value)}
                  />
                )}
              </div>

              {/* Fila 2: Referencia y Monto */}
              <div className="vcorp-form-row">
                <div className="vcorp-form-group flex-1">
                  <label htmlFor="ref-input" className="vcorp-form-label">
                    No. Comprobante / Referencia <span className="text-red">*</span>
                  </label>
                  <div className="vcorp-input-with-icon">
                    <FileText className="vcorp-input-icon" />
                    <input
                      id="ref-input"
                      type="text"
                      required
                      className="vcorp-form-input"
                      placeholder="Ej. TRANS-940214 o 003891"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="vcorp-form-group flex-1">
                  <label htmlFor="amount-input" className="vcorp-form-label">
                    Monto pagado ($ USD) <span className="text-red">*</span>
                  </label>
                  <div className="vcorp-input-with-icon">
                    <DollarSign className="vcorp-input-icon" />
                    <input
                      id="amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className="vcorp-form-input"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  {expectedAmount > 0 && (
                    <div className="vcorp-amount-hint">
                      <span>Monto esperado: <strong>{formatCurrencyUSD(expectedAmount)}</strong></span>
                      {parseFloat(amount) === expectedAmount && (
                        <span className="text-green-flex">
                          <Check className="vcorp-icon-xs" /> Cuadre exacto
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Fila 3: Fecha de Pago y Cliente */}
              <div className="vcorp-form-row">
                <div className="vcorp-form-group flex-1">
                  <label htmlFor="paid-at-input" className="vcorp-form-label">
                    Fecha y hora del pago <span className="text-red">*</span>
                  </label>
                  <div className="vcorp-input-with-icon">
                    <Clock className="vcorp-input-icon" />
                    <input
                      id="paid-at-input"
                      type="datetime-local"
                      required
                      className="vcorp-form-input"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="vcorp-form-group flex-1">
                  <label className="vcorp-form-label">Cliente / Titular</label>
                  <input
                    type="text"
                    className="vcorp-form-input readonly"
                    readOnly
                    value={customerName || 'Cliente General'}
                    title="Asociado automáticamente a la orden en curso"
                  />
                </div>
              </div>

              {/* Zona de Arrastrar o Seleccionar Captura / PDF */}
              <div className="vcorp-form-group">
                <div className="vcorp-label-split">
                  <label className="vcorp-form-label">
                    Captura o archivo de comprobante (.png, .jpg, .pdf)
                  </label>
                  <span className="vcorp-paste-tip">
                    Tip: Presiona <kbd>Ctrl+V</kbd> para pegar captura
                  </span>
                </div>

                <div
                  className={`vcorp-dropzone ${isDragging ? 'is-dragging' : ''} ${
                    receiptFile ? 'has-file' : ''
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="vcorp-sr-only"
                    onChange={handleFileInputChange}
                  />

                  {receiptFile ? (
                    <div className="vcorp-file-preview-card">
                      {receiptFile.dataUrl && receiptFile.mimeType.startsWith('image/') ? (
                        <div className="vcorp-file-preview-thumb">
                          <img
                            src={receiptFile.dataUrl}
                            alt="Vista previa de comprobante bancario"
                            className="vcorp-preview-img"
                          />
                        </div>
                      ) : (
                        <div className="vcorp-file-preview-icon">
                          <FileText className="vcorp-icon-lg text-brand" />
                        </div>
                      )}

                      <div className="vcorp-file-preview-meta">
                        <span className="vcorp-file-name" title={receiptFile.name}>
                          {receiptFile.name}
                        </span>
                        <span className="vcorp-file-size">
                          {(receiptFile.size / 1024).toFixed(1)} KB • {receiptFile.mimeType}
                        </span>
                      </div>

                      <div className="vcorp-file-actions">
                        <button
                          type="button"
                          className="vcorp-btn-icon-soft"
                          title="Remover archivo"
                          onClick={handleClearFile}
                        >
                          <X className="vcorp-icon-sm" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="vcorp-dropzone-content">
                      <div className="vcorp-dropzone-icon">
                        <UploadCloud className="vcorp-icon-lg" />
                      </div>
                      <div className="vcorp-dropzone-text">
                        <strong>Haz clic para examinar</strong> o arrastra la captura aquí
                      </div>
                      <span className="vcorp-dropzone-sub">
                        PNG, JPG, WEBP o PDF hasta 8 MB
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Selector de Estado de Conciliación */}
              <div className="vcorp-form-group">
                <label className="vcorp-form-label">
                  Estado de conciliación bancaria <span className="text-red">*</span>
                </label>
                <div className="vcorp-pill-group status-pills">
                  <button
                    type="button"
                    className={`vcorp-pill-btn is-success ${
                      reconciliationStatus === 'conciliado' ? 'is-active' : ''
                    }`}
                    onClick={() => setReconciliationStatus('conciliado')}
                  >
                    <CheckCircle2 className="vcorp-icon-xs" />
                    <span>Conciliado y Verificado en Cuenta</span>
                  </button>

                  <button
                    type="button"
                    className={`vcorp-pill-btn is-pending ${
                      reconciliationStatus === 'pendiente' ? 'is-active' : ''
                    }`}
                    onClick={() => setReconciliationStatus('pendiente')}
                  >
                    <Clock className="vcorp-icon-xs" />
                    <span>Pendiente de Verificación Bancaria</span>
                  </button>
                </div>
              </div>

              {/* Observaciones o Notas */}
              <div className="vcorp-form-group">
                <label htmlFor="notes-input" className="vcorp-form-label">
                  Observaciones internas / Cajero
                </label>
                <textarea
                  id="notes-input"
                  rows={2}
                  className="vcorp-form-textarea"
                  placeholder="Nota de confirmación, titular que transfiere, sucursal o referencia especial..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Botón de Enviar */}
              <div className="vcorp-form-footer">
                <button
                  type="submit"
                  className="vcorp-btn-primary"
                >
                  <CheckCircle2 className="vcorp-icon-sm" />
                  <span>Guardar Comprobante</span>
                </button>
              </div>
            </form>
          </section>

          {/* Columna Derecha: Historial y Bóveda de Comprobantes Asociados */}
          <section className="vcorp-payment-history-pane">
            <div className="vcorp-history-header">
              <div className="vcorp-history-title-wrap">
                <h3 className="vcorp-pane-title">
                  <FileText className="vcorp-icon-sm text-brand" />
                  <span>Comprobantes Registrados</span>
                </h3>
                <span className="vcorp-count-badge">
                  {filteredReceipts.length}
                </span>
              </div>

              {/* Switch de filtro: actual vs todos */}
              <div className="vcorp-scope-switcher">
                <button
                  type="button"
                  className={`vcorp-scope-btn ${filterScope === 'current' ? 'is-active' : ''}`}
                  onClick={() => setFilterScope('current')}
                  title="Mostrar comprobantes de esta orden o cliente"
                >
                  Esta Orden
                </button>
                <button
                  type="button"
                  className={`vcorp-scope-btn ${filterScope === 'all' ? 'is-active' : ''}`}
                  onClick={() => setFilterScope('all')}
                  title="Mostrar todos los comprobantes de la agencia"
                >
                  Historial Global
                </button>
              </div>
            </div>

            {/* Buscador Rápido */}
            <div className="vcorp-search-bar">
              <Search className="vcorp-search-icon" />
              <input
                type="text"
                className="vcorp-search-input"
                placeholder="Buscar por referencia, banco o cliente..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
              {searchFilter && (
                <button
                  type="button"
                  className="vcorp-btn-icon-clear"
                  onClick={() => setSearchFilter('')}
                >
                  <X className="vcorp-icon-xs" />
                </button>
              )}
            </div>

            {/* Listado de Comprobantes */}
            <div className="vcorp-receipts-list">
              {filteredReceipts.length === 0 ? (
                <div className="vcorp-empty-state">
                  <ImageIcon className="vcorp-empty-icon" />
                  <h4>Sin comprobantes registrados</h4>
                  <p>
                    {filterScope === 'current'
                      ? 'No hay comprobantes asociados a esta orden aún. Adjunta uno desde el formulario.'
                      : 'No se encontraron comprobantes con el criterio de búsqueda.'}
                  </p>
                </div>
              ) : (
                filteredReceipts.map((rcpt) => {
                  const isConciliado = rcpt.reconciliationStatus === 'conciliado';
                  return (
                    <article
                      key={rcpt.id}
                      className={`vcorp-receipt-card ${isConciliado ? 'status-ok' : 'status-waiting'}`}
                    >
                      <div className="vcorp-receipt-card-header">
                        <div className="vcorp-card-bank-info">
                          <span className="vcorp-bank-pill">
                            <CreditCard className="vcorp-icon-xs" />
                            {rcpt.bank}
                          </span>
                          {rcpt.isDemoReference && (
                            <span className="vcorp-demo-badge" title="Registro de plantilla de sistema">
                              Referencia / Demo operativa
                            </span>
                          )}
                        </div>

                        <div className="vcorp-card-amount">
                          {formatCurrencyUSD(rcpt.amount)}
                        </div>
                      </div>

                      <div className="vcorp-receipt-meta-grid">
                        <div className="vcorp-meta-item">
                          <span className="vcorp-meta-label">Referencia</span>
                          <span className="vcorp-meta-val font-mono">{rcpt.referenceNumber}</span>
                        </div>
                        <div className="vcorp-meta-item">
                          <span className="vcorp-meta-label">Orden / Venta</span>
                          <span className="vcorp-meta-val">{rcpt.saleOrOrderId || 'Mostrador'}</span>
                        </div>
                        <div className="vcorp-meta-item">
                          <span className="vcorp-meta-label">Cliente</span>
                          <span className="vcorp-meta-val text-truncate">{rcpt.customerName || 'Cliente'}</span>
                        </div>
                        <div className="vcorp-meta-item">
                          <span className="vcorp-meta-label">Fecha Pago</span>
                          <span className="vcorp-meta-val">
                            {rcpt.paidAt ? rcpt.paidAt.replace('T', ' ') : 'S/F'}
                          </span>
                        </div>
                      </div>

                      {rcpt.notes && (
                        <p className="vcorp-receipt-notes">
                          {rcpt.notes}
                        </p>
                      )}

                      {/* Pie de tarjeta con acciones */}
                      <div className="vcorp-receipt-card-footer">
                        <div className="vcorp-status-tag-wrap">
                          <button
                            type="button"
                            className={`vcorp-status-badge ${isConciliado ? 'conciliado' : 'pendiente'}`}
                            onClick={() => handleToggleReconciliation(rcpt)}
                            title="Haz clic para alternar estado de conciliación"
                          >
                            {isConciliado ? (
                              <>
                                <CheckCircle2 className="vcorp-icon-xs" />
                                <span>Conciliado en Cuenta</span>
                              </>
                            ) : (
                              <>
                                <Clock className="vcorp-icon-xs" />
                                <span>Pendiente Verificación</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="vcorp-receipt-actions">
                          {rcpt.receiptFile?.dataUrl ? (
                            <button
                              type="button"
                              className="vcorp-btn-action"
                              onClick={() => setLightboxReceipt(rcpt)}
                              title="Visualizar comprobante"
                            >
                              <Eye className="vcorp-icon-xs" />
                              <span>Ver captura</span>
                            </button>
                          ) : (
                            <span className="vcorp-no-file-text">
                              Sin imagen
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Lightbox / Visor de Comprobante */}
      {lightboxReceipt && (
        <div
          className="vcorp-lightbox-overlay"
          onClick={() => setLightboxReceipt(null)}
          role="dialog"
          aria-label="Visor de comprobante bancario"
        >
          <div className="vcorp-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <header className="vcorp-lightbox-header">
              <div className="vcorp-lightbox-info">
                <h4>Comprobante {lightboxReceipt.bank}</h4>
                <p>
                  Ref: <strong className="font-mono">{lightboxReceipt.referenceNumber}</strong> • Monto:{' '}
                  <strong>{formatCurrencyUSD(lightboxReceipt.amount)}</strong>
                </p>
              </div>

              <div className="vcorp-lightbox-header-actions">
                {lightboxReceipt.receiptFile?.dataUrl && (
                  <a
                    href={lightboxReceipt.receiptFile.dataUrl}
                    download={lightboxReceipt.receiptFile.name || `comprobante-${lightboxReceipt.referenceNumber}.png`}
                    className="vcorp-btn-icon-soft"
                    title="Descargar comprobante"
                  >
                    <ExternalLink className="vcorp-icon-sm" />
                  </a>
                )}
                <button
                  type="button"
                  className="vcorp-btn-icon-soft"
                  onClick={() => setLightboxReceipt(null)}
                  title="Cerrar visor"
                >
                  <X className="vcorp-icon-sm" />
                </button>
              </div>
            </header>

            <div className="vcorp-lightbox-body">
              {lightboxReceipt.receiptFile?.dataUrl &&
              lightboxReceipt.receiptFile.mimeType.startsWith('image/') ? (
                <img
                  src={lightboxReceipt.receiptFile.dataUrl}
                  alt={`Comprobante ${lightboxReceipt.referenceNumber}`}
                  className="vcorp-lightbox-img"
                />
              ) : (
                <div className="vcorp-lightbox-doc">
                  <FileText className="vcorp-icon-xl text-brand" />
                  <p>{lightboxReceipt.receiptFile?.name || 'Documento no previsualizable'}</p>
                  {lightboxReceipt.receiptFile?.dataUrl && (
                    <a
                      href={lightboxReceipt.receiptFile.dataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vcorp-btn-primary mt-3"
                    >
                      <ExternalLink className="vcorp-icon-sm" />
                      <span>Abrir en nueva pestaña</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PaymentReceiptModal;
