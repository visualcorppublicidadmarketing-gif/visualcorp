import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Boxes, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardList, Copy, Database, FileText, Globe2, History, Image, LayoutDashboard, Link2, LogOut, Megaphone, Menu, Minus, Package, Pencil, Plus, Route, Search, Settings2, ShoppingBag, ShoppingCart, Sparkles, Store, TriangleAlert, Truck, Users, Wallet, X } from 'lucide-react';
import { AppFrame, PageHeading, StatCard } from '../../app/layout';
import { EmptyState, StageBadge } from '../../components/feedback';
import { formatDate, formatMoney, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { QuotePriceComparison } from '../../components/QuotePriceComparison';
import { calculateQuotePrice, getQuoteBasis } from '../../lib/quotePricing';
import { calculatePOSLine, formatPOSLineDescription } from '../../lib/posPricing';
import { calculatePOSPaymentBreakdown } from '../../lib/posPayments';
import { CommercialDocumentDetails, type CommercialDocumentKind } from '../../components/CommercialDocumentDetails';
import { Sheet, useConfirm } from '../../components/ui/OperationalKit';
import { CommercialAssetsEditor } from '../../components/commercial/CommercialAssetsEditor';
import { CommercialAssetsGallery } from '../../components/commercial/CommercialAssetsGallery';
import { GoogleMapsPreview } from '../../components/commercial/GoogleMapsPreview';
import { RichTextEditor } from '../../components/studio/RichTextEditor';
import { persistCommercialAssets, type CommercialAssetDraft } from '../../lib/commercialAssets';
import { normalizeGoogleMapsUrl } from '../../lib/maps';
import { POSCustomerPicker } from './components/POSCustomerPicker';
import { POSCheckoutSteps, type POSCheckoutStep } from './components/POSCheckoutSteps';
import { POSProductSearch, type POSStockSemanticMeta } from './components/POSProductSearch';
import { POSMeasurementControls } from './components';
import { AdvisorProductFavoriteButton } from '../../components/AdvisorProductFavoriteButton';
import { useAdvisorProductFavorites } from '../../hooks/useAdvisorProductFavorites';
import { buildPOSWhatsAppMessage, copyTextToClipboard } from '../../lib/whatsapp';
import { getProductionDetails, isProductionWorkflowCode, POSProductionDetails, type ProductionDetailsValue, type ProductionLine, type ProductionWorkflowCode } from './POSProductionDetails';
import { POSSaleEditorModal } from './components/POSSaleEditorModal';
import './pos-fulfillment.css';
import './checkout-workspace.css';
import './pos-material-usage.css';

const trackedAccessoryProductIds = new Set(['prod-extras-ojal-peque-o-c-u','prod-extras-ojales-grande-c-u']);
const roundMoney = (value:number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizeCustomerPhone = (value) => { const digits=String(value||'').replace(/\D/g,'');return digits.startsWith('593')&&digits.length===12?`0${digits.slice(3)}`:digits; };
type POSMaterialRequestDraft = { recipeId: string; quantity: string };
const sanitizePOSMaterialRequests = (value: unknown): POSMaterialRequestDraft[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, POSMaterialRequestDraft>();
  value.slice(0, 25).forEach((entry: any) => {
    const recipeId = String(entry?.recipeId || entry?.recipe_id || '').trim();
    if (!recipeId) return;
    unique.set(recipeId, { recipeId, quantity: String(entry?.quantity ?? '') });
  });
  return [...unique.values()];
};
const sanitizePOSMaterialRequestMap = (value: unknown): Record<string, POSMaterialRequestDraft[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([lineKey, requests]) => [String(lineKey), sanitizePOSMaterialRequests(requests)]).filter(([lineKey, requests]) => Boolean(lineKey) && (requests as POSMaterialRequestDraft[]).length > 0));
};
const sanitizePOSCart = (lines: unknown) => Array.isArray(lines)?lines.slice(0,100).filter((line)=>line&&typeof line.name==='string'&&Number.isFinite(Number(line.quantity))&&Number(line.quantity)>0&&Number.isFinite(Number(line.unitPrice))&&Number(line.unitPrice)>0).map((line,index)=>({key:String(line.key||`restored-${line.productId||'custom'}-${index}`),productId:String(line.productId||''),name:String(line.name),family:String(line.family||''),image:String(line.image||''),mode:line.mode==='area'?'area':'quantity',quantity:Number(line.quantity),billingQuantity:Number(line.billingQuantity)||Number(line.quantity),unit:String(line.unit||'unidad'),unitPrice:Number(line.unitPrice),total:Number(line.total)||Number(line.quantity)*Number(line.unitPrice),widthCm:line.widthCm??null,heightCm:line.heightCm??null,areaPerPiece:line.areaPerPiece??null,areaTotal:line.areaTotal??null,pricingTier:line.pricingTier||'pvp',pricingTierLabel:String(line.pricingTierLabel||'Normal'),optionChoice:String(line.optionChoice||''),description:String(line.description||line.name)})):[];
const sanitizePOSPayments = (rows: unknown) => {
  const validMethods = new Set(['Efectivo','Transferencia','Tarjeta','Otro']);
  if (!Array.isArray(rows)) return [{id:'payment-1',method:'Efectivo',amount:'',reference:'',note:''}];
  const sanitized = rows.slice(0,4).filter((row)=>row&&typeof row==='object').map((row,index)=>({id:String(row.id||`payment-${index+1}`),method:validMethods.has(String(row.method))?String(row.method):'Efectivo',amount:String(row.amount??''),reference:String(row.reference||''),note:String(row.note||'')}));
  return sanitized.length?sanitized:[{id:'payment-1',method:'Efectivo',amount:'',reference:'',note:''}];
};
const sanitizePOSSaleLines = (lines: unknown) => Array.isArray(lines)?lines.slice(0,100).filter((line)=>line&&typeof line==='object'&&Number.isFinite(Number(line.quantity))&&Number(line.quantity)>0&&Number.isFinite(Number(line.unit_price))&&Number(line.unit_price)>=0).map((line,index)=>({line_key:String(line.line_key||`legacy-${index}`),catalog_product_id:line.catalog_product_id||null,sku:String(line.sku||''),description:String(line.description||'Artículo cotizado'),quantity:Number(line.quantity),unit_price:Number(line.unit_price),material_requests:sanitizePOSMaterialRequests(line.material_requests||line.materialRequests).map((request)=>({recipe_id:request.recipeId,quantity:request.quantity}))})):[];
const getPOSQuoteFinancial = (quote: any) => quote?.items?.find((item:any)=>item?.document_details?.financial)?.document_details?.financial||null;
const getPOSQuoteSaleLines = (quote: any) => {
  const financial = getPOSQuoteFinancial(quote);
  return Array.isArray(quote?.items) ? quote.items.map((item,index) => {
    const quantity=Number(item.quantity);
    const finalLineTotal=Number(item.total)||0;
    const lineSubtotal=financial
      ? Number(item.subtotal ?? (finalLineTotal-(Number(item.discount_amount)||0)-(Number(item.tax_amount)||0)-(Number(item.shipping_share)||0)))||0
      : finalLineTotal;
    return {
      line_key:`quote-${quote.id}-${index}`,catalog_product_id:item.product_id||null,sku:item.sku||item.product_id||'',
      description:[item.name||item.product_name||'Artículo cotizado',item.width_cm&&item.height_cm?`${item.width_cm} × ${item.height_cm} cm`:null,item.unit||null].filter(Boolean).join(' · '),
      quantity,pieceQuantity:Number(item.piece_quantity)||quantity,totalArea:item.unit==='m²'?quantity:null,
      unit_price:quantity>0?lineSubtotal/quantity:0,widthCm:item.width_cm||null,heightCm:item.height_cm||null,unit:item.unit||'unidad',optionChoice:item.option_choice||'',
    };
  }) : [];
};
const sanitizeProductionDetails = (value: unknown): Record<string, ProductionDetailsValue> => {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).slice(0,100).filter(([key,entry])=>key.length<=150&&entry&&typeof entry==='object').map(([key,entry]:[string,any])=>[key,{workflow_code:isProductionWorkflowCode(entry.workflow_code)?entry.workflow_code:'review',specifications:entry.specifications&&typeof entry.specifications==='object'&&!Array.isArray(entry.specifications)?entry.specifications:{}}]));
};
const posSaleLinesSignature = (lines: unknown) => JSON.stringify(sanitizePOSSaleLines(lines).map(({ material_requests: _requests, ...line }) => line));
function POSFinancialBreakdown({ subtotal, discount, taxRate, taxAmount, total, shipping = 0, taxApplied = true, taxLabel = 'No aplicado', className = '' }: { subtotal:number; discount:number; taxRate:number; taxAmount:number; total:number; shipping?:number; taxApplied?:boolean; taxLabel?:string; className?:string }) {
  return <dl className={`pos-order-financial-breakdown ${className}`} aria-label="Desglose del total de la orden">
    <div><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
    {discount>0&&<div><dt>Descuento</dt><dd>−{formatMoney(discount)}</dd></div>}
    {taxApplied?<div className="pos-tax-line"><dt>IVA ({taxRate}%)</dt><dd>+{formatMoney(taxAmount)}</dd></div>:<div className="pos-tax-line"><dt>IVA</dt><dd>{taxLabel}</dd></div>}
    {shipping>0&&<div><dt>Envío / otros cargos</dt><dd>{formatMoney(shipping)}</dd></div>}
    <div className="is-total"><dt>Total por cobrar</dt><dd>{formatMoney(total)}</dd></div>
  </dl>;
}
const pendingSaleSignature = (snapshot: any) => JSON.stringify({
    form: {
    total:String(snapshot?.form?.total||''),amountPaid:String(snapshot?.form?.amountPaid||''),method:String(snapshot?.form?.method||''),customer:String(snapshot?.form?.customer||''),customerId:String(snapshot?.form?.customerId||''),customerPhone:String(snapshot?.form?.customerPhone||''),customerEmail:String(snapshot?.form?.customerEmail||''),customerDocumentReference:String(snapshot?.form?.customerDocumentReference||''),description:String(snapshot?.form?.description||''),productId:String(snapshot?.form?.productId||''),branchCode:String(snapshot?.form?.branchCode||''),quantity:String(snapshot?.form?.quantity||''),quoteId:String(snapshot?.form?.quoteId||''),
  },
  cart:sanitizePOSCart(snapshot?.cart).map(({key:_key,...line})=>line),discountPercent:String(snapshot?.discountPercent||'0'),discountReason:String(snapshot?.discountReason||''),saleLines:sanitizePOSSaleLines(snapshot?.saleLines),materialRequestsByLine:sanitizePOSMaterialRequestMap(snapshot?.materialRequestsByLine),saleNote:String(snapshot?.saleNote||''),
  fulfillment:{installationRequired:Boolean(snapshot?.fulfillment?.installationRequired),installationAddress:String(snapshot?.fulfillment?.installationAddress||''),latitude:String(snapshot?.fulfillment?.latitude||''),longitude:String(snapshot?.fulfillment?.longitude||''),installationAt:String(snapshot?.fulfillment?.installationAt||''),deliveryAt:String(snapshot?.fulfillment?.deliveryAt||'')},
    mapLink:String(snapshot?.mapLink||''),payments:sanitizePOSPayments(snapshot?.payments),chargeNow:snapshot?.chargeNow!==false,activeParkedOrderId:String(snapshot?.activeParkedOrderId||''),allowBackorder:typeof snapshot?.allowBackorder==='boolean'?snapshot.allowBackorder:null,productionByLine:sanitizeProductionDetails(snapshot?.productionByLine),
});
const findPOSStockShortages = (lines: any[], catalogLinks: any[], branchId: string, inventory: any[]) => lines.flatMap((line)=>{
  if(!line.catalog_product_id)return [];
  const linked=catalogLinks.find((link)=>link.active&&link.catalog_product_id===line.catalog_product_id&&link.branch_id===branchId);
  if(!linked)return [];
  const stock=inventory.find((row)=>row.variantId===linked.inventory_variant_id&&row.branchId===linked.branch_id);
  const quantity=Number(line.quantity)||0;
  const available=stock?Number(stock.availableQuantity??(Number(stock.quantity||0)-Number(stock.reservedQuantity||0))):0;
  return !stock||stock.sourceStatus||available<quantity?[line]:[];
});
const coordinatesFromMapLink=(value:string)=>{try{const decoded=decodeURIComponent(value);const point=decoded.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)||decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)||decoded.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);return point?{latitude:point[1],longitude:point[2]}:null;}catch{return null;}};

function mostFrequent(values: string[]) { return values.sort((a,b)=>values.filter((item)=>item===b).length-values.filter((item)=>item===a).length)[0]; }

function POSProductVisual({ src, alt = '', className = '', iconSize = 17 }: { src?: string | null; alt?: string; className?: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span className={`pos-line-placeholder ${className}`.trim()} aria-hidden="true"><Boxes size={iconSize}/></span>;
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}/>;
}

function POSCartLineEditor({
  line,
  product,
  inventoryStatus,
  inventoryTone = 'neutral',
  workflowLabel,
  onRemove,
  onSave,
  onDuplicate,
}: {
  line: any;
  product: any;
  inventoryStatus: string;
  inventoryTone?: 'available' | 'warning' | 'neutral';
  workflowLabel?: string;
  onRemove: () => void;
  onSave: (nextLine: any) => void;
  onDuplicate?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: String(line.name || ''),
    description: String(line.description || ''),
    quantity: String(line.quantity),
    widthCm: String(line.widthCm || ''),
    heightCm: String(line.heightCm || ''),
    unitPrice: String(line.unitPrice),
    pricingTier: (line.pricingTier || 'pvp') as 'pvp' | 'instalacion' | 'corporativo',
    lineDiscountPercent: String(line.lineDiscountPercent || '0'),
  });

  useEffect(() => {
    setDraft({
      name: String(line.name || ''),
      description: String(line.description || ''),
      quantity: String(line.quantity),
      widthCm: String(line.widthCm || ''),
      heightCm: String(line.heightCm || ''),
      unitPrice: String(line.unitPrice),
      pricingTier: (line.pricingTier || 'pvp') as 'pvp' | 'instalacion' | 'corporativo',
      lineDiscountPercent: String(line.lineDiscountPercent || '0'),
    });
  }, [line.key, line.name, line.description, line.quantity, line.widthCm, line.heightCm, line.unitPrice, line.pricingTier, line.lineDiscountPercent]);

  const applyLineUpdate = (
    nextName: string,
    nextDescription: string,
    nextQty: number,
    nextWidthCm: number,
    nextHeightCm: number,
    nextTier: 'pvp' | 'instalacion' | 'corporativo',
    nextUnitPrice: number,
    nextLineDiscount: number,
  ) => {
    if (!Number.isFinite(nextQty) || nextQty <= 0) return false;
    const cleanDiscount = Math.min(100, Math.max(0, nextLineDiscount || 0));

    if (line.productId && product) {
      if (line.mode === 'area' && (!Number.isFinite(nextWidthCm) || !Number.isFinite(nextHeightCm) || nextWidthCm <= 0 || nextHeightCm <= 0)) return false;
      const customPriceArg = Number.isFinite(nextUnitPrice) && nextUnitPrice > 0 ? nextUnitPrice : undefined;
      const calculation = calculatePOSLine({
        product,
        mode: line.mode,
        quantity: Math.max(1, Math.round(nextQty)),
        widthCm: nextWidthCm,
        heightCm: nextHeightCm,
        tier: nextTier,
        optionChoice: line.optionChoice || '',
        customUnitPrice: customPriceArg,
        lineDiscountPercent: cleanDiscount,
      });
      if (!calculation) return false;
      const tierLabel = { pvp: 'Normal', instalacion: 'Con instalación', corporativo: 'Corporativo' }[nextTier] || 'Normal';
      const formattedDesc = formatPOSLineDescription({
        name: nextName || line.name,
        mode: line.mode,
        quantity: calculation.quantity,
        unit: calculation.unit,
        unitPrice: calculation.unitPrice,
        pricingTierLabel: tierLabel,
        widthCm: line.mode === 'area' ? nextWidthCm : undefined,
        heightCm: line.mode === 'area' ? nextHeightCm : undefined,
        areaPerPiece: calculation.areaPerPiece || undefined,
        areaTotal: calculation.areaTotal || undefined,
        optionChoice: line.optionChoice || undefined,
        lineDiscountPercent: cleanDiscount,
        customUnitPriceApplied: calculation.customUnitPriceApplied,
      });

      const nextLine = {
        ...line,
        name: nextName || line.name,
        quantity: calculation.quantity,
        billingQuantity: calculation.billedQuantity,
        unitPrice: calculation.unitPrice,
        total: calculation.total,
        pricingTier: nextTier,
        pricingTierLabel: tierLabel,
        widthCm: line.mode === 'area' ? nextWidthCm : null,
        heightCm: line.mode === 'area' ? nextHeightCm : null,
        areaPerPiece: calculation.areaPerPiece || null,
        areaTotal: calculation.areaTotal || null,
        lineDiscountPercent: cleanDiscount,
        customUnitPriceApplied: calculation.customUnitPriceApplied,
        description: nextDescription.trim() ? nextDescription : formattedDesc,
      };
      onSave(nextLine);
      return true;
    } else {
      if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) return false;
      let areaPerPiece = 0;
      let billingQuantity = nextQty;
      if (line.mode === 'area') {
        if (!Number.isFinite(nextWidthCm) || !Number.isFinite(nextHeightCm) || nextWidthCm <= 0 || nextHeightCm <= 0) return false;
        areaPerPiece = Math.round((nextWidthCm * nextHeightCm / 10000) * 10000) / 10000;
        billingQuantity = Math.round((areaPerPiece * nextQty) * 10000) / 10000;
      }
      const effectivePrice = cleanDiscount > 0 ? Number((nextUnitPrice * (1 - cleanDiscount / 100)).toFixed(4)) : nextUnitPrice;
      const total = roundMoney(billingQuantity * effectivePrice);
      const desc = nextDescription.trim() ? nextDescription : (line.mode === 'area'
        ? `${nextName || line.name} · ${nextWidthCm} × ${nextHeightCm} cm · ${nextQty} pzs · ${billingQuantity} m² · $${effectivePrice.toFixed(2)}/m²`
        : `${nextName || line.name} · ${nextQty} und · $${effectivePrice.toFixed(2)} c/u`);

      onSave({
        ...line,
        name: nextName || line.name,
        quantity: nextQty,
        billingQuantity,
        unitPrice: effectivePrice,
        total,
        widthCm: line.mode === 'area' ? nextWidthCm : null,
        heightCm: line.mode === 'area' ? nextHeightCm : null,
        areaPerPiece: line.mode === 'area' ? areaPerPiece : null,
        areaTotal: line.mode === 'area' ? billingQuantity : null,
        lineDiscountPercent: cleanDiscount,
        customUnitPriceApplied: true,
        description: desc,
      });
      return true;
    }
  };

  const stepQuantity = (delta: -1 | 1) => {
    const nextQty = Math.max(1, Number(line.quantity || 1) + delta);
    if (nextQty === Number(line.quantity)) return;
    applyLineUpdate(
      line.name,
      line.description,
      nextQty,
      Number(line.widthCm || 0),
      Number(line.heightCm || 0),
      line.pricingTier || 'pvp',
      Number(line.unitPrice || 0),
      Number(line.lineDiscountPercent || 0),
    );
  };

  const save = () => {
    const ok = applyLineUpdate(
      draft.name,
      draft.description,
      Number(draft.quantity),
      Number(draft.widthCm),
      Number(draft.heightCm),
      draft.pricingTier,
      Number(draft.unitPrice),
      Number(draft.lineDiscountPercent),
    );
    if (ok) setEditing(false);
  };

  return <article className="pos-cart-line-wrap">
    <div className="pos-cart-line">
      <POSProductVisual src={line.image} className="pos-cart-image" iconSize={16}/>
      <span className="pos-line-main">
        <b>{line.name}</b>
        <span className="pos-line-badges">
          {line.pricingTierLabel && <span className="pos-line-badge is-tier">{line.pricingTierLabel}</span>}
          {line.mode === 'area' && line.widthCm && line.heightCm && <span className="pos-line-badge is-measure">{line.widthCm}×{line.heightCm} cm · {Number(line.areaTotal || 0).toFixed(2)} m²</span>}
          {Number(line.lineDiscountPercent) > 0 && <span className="pos-line-badge is-discount">−{line.lineDiscountPercent}% desc</span>}
          {line.customUnitPriceApplied && <span className="pos-line-badge is-custom">Precio acordado</span>}
          {workflowLabel && <span className="pos-line-badge is-workflow"><Route size={10} aria-hidden="true"/> {workflowLabel}</span>}
        </span>
        <small>{line.description||`${line.quantity} × ${formatMoney(line.unitPrice)}`}</small>
        <small className={`pos-line-stock-note is-${inventoryTone}`}>{inventoryStatus}</small>
      </span>
      <div className="pos-line-right-col">
        <strong>{formatMoney(line.total||line.quantity*line.unitPrice)}</strong>
        <div className="pos-line-quick-controls" role="group" aria-label={`Cantidad y acciones de ${line.name}`}>
          <button type="button" className="pos-line-step-btn" disabled={Number(line.quantity) <= 1} aria-label={`Reducir cantidad de ${line.name}`} onClick={() => stepQuantity(-1)}><Minus size={12}/></button>
          <span className="pos-line-qty-pill" title="Cantidad de piezas/unidades">{line.quantity}</span>
          <button type="button" className="pos-line-step-btn" aria-label={`Aumentar cantidad de ${line.name}`} onClick={() => stepQuantity(1)}><Plus size={12}/></button>
          {onDuplicate && <button className="icon-button" type="button" title="Duplicar línea (para otra medida o acabado)" aria-label={`Duplicar ${line.name}`} onClick={onDuplicate}><Copy size={13}/></button>}
          <button className="icon-button danger" type="button" title="Quitar del carrito" aria-label={`Quitar ${line.name}`} onClick={onRemove}><X size={15}/></button>
        </div>
      </div>
    </div>
    <button type="button" className="pos-line-edit-toggle" aria-expanded={editing} onClick={() => setEditing((value) => !value)}><Pencil size={13}/>{editing ? 'Cerrar edición' : 'Editar concepto, cantidad, precio o medidas'}</button>
    {editing && <div className="pos-line-editor">
      <label className="pos-line-editor-span-2">Nombre / Concepto<input type="text" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}/></label>
      <label className="pos-line-editor-span-2">Descripción visible<input type="text" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}/></label>
      <label>Cantidad<input type="number" min="0.001" step="any" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}/></label>
      <label>Precio unit. / m² ($)<div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={draft.unitPrice} onChange={(event) => setDraft((current) => ({ ...current, unitPrice: event.target.value }))}/></div></label>
      {line.productId && <label>Tarifa<select value={draft.pricingTier} onChange={(event) => setDraft((current) => ({ ...current, pricingTier: event.target.value as 'pvp' | 'instalacion' | 'corporativo' }))}><option value="pvp">Normal (PVP)</option><option value="instalacion">Con instalación</option><option value="corporativo">Corporativo</option></select></label>}
      <label>Desc. línea (%)<input type="number" min="0" max="100" step="1" value={draft.lineDiscountPercent} onChange={(event) => setDraft((current) => ({ ...current, lineDiscountPercent: event.target.value }))}/></label>
      {line.mode === 'area' && <><label>Ancho (cm)<input type="number" min="0.01" step="0.01" value={draft.widthCm} onChange={(event) => setDraft((current) => ({ ...current, widthCm: event.target.value }))}/></label><label>Alto (cm)<input type="number" min="0.01" step="0.01" value={draft.heightCm} onChange={(event) => setDraft((current) => ({ ...current, heightCm: event.target.value }))}/></label></>}
      <button type="button" className="button button-outline" onClick={save}>Guardar cambios</button>
    </div>}
  </article>;
}

function POSMaterialUsage({ lines, recipes, inventory, branchId, values, status, onChange, onRetry }: {
  lines: any[];
  recipes: any[];
  inventory: any[];
  branchId: string;
  values: Record<string, POSMaterialRequestDraft[]>;
  status: 'checking' | 'ready' | 'error';
  onChange: (lineKey: string, recipeId: string, quantity: string) => void;
  onRetry: () => void;
}) {
  const saleLines = lines.filter((line) => line.catalog_product_id);
  if (status !== 'ready') {
    if (!saleLines.length) return null;
    return <section className={`pos-material-usage is-${status}`} aria-live="polite">
      <div className="pos-material-usage-heading"><b>Consumo de materiales variables</b><small>{status === 'checking' ? 'Verificando recetas activas de esta sucursal…' : 'No se pudieron verificar los acabados configurados.'}</small></div>
      {status === 'error' && <button className="button button-outline" type="button" onClick={onRetry}>Reintentar consulta</button>}
    </section>;
  }
  const rows = saleLines.flatMap((line) => recipes
    .filter((recipe) => recipe.active && recipe.branch_id === branchId && recipe.catalog_product_id === line.catalog_product_id && recipe.calculation_mode === 'explicit_quantity')
    .map((recipe) => ({ line, recipe })));
  if (!rows.length) return null;
  return <section className="pos-material-usage" aria-label="Consumo de materiales por orden">
    <div className="pos-material-usage-heading">
      <div><span className="eyebrow">CANTIDAD REAL POR ORDEN</span><b>Acabados y materiales variables</b></div>
      <small>Ingresa lo utilizado en este pedido; no se calcula automáticamente.</small>
    </div>
    <div className="pos-material-usage-list">
      {rows.map(({ line, recipe }) => {
        const stock = inventory.find((item) => item.variantId === recipe.inventory_variant_id && item.branchId === recipe.branch_id);
        const request = (values[line.line_key] || []).find((entry) => entry.recipeId === recipe.id);
        const quantity = request?.quantity || '';
        const available = stock ? Number(stock.availableQuantity ?? (Number(stock.quantity || 0) - Number(stock.reservedQuantity || 0))) : null;
        const materialName = stock?.name || 'Material vinculado';
        const lineName = line.description || line.name || 'Artículo de la orden';
        return <label className="pos-material-usage-row" key={`${line.line_key}:${recipe.id}`}>
          <span className="pos-material-usage-copy">
            <b>{lineName}</b>
            <small>{materialName}{stock?.variant ? ` · ${stock.variant}` : ''} · {stock?.unit || 'unidad'} · {recipe.fulfillment_stage === 'production' ? 'se reserva para producción' : 'se descuenta al confirmar'}</small>
            <small className={stock?.sourceStatus ? 'pos-material-stock-pending' : undefined}>{!stock ? 'Material aún no asignado al inventario' : stock.sourceStatus ? 'Conteo físico pendiente · disponibilidad sin confirmar' : available === null || !Number.isFinite(available) ? 'Existencia no disponible para consulta' : `Disponible: ${available} ${stock.unit || ''}`}</small>
          </span>
          <span className="pos-material-usage-input">
            <span>Cantidad total usada ({stock?.unit || 'unidad'})</span>
            <input type="number" min="0.001" max="1000000" step="0.001" inputMode="decimal" value={quantity} aria-label={`Cantidad total de ${materialName} usada para ${lineName}`} onChange={(event) => onChange(line.line_key, recipe.id, event.target.value)} />
          </span>
        </label>;
      })}
    </div>
  </section>;
}

export function PosPage() {
  const confirmDialog=useConfirm();
  const { data, add, update, flash, refreshRemote }=useWorkspace();
  const { organizationId, user, hasPermission }=useAuth();
  const { favoriteIds, toggleFavorite, status: favoriteStorageStatus }=useAdvisorProductFavorites(organizationId, user?.id);
  const [form,setForm]=useState({total:'',amountPaid:'',method:'Efectivo',customer:'',customerId:'',customerPhone:'',customerEmail:'',customerDocumentReference:'',description:'',productId:'',branchCode:'VIS',quantity:'1',quoteId:''});
  const [fulfillment,setFulfillment]=useState({installationRequired:false,installationAddress:'',latitude:'',longitude:'',installationAt:'',deliveryAt:''});
  const [showLocationPicker,setShowLocationPicker]=useState(false);
  const [mapLink,setMapLink]=useState('');
  const [clientBriefHtml,setClientBriefHtml]=useState('<p></p>');
  const [saleAssets,setSaleAssets]=useState<CommercialAssetDraft[]>([]);
  const [customerQuery,setCustomerQuery]=useState('');
  const [customerSearch,setCustomerSearch]=useState({loading:false,results:null,error:'',hasMore:false});
  const [customerSearchLimit,setCustomerSearchLimit]=useState(8);
  const [customerSearchRequest,setCustomerSearchRequest]=useState(0);
  const [selectedCustomerSnapshot,setSelectedCustomerSnapshot]=useState(null);
  const [customerHistory,setCustomerHistory]=useState({loading:false,count:0,rows:[],summary:null});
  const [detailTarget,setDetailTarget]=useState<{kind:CommercialDocumentKind;id:string;code:string}|null>(null);
  const [cart,setCart]=useState([]);
  const [discountPercent,setDiscountPercent]=useState('0');
  const [discountReason,setDiscountReason]=useState('');
  const [materialRequestsByLine,setMaterialRequestsByLine]=useState<Record<string,POSMaterialRequestDraft[]>>({});
  const [productionByLine,setProductionByLine]=useState<Record<string, ProductionDetailsValue>>({});
  const [productWorkflowRoutes,setProductWorkflowRoutes]=useState<Record<string, ProductionWorkflowCode>>({});
  const [workflowTemplates,setWorkflowTemplates]=useState<Array<{code:string;name:string}>>([]);
  const [workflowRouteStatus,setWorkflowRouteStatus]=useState<'loading'|'ready'|'unavailable'>('loading');
  const [cartMode,setCartMode]=useState<'quantity'|'area'>('quantity');
  const [cartProductId,setCartProductId]=useState('');
  const [cartSearch,setCartSearch]=useState('');
  const [cartFamily,setCartFamily]=useState('Todas');
  const [cartItemName,setCartItemName]=useState('');
  const [cartQuantity,setCartQuantity]=useState('1');
  const [cartUnitPrice,setCartUnitPrice]=useState('');
  const [cartWidthCm,setCartWidthCm]=useState('100');
  const [cartHeightCm,setCartHeightCm]=useState('100');
  const [cartPriceTier,setCartPriceTier]=useState<'pvp'|'instalacion'|'corporativo'>('pvp');
  const [cartOptionChoice,setCartOptionChoice]=useState('');
  const [catalogLinks,setCatalogLinks]=useState([]);
  const [catalogLinkStatus,setCatalogLinkStatus]=useState<'checking'|'ready'|'error'>('checking');
  const [materialRecipes,setMaterialRecipes]=useState<any[]>([]);
  const [materialRecipesStatus,setMaterialRecipesStatus]=useState<'checking'|'ready'|'error'>('checking');
  const [materialRecipesReload,setMaterialRecipesReload]=useState(0);
  const [centralQuotes,setCentralQuotes]=useState([]);
  const [configuredTaxRate,setConfiguredTaxRate]=useState(15);
  const [taxConfigurationStatus,setTaxConfigurationStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [paymentTarget,setPaymentTarget]=useState(null);
  const [paymentForm,setPaymentForm]=useState({amount:'',method:'Efectivo',reference:'',note:''});
  const [parkedOrders,setParkedOrders]=useState([]);
  const [branchNames,setBranchNames]=useState({});
  const [activeParkedOrderId,setActiveParkedOrderId]=useState('');
  const [parking,setParking]=useState(false);
  const [cashierSession,setCashierSession]=useState({loading:true,session:null,branch:null,error:''});
  const [chargeNow,setChargeNow]=useState(true);
  const [payments,setPayments]=useState<Array<{id:string;method:string;amount:string;reference?:string;note?:string}>>([{id:'payment-1',method:'Efectivo',amount:'',reference:'',note:''}]);
  const [savingSale,setSavingSale]=useState(false);
  const [savingBalancePayment,setSavingBalancePayment]=useState('');
  const [lastSaleConfirmation,setLastSaleConfirmation]=useState(null);
  const [posDaySales,setPosDaySales]=useState([]);
  const [posSalesStatus,setPosSalesStatus]=useState<'loading'|'ready'|'error'|'restricted'>('loading');
  const [pendingSaleRecoveryError,setPendingSaleRecoveryError]=useState('');
  const [pendingSaleRecoveryMode,setPendingSaleRecoveryMode]=useState(false);
  const [mobileSummaryOpen,setMobileSummaryOpen]=useState(false);
  const [checkoutStep,setCheckoutStep]=useState<POSCheckoutStep>('order');
  const [showQuickCashOpen,setShowQuickCashOpen]=useState(false);
  const [quickCashAmount,setQuickCashAmount]=useState('20');
  const [openingQuickCash,setOpeningQuickCash]=useState(false);
  const [cashReloadTick,setCashReloadTick]=useState(0);
  const [recentSalesQuery,setRecentSalesQuery]=useState('');
  const [recentSalesFilter,setRecentSalesFilter]=useState<'all'|'balance'|'paid'>('all');
  const [cartCustomUnitPrice,setCartCustomUnitPrice]=useState('');
  const [showEditBaseModal,setShowEditBaseModal]=useState(false);
  const [newBaseAmount,setNewBaseAmount]=useState('');
  const [savingBase,setSavingBase]=useState(false);
  const [showCashMovementModal,setShowCashMovementModal]=useState(false);
  const [cashMovementDirection,setCashMovementDirection]=useState<'in'|'out'>('in');
  const [cashMovementAmount,setCashMovementAmount]=useState('');
  const [cashMovementReason,setCashMovementReason]=useState('');
  const [savingCashMovement,setSavingCashMovement]=useState(false);
  const [editingSaleId,setEditingSaleId]=useState<string|null>(null);
  const posDraftStorageKey=`visualcorp-pos-cart-draft-v1:${organizationId||'sin-organizacion'}:${user?.id||'sin-usuario'}`;
  const pendingSaleStorageKey=`visualcorp-pos-pending-sale-key:${organizationId||'sin-organizacion'}:${user?.id||'sin-usuario'}`;
  const pendingSaleSnapshotStorageKey=`${pendingSaleStorageKey}:snapshot`;
  const [draftLoadedKey,setDraftLoadedKey]=useState('');
  const pendingSaleKey=useRef('');
  const pendingSaleSnapshotRef=useRef<any>(null);
  const pendingSaleSnapshot={form,cart,discountPercent,discountReason,materialRequestsByLine,fulfillment,mapLink,payments,chargeNow,activeParkedOrderId,allowBackorder:pendingSaleSnapshotRef.current?.allowBackorder,saleLines:pendingSaleSnapshotRef.current?.saleLines,saleNote:pendingSaleSnapshotRef.current?.saleNote,productionByLine,clientBriefHtml};
  const pendingSaleChanged=Boolean(pendingSaleRecoveryMode&&pendingSaleSnapshotRef.current&&pendingSaleSignature(pendingSaleSnapshot)!==pendingSaleSignature(pendingSaleSnapshotRef.current));
  useEffect(()=>{
    if(!supabase||!organizationId||!user)return;
    const stored=sessionStorage.getItem(pendingSaleStorageKey)||'';
    pendingSaleKey.current=stored;
    if(!stored){pendingSaleSnapshotRef.current=null;setPendingSaleRecoveryMode(false);setPendingSaleRecoveryError('');return;}
    try{
      const snapshot=JSON.parse(sessionStorage.getItem(pendingSaleSnapshotStorageKey)||'null');
      if(!snapshot||!snapshot.form){pendingSaleSnapshotRef.current=null;setPendingSaleRecoveryMode(false);setPendingSaleRecoveryError('Existe una venta pendiente de revisar antes de registrar otra.');flash('Hay una operación pendiente sin datos suficientes para recuperarla. Revisa las ventas de hoy antes de volver a cobrar.');return;}
      const restoredForm={...snapshot.form,branchCode:String(snapshot.form.branchCode||form.branchCode)};
      const restoredCart=sanitizePOSCart(snapshot.cart);
      const restoredPayments=sanitizePOSPayments(snapshot.payments);
      const restoredProductionByLine=sanitizeProductionDetails(snapshot.productionByLine);
      const restoredMaterialRequests=sanitizePOSMaterialRequestMap(snapshot.materialRequestsByLine);
      const restoredDiscountPercent=String(Math.min(40,Math.max(0,Math.round(Number(snapshot.discountPercent)||0))));
      const restoredDiscountReason=String(snapshot.discountReason||'').slice(0,300);
      const restoredSnapshot={form:restoredForm,cart:restoredCart,discountPercent:restoredDiscountPercent,discountReason:restoredDiscountReason,materialRequestsByLine:restoredMaterialRequests,fulfillment:snapshot.fulfillment,mapLink:snapshot.mapLink,payments:restoredPayments,chargeNow:snapshot.chargeNow,activeParkedOrderId:snapshot.activeParkedOrderId,allowBackorder:snapshot.allowBackorder,saleLines:Array.isArray(snapshot.saleLines)?sanitizePOSSaleLines(snapshot.saleLines):undefined,saleNote:String(snapshot.saleNote||''),productionByLine:restoredProductionByLine,productionJobs:Array.isArray(snapshot.productionJobs)?snapshot.productionJobs:undefined,clientBriefHtml:String(snapshot.clientBriefHtml||'<p></p>')};
      pendingSaleSnapshotRef.current=restoredSnapshot;setPendingSaleRecoveryMode(true);
      setForm((current)=>({...current,...restoredForm}));
      setCart(restoredCart);setDiscountPercent(restoredDiscountPercent);setDiscountReason(restoredDiscountReason);setMaterialRequestsByLine(restoredMaterialRequests);setProductionByLine(restoredProductionByLine);setFulfillment(snapshot.fulfillment||{installationRequired:false,installationAddress:'',latitude:'',longitude:'',installationAt:'',deliveryAt:''});setMapLink(String(snapshot.mapLink||''));setClientBriefHtml(String(snapshot.clientBriefHtml||'<p></p>'));
      setPayments(restoredPayments);
      setChargeNow(snapshot.chargeNow!==false);setActiveParkedOrderId(String(snapshot.activeParkedOrderId||''));setCustomerQuery(String(restoredForm.customer||''));setSelectedCustomerSnapshot(restoredForm.customerId?{id:String(restoredForm.customerId),name:String(restoredForm.customer||''),phone:String(restoredForm.customerPhone||''),email:String(restoredForm.customerEmail||''),documentReference:String(restoredForm.customerDocumentReference||'')}:null);setDraftLoadedKey(posDraftStorageKey);
      setPendingSaleRecoveryError('');
      flash('Recuperé una operación pendiente. Confirma de nuevo para completar sus vínculos sin duplicar la venta.');
   }catch{pendingSaleSnapshotRef.current=null;setPendingSaleRecoveryMode(false);setPendingSaleRecoveryError('No se pudo recuperar una venta pendiente. Revisa las ventas antes de volver a cobrar.');flash('Hay una operación pendiente que no se pudo restaurar. No vuelvas a cobrarla hasta revisar las ventas de hoy.');}
  },[organizationId,user?.id,pendingSaleStorageKey,pendingSaleSnapshotStorageKey,posDraftStorageKey]);
  useEffect(()=>{
    if(!supabase||!organizationId){setProductWorkflowRoutes({});setWorkflowTemplates([]);setWorkflowRouteStatus('unavailable');return;}
    let active=true;
    setWorkflowRouteStatus('loading');
    Promise.all([
      supabase.from('catalog_product_workflow_routes').select('catalog_product_id,workflow_code').eq('organization_id',organizationId).eq('active',true),
      supabase.from('production_workflow_templates').select('code,name').eq('organization_id',organizationId).eq('active',true).order('name'),
    ]).then(([routeResult,templateResult])=>{
      if(!active)return;
      if(routeResult.error||templateResult.error){setProductWorkflowRoutes({});setWorkflowTemplates([]);setWorkflowRouteStatus('unavailable');return;}
      const rows=routeResult.data||[];
      setWorkflowTemplates((templateResult.data||[]).filter((row)=>isProductionWorkflowCode(row.code)));
      setProductWorkflowRoutes(Object.fromEntries(rows.filter((row)=>isProductionWorkflowCode(row.workflow_code)).map((row)=>[row.catalog_product_id,row.workflow_code as ProductionWorkflowCode])));
      setWorkflowRouteStatus('ready');
    });
    return()=>{active=false;};
  },[organizationId]);
  useEffect(()=>{
    if(!organizationId||!user)return;
    if(sessionStorage.getItem(pendingSaleSnapshotStorageKey)){setDraftLoadedKey(posDraftStorageKey);return;}
    setDraftLoadedKey('');
    setCart([]);setDiscountPercent('0');setDiscountReason('');setMaterialRequestsByLine({});setProductionByLine({});
    try{
      const raw=sessionStorage.getItem(posDraftStorageKey);
      if(raw){
        const saved=JSON.parse(raw);
        const age=Date.now()-Number(saved.savedAt||0);
        if(age>=0&&age<24*60*60*1000&&Array.isArray(saved.cart)){
          const restored=sanitizePOSCart(saved.cart);
          if(restored.length){setCart(restored);setDiscountPercent(String(Math.min(40,Math.max(0,Math.round(Number(saved.discountPercent)||0)))));setDiscountReason(String(saved.discountReason||'').slice(0,300));setMaterialRequestsByLine(sanitizePOSMaterialRequestMap(saved.materialRequestsByLine));setProductionByLine(sanitizeProductionDetails(saved.productionByLine));flash('Recuperé el carrito de esta sesión. Revisa sucursal, artículos y precios antes de cobrar.');}
          if(typeof saved.branchCode==='string'&&saved.branchCode)setForm((current)=>({...current,branchCode:saved.branchCode}));
        }else sessionStorage.removeItem(posDraftStorageKey);
      }
    }catch{sessionStorage.removeItem(posDraftStorageKey);}
    setDraftLoadedKey(posDraftStorageKey);
  },[organizationId,user?.id,posDraftStorageKey,pendingSaleSnapshotStorageKey]);
  useEffect(()=>{
    if(!organizationId||!user||draftLoadedKey!==posDraftStorageKey)return;
    if(cart.length)sessionStorage.setItem(posDraftStorageKey,JSON.stringify({version:1,savedAt:Date.now(),branchCode:form.branchCode,cart,discountPercent,discountReason,materialRequestsByLine,productionByLine}));
    else sessionStorage.removeItem(posDraftStorageKey);
  },[organizationId,user?.id,draftLoadedKey,posDraftStorageKey,cart,discountPercent,discountReason,materialRequestsByLine,form.branchCode,productionByLine]);
  useEffect(()=>{
    if(!data.branches.length)return;
    if(data.branches.some((branch)=>branch.code===form.branchCode))return;
    setForm((current)=>data.branches.some((branch)=>branch.code===current.branchCode)?current:{...current,branchCode:data.branches[0].code});
  },[data.branches,form.branchCode]);
  const resetCheckout=()=>{
    setForm((current)=>({total:'',amountPaid:'',method:'Efectivo',customer:'',customerId:'',customerPhone:'',customerEmail:'',customerDocumentReference:'',description:'',productId:'',branchCode:current.branchCode,quantity:'1',quoteId:''}));
    setCustomerQuery('');setSelectedCustomerSnapshot(null);setCart([]);setDiscountPercent('0');setDiscountReason('');setMaterialRequestsByLine({});setProductionByLine({});setActiveParkedOrderId('');setChargeNow(true);setPayments([{id:'payment-1',method:'Efectivo',amount:'',reference:'',note:''}]);
    setCartProductId('');setCartItemName('');setCartQuantity('1');setCartUnitPrice('');setCartWidthCm('100');setCartHeightCm('100');setCartPriceTier('pvp');setCartOptionChoice('');setCartCustomUnitPrice('');
    setFulfillment({installationRequired:false,installationAddress:'',latitude:'',longitude:'',installationAt:'',deliveryAt:''});setMapLink('');setClientBriefHtml('<p></p>');saleAssets.forEach(asset=>asset.previewUrl&&URL.revokeObjectURL(asset.previewUrl));setSaleAssets([]);setMobileSummaryOpen(false);setPaymentTarget(null);
    setCheckoutStep('order');
  };
  useEffect(()=>{if(!supabase||!organizationId){setCatalogLinkStatus('error');return;}let active=true;setCatalogLinkStatus('checking');Promise.all([supabase.from('catalog_inventory_links').select('catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id',organizationId).eq('active',true),supabase.from('central_quotes').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(100)]).then(([links,quotes])=>{if(!active)return;if(links.error){setCatalogLinkStatus('error');flash(`No se pudieron verificar los vínculos de stock: ${links.error.message}`);}else{setCatalogLinks(links.data||[]);setCatalogLinkStatus('ready');}if(quotes.error)flash(`No se pudieron cargar cotizaciones centrales: ${quotes.error.message}`);else setCentralQuotes(quotes.data||[]);});return()=>{active=false;};},[organizationId]);
  useEffect(()=>{
    if(!supabase||!organizationId){setTaxConfigurationStatus('error');return;}
    let active=true;setTaxConfigurationStatus('loading');
    void (async()=>{
      try{
        const {data:settings,error}=await supabase.from('calculator_settings').select('tax_rate').eq('organization_id',organizationId).eq('id','default').maybeSingle();
        if(!active)return;
        if(error){setTaxConfigurationStatus('error');return;}
        const configured=settings?.tax_rate;
        const rate=configured===null||configured===undefined?15:Number(configured);
        if(!Number.isFinite(rate)||rate<0||rate>100){setTaxConfigurationStatus('error');return;}
        setConfiguredTaxRate(rate);setTaxConfigurationStatus('ready');
      }catch{if(active)setTaxConfigurationStatus('error');}
    })();
    return()=>{active=false;};
  },[organizationId]);
  useEffect(()=>{let active=true;const load=async()=>{if(!supabase||!organizationId||!user){setCashierSession({loading:false,session:null,branch:null,error:''});return;}setCashierSession(current=>({...current,loading:true,error:''}));try{const {data:branch,error:branchError}=await supabase.from('branches').select('id,code,name').eq('organization_id',organizationId).eq('code',form.branchCode).maybeSingle();if(branchError)throw branchError;if(!branch?.id){if(active)setCashierSession({loading:false,session:null,branch:null,error:''});return;}const {data:session,error:sessionError}=await supabase.from('cash_sessions').select('id,opened_at,opening_cash,status').eq('organization_id',organizationId).eq('branch_id',branch.id).eq('opened_by',user.id).eq('status','open').maybeSingle();if(sessionError)throw sessionError;if(active)setCashierSession({loading:false,session,branch,error:''});}catch(error){if(active)setCashierSession({loading:false,session:null,branch:null,error:error.message||'Error desconocido'});}};load();return()=>{active=false;};},[organizationId,user?.id,form.branchCode,cashReloadTick]);
  const openCashSessionFromPOS = async (overrideAmount?: number) => {
    if (!supabase || !organizationId || !user || openingQuickCash) return;
    const openingAmount = overrideAmount !== undefined ? overrideAmount : Number(quickCashAmount);
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      flash('Ingresa un fondo inicial válido (0 o mayor).');
      return;
    }
    setOpeningQuickCash(true);
    try {
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('id,code,name')
        .eq('organization_id', organizationId)
        .eq('code', form.branchCode)
        .maybeSingle();
      if (branchError) throw branchError;
      if (!branch?.id) throw new Error('No encontramos la sucursal seleccionada.');

      let rpcSucceeded = false;
      try {
        const { error: rpcError } = await supabase.rpc('open_pos_cash_session', {
          p_branch_id: branch.id,
          p_opening_cash: openingAmount,
        });
        if (!rpcError) {
          rpcSucceeded = true;
        }
      } catch {
        rpcSucceeded = false;
      }

      if (!rpcSucceeded) {
        let registerId: string | null = null;
        const { data: registers, error: regError } = await supabase
          .from('cash_registers')
          .select('id,name,active,assigned_advisor_id')
          .eq('organization_id', organizationId)
          .eq('branch_id', branch.id);
        if (!regError && Array.isArray(registers) && registers.length > 0) {
          const activeRegs = registers.filter((r: any) => r.active);
          const myReg = activeRegs.find((r: any) => r.assigned_advisor_id === user.id);
          if (myReg) {
            registerId = myReg.id;
          } else if (hasPermission('cash', 'edit') && activeRegs[0]) {
            registerId = activeRegs[0].id;
          }
        }
        const { error: insertError } = await supabase
          .from('cash_sessions')
          .insert({
            organization_id: organizationId,
            branch_id: branch.id,
            cash_register_id: registerId,
            opening_cash: openingAmount,
            opened_by: user.id,
            status: 'open',
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
      }

      setShowQuickCashOpen(false);
      setCashReloadTick((tick) => tick + 1);
      flash(`Turno de caja abierto en ${branch.name || branch.code} con fondo inicial de ${formatMoney(openingAmount)}.`);
    } catch (error: any) {
      flash(`No se pudo abrir la caja desde el POS: ${error?.message || 'Error desconocido'}`);
    } finally {
      setOpeningQuickCash(false);
    }
  };

  const handleUpdateBase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashierSession.session?.id || savingBase) return;
    const amount = Number(newBaseAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      flash('Ingresa un monto de base válido.');
      return;
    }
    setSavingBase(true);
    try {
      const { error: rpcErr } = await supabase.rpc('update_cash_session_details', {
        p_session: cashierSession.session.id,
        p_opening_cash: amount,
        p_reason: 'Ajuste desde POS',
      });
      if (rpcErr) {
        const { error: directErr } = await supabase
          .from('cash_sessions')
          .update({ opening_cash: amount })
          .eq('id', cashierSession.session.id);
        if (directErr) throw directErr;
      }
      setShowEditBaseModal(false);
      setCashReloadTick((tick) => tick + 1);
      flash(`Base de caja actualizada a ${formatMoney(amount)}.`);
    } catch (err: any) {
      flash(`Error al actualizar base: ${err.message}`);
    } finally {
      setSavingBase(false);
    }
  };

  const handleRecordCashMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashierSession.session?.id || savingCashMovement) return;
    const amount = Number(cashMovementAmount);
    const reason = cashMovementReason.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      flash('Ingresa un monto mayor a cero.');
      return;
    }
    if (reason.length < 3) {
      flash('Indica el motivo del movimiento (mínimo 3 caracteres).');
      return;
    }
    setSavingCashMovement(true);
    try {
      const key = globalThis.crypto?.randomUUID?.() || `mov-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const { error } = await supabase.rpc('record_cash_session_movement', {
        p_session: cashierSession.session.id,
        p_direction: cashMovementDirection,
        p_amount: amount,
        p_reason: reason,
        p_key: key,
      });
      if (error) throw error;
      setShowCashMovementModal(false);
      setCashMovementAmount('');
      setCashMovementReason('');
      setCashReloadTick((tick) => tick + 1);
      flash(`Movimiento de ${cashMovementDirection === 'in' ? 'ingreso' : 'retiro'} (${formatMoney(amount)}) registrado.`);
    } catch (err: any) {
      flash(`No se pudo registrar el movimiento: ${err.message}`);
    } finally {
      setSavingCashMovement(false);
    }
  };

  const handleExpressCashCheckout = async () => {
    if (!form.quoteId && !cart.length) {
      focusCheckoutField('#pos-product-search-input');
      flash('Agrega un artículo o cotización antes de cobrar.');
      return;
    }
    if (activeTotal <= 0) {
      flash('La orden requiere un total mayor a cero.');
      return;
    }
    if (!discountReasonValid) {
      focusCheckoutField('#pos-discount-reason');
      flash('Escribe el motivo del descuento antes de continuar.');
      return;
    }
    if (customerNameMissing) {
      focusCheckoutField('.pos-customer-picker input[role="combobox"]');
      flash('Completa el nombre del cliente o limpia la búsqueda.');
      return;
    }
    setChargeNow(true);
    setPayments([
      {
        id: 'payment-1',
        method: 'Efectivo',
        amount: activeTotal.toFixed(2),
        reference: '',
        note: 'Cobro exprés en efectivo',
      },
    ]);
    if (requiresWorkDetails && !validateWorkDetails()) {
      setCheckoutStep('details');
      return;
    }
    setCheckoutStep('payment');
    setMobileSummaryOpen(true);
    flash('Cobro exprés en efectivo seleccionado con monto exacto.');
  };
  const refreshParkedOrders=async()=>{
    if(!supabase||!organizationId)return;
    const [{data:orders,error:ordersError},{data:branches,error:branchesError}]=await Promise.all([
      supabase.from('parked_pos_orders').select('id,branch_id,created_by,payload,total,idempotency_key,created_at').eq('organization_id',organizationId).eq('status','parked').order('created_at',{ascending:false}).limit(50),
      supabase.from('branches').select('id,code,name').eq('organization_id',organizationId),
    ]);
    if(ordersError)throw ordersError;
    if(branchesError)throw branchesError;
    setParkedOrders(orders||[]);
    setBranchNames(Object.fromEntries((branches||[]).map(branch=>[branch.id,branch.name||branch.code])));
  };
  useEffect(()=>{let active=true;if(!supabase||!organizationId)return undefined;refreshParkedOrders().catch(error=>{if(active)flash(`No se pudieron cargar las órdenes en espera: ${error.message}`);});return()=>{active=false;};},[organizationId]);
  const canSearchCustomers=hasPermission('crm','view');
  useEffect(()=>{
    let active=true;
    if(!supabase||!organizationId){setMaterialRecipes([]);setMaterialRecipesStatus('error');return()=>{active=false;};}
    setMaterialRecipesStatus('checking');
    void supabase.from('catalog_material_recipes').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,calculation_mode,fulfillment_stage,active').eq('organization_id',organizationId).eq('active',true).then(({data:rows,error})=>{
      if(!active)return;
      if(error){setMaterialRecipes([]);setMaterialRecipesStatus('error');return;}
      setMaterialRecipes(rows||[]);setMaterialRecipesStatus('ready');
    });
    return()=>{active=false;};
  },[organizationId,materialRecipesReload]);
  const customerLookupActive=customerQuery.trim().length>=2||normalizeCustomerPhone(form.customerPhone).length>=3||form.customerEmail.trim().length>=3||String(form.customerDocumentReference||'').replace(/\D/g,'').length>=4;
  useEffect(()=>{
    let active=true;
    if(!supabase||!organizationId||!canSearchCustomers||form.customerId||!customerLookupActive){setCustomerSearch({loading:false,results:null,error:'',hasMore:false});return()=>{active=false;};}
    setCustomerSearch({loading:true,results:null,error:'',hasMore:false});
    const timeout=window.setTimeout(()=>{
      void (async()=>{try{
        const {data:rows,error}=await supabase.rpc('search_visualcorp_pos_customers',{p_query:customerQuery,p_phone:form.customerPhone,p_email:form.customerEmail,p_document_reference:form.customerDocumentReference,p_limit:Math.min(customerSearchLimit+1,20)});
        if(!active)return;
        if(error){setCustomerSearch({loading:false,results:null,error:error.message||'No se pudo buscar clientes.',hasMore:false});return;}
        const responseRows=Array.isArray(rows)?rows:[];
        const results=responseRows.slice(0,customerSearchLimit).map((row)=>({id:row.id,name:row.full_name,phone:row.phone||'',email:row.email||'',documentReference:row.document_reference||'',notes:row.notes||'',preferences:row.preferences||{},tags:row.tags||[]}));
        setCustomerSearch({loading:false,results,error:'',hasMore:responseRows.length>customerSearchLimit});
      }catch(error){if(active)setCustomerSearch({loading:false,results:null,error:error.message||'No se pudo buscar clientes.',hasMore:false});}})();
    },260);
    return()=>{active=false;window.clearTimeout(timeout);};
  },[customerQuery,form.customerPhone,form.customerEmail,form.customerDocumentReference,form.customerId,organizationId,canSearchCustomers,customerLookupActive,customerSearchLimit,customerSearchRequest]);
  const selectedCustomer=(data.customers||[]).find((customer)=>customer.id===form.customerId)||(selectedCustomerSnapshot?.id===form.customerId?selectedCustomerSnapshot:undefined)||(form.quoteId&&form.customerId?{id:form.customerId,name:form.customer,phone:form.customerPhone,email:form.customerEmail,documentReference:form.customerDocumentReference}:undefined);
  const customerCandidates=[...(data.customers||[]),...(customerSearch.results||[])];
  const duplicateCustomer=!selectedCustomer&&customerCandidates.find((customer)=>{
    const newEmail=String(form.customerEmail||'').trim().toLocaleLowerCase('es');
    const newDocument=String(form.customerDocumentReference||'').replace(/\W/g,'').toLocaleLowerCase('es');
    const newPhone=normalizeCustomerPhone(form.customerPhone);
    return Boolean((newEmail&&String(customer.email||'').trim().toLocaleLowerCase('es')===newEmail)||(newDocument&&String(customer.documentReference||'').replace(/\W/g,'').toLocaleLowerCase('es')===newDocument)||(newPhone.length>=8&&normalizeCustomerPhone(customer.phone)===newPhone));
  });
  const customerNameMissing=!selectedCustomer&&Boolean((customerQuery.trim()||form.customerPhone.trim()||form.customerEmail.trim()||form.customerDocumentReference.trim())&&!form.customer.trim());
  const customerLookupPending=!selectedCustomer&&customerLookupActive&&canSearchCustomers&&(customerSearch.loading||(!customerSearch.results&&!customerSearch.error));
  const customerLookupFailed=!selectedCustomer&&customerLookupActive&&canSearchCustomers&&Boolean(customerSearch.error);
  const canViewCustomerHistory=hasPermission('sales','view')&&canSearchCustomers;
  useEffect(()=>{
    if(!form.customerId||!canViewCustomerHistory||!supabase||!organizationId){setCustomerHistory({loading:false,count:0,rows:[],summary:null});return;}
    let active=true;setCustomerHistory({loading:true,count:0,rows:[],summary:null});
    supabase.rpc('get_visualcorp_pos_customer_summary',{p_customer_id:form.customerId}).then(({data:result,error})=>{
      if(!active)return;
      if(error){flash(`No se pudo cargar el historial completo del cliente: ${error.message}`);setCustomerHistory({loading:false,count:0,rows:[],summary:null});return;}
      const summary=result&&typeof result==='object'?result:{};
      const rows=Array.isArray(summary.recent_purchases)?summary.recent_purchases:[];
      setCustomerHistory({loading:false,count:Number(summary.purchase_count)||0,rows:rows.map((sale)=>({id:sale.id,code:sale.code,total:Number(sale.total)||0,date:sale.date,description:sale.description||sale.code||'Compra registrada'})),summary:{netSpent:Number(summary.net_spent)||0,netPaid:Number(summary.net_paid)||0,refunded:Number(summary.refunded)||0,balanceDue:Number(summary.balance_due)||0,lastPurchaseAt:summary.last_purchase_at||'',topProducts:Array.isArray(summary.top_products)?summary.top_products.map((product)=>({name:String(product.name||''),quantity:Number(product.quantity)||0})):[]}});
    });
    return()=>{active=false;};
  },[form.customerId,canViewCustomerHistory,organizationId]);
  const branchName=data.branches.find((branch)=>branch.code===form.branchCode)?.name||(form.branchCode==='GIGA'?'Gigaprint':form.branchCode==='VIS'?'Visual Corp':form.branchCode);
  const quotePreview=centralQuotes.find((quote)=>quote.id===form.quoteId);
  const currentQuoteLines=getPOSQuoteSaleLines(quotePreview);
  const quoteFinancial=getPOSQuoteFinancial(quotePreview);
  const quoteHasFinancial=Boolean(quoteFinancial&&Number.isFinite(Number(quoteFinancial.subtotal)));
  const quoteTaxApplied=quoteHasFinancial&&quoteFinancial.iva_applied===true;
  const quoteTaxRate=quoteHasFinancial?Number(quoteFinancial.iva_rate)||0:0;
  const quoteTaxAmount=quoteTaxApplied?Number(quoteFinancial.iva_amount)||0:0;
  const quoteSubtotal=quoteHasFinancial?Number(quoteFinancial.subtotal)||0:currentQuoteLines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unit_price),0);
  const quoteDiscount=quoteHasFinancial?Number(quoteFinancial.discount_amount)||0:0;
  const quoteShipping=quoteHasFinancial?Number(quoteFinancial.shipping_cost)||0:0;
  const cartTotal=Math.round(cart.reduce((sum,line)=>sum+(Number(line.total)||Number(line.quantity)*Number(line.unitPrice)),0)*100)/100;
  const manualDiscountPercent=Math.min(40,Math.max(0,Math.round(Number(discountPercent)||0)));
  const manualDiscountAmount=roundMoney(cartTotal*manualDiscountPercent/100);
  const discountedSubtotal=roundMoney(Math.max(0,cartTotal-manualDiscountAmount));
  const manualTaxAmount=roundMoney(discountedSubtotal*configuredTaxRate/100);
  const discountReasonValid=Boolean(form.quoteId||manualDiscountAmount===0||(discountReason.trim().length>=3&&discountReason.trim().length<=300));
  const activeTotal=form.quoteId?Number(form.total)||0:roundMoney(discountedSubtotal+manualTaxAmount);
  const activeSubtotal=form.quoteId?quoteSubtotal:cartTotal;
  const activeDiscount=form.quoteId?quoteDiscount:manualDiscountAmount;
  const activeTaxRate=form.quoteId?quoteTaxRate:configuredTaxRate;
  const activeTaxAmount=form.quoteId?quoteTaxAmount:manualTaxAmount;
  const activeShipping=form.quoteId?quoteShipping:0;
  const activeTaxApplied=form.quoteId?quoteTaxApplied:true;
  const activeTaxLabel=form.quoteId?(quoteHasFinancial?'No aplicado':'No consta en la cotización'):'No aplicado';
  const paymentBreakdown=calculatePOSPaymentBreakdown(activeTotal,payments);
  const paymentPreview=paymentBreakdown.applied;
  const selectedCartProduct=data.catalog.find((product)=>product.id===cartProductId);
  const modeCatalog=useMemo(()=>data.catalog.filter(product=>(product.mode==='area'?'area':'quantity')===cartMode),[data.catalog,cartMode]);
  const cartFamilies=useMemo(()=>[...new Set<string>(modeCatalog.map(product=>String(product.family||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')),[modeCatalog]);
  const selectedBranchId=cashierSession.branch?.code===form.branchCode?cashierSession.branch.id:data.branches.find((branch)=>branch.code===form.branchCode)?.id||'';
  const canViewPOSSales=hasPermission('sales','view');
  const canManageBackorders=hasPermission('purchases','edit');
  const hasPendingBackorderAuthorization=Boolean(pendingSaleRecoveryMode&&pendingSaleSnapshotRef.current?.allowBackorder===true);
  const advisorDisplayName=user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email||'Visual Corp';
  const copyPOSWhatsApp=async()=>{
    const messageItems=form.quoteId?currentQuoteLines.map((line:any)=>({name:line.description,quantity:line.quantity,pieceQuantity:line.pieceQuantity,pieceUnit:'piezas',totalArea:line.totalArea,unit:line.unit,dimensions:line.widthCm&&line.heightCm?`${line.widthCm} × ${line.heightCm} cm`:undefined,unitPrice:line.unit_price,lineTotal:line.unit_price*line.quantity})):cart.map((line:any)=>({name:line.name,quantity:line.mode==='area'?line.billingQuantity:line.quantity,pieceQuantity:line.mode==='area'?line.quantity:undefined,pieceUnit:'piezas',totalArea:line.mode==='area'?line.areaTotal:undefined,unit:line.mode==='area'?'m²':line.unit,dimensions:line.widthCm&&line.heightCm?`${line.widthCm} × ${line.heightCm} cm`:undefined,unitPrice:line.unitPrice,lineTotal:line.total}));
    if(!messageItems.length){flash('Agrega un artículo o una cotización antes de copiar.');return;}
    const message=buildPOSWhatsAppMessage({advisor:advisorDisplayName,customer:form.customer,branch:branchName,reference:quotePreview?.quote_code,items:messageItems,total:activeTotal,quoteFinancial,subtotal:form.quoteId?undefined:cartTotal,discountAmount:manualDiscountAmount,discountPercent:manualDiscountPercent,discountReason,taxRate:configuredTaxRate,taxAmount:manualTaxAmount});
    try{await copyTextToClipboard(message);flash('Resumen de la orden copiado para WhatsApp.');}catch(error:any){flash(error?.message||'No se pudo copiar el mensaje.');}
  };
  const saleMaterialLines=form.quoteId&&pendingSaleRecoveryMode&&Array.isArray(pendingSaleSnapshotRef.current?.saleLines)&&pendingSaleSnapshotRef.current.saleLines.length?sanitizePOSSaleLines(pendingSaleSnapshotRef.current.saleLines):form.quoteId?currentQuoteLines:cart.map((line)=>({line_key:line.key,catalog_product_id:line.productId||null,description:line.description||line.name,quantity:Number(line.billingQuantity)||line.quantity}));
  const updateMaterialRequest=(lineKey:string,recipeId:string,quantity:string)=>setMaterialRequestsByLine((current)=>{
    const next=(current[lineKey]||[]).filter((request)=>request.recipeId!==recipeId);
    return {...current,[lineKey]:[...next,{recipeId,quantity}]};
  });
  const productionLines:ProductionLine[]=form.quoteId?currentQuoteLines.map((line)=>({line_key:line.line_key,name:line.description,productId:line.catalog_product_id,widthCm:line.widthCm,heightCm:line.heightCm,optionChoice:line.optionChoice})):cart.map((line)=>({line_key:line.key,name:line.name,productId:line.productId,widthCm:line.widthCm,heightCm:line.heightCm,optionChoice:line.optionChoice}));
  const requiresWorkDetails=fulfillment.installationRequired||productionLines.some((line)=>line.productId&&isProductionWorkflowCode(productWorkflowRoutes[line.productId]))||saleMaterialLines.some((line)=>line.catalog_product_id&&(materialRecipesStatus!=='ready'||materialRecipes.some((recipe)=>recipe.active&&recipe.branch_id===selectedBranchId&&recipe.catalog_product_id===line.catalog_product_id&&recipe.calculation_mode==='explicit_quantity')));
  const pendingQuoteSnapshotChanged=Boolean(pendingSaleRecoveryMode&&form.quoteId&&Array.isArray(pendingSaleSnapshotRef.current?.saleLines)&&pendingSaleSnapshotRef.current.saleLines.length&&posSaleLinesSignature(pendingSaleSnapshotRef.current.saleLines)!==posSaleLinesSignature(currentQuoteLines));
  const pendingOperationChanged=pendingSaleChanged||pendingQuoteSnapshotChanged;
  const previewLines=form.quoteId?currentQuoteLines.map((line)=>({catalog_product_id:line.catalog_product_id,quantity:line.quantity})):cart.map((line)=>({catalog_product_id:line.productId||null,quantity:Number(line.billingQuantity)||Number(line.quantity)}));
  const previewShortages=findPOSStockShortages(previewLines,catalogLinks,selectedBranchId,data.inventory);
  const backorderPermissionMissing=Boolean(previewShortages.length&&!canManageBackorders&&!hasPendingBackorderAuthorization);
  const refreshPOSDaySales=useCallback(async()=>{
    if(!supabase||!organizationId||!selectedBranchId){setPosDaySales([]);setPosSalesStatus('loading');return;}
    if(!canViewPOSSales){setPosDaySales([]);setPosSalesStatus('restricted');return;}
    setPosSalesStatus('loading');
    try{
      const start=new Date();start.setHours(0,0,0,0);
      const end=new Date(start);end.setDate(end.getDate()+1);
      const pageSize=500;const rows=[];
      for(let offset=0;;offset+=pageSize){
        const {data:page,error}=await supabase.from('sales').select('id,sale_code,customer_id,status,urgent_backorder,total,note,payment_method,created_at,sale_lines(description_snapshot,quantity),sale_payments(method,amount)').eq('organization_id',organizationId).eq('branch_id',selectedBranchId).eq('status','confirmed').gte('created_at',start.toISOString()).lt('created_at',end.toISOString()).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+pageSize-1);
        if(error)throw error;
        rows.push(...(page||[]));
        if((page||[]).length<pageSize)break;
      }
      const customerById=new Map<string,any>((data.customers||[]).map((customer:any)=>[customer.id,customer]));
      const paymentLabels={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',other:'Otro'};
      const mapped=rows.map((row)=>{const paid=(row.sale_payments||[]).reduce((sum,payment)=>sum+Number(payment.amount||0),0);const methods=[...new Set((row.sale_payments||[]).map((payment)=>payment.method))];return{id:row.id,code:row.sale_code||row.id.slice(0,8),total:Number(row.total),paid,balance:Math.max(0,Number(row.total)-paid),date:row.created_at,method:methods.length>1?'Pago dividido':paymentLabels[methods[0]||row.payment_method]||'Otro',customer:customerById.get(row.customer_id)?.name||'',description:(row.sale_lines||[]).map((line)=>line.description_snapshot).join(', '),quantity:(row.sale_lines||[]).reduce((sum,line)=>sum+Number(line.quantity||0),0),urgent:row.urgent_backorder,status:row.status,note:row.note};});
      setPosDaySales(mapped);setPosSalesStatus('ready');
    }catch{setPosDaySales([]);setPosSalesStatus('error');}
  },[organizationId,selectedBranchId,canViewPOSSales,data.customers]);
  useEffect(()=>{void refreshPOSDaySales();},[refreshPOSDaySales]);
  const salesToday=posDaySales;
  const inventoryByVariant=useMemo(()=>{
    const rows=new Map<string,any[]>();
    data.inventory.filter(row=>row.branchId===selectedBranchId&&!row.archived).forEach(row=>rows.set(row.variantId,[...(rows.get(row.variantId)||[]),row]));
    return rows;
  },[data.inventory,selectedBranchId]);
  const linksByProduct=useMemo(()=>catalogLinks.filter(link=>link.active&&link.branch_id===selectedBranchId).reduce((links,link)=>{
    links.set(link.catalog_product_id,[...(links.get(link.catalog_product_id)||[]),link]);return links;
  },new Map<string,any[]>()),[catalogLinks,selectedBranchId]);
  const skuCodesByProduct=useMemo(()=>Object.fromEntries([...linksByProduct].map(([productId,links])=>{
    const codes=links.flatMap(link=>(inventoryByVariant.get(link.inventory_variant_id)||[]).flatMap(stock=>[stock.sku,stock.variantSku].filter(Boolean)));
    return [productId,[...new Set(codes)]];
  })),[linksByProduct,inventoryByVariant]);
  const stockByProduct=useMemo(()=>Object.fromEntries(modeCatalog.map(product=>{
    const links=linksByProduct.get(product.id)||[];
    const stockRows=links.length===1?inventoryByVariant.get(links[0].inventory_variant_id)||[]:[];
    const stock=stockRows.length===1?stockRows[0]:null;
    return [product.id,!links.length?'Sin vínculo de inventario':links.length>1?'Varias existencias vinculadas · revisa la disponibilidad':!stock||stock.sourceStatus?'Disponibilidad por confirmar':`Disponible: ${Number(stock.availableQuantity ?? (Number(stock.quantity||0)-Number(stock.reservedQuantity||0)))} ${stock.unit||product.unit||'unidades'}`];
  })),[modeCatalog,linksByProduct,inventoryByVariant]);
  const stockMetaByProduct=useMemo<Record<string,POSStockSemanticMeta>>(()=>Object.fromEntries(data.catalog.map(product=>{
    const links=linksByProduct.get(product.id)||[];
    if(!links.length){
      return [product.id,{tone:'unlinked',label:'Sin vínculo · no descuenta stock',linked:false}];
    }
    const primaryLink=links[0];
    const stockRows=inventoryByVariant.get(primaryLink.inventory_variant_id)||[];
    const stock=stockRows[0]||null;
    if(links.length>1){
      return [product.id,{tone:'low',label:'Varias existencias vinculadas',locationCode:primaryLink.location_code||'',linked:true}];
    }
    if(!stock||stock.sourceStatus){
      return [product.id,{tone:'low',label:'Conteo físico pendiente',locationCode:primaryLink.location_code||'',linked:true}];
    }
    const available=Number(stock.availableQuantity ?? (Number(stock.quantity||0)-Number(stock.reservedQuantity||0)));
    const minStock=Number(stock.minStock||0);
    const unit=stock.unit||product.unit||'unidades';
    if(available<=0){
      return [product.id,{tone:'shortage',label:`Agotado (0 ${unit}) · Compra urgente`,availableQuantity:0,unit,locationCode:primaryLink.location_code||'',linked:true}];
    }
    if(minStock>0&&available<=minStock){
      return [product.id,{tone:'low',label:`Stock bajo: ${available} ${unit}`,availableQuantity:available,unit,locationCode:primaryLink.location_code||'',linked:true}];
    }
    return [product.id,{tone:'available',label:`En stock: ${available} ${unit}`,availableQuantity:available,unit,locationCode:primaryLink.location_code||'',linked:true}];
  })),[data.catalog,linksByProduct,inventoryByVariant]);
  const acceptedQuotes=useMemo(()=>centralQuotes.filter((quote)=>quote.status==='accepted'&&quote.price_confirmed&&quote.selected_total!==null),[centralQuotes]);
  const filteredRecentSales=useMemo(()=>{
    const q=recentSalesQuery.trim().toLocaleLowerCase('es');
    return salesToday.filter((sale:any)=>{
      if(recentSalesFilter==='balance'&&!(Number(sale.balance)>0))return false;
      if(recentSalesFilter==='paid'&&Number(sale.balance)>0)return false;
      if(!q)return true;
      return `${sale.customer||''} ${sale.description||''} ${sale.code||''} ${sale.method||''}`.toLocaleLowerCase('es').includes(q);
    });
  },[salesToday,recentSalesQuery,recentSalesFilter]);
  const needsCashShift=chargeNow&&payments.some(payment=>payment.method==='Efectivo');
  const cashShiftPending=needsCashShift&&!pendingSaleRecoveryMode&&cashierSession.loading;
  const cashShiftUnavailable=needsCashShift&&!pendingSaleRecoveryMode&&!cashierSession.loading&&!cashierSession.session;
  const missingCartAccessoryLink=cart.some(line=>trackedAccessoryProductIds.has(line.productId)&&!catalogLinks.some(link=>link.active&&link.branch_id===selectedBranchId&&link.catalog_product_id===line.productId));
  const canSubmitSale=Boolean(supabase&&user&&organizationId&&selectedBranchId&&catalogLinkStatus==='ready'&&workflowRouteStatus==='ready'&&(form.quoteId||taxConfigurationStatus==='ready')&&(!saleMaterialLines.some((line)=>line.catalog_product_id)||materialRecipesStatus==='ready')&&!missingCartAccessoryLink&&!backorderPermissionMissing&&!pendingSaleRecoveryError&&!pendingOperationChanged&&!duplicateCustomer&&!customerLookupPending&&!customerLookupFailed&&!customerNameMissing&&discountReasonValid&&activeTotal>0&&(form.quoteId||cart.length>0)&&!savingSale&&!cashShiftPending&&!cashShiftUnavailable);
  const submitBlockReason=pendingSaleRecoveryError||(pendingOperationChanged?'Los datos de la operación o de la cotización cambiaron mientras la venta estaba pendiente. Recarga para restaurar la versión original antes de reintentar.':savingSale?'Guardando la venta…':!discountReasonValid?'Escribe el motivo del descuento (mínimo 3 y máximo 300 caracteres).':!form.quoteId&&taxConfigurationStatus==='loading'?'Consultando la tasa de IVA de la organización…':!form.quoteId&&taxConfigurationStatus==='error'?'No se pudo verificar la tasa de IVA. Recarga antes de confirmar la venta.':!selectedBranchId?'Cargando la sucursal seleccionada…':catalogLinkStatus==='checking'?'Comprobando los vínculos de inventario…':catalogLinkStatus==='error'?'No se pudieron consultar los vínculos de inventario. Recarga antes de confirmar.':saleMaterialLines.some((line)=>line.catalog_product_id)&&materialRecipesStatus!=='ready'?(materialRecipesStatus==='checking'?'Comprobando las recetas de materiales de esta sucursal…':'No se pudieron verificar las recetas. Vuelve a Detalles del trabajo y reintenta la consulta.'):missingCartAccessoryLink?'Vincula los ojales con su variante de inventario antes de confirmar esta venta.':backorderPermissionMissing?'Hay artículos sin conteo o con existencias insuficientes. Se requiere permiso de edición de compras para confirmar una compra urgente.':duplicateCustomer?`Ya existe ${duplicateCustomer.name} con ese teléfono, correo o identificación. Selecciónalo para evitar crear un duplicado.`:customerLookupFailed?'No se pudo verificar si el cliente ya existe. Reintenta la búsqueda antes de confirmar.':customerLookupPending?'Buscando coincidencias del cliente…':customerNameMissing?'Completa el nombre del cliente o limpia la búsqueda si será una venta de mostrador.':cashShiftPending?'Verificando el turno de caja…':cashShiftUnavailable?'Abre un turno de caja para registrar pagos en efectivo.':!form.quoteId&&!cart.length?'Agrega al menos un artículo al carrito para habilitar la venta.':activeTotal<=0?'La orden necesita un total mayor que cero.':!supabase||!user||!organizationId?'No se pudo validar la sesión para guardar la venta.':'');
  const cartQuantityNumber=Number(cartQuantity);
  const cartWidthNumber=Number(cartWidthCm);
  const cartHeightNumber=Number(cartHeightCm);
  const cartAreaPerPiece=cartMode==='area'&&cartWidthNumber>0&&cartHeightNumber>0?Math.round((cartWidthNumber*cartHeightNumber/10000)*10000)/10000:0;
  const cartPricingBasis=selectedCartProduct?getQuoteBasis(selectedCartProduct,{quantity:cartQuantityNumber,area:cartAreaPerPiece}):0;
  const customAgreedPriceNumber = Number(cartCustomUnitPrice);
  const hasCustomAgreedPrice = Number.isFinite(customAgreedPriceNumber) && customAgreedPriceNumber > 0;
  const cartCalculation=selectedCartProduct?calculatePOSLine({product:selectedCartProduct,mode:cartMode,quantity:cartQuantityNumber,widthCm:cartWidthNumber,heightCm:cartHeightNumber,tier:cartPriceTier,optionChoice:cartOptionChoice,customUnitPrice:hasCustomAgreedPrice?customAgreedPriceNumber:undefined}):null;
  const cartPriceAvailable=Boolean(hasCustomAgreedPrice ? cartCalculation : (selectedCartProduct?.confirmed||selectedCartProduct?.published===true)&&cartCalculation);
  const measurementStockLink=selectedCartProduct&&catalogLinks.find(link=>link.active&&link.branch_id===selectedBranchId&&link.catalog_product_id===selectedCartProduct.id);
  const measurementStock=measurementStockLink&&data.inventory.find(row=>row.variantId===measurementStockLink.inventory_variant_id&&row.branchId===measurementStockLink.branch_id);
  const measurementStockUnit=String(measurementStock?.unit||'').trim().toLocaleLowerCase('es');
  const measurementStockUnitIsArea=/^(m²|m2|m\^2|metro cuadrado|metros cuadrados)$/.test(measurementStockUnit);
  const invalidMeasurementStockLink=cartMode==='area'&&Boolean(measurementStockLink)&&!measurementStockUnitIsArea;
  const selectedCatalogLink=selectedCartProduct&&catalogLinks.find(link=>link.active&&link.branch_id===selectedBranchId&&link.catalog_product_id===selectedCartProduct.id);
  const selectedLinkedStock=selectedCatalogLink&&data.inventory.find(row=>row.variantId===selectedCatalogLink.inventory_variant_id&&row.branchId===selectedCatalogLink.branch_id);
  const selectedAvailableStock=selectedLinkedStock?Number(selectedLinkedStock.availableQuantity??(Number(selectedLinkedStock.quantity||0)-Number(selectedLinkedStock.reservedQuantity||0))):0;
  const cartInventoryStatus=(line)=>{
    if(catalogLinkStatus==='checking')return 'Comprobando vínculo de inventario…';
    if(catalogLinkStatus==='error')return 'No se pudo verificar el vínculo; confirma después de recargar.';
    if(!line.productId)return 'Concepto libre: no controla existencias.';
    if(!selectedBranchId)return 'Verificando sucursal e inventario…';
    const link=catalogLinks.find(item=>item.active&&item.branch_id===selectedBranchId&&item.catalog_product_id===line.productId);
    if(!link)return trackedAccessoryProductIds.has(line.productId)?'Ojales sin vínculo en esta sucursal; no se puede confirmar la venta.':'Sin vínculo de inventario: esta línea no descontará stock.';
    const stock=data.inventory.find(item=>item.variantId===link.inventory_variant_id&&item.branchId===link.branch_id);
    if(!stock||stock.sourceStatus)return 'Conteo físico pendiente; al confirmar, el sistema registrará el faltante como compra urgente.';
    const available=Number(stock.availableQuantity??(Number(stock.quantity||0)-Number(stock.reservedQuantity||0)));
    const required=Number(line.billingQuantity)||Number(line.quantity)||0;
    return available<required?`Faltan ${Math.max(0,required-available)} ${stock.unit||'unidades'}; el faltante quedará como compra urgente.`:`Se descontarán ${required} ${stock.unit||'unidades'} al confirmar.`;
  };
  const cartInventoryTone=(line): 'available'|'warning'|'neutral' => {
    if(!line.productId||catalogLinkStatus!=='ready'||!selectedBranchId)return 'neutral';
    const link=catalogLinks.find(item=>item.active&&item.branch_id===selectedBranchId&&item.catalog_product_id===line.productId);
    if(!link)return trackedAccessoryProductIds.has(line.productId)?'warning':'neutral';
    const stock=data.inventory.find(item=>item.variantId===link.inventory_variant_id&&item.branchId===link.branch_id);
    if(!stock||stock.sourceStatus)return 'warning';
    const available=Number(stock.availableQuantity??(Number(stock.quantity||0)-Number(stock.reservedQuantity||0)));
    const required=Number(line.billingQuantity)||Number(line.quantity)||0;
    return available<required?'warning':'available';
  };
  const quickAddProductToCart=(product:any)=>{
    if(!product||product.mode==='area')return;
    const calc=calculatePOSLine({product,mode:'quantity',quantity:1,tier:'pvp',optionChoice:''});
    if(!calc||!(product.confirmed||product.published)){chooseCartProduct(product);return;}
    const existing=cart.find((item:any)=>item.productId===product.id&&item.mode==='quantity'&&(item.pricingTier||'pvp')==='pvp'&&!item.optionChoice);
    if(existing){
      const nextQty=Number(existing.quantity||1)+1;
      const nextCalc=calculatePOSLine({product,mode:'quantity',quantity:nextQty,tier:'pvp',optionChoice:''});
      if(nextCalc){
        setCart((current)=>current.map((item:any)=>item.key===existing.key?{
          ...item,
          quantity:nextQty,
          billingQuantity:nextCalc.billedQuantity,
          unitPrice:nextCalc.unitPrice,
          total:nextCalc.total,
          description:formatPOSLineDescription({name:item.name,mode:'quantity',quantity:nextQty,unit:nextCalc.unit,unitPrice:nextCalc.unitPrice,pricingTierLabel:item.pricingTierLabel||'Normal'}),
        }:item));
        flash(`${product.name} actualizado a ${nextQty} ${nextCalc.unit} en el carrito.`);
        return;
      }
    }
    const line={
      key:globalThis.crypto?.randomUUID?.()||`line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      productId:product.id,sku:product.sku||product.id,name:product.name,family:product.family||'General',image:product.image||'',
      mode:'quantity',quantity:1,billingQuantity:calc.billedQuantity,unit:calc.unit,unitPrice:calc.unitPrice,total:calc.total,
      widthCm:null,heightCm:null,areaPerPiece:null,areaTotal:null,
      pricingTier:'pvp',pricingTierLabel:'Normal',optionChoice:'',
      description:formatPOSLineDescription({name:product.name,mode:'quantity',quantity:1,unit:calc.unit,unitPrice:calc.unitPrice,pricingTierLabel:'Normal'}),
    };
    setCart((current)=>[...current,line]);
    flash(`${product.name} agregado al carrito.`);
  };
  const duplicateCartLine=(line:any)=>{
    const copy={
      ...line,
      key:globalThis.crypto?.randomUUID?.()||`line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    setCart((current)=>[...current,copy]);
    flash(`Se duplicó “${line.name}” en el carrito. Puedes editar su medida o tarifa.`);
  };
  const chooseCartProduct=(product)=>{
    setCartMode(product.mode==='area'?'area':'quantity');setCartFamily(product.family||'Todas');setCartProductId(product.id);setCartItemName('');setCartUnitPrice('');setCartCustomUnitPrice('');setCartPriceTier('pvp');setCartOptionChoice('');setCartSearch('');
    requestAnimationFrame(()=>document.getElementById(product.mode==='area'?'pos-cart-width':'pos-cart-quantity')?.focus());
  };
  const handleCartScan=(query:string,highlightedProduct?:any)=>{
    const scannedCode=query.trim().toLocaleUpperCase('es');
    if(!scannedCode)return;
    const catalogProduct=data.catalog.find(product=>String(product.sku||'').trim().toLocaleUpperCase('es')===scannedCode);
    if(catalogProduct){chooseCartProduct(catalogProduct);flash(`Código ${scannedCode} reconocido: ${catalogProduct.name}. Revisa cantidad, medidas y tarifa.`);return;}
    const stock=data.inventory.find(row=>row.branchId===selectedBranchId&&!row.archived&&[row.sku,row.variantSku].some(code=>String(code||'').trim().toLocaleUpperCase('es')===scannedCode));
    if(!stock){if(highlightedProduct){chooseCartProduct(highlightedProduct);return;}flash(`No encontramos el código ${scannedCode} en el catálogo ni en el inventario de ${branchName}.`);return;}
    const link=catalogLinks.find(item=>item.active&&item.branch_id===stock.branchId&&item.inventory_variant_id===stock.variantId);
    const product=link&&data.catalog.find(item=>item.id===link.catalog_product_id);
    if(!product){flash(`El SKU ${scannedCode} existe, pero todavía no está vinculado a un producto vendible.`);return;}
    chooseCartProduct(product);
    flash(`Artículo reconocido: ${product.name}. Revisa cantidad, medidas y tarifa del catálogo.`);
  };
  const focusCheckoutField=(selector:string)=>requestAnimationFrame(()=>document.querySelector<HTMLInputElement>(selector)?.focus());
  const validateWorkDetails=()=>{
    if(fulfillment.installationRequired&&!fulfillment.installationAddress.trim()){
      setCheckoutStep('details');focusCheckoutField('.pos-fulfillment-fields input[placeholder="Dirección o referencia"]');flash('Indica la dirección de instalación antes de cobrar.');return false;
    }
    if(Boolean(fulfillment.latitude)!==Boolean(fulfillment.longitude)||fulfillment.latitude&&(!Number.isFinite(Number(fulfillment.latitude))||Math.abs(Number(fulfillment.latitude))>90)||fulfillment.longitude&&(!Number.isFinite(Number(fulfillment.longitude))||Math.abs(Number(fulfillment.longitude))>180)){
      setCheckoutStep('details');focusCheckoutField('.pos-fulfillment-fields .pos-cart-inputs input');flash('Revisa las coordenadas de instalación.');return false;
    }
    if(mapLink&&!normalizeGoogleMapsUrl(mapLink)){
      setCheckoutStep('details');setShowLocationPicker(true);focusCheckoutField('.pos-map-dialog input[inputmode="url"]');flash('Revisa el enlace de Google Maps.');return false;
    }
    const missingMaterial=saleMaterialLines.some((line)=>materialRecipes.some((recipe)=>recipe.active&&recipe.branch_id===selectedBranchId&&recipe.catalog_product_id===line.catalog_product_id&&recipe.calculation_mode==='explicit_quantity'&&(()=>{const quantity=Number((materialRequestsByLine[line.line_key]||[]).find((request)=>request.recipeId===recipe.id)?.quantity);return !Number.isFinite(quantity)||quantity<=0||quantity>1000000;})()));
    if(missingMaterial){setCheckoutStep('details');focusCheckoutField('.pos-material-usage-input input');flash('Completa el consumo de materiales variables antes de cobrar.');return false;}
    return true;
  };
  const continueToPayment=()=>{
    if(!form.quoteId&&!cart.length){setCheckoutStep('order');focusCheckoutField('#pos-product-search-input');flash('Agrega un artículo o carga una cotización.');return;}
    if(activeTotal<=0){setCheckoutStep('order');flash('La orden necesita un total mayor que cero.');return;}
    if(!discountReasonValid){setCheckoutStep('order');focusCheckoutField('#pos-discount-reason');flash('Escribe el motivo del descuento comercial para continuar.');return;}
    if(customerNameMissing){setCheckoutStep('order');focusCheckoutField('.pos-customer-picker input[role="combobox"]');flash('Completa el nombre del cliente o limpia la búsqueda para una venta de mostrador.');return;}
    if(saleMaterialLines.some((line)=>line.catalog_product_id)&&materialRecipesStatus!=='ready'){setCheckoutStep('details');flash(materialRecipesStatus==='checking'?'Espera a que se comprueben las recetas de materiales.':'Reintenta la consulta de recetas antes de cobrar.');return;}
    if(!validateWorkDetails())return;
    setShowLocationPicker(false);
    setCheckoutStep('payment');setMobileSummaryOpen(true);
  };
  const advanceFromOrder=()=>{
    if(!form.quoteId&&!cart.length){focusCheckoutField('#pos-product-search-input');flash('Agrega un artículo o carga una cotización.');return;}
    if(activeTotal<=0){flash('La orden necesita un total mayor que cero.');return;}
    if(!discountReasonValid){focusCheckoutField('#pos-discount-reason');flash('Escribe el motivo del descuento comercial para continuar.');return;}
    if(customerNameMissing){focusCheckoutField('.pos-customer-picker input[role="combobox"]');flash('Completa el nombre del cliente o limpia la búsqueda para una venta de mostrador.');return;}
    if(requiresWorkDetails){setCheckoutStep('details');setMobileSummaryOpen(false);return;}
    continueToPayment();
  };
  const chooseCheckoutStep=(step:POSCheckoutStep)=>{
    if(step==='payment'){if(checkoutStep==='order'){advanceFromOrder();return;}continueToPayment();return;}
    setShowLocationPicker(false);setCheckoutStep(step);setMobileSummaryOpen(false);
  };
  const updateCustomerQuery=(value)=>{const trimmed=value.trim();const identityOnly=/^[\d\s+().-]+$/.test(trimmed)||trimmed.includes('@');setSelectedCustomerSnapshot(null);setCustomerSearchLimit(8);setCustomerQuery(value);setForm((current)=>({...current,customerId:'',customer:identityOnly?'':value,customerPhone:'',customerEmail:'',customerDocumentReference:''}));};
  const choosePOSCustomer=(customer)=>{setSelectedCustomerSnapshot(customer||null);setForm((current)=>({...current,customerId:customer?.id||'',customer:customer?.name||'',customerPhone:customer?.phone||'',customerEmail:customer?.email||'',customerDocumentReference:customer?.documentReference||''}));setCustomerQuery(customer?.name||'');};
  const parkCurrentOrder=async()=>{
    if(!user||!organizationId||parking)return;
    if(!form.quoteId&&taxConfigurationStatus!=='ready'){flash(taxConfigurationStatus==='loading'?'Espera a que se confirme la tasa de IVA antes de guardar el total.':'No se pudo verificar la tasa de IVA. Recarga antes de guardar la orden.');return;}
    if(activeParkedOrderId){flash('Esta orden ya está en espera; confírmala para cerrarla desde esta pantalla.');return;}
    if(!form.quoteId&&!cart.length){flash('Agrega artículos o elige una cotización antes de guardar en espera.');return;}
    if(!activeTotal||activeTotal<=0){flash('La orden necesita un total mayor que cero para guardarse en espera.');return;}
    setParking(true);
    try{
      const key=globalThis.crypto?.randomUUID?.()||`park-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload={form:{...form},cart,discountPercent:manualDiscountPercent,discountReason,materialRequestsByLine,productionByLine,fulfillment,mapLink,payments,chargeNow,clientBriefHtml};
      const {data:branch,error:branchError}=await supabase.from('branches').select('id').eq('organization_id',organizationId).eq('code',form.branchCode).maybeSingle();
      if(branchError)throw branchError;
      if(!branch?.id)throw new Error('No encontramos la sucursal seleccionada.');
      const {data:parkedId,error}=await supabase.rpc('park_pos_order',{p_organization_id:organizationId,p_branch_code:form.branchCode,p_idempotency_key:key,p_payload:payload,p_total:activeTotal});
      if(error)throw error;
      await refreshParkedOrders();
      resetCheckout();
      flash(`Orden guardada en espera · ${String(parkedId).slice(0,8).toUpperCase()}. No se reservó ni descontó inventario.`);
    }catch(error){flash(`No se pudo guardar la orden en espera: ${error.message}`);}
    finally{setParking(false);}
  };
  const resumeParkedOrder=async(order)=>{
    const payload=order.payload||{};
    if(!payload.form){flash('Esta orden guardada tiene un formato que no se puede recuperar desde esta pantalla.');return;}
    if(pendingSaleKey.current&&pendingSaleKey.current!==order.idempotency_key){flash('Primero completa o revisa la operación de venta pendiente antes de recuperar otra orden.');return;}
    if(cart.length||form.quoteId||customerQuery.trim()||form.customer.trim()||form.description.trim()){const accepted=await confirmDialog({eyebrow:'RECUPERAR ORDEN EN ESPERA',title:'¿Reemplazar el pedido actual?',description:'Al recuperar esta orden, los datos que tienes abiertos en el POS serán sustituidos por la orden guardada.',tone:'warning',confirmLabel:'Recuperar orden',cancelLabel:'Seguir con el pedido actual',summaryItems:[{label:'Cliente',value:payload.form.customer||'Sin cliente'},{label:'Sucursal',value:branchNames[order.branch_id]||'Sucursal'},{label:'Total guardado',value:formatMoney(order.total)}],consequences:['La orden guardada no reservó ni descontó existencias.','Puedes revisar los artículos y datos antes de confirmar la venta.']});if(!accepted)return;}
    const savedForm={...payload.form,branchCode:String(payload.form.branchCode||form.branchCode)};
    const restoredFulfillment=payload.fulfillment||{installationRequired:false,installationAddress:'',latitude:'',longitude:'',installationAt:'',deliveryAt:''};
    const restoredMapLink=String(payload.mapLink||'');
    const restoredCart=sanitizePOSCart(payload.cart).map((line,index)=>({...line,key:line.key||`${line.productId||`custom-${line.name?.toLowerCase?.()||'articulo'}`}::${line.widthCm||''}x${line.heightCm||''}::${index}`}));
    const restoredPayments=sanitizePOSPayments(payload.payments);
    const restoredChargeNow=payload.chargeNow!==false;
    const restoredProductionByLine=sanitizeProductionDetails(payload.productionByLine);
    const restoredMaterialRequests=sanitizePOSMaterialRequestMap(payload.materialRequestsByLine);
    const restoredDiscountPercent=String(Math.min(40,Math.max(0,Math.round(Number(payload.discountPercent)||0))));
    const restoredDiscountReason=String(payload.discountReason||'').slice(0,300);
    const recoveredSnapshot={form:savedForm,cart:restoredCart,discountPercent:restoredDiscountPercent,discountReason:restoredDiscountReason,materialRequestsByLine:restoredMaterialRequests,productionByLine:restoredProductionByLine,fulfillment:restoredFulfillment,mapLink:restoredMapLink,payments:restoredPayments,chargeNow:restoredChargeNow,activeParkedOrderId:order.id};
    try{sessionStorage.setItem(pendingSaleStorageKey,order.idempotency_key);sessionStorage.setItem(pendingSaleSnapshotStorageKey,JSON.stringify({version:1,savedAt:Date.now(),...recoveredSnapshot}));}
    catch{if(!pendingSaleKey.current){sessionStorage.removeItem(pendingSaleStorageKey);sessionStorage.removeItem(pendingSaleSnapshotStorageKey);}flash('No se pudo guardar la recuperación de esta orden en esta sesión. No se envió la venta.');return;}
    setFulfillment(restoredFulfillment);setMapLink(restoredMapLink);setPayments(restoredPayments);setChargeNow(restoredChargeNow);setCustomerQuery(String(savedForm.customer||''));setSelectedCustomerSnapshot(savedForm.customerId?{id:String(savedForm.customerId),name:String(savedForm.customer||''),phone:String(savedForm.customerPhone||''),email:String(savedForm.customerEmail||''),documentReference:String(savedForm.customerDocumentReference||'')}:null);
    setForm(savedForm);setCart(restoredCart);setDiscountPercent(restoredDiscountPercent);setDiscountReason(restoredDiscountReason);setMaterialRequestsByLine(restoredMaterialRequests);setProductionByLine(restoredProductionByLine);
    setCartProductId('');setCartItemName('');setCartUnitPrice('');setCartQuantity('1');setActiveParkedOrderId(order.id);
    setCheckoutStep('order');
    pendingSaleKey.current=order.idempotency_key;pendingSaleSnapshotRef.current=recoveredSnapshot;setPendingSaleRecoveryMode(true);setPendingSaleRecoveryError('');
    flash('Orden recuperada. Revisa los datos y confirma la venta cuando esté lista.');
  };
  const handleQuoteSelection=async(nextQuoteId:string,select:HTMLSelectElement)=>{
    if(nextQuoteId&&(cart.length||form.quoteId)){const accepted=await confirmDialog({eyebrow:'ORIGEN DE LA VENTA',title:'¿Cargar esta cotización aprobada?',description:'Los artículos o la cotización que ya tienes en el POS serán reemplazados por el contenido de la cotización elegida.',tone:'warning',confirmLabel:'Cargar cotización',cancelLabel:'Conservar pedido actual',consequences:['Se conserva la cotización aprobada y su total confirmado.','Puedes revisar los datos antes de registrar la venta.']});if(!accepted){select.value=form.quoteId;return;}}
    const quote=centralQuotes.find((item)=>item.id===nextQuoteId);
    const knownCustomer=(data.customers||[]).find((customer)=>quote?.customer_id&&customer.id===quote.customer_id)||(data.customers||[]).find((customer)=>quote?.customer_phone&&customer.phone===quote.customer_phone)||(data.customers||[]).find((customer)=>quote?.customer_name&&customer.name.trim().toLocaleLowerCase('es')===quote.customer_name.trim().toLocaleLowerCase('es'));
    setSelectedCustomerSnapshot(knownCustomer||null);
    setForm({...form,quoteId:nextQuoteId,total:quote?.selected_total??'',amountPaid:quote?.selected_total??'',customerId:quote?.customer_id||knownCustomer?.id||'',customer:knownCustomer?.name||quote?.customer_name||'',customerPhone:knownCustomer?.phone||quote?.customer_phone||'',customerEmail:knownCustomer?.email||'',customerDocumentReference:knownCustomer?.documentReference||'',description:Array.isArray(quote?.items)?quote.items.map(item=>item.name||item.product_name).join(', '):''});
    if(nextQuoteId){setDiscountPercent('0');setDiscountReason('');}
    setCustomerQuery(knownCustomer?.name||quote?.customer_name||'');setClientBriefHtml(quote?.client_brief_html||'<p></p>');if(nextQuoteId)setCart([]);
  };
  const addCartLine=()=>{
    const quantity=cartQuantityNumber;
    if(!Number.isSafeInteger(quantity)||quantity<1){flash('La cantidad debe ser un número entero mayor que cero.');return;}
    if(selectedCartProduct){
      if(!cartPriceAvailable){flash('Este producto no tiene tarifa disponible para esta cantidad o medida. Ingresa un precio acordado o completa el catálogo.');return;}
      if(cartMode==='area'&&(!Number.isFinite(cartWidthNumber)||!Number.isFinite(cartHeightNumber)||cartWidthNumber<=0||cartHeightNumber<=0)){flash('Ingresa el ancho y el alto en centímetros para calcular la superficie.');return;}
      if(invalidMeasurementStockLink){flash(`El producto por medidas está vinculado a inventario en “${measurementStockUnit||'unidad no identificada'}”. Cambia ese vínculo a una existencia medida en m² antes de venderlo.`);return;}
      const pricingTierLabel={pvp:'Normal',instalacion:'Con instalación',corporativo:'Corporativo'}[cartPriceTier]||'Normal';
      const line={
        key:globalThis.crypto?.randomUUID?.()||`line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        productId:selectedCartProduct.id,sku:selectedCartProduct.sku||selectedCartProduct.id,name:selectedCartProduct.name,family:selectedCartProduct.family||'General',image:selectedCartProduct.image||'',
        mode:cartMode,quantity,billingQuantity:cartCalculation.billedQuantity,unit:cartCalculation.unit,unitPrice:cartCalculation.unitPrice,total:cartCalculation.total,
        widthCm:cartMode==='area'?cartWidthNumber:null,heightCm:cartMode==='area'?cartHeightNumber:null,areaPerPiece:cartCalculation.areaPerPiece||null,areaTotal:cartCalculation.areaTotal||null,
        pricingTier:cartPriceTier,pricingTierLabel,optionChoice:cartOptionChoice||'',customUnitPriceApplied:Boolean(hasCustomAgreedPrice),description:formatPOSLineDescription({name:selectedCartProduct.name,mode:cartMode,quantity,unit:cartCalculation.unit,unitPrice:cartCalculation.unitPrice,pricingTierLabel,widthCm:cartMode==='area'?cartWidthNumber:undefined,heightCm:cartMode==='area'?cartHeightNumber:undefined,areaPerPiece:cartCalculation.areaPerPiece||undefined,areaTotal:cartCalculation.areaTotal||undefined,optionChoice:cartOptionChoice||undefined,customUnitPriceApplied:Boolean(hasCustomAgreedPrice)}),
      };
      setCart(current=>[...current,line]);
      setCartProductId('');setCartQuantity('1');setCartWidthCm('100');setCartHeightCm('100');setCartPriceTier('pvp');setCartOptionChoice('');setCartUnitPrice('');setCartCustomUnitPrice('');
      requestAnimationFrame(()=>document.getElementById('pos-product-search-input')?.focus());
      return;
    }
    if(cartMode==='area'){
      if(!cartItemName.trim()){flash('Escribe el concepto libre por m².');return;}
      if(!Number.isFinite(cartWidthNumber)||!Number.isFinite(cartHeightNumber)||cartWidthNumber<=0||cartHeightNumber<=0){flash('Ingresa el ancho y alto en centímetros para calcular los m².');return;}
      const unitPrice=Number(cartUnitPrice);
      if(!Number.isFinite(unitPrice)||unitPrice<=0){flash('Ingresa el precio acordado por m² para el concepto libre.');return;}
      const name=cartItemName.trim();
      const areaPerPiece=Math.round((cartWidthNumber*cartHeightNumber/10000)*10000)/10000;
      const billedArea=Math.round((areaPerPiece*quantity)*10000)/10000;
      const total=roundMoney(billedArea*unitPrice);
      const line={
        key:globalThis.crypto?.randomUUID?.()||`line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        productId:'',sku:'LIBRE-M2',name,family:'Concepto libre por m²',image:'',mode:'area',
        quantity,billingQuantity:billedArea,unit:'m²',unitPrice,total,
        widthCm:cartWidthNumber,heightCm:cartHeightNumber,areaPerPiece,areaTotal:billedArea,
        pricingTier:'pvp',pricingTierLabel:'Precio acordado',optionChoice:'',customUnitPriceApplied:true,
        description:`${name} · ${cartWidthNumber} × ${cartHeightNumber} cm · ${quantity} ${quantity===1?'pieza':'piezas'} · ${billedArea} m² · $${unitPrice.toFixed(2)}/m²`,
      };
      setCart(current=>[...current,line]);
      setCartItemName('');setCartQuantity('1');setCartWidthCm('100');setCartHeightCm('100');setCartUnitPrice('');setCartCustomUnitPrice('');
      requestAnimationFrame(()=>document.getElementById('pos-product-search-input')?.focus());
      return;
    }
    const unitPrice=Number(cartUnitPrice);
    if(!cartItemName.trim()){flash('Elige un producto o escribe un concepto de venta.');return;}
    if(!Number.isFinite(unitPrice)||unitPrice<=0){flash('Ingresa el precio acordado para el concepto libre.');return;}
    const name=cartItemName.trim();
    const line={key:globalThis.crypto?.randomUUID?.()||`line-${Date.now()}-${Math.random().toString(36).slice(2)}`,productId:'',sku:'LIBRE',name,family:'Concepto libre',image:'',mode:'quantity',quantity,billingQuantity:quantity,unit:'unidad',unitPrice,total:Math.round(quantity*unitPrice*100)/100,customUnitPriceApplied:true,description:`${name} · ${quantity} unidades · $${unitPrice.toFixed(2)} c/u`};
    setCart(current=>[...current,line]);
    setCartItemName('');setCartQuantity('1');setCartUnitPrice('');setCartCustomUnitPrice('');
    requestAnimationFrame(()=>document.getElementById('pos-product-search-input')?.focus());
  };
  const save=async(event)=>{
    event.preventDefault();
    if(checkoutStep==='order'){advanceFromOrder();return;}
    if(checkoutStep==='details'){continueToPayment();return;}
    if(!validateWorkDetails())return;
    if(savingSale)return;
    if(pendingOperationChanged){flash('La operación pendiente cambió. Recarga para restaurar sus datos originales antes de reintentar.');return;}
    if(!canSubmitSale)return;
    const quote=centralQuotes.find(q=>q.id===form.quoteId);
    const total=activeTotal;
    if(!total||total<=0||!user||!organizationId)return;
    if(fulfillment.installationRequired&&!fulfillment.installationAddress.trim()){flash('Agrega la dirección de instalación antes de confirmar.');return;}
    if(Boolean(fulfillment.latitude)!==Boolean(fulfillment.longitude)){flash('Completa ambas coordenadas del pin o deja los dos campos vacíos.');return;}
    if(fulfillment.latitude&&(!Number.isFinite(Number(fulfillment.latitude))||Math.abs(Number(fulfillment.latitude))>90)||fulfillment.longitude&&(!Number.isFinite(Number(fulfillment.longitude))||Math.abs(Number(fulfillment.longitude))>180)){flash('Revisa las coordenadas del pin; latitud y longitud están fuera de rango.');return;}
    const normalizedMapLink=mapLink?normalizeGoogleMapsUrl(mapLink):'';
    if(mapLink&&!normalizedMapLink){flash('Pega un enlace válido de Google Maps; puedes omitir https://.');return;}
    if(!form.quoteId&&!cart.length){flash('Agrega al menos un artículo antes de confirmar la orden.');return;}
    if(chargeNow&&payments.some(payment=>payment.amount!==''&&(!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0))){flash('Cada monto ingresado debe ser un valor mayor que cero.');return;}
    const paymentState=calculatePOSPaymentBreakdown(total,payments);
    const salePayments=chargeNow?paymentState.payments:[];
    if(chargeNow&&!salePayments.length){flash('Ingresa al menos un pago o marca que la orden queda pendiente de cobro.');return;}
    if(chargeNow&&paymentState.nonCashOverpayment>0){flash('Los pagos que no son en efectivo superan el total. Ajusta los importes; el vuelto solo se calcula para efectivo.');return;}
    if(chargeNow&&paymentState.cashWithoutBalance){flash('Tarjeta o transferencia ya cubren el total. Quita el efectivo adicional para no registrar un cobro innecesario.');return;}
    const currentQuoteLines=getPOSQuoteSaleLines(quote);
    const recoveredSaleLines=pendingSaleRecoveryMode&&pendingSaleKey.current&&Array.isArray(pendingSaleSnapshotRef.current?.saleLines)&&pendingSaleSnapshotRef.current.saleLines.length?sanitizePOSSaleLines(pendingSaleSnapshotRef.current.saleLines):null;
    const quoteLines=recoveredSaleLines||currentQuoteLines;
    if(form.quoteId&&(!quoteLines.length||quoteLines.some(line=>!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isFinite(line.unit_price)||line.unit_price<0))){flash('La cotización no tiene conceptos completos para crear la venta. Corrige sus artículos antes de cobrar.');return;}
    if(quoteLines.some(line=>line.catalog_product_id&&trackedAccessoryProductIds.has(line.catalog_product_id)&&!catalogLinks.some(link=>link.active&&link.branch_id===selectedBranchId&&link.catalog_product_id===line.catalog_product_id))){flash('La cotización incluye ojales sin vínculo de inventario en esta sucursal. Corrige el vínculo antes de confirmar para no registrar una venta sin descuento de stock.');return;}
    const quoteLinesTotal=roundMoney(quoteLines.reduce((sum,line)=>sum+line.quantity*line.unit_price,0));
    const quoteExpectedSubtotal=quoteHasFinancial?Number(quoteFinancial.subtotal)||0:total;
    if(form.quoteId&&quoteLinesTotal!==roundMoney(quoteExpectedSubtotal)){flash(`El subtotal de los conceptos de la cotización (${formatMoney(quoteLinesTotal)}) no coincide con su desglose (${formatMoney(quoteExpectedSubtotal)}). No se registró la venta.`);return;}
    const saleProductLines=saleMaterialLines.filter((line)=>line.catalog_product_id);
    if(saleProductLines.length&&materialRecipesStatus!=='ready'){flash('No se pueden verificar las recetas de materiales de esta sucursal. Reintenta la consulta antes de confirmar la venta.');return;}
    const missingMaterialUsage=saleMaterialLines.flatMap((line)=>materialRecipes.filter((recipe)=>recipe.active&&recipe.branch_id===selectedBranchId&&recipe.catalog_product_id===line.catalog_product_id&&recipe.calculation_mode==='explicit_quantity').filter((recipe)=>{const entry=(materialRequestsByLine[line.line_key]||[]).find((request)=>request.recipeId===recipe.id);const quantity=Number(entry?.quantity);return !Number.isFinite(quantity)||quantity<=0||quantity>1000000;}).map((recipe)=>({line,recipe})));
    if(missingMaterialUsage.length){flash(`Ingresa la cantidad total usada de cada acabado variable antes de confirmar (${missingMaterialUsage.length} pendiente${missingMaterialUsage.length===1?'':'s'}).`);return;}
    const requestsForLine=(line)=>({ ...line,material_requests:(materialRequestsByLine[line.line_key]||[]).filter((request)=>materialRecipes.some((recipe)=>recipe.id===request.recipeId&&recipe.active&&recipe.branch_id===selectedBranchId&&recipe.catalog_product_id===line.catalog_product_id&&recipe.calculation_mode==='explicit_quantity')).map((request)=>({recipe_id:request.recipeId,quantity:Number(request.quantity)})) });
    const lines=form.quoteId?sanitizePOSSaleLines(quoteLines).map(line=>({ ...requestsForLine(line),sku:data.catalog.find(product=>product.id===line.catalog_product_id)?.sku||line.sku||line.catalog_product_id||'' })):cart.map(line=>requestsForLine({line_key:line.key,catalog_product_id:line.productId||null,sku:line.sku||line.productId||'',description:line.description||line.name,quantity:Number(line.billingQuantity)||line.quantity,unit_price:line.unitPrice}));
    const saleNote=pendingSaleRecoveryMode&&pendingSaleKey.current&&typeof pendingSaleSnapshotRef.current?.saleNote==='string'?pendingSaleSnapshotRef.current.saleNote:[form.description,quote?`Cotización ${quote.quote_code}`:cart.map(line=>`${line.name} × ${line.quantity}`).join(' · ')].filter(Boolean).join(' · ');
    const discountAuditNote=!form.quoteId&&manualDiscountAmount>0?`Descuento comercial (${manualDiscountPercent}%): ${discountReason.trim()}`:'';
    const quoteDiscountAuditNote=form.quoteId&&quoteDiscount>0?`Descuento comercial (${Math.round(Number(quoteFinancial?.discount_percent)||0)}%): ${String(quoteFinancial?.discount_reason||'Descuento aprobado en cotización').trim()}`:'';
    const saleNoteWithDiscount=[discountAuditNote,quoteDiscountAuditNote,saleNote].filter(Boolean).join('\n');
    const shortages=findPOSStockShortages(lines,catalogLinks,selectedBranchId,data.inventory);
    if(shortages.length&&!canManageBackorders&&!hasPendingBackorderAuthorization){flash('Hay productos sin conteo o con existencias insuficientes. Se requiere permiso de edición de compras para confirmar una compra urgente.');return;}
    if(shortages.length){const accepted=await confirmDialog({eyebrow:'VENTA CON FALTANTE DE INVENTARIO',title:'¿Confirmar la orden como compra urgente?',description:`${shortages.length} artículo(s) tienen conteo pendiente o existencias insuficientes en esta sucursal.`,tone:'warning',confirmLabel:'Confirmar y solicitar compra',cancelLabel:'Volver a revisar',summaryItems:[{label:'Artículos con faltante',value:String(shortages.length)}],consequences:['La venta continuará y el faltante quedará señalado para compra urgente.','No se inventará una disponibilidad: el registro conservará el detalle del faltante.']});if(!accepted)return;}
    const hadPendingSaleKey=Boolean(pendingSaleKey.current);
    let saleRequestStarted=false;
    let quoteAlreadyLinked=false;
    setSavingSale(true);
    try{
      if(form.quoteId&&quote?.status==='converted'&&pendingSaleRecoveryMode&&pendingSaleKey.current){const {data:existingSale,error:existingSaleError}=await supabase.from('sales').select('id,central_quote_id').eq('organization_id',organizationId).eq('idempotency_key',pendingSaleKey.current).maybeSingle();if(existingSaleError){flash(`No pude comprobar si la cotización ya quedó vinculada: ${existingSaleError.message}. La operación permanece protegida.`);return;}quoteAlreadyLinked=Boolean(existingSale?.central_quote_id===form.quoteId);}
      if(form.quoteId&&(!quote||(!quoteAlreadyLinked&&quote.status!=='accepted')||!quote.price_confirmed||Math.round(Number(quote.selected_total)*100)!==Math.round(total*100))){flash('La cotización debe seguir aceptada y el total debe coincidir exactamente antes de confirmar.');return;}
      let quoteLinkError='';
      if(salePayments.some(payment=>payment.method==='cash')&&!(pendingSaleRecoveryMode&&pendingSaleKey.current)){const {data:branch}=await supabase.from('branches').select('id').eq('organization_id',organizationId).eq('code',form.branchCode).maybeSingle();const {data:shift,error:shiftError}=await supabase.from('cash_sessions').select('id').eq('organization_id',organizationId).eq('branch_id',branch?.id||'').eq('opened_by',user.id).eq('status','open').maybeSingle();if(shiftError)throw shiftError;if(!shift){flash('Abre primero tu turno de caja en Caja y producción para registrar cualquier parte en efectivo.');return;}}
      if(!pendingSaleKey.current){pendingSaleKey.current=globalThis.crypto?.randomUUID?.()||`sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(pendingSaleStorageKey,pendingSaleKey.current);}
      const productionJobs=Array.isArray(pendingSaleSnapshotRef.current?.productionJobs)?pendingSaleSnapshotRef.current.productionJobs:lines.map((line,index)=>{
        const displayLine=productionLines[index]||{line_key:line.line_key,name:line.description,productId:line.catalog_product_id};
        const defaultRoute=line.catalog_product_id?productWorkflowRoutes[line.catalog_product_id]||'review':'review';
        const value=getProductionDetails(displayLine,productionByLine[line.line_key],defaultRoute);
        return {line_index:index,workflow_code:value.workflow_code,specifications:{...value.specifications,installation_required:fulfillment.installationRequired,installation_address:fulfillment.installationAddress}};
      });
      const fulfillmentPayload={installation_required:fulfillment.installationRequired,installation_address:fulfillment.installationAddress,installation_maps_url:normalizedMapLink,installation_latitude:fulfillment.latitude,installation_longitude:fulfillment.longitude,installation_estimated_at:fulfillment.installationAt?new Date(fulfillment.installationAt).toISOString():null,delivery_due_at:fulfillment.deliveryAt?new Date(fulfillment.deliveryAt).toISOString():null};
      const currentSnapshot={form,cart,discountPercent:manualDiscountPercent,discountReason:discountReason.trim(),materialRequestsByLine,productionByLine,productionJobs,fulfillment,mapLink:normalizedMapLink,payments,chargeNow,activeParkedOrderId,allowBackorder:typeof pendingSaleSnapshotRef.current?.allowBackorder==='boolean'?pendingSaleSnapshotRef.current.allowBackorder:canManageBackorders,saleLines:lines,saleNote,clientBriefHtml};
      sessionStorage.setItem(pendingSaleSnapshotStorageKey,JSON.stringify({version:1,savedAt:Date.now(),...currentSnapshot}));
      pendingSaleSnapshotRef.current=currentSnapshot;setPendingSaleRecoveryMode(true);
      saleRequestStarted=true;
      const {data:sale,error}=await supabase.rpc('confirm_pos_sale_with_workflows',{
        p_idempotency_key:pendingSaleKey.current,
        p_branch_code:form.branchCode,
        p_customer_id:form.customerId||null,
        p_customer_data:{full_name:form.customer.trim(),phone:form.customerPhone.trim(),email:form.customerEmail.trim(),document_reference:form.customerDocumentReference.trim(),central_quote_id:form.quoteId||null},
        p_discount:form.quoteId?quoteDiscount:manualDiscountAmount,
        p_note:saleNoteWithDiscount,
        p_allow_backorder:Boolean(currentSnapshot.allowBackorder),
        p_lines:lines,
        p_payments:salePayments,
        p_fulfillment:fulfillmentPayload,
        p_production_jobs:productionJobs,
      });
      if(error)throw error;
      const {error:briefError}=await supabase.rpc('save_pos_sale_client_brief',{p_sale:sale.sale_id,p_brief_html:clientBriefHtml});
      if(briefError)throw briefError;
      if(saleAssets.length){const {count:existingAssets,error:assetsReadError}=await supabase.from('commercial_document_assets').select('id',{count:'exact',head:true}).eq('document_kind','sale').eq('document_id',sale.sale_id);if(assetsReadError)throw assetsReadError;if(!existingAssets)await persistCommercialAssets({organizationId,documentId:sale.sale_id,kind:'sale',assets:saleAssets});}
      window.dispatchEvent(new Event('visualcorp:production-changed'));
      let materialBackorder=false;
      try{const {data:materialRows}=await supabase.from('sale_material_consumptions').select('backordered_quantity').eq('sale_id',sale.sale_id).gt('backordered_quantity',0);materialBackorder=Boolean(materialRows?.length);}catch{}
      const completingParkedOrder=activeParkedOrderId;
      let parkedCompletionError='';
      if(completingParkedOrder){const {error:parkedError}=await supabase.rpc('complete_parked_pos_order',{p_parked_order:completingParkedOrder,p_sale:sale.sale_id});if(parkedError)parkedCompletionError=parkedError.message;}
      if(form.quoteId&&!quoteAlreadyLinked){const {error:quoteError}=await supabase.rpc('link_pos_sale_to_central_quote',{p_sale:sale.sale_id,p_quote:form.quoteId});if(quoteError){const {data:linkedSale,error:linkCheckError}=await supabase.from('sales').select('central_quote_id').eq('organization_id',organizationId).eq('id',sale.sale_id).maybeSingle();if(!linkCheckError&&linkedSale?.central_quote_id===form.quoteId)quoteAlreadyLinked=true;else quoteLinkError=linkCheckError?`${quoteError.message} · No se pudo verificar el vínculo: ${linkCheckError.message}`:quoteError.message;}if(quoteAlreadyLinked||!quoteError)setCentralQuotes(rows=>rows.map(q=>q.id===form.quoteId?{...q,status:'converted'}:q));}
      await refreshRemote();
      await refreshPOSDaySales();
      if(completingParkedOrder)await refreshParkedOrders().catch(()=>{});
      setLastSaleConfirmation({code:sale.sale_code||sale.sale_id,total:Number(sale.total??total),paid:Number(sale.paid??paymentState.applied),balance:Number(sale.balance??Math.max(0,total-paymentState.applied)),branch:branchName,change:paymentState.change,deliveryAt:fulfillment.deliveryAt||''});
      if(!parkedCompletionError&&!quoteLinkError){resetCheckout();sessionStorage.removeItem(pendingSaleStorageKey);sessionStorage.removeItem(pendingSaleSnapshotStorageKey);pendingSaleKey.current='';pendingSaleSnapshotRef.current=null;setPendingSaleRecoveryMode(false);}
      flash(parkedCompletionError?`Venta ${sale.sale_code||''} registrada. La orden sigue en espera por un problema de sincronización; al recuperarla, la clave evita duplicar la venta.`:quoteLinkError?`Venta ${sale.sale_code||''} registrada, pero la cotización no quedó vinculada: ${quoteLinkError}`:shortages.length||sale.backordered_quantity||materialBackorder?'Orden confirmada; el faltante de producto o material quedó como compra urgente.':`Venta ${sale.sale_code||''} confirmada con sus datos de entrega e instalación.`);
    }catch(error){if(!saleRequestStarted&&!hadPendingSaleKey){pendingSaleKey.current='';pendingSaleSnapshotRef.current=null;setPendingSaleRecoveryMode(false);sessionStorage.removeItem(pendingSaleStorageKey);sessionStorage.removeItem(pendingSaleSnapshotStorageKey);}flash(saleRequestStarted?`La orden puede haberse registrado antes de la falla. Se conserva la clave segura y los datos del formulario para reintentar sin duplicarla: ${error.message}`:`No se envió la venta porque no se pudo preparar la recuperación de la sesión: ${error.message}`);}
    finally{setSavingSale(false);}
  };
  const registerBalancePayment=async(event,sale)=>{
    event.preventDefault();
    if(savingBalancePayment===sale.id)return;
    const received=Number(paymentForm.amount);
    if(!Number.isFinite(received)||received<=0)return;
    if(paymentForm.method!=='Efectivo'&&received>Number(sale.balance)){flash('El abono no puede superar el saldo pendiente.');return;}
    const amount=paymentForm.method==='Efectivo'?Math.min(received,Number(sale.balance)):received;
    const change=paymentForm.method==='Efectivo'?Math.max(0,received-amount):0;
    setSavingBalancePayment(sale.id);
    try{
      const keyName=`visualcorp-pos-payment-${sale.id}`;let key=sessionStorage.getItem(keyName);
      if(!key){key=globalThis.crypto?.randomUUID?.()||`payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(keyName,key);}
      const methodMap={Efectivo:'cash',Transferencia:'transfer',Tarjeta:'card',Otro:'other'};
      const {error}=await supabase.rpc('record_sale_payment',{p_idempotency_key:key,p_sale_id:sale.id,p_method:methodMap[paymentForm.method]||'other',p_amount:amount,p_reference:paymentForm.reference.trim(),p_note:paymentForm.note.trim()});
      if(error)throw error;
      sessionStorage.removeItem(keyName);await refreshRemote();await refreshPOSDaySales();setPaymentTarget(null);setPaymentForm({amount:'',method:'Efectivo',reference:'',note:''});
      flash(change>0?`Abono aplicado. Vuelto: ${formatMoney(change)}.`:'Abono guardado y saldo actualizado.');
    }catch(error){flash(`No se guardó el abono; puedes reintentar sin duplicarlo: ${error.message}`);}
    finally{setSavingBalancePayment('');}
  };
  const connectedStockCount=useMemo(()=>Object.values(stockMetaByProduct).filter((meta)=>meta.tone==='available').length,[stockMetaByProduct]);
  const quickCashDenominations=useMemo(()=>{
    const base=[5,10,20,50,100];
    if(activeTotal>0){
      const nextTen=Math.ceil(activeTotal/10)*10;
      const nextTwenty=Math.ceil(activeTotal/20)*20;
      return [...new Set([nextTen,nextTwenty,...base].filter((val)=>val>=activeTotal&&val<=500))].sort((a,b)=>a-b).slice(0,5);
    }
    return base;
  },[activeTotal]);

  return <AppFrame area="operations">
     <PageHeading eyebrow="PUNTO DE VENTA · SISTEMA CONECTADO" title="Caja y ventas" description="Arma el pedido, verifica existencias en vivo, asigna rutas de producción y confirma el cobro." action={<div className="pos-heading-actions"><span className={`local-badge ${catalogLinkStatus==='ready'?'is-ready':catalogLinkStatus==='error'?'is-error':''}`}><span className="status-dot"/> {catalogLinkStatus==='ready'?`${linksByProduct.size} vínculos activos en ${branchName}`:catalogLinkStatus==='error'?'No se pudieron consultar los vínculos':'Consultando vínculos de inventario'}</span></div>}/>
    {lastSaleConfirmation&&<section className="pos-sale-success" role="status" aria-live="polite"><span className="pos-sale-success-icon"><Check size={19}/></span><div className="pos-sale-success-copy"><small>VENTA REGISTRADA · {lastSaleConfirmation.branch}</small><h2>{lastSaleConfirmation.code}</h2><span>Total {formatMoney(lastSaleConfirmation.total)} · Aplicado {formatMoney(lastSaleConfirmation.paid)} · Saldo {formatMoney(lastSaleConfirmation.balance)}{lastSaleConfirmation.change>0?` · Vuelto ${formatMoney(lastSaleConfirmation.change)}`:''}</span></div><button className="icon-button" type="button" aria-label="Cerrar confirmación de venta" onClick={()=>setLastSaleConfirmation(null)}><X size={16}/></button></section>}

    <section className="pos-ecosystem-bar" aria-label="Conexiones operativas del Punto de Venta">
      <div className="pos-eco-card is-branch">
        <span className="pos-eco-icon"><Store size={16}/></span>
        <div className="pos-eco-copy">
          <small>SUCURSAL ACTIVA</small>
          <div className="pos-branch-pills" role="group" aria-label="Cambiar sucursal activa">
            {(data.branches.length?data.branches:[{id:'vis',code:'VIS',name:'Visual Corp'},{id:'giga',code:'GIGA',name:'Gigaprint'}]).map((branch)=><button
              key={branch.code}
              type="button"
              className={`pos-branch-pill${form.branchCode===branch.code?' is-active':''}`}
              aria-pressed={form.branchCode===branch.code}
              onClick={()=>setForm((current)=>({...current,branchCode:branch.code}))}
            >{branch.name||branch.code}</button>)}
          </div>
        </div>
      </div>

      <div className="pos-eco-card">
        <span className="pos-eco-icon is-violet"><ShoppingBag size={16}/></span>
        <div className="pos-eco-copy">
          <small>CATÁLOGO DE PRODUCTOS</small>
          <b>{data.catalog.length} artículos ({data.catalog.filter(p=>p.mode!=='area').length} und · {data.catalog.filter(p=>p.mode==='area').length} m²)</b>
          <Link to="/operaciones/catalogo" className="pos-eco-link">Abrir catálogo y tarifas <ArrowUpRight size={12}/></Link>
        </div>
      </div>

      <div className="pos-eco-card">
        <span className="pos-eco-icon is-emerald"><Boxes size={16}/></span>
        <div className="pos-eco-copy">
          <small>INVENTARIO · {branchName.toUpperCase()}</small>
          <b>{linksByProduct.size} vinculados · {connectedStockCount} con stock listo</b>
          <Link to="/operaciones/inventario?tab=pos" className="pos-eco-link">Vínculos POS y conteos <ArrowUpRight size={12}/></Link>
        </div>
      </div>

      <div className="pos-eco-card">
        <span className="pos-eco-icon is-blue"><FileText size={16}/></span>
        <div className="pos-eco-copy">
          <small>COTIZADOR CENTRAL</small>
          <b>{acceptedQuotes.length} {acceptedQuotes.length===1?'aprobada lista':'aprobadas listas'} para cobrar</b>
          <div className="pos-eco-inline-links">
            <Link to="/operaciones/cotizador" className="pos-eco-link">Ir al cotizador <ArrowUpRight size={12}/></Link>
            <Link to="/operaciones/clientes" className="pos-eco-link">Clientes ({data.customers?.length||0}) <ArrowUpRight size={12}/></Link>
          </div>
        </div>
      </div>
    </section>

    <div className="stat-grid compact-stats"><StatCard label="Venta confirmada hoy" value={posSalesStatus==='ready'?formatMoney(salesToday.reduce((sum,sale)=>sum+sale.total,0)):'—'} icon={Wallet} note={posSalesStatus==='ready'?branchName:posSalesStatus==='loading'?'Consultando esta sucursal':posSalesStatus==='restricted'?'Sin permiso para ver ventas':'No se pudo consultar'} tone="blue"/><StatCard label="Transacciones" value={posSalesStatus==='ready'?salesToday.length:'—'} icon={ShoppingCart} note={posSalesStatus==='ready'?'Hoy · sucursal seleccionada':'Conteo no disponible'} tone="violet"/><StatCard label="Método más común" value={posSalesStatus==='ready'&&salesToday.length?mostFrequent(salesToday.map((sale)=>sale.method)):'—'} icon={ArrowDownRight} note={posSalesStatus==='ready'?'En ventas confirmadas de hoy':'Sin datos de caja'} tone="amber"/></div>

    <section className="pos-cashier-card">
      <span className="pos-cashier-icon"><Users size={18}/></span>
      <span className="pos-cashier-copy">
        <small>CAJERO Y TURNO DE CAJA</small>
        <b>{user?.email||'Sesión autenticada'}</b>
        <span>{cashierSession.branch?.name||branchName} · la venta y los pagos en efectivo se registran en tu turno activo</span>
      </span>
      <div className="pos-cashier-actions">
        {cashierSession.loading?<span className="inventory-status pending">Consultando turno…</span>:cashierSession.session?<>
          <span className="inventory-status available">Caja abierta · {new Date(cashierSession.session.opened_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}{Number.isFinite(Number(cashierSession.session.opening_cash))?` · Base ${formatMoney(Number(cashierSession.session.opening_cash))}`:''}</span>
          <button type="button" className="button button-outline pos-cashier-ctrl-btn" onClick={()=>{setNewBaseAmount(String(cashierSession.session.opening_cash||'0'));setShowEditBaseModal(true);}}><Pencil size={12}/> Editar base</button>
          <button type="button" className="button button-outline pos-cashier-ctrl-btn is-in" onClick={()=>{setCashMovementDirection('in');setCashMovementAmount('');setCashMovementReason('');setShowCashMovementModal(true);}}><Plus size={12}/> + Entrada</button>
          <button type="button" className="button button-outline pos-cashier-ctrl-btn is-out" onClick={()=>{setCashMovementDirection('out');setCashMovementAmount('');setCashMovementReason('');setShowCashMovementModal(true);}}><Minus size={12}/> - Retiro</button>
          <Link to="/operaciones/flujos?tab=cash" className="button button-outline">Arqueo / Cerrar turno <ArrowUpRight size={14}/></Link>
        </>:cashierSession.error?<span className="inventory-status pending" title={cashierSession.error}>No se pudo verificar el turno</span>:<>
          <span className="inventory-status pending">Sin turno abierto en {branchName}</span>
          <div className="pos-cashier-quick-presets" role="group" aria-label="Apertura rápida de caja en 1 clic">
            {['0','20','50','100'].map((val)=><button key={val} type="button" className="button button-outline pos-cashier-quick-chip" disabled={openingQuickCash} onClick={()=>void openCashSessionFromPOS(Number(val))}>Iniciar ${val}</button>)}
          </div>
          <button type="button" className="button button-dark pos-quick-cash-trigger" onClick={()=>setShowQuickCashOpen((open)=>!open)}><Wallet size={14}/> {showQuickCashOpen?'Ocultar':'Otro fondo'}</button>
          <Link to="/operaciones/flujos?tab=cash" className="button button-outline">Flujos de caja <ArrowUpRight size={14}/></Link>
        </>}
      </div>
      {showEditBaseModal&&cashierSession.session&&<form className="pos-quick-cash-drawer" onSubmit={handleUpdateBase}>
        <div>
          <span className="eyebrow">AJUSTAR BASE INICIAL</span>
          <b>Modificar fondo de apertura ({formatMoney(Number(cashierSession.session.opening_cash||0))})</b>
          <small>Corrige el efectivo inicial con el que empezó el turno de caja actual.</small>
        </div>
        <div className="pos-quick-cash-controls">
          <label className="pos-quick-cash-input">
            <span>Nueva base ($)</span>
            <input type="number" min="0" step="0.01" required value={newBaseAmount} onChange={(e)=>setNewBaseAmount(e.target.value)}/>
          </label>
          <button type="submit" className="button button-dark" disabled={savingBase}>{savingBase?'Guardando…':'Guardar base'}</button>
          <button type="button" className="button button-outline" onClick={()=>setShowEditBaseModal(false)}>Cancelar</button>
        </div>
      </form>}
      {showCashMovementModal&&cashierSession.session&&<form className="pos-quick-cash-drawer is-movement" onSubmit={handleRecordCashMovement}>
        <div>
          <span className="eyebrow">{cashMovementDirection==='in'?'+ ENTRADA DE EFECTIVO':'− RETIRO DE EFECTIVO'}</span>
          <b>{cashMovementDirection==='in'?'Ingreso rápido a la gaveta de caja':'Salida o retiro de efectivo'}</b>
          <small>Registra el importe y el motivo para cuadrar en el arqueo final.</small>
        </div>
        <div className="pos-quick-cash-controls">
          <div className="pos-mode-switch compact" role="group">
            <button type="button" className={cashMovementDirection==='in'?'active':''} onClick={()=>setCashMovementDirection('in')}>+ Entrada</button>
            <button type="button" className={cashMovementDirection==='out'?'active':''} onClick={()=>setCashMovementDirection('out')}>− Retiro</button>
          </div>
          <label className="pos-quick-cash-input">
            <span>Monto ($)</span>
            <input type="number" min="0.01" step="0.01" required placeholder="0.00" value={cashMovementAmount} onChange={(e)=>setCashMovementAmount(e.target.value)}/>
          </label>
          <label className="pos-quick-cash-input is-wide">
            <span>Motivo del movimiento *</span>
            <input type="text" required placeholder="Ej.: Cambio de sencillo, pago de delivery, etc." value={cashMovementReason} onChange={(e)=>setCashMovementReason(e.target.value)}/>
          </label>
          <button type="submit" className="button button-dark" disabled={savingCashMovement}>{savingCashMovement?'Registrando…':'Registrar movimiento'}</button>
          <button type="button" className="button button-outline" onClick={()=>setShowCashMovementModal(false)}>Cancelar</button>
        </div>
      </form>}
      {showQuickCashOpen&&!cashierSession.session&&<div className="pos-quick-cash-drawer" role="region" aria-label="Apertura rápida de turno de caja">
        <div>
          <span className="eyebrow">APERTURA PERSONALIZADA EN {branchName.toUpperCase()}</span>
          <b>Habilita cobros en efectivo sin salir del POS</b>
          <small>Ingresa cualquier fondo inicial de sencillo en gaveta para iniciar tu turno.</small>
        </div>
        <div className="pos-quick-cash-controls">
          <div className="pos-quick-cash-presets" role="group" aria-label="Fondos iniciales sugeridos">
            {['0','20','50','100'].map((val)=><button key={val} type="button" className={`pos-denomination-pill${quickCashAmount===val?' is-active':''}`} onClick={()=>setQuickCashAmount(val)}>${val}</button>)}
          </div>
          <label className="pos-quick-cash-input">
            <span>Fondo inicial ($)</span>
            <input type="number" min="0" step="0.01" value={quickCashAmount} onChange={(e)=>setQuickCashAmount(e.target.value)}/>
          </label>
          <button type="button" className="button button-dark" disabled={openingQuickCash} onClick={()=>void openCashSessionFromPOS()}>{openingQuickCash?'Abriendo…':'Confirmar apertura'}</button>
        </div>
      </div>}
    </section>

    <div className="pos-grid">
      <form className="panel form-panel pos-checkout-form" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">NUEVA ORDEN</span><h2>{checkoutStep==='order'?'Agrega los productos':checkoutStep==='details'?'Prepara el trabajo':'Revisa y cobra'}</h2><p className="pos-step-caption">Elige del catálogo o carga una cotización aprobada. Revisa el total y el cobro antes de confirmar.</p></div><ShoppingCart size={19}/></div>
        <POSCheckoutSteps active={checkoutStep} onChange={chooseCheckoutStep} itemCount={form.quoteId?currentQuoteLines.length:cart.length} requiresDetails={requiresWorkDetails}/>
        {pendingSaleRecoveryMode&&<div className={`pos-pending-sale-notice${pendingOperationChanged?' is-changed':''}`} role="status"><div><b>Operación protegida</b><p>{pendingOperationChanged?'Detecté cambios en los datos guardados o en los conceptos de la cotización. No enviaré una venta con la misma clave y contenido distinto. Recarga para recuperar la versión original.':'Si la respuesta anterior se interrumpió, puedes reintentar con esta misma clave y estos datos para evitar una venta duplicada.'}</p></div>{pendingOperationChanged&&<button className="button button-outline" type="button" onClick={()=>window.location.reload()}>Restaurar datos originales</button>}</div>}
        <div className="pos-checkout-main" hidden={checkoutStep!=='order'}>
        <div className="pos-origin-branch-row">
          <label>Origen de la venta<select value={form.quoteId} onChange={(event)=>void handleQuoteSelection(event.target.value,event.currentTarget)}><option value="">Venta manual: catálogo y carrito</option>{acceptedQuotes.map((quote)=><option key={quote.id} value={quote.id}>{quote.quote_code} · {quote.customer_name||'Cliente'} · {formatMoney(quote.selected_total)}</option>)}</select><small className="pos-field-help">Puedes armar una venta nueva o cargar una cotización aprobada con su precio confirmado.</small></label>
          <label className="pos-payment-fields pos-branch-selector">Sucursal<select value={form.branchCode} disabled={!data.branches.length} onChange={(event)=>setForm((current)=>({...current,branchCode:event.target.value}))}>{data.branches.length?data.branches.map((branch)=><option key={branch.id} value={branch.code}>{branch.name||branch.code}</option>):<option value={form.branchCode}>{branchName}</option>}</select><small className="pos-field-help">Define de qué inventario se descuenta y en qué caja ingresa.</small></label>
        </div>
        <POSCustomerPicker customers={data.customers||[]} remoteMatches={customerLookupActive&&canSearchCustomers&&!form.customerId&&customerSearch.results!==null&&!customerSearch.error?customerSearch.results:null} searchingCustomers={customerSearch.loading} searchError={customerSearch.error} onRetrySearch={()=>setCustomerSearchRequest((request)=>request+1)} canShowMore={Boolean(customerSearch.hasMore&&customerSearchLimit<20)} onShowMore={()=>setCustomerSearchLimit(20)} selectedCustomer={selectedCustomer} duplicateCustomer={duplicateCustomer} customerName={form.customer} onNewNameChange={(value)=>setForm((current)=>({...current,customer:value}))} query={customerQuery} onQueryChange={updateCustomerQuery} onSelect={choosePOSCustomer} phone={form.customerPhone} email={form.customerEmail} documentReference={form.customerDocumentReference} onContactChange={(field,value)=>setForm((current)=>({...current,[field==='phone'?'customerPhone':field==='email'?'customerEmail':'customerDocumentReference']:value}))} canViewSales={canViewCustomerHistory} historyLoading={customerHistory.loading} historyCount={customerHistory.count} historySummary={customerHistory.summary} recentPurchases={customerHistory.rows} onOpenPurchase={(purchase)=>setDetailTarget({kind:'sale',id:purchase.id,code:purchase.code})}/>
        {form.quoteId?<div className="pos-quote-total"><span>Total aprobado en cotización</span><strong>{formatMoney(form.total)}</strong><small>El total se conserva igual al aprobado.</small></div>:<>
          <section className="pos-cart-builder" aria-label="Agregar artículos">
            <div className="pos-cart-builder-heading"><span className="eyebrow">CATÁLOGO Y CONCEPTOS CONECTADOS</span><span>Precios en USD · IVA {configuredTaxRate}%</span></div>
            <div className="pos-mode-switch" role="group" aria-label="Forma de calcular el producto">
              <button type="button" className={cartMode==='quantity'?'active':''} aria-pressed={cartMode==='quantity'} onClick={()=>{setCartMode('quantity');setCartProductId('');setCartFamily('Todas');setCartPriceTier('pvp');}}>Por cantidad ({data.catalog.filter(p=>p.mode!=='area').length})</button>
              <button type="button" className={cartMode==='area'?'active':''} aria-pressed={cartMode==='area'} onClick={()=>{setCartMode('area');setCartProductId('');setCartFamily('Todas');setCartPriceTier('pvp');}}>Por medidas m² ({data.catalog.filter(p=>p.mode==='area').length})</button>
            </div>
            <POSProductSearch
              products={modeCatalog} query={cartSearch} onQueryChange={setCartSearch}
              onChoose={chooseCartProduct} onEnter={handleCartScan} selectedId={cartProductId}
              disabled={!selectedBranchId} family={cartFamily} onFamilyChange={setCartFamily}
              families={cartFamilies} codesByProduct={skuCodesByProduct}
              stockByProduct={stockByProduct}
              stockMetaByProduct={stockMetaByProduct}
              renderImage={(product)=><POSProductVisual src={product.image} className="pos-product-image"/>}
              favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite}
              onQuickAdd={cartMode==='quantity'?quickAddProductToCart:undefined}
            />
            {favoriteStorageStatus==='local'&&<small className="pos-favorite-storage-note">Las estrellas se guardan en este navegador hasta conectar el almacenamiento del equipo.</small>}
            {!cartProductId&&cartMode==='quantity'&&<label>Concepto libre<input value={cartItemName} onChange={(event)=>setCartItemName(event.target.value)} placeholder="Producto o servicio acordado"/></label>}
            {!cartProductId&&cartMode==='area'&&<div className="pos-custom-area-box">
              <label><span>Concepto libre por m²</span><input value={cartItemName} onChange={(event)=>setCartItemName(event.target.value)} placeholder="Ej.: Lona banner medida especial, Rotulación libre"/></label>
              <POSMeasurementControls widthValue={cartWidthCm} heightValue={cartHeightCm} quantityValue={cartQuantity} widthCm={cartWidthNumber} heightCm={cartHeightNumber} quantity={cartQuantityNumber} onWidthChange={setCartWidthCm} onHeightChange={setCartHeightCm} onQuantityChange={setCartQuantity}/>
              <label><span>Precio acordado por m² ($)</span><div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={cartUnitPrice} onChange={(event)=>setCartUnitPrice(event.target.value)} placeholder="Ej.: 12.00"/></div></label>
              {cartAreaPerPiece>0&&Number(cartUnitPrice)>0&&<div className="pos-calculation-total"><span>{cartAreaPerPiece.toFixed(4)} m² c/u × {cartQuantityNumber} · {(cartAreaPerPiece*cartQuantityNumber).toFixed(4)} m² en total</span><strong>{formatMoney((cartAreaPerPiece*cartQuantityNumber)*Number(cartUnitPrice))}</strong></div>}
            </div>}
            {selectedCartProduct&&<div className="pos-selected-product">
              <POSProductVisual src={selectedCartProduct.image} alt={selectedCartProduct.name} className="pos-selected-image" iconSize={18}/>
              <span>
                <b>{selectedCartProduct.name}</b>
                <small>{selectedCartProduct.sku||selectedCartProduct.id} · {selectedCartProduct.family} · {selectedCartProduct.unit||'unidad'}{cartPriceAvailable?' · tarifa lista para venta':' · tarifa pendiente de configurar'}{selectedCatalogLink?.location_code?` · Ubicación: ${selectedCatalogLink.location_code}`:''}</small>
                <small className={`pos-selected-stock-line is-${stockMetaByProduct[selectedCartProduct.id]?.tone||'unlinked'}`}>
                  {!selectedCatalogLink?'Sin vínculo: esta venta no descontará inventario.':!selectedLinkedStock||selectedLinkedStock.sourceStatus?'Vínculo activo; falta conteo físico para confirmar disponibilidad.':`Disponible en ${branchName}: ${selectedAvailableStock} ${selectedLinkedStock.unit}.`}
                  {(!selectedCatalogLink||!selectedLinkedStock||selectedLinkedStock.sourceStatus)&&<> · <Link to="/operaciones/inventario?tab=pos" className="pos-inline-inv-link">Configurar en Inventario</Link></>}
                </small>
              </span>
              <AdvisorProductFavoriteButton favorite={favoriteIds.has(selectedCartProduct.id)} onToggle={()=>toggleFavorite(selectedCartProduct.id)}/>
              <button className="icon-button" type="button" aria-label="Quitar artículo seleccionado" onClick={()=>{setCartProductId('');setCartUnitPrice('');setCartCustomUnitPrice('');}}><X size={14}/></button>
            </div>}
            {cartMode==='area'&&selectedCartProduct&&<POSMeasurementControls widthValue={cartWidthCm} heightValue={cartHeightCm} quantityValue={cartQuantity} widthCm={cartWidthNumber} heightCm={cartHeightNumber} quantity={cartQuantityNumber} onWidthChange={setCartWidthCm} onHeightChange={setCartHeightCm} onQuantityChange={setCartQuantity}/>}
            {cartMode==='quantity'&&<div className="pos-cart-inputs">
              <div className="pos-qty-control-group">
                <label htmlFor="pos-cart-quantity">Cantidad</label>
                <div className="pos-qty-stepper-row">
                  <button type="button" className="pos-qty-step-btn" aria-label="Reducir cantidad" onClick={()=>setCartQuantity(String(Math.max(1,(Number(cartQuantity)||1)-1)))}><Minus size={14}/></button>
                  <input id="pos-cart-quantity" type="number" min="1" step="1" value={cartQuantity} onChange={(event)=>setCartQuantity(event.target.value)}/>
                  <button type="button" className="pos-qty-step-btn" aria-label="Aumentar cantidad" onClick={()=>setCartQuantity(String(Math.max(1,(Number(cartQuantity)||0)+1)))}><Plus size={14}/></button>
                </div>
                <div className="pos-qty-presets" role="group" aria-label="Cantidades rápidas">
                  {[1,2,5,10,25,50,100].map((preset)=><button key={preset} type="button" className={`pos-qty-preset${Number(cartQuantity)===preset?' is-active':''}`} onClick={()=>setCartQuantity(String(preset))}>×{preset}</button>)}
                </div>
              </div>
              {!selectedCartProduct&&<label>Precio acordado por unidad<div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={cartUnitPrice} onChange={(event)=>setCartUnitPrice(event.target.value)} placeholder="0,00"/></div></label>}
            </div>}
            {selectedCartProduct&&<div className="pos-agreed-price-wrap">
              <label><span>Precio acordado ($) · <small>Opcional: sobrescribe PVP unitario/m²</small></span><div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={cartCustomUnitPrice} onChange={(event)=>setCartCustomUnitPrice(event.target.value)} placeholder={cartCalculation?cartCalculation.unitPrice.toFixed(2):'0.00'}/></div></label>
              {hasCustomAgreedPrice&&<button type="button" className="button button-outline pos-reset-agreed-btn" onClick={()=>setCartCustomUnitPrice('')}>Usar catálogo</button>}
            </div>}
            {selectedCartProduct&&<>{selectedCartProduct.optionPrices?.length>0&&<label>Material / acabado<select value={cartOptionChoice} onChange={(event)=>setCartOptionChoice(event.target.value)}><option value="">Tarifa base</option>{selectedCartProduct.optionPrices.map(option=><option key={option.label} value={option.label}>{option.label}</option>)}</select></label>}<QuotePriceComparison product={selectedCartProduct} basis={cartPricingBasis} selectedTier={cartPriceTier} onSelect={setCartPriceTier} optionChoice={cartOptionChoice}/>{cartMode==='area'&&invalidMeasurementStockLink&&<p className="pos-calculation-warning">Este artículo descuenta inventario medido en “{measurementStockUnit}”. Asigna una existencia en m² antes de venderlo para evitar un descuento incorrecto.</p>}</>}
            {selectedCartProduct&&cartCalculation&&<div className="pos-calculation-total"><span>{cartMode==='area'?`${cartAreaPerPiece.toFixed(4)} m² por pieza × ${cartQuantityNumber} · ${cartCalculation.billedQuantity.toFixed(4)} m² en total`:`${cartQuantityNumber} ${selectedCartProduct.unit||'unidades'} · tarifa por ${selectedCartProduct.unit||'unidad'}`}</span><strong>{formatMoney(cartCalculation.total)}</strong></div>}
            <button className="button button-outline pos-add-item" type="button" onClick={addCartLine} disabled={Boolean(selectedCartProduct&&!cartPriceAvailable)||Boolean(invalidMeasurementStockLink)}><Plus size={15}/> Agregar al carrito</button>
           </section>
         </>}
         <div className="pos-step-actions">
           <button className="button button-outline pos-express-cash-btn" type="button" onClick={()=>void handleExpressCashCheckout()}><Wallet size={15}/> Cobro exprés efectivo</button>
           <button className="button button-dark" type="button" onClick={advanceFromOrder}>{requiresWorkDetails?'Continuar con detalles':'Revisar y cobrar'} <ChevronRight size={15}/></button>
         </div>
        </div>
        {checkoutStep==='details'&&<section className="pos-checkout-details" aria-label="Detalles del trabajo">
          <div className="pos-stage-heading"><span className="eyebrow">ETAPA 2 DE 3</span><h3>Detalles del trabajo</h3><p>Completa producción, entrega y referencias cuando el pedido las necesite.</p></div>
          <POSMaterialUsage lines={saleMaterialLines} recipes={materialRecipes} inventory={data.inventory} branchId={selectedBranchId} values={materialRequestsByLine} status={materialRecipesStatus} onChange={updateMaterialRequest} onRetry={()=>setMaterialRecipesReload((value)=>value+1)}/>
        <POSProductionDetails lines={productionLines} values={productionByLine} routeByProduct={productWorkflowRoutes} templates={workflowTemplates} routeStatus={workflowRouteStatus} onChange={(lineKey,value)=>setProductionByLine((current)=>({...current,[lineKey]:value}))}/>
        <section className="pos-fulfillment-fields" aria-labelledby="pos-fulfillment-title"><div><span className="eyebrow">ENTREGA Y PRODUCCIÓN</span><h3 id="pos-fulfillment-title">Fechas y ubicación del pedido</h3><p>Se guardan con la venta para que Finanzas y Producción consulten la misma información.</p></div><label className="pos-install-toggle"><input type="checkbox" checked={fulfillment.installationRequired} onChange={(event)=>setFulfillment({...fulfillment,installationRequired:event.target.checked})}/> Requiere instalación</label>{fulfillment.installationRequired&&<><label>Ubicación de instalación<input value={fulfillment.installationAddress} onChange={(event)=>setFulfillment({...fulfillment,installationAddress:event.target.value})} placeholder="Dirección o referencia"/></label><div className="pos-location-tools"><button type="button" className="button button-outline" onClick={()=>setShowLocationPicker(true)}>Ubicar en Google Maps</button>{fulfillment.latitude&&fulfillment.longitude&&<span>Pin guardado · {fulfillment.latitude}, {fulfillment.longitude}</span>}</div><GoogleMapsPreview url={mapLink} address={fulfillment.installationAddress} coordinates={fulfillment.latitude&&fulfillment.longitude?`${fulfillment.latitude},${fulfillment.longitude}`:""}/><div className="pos-cart-inputs"><label>Latitud (opcional)<input inputMode="decimal" value={fulfillment.latitude} onChange={(event)=>setFulfillment({...fulfillment,latitude:event.target.value})} placeholder="-2.1234567"/></label><label>Longitud (opcional)<input inputMode="decimal" value={fulfillment.longitude} onChange={(event)=>setFulfillment({...fulfillment,longitude:event.target.value})} placeholder="-79.1234567"/></label></div><label>Instalación estimada<input type="datetime-local" value={fulfillment.installationAt} onChange={(event)=>setFulfillment({...fulfillment,installationAt:event.target.value})}/></label></>}<label>Fecha de entrega<input type="datetime-local" value={fulfillment.deliveryAt} onChange={(event)=>setFulfillment({...fulfillment,deliveryAt:event.target.value})}/></label></section>{showLocationPicker&&<div className="pos-map-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowLocationPicker(false);}}><section className="pos-map-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-map-title"><div className="panel-heading"><div><span className="eyebrow">UBICACIÓN DEL PEDIDO</span><h2 id="pos-map-title">Selecciona el lugar</h2></div><button className="icon-button" type="button" aria-label="Cerrar mapa" onClick={()=>setShowLocationPicker(false)}><X size={17}/></button></div><p>Abre Google Maps para buscar el sitio o colocar un pin. Puedes pegar el enlace compartido tal como lo copiaste, sin escribir https://.</p><label>Dirección o referencia<input value={fulfillment.installationAddress} onChange={(event)=>setFulfillment({...fulfillment,installationAddress:event.target.value})} placeholder="Busca la dirección o el sitio"/></label><label>Enlace compartido de Google Maps<input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" value={mapLink} onChange={(event)=>{setMapLink(event.target.value);const point=coordinatesFromMapLink(event.target.value);if(point)setFulfillment(current=>({...current,...point}));}} placeholder="maps.app.goo.gl/… o google.com/maps/…"/></label><GoogleMapsPreview url={mapLink} address={fulfillment.installationAddress} coordinates={fulfillment.latitude&&fulfillment.longitude?`${fulfillment.latitude},${fulfillment.longitude}`:""}/><div className="pos-map-coordinates"><label>Latitud<input inputMode="decimal" value={fulfillment.latitude} onChange={(event)=>setFulfillment({...fulfillment,latitude:event.target.value})}/></label><label>Longitud<input inputMode="decimal" value={fulfillment.longitude} onChange={(event)=>setFulfillment({...fulfillment,longitude:event.target.value})}/></label></div><div className="pos-submit-actions"><a className="button button-outline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fulfillment.latitude&&fulfillment.longitude?`${fulfillment.latitude},${fulfillment.longitude}`:fulfillment.installationAddress||'Milagro, Ecuador')}`} target="_blank" rel="noreferrer">Abrir Google Maps</a><button className="button button-dark" type="button" onClick={()=>setShowLocationPicker(false)}>Guardar ubicación</button></div></section></div>}
        <label>Notas internas<textarea rows={2} value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} placeholder="Detalles acordados para esta orden"/></label><section className="panel"><div className="panel-heading"><div><span className="eyebrow">BRIEF DEL TRABAJO</span><h3>Descripción e indicaciones</h3></div></div><RichTextEditor label="Descripción enriquecida" value={clientBriefHtml} onChange={setClientBriefHtml} minHeight={150} placeholder="Describe el diseño, materiales, ubicación, acabados o solicitudes del cliente…"/></section>{form.quoteId&&<CommercialAssetsGallery kind="quote" documentId={form.quoteId}/>}<CommercialAssetsEditor value={saleAssets} onChange={setSaleAssets} label="Fotos del sitio, referencias y diseños"/>
          <div className="pos-step-actions"><button className="button button-outline" type="button" onClick={()=>setCheckoutStep('order')}>Volver al pedido</button><button className="button button-dark" type="button" onClick={continueToPayment}>Revisar y cobrar <ChevronRight size={15}/></button></div>
        </section>}
        {checkoutStep==='payment'&&<section className="pos-checkout-review" aria-label="Revisión antes de confirmar">
          <div className="pos-stage-heading"><span className="eyebrow">ETAPA 3 DE 3</span><h3>Revisa la orden antes de confirmar</h3><p>Comprueba artículos, cliente, entrega y cobro. La venta se registra una sola vez.</p></div>
          <dl className="pos-review-grid"><div><dt>Cliente</dt><dd>{form.customer||'Venta de mostrador'}</dd></div><div><dt>Sucursal</dt><dd>{branchName}</dd></div><div><dt>Artículos</dt><dd>{form.quoteId?'Cotización '+(centralQuotes.find((quote)=>quote.id===form.quoteId)?.quote_code||''):cart.length+' '+(cart.length===1?'artículo':'artículos')}</dd></div><div><dt>Entrega</dt><dd>{fulfillment.deliveryAt?new Date(fulfillment.deliveryAt).toLocaleString('es-EC',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha indicada'}</dd></div><div><dt>Instalación</dt><dd>{fulfillment.installationRequired?fulfillment.installationAddress||'Dirección pendiente':'No solicitada'}</dd></div><div><dt>Cobro</dt><dd>{chargeNow?'Aplicado '+formatMoney(paymentBreakdown.applied)+' · Saldo '+formatMoney(paymentBreakdown.balance):'Pendiente de cobro'}</dd></div></dl>
          {(form.quoteId||cart.length>0)&&<POSFinancialBreakdown subtotal={activeSubtotal} discount={activeDiscount} taxRate={activeTaxRate} taxAmount={activeTaxAmount} total={activeTotal} shipping={activeShipping} taxApplied={activeTaxApplied} taxLabel={activeTaxLabel} className="pos-review-financial"/>}
          <div className="pos-review-actions"><button className="button button-outline" type="button" onClick={()=>void copyPOSWhatsApp()}><Copy size={15}/> Copiar WhatsApp</button><button className="button button-outline" type="button" onClick={()=>setCheckoutStep('details')}>Editar detalles del trabajo</button><button className="button button-outline" type="button" onClick={()=>setCheckoutStep('order')}>Agregar más artículos</button></div>
        </section>}
        <aside className={`pos-order-summary${mobileSummaryOpen?' is-open':''}`} data-checkout-step={checkoutStep}>
          <div className="pos-mobile-summary-bar"><span><small>ORDEN ACTUAL</small><b>{formatMoney(activeTotal)}</b></span><button className="button button-dark" type="button" aria-expanded={mobileSummaryOpen} onClick={()=>setMobileSummaryOpen((open)=>!open)}>{mobileSummaryOpen?'Cerrar pedido':'Ver pedido y cobrar'}</button></div>
          {form.quoteId
            ? <section className="pos-cart pos-quote-cart" aria-label="Resumen de cotización"><div className="pos-cart-heading"><div><span className="eyebrow">COTIZACIÓN APROBADA</span><h3>{centralQuotes.find((quote)=>quote.id===form.quoteId)?.quote_code||'Pedido aprobado'}</h3></div><strong>{formatMoney(activeTotal)}</strong></div><p className="pos-cart-empty">{form.description||'Los conceptos y el total se conservarán como fueron aprobados.'}</p></section>
            : <section className="pos-cart" aria-label="Carrito de venta">
                <div className="pos-cart-heading">
                  <div>
                    <span className="eyebrow">ORDEN ACTUAL · {branchName.toUpperCase()}</span>
                    <h3>{cart.length} {cart.length===1?'artículo':'artículos'}{cart.length>0?` · ${cart.reduce((s,l)=>s+(Number(l.quantity)||0),0)} pzs`:''}</h3>
                  </div>
                  <div className="pos-cart-heading-right">
                    <strong>{formatMoney(cartTotal)}</strong>
                    {cart.length>0&&<button type="button" className="pos-clear-cart-btn is-express" onClick={()=>void handleExpressCashCheckout()} title="Cobrar inmediatamente en efectivo exacto">Cobro exprés</button>}
                    {cart.length>1&&!pendingSaleRecoveryMode&&<button type="button" className="pos-clear-cart-btn" onClick={()=>{setCart([]);setMaterialRequestsByLine({});setProductionByLine({});flash('Carrito vaciado.');}}>Vaciar</button>}
                  </div>
                </div>
                {cart.length===0?<p className="pos-cart-empty">Agrega productos del catálogo (clic en “+ Agregar” o configura sus medidas) o registra un concepto libre con precio acordado.</p>:<div className="pos-cart-lines">{cart.map((line)=>{
                  const routeCode=productionByLine[line.key]?.workflow_code||(line.productId?productWorkflowRoutes[line.productId]:undefined);
                  const routeName=routeCode?workflowTemplates.find((t)=>t.code===routeCode)?.name||routeCode:undefined;
                  return <POSCartLineEditor
                    key={line.key}
                    line={line}
                    product={data.catalog.find((product)=>product.id===line.productId)}
                    inventoryStatus={cartInventoryStatus(line)}
                    inventoryTone={cartInventoryTone(line)}
                    workflowLabel={routeName}
                    onDuplicate={()=>duplicateCartLine(line)}
                    onRemove={()=>{setCart(current=>current.filter(item=>item.key!==line.key));setMaterialRequestsByLine(current=>{const next={...current};delete next[line.key];return next;});}}
                    onSave={(nextLine)=>setCart(current=>current.map(item=>item.key===line.key?nextLine:item))}
                  />;
                })}</div>}
              </section>}
          {!form.quoteId&&cart.length>0&&<section className="pos-discount-editor" aria-labelledby="pos-discount-title"><div className="pos-discount-heading"><div><span className="eyebrow">AJUSTE COMERCIAL</span><h3 id="pos-discount-title">Descuento de la venta</h3></div><strong>{manualDiscountPercent}%</strong></div><div className="pos-discount-slider-row"><label htmlFor="pos-discount-percent">Porcentaje de descuento <span>Hasta 40%</span></label><input id="pos-discount-percent" type="range" min="0" max="40" step="1" value={manualDiscountPercent} onChange={(event)=>setDiscountPercent(event.target.value)} aria-describedby="pos-discount-hint"/><div className="pos-discount-milestones">{[0,5,10,15,20,40].map((value)=><button key={value} type="button" className={manualDiscountPercent===value?'is-active':''} onClick={()=>setDiscountPercent(String(value))}>{value}%</button>)}</div></div>{manualDiscountAmount>0&&<label className="pos-discount-reason" htmlFor="pos-discount-reason">Motivo del descuento <span>Obligatorio · {discountReason.trim().length}/300</span><input id="pos-discount-reason" type="text" maxLength={300} value={discountReason} onChange={(event)=>setDiscountReason(event.target.value)} aria-invalid={!discountReasonValid} placeholder="Ej.: cliente frecuente, volumen acordado"/></label>}<p id="pos-discount-hint" className="pos-discount-hint">El descuento se registra en la venta y requiere un motivo. Las cotizaciones aprobadas conservan su desglose.</p></section>}
          {(form.quoteId||cart.length>0)&&<POSFinancialBreakdown subtotal={activeSubtotal} discount={activeDiscount} taxRate={activeTaxRate} taxAmount={activeTaxAmount} total={activeTotal} shipping={activeShipping} taxApplied={activeTaxApplied} taxLabel={activeTaxLabel} className="pos-sidebar-financial"/>}
        <section className="pos-payment-section" hidden={checkoutStep!=='payment'}>
          <div className="pos-payment-title"><div><span className="eyebrow">COBRO Y RECAUDACIÓN</span><h3>Forma de pago</h3></div><label className="pos-charge-toggle"><input type="checkbox" checked={chargeNow} onChange={(event)=>setChargeNow(event.target.checked)}/> Cobrar ahora</label></div>
          {chargeNow?<>
            <div className="pos-payment-rows">{payments.map((payment,idx)=>{
              const otherApplied=payments.filter((r)=>r.id!==payment.id).reduce((s,r)=>s+(Number(r.amount)||0),0);
              const remainingForRow=Math.max(0,roundMoney(activeTotal-otherApplied));
              return <div className="pos-payment-row" key={payment.id}>
                <label>Método<select value={payment.method} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,method:event.target.value}:row))}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select></label>
                <label>{payment.method==='Efectivo'?'Entregado en efectivo':payments.length===1&&payment.amount===''?'Monto (vacío = total)':'Monto aplicado'}<div className="money-input"><span>$</span><input type="number" min={0.01} max={payment.method==='Efectivo'?undefined:activeTotal||undefined} step={0.01} value={payment.amount} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,amount:event.target.value}:row))} placeholder={payments.length===1?'Total de la venta':'0,00'}/></div></label>
                <button className="icon-button danger" type="button" aria-label="Quitar forma de pago" title={payments.length===1?'Debe quedar al menos un método de pago':'Quitar forma de pago'} disabled={payments.length===1} onClick={()=>setPayments(current=>current.length>1?current.filter(row=>row.id!==payment.id):current)}><X size={14}/></button>
                {payment.method==='Efectivo'&&activeTotal>0&&<div className="pos-cash-denominations" role="group" aria-label="Billetes rápidos en efectivo">
                  <button type="button" className={`pos-denomination-pill${Number(payment.amount)===remainingForRow||payment.amount===''?' is-active':''}`} onClick={()=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,amount:remainingForRow.toFixed(2)}:row))}>Exacto ({formatMoney(remainingForRow)})</button>
                  {quickCashDenominations.map((bill)=><button key={bill} type="button" className={`pos-denomination-pill${Number(payment.amount)===bill?' is-active':''}`} onClick={()=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,amount:String(bill)}:row))}>${bill}</button>)}
                </div>}
                {payment.method!=='Efectivo'&&payments.length>1&&remainingForRow>0&&<div className="pos-cash-denominations">
                  <button type="button" className="pos-denomination-pill" onClick={()=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,amount:remainingForRow.toFixed(2)}:row))}>Completar saldo ({formatMoney(remainingForRow)})</button>
                </div>}
                {(payment.method==='Transferencia'||payment.method==='Tarjeta')&&<label className="pos-payment-reference">Referencia (opcional)<input value={payment.reference||''} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,reference:event.target.value}:row))} placeholder="Código comprobante o últimos dígitos"/></label>}
                <label className="pos-payment-reference">Nota del pago (opcional)<input value={payment.note||''} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,note:event.target.value}:row))} placeholder={idx===0?'Detalle para identificar este pago':'Detalle del segundo pago'}/></label>
              </div>;
            })}</div>
            <button type="button" className="button button-outline pos-add-payment" onClick={()=>setPayments(current=>{
              const currentAssigned=current.reduce((s,r)=>s+(Number(r.amount)||(current.length===1&&r.amount===''?activeTotal:0)),0);
              const rem=Math.max(0,roundMoney(activeTotal-currentAssigned));
              return [...current,{id:globalThis.crypto?.randomUUID?.()||`payment-${Date.now()}-${current.length}`,method:'Transferencia',amount:rem>0?rem.toFixed(2):'',reference:'',note:''}];
            })}><Plus size={14}/> Dividir pago / Agregar otro método</button>
            <div className="pos-payment-balance">
              <span>Recibido: <b>{formatMoney(paymentBreakdown.received)}</b></span>
              <span>Aplicado: <b>{formatMoney(paymentBreakdown.applied)}</b></span>
              {paymentBreakdown.change>0&&<span className="pos-change-due">Vuelto a entregar: <b>{formatMoney(paymentBreakdown.change)}</b></span>}
              <span className={paymentBreakdown.balance>0?'pos-balance-pending':''}>Saldo pendiente: <b>{formatMoney(paymentBreakdown.balance)}</b></span>
            </div>
            {paymentBreakdown.nonCashOverpayment>0&&<p className="pos-checkout-guidance" role="alert">Los pagos con tarjeta o transferencia superan el total. Ajusta esos importes; el vuelto se calcula para efectivo.</p>}{paymentBreakdown.cashWithoutBalance&&<p className="pos-checkout-guidance" role="alert">Tarjeta o transferencia ya cubren el total. Quita el efectivo adicional.</p>}
            {cashShiftUnavailable&&<div className="pos-checkout-guidance" role="status"><CircleHelp size={15}/><span>{cashierSession.error?'No se pudo verificar tu turno. Vuelve a cargar la página o revisa la sucursal.':'Para recibir efectivo, primero abre tu turno de caja.'}</span>{!cashierSession.error&&<div className="pos-guidance-actions"><button type="button" className="button button-outline" onClick={()=>{setShowQuickCashOpen(true);window.scrollTo({top:0,behavior:'smooth'});}}>Abrir turno aquí</button><Link to="/operaciones/flujos?tab=cash">Ir a Flujos</Link></div>}</div>}
          </>:<p className="pos-credit-note">La orden se registrará como crédito / cuenta por cobrar con saldo pendiente ({formatMoney(activeTotal)}) y sin pagos iniciales.</p>}
        </section>
        {activeParkedOrderId&&<div className="pos-parked-active"><span>ORDEN RECUPERADA</span><b>Se conserva en espera hasta confirmar la venta.</b></div>}
        <div className="pos-submit-actions">
          <button className="button button-outline" type="button" disabled={parking||pendingSaleRecoveryMode||Boolean(activeParkedOrderId)||(!form.quoteId&&!cart.length)||(!form.quoteId&&taxConfigurationStatus!=='ready')} onClick={parkCurrentOrder}>{activeParkedOrderId?'Ya está en espera':parking?'Guardando…':'Guardar en espera'} <ClipboardList size={15}/></button>
          {checkoutStep==='order'?<button className="button button-dark" type="button" onClick={advanceFromOrder}>{requiresWorkDetails?'Ir a detalles':'Revisar y cobrar'} <ChevronRight size={15}/></button>:checkoutStep==='details'?<button className="button button-dark" type="button" onClick={continueToPayment}>Revisar y cobrar <ChevronRight size={15}/></button>:<button className="button button-dark form-submit" type="submit" disabled={!canSubmitSale}>{savingSale?'Guardando venta…':'Confirmar orden'} <Check size={16}/></button>}
        </div>
        {submitBlockReason&&<p className="pos-submit-guidance" role="status">{submitBlockReason}</p>}
        </aside>
      </form>
      <section className="panel pos-parked-panel"><div className="panel-heading"><div><span className="eyebrow">ÓRDENES RECUPERABLES</span><h2>En espera</h2></div><span className="muted-count">{parkedOrders.length} órdenes</span></div>{parkedOrders.length===0?<EmptyState icon={ClipboardList} title="No hay órdenes en espera" text="Guarda aquí un carrito o cotización para continuarla desde esta sucursal. No reserva stock."/>:<div className="activity-list">{parkedOrders.map(order=>{const payload=order.payload||{};const customerName=payload.form?.customer||payload.form?.quoteId&&centralQuotes.find(quote=>quote.id===payload.form.quoteId)?.customer_name||'Sin cliente';return <article className="sale-activity pos-parked-card" key={order.id}><div className="sale-row"><span className="sale-icon"><ClipboardList size={17}/></span><span><b>{customerName}</b><small>{branchNames[order.branch_id]||'Sucursal'} · {new Date(order.created_at).toLocaleString('es-EC',{dateStyle:'short',timeStyle:'short'})}</small></span><strong>{formatMoney(order.total)}</strong></div><div className="sale-payment-summary"><span>{payload.cart?.length|| (payload.form?.quoteId?'Cotización aprobada':'')} artículo(s)</span><span>Guardada por <b>{order.created_by===user?.id?'ti':'el equipo'}</b></span></div><button className="button button-outline" type="button" onClick={()=>resumeParkedOrder(order)}>Recuperar orden</button></article>;})}</div>}</section>
      <section className="panel pos-recent-panel"><div className="panel-heading"><div><span className="eyebrow">CAJA DEL DÍA · {branchName}</span><h2>Ventas confirmadas</h2></div><span className="muted-count">{posSalesStatus==='ready'?`${salesToday.length} registros`:posSalesStatus==='loading'?'Consultando…':posSalesStatus==='restricted'?'Acceso limitado':'Error de consulta'}</span></div>
        {posSalesStatus==='ready'&&salesToday.length>0&&<div className="pos-recent-toolbar">
          <div className="search-input pos-recent-search"><Search size={14}/><input type="search" value={recentSalesQuery} onChange={(e)=>setRecentSalesQuery(e.target.value)} placeholder="Buscar cliente, código VEN o producto…" aria-label="Buscar en ventas de hoy"/></div>
          <div className="pos-recent-filter-pills" role="group" aria-label="Filtrar ventas de hoy">
            <button type="button" className={recentSalesFilter==='all'?'is-active':''} onClick={()=>setRecentSalesFilter('all')}>Todas ({salesToday.length})</button>
            <button type="button" className={recentSalesFilter==='balance'?'is-active':''} onClick={()=>setRecentSalesFilter('balance')}>Con saldo ({salesToday.filter((s:any)=>Number(s.balance)>0).length})</button>
            <button type="button" className={recentSalesFilter==='paid'?'is-active':''} onClick={()=>setRecentSalesFilter('paid')}>Pagadas ({salesToday.filter((s:any)=>!(Number(s.balance)>0)).length})</button>
          </div>
        </div>}
        {posSalesStatus==='loading'?<div className="pos-sales-state" role="status">Consultando las ventas de hoy para {branchName}…</div>:posSalesStatus==='restricted'?<div className="pos-sales-state">Tu perfil no tiene permiso para consultar ventas.</div>:posSalesStatus==='error'?<div className="pos-sales-state" role="alert"><span>No se pudieron cargar las ventas de esta sucursal.</span><button className="button button-outline" type="button" onClick={()=>void refreshPOSDaySales()}>Reintentar</button></div>:salesToday.length===0?<EmptyState icon={Wallet} title="Todavía no hay ventas" text={`Las ventas confirmadas de hoy en ${branchName} aparecerán aquí.`}/>:filteredRecentSales.length===0?<div className="pos-sales-state"><span>No hay ventas que coincidan con el filtro actual.</span><button className="button button-outline" type="button" onClick={()=>{setRecentSalesQuery('');setRecentSalesFilter('all');}}>Ver todas</button></div>:<div className="activity-list">{filteredRecentSales.map((sale)=><article className="sale-activity" key={sale.id}><div className="sale-row"><span className="sale-icon"><ShoppingCart size={17}/></span><span><b>{sale.customer||sale.description||'Venta'}</b><small>{sale.method} · {new Date(sale.date).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})} · {sale.code}</small></span><strong>{formatMoney(sale.total)}</strong></div><div className="sale-payment-summary"><span>Abonado: <b>{formatMoney(sale.paid||0)}</b></span><span className={Number(sale.balance)>0?'pos-sale-balance-tag is-due':'pos-sale-balance-tag is-paid'}>Saldo: <b>{formatMoney(sale.balance||0)}</b></span>{sale.urgent&&<span className="inventory-status pending">Compra urgente pendiente</span>}</div><div className="pos-sale-card-actions"><button className="button button-outline pos-sale-detail-trigger" type="button" onClick={()=>setDetailTarget({kind:'sale',id:sale.id,code:sale.code})}>Ver ficha completa</button><button className="button button-outline pos-sale-detail-trigger pos-sale-edit-btn" type="button" onClick={()=>setEditingSaleId(sale.id)}><Pencil size={13}/> Editar venta</button>{Number(sale.balance)>0&&<button className="button button-outline pos-sale-detail-trigger" type="button" onClick={()=>{setPaymentTarget(paymentTarget===sale.id?null:sale.id);setPaymentForm({amount:String(sale.balance),method:'Efectivo',reference:'',note:''});}}>Registrar abono</button>}</div>{Number(sale.balance)>0&&paymentTarget===sale.id&&<form className="payment-form" onSubmit={(event)=>registerBalancePayment(event,sale)}>
          <label>{paymentForm.method==='Efectivo'?'Monto recibido':'Monto aplicado'}<input type="number" min={0.01} max={paymentForm.method==='Efectivo'?undefined:sale.balance} step={0.01} required value={paymentForm.amount} onChange={(event)=>setPaymentForm({...paymentForm,amount:event.target.value})}/></label>
          {paymentForm.method==='Efectivo'&&<small className="pos-balance-change-preview">Se aplicará {formatMoney(Math.min(Number(paymentForm.amount)||0,Number(sale.balance)))} · Vuelto {formatMoney(Math.max(0,(Number(paymentForm.amount)||0)-Number(sale.balance)))}</small>}
          <label>Forma de pago<select value={paymentForm.method} onChange={(event)=>setPaymentForm({...paymentForm,method:event.target.value})}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select></label>
          {(paymentForm.method==='Transferencia'||paymentForm.method==='Tarjeta')&&<label>Referencia (opcional)<input value={paymentForm.reference} onChange={(event)=>setPaymentForm({...paymentForm,reference:event.target.value})} placeholder="Código o últimos dígitos"/></label>}
          <label>Nota (opcional)<input value={paymentForm.note} onChange={(event)=>setPaymentForm({...paymentForm,note:event.target.value})} placeholder="Detalle del abono"/></label>
          <button className="button button-dark" type="submit" disabled={savingBalancePayment===sale.id}>{savingBalancePayment===sale.id?'Guardando…':'Guardar abono'}</button>
        </form>}</article>)}</div>}
      </section>
    </div><div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Antes de confirmar</b><p>Los vínculos conectan productos con variantes de inventario; la disponibilidad depende de un conteo físico registrado por sucursal. Si falta el conteo o la existencia no alcanza, el POS lo muestra como pendiente y permite marcar la compra urgente al confirmar. Las órdenes en espera no reservan existencias y esta pantalla no emite comprobantes tributarios.</p></div></div>
    <Sheet open={Boolean(detailTarget)} onOpenChange={(open)=>{if(!open)setDetailTarget(null);}} title={detailTarget ? `Ficha completa · ${detailTarget.code}` : 'Ficha completa'} description="Productos, imágenes, valores y pagos registrados en esta compra.">{detailTarget&&<CommercialDocumentDetails kind="sale" documentId={detailTarget.id}/>}</Sheet>
    <POSSaleEditorModal open={Boolean(editingSaleId)} saleId={editingSaleId} organizationId={organizationId} branchName={branchName} onSaved={()=>{void refreshPOSDaySales();void refreshRemote();flash('Venta modificada exitosamente.');}} onClose={()=>setEditingSaleId(null)}/>
  </AppFrame>;
}


