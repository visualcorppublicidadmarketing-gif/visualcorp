import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Boxes, Calculator, Check, CheckCircle2,
  CircleHelp, ClipboardList, Copy, ExternalLink, FileCheck2, FileText, FolderOpen,
  MapPin, MessageCircle, MessageSquare, Minus, Percent, Plus, Printer, ReceiptText,
  RefreshCw, Route, Ruler, Search, Send, ShieldCheck, ShoppingBag, ShoppingCart,
  Sparkles, Store, Trash2, Users, Wallet, X,
} from 'lucide-react';
import { useWorkspace, formatMoney, formatDate } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { AppFrame, PageHeading, StatCard } from '../../app/layout';
import { EmptyState } from '../../components/feedback';
import { QuoteCustomerPicker } from '../../components/QuoteCustomerPicker';
import { QuoteProductPicker } from '../../components/QuoteProductPicker';
import { MeasurementPreview } from '../../components/MeasurementPreview';
import { useAdvisorProductFavorites } from '../../hooks/useAdvisorProductFavorites';
import { buildOperationalQuoteWhatsAppMessage, copyTextToClipboard, normalizeWhatsAppNumber } from '../../lib/whatsapp';
import { calculateQuotePrice, getQuoteBasis, quoteTiers } from '../../lib/quotePricing';
import { supabase } from '../../lib/supabaseClient';
import { CommercialDocumentDetails } from '../../components/CommercialDocumentDetails';
import { Sheet, useConfirm } from '../../components/ui/OperationalKit';
import { CommercialAssetsEditor } from '../../components/commercial/CommercialAssetsEditor';
import { GoogleMapsPreview } from '../../components/commercial/GoogleMapsPreview';
import { RichTextEditor } from '../../components/studio/RichTextEditor';
import { DatePicker } from '../../components/ui/Calendar';
import { persistCommercialAssets, type CommercialAssetDraft } from '../../lib/commercialAssets';
import { isGoogleMapsUrl, normalizeGoogleMapsUrl } from '../../lib/maps';
import { ChatterDrawer360 } from '../../components/ui/ChatterDrawer360';
import { ExecutiveQuotePdfModal, type QuoteData } from '../../components/ExecutiveQuotePdfModal';
import { PaymentReceiptModal, type PaymentReceiptRecord } from '../../components/PaymentReceiptModal';
import { calculateTieredPrice, getNextVolumeTierRecommendation } from '../../lib/volumePricing';
import './operations-quote.css';

const MAX_QUOTE_ITEMS = 40;
const newLineId = () => globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type QuoteDraftLine = {
  id: string;
  productId: string;
  quantity: string;
  widthCm: string;
  heightCm: string;
  option: string;
  concept: string;
  additionalDescription: string;
  additionalDescriptionHtml: string;
  custom: boolean;
  customMode?: 'quantity' | 'area';
  customUnit: string;
  customUnitPrice: string;
};

const createLine = (custom = false, customMode: 'quantity' | 'area' = 'quantity'): QuoteDraftLine => ({
  id: newLineId(),
  productId: '',
  quantity: '1',
  widthCm: '100',
  heightCm: '100',
  option: '',
  concept: '',
  additionalDescription: '',
  additionalDescriptionHtml: '<p></p>',
  custom,
  customMode,
  customUnit: customMode === 'area' ? 'm²' : 'unidad',
  customUnitPrice: '',
});

const tierAliases: Record<string, string> = { pvp: 'normal', instalacion: 'installation', corporativo: 'corporate' };
const reverseTierAliases: Record<string, string> = { normal: 'pvp', installation: 'instalacion', corporate: 'corporativo', pvp: 'pvp', instalacion: 'instalacion', corporativo: 'corporativo' };
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const COMMON_SIZE_PRESETS = [
  { width: 100, height: 100, title: 'Cuadrado', label: '1 × 1 m' },
  { width: 200, height: 100, title: 'Banner', label: '2 × 1 m' },
  { width: 300, height: 100, title: 'Fachada', label: '3 × 1 m' },
  { width: 80, height: 200, title: 'Roll-up', label: '80 × 200 cm' },
  { width: 120, height: 80, title: 'Display', label: '120 × 80 cm' },
  { width: 60, height: 40, title: 'Pancarta', label: '60 × 40 cm' },
  { width: 400, height: 200, title: 'Valla', label: '4 × 2 m' },
];

const QUANTITY_PRESETS = [1, 2, 5, 10, 25, 50, 100];

function distributeMoney(total: number, weights: number[]) {
  const cents = Math.round(total * 100);
  const weightTotal = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!weights.length) return [];
  const raw = weights.map((weight) => weightTotal > 0 ? cents * Math.max(0, weight) / weightTotal : cents / weights.length);
  const allocated = raw.map(Math.floor);
  let remaining = cents - allocated.reduce((sum, value) => sum + value, 0);
  const remainderOrder = raw.map((value, index) => ({ index, fraction: value - allocated[index] })).sort((left, right) => right.fraction - left.fraction);
  for (let index = 0; index < remaining; index += 1) allocated[remainderOrder[index % remainderOrder.length].index] += 1;
  return allocated.map((value) => value / 100);
}

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function OperationsQuotePage() {
  const { data, flash } = useWorkspace();
  const navigate = useNavigate();
  const { organizationId, hasPermission, user } = useAuth();
  const { favoriteIds, toggleFavorite, status: favoriteStorageStatus } = useAdvisorProductFavorites(organizationId, user?.id);
  const confirm = useConfirm();
  const canSearchCustomers = hasPermission('crm', 'view');
  const canViewQuotes = hasPermission('quotes', 'view');
  const canEditQuotes = hasPermission('quotes', 'edit');
  const canDeleteQuotes = hasPermission('quotes', 'delete_records');
  const canViewSales = hasPermission('sales', 'view');
  const canDeleteSales = hasPermission('sales', 'delete_records');

  const [branchCode, setBranchCode] = useState('VIS');
  const [lines, setLines] = useState<QuoteDraftLine[]>([createLine()]);
  const [priceTier, setPriceTier] = useState('pvp');
  const [customer, setCustomer] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [phone, setPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [jobName, setJobName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [validityDays, setValidityDays] = useState('15');
  const [depositPercent, setDepositPercent] = useState('50');
  const [applyIVA, setApplyIVA] = useState(true);
  const [configuredTaxRate, setConfiguredTaxRate] = useState<number>(Number(data.calculatorSettings?.taxRate ?? 15));
  const [discountPercent, setDiscountPercent] = useState('0');
  const [discountReason, setDiscountReason] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [installAddress, setInstallAddress] = useState('');
  const [installMapUrl, setInstallMapUrl] = useState('');
  const [installFloor, setInstallFloor] = useState('');
  const [installHeight, setInstallHeight] = useState('');
  const [installAccess, setInstallAccess] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [clientBriefHtml, setClientBriefHtml] = useState('<p></p>');
  const [documentAssets, setDocumentAssets] = useState<CommercialAssetDraft[]>([]);
  const [centralQuotes, setCentralQuotes] = useState<any[]>([]);
  const [centralSales, setCentralSales] = useState<any[]>([]);
  const [catalogLinks, setCatalogLinks] = useState<any[]>([]);
  const [productWorkflowRoutes, setProductWorkflowRoutes] = useState<Record<string, string>>({});
  const [workflowTemplates, setWorkflowTemplates] = useState<Array<{ code: string; name: string }>>([]);
  const [customerSummary, setCustomerSummary] = useState<any | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);
  const [chatterTarget, setChatterTarget] = useState<{
    recordType: 'customer' | 'quote' | 'sale';
    recordId: string;
    recordTitle: string;
    recordSubtitle: string;
    recordPhone?: string;
    recordStage?: string;
  } | null>(null);
  const [removingDocumentId, setRemovingDocumentId] = useState('');
  const [updatingStatusId, setUpdatingStatusId] = useState('');
  const [saving, setSaving] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'quotes' | 'accepted' | 'sales'>('all');
  const [selectedQuoteForPdf, setSelectedQuoteForPdf] = useState<QuoteData | null>(null);
  const [isCurrentPdfOpen, setIsCurrentPdfOpen] = useState(false);
  const [receiptModalTarget, setReceiptModalTarget] = useState<{ id: string; clientName: string; amount: number } | null>(null);

  useEffect(() => {
    if (!data.branches?.length) return;
    if (data.branches.some((branch: any) => branch.code === branchCode)) return;
    setBranchCode(data.branches[0].code);
  }, [data.branches, branchCode]);

  const selectedBranch = useMemo(
    () => (data.branches || []).find((branch: any) => branch.code === branchCode) || { id: '', code: branchCode, name: branchCode === 'GIGA' ? 'Gigaprint' : 'Visual Corp' },
    [data.branches, branchCode],
  );
  const branchName = selectedBranch.name || 'Visual Corp';

  // Load tax rate, inventory links, and workflow routes (like POS)
  useEffect(() => {
    if (!supabase || !organizationId) return;
    let active = true;
    Promise.all([
      supabase.from('calculator_settings').select('tax_rate').eq('organization_id', organizationId).eq('id', 'default').maybeSingle(),
      supabase.from('catalog_inventory_links').select('catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id', organizationId).eq('active', true),
      supabase.from('catalog_product_workflow_routes').select('catalog_product_id,workflow_code').eq('organization_id', organizationId).eq('active', true),
      supabase.from('production_workflow_templates').select('code,name').eq('organization_id', organizationId).eq('active', true).order('name'),
    ]).then(([taxRes, linksRes, routesRes, templatesRes]) => {
      if (!active) return;
      const rate = Number(taxRes.data?.tax_rate);
      if (Number.isFinite(rate) && rate >= 0 && rate <= 100) setConfiguredTaxRate(rate);
      if (!linksRes.error) setCatalogLinks(linksRes.data || []);
      if (!routesRes.error) {
        setProductWorkflowRoutes(
          Object.fromEntries((routesRes.data || []).map((row: any) => [row.catalog_product_id, row.workflow_code])),
        );
      }
      if (!templatesRes.error) setWorkflowTemplates(templatesRes.data || []);
    });
    return () => { active = false; };
  }, [organizationId]);

  // Load customer POS summary when customerId is selected
  useEffect(() => {
    if (!customerId || !supabase || !organizationId || !canSearchCustomers) {
      setCustomerSummary(null);
      return;
    }
    let active = true;
    supabase.rpc('get_visualcorp_pos_customer_summary', { p_customer_id: customerId }).then(({ data: result, error }) => {
      if (!active || error || !result) {
        if (active) setCustomerSummary(null);
        return;
      }
      setCustomerSummary({
        purchaseCount: Number(result.purchase_count) || 0,
        netSpent: Number(result.net_spent) || 0,
        balanceDue: Number(result.balance_due) || 0,
      });
    });
    return () => { active = false; };
  }, [customerId, organizationId, canSearchCustomers]);

  const loadHistory = async () => {
    if (!supabase || !organizationId || (!canViewQuotes && !canViewSales)) {
      setCentralQuotes([]);
      setCentralSales([]);
      return;
    }
    const quoteRequest = canViewQuotes
      ? supabase.from('central_quotes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null });
    const saleRequest = canViewSales
      ? supabase.from('sales').select('id,sale_code,status,total,created_at,branch_id,customer_id,customers(full_name),central_quote_id').eq('organization_id', organizationId).eq('status', 'confirmed').order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null });
    const [quoteResult, saleResult, exclusionsResult] = await Promise.all([
      quoteRequest,
      saleRequest,
      supabase.from('commercial_history_exclusions').select('document_kind,document_id').eq('organization_id', organizationId),
    ]);
    const error = quoteResult.error || saleResult.error || exclusionsResult.error;
    if (error) {
      setQuoteError(error.message);
      return;
    }
    const excluded = new Set((exclusionsResult.data || []).map((entry: any) => `${entry.document_kind}:${entry.document_id}`));
    setCentralQuotes((quoteResult.data || []).filter((entry: any) => !excluded.has(`quote:${entry.id}`)));
    setCentralSales((saleResult.data || []).filter((entry: any) => !excluded.has(`sale:${entry.id}`)));
    setQuoteError('');
  };

  useEffect(() => {
    void loadHistory();
  }, [organizationId, canViewQuotes, canViewSales]);

  // Stock & workflow helpers per catalog product (like POS)
  const getProductStockMeta = (productId: string) => {
    if (!productId) return { tone: 'neutral' as const, label: 'Concepto libre · no descuenta inventario' };
    const branchId = selectedBranch.id;
    const links = catalogLinks.filter((link) => link.active && link.catalog_product_id === productId && (!branchId || link.branch_id === branchId));
    if (!links.length) return { tone: 'neutral' as const, label: `Sin vínculo de stock en ${branchName}` };
    const primary = links[0];
    const stock = (data.inventory || []).find((row: any) => row.variantId === primary.inventory_variant_id && (!branchId || row.branchId === branchId) && !row.archived);
    if (!stock || stock.sourceStatus) return { tone: 'warning' as const, label: `Conteo físico pendiente en ${branchName}` };
    const available = Number(stock.availableQuantity ?? (Number(stock.quantity || 0) - Number(stock.reservedQuantity || 0)));
    const unit = stock.unit || 'und';
    if (available <= 0) return { tone: 'danger' as const, label: `Agotado en ${branchName} (0 ${unit})` };
    if (Number(stock.minimum || 0) > 0 && available <= Number(stock.minimum)) {
      return { tone: 'warning' as const, label: `Stock bajo en ${branchName}: ${available} ${unit}` };
    }
    return { tone: 'available' as const, label: `Disponible en ${branchName}: ${available} ${unit}` };
  };

  const getProductWorkflowLabel = (productId: string) => {
    if (!productId) return '';
    const code = productWorkflowRoutes[productId];
    if (!code) return '';
    return workflowTemplates.find((tpl) => tpl.code === code)?.name || code;
  };

  const historyItems = useMemo(() => [
    ...centralQuotes.map((document) => ({
      ...document,
      documentKind: 'quote' as const,
      documentCode: document.quote_code,
      customerLabel: document.customer_name || 'Sin cliente',
      amount: document.selected_total,
      date: document.created_at,
    })),
    ...centralSales.map((document) => ({
      ...document,
      documentKind: 'sale' as const,
      documentCode: document.sale_code,
      customerLabel: document.customers?.full_name || 'Sin cliente',
      amount: document.total,
      date: document.created_at,
    })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [centralQuotes, centralSales]);

  const filteredHistoryItems = useMemo(() => {
    const q = historyQuery.trim().toLocaleLowerCase('es');
    return historyItems.filter((doc) => {
      if (historyFilter === 'quotes' && doc.documentKind !== 'quote') return false;
      if (historyFilter === 'accepted' && !(doc.documentKind === 'quote' && doc.status === 'accepted')) return false;
      if (historyFilter === 'sales' && doc.documentKind !== 'sale') return false;
      if (!q) return true;
      const itemsText = Array.isArray(doc.items) ? doc.items.map((i: any) => i.name || i.product_name || '').join(' ') : '';
      return `${doc.documentCode || ''} ${doc.customerLabel || ''} ${itemsText}`.toLocaleLowerCase('es').includes(q);
    });
  }, [historyItems, historyQuery, historyFilter]);

  const removeFromHistory = async (document: any) => {
    if (!supabase || !organizationId || removingDocumentId) return;
    const isSale = document.documentKind === 'sale';
    const allowed = isSale ? canDeleteSales : canDeleteQuotes;
    if (!allowed) return;
    const subject = isSale ? 'venta' : 'cotización';
    const confirmed = await confirm({
      eyebrow: 'HISTORIAL COMERCIAL',
      title: `¿Quitar ${subject} ${document.documentCode} del historial del Cotizador?`,
      description: isSale
        ? 'La venta, pagos, devoluciones y movimientos de caja o inventario se conservarán para la auditoría.'
        : 'La cotización y su desglose se conservarán en el sistema; solo dejará de aparecer aquí.',
      tone: 'warning',
      destructive: true,
      confirmLabel: 'Quitar del historial',
      cancelLabel: 'Conservar registro',
      consequences: ['Los datos financieros y de auditoría se conservarán.'],
    });
    if (!confirmed) return;
    setRemovingDocumentId(document.id);
    setQuoteError('');
    try {
      const { error } = await supabase.rpc('remove_commercial_history_entry', {
        p_kind: document.documentKind,
        p_document_id: document.id,
      });
      if (error) throw error;
      if (isSale) setCentralSales((rows) => rows.filter((row) => row.id !== document.id));
      else setCentralQuotes((rows) => rows.filter((row) => row.id !== document.id));
      if (selectedDocument?.id === document.id && selectedDocument?.documentKind === document.documentKind) setSelectedDocument(null);
      flash(`${isSale ? 'Venta' : 'Cotización'} ${document.documentCode} retirada del historial.`);
    } catch (error: any) {
      setQuoteError(error.message || `No se pudo retirar ${subject} del historial.`);
    } finally { setRemovingDocumentId(''); }
  };

  // Load a saved quote back into the editor for editing / duplicating
  const loadQuoteIntoEditor = (quoteDoc: any) => {
    const items = Array.isArray(quoteDoc.items) ? quoteDoc.items : [];
    const docDetails = items.find((item: any) => item?.document_details)?.document_details || null;
    const restoredLines: QuoteDraftLine[] = items.length
      ? items.map((item: any) => {
          const isCustom = Boolean(item.custom || !item.product_id);
          const hasArea = Number(item.width_cm) > 0 && Number(item.height_cm) > 0;
          const customMode: 'quantity' | 'area' = isCustom && hasArea ? 'area' : 'quantity';
          return {
            id: newLineId(),
            productId: isCustom ? '' : String(item.product_id || ''),
            quantity: String(item.piece_quantity || item.quantity || 1),
            widthCm: String(item.width_cm || 100),
            heightCm: String(item.height_cm || 100),
            option: String(item.option || ''),
            concept: String(item.name || item.product_name || ''),
            additionalDescription: String(item.description || ''),
            additionalDescriptionHtml: String(item.description_html || '<p></p>'),
            custom: isCustom,
            customMode,
            customUnit: String(item.unit || (customMode === 'area' ? 'm²' : 'unidad')),
            customUnitPrice: isCustom ? String(item.unit_price || '') : '',
          };
        })
      : [createLine()];
    setLines(restoredLines);
    const chosenTier = reverseTierAliases[quoteDoc.chosen_tier || docDetails?.financial?.chosen_tier || 'pvp'] || 'pvp';
    setPriceTier(chosenTier);
    setCustomer(docDetails?.customer?.name || quoteDoc.customer_name || '');
    setCustomerId(docDetails?.customer?.customer_id || quoteDoc.customer_id || '');
    setPhone(docDetails?.customer?.phone || quoteDoc.customer_phone || '');
    setCustomerEmail(docDetails?.customer?.email || '');
    setCustomerDocument(docDetails?.customer?.document_reference || '');
    setJobName(docDetails?.job_name || '');
    setDeliveryDate(docDetails?.delivery_date || '');
    if (docDetails?.financial) {
      setApplyIVA(Boolean(docDetails.financial.iva_applied));
      setDiscountPercent(String(docDetails.financial.discount_percent || 0));
      setDiscountReason(String(docDetails.financial.discount_reason || ''));
      setShippingCost(String(docDetails.financial.shipping_cost || 0));
    }
    if (docDetails?.installation) {
      setInstallAddress(String(docDetails.installation.address || ''));
      setInstallMapUrl(String(docDetails.installation.maps_url || ''));
      setInstallFloor(String(docDetails.installation.floor || ''));
      setInstallHeight(String(docDetails.installation.height || ''));
      setInstallAccess(String(docDetails.installation.access || ''));
    }
    setProposalNotes(String(quoteDoc.notes || docDetails?.notes || ''));
    setClientBriefHtml(String(quoteDoc.client_brief_html || '<p></p>'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    flash(`Cotización ${quoteDoc.quote_code} cargada en el editor. Ajusta medidas, cantidades o condiciones y guarda una nueva versión.`);
  };

  const markQuoteAccepted = async (quoteDoc: any) => {
    if (!supabase || !organizationId || !canEditQuotes || updatingStatusId) return;
    setUpdatingStatusId(quoteDoc.id);
    try {
      const { error } = await supabase
        .from('central_quotes')
        .update({ status: 'accepted', price_confirmed: true })
        .eq('id', quoteDoc.id)
        .eq('organization_id', organizationId);
      if (error) throw error;
      setCentralQuotes((rows) => rows.map((row) => row.id === quoteDoc.id ? { ...row, status: 'accepted', price_confirmed: true } : row));
      flash(`Cotización ${quoteDoc.quote_code} marcada como Aceptada. Ya está lista para cobrarse en el POS.`);
    } catch (err: any) {
      flash(err?.message || 'No se pudo actualizar el estado de la cotización.');
    } finally {
      setUpdatingStatusId('');
    }
  };

  const configuredLines = useMemo(() => lines.map((line) => {
    const product = data.catalog.find((item: any) => item.id === line.productId);
    const isAreaMode = line.custom ? line.customMode === 'area' : product?.mode === 'area';
    const width = Number(line.widthCm);
    const height = Number(line.heightCm);
    const pieceQuantity = Number(line.quantity);
    const hasValidSize = !isAreaMode || (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0);
    const hasValidQuantity = Number.isInteger(pieceQuantity) && pieceQuantity > 0;
    const area = isAreaMode && hasValidSize ? (width * height) / 10000 : 0;
    const totalArea = isAreaMode && hasValidSize && hasValidQuantity ? area * pieceQuantity : 0;
    const perimeter = isAreaMode && hasValidSize ? (2 * (width + height)) / 100 : 0;
    const basis = line.custom
      ? (isAreaMode ? totalArea : pieceQuantity)
      : getQuoteBasis(product, { quantity: pieceQuantity, area });
    const customPrice = Number(line.customUnitPrice);
    const totals: Record<string, number | null> = Object.fromEntries(
      quoteTiers.map((tier) => [
        tier.id,
        line.custom
          ? Number.isFinite(customPrice) && customPrice > 0 && hasValidQuantity && hasValidSize && basis > 0
            ? roundMoney(customPrice * basis)
            : null
          : product && hasValidSize && hasValidQuantity
            ? calculateQuotePrice(product, tier.id, basis, line.option)
            : null,
      ]),
    );
    const unit = line.custom
      ? (isAreaMode ? 'm²' : line.customUnit || 'unidad')
      : isAreaMode ? 'm²' : product?.unit || 'unidad';
    const selectedSubtotal = totals[priceTier];
    const unitPrice = selectedSubtotal !== null && basis > 0 ? roundMoney(selectedSubtotal / basis) : null;
    const stockMeta = getProductStockMeta(line.custom ? '' : line.productId);
    const workflowLabel = getProductWorkflowLabel(line.custom ? '' : line.productId);
    return {
      ...line,
      product,
      isAreaMode,
      width,
      height,
      pieceQuantity,
      hasValidSize,
      hasValidQuantity,
      basis,
      area,
      totalArea,
      perimeter,
      totals,
      unit,
      unitPrice,
      stockMeta,
      workflowLabel,
      title: line.custom ? line.concept.trim() : line.concept.trim() || product?.name || '',
    };
  }), [lines, data.catalog, priceTier, catalogLinks, selectedBranch.id, data.inventory, productWorkflowRoutes, workflowTemplates]);

  const rawTierTotals = useMemo(() => Object.fromEntries(quoteTiers.map((tier) => {
    const complete = configuredLines.length > 0 && configuredLines.every((line) => (line.custom ? line.title : line.product) && line.hasValidSize && line.hasValidQuantity && line.totals[tier.id] !== null);
    return [tier.id, complete ? roundMoney(configuredLines.reduce((sum, line) => sum + (line.totals[tier.id] || 0), 0)) : null];
  })), [configuredLines]);

  const discountRate = Math.min(40, Math.max(0, Number(discountPercent) || 0));
  const effectiveTaxRate = Number.isFinite(configuredTaxRate) && configuredTaxRate > 0 ? configuredTaxRate : 15;
  const taxRate = applyIVA ? effectiveTaxRate : 0;
  const extraCost = Math.max(0, Number(shippingCost) || 0);

  const tierFinancials = useMemo(() => Object.fromEntries(quoteTiers.map((tier) => {
    const subtotal = rawTierTotals[tier.id];
    if (subtotal === null) return [tier.id, null];
    const discount = roundMoney(subtotal * discountRate / 100);
    const taxable = roundMoney(Math.max(0, subtotal - discount));
    const tax = roundMoney(taxable * taxRate / 100);
    const total = roundMoney(taxable + tax + extraCost);
    return [tier.id, { subtotal, discount, discountPercent: discountRate, taxable, taxRate, tax, shipping: roundMoney(extraCost), total }];
  })), [rawTierTotals, discountRate, taxRate, extraCost]);

  const tierTotals = useMemo(() => Object.fromEntries(quoteTiers.map((tier) => [tier.id, tierFinancials[tier.id]?.total ?? null])), [tierFinancials]);
  const allItemsSelected = configuredLines.every((line) => (line.custom ? line.title : line.product) && line.hasValidSize && line.hasValidQuantity && (!line.custom || Number(line.customUnitPrice) > 0));
  const pricesConfirmed = configuredLines.every((line) => line.custom || line.product?.confirmed || line.product?.published === true);
  const selectedTotal = tierTotals[priceTier];
  const selectedFinancials = tierFinancials[priceTier];
  const selectedTierLabel = quoteTiers.find((tier) => tier.id === priceTier)?.label || 'Normal';
  const printIssuedAt = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' }).format(new Date());
  const printDeliveryDate = deliveryDate
    ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' }).format(new Date(`${deliveryDate}T12:00:00`))
    : '';

  // Per-line financial distribution (Subtotal, Discount, IVA, Total per line)
  const lineFinancials = useMemo(() => {
    const weights = configuredLines.map((line) => line.totals[priceTier] || 0);
    if (!selectedFinancials) {
      return configuredLines.map((line) => ({
        subtotal: line.totals[priceTier],
        discount: 0,
        tax: 0,
        shipping: 0,
        total: line.totals[priceTier],
      }));
    }
    const discounts = distributeMoney(selectedFinancials.discount, weights);
    const taxWeights = configuredLines.map((line, idx) => Math.max(0, (line.totals[priceTier] || 0) - (discounts[idx] || 0)));
    const taxes = distributeMoney(selectedFinancials.tax, taxWeights);
    const shippings = distributeMoney(selectedFinancials.shipping, weights);
    const totals = distributeMoney(selectedFinancials.total, weights);
    return configuredLines.map((line, idx) => ({
      subtotal: line.totals[priceTier],
      discount: discounts[idx] || 0,
      tax: taxes[idx] || 0,
      shipping: shippings[idx] || 0,
      total: totals[idx] ?? line.totals[priceTier],
    }));
  }, [configuredLines, selectedFinancials, priceTier]);

  const totalPiecesCount = useMemo(
    () => configuredLines.reduce((sum, line) => sum + (Number.isFinite(line.pieceQuantity) && line.pieceQuantity > 0 ? line.pieceQuantity : 0), 0),
    [configuredLines],
  );
  const totalSurfaceArea = useMemo(
    () => roundMoney(configuredLines.reduce((sum, line) => sum + (line.isAreaMode ? line.totalArea : 0), 0)),
    [configuredLines],
  );

  const depositRate = Math.min(100, Math.max(0, Number(depositPercent) || 50));
  const depositAmount = selectedTotal !== null ? roundMoney((selectedTotal * depositRate) / 100) : null;
  const remainingBalance = selectedTotal !== null && depositAmount !== null ? roundMoney(Math.max(0, selectedTotal - depositAmount)) : null;

  const quoteCanSave = canEditQuotes
    && allItemsSelected
    && selectedTotal !== null
    && !saving
    && (!installMapUrl || isGoogleMapsUrl(installMapUrl))
    && (priceTier !== 'instalacion' || installAddress.trim())
    && proposalNotes.length <= 1200
    && discountReason.length <= 300
    && (discountRate === 0 || discountReason.trim().length >= 3);

  const buildWhatsAppText = () => {
    if (!selectedFinancials || !allItemsSelected || !pricesConfirmed) return '';
    const advisor = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Visual Corp';
    return buildOperationalQuoteWhatsAppMessage({
      advisor,
      customer,
      tierLabel: quoteTiers.find((tier) => tier.id === priceTier)?.label || 'Normal',
      items: configuredLines.map((line) => {
        const baseTotal = !line.custom && line.product ? calculateQuotePrice(line.product, priceTier, line.basis, '') : line.totals[priceTier];
        return {
          name: line.title,
          dimensions: line.isAreaMode ? `${line.width} × ${line.height} cm` : '',
          areaPerPiece: line.area || 0,
          totalArea: line.totalArea || 0,
          quantity: line.pieceQuantity,
          unit: line.isAreaMode ? 'pieza' : line.unit,
          rate: line.basis > 0 ? Number(baseTotal || 0) / line.basis : null,
          rateUnit: line.unit,
          option: line.option,
          optionAmount: Math.max(0, Number(line.totals[priceTier] || 0) - Number(baseTotal || 0)),
          description: line.additionalDescription,
          lineTotal: line.totals[priceTier],
        };
      }),
      subtotal: selectedFinancials.subtotal,
      discountAmount: selectedFinancials.discount,
      discountPercent: selectedFinancials.discountPercent,
      discountReason,
      taxRate,
      taxAmount: selectedFinancials.tax,
      otherCharges: selectedFinancials.shipping,
      total: selectedFinancials.total,
      deliveryDate,
    });
  };

  const copyQuoteWhatsApp = async () => {
    const message = buildWhatsAppText();
    if (!message) return;
    try {
      await copyTextToClipboard(message);
      flash('Desglose completo copiado para WhatsApp (con medidas, subtotal, IVA y total).');
    } catch (error: any) {
      flash(error?.message || 'No se pudo copiar el mensaje.');
    }
  };

  const openDirectWhatsApp = () => {
    const message = buildWhatsAppText();
    if (!message) return;
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const url = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const moveLine = (lineId: string, direction: -1 | 1) => setLines((current) => {
    const index = current.findIndex((line) => line.id === lineId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return reordered;
  });

  const duplicateLine = (line: QuoteDraftLine) => setLines((current) => current.length >= MAX_QUOTE_ITEMS ? current : [...current, { ...line, id: newLineId() }]);
  const updateLine = (lineId: string, changes: Partial<QuoteDraftLine>) => setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...changes } : line));

  const stepLineField = (lineId: string, field: 'quantity' | 'widthCm' | 'heightCm', delta: number, min: number, precision = 0) => {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const raw = Number(line[field]);
      const base = Number.isFinite(raw) ? raw : min;
      const next = Math.max(min, Number((base + delta).toFixed(precision)));
      return { ...line, [field]: String(next) };
    }));
  };

  const resetForm = () => {
    setLines([createLine()]);
    setPriceTier('pvp');
    setCustomer('');
    setCustomerId('');
    setPhone('');
    setCustomerEmail('');
    setCustomerDocument('');
    setJobName('');
    setDeliveryDate('');
    setValidityDays('15');
    setDepositPercent('50');
    setApplyIVA(true);
    setDiscountPercent('0');
    setDiscountReason('');
    setShippingCost('0');
    setInstallAddress('');
    setInstallMapUrl('');
    setInstallFloor('');
    setInstallHeight('');
    setInstallAccess('');
    setProposalNotes('');
    setClientBriefHtml('<p></p>');
    documentAssets.forEach((asset) => asset.previewUrl && URL.revokeObjectURL(asset.previewUrl));
    setDocumentAssets([]);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quoteCanSave || !supabase || !organizationId || !selectedFinancials) return;
    setSaving(true);
    setQuoteError('');
    try {
      const chosen = tierAliases[priceTier] || 'normal';
      const chosenFinancials = selectedFinancials;
      const chosenLineTotals = distributeMoney(chosenFinancials.total, configuredLines.map((line) => line.totals[priceTier] || 0));
      const chosenDiscounts = distributeMoney(chosenFinancials.discount, configuredLines.map((line) => line.totals[priceTier] || 0));
      const chosenTaxes = distributeMoney(chosenFinancials.tax, configuredLines.map((line, index) => Math.max(0, (line.totals[priceTier] || 0) - (chosenDiscounts[index] || 0))));
      const chosenShipping = distributeMoney(chosenFinancials.shipping, configuredLines.map((line) => line.totals[priceTier] || 0));
      const itemPayload = configuredLines.map((line, index) => ({
        product_id: line.custom ? null : line.product.id,
        name: line.title,
        description: line.additionalDescription.trim(),
        description_html: line.additionalDescriptionHtml || '<p></p>',
        category: line.custom ? 'Concepto libre' : line.product.family,
        quantity: line.basis,
        piece_quantity: line.pieceQuantity,
        unit: line.unit,
        unit_price: line.totals[priceTier] === null || line.basis <= 0 ? null : roundMoney((line.totals[priceTier] || 0) / line.basis),
        total: pricesConfirmed ? chosenLineTotals[index] : null,
        subtotal: line.totals[priceTier],
        discount_amount: chosenDiscounts[index],
        tax_rate: taxRate,
        tax_amount: chosenTaxes[index],
        shipping_share: chosenShipping[index],
        normal_total: line.totals.pvp,
        installation_total: line.totals.instalacion,
        corporate_total: line.totals.corporativo,
        price_tier: priceTier,
        option: line.option || null,
        width_cm: line.isAreaMode ? line.width : null,
        height_cm: line.isAreaMode ? line.height : null,
        sku: line.custom ? '' : line.product.sku || '',
        image: line.custom ? null : line.product.image || null,
        custom: line.custom,
      }));
      const documentDetails = {
        version: 1,
        branch_code: branchCode,
        customer: {
          name: customer.trim(),
          phone: phone.trim(),
          email: customerEmail.trim(),
          document_reference: customerDocument.trim(),
          customer_id: customerId || null,
        },
        job_name: jobName.trim(),
        delivery_date: deliveryDate || null,
        validity_days: Number(validityDays) || 15,
        deposit_percent: depositRate,
        financial: {
          chosen_tier: chosen,
          subtotal: chosenFinancials.subtotal,
          discount_percent: chosenFinancials.discountPercent,
          discount_amount: chosenFinancials.discount,
          discount_reason: discountReason.trim(),
          iva_applied: applyIVA,
          iva_rate: taxRate,
          iva_amount: chosenFinancials.tax,
          shipping_cost: chosenFinancials.shipping,
          total: chosenFinancials.total,
          deposit_percent: depositRate,
          deposit_amount: depositAmount,
          balance_amount: remainingBalance,
          tiers: tierFinancials,
        },
        installation: {
          required: priceTier === 'instalacion',
          address: installAddress.trim(),
          maps_url: normalizeGoogleMapsUrl(installMapUrl),
          floor: installFloor.trim(),
          height: installHeight.trim(),
          access: installAccess.trim(),
        },
        notes: proposalNotes.trim(),
      };
      const itemsWithDocumentDetails = itemPayload.map((item, index) => index === 0 ? { ...item, document_details: documentDetails } : item);
      const notes = proposalNotes.trim();
      const payloadBytes = new TextEncoder().encode(JSON.stringify(itemsWithDocumentDetails)).length;
      if (payloadBytes > 45000) throw new Error('La propuesta supera el tamaño permitido. Reduce la cantidad de artículos o acorta sus conceptos.');
      if (notes.length > 1200 || new TextEncoder().encode(JSON.stringify(documentDetails)).length > 16000) throw new Error('Los detalles de la propuesta superan el tamaño permitido. Acorta las notas o descripciones.');
      const { data: result, error } = await supabase.rpc('create_central_quote', {
        p_customer_id: customerId || null,
        p_customer_name: customer.trim(),
        p_customer_phone: phone.trim(),
        p_items: itemsWithDocumentDetails,
        p_normal: tierTotals.pvp,
        p_installation: tierTotals.instalacion,
        p_corporate: tierTotals.corporativo,
        p_chosen: chosen,
        p_selected: pricesConfirmed ? selectedTotal : null,
        p_confirmed: pricesConfirmed,
        p_notes: notes,
        p_client_brief_html: clientBriefHtml,
      });
      if (error) throw error;
      if (documentAssets.length) await persistCommercialAssets({ organizationId, documentId: result.id, kind: 'quote', assets: documentAssets });
      await loadHistory();
      resetForm();
      flash(`Cotización ${result.quote_code} guardada con ${itemPayload.length} ${itemPayload.length === 1 ? 'artículo' : 'artículos'}.`);
    } catch (error: any) {
      setQuoteError(error.message || 'No se pudo sincronizar la cotización.');
    } finally { setSaving(false); }
  };

  const acceptedQuotesCount = useMemo(
    () => centralQuotes.filter((q) => q.status === 'accepted' && q.price_confirmed).length,
    [centralQuotes],
  );
  const totalQuotedAmount = useMemo(
    () => roundMoney(centralQuotes.reduce((sum, q) => sum + (Number(q.selected_total) || 0), 0)),
    [centralQuotes],
  );
  const areaCatalogCount = useMemo(
    () => (data.catalog || []).filter((p: any) => p.mode === 'area').length,
    [data.catalog],
  );
  const unitCatalogCount = useMemo(
    () => (data.catalog || []).filter((p: any) => p.mode !== 'area').length,
    [data.catalog],
  );

  return <AppFrame area="operations">
    <PageHeading
      eyebrow="COTIZADOR · SISTEMA CONECTADO CON POS E INVENTARIO"
      title="Prepara una propuesta completa."
      description="Configura productos por unidad o medidas en m², visualiza subtotales, descuentos e IVA en vivo y sincroniza directo con el Punto de Venta."
      action={
        <div className="oq-heading-actions">
          <Link className="button button-outline" to="/operaciones/pos"><ShoppingCart size={15}/> Ir al POS</Link>
          <Link className="button button-outline" to="/seguimiento"><ShieldCheck size={15}/> Portal aprobación</Link>
          <button className="button button-outline" type="button" onClick={() => window.print()}><Printer size={15}/> Imprimir proforma</button>
        </div>
      }
    />

    {/* Barra de Ecosistema Conectado (como el POS) */}
    <section className="oq-ecosystem-bar" aria-label="Conexiones operativas del Cotizador">
      <div className="oq-eco-card is-branch">
        <span className="oq-eco-icon"><Store size={16}/></span>
        <div className="oq-eco-copy">
          <small>SUCURSAL DE REFERENCIA</small>
          <div className="oq-branch-pills" role="group" aria-label="Cambiar sucursal para consulta de stock">
            {((data.branches && data.branches.length) ? data.branches : [{ id: 'vis', code: 'VIS', name: 'Visual Corp' }, { id: 'giga', code: 'GIGA', name: 'Gigaprint' }]).map((branch: any) => (
              <button
                key={branch.code}
                type="button"
                className={`oq-branch-pill${branchCode === branch.code ? ' is-active' : ''}`}
                aria-pressed={branchCode === branch.code}
                onClick={() => setBranchCode(branch.code)}
              >
                {branch.name || branch.code}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="oq-eco-card">
        <span className="oq-eco-icon is-violet"><ShoppingBag size={16}/></span>
        <div className="oq-eco-copy">
          <small>CATÁLOGO Y TARIFAS</small>
          <b>{data.catalog.length} productos ({unitCatalogCount} und · {areaCatalogCount} m²)</b>
          <Link to="/operaciones/catalogo" className="oq-eco-link">Administrar tarifas <ArrowUpRight size={12}/></Link>
        </div>
      </div>

      <div className="oq-eco-card">
        <span className="oq-eco-icon is-emerald"><Boxes size={16}/></span>
        <div className="oq-eco-copy">
          <small>STOCK EN VIVO · {branchName.toUpperCase()}</small>
          <b>{catalogLinks.length} vínculos de inventario activos</b>
          <Link to="/operaciones/inventario" className="oq-eco-link">Ver existencias y rollos <ArrowUpRight size={12}/></Link>
        </div>
      </div>

      <div className="oq-eco-card">
        <span className="oq-eco-icon is-blue"><Calculator size={16}/></span>
        <div className="oq-eco-copy">
          <small>IMPUESTOS Y DESGLOSE</small>
          <b>IVA {effectiveTaxRate}% · {applyIVA ? 'Aplicado en vivo' : 'Modo sin IVA'}</b>
          <button type="button" className="oq-eco-link-btn" onClick={() => setApplyIVA((v) => !v)}>
            {applyIVA ? 'Cambiar a sin IVA' : `Activar IVA ${effectiveTaxRate}%`}
          </button>
        </div>
      </div>
    </section>

    <div className="stat-grid compact-stats">
      <StatCard
        label="Propuestas registradas"
        value={centralQuotes.length}
        icon={FileText}
        note={`Valor cotizado: ${formatMoney(totalQuotedAmount)}`}
        tone="violet"
      />
      <StatCard
        label="Listas para cobrar en POS"
        value={acceptedQuotesCount}
        icon={CheckCircle2}
        note="Aprobadas con tarifa confirmada"
        tone="blue"
      />
      <StatCard
        label="Propuesta actual"
        value={selectedTotal === null ? '$0,00' : formatMoney(selectedTotal)}
        icon={Wallet}
        note={`${lines.length} ${lines.length === 1 ? 'línea' : 'líneas'} · ${totalPiecesCount} pzs${totalSurfaceArea > 0 ? ` · ${totalSurfaceArea.toFixed(2)} m²` : ''}`}
        tone="amber"
      />
    </div>

    <div className="operations-quote-layout">
      <form className="panel form-panel operations-quote-form" onSubmit={save}>
        {/* SECCIÓN 1: CLIENTE Y ENCABEZADO DEL PROYECTO (Arriba, igual que en el POS) */}
        <section className="oq-customer-top-panel" aria-label="Cliente y datos del proyecto">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">1 · CLIENTE Y REFERENCIA DEL PROYECTO</span>
              <h2>Datos del cliente y entrega</h2>
              <p className="operations-quote-intro">Busca un cliente existente o escribe sus datos para la proforma y el envío por WhatsApp.</p>
            </div>
            <div className="oq-customer-header-actions">
              {customerId && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setChatterTarget({
                    recordType: 'customer',
                    recordId: customerId,
                    recordTitle: customer || 'Cliente',
                    recordSubtitle: customerDocument ? `RUC/CI: ${customerDocument}` : customerEmail || 'Cliente Visual Corp',
                    recordPhone: phone,
                    recordStage: customerSummary?.balanceDue > 0 ? 'Saldo pendiente' : 'Cuenta activa',
                  })}
                >
                  <Sparkles size={14}/> Ficha 360°
                </button>
              )}
              {(customer || lines.length > 1 || lines[0]?.productId || lines[0]?.concept) && (
                <button type="button" className="button button-outline" onClick={resetForm}>
                  <RefreshCw size={14}/> Limpiar todo
                </button>
              )}
            </div>
          </div>

          <div className="quote-customer-fields">
            <QuoteCustomerPicker
              customers={canSearchCustomers ? data.customers || [] : []}
              customerId={customerId}
              value={customer}
              onNameChange={(value) => {
                setCustomer(value);
                setCustomerId('');
              }}
              onSelect={(selectedCustomer) => {
                setCustomerId(selectedCustomer?.id || '');
                if (selectedCustomer) {
                  setCustomer(selectedCustomer.name);
                  setPhone(selectedCustomer.phone || '');
                  setCustomerEmail(selectedCustomer.email || '');
                  setCustomerDocument(selectedCustomer.documentReference || '');
                }
              }}
            />
            <label>
              Teléfono / WhatsApp
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="099…" />
            </label>
            <label>
              Correo electrónico
              <input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="cliente@empresa.com" />
            </label>
            <label>
              Cédula o RUC
              <input value={customerDocument} onChange={(event) => setCustomerDocument(event.target.value)} placeholder="0999999999001" />
            </label>
            <label>
              Nombre o referencia del trabajo
              <input maxLength={160} value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Ej. Rótulo fachada + 50 camisetas" />
            </label>
            <div className="operations-quote-date-field">
              <span>Fecha de entrega estimada</span>
              <DatePicker className="operations-quote-date-picker" label="Fecha de entrega solicitada" value={deliveryDate} onChange={setDeliveryDate} cellSize="compact" />
            </div>
          </div>

          {customerSummary && (
            <div className="oq-customer-live-strip" role="status">
              <span><Users size={14}/> Historial de <b>{customer}</b>:</span>
              <span>Compras: <b>{customerSummary.purchaseCount}</b></span>
              <span>Facturación (LTV): <b>{formatMoney(customerSummary.netSpent)}</b></span>
              <span className={customerSummary.balanceDue > 0 ? 'is-due' : 'is-clear'}>
                Saldo pendiente: <b>{formatMoney(customerSummary.balanceDue)}</b>
              </span>
            </div>
          )}
        </section>

        {/* SECCIÓN 2: ARTÍCULOS, MEDIDAS Y ESCALAS (Como el POS) */}
        <div className="panel-heading oq-items-heading">
          <div>
            <span className="eyebrow">2 · ARTÍCULOS, MEDIDAS Y SUPERFICIE</span>
            <h2>Líneas de la cotización</h2>
            <p className="operations-quote-intro">Cada renglón calcula sus propias medidas en cm / m², precio unitario, subtotal e IVA proporcional.</p>
          </div>
          <div className="oq-items-heading-meta">
            <span className="operations-quote-count">{lines.length} / {MAX_QUOTE_ITEMS} artículos</span>
            {totalSurfaceArea > 0 && <span className="operations-quote-count is-area"><Ruler size={12}/> {totalSurfaceArea.toFixed(2)} m² totales</span>}
          </div>
        </div>

        {favoriteStorageStatus === 'local' && <small className="muted">Tus productos favoritos (★) se guardan en este navegador.</small>}

        <div className="operations-quote-lines">
          {configuredLines.map((line, index) => {
            const lineFin = lineFinancials[index];
            const activePreset = COMMON_SIZE_PRESETS.find((preset) => line.width === preset.width && line.height === preset.height);
            return (
              <section className="operations-quote-line" key={line.id} aria-labelledby={`operations-quote-line-${line.id}`}>
                <div className="operations-quote-line-heading">
                  <div className="oq-line-title-wrap">
                    <div className="oq-line-eyebrow-row">
                      <span>{line.custom ? 'CONCEPTO LIBRE / PERSONALIZADO' : `ARTÍCULO ${String(index + 1).padStart(2, '0')}`}</span>
                      {line.isAreaMode && line.hasValidSize && (
                        <span className="oq-line-badge is-measure">
                          <Ruler size={11}/> {line.width}×{line.height} cm ({(line.width / 100).toFixed(2)}×{(line.height / 100).toFixed(2)} m) · {line.totalArea.toFixed(2)} m²
                        </span>
                      )}
                      {line.workflowLabel && (
                        <span className="oq-line-badge is-workflow">
                          <Route size={11}/> {line.workflowLabel}
                        </span>
                      )}
                      <span className={`oq-line-badge is-stock-${line.stockMeta.tone}`}>
                        {line.stockMeta.label}
                      </span>
                    </div>
                    <h3 id={`operations-quote-line-${line.id}`}>
                      {line.title || line.product?.name || `Artículo ${index + 1}`}
                    </h3>
                  </div>

                  <div className="operations-quote-line-actions">
                    <button
                      className="operations-quote-icon-button"
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveLine(line.id, -1)}
                      aria-label={`Mover artículo ${index + 1} arriba`}
                      title="Mover arriba"
                    >
                      <ArrowUp size={15}/>
                    </button>
                    <button
                      className="operations-quote-icon-button"
                      type="button"
                      disabled={index === lines.length - 1}
                      onClick={() => moveLine(line.id, 1)}
                      aria-label={`Mover artículo ${index + 1} abajo`}
                      title="Mover abajo"
                    >
                      <ArrowDown size={15}/>
                    </button>
                    <button
                      className="operations-quote-icon-button"
                      type="button"
                      disabled={lines.length >= MAX_QUOTE_ITEMS}
                      onClick={() => duplicateLine(line)}
                      aria-label={`Duplicar artículo ${index + 1}`}
                      title="Duplicar línea (para otra medida o acabado)"
                    >
                      <Copy size={15}/>
                    </button>
                    {lines.length > 1 && (
                      <button
                        className="operations-quote-remove"
                        type="button"
                        onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}
                        aria-label={`Quitar artículo ${index + 1}`}
                      >
                        <Trash2 size={15}/><span>Quitar</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Selector de Producto o Modo de Concepto Libre */}
                {line.custom ? (
                  <div className="oq-custom-line-config">
                    <div className="oq-custom-mode-switch" role="group" aria-label="Modo de cálculo del concepto libre">
                      <button
                        type="button"
                        className={line.customMode !== 'area' ? 'is-active' : ''}
                        onClick={() => updateLine(line.id, { customMode: 'quantity', customUnit: line.customUnit === 'm²' ? 'unidad' : line.customUnit })}
                      >
                        Por cantidad / unidad
                      </button>
                      <button
                        type="button"
                        className={line.customMode === 'area' ? 'is-active' : ''}
                        onClick={() => updateLine(line.id, { customMode: 'area', customUnit: 'm²' })}
                      >
                        <Ruler size={13}/> Por medidas (m²)
                      </button>
                    </div>
                    <div className="operations-quote-fields">
                      <label>
                        Concepto o producto personalizado
                        <input
                          required
                          maxLength={160}
                          value={line.concept}
                          onChange={(event) => updateLine(line.id, { concept: event.target.value })}
                          placeholder="Ej. Estructura metálica, rótulo especial, diseño…"
                        />
                      </label>
                      <label>
                        {line.isAreaMode ? 'Precio acordado por m² ($)' : 'Precio acordado por unidad ($)'}
                        <input
                          required
                          min="0.01"
                          step="0.01"
                          type="number"
                          value={line.customUnitPrice}
                          onChange={(event) => updateLine(line.id, { customUnitPrice: event.target.value })}
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <QuoteProductPicker
                    idPrefix={`operations-quote-product-${line.id}`}
                    products={data.catalog}
                    selected={line.product}
                    onSelect={(product) => updateLine(line.id, { productId: product?.id || '', option: '' })}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={toggleFavorite}
                  />
                )}

                {/* Controles de Medidas y Superficie tipo POS (para productos m² o conceptos libres por área) */}
                {(line.custom || line.product) && line.isAreaMode && (
                  <div className="oq-pos-measurement-box">
                    <div className="oq-pos-measurement-head">
                      <span className="oq-pos-measurement-icon"><Ruler size={16}/></span>
                      <div>
                        <span className="eyebrow">CÁLCULO POR SUPERFICIE (CM → M²)</span>
                        <h4>Medidas de la pieza y cantidad</h4>
                      </div>
                      {activePreset && <span className="oq-preset-active-badge"><Check size={12}/> {activePreset.title} ({activePreset.label})</span>}
                    </div>

                    <div className="oq-size-presets-row" role="group" aria-label={`Tamaños frecuentes para ${line.title || 'artículo'}`}>
                      {COMMON_SIZE_PRESETS.map((preset) => {
                        const isSelected = line.width === preset.width && line.height === preset.height;
                        return (
                          <button
                            key={`${preset.width}x${preset.height}`}
                            type="button"
                            className={`oq-size-preset-btn${isSelected ? ' is-active' : ''}`}
                            onClick={() => updateLine(line.id, { widthCm: String(preset.width), heightCm: String(preset.height) })}
                          >
                            <span>{preset.title}</span>
                            <b>{preset.label}</b>
                          </button>
                        );
                      })}
                    </div>

                    <div className="oq-measure-steppers-grid">
                      <div className="oq-measure-field">
                        <label>Ancho por pieza <span>{(line.width > 0 ? (line.width / 100).toFixed(2) : '0.00')} m</span></label>
                        <div className="oq-stepper-input">
                          <button type="button" onClick={() => stepLineField(line.id, 'widthCm', -10, 1, 2)} aria-label="Reducir ancho 10 cm"><Minus size={14}/></button>
                          <input
                            required
                            min="1"
                            step="any"
                            type="number"
                            value={line.widthCm}
                            onChange={(event) => updateLine(line.id, { widthCm: event.target.value })}
                          />
                          <span className="oq-unit-tag">cm</span>
                          <button type="button" onClick={() => stepLineField(line.id, 'widthCm', 10, 1, 2)} aria-label="Aumentar ancho 10 cm"><Plus size={14}/></button>
                        </div>
                      </div>

                      <div className="oq-measure-field">
                        <label>Alto por pieza <span>{(line.height > 0 ? (line.height / 100).toFixed(2) : '0.00')} m</span></label>
                        <div className="oq-stepper-input">
                          <button type="button" onClick={() => stepLineField(line.id, 'heightCm', -10, 1, 2)} aria-label="Reducir alto 10 cm"><Minus size={14}/></button>
                          <input
                            required
                            min="1"
                            step="any"
                            type="number"
                            value={line.heightCm}
                            onChange={(event) => updateLine(line.id, { heightCm: event.target.value })}
                          />
                          <span className="oq-unit-tag">cm</span>
                          <button type="button" onClick={() => stepLineField(line.id, 'heightCm', 10, 1, 2)} aria-label="Aumentar alto 10 cm"><Plus size={14}/></button>
                        </div>
                      </div>

                      <div className="oq-measure-field">
                        <label>Cantidad de piezas <span>iguales</span></label>
                        <div className="oq-stepper-input">
                          <button type="button" onClick={() => stepLineField(line.id, 'quantity', -1, 1, 0)} aria-label="Reducir piezas"><Minus size={14}/></button>
                          <input
                            required
                            min="1"
                            step="1"
                            type="number"
                            value={line.quantity}
                            onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                          />
                          <span className="oq-unit-tag">pzs</span>
                          <button type="button" onClick={() => stepLineField(line.id, 'quantity', 1, 1, 0)} aria-label="Aumentar piezas"><Plus size={14}/></button>
                        </div>
                      </div>
                    </div>

                    <div className="oq-surface-metrics-strip" aria-label="Métricas de superficie">
                      <div>
                        <span>Medidas en metros</span>
                        <b>{line.hasValidSize ? `${(line.width / 100).toFixed(2)} × ${(line.height / 100).toFixed(2)} m` : '—'}</b>
                      </div>
                      <div>
                        <span>Área por pieza</span>
                        <b>{line.hasValidSize ? `${line.area.toFixed(2)} m²` : '—'}</b>
                      </div>
                      <div className="is-highlight">
                        <span>Área total facturable</span>
                        <b>{line.hasValidSize && line.hasValidQuantity ? `${line.totalArea.toFixed(2)} m²` : 'Completa medidas'}</b>
                      </div>
                      <div>
                        <span>Perímetro (1 pza)</span>
                        <b>{line.hasValidSize ? `${line.perimeter.toFixed(2)} m lin.` : '—'}</b>
                      </div>
                    </div>

                    <div className="operations-quote-wide">
                      <MeasurementPreview widthCm={Number(line.widthCm)} heightCm={Number(line.heightCm)} pieces={line.pieceQuantity}/>
                    </div>
                  </div>
                )}

                {/* Controles de Cantidad para productos o conceptos por unidad */}
                {(line.custom || line.product) && !line.isAreaMode && (
                  <div className="oq-quantity-row">
                    <div className="oq-measure-field">
                      <label>Cantidad ({line.unit})</label>
                      <div className="oq-stepper-input">
                        <button type="button" onClick={() => stepLineField(line.id, 'quantity', -1, 1, 0)} aria-label="Reducir cantidad"><Minus size={14}/></button>
                        <input
                          required
                          min="1"
                          step="1"
                          type="number"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                        />
                        <span className="oq-unit-tag">{line.unit}</span>
                        <button type="button" onClick={() => stepLineField(line.id, 'quantity', 1, 1, 0)} aria-label="Aumentar cantidad"><Plus size={14}/></button>
                      </div>
                      <div className="oq-qty-presets">
                        {QUANTITY_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={Number(line.quantity) === preset ? 'is-active' : ''}
                            onClick={() => updateLine(line.id, { quantity: String(preset) })}
                          >
                            ×{preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {line.custom ? (
                      <label>
                        Unidad de medida
                        <input
                          maxLength={40}
                          value={line.customUnit}
                          onChange={(event) => updateLine(line.id, { customUnit: event.target.value })}
                          placeholder="unidad, servicio, rollo, metro…"
                        />
                      </label>
                    ) : (
                      <label>
                        Concepto personalizado para esta línea (opcional)
                        <input
                          maxLength={160}
                          value={line.concept}
                          onChange={(event) => updateLine(line.id, { concept: event.target.value })}
                          placeholder={line.product?.name || 'Nombre en la proforma'}
                        />
                      </label>
                    )}
                  </div>
                )}

                {!line.custom && line.product && line.isAreaMode && (
                  <label className="oq-concept-override">
                    Concepto o título personalizado para esta línea (opcional)
                    <input
                      maxLength={160}
                      value={line.concept}
                      onChange={(event) => updateLine(line.id, { concept: event.target.value })}
                      placeholder={line.product.name}
                    />
                  </label>
                )}

                {!line.custom && line.product?.optionPrices?.length > 0 && (
                  <label className="operations-quote-option">
                    Material / acabado del catálogo
                    <select value={line.option} onChange={(event) => updateLine(line.id, { option: event.target.value })}>
                      <option value="">Usar tarifa base del producto</option>
                      {line.product.optionPrices.map((option: any, optionIndex: number) => (
                        <option key={`${option.label}-${optionIndex}`} value={option.label}>
                          {option.label} · {formatMoney(option.price)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {(line.custom || line.product) && (
                  <label className="operations-quote-line-description">
                    Especificaciones técnicas / acabados (aparece en proforma y WhatsApp)
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={line.additionalDescription}
                      onChange={(event) => updateLine(line.id, { additionalDescription: event.target.value })}
                      placeholder="Ej. Ojales cada 50 cm, bolsillo superior/inferior, laminado mate, corte a registro…"
                    />
                  </label>
                )}

                {/* Mini-comparador de las 3 tarifas y desglose financiero por renglón */}
                {(line.custom || line.product) && (
                  <div className="oq-line-financial-footer">
                    <div className="oq-line-tier-pills" role="group" aria-label="Valores del artículo por tarifa">
                      {quoteTiers.map((tier) => (
                        <button
                          key={tier.id}
                          type="button"
                          className={`oq-line-tier-pill${priceTier === tier.id ? ' is-selected' : ''}`}
                          onClick={() => setPriceTier(tier.id)}
                        >
                          <small>{tier.label}</small>
                          <b>{line.totals[tier.id] === null ? 'N/D' : formatMoney(line.totals[tier.id])}</b>
                        </button>
                      ))}
                    </div>

                    <div className="oq-line-breakdown-chips">
                      <span>
                        Tarifa unitaria: <b>{line.unitPrice === null ? '—' : `${formatMoney(line.unitPrice)} / ${line.unit}`}</b>
                      </span>
                      <span>
                        Subtotal línea: <b>{lineFin?.subtotal === null ? '—' : formatMoney(lineFin?.subtotal)}</b>
                      </span>
                      {lineFin && lineFin.discount > 0 && (
                        <span className="is-discount">
                          Desc. ({discountRate}%): <b>−{formatMoney(lineFin.discount)}</b>
                        </span>
                      )}
                      {applyIVA && lineFin && lineFin.subtotal !== null && (
                        <span className="is-tax">
                          IVA ({taxRate}%): <b>+{formatMoney(lineFin.tax)}</b>
                        </span>
                      )}
                      <span className="is-line-total">
                        Total línea: <strong>{lineFin?.total === null ? 'Tarifa no disponible' : formatMoney(lineFin.total)}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {!line.custom && line.product && !line.product.confirmed && line.product.published !== true && (
                  <p className="operations-quote-pending" role="status">
                    <CircleHelp size={14}/> Precio del catálogo pendiente de validación.
                  </p>
                )}
              </section>
            );
          })}
        </div>

        <div className="oq-add-buttons-row">
          <button
            className="button button-outline operations-quote-add"
            disabled={lines.length >= MAX_QUOTE_ITEMS}
            type="button"
            onClick={() => setLines((current) => [...current, createLine(false)])}
          >
            <Plus size={16}/> Añadir producto del catálogo
          </button>
          <button
            className="button button-outline operations-quote-add"
            disabled={lines.length >= MAX_QUOTE_ITEMS}
            type="button"
            onClick={() => setLines((current) => [...current, createLine(true, 'quantity')])}
          >
            <Plus size={16}/> Añadir concepto libre (unidad)
          </button>
          <button
            className="button button-outline operations-quote-add"
            disabled={lines.length >= MAX_QUOTE_ITEMS}
            type="button"
            onClick={() => setLines((current) => [...current, createLine(true, 'area')])}
          >
            <Ruler size={16}/> Añadir concepto libre por medidas (m²)
          </button>
        </div>
        {lines.length >= MAX_QUOTE_ITEMS && <p className="operations-quote-limit-hint" role="status">Límite de {MAX_QUOTE_ITEMS} artículos por propuesta alcanzado.</p>}

        {/* SECCIÓN 3: COMPARACIÓN DE TARIFAS Y DESGLOSE FINANCIERO SIEMPRE VISIBLE (IVA, SUBTOTAL, DESCUENTO, ANTICIPO) */}
        <section className="operations-quote-tier-section" aria-labelledby="operations-quote-tiers-title">
          <div className="operations-quote-section-heading">
            <div>
              <span className="eyebrow">3 · COMPARACIÓN DE TARIFAS Y DESGLOSE TRIBUTARIO</span>
              <h3 id="operations-quote-tiers-title">Elige la tarifa de la propuesta</h3>
            </div>
            <span>Compara Subtotal sin IVA vs Total final en cada tarifa</span>
          </div>

          <div className="operations-quote-tiers">
            {quoteTiers.map((tier) => {
              const fin = tierFinancials[tier.id];
              return (
                <button
                  key={tier.id}
                  className={`operations-quote-tier${priceTier === tier.id ? ' active' : ''}${tierTotals[tier.id] === null ? ' unavailable' : ''}`}
                  type="button"
                  aria-pressed={priceTier === tier.id}
                  onClick={() => setPriceTier(tier.id)}
                >
                  <span>{tier.label}{priceTier === tier.id && <Check size={14}/>}</span>
                  <b>{tierTotals[tier.id] === null ? 'Completa los artículos' : formatMoney(tierTotals[tier.id])}</b>
                  <small>
                    {fin
                      ? `Subtotal: ${formatMoney(fin.subtotal)}${fin.discount > 0 ? ` · Desc: −${formatMoney(fin.discount)}` : ''} · ${applyIVA ? `IVA ${taxRate}%: +${formatMoney(fin.tax)}` : 'Sin IVA'}`
                      : tier.description}
                  </small>
                </button>
              );
            })}
          </div>
        </section>

        {/* Panel Financiero Abierto (Igual que en POS: IVA, Descuento, Envío y Anticipo) */}
        <section className="oq-financial-panel-open" aria-label="Configuración de IVA, descuentos, envío y anticipo">
          <div className="oq-financial-panel-header">
            <div>
              <span className="eyebrow">AJUSTES COMERCIALES Y TRIBUTARIOS</span>
              <h3>Subtotales, Descuento, IVA ({effectiveTaxRate}%) y Anticipo</h3>
            </div>
            <label className={`oq-iva-switch-pill${applyIVA ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={applyIVA}
                onChange={(event) => setApplyIVA(event.target.checked)}
              />
              <span>{applyIVA ? `IVA ${effectiveTaxRate}% Activo` : 'Sin IVA (0%)'}</span>
            </label>
          </div>

          <div className="oq-financial-controls-grid">
            <div className="operations-quote-discount-control">
              <div className="operations-quote-discount-heading">
                <label htmlFor="operations-quote-discount">Descuento comercial · máximo 40%</label>
                <output>{discountRate}% OFF {selectedFinancials && selectedFinancials.discount > 0 ? `(−${formatMoney(selectedFinancials.discount)})` : ''}</output>
              </div>
              <input
                id="operations-quote-discount"
                type="range"
                min="0"
                max="40"
                step="1"
                value={discountRate}
                onChange={(event) => setDiscountPercent(event.target.value)}
                aria-describedby="operations-quote-discount-hint"
              />
              <div className="operations-quote-discount-presets">
                {[0, 5, 10, 15, 20, 40].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={discountRate === value ? 'is-active' : ''}
                    onClick={() => setDiscountPercent(String(value))}
                  >
                    {value}%
                  </button>
                ))}
              </div>
              <small id="operations-quote-discount-hint">El descuento se distribuye proporcionalmente y requiere motivo.</small>
            </div>

            <div className="oq-extra-conditions-col">
              <label>
                Envío / instalación / otros cargos ($)
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={shippingCost}
                  onChange={(event) => setShippingCost(event.target.value)}
                />
              </label>

              <div className="oq-deposit-Conditions-row">
                <label>
                  Anticipo sugerido (%)
                  <select value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)}>
                    <option value="50">50% anticipo / 50% entrega</option>
                    <option value="60">60% anticipo / 40% entrega</option>
                    <option value="70">70% anticipo / 30% entrega</option>
                    <option value="100">100% pago al confirmar</option>
                  </select>
                </label>
                <label>
                  Validez de la oferta
                  <select value={validityDays} onChange={(e) => setValidityDays(e.target.value)}>
                    <option value="7">7 días calendario</option>
                    <option value="15">15 días laborables</option>
                    <option value="30">30 días calendario</option>
                  </select>
                </label>
              </div>
            </div>

            {discountRate > 0 && (
              <label className="operations-quote-wide">
                Motivo del descuento (obligatorio · {discountReason.trim().length}/300)
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  value={discountReason}
                  onChange={(event) => setDiscountReason(event.target.value)}
                  placeholder="Ej.: cliente frecuente, volumen corporativo, campaña vigente"
                />
              </label>
            )}
          </div>

          <dl className="oq-pos-breakdown-box" aria-label="Desglose financiero estilo POS">
            <div>
              <dt>Subtotal bruto ({lines.length} {lines.length === 1 ? 'ítem' : 'ítems'})</dt>
              <dd>{selectedFinancials ? formatMoney(selectedFinancials.subtotal) : '$0,00'}</dd>
            </div>
            {discountRate > 0 && (
              <div className="is-discount">
                <dt>Descuento comercial ({discountRate}%)</dt>
                <dd>−{selectedFinancials ? formatMoney(selectedFinancials.discount) : '$0,00'}</dd>
              </div>
            )}
            <div>
              <dt>Subtotal neto / Base imponible</dt>
              <dd>{selectedFinancials ? formatMoney(selectedFinancials.taxable) : '$0,00'}</dd>
            </div>
            <div className="is-tax">
              <dt>{applyIVA ? `IVA (${taxRate}%)` : 'IVA (No aplicado)'}</dt>
              <dd>{applyIVA ? `+${selectedFinancials ? formatMoney(selectedFinancials.tax) : '$0,00'}` : '$0,00'}</dd>
            </div>
            {extraCost > 0 && (
              <div>
                <dt>Envío / otros cargos</dt>
                <dd>+{formatMoney(extraCost)}</dd>
              </div>
            )}
            <div className="is-total">
              <dt>Total de la cotización ({quoteTiers.find((t) => t.id === priceTier)?.label})</dt>
              <dd>{selectedTotal === null ? 'Completa los artículos' : formatMoney(selectedTotal)}</dd>
            </div>
            {selectedTotal !== null && depositAmount !== null && remainingBalance !== null && (
              <div className="is-deposit">
                <dt>Condición de pago ({depositRate}% anticipo)</dt>
                <dd>Anticipo: {formatMoney(depositAmount)} · Saldo contra entrega: {formatMoney(remainingBalance)}</dd>
              </div>
            )}
          </dl>
        </section>

        {priceTier === 'instalacion' && (
          <section className="operations-quote-install" aria-labelledby="operations-quote-install-title">
            <div className="operations-quote-section-heading">
              <div>
                <span className="eyebrow"><MapPin size={13}/> DATOS PARA INSTALACIÓN</span>
                <h3 id="operations-quote-install-title">Ubicación del trabajo</h3>
              </div>
            </div>
            <label>
              Dirección o lugar de instalación
              <input required maxLength={300} value={installAddress} onChange={(event) => setInstallAddress(event.target.value)} placeholder="Sector, calle, edificio o referencia"/>
            </label>
            <div className="operations-quote-fields">
              <label>
                Enlace exacto de Google Maps (opcional)
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  maxLength={800}
                  value={installMapUrl}
                  onChange={(event) => setInstallMapUrl(event.target.value)}
                  placeholder="maps.app.goo.gl/… o google.com/maps/…"
                  aria-invalid={Boolean(installMapUrl && !isGoogleMapsUrl(installMapUrl))}
                />
                {installMapUrl && !isGoogleMapsUrl(installMapUrl) ? <small className="operations-quote-error-hint">Pega un enlace válido de Google Maps.</small> : <small>Puedes pegarlo sin escribir https://.</small>}
              </label>
              <label>
                Piso o nivel
                <input maxLength={60} value={installFloor} onChange={(event) => setInstallFloor(event.target.value)} placeholder="Ej. planta baja, piso 2"/>
              </label>
              <label>
                Altura aproximada
                <input maxLength={60} value={installHeight} onChange={(event) => setInstallHeight(event.target.value)} placeholder="Ej. 4 m"/>
              </label>
              <label>
                Acceso y condiciones
                <input maxLength={280} value={installAccess} onChange={(event) => setInstallAccess(event.target.value)} placeholder="Escalera, acceso, horario…"/>
              </label>
            </div>
            <GoogleMapsPreview url={installMapUrl} address={installAddress}/>
            {installAddress.trim() && (
              <a className="operations-quote-map-link" href={mapsUrl(installAddress.trim())} target="_blank" rel="noreferrer">
                <MapPin size={14}/> Buscar dirección en Google Maps <ArrowRight size={14}/>
              </a>
            )}
          </section>
        )}

        <section className="operations-quote-install">
          <div className="operations-quote-section-heading">
            <div>
              <span className="eyebrow">DESCRIPCIÓN DEL TRABAJO</span>
              <h3>Indicaciones y alcance para el cliente</h3>
            </div>
          </div>
          <RichTextEditor label="Descripción enriquecida" value={clientBriefHtml} onChange={setClientBriefHtml} placeholder="Describe el trabajo, materiales, estilo o indicaciones…" minHeight={160}/>
        </section>

        <CommercialAssetsEditor value={documentAssets} onChange={setDocumentAssets}/>

        <label className="operations-quote-notes">
          Notas internas para el equipo
          <textarea
            rows={3}
            maxLength={1200}
            value={proposalNotes}
            onChange={(event) => setProposalNotes(event.target.value)}
            placeholder="Acabados por confirmar, archivos pendientes, observaciones para taller…"
          />
          <small>{proposalNotes.length} / 1200 · Se guarda en la cotización central y no aparece al imprimir.</small>
        </label>

        {quoteError && <div className="op-flow-alert error" role="alert">{quoteError}</div>}
        {canViewQuotes && !canEditQuotes && <p className="muted" role="status">Tu perfil puede consultar cotizaciones, pero no guardar nuevas propuestas.</p>}

        <button className="button button-dark form-submit operations-quote-submit" disabled={!quoteCanSave} type="submit">
          {saving ? 'Guardando propuesta…' : `Guardar cotización · ${lines.length} ${lines.length === 1 ? 'artículo' : 'artículos'} · ${selectedTotal === null ? '' : formatMoney(selectedTotal)}`} <Check size={16}/>
        </button>
      </form>

      {/* PANEL LATERAL STICKY TIPO POS: Resumen completo con Medidas, Subtotales, Descuento, IVA y Total */}
      <aside className="operations-quote-summary">
        <section className="panel oq-summary-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">RESUMEN EN VIVO · {branchName.toUpperCase()}</span>
              <h2>Desglose de la propuesta</h2>
            </div>
            <ClipboardList size={18}/>
          </div>

          <div className="oq-summary-meta-strip">
            <div>
              <small>Cliente</small>
              <b>{customer.trim() || 'Por definir'}</b>
            </div>
            <div>
              <small>Tarifa activa</small>
              <b>{quoteTiers.find((t) => t.id === priceTier)?.label}</b>
            </div>
            <div>
              <small>Piezas / Superficie</small>
              <b>{totalPiecesCount} pzs{totalSurfaceArea > 0 ? ` · ${totalSurfaceArea.toFixed(2)} m²` : ''}</b>
            </div>
          </div>

          <ol className="operations-quote-summary-lines">
            {configuredLines.map((line, index) => (
              <li key={line.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <b>{line.title || 'Selecciona una referencia'}</b>
                  <small>
                    {line.isAreaMode && line.hasValidSize
                      ? `${line.pieceQuantity} pza(s) × ${line.width}×${line.height} cm (${line.totalArea.toFixed(2)} m²)`
                      : `${line.pieceQuantity} ${line.unit}`}
                    {line.unitPrice !== null ? ` · ${formatMoney(line.unitPrice)}/${line.unit}` : ''}
                    {line.option ? ` · ${line.option}` : ''}
                    {line.additionalDescription ? ` · ${line.additionalDescription}` : ''}
                  </small>
                </div>
                <strong>
                  {line.custom || line.product
                    ? line.totals[priceTier] === null ? '—' : formatMoney(line.totals[priceTier])
                    : '—'}
                </strong>
              </li>
            ))}
          </ol>

          {/* Cuadro de Desglose Financiero idéntico al POS */}
          <dl className="oq-sidebar-financial-breakdown" aria-label="Desglose financiero de la cotización">
            <div>
              <dt>Subtotal</dt>
              <dd>{selectedFinancials ? formatMoney(selectedFinancials.subtotal) : '—'}</dd>
            </div>
            {discountRate > 0 && (
              <div className="is-discount">
                <dt>Descuento ({discountRate}%)</dt>
                <dd>{selectedFinancials ? `−${formatMoney(selectedFinancials.discount)}` : '—'}</dd>
              </div>
            )}
            <div>
              <dt>Base imponible</dt>
              <dd>{selectedFinancials ? formatMoney(selectedFinancials.taxable) : '—'}</dd>
            </div>
            <div className="is-tax">
              <dt>
                <label className="oq-sidebar-iva-toggle">
                  <input type="checkbox" checked={applyIVA} onChange={(e) => setApplyIVA(e.target.checked)} />
                  <span>IVA ({effectiveTaxRate}%)</span>
                </label>
              </dt>
              <dd>{applyIVA ? (selectedFinancials ? `+${formatMoney(selectedFinancials.tax)}` : '—') : 'No aplicado ($0,00)'}</dd>
            </div>
            {extraCost > 0 && (
              <div>
                <dt>Envío / otros cargos</dt>
                <dd>+{formatMoney(extraCost)}</dd>
              </div>
            )}
            <div className="is-total">
              <dt>Total {applyIVA ? 'con IVA' : 'sin IVA'}</dt>
              <dd>{selectedTotal === null ? '—' : formatMoney(selectedTotal)}</dd>
            </div>
            {selectedTotal !== null && depositAmount !== null && remainingBalance !== null && (
              <div className="is-deposit">
                <dt>Anticipo ({depositRate}%)</dt>
                <dd>{formatMoney(depositAmount)} · Saldo: {formatMoney(remainingBalance)}</dd>
              </div>
            )}
          </dl>

          {priceTier === 'instalacion' && installAddress.trim() && (
            <div className="operations-quote-summary-location">
              <MapPin size={15}/>
              <span>
                <b>{installAddress}</b>
                <small>{[installFloor, installHeight && `Altura ${installHeight}`, installMapUrl && 'Pin de Maps añadido'].filter(Boolean).join(' · ')}</small>
              </span>
            </div>
          )}

          <div className="operations-quote-summary-actions">
            <button
              className="button button-outline"
              type="button"
              disabled={!allItemsSelected || selectedTotal === null || !pricesConfirmed}
              onClick={() => void copyQuoteWhatsApp()}
            >
              <Copy size={15}/> Copiar desglose
            </button>
            <button
              className="button button-outline is-whatsapp"
              type="button"
              disabled={!allItemsSelected || selectedTotal === null || !pricesConfirmed}
              onClick={openDirectWhatsApp}
            >
              <MessageCircle size={15}/> Enviar WhatsApp
            </button>
            <button
              className="button button-outline operations-quote-print-button"
              type="button"
              onClick={() => setIsCurrentPdfOpen(true)}
            >
              <Printer size={16}/> Ver Proforma PDF Formal con QR
            </button>
          </div>
        </section>
      </aside>
    </div>

    {/* HISTORIAL COMPARTIDO CON BUSCADOR, FILTROS Y ACCIONES EN 1 CLIC */}
    <section className="panel operations-quote-history">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">HISTORIAL COMERCIAL CONECTADO</span>
          <h2>Cotizaciones y ventas realizadas</h2>
        </div>
        <span className="muted-count">{filteredHistoryItems.length} de {historyItems.length} registros</span>
      </div>

      <div className="oq-history-toolbar">
        <label className="oq-history-search">
          <Search size={15}/>
          <input
            type="search"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
            placeholder="Buscar código COT/VEN, cliente o producto…"
            aria-label="Buscar en el historial del cotizador"
          />
        </label>
        <div className="oq-history-filter-pills" role="group" aria-label="Filtrar historial comercial">
          <button type="button" className={historyFilter === 'all' ? 'is-active' : ''} onClick={() => setHistoryFilter('all')}>
            Todos ({historyItems.length})
          </button>
          <button type="button" className={historyFilter === 'quotes' ? 'is-active' : ''} onClick={() => setHistoryFilter('quotes')}>
            Cotizaciones ({centralQuotes.length})
          </button>
          <button type="button" className={historyFilter === 'accepted' ? 'is-active' : ''} onClick={() => setHistoryFilter('accepted')}>
            Aceptadas para POS ({acceptedQuotesCount})
          </button>
          <button type="button" className={historyFilter === 'sales' ? 'is-active' : ''} onClick={() => setHistoryFilter('sales')}>
            Ventas ({centralSales.length})
          </button>
        </div>
      </div>

      {quoteError && <div className="op-flow-alert error" role="alert">{quoteError}</div>}

      <div className="activity-list">
        {filteredHistoryItems.slice(0, 60).map((document) => {
          const isSale = document.documentKind === 'sale';
          const canRemove = isSale ? canDeleteSales : canDeleteQuotes;
          const docFin = !isSale && Array.isArray(document.items)
            ? document.items.find((i: any) => i?.document_details?.financial)?.document_details?.financial
            : null;
          return (
            <article className={`sale-activity operations-quote-history-item${isSale ? ' is-sale' : ''}`} key={`${document.documentKind}:${document.id}`}>
              <button
                className="sale-row operations-quote-detail-trigger"
                type="button"
                onClick={() => setSelectedDocument(document)}
                aria-label={`Abrir desglose de ${isSale ? 'venta' : 'cotización'} ${document.documentCode}`}
              >
                <span className="sale-icon">{isSale ? <ReceiptText size={17}/> : <FileText size={17}/>}</span>
                <span>
                  <b>{document.documentCode} · {document.customerLabel}</b>
                  <small>
                    {isSale
                      ? (document.central_quote_id ? 'Venta realizada · vinculada a cotización' : 'Venta realizada')
                      : Array.isArray(document.items)
                        ? document.items.map((item: any) => {
                            const dims = item.width_cm && item.height_cm ? ` (${item.width_cm}×${item.height_cm}cm)` : '';
                            return `${item.name || item.product_name || 'Artículo'}${dims}`;
                          }).join(', ')
                        : 'Cotización'} · {new Date(document.date).toLocaleDateString('es-EC')}
                  </small>
                </span>
                <strong>{document.amount === null ? 'Por validar' : formatMoney(document.amount)}</strong>
              </button>

              <div className="sale-payment-summary oq-history-actions-bar">
                <div className="oq-history-badges">
                  <span>Estado: <b>{isSale ? 'Realizada' : document.status === 'accepted' ? 'Aceptada' : document.status === 'converted' ? 'Convertida en venta' : document.status}</b></span>
                  {!isSale && <span>Tarifa: <b>{document.price_confirmed ? 'Confirmada' : 'Por confirmar'}</b></span>}
                  {docFin && (
                    <span>
                      Subtotal: <b>{formatMoney(docFin.subtotal)}</b> · {docFin.iva_applied ? `IVA ${docFin.iva_rate}%: ${formatMoney(docFin.iva_amount)}` : 'Sin IVA'}
                    </span>
                  )}
                </div>

                <div className="oq-history-btns">
                  <button className="operations-quote-detail-link" type="button" onClick={() => setSelectedDocument(document)}>
                    Ver desglose <span aria-hidden="true">↗</span>
                  </button>
                  {!isSale && (
                    <button
                      className="operations-quote-detail-link"
                      type="button"
                      onClick={() => loadQuoteIntoEditor(document)}
                      title="Cargar esta cotización en el editor para modificar medidas o duplicar"
                    >
                      <Copy size={12}/> Cargar en editor
                    </button>
                  )}
                  {!isSale && canEditQuotes && document.status !== 'accepted' && document.status !== 'converted' && (
                    <button
                      className="operations-quote-detail-link is-approve"
                      type="button"
                      disabled={updatingStatusId === document.id}
                      onClick={() => void markQuoteAccepted(document)}
                    >
                      <CheckCircle2 size={12}/> {updatingStatusId === document.id ? 'Aprobando…' : 'Aprobar para POS'}
                    </button>
                  )}
                  {!isSale && document.status === 'accepted' && (
                    <button
                      className="operations-quote-detail-link is-pos"
                      type="button"
                      onClick={() => navigate('/operaciones/pos')}
                    >
                      <ShoppingCart size={12}/> Cobrar en POS
                    </button>
                  )}
                  <button
                    className="operations-quote-detail-link"
                    type="button"
                    onClick={() => setChatterTarget({
                      recordType: isSale ? 'sale' : 'quote',
                      recordId: document.documentCode || document.id,
                      recordTitle: `${document.documentCode} · ${document.customerLabel}`,
                      recordSubtitle: isSale ? 'Venta confirmada' : `Cotización · ${document.status}`,
                      recordPhone: document.customer_phone || '',
                      recordStage: isSale ? 'Confirmada' : document.status,
                    })}
                  >
                    <MessageSquare size={12}/> Chatter 360°
                  </button>
                  <button
                    className="operations-quote-detail-link"
                    type="button"
                    onClick={() => setSelectedQuoteForPdf({
                      quote_code: document.documentCode || document.quote_code || document.id,
                      customer_name: document.customerLabel || 'Cliente Visual Corp',
                      total: document.total || 0,
                      subtotal: document.subtotal || document.total || 0,
                      tax: document.tax || 0,
                      date: document.formattedDate || new Date().toISOString(),
                      items: document.items || [],
                    })}
                  >
                    <Printer size={12}/> Proforma PDF
                  </button>
                  <button
                    className="operations-quote-detail-link is-receipt"
                    type="button"
                    onClick={() => setReceiptModalTarget({
                      id: document.documentCode || document.id,
                      clientName: document.customerLabel || 'Cliente',
                      amount: document.total || 0,
                    })}
                  >
                    <Wallet size={12}/> Comprobante
                  </button>
                  {canRemove && (
                    <button
                      className="operations-quote-delete-link"
                      type="button"
                      disabled={removingDocumentId === document.id}
                      onClick={() => void removeFromHistory(document)}
                      aria-label={`Quitar ${document.documentCode} del historial`}
                    >
                      <Trash2 size={13}/>{removingDocumentId === document.id ? 'Quitando…' : 'Quitar'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!filteredHistoryItems.length && (
          <EmptyState
            icon={FileText}
            title="No hay coincidencias en el historial"
            text="Las cotizaciones guardadas y las ventas confirmadas aparecerán en este historial."
          />
        )}
      </div>
    </section>

    <Sheet
      open={Boolean(selectedDocument)}
      onOpenChange={(open) => { if (!open) setSelectedDocument(null); }}
      title={selectedDocument ? `Ficha · ${selectedDocument.documentKind === 'sale' ? selectedDocument.sale_code : selectedDocument.quote_code}` : 'Ficha comercial'}
      description={selectedDocument?.documentKind === 'sale' ? 'Artículos vendidos, pagos registrados, entrega y valores de la venta.' : 'Productos, cantidades, medidas, imágenes y valores guardados en esta propuesta.'}
    >
      {selectedDocument && <CommercialDocumentDetails kind={selectedDocument.documentKind} documentId={selectedDocument.id} initialDocument={selectedDocument.documentKind === 'sale' ? null : selectedDocument}/>}
    </Sheet>

    {chatterTarget && (
      <ChatterDrawer360
        open={Boolean(chatterTarget)}
        onClose={() => setChatterTarget(null)}
        recordType={chatterTarget.recordType}
        recordId={chatterTarget.recordId}
        recordTitle={chatterTarget.recordTitle}
        recordSubtitle={chatterTarget.recordSubtitle}
        recordPhone={chatterTarget.recordPhone}
        recordStage={chatterTarget.recordStage}
      />
    )}

    {isCurrentPdfOpen && (
      <ExecutiveQuotePdfModal
        isOpen={isCurrentPdfOpen}
        onClose={() => setIsCurrentPdfOpen(false)}
        quote={{
          quote_code: `COT-${Date.now().toString().slice(-4)}`,
          customer_name: customer.trim() || 'Consumidor / Por definir',
          customer_ruc: customerDocument.trim(),
          customer_phone: phone.trim(),
          subtotal: selectedFinancials?.subtotal || 0,
          discount_amount: selectedFinancials?.discount || 0,
          discount_percent: discountRate,
          taxable_base: selectedFinancials?.taxable || 0,
          tax: applyIVA ? (selectedFinancials?.tax || 0) : 0,
          shipping_cost: extraCost,
          total: selectedTotal || 0,
          deposit_amount: depositAmount || 0,
          remaining_balance: remainingBalance || 0,
          items: configuredLines.map((l) => ({
            name: l.title,
            description: l.option ? `Opción: ${l.option}` : l.additionalDescription || '',
            unit: l.unit,
            calcType: l.isAreaMode ? 'm2' : 'unit',
            width_cm: l.width,
            height_cm: l.height,
            area_m2: l.totalArea,
            quantity: l.pieceQuantity,
            unit_price: l.unitPrice || 0,
            line_total: l.totals[priceTier] || 0,
          })),
        }}
      />
    )}

    {selectedQuoteForPdf && (
      <ExecutiveQuotePdfModal
        isOpen={Boolean(selectedQuoteForPdf)}
        onClose={() => setSelectedQuoteForPdf(null)}
        quote={selectedQuoteForPdf}
      />
    )}

    {receiptModalTarget && (
      <PaymentReceiptModal
        isOpen={Boolean(receiptModalTarget)}
        onClose={() => setReceiptModalTarget(null)}
        saleOrOrderId={receiptModalTarget.id}
        customerName={receiptModalTarget.clientName}
        expectedAmount={receiptModalTarget.amount}
      />
    )}

    <div className="notice-box">
      <span><CircleHelp size={17}/></span>
      <div>
        <b>Propuestas sincronizadas con POS, Inventario y Portal de Aprobación</b>
        <p>Los artículos, sus medidas en cm y m², el desglose de Subtotal, Descuento e IVA ({effectiveTaxRate}%) y las tres tarifas quedan guardados en la cotización central para que el POS y Producción compartan exactamente la misma información.</p>
      </div>
    </div>

    {/* Propuesta comercial con datos financieros y condiciones de la cotización. */}
    <section className="operations-quote-print-sheet" aria-hidden="true">
      <header className="quote-print-header">
        <img src="/brand/visualcorp-wordmark.png" alt="Visual Corp" />
        <div><span>PROPUESTA COMERCIAL</span><b>Preparada el {printIssuedAt}</b><small>Milagro · Ecuador</small></div>
      </header>

      <section className="quote-print-title">
        <div><span className="quote-print-kicker">COTIZACIÓN</span><h1>{jobName.trim() || 'Propuesta de cotización'}</h1><p>Preparada para <strong>{customer.trim() || 'Cliente por definir'}</strong></p></div>
        <div className={`quote-print-rate${pricesConfirmed ? '' : ' is-pending'}`}><span>TARIFA SELECCIONADA</span><b>{selectedTierLabel}</b><small>{pricesConfirmed ? 'Valores de referencia confirmados' : 'Valores pendientes de validación'}</small></div>
      </section>

      <section className="quote-print-client" aria-label="Datos del cliente">
        <div><span>CLIENTE</span><b>{customer.trim() || 'Por definir'}</b></div>
        {phone.trim() && <div><span>TELÉFONO</span><b>{phone}</b></div>}
        {customerEmail.trim() && <div><span>CORREO</span><b>{customerEmail}</b></div>}
        {customerDocument.trim() && <div><span>CÉDULA / RUC</span><b>{customerDocument}</b></div>}
        {printDeliveryDate && <div><span>ENTREGA ESTIMADA</span><b>{printDeliveryDate}</b></div>}
        <div><span>VIGENCIA DE LA PROPUESTA</span><b>{validityDays} días desde su emisión</b></div>
      </section>

      <section className="quote-print-items">
        <div className="quote-print-section-heading"><div><span>DETALLE</span><h2>Productos y servicios</h2></div><small>{configuredLines.length} {configuredLines.length === 1 ? 'artículo' : 'artículos'}</small></div>
        <table>
          <thead><tr><th>Descripción</th><th>Cantidad y medidas</th><th>Valor unitario</th><th>Importe</th></tr></thead>
          <tbody>{configuredLines.map((line, index) => {
            const lineTotal = line.totals[priceTier];
            const flatPrice = !line.custom && line.product?.priceBasis === 'total';
            return <tr key={line.id}>
              <td><span className="quote-print-item-index">ARTÍCULO {String(index + 1).padStart(2, '0')}</span><b className="quote-print-item-name">{line.title || `Artículo ${index + 1}`}</b><span className="quote-print-item-meta">{line.custom ? 'Concepto personalizado' : line.product?.family || 'Producto pendiente'}{line.option ? ` · ${line.option}` : ''}</span>{line.additionalDescription && <p className="quote-print-item-description">{line.additionalDescription}</p>}</td>
              <td><b>{line.isAreaMode ? `${line.pieceQuantity} ${line.pieceQuantity === 1 ? 'pieza' : 'piezas'}` : `${line.pieceQuantity} ${line.unit}`}</b>{line.isAreaMode && (line.hasValidSize && line.hasValidQuantity ? <span className="quote-print-cell-note">{line.width} × {line.height} cm por pieza<br/>{line.area.toLocaleString('es-EC', { maximumFractionDigits: 2 })} m² por pieza · {line.totalArea.toLocaleString('es-EC', { maximumFractionDigits: 2 })} m² en total</span> : <span className="quote-print-cell-note">Medidas pendientes de confirmar</span>)}</td>
              <td>{lineTotal === null ? 'Por cotizar' : flatPrice ? <>Precio global<span className="quote-print-cell-note">por este conjunto</span></> : line.unitPrice === null ? 'Por cotizar' : <>{formatMoney(line.unitPrice)}<span className="quote-print-cell-note">por {line.isAreaMode ? 'm²' : line.unit}</span></>}</td>
              <td className="quote-print-amount">{lineTotal === null ? 'Por cotizar' : formatMoney(lineTotal)}</td>
            </tr>;
          })}</tbody>
        </table>
      </section>

      <section className="quote-print-bottom">
        {priceTier === 'instalacion' && (installAddress.trim() || installFloor.trim() || installHeight.trim() || installAccess.trim() || installMapUrl.trim()) && <div className="quote-print-install"><span>ALCANCE DE INSTALACIÓN</span>{installAddress.trim() && <b>{installAddress}</b>}{(installFloor.trim() || installHeight.trim()) && <p>{[installFloor && `Nivel: ${installFloor}`, installHeight && `Altura: ${installHeight}`].filter(Boolean).join(' · ')}</p>}{installAccess.trim() && <p>{installAccess}</p>}{isGoogleMapsUrl(installMapUrl) && <a href={normalizeGoogleMapsUrl(installMapUrl)} target="_blank" rel="noreferrer">Abrir ubicación en Google Maps</a>}</div>}
        <div className="quote-print-totals">
          <div><span>Subtotal bruto</span><b>{selectedFinancials ? formatMoney(selectedFinancials.subtotal) : 'Por confirmar'}</b></div>
          {selectedFinancials?.discount ? <div><span>Descuento comercial ({selectedFinancials.discountPercent}%){discountReason.trim() && <small>{discountReason}</small>}</span><b>−{formatMoney(selectedFinancials.discount)}</b></div> : null}
          <div><span>Base imponible</span><b>{selectedFinancials ? formatMoney(selectedFinancials.taxable) : 'Por confirmar'}</b></div>
          <div><span>{applyIVA ? `IVA (${taxRate}%)` : 'IVA no aplicado'}</span><b>{applyIVA && selectedFinancials ? formatMoney(selectedFinancials.tax) : '$0,00'}</b></div>
          {selectedFinancials?.shipping ? <div><span>Envío / otros cargos</span><b>{formatMoney(selectedFinancials.shipping)}</b></div> : null}
          <div className="quote-print-grand-total"><span>Total · {selectedTierLabel}</span><b>{selectedTotal === null ? 'Por cotizar' : formatMoney(selectedTotal)}</b></div>
          {selectedTotal !== null && depositAmount !== null && remainingBalance !== null && <div className="quote-print-payment"><span>Condición de pago · anticipo ({depositRate}%)<small>Saldo contra entrega</small></span><b>{formatMoney(depositAmount)}<small>{formatMoney(remainingBalance)}</small></b></div>}
        </div>
      </section>

      <footer className="quote-print-footer">
        <p className="operations-quote-print-disclaimer">Valores expresados en dólares americanos (USD). Sujetos a confirmación de disponibilidad, revisión técnica de artes y condiciones comerciales con Visual Corp.</p>
        <div><span>VISUAL CORP</span><span>Propuesta preparada para revisión del cliente</span></div>
      </footer>
    </section>
  </AppFrame>;
}

export default OperationsQuotePage;
