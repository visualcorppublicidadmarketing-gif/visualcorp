import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Boxes, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, ClipboardList, Database, FileText, Globe2, History, Image, LayoutDashboard, LogOut, Megaphone, Menu, Package, Pencil, Plus, Search, Settings2, ShoppingBag, ShoppingCart, Truck, Users, Wallet, X } from 'lucide-react';
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
import { Sheet } from '../../components/ui/OperationalKit';
import { CommercialAssetsEditor } from '../../components/commercial/CommercialAssetsEditor';
import { CommercialAssetsGallery } from '../../components/commercial/CommercialAssetsGallery';
import { GoogleMapsPreview } from '../../components/commercial/GoogleMapsPreview';
import { RichTextEditor } from '../../components/studio/RichTextEditor';
import { persistCommercialAssets, type CommercialAssetDraft } from '../../lib/commercialAssets';
import { POSCustomerPicker } from './components/POSCustomerPicker';
import { getProductionDetails, isProductionWorkflowCode, POSProductionDetails, type ProductionDetailsValue, type ProductionLine, type ProductionWorkflowCode } from './POSProductionDetails';
import './pos-fulfillment.css';
import './checkout-workspace.css';

const trackedAccessoryProductIds = new Set(['prod-extras-ojal-peque-o-c-u','prod-extras-ojales-grande-c-u']);
const normalizeCustomerPhone = (value) => { const digits=String(value||'').replace(/\D/g,'');return digits.startsWith('593')&&digits.length===12?`0${digits.slice(3)}`:digits; };
const normalizeSearchText = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const sanitizePOSCart = (lines: unknown) => Array.isArray(lines)?lines.slice(0,100).filter((line)=>line&&typeof line.name==='string'&&Number.isFinite(Number(line.quantity))&&Number(line.quantity)>0&&Number.isFinite(Number(line.unitPrice))&&Number(line.unitPrice)>0).map((line,index)=>({key:String(line.key||`restored-${line.productId||'custom'}-${index}`),productId:String(line.productId||''),name:String(line.name),family:String(line.family||''),image:String(line.image||''),mode:line.mode==='area'?'area':'quantity',quantity:Number(line.quantity),billingQuantity:Number(line.billingQuantity)||Number(line.quantity),unit:String(line.unit||'unidad'),unitPrice:Number(line.unitPrice),total:Number(line.total)||Number(line.quantity)*Number(line.unitPrice),widthCm:line.widthCm??null,heightCm:line.heightCm??null,areaPerPiece:line.areaPerPiece??null,areaTotal:line.areaTotal??null,pricingTier:line.pricingTier||'pvp',pricingTierLabel:String(line.pricingTierLabel||'Normal'),optionChoice:String(line.optionChoice||''),description:String(line.description||line.name)})):[];
const sanitizePOSPayments = (rows: unknown) => {
  const validMethods = new Set(['Efectivo','Transferencia','Tarjeta','Otro']);
  if (!Array.isArray(rows)) return [{id:'payment-1',method:'Efectivo',amount:'',reference:'',note:''}];
  const sanitized = rows.slice(0,4).filter((row)=>row&&typeof row==='object').map((row,index)=>({id:String(row.id||`payment-${index+1}`),method:validMethods.has(String(row.method))?String(row.method):'Efectivo',amount:String(row.amount??''),reference:String(row.reference||''),note:String(row.note||'')}));
  return sanitized.length?sanitized:[{id:'payment-1',method:'Efectivo',amount:'',reference:'',note:''}];
};
const sanitizePOSSaleLines = (lines: unknown) => Array.isArray(lines)?lines.slice(0,100).filter((line)=>line&&typeof line==='object'&&Number.isFinite(Number(line.quantity))&&Number(line.quantity)>0&&Number.isFinite(Number(line.unit_price))&&Number(line.unit_price)>=0).map((line,index)=>({line_key:String(line.line_key||`legacy-${index}`),catalog_product_id:line.catalog_product_id||null,sku:String(line.sku||''),description:String(line.description||'Artículo cotizado'),quantity:Number(line.quantity),unit_price:Number(line.unit_price)})):[];
const getPOSQuoteSaleLines = (quote: any) => Array.isArray(quote?.items)?quote.items.map((item,index)=>({line_key:`quote-${quote.id}-${index}`,catalog_product_id:item.product_id||null,sku:item.sku||item.product_id||'',description:[item.name||item.product_name||'Artículo cotizado',item.width_cm&&item.height_cm?`${item.width_cm} × ${item.height_cm} cm`:null,item.unit||null].filter(Boolean).join(' · '),quantity:Number(item.quantity),unit_price:Number(item.total)/Number(item.quantity),widthCm:item.width_cm||null,heightCm:item.height_cm||null,optionChoice:item.option_choice||''})):[];
const sanitizeProductionDetails = (value: unknown): Record<string, ProductionDetailsValue> => {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).slice(0,100).filter(([key,entry])=>key.length<=150&&entry&&typeof entry==='object').map(([key,entry]:[string,any])=>[key,{workflow_code:isProductionWorkflowCode(entry.workflow_code)?entry.workflow_code:'review',specifications:entry.specifications&&typeof entry.specifications==='object'&&!Array.isArray(entry.specifications)?entry.specifications:{}}]));
};
const posSaleLinesSignature = (lines: unknown) => JSON.stringify(sanitizePOSSaleLines(lines));
const pendingSaleSignature = (snapshot: any) => JSON.stringify({
  form: {
    total:String(snapshot?.form?.total||''),amountPaid:String(snapshot?.form?.amountPaid||''),method:String(snapshot?.form?.method||''),customer:String(snapshot?.form?.customer||''),customerId:String(snapshot?.form?.customerId||''),customerPhone:String(snapshot?.form?.customerPhone||''),customerEmail:String(snapshot?.form?.customerEmail||''),customerDocumentReference:String(snapshot?.form?.customerDocumentReference||''),description:String(snapshot?.form?.description||''),productId:String(snapshot?.form?.productId||''),branchCode:String(snapshot?.form?.branchCode||''),quantity:String(snapshot?.form?.quantity||''),quoteId:String(snapshot?.form?.quoteId||''),
  },
  cart:sanitizePOSCart(snapshot?.cart).map(({key:_key,...line})=>line),saleLines:sanitizePOSSaleLines(snapshot?.saleLines),saleNote:String(snapshot?.saleNote||''),
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

function POSCartLineEditor({ line, product, inventoryStatus, onRemove, onSave }: { line: any; product: any; inventoryStatus: string; onRemove: () => void; onSave: (nextLine: any) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ quantity: String(line.quantity), widthCm: String(line.widthCm || ''), heightCm: String(line.heightCm || ''), unitPrice: String(line.unitPrice) });

  useEffect(() => {
    setDraft({ quantity: String(line.quantity), widthCm: String(line.widthCm || ''), heightCm: String(line.heightCm || ''), unitPrice: String(line.unitPrice) });
  }, [line.key, line.quantity, line.widthCm, line.heightCm, line.unitPrice]);

  const save = () => {
    const quantity = Number(draft.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) return;
    if (line.productId) {
      if (!product) return;
      const widthCm = Number(draft.widthCm);
      const heightCm = Number(draft.heightCm);
      if (line.mode === 'area' && (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0)) return;
      const calculation = calculatePOSLine({ product, mode: line.mode, quantity, widthCm, heightCm, tier: line.pricingTier || 'pvp', optionChoice: line.optionChoice || '' });
      if (!calculation) return;
      const nextLine = {
        ...line,
        quantity,
        billingQuantity: calculation.billedQuantity,
        unitPrice: calculation.unitPrice,
        total: calculation.total,
        widthCm: line.mode === 'area' ? widthCm : null,
        heightCm: line.mode === 'area' ? heightCm : null,
        areaPerPiece: calculation.areaPerPiece || null,
        areaTotal: calculation.areaTotal || null,
        description: formatPOSLineDescription({ name: line.name, mode: line.mode, quantity, unit: calculation.unit, unitPrice: calculation.unitPrice, pricingTierLabel: line.pricingTierLabel || 'Normal', widthCm: line.mode === 'area' ? widthCm : undefined, heightCm: line.mode === 'area' ? heightCm : undefined, areaPerPiece: calculation.areaPerPiece || undefined, areaTotal: calculation.areaTotal || undefined, optionChoice: line.optionChoice || undefined }),
      };
      onSave(nextLine);
    } else {
      const unitPrice = Number(draft.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
      onSave({ ...line, quantity, billingQuantity: quantity, unitPrice, total: Math.round(quantity * unitPrice * 100) / 100, description: `${line.name} · ${quantity} unidades · precio acordado` });
    }
    setEditing(false);
  };

  return <article className="pos-cart-line-wrap">
    <div className="pos-cart-line"><POSProductVisual src={line.image} className="pos-cart-image" iconSize={16}/><span className="pos-line-main"><b>{line.name}</b><small>{line.description||`${line.quantity} × ${formatMoney(line.unitPrice)}`}</small><small>{inventoryStatus}</small></span><strong>{formatMoney(line.total||line.quantity*line.unitPrice)}</strong><button className="icon-button danger" type="button" aria-label={`Quitar ${line.name}`} onClick={onRemove}><X size={15}/></button></div>
    <button type="button" className="pos-line-edit-toggle" aria-expanded={editing} onClick={() => setEditing((value) => !value)}><Pencil size={13}/>{editing ? 'Cerrar edición' : 'Editar cantidad y medidas'}</button>
    {editing && <div className="pos-line-editor">
      <label>Cantidad<input type="number" min="1" step="1" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}/></label>
      {line.mode === 'area' && <><label>Ancho (cm)<input type="number" min="0.01" step="0.01" value={draft.widthCm} onChange={(event) => setDraft((current) => ({ ...current, widthCm: event.target.value }))}/></label><label>Alto (cm)<input type="number" min="0.01" step="0.01" value={draft.heightCm} onChange={(event) => setDraft((current) => ({ ...current, heightCm: event.target.value }))}/></label></>}
      {!line.productId && <label>Precio por unidad<div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={draft.unitPrice} onChange={(event) => setDraft((current) => ({ ...current, unitPrice: event.target.value }))}/></div></label>}
      <button type="button" className="button button-outline" onClick={save}>Guardar cambios</button>
    </div>}
  </article>;
}

export function PosPage() {
  const { data, add, update, flash, refreshRemote }=useWorkspace();
  const { organizationId, user, hasPermission }=useAuth();
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
  const [centralQuotes,setCentralQuotes]=useState([]);
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
  const posDraftStorageKey=`visualcorp-pos-cart-draft-v1:${organizationId||'sin-organizacion'}:${user?.id||'sin-usuario'}`;
  const pendingSaleStorageKey=`visualcorp-pos-pending-sale-key:${organizationId||'sin-organizacion'}:${user?.id||'sin-usuario'}`;
  const pendingSaleSnapshotStorageKey=`${pendingSaleStorageKey}:snapshot`;
  const [draftLoadedKey,setDraftLoadedKey]=useState('');
  const pendingSaleKey=useRef('');
  const pendingSaleSnapshotRef=useRef<any>(null);
  const pendingSaleSnapshot={form,cart,fulfillment,mapLink,payments,chargeNow,activeParkedOrderId,allowBackorder:pendingSaleSnapshotRef.current?.allowBackorder,saleLines:pendingSaleSnapshotRef.current?.saleLines,saleNote:pendingSaleSnapshotRef.current?.saleNote,productionByLine,clientBriefHtml};
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
      const restoredSnapshot={form:restoredForm,cart:restoredCart,fulfillment:snapshot.fulfillment,mapLink:snapshot.mapLink,payments:restoredPayments,chargeNow:snapshot.chargeNow,activeParkedOrderId:snapshot.activeParkedOrderId,allowBackorder:snapshot.allowBackorder,saleLines:Array.isArray(snapshot.saleLines)?sanitizePOSSaleLines(snapshot.saleLines):undefined,saleNote:String(snapshot.saleNote||''),productionByLine:restoredProductionByLine,productionJobs:Array.isArray(snapshot.productionJobs)?snapshot.productionJobs:undefined,clientBriefHtml:String(snapshot.clientBriefHtml||'<p></p>')};
      pendingSaleSnapshotRef.current=restoredSnapshot;setPendingSaleRecoveryMode(true);
      setForm((current)=>({...current,...restoredForm}));
      setCart(restoredCart);setProductionByLine(restoredProductionByLine);setFulfillment(snapshot.fulfillment||{installationRequired:false,installationAddress:'',latitude:'',longitude:'',installationAt:'',deliveryAt:''});setMapLink(String(snapshot.mapLink||''));setClientBriefHtml(String(snapshot.clientBriefHtml||'<p></p>'));
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
    setCart([]);setProductionByLine({});
    try{
      const raw=sessionStorage.getItem(posDraftStorageKey);
      if(raw){
        const saved=JSON.parse(raw);
        const age=Date.now()-Number(saved.savedAt||0);
        if(age>=0&&age<24*60*60*1000&&Array.isArray(saved.cart)){
          const restored=sanitizePOSCart(saved.cart);
          if(restored.length){setCart(restored);setProductionByLine(sanitizeProductionDetails(saved.productionByLine));flash('Recuperé el carrito de esta sesión. Revisa sucursal, artículos y precios antes de cobrar.');}
          if(typeof saved.branchCode==='string'&&saved.branchCode)setForm((current)=>({...current,branchCode:saved.branchCode}));
        }else sessionStorage.removeItem(posDraftStorageKey);
      }
    }catch{sessionStorage.removeItem(posDraftStorageKey);}
    setDraftLoadedKey(posDraftStorageKey);
  },[organizationId,user?.id,posDraftStorageKey,pendingSaleSnapshotStorageKey]);
  useEffect(()=>{
    if(!organizationId||!user||draftLoadedKey!==posDraftStorageKey)return;
    if(cart.length)sessionStorage.setItem(posDraftStorageKey,JSON.stringify({version:1,savedAt:Date.now(),branchCode:form.branchCode,cart,productionByLine}));
    else sessionStorage.removeItem(posDraftStorageKey);
  },[organizationId,user?.id,draftLoadedKey,posDraftStorageKey,cart,form.branchCode,productionByLine]);
  useEffect(()=>{
    if(!data.branches.length)return;
    if(data.branches.some((branch)=>branch.code===form.branchCode))return;
    setForm((current)=>data.branches.some((branch)=>branch.code===current.branchCode)?current:{...current,branchCode:data.branches[0].code});
  },[data.branches,form.branchCode]);
  const resetCheckout=()=>{
    setForm((current)=>({total:'',amountPaid:'',method:'Efectivo',customer:'',customerId:'',customerPhone:'',customerEmail:'',customerDocumentReference:'',description:'',productId:'',branchCode:current.branchCode,quantity:'1',quoteId:''}));
    setCustomerQuery('');setSelectedCustomerSnapshot(null);setCart([]);setProductionByLine({});setActiveParkedOrderId('');setChargeNow(true);setPayments([{id:'payment-1',method:'Efectivo',amount:'',reference:'',note:''}]);
    setCartProductId('');setCartItemName('');setCartQuantity('1');setCartUnitPrice('');setCartWidthCm('100');setCartHeightCm('100');setCartPriceTier('pvp');setCartOptionChoice('');
    setFulfillment({installationRequired:false,installationAddress:'',latitude:'',longitude:'',installationAt:'',deliveryAt:''});setMapLink('');setClientBriefHtml('<p></p>');saleAssets.forEach(asset=>asset.previewUrl&&URL.revokeObjectURL(asset.previewUrl));setSaleAssets([]);setMobileSummaryOpen(false);setPaymentTarget(null);
  };
  useEffect(()=>{if(!supabase||!organizationId){setCatalogLinkStatus('error');return;}let active=true;setCatalogLinkStatus('checking');Promise.all([supabase.from('catalog_inventory_links').select('catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id',organizationId).eq('active',true),supabase.from('central_quotes').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(100)]).then(([links,quotes])=>{if(!active)return;if(links.error){setCatalogLinkStatus('error');flash(`No se pudieron verificar los vínculos de stock: ${links.error.message}`);}else{setCatalogLinks(links.data||[]);setCatalogLinkStatus('ready');}if(quotes.error)flash(`No se pudieron cargar cotizaciones centrales: ${quotes.error.message}`);else setCentralQuotes(quotes.data||[]);});return()=>{active=false;};},[organizationId]);
  useEffect(()=>{let active=true;const load=async()=>{if(!supabase||!organizationId||!user){setCashierSession({loading:false,session:null,branch:null,error:''});return;}setCashierSession(current=>({...current,loading:true,error:''}));try{const {data:branch,error:branchError}=await supabase.from('branches').select('id,code,name').eq('organization_id',organizationId).eq('code',form.branchCode).maybeSingle();if(branchError)throw branchError;if(!branch?.id){if(active)setCashierSession({loading:false,session:null,branch:null,error:''});return;}const {data:session,error:sessionError}=await supabase.from('cash_sessions').select('id,opened_at,opening_cash,status').eq('organization_id',organizationId).eq('branch_id',branch.id).eq('opened_by',user.id).eq('status','open').maybeSingle();if(sessionError)throw sessionError;if(active)setCashierSession({loading:false,session,branch,error:''});}catch(error){if(active)setCashierSession({loading:false,session:null,branch:null,error:error.message||'Error desconocido'});}};load();return()=>{active=false;};},[organizationId,user?.id,form.branchCode]);
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
  const cartTotal=Math.round(cart.reduce((sum,line)=>sum+(Number(line.total)||Number(line.quantity)*Number(line.unitPrice)),0)*100)/100;
  const activeTotal=form.quoteId?Number(form.total)||0:cartTotal;
  const paymentBreakdown=calculatePOSPaymentBreakdown(activeTotal,payments);
  const paymentPreview=paymentBreakdown.applied;
  const selectedCartProduct=data.catalog.find((product)=>product.id===cartProductId);
  const modeCatalog=data.catalog.filter(product=>(product.mode==='area'?'area':'quantity')===cartMode);
  const cartFamilies=[...new Set<string>(modeCatalog.map(product=>String(product.family||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const selectedBranchId=cashierSession.branch?.code===form.branchCode?cashierSession.branch.id:data.branches.find((branch)=>branch.code===form.branchCode)?.id||'';
  const canViewPOSSales=hasPermission('sales','view');
  const canManageBackorders=hasPermission('purchases','edit');
  const hasPendingBackorderAuthorization=Boolean(pendingSaleRecoveryMode&&pendingSaleSnapshotRef.current?.allowBackorder===true);
  const quotePreview=centralQuotes.find((quote)=>quote.id===form.quoteId);
  const currentQuoteLines=getPOSQuoteSaleLines(quotePreview);
  const productionLines:ProductionLine[]=form.quoteId?currentQuoteLines.map((line)=>({line_key:line.line_key,name:line.description,productId:line.catalog_product_id,widthCm:line.widthCm,heightCm:line.heightCm,optionChoice:line.optionChoice})):cart.map((line)=>({line_key:line.key,name:line.name,productId:line.productId,widthCm:line.widthCm,heightCm:line.heightCm,optionChoice:line.optionChoice}));
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
  const skuCodesByProduct=catalogLinks.filter(link=>link.active&&link.branch_id===selectedBranchId).reduce((codes,link)=>{const linkedStock=data.inventory.find(row=>row.variantId===link.inventory_variant_id&&row.branchId===link.branch_id);const values=[linkedStock?.sku,linkedStock?.variantSku].filter(Boolean);if(values.length)codes[link.catalog_product_id]=[...new Set([...(codes[link.catalog_product_id]||[]),...values])];return codes;},{});
  const normalizedCartSearch=normalizeSearchText(cartSearch.trim());
  const matchingCartProducts=modeCatalog.filter(product=>(cartFamily==='Todas'||product.family===cartFamily)&&normalizeSearchText(`${product.name} ${product.sku||product.id} ${product.family} ${(skuCodesByProduct[product.id]||[]).join(' ')}`).includes(normalizedCartSearch));
  const visibleCartProducts=matchingCartProducts;
  const needsCashShift=chargeNow&&payments.some(payment=>payment.method==='Efectivo');
  const cashShiftPending=needsCashShift&&!pendingSaleRecoveryMode&&cashierSession.loading;
  const cashShiftUnavailable=needsCashShift&&!pendingSaleRecoveryMode&&!cashierSession.loading&&!cashierSession.session;
  const missingCartAccessoryLink=cart.some(line=>trackedAccessoryProductIds.has(line.productId)&&!catalogLinks.some(link=>link.active&&link.branch_id===selectedBranchId&&link.catalog_product_id===line.productId));
  const canSubmitSale=Boolean(supabase&&user&&organizationId&&selectedBranchId&&catalogLinkStatus==='ready'&&workflowRouteStatus==='ready'&&!missingCartAccessoryLink&&!backorderPermissionMissing&&!pendingSaleRecoveryError&&!pendingOperationChanged&&!duplicateCustomer&&!customerLookupPending&&!customerLookupFailed&&!customerNameMissing&&activeTotal>0&&(form.quoteId||cart.length>0)&&!savingSale&&!cashShiftPending&&!cashShiftUnavailable);
  const submitBlockReason=pendingSaleRecoveryError||(pendingOperationChanged?'Los datos de la operación o de la cotización cambiaron mientras la venta estaba pendiente. Recarga para restaurar la versión original antes de reintentar.':savingSale?'Guardando la venta…':!selectedBranchId?'Cargando la sucursal seleccionada…':catalogLinkStatus==='checking'?'Comprobando los vínculos de inventario…':catalogLinkStatus==='error'?'No se pudieron consultar los vínculos de inventario. Recarga antes de confirmar.':missingCartAccessoryLink?'Vincula los ojales con su variante de inventario antes de confirmar esta venta.':backorderPermissionMissing?'Hay artículos sin conteo o con existencias insuficientes. Se requiere permiso de edición de compras para confirmar una compra urgente.':duplicateCustomer?`Ya existe ${duplicateCustomer.name} con ese teléfono, correo o identificación. Selecciónalo para evitar crear un duplicado.`:customerLookupFailed?'No se pudo verificar si el cliente ya existe. Reintenta la búsqueda antes de confirmar.':customerLookupPending?'Buscando coincidencias del cliente…':customerNameMissing?'Completa el nombre del cliente o limpia la búsqueda si será una venta de mostrador.':cashShiftPending?'Verificando el turno de caja…':cashShiftUnavailable?'Abre un turno de caja para registrar pagos en efectivo.':!form.quoteId&&!cart.length?'Agrega al menos un artículo al carrito para habilitar la venta.':activeTotal<=0?'La orden necesita un total mayor que cero.':!supabase||!user||!organizationId?'No se pudo validar la sesión para guardar la venta.':'');
  const cartQuantityNumber=Number(cartQuantity);
  const cartWidthNumber=Number(cartWidthCm);
  const cartHeightNumber=Number(cartHeightCm);
  const cartAreaPerPiece=cartMode==='area'&&cartWidthNumber>0&&cartHeightNumber>0?Math.round((cartWidthNumber*cartHeightNumber/10000)*10000)/10000:0;
  const cartPricingBasis=selectedCartProduct?getQuoteBasis(selectedCartProduct,{quantity:cartQuantityNumber,area:cartAreaPerPiece}):0;
  const cartCalculation=selectedCartProduct?calculatePOSLine({product:selectedCartProduct,mode:cartMode,quantity:cartQuantityNumber,widthCm:cartWidthNumber,heightCm:cartHeightNumber,tier:cartPriceTier,optionChoice:cartOptionChoice}):null;
  const cartPriceAvailable=Boolean((selectedCartProduct?.confirmed||selectedCartProduct?.published===true)&&cartCalculation);
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
  const chooseCartProduct=(product)=>{
    setCartMode(product.mode==='area'?'area':'quantity');setCartFamily(product.family||'Todas');setCartProductId(product.id);setCartItemName('');setCartUnitPrice('');setCartPriceTier('pvp');setCartOptionChoice('');setCartSearch('');
  };
  const handleCartScan=(event)=>{
    if(event.key!=='Enter')return;
    event.preventDefault();
    const scannedCode=cartSearch.trim().toLocaleUpperCase('es');
    if(!scannedCode)return;
    const catalogProduct=data.catalog.find(product=>String(product.sku||'').trim().toLocaleUpperCase('es')===scannedCode);
    if(catalogProduct){chooseCartProduct(catalogProduct);flash(`Código ${scannedCode} reconocido: ${catalogProduct.name}. Revisa cantidad, medidas y tarifa.`);return;}
    const stock=data.inventory.find(row=>row.branchId===selectedBranchId&&!row.archived&&[row.sku,row.variantSku].some(code=>String(code||'').trim().toLocaleUpperCase('es')===scannedCode));
    if(!stock){flash(`No encontramos el código ${scannedCode} en el catálogo ni en el inventario de ${branchName}.`);return;}
    const link=catalogLinks.find(item=>item.active&&item.branch_id===stock.branchId&&item.inventory_variant_id===stock.variantId);
    const product=link&&data.catalog.find(item=>item.id===link.catalog_product_id);
    if(!product){flash(`El SKU ${scannedCode} existe, pero todavía no está vinculado a un producto vendible.`);return;}
    chooseCartProduct(product);
    flash(`Artículo reconocido: ${product.name}. Revisa cantidad, medidas y tarifa del catálogo.`);
  };
  const updateCustomerQuery=(value)=>{const trimmed=value.trim();const identityOnly=/^[\d\s+().-]+$/.test(trimmed)||trimmed.includes('@');setSelectedCustomerSnapshot(null);setCustomerSearchLimit(8);setCustomerQuery(value);setForm((current)=>({...current,customerId:'',customer:identityOnly?'':value,customerPhone:'',customerEmail:'',customerDocumentReference:''}));};
  const choosePOSCustomer=(customer)=>{setSelectedCustomerSnapshot(customer||null);setForm((current)=>({...current,customerId:customer?.id||'',customer:customer?.name||'',customerPhone:customer?.phone||'',customerEmail:customer?.email||'',customerDocumentReference:customer?.documentReference||''}));setCustomerQuery(customer?.name||'');};
  const parkCurrentOrder=async()=>{
    if(!user||!organizationId||parking)return;
    if(activeParkedOrderId){flash('Esta orden ya está en espera; confírmala para cerrarla desde esta pantalla.');return;}
    if(!form.quoteId&&!cart.length){flash('Agrega artículos o elige una cotización antes de guardar en espera.');return;}
    if(!activeTotal||activeTotal<=0){flash('La orden necesita un total mayor que cero para guardarse en espera.');return;}
    setParking(true);
    try{
      const key=globalThis.crypto?.randomUUID?.()||`park-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload={form:{...form},cart,productionByLine,fulfillment,mapLink,payments,chargeNow,clientBriefHtml};
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
  const resumeParkedOrder=(order)=>{
    const payload=order.payload||{};
    if(!payload.form){flash('Esta orden guardada tiene un formato que no se puede recuperar desde esta pantalla.');return;}
    if(pendingSaleKey.current&&pendingSaleKey.current!==order.idempotency_key){flash('Primero completa o revisa la operación de venta pendiente antes de recuperar otra orden.');return;}
    if((cart.length||form.quoteId||customerQuery.trim()||form.customer.trim()||form.description.trim())&&!window.confirm('Recuperar esta orden reemplazará los datos del pedido actual. ¿Deseas continuar?'))return;
    const savedForm={...payload.form,branchCode:String(payload.form.branchCode||form.branchCode)};
    const restoredFulfillment=payload.fulfillment||{installationRequired:false,installationAddress:'',latitude:'',longitude:'',installationAt:'',deliveryAt:''};
    const restoredMapLink=String(payload.mapLink||'');
    const restoredCart=sanitizePOSCart(payload.cart).map((line,index)=>({...line,key:line.key||`${line.productId||`custom-${line.name?.toLowerCase?.()||'articulo'}`}::${line.widthCm||''}x${line.heightCm||''}::${index}`}));
    const restoredPayments=sanitizePOSPayments(payload.payments);
    const restoredChargeNow=payload.chargeNow!==false;
    const restoredProductionByLine=sanitizeProductionDetails(payload.productionByLine);
    const recoveredSnapshot={form:savedForm,cart:restoredCart,productionByLine:restoredProductionByLine,fulfillment:restoredFulfillment,mapLink:restoredMapLink,payments:restoredPayments,chargeNow:restoredChargeNow,activeParkedOrderId:order.id};
    try{sessionStorage.setItem(pendingSaleStorageKey,order.idempotency_key);sessionStorage.setItem(pendingSaleSnapshotStorageKey,JSON.stringify({version:1,savedAt:Date.now(),...recoveredSnapshot}));}
    catch{if(!pendingSaleKey.current){sessionStorage.removeItem(pendingSaleStorageKey);sessionStorage.removeItem(pendingSaleSnapshotStorageKey);}flash('No se pudo guardar la recuperación de esta orden en esta sesión. No se envió la venta.');return;}
    setFulfillment(restoredFulfillment);setMapLink(restoredMapLink);setPayments(restoredPayments);setChargeNow(restoredChargeNow);setCustomerQuery(String(savedForm.customer||''));setSelectedCustomerSnapshot(savedForm.customerId?{id:String(savedForm.customerId),name:String(savedForm.customer||''),phone:String(savedForm.customerPhone||''),email:String(savedForm.customerEmail||''),documentReference:String(savedForm.customerDocumentReference||'')}:null);
    setForm(savedForm);setCart(restoredCart);setProductionByLine(restoredProductionByLine);
    setCartProductId('');setCartItemName('');setCartUnitPrice('');setCartQuantity('1');setActiveParkedOrderId(order.id);
    pendingSaleKey.current=order.idempotency_key;pendingSaleSnapshotRef.current=recoveredSnapshot;setPendingSaleRecoveryMode(true);setPendingSaleRecoveryError('');
    flash('Orden recuperada. Revisa los datos y confirma la venta cuando esté lista.');
  };
  const addCartLine=()=>{
    const quantity=cartQuantityNumber;
    if(!Number.isSafeInteger(quantity)||quantity<1){flash('La cantidad debe ser un número entero mayor que cero.');return;}
    if(selectedCartProduct){
      if(!cartPriceAvailable){flash('Este producto no tiene una tarifa publicada disponible para esta cantidad o medida. Pide que administración complete el catálogo.');return;}
      if(cartMode==='area'&&(!Number.isFinite(cartWidthNumber)||!Number.isFinite(cartHeightNumber)||cartWidthNumber<=0||cartHeightNumber<=0)){flash('Ingresa el ancho y el alto en centímetros para calcular la superficie.');return;}
      if(invalidMeasurementStockLink){flash(`El producto por medidas está vinculado a inventario en “${measurementStockUnit||'unidad no identificada'}”. Cambia ese vínculo a una existencia medida en m² antes de venderlo.`);return;}
      const pricingTierLabel={pvp:'Normal',instalacion:'Con instalación',corporativo:'Corporativo'}[cartPriceTier]||'Normal';
      const line={
        key:globalThis.crypto?.randomUUID?.()||`line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        productId:selectedCartProduct.id,sku:selectedCartProduct.sku||selectedCartProduct.id,name:selectedCartProduct.name,family:selectedCartProduct.family||'General',image:selectedCartProduct.image||'',
        mode:cartMode,quantity,billingQuantity:cartCalculation.billedQuantity,unit:cartCalculation.unit,unitPrice:cartCalculation.unitPrice,total:cartCalculation.total,
        widthCm:cartMode==='area'?cartWidthNumber:null,heightCm:cartMode==='area'?cartHeightNumber:null,areaPerPiece:cartCalculation.areaPerPiece||null,areaTotal:cartCalculation.areaTotal||null,
        pricingTier:cartPriceTier,pricingTierLabel,optionChoice:cartOptionChoice||'',description:formatPOSLineDescription({name:selectedCartProduct.name,mode:cartMode,quantity,unit:cartCalculation.unit,unitPrice:cartCalculation.unitPrice,pricingTierLabel,widthCm:cartMode==='area'?cartWidthNumber:undefined,heightCm:cartMode==='area'?cartHeightNumber:undefined,areaPerPiece:cartCalculation.areaPerPiece||undefined,areaTotal:cartCalculation.areaTotal||undefined,optionChoice:cartOptionChoice||undefined}),
      };
      setCart(current=>[...current,line]);
      setCartProductId('');setCartQuantity('1');setCartWidthCm('100');setCartHeightCm('100');setCartPriceTier('pvp');setCartOptionChoice('');setCartUnitPrice('');
      return;
    }
    const unitPrice=Number(cartUnitPrice);
    if(!cartItemName.trim()){flash('Elige un producto o escribe un concepto de venta.');return;}
    if(!Number.isFinite(unitPrice)||unitPrice<=0){flash('Ingresa el precio acordado para el concepto libre.');return;}
    const name=cartItemName.trim();
    const line={key:globalThis.crypto?.randomUUID?.()||`line-${Date.now()}-${Math.random().toString(36).slice(2)}`,productId:'',name,family:'Concepto libre',image:'',mode:'quantity',quantity,billingQuantity:quantity,unit:'unidad',unitPrice,total:Math.round(quantity*unitPrice*100)/100,description:`${name} · ${quantity} unidades · precio acordado`};
    setCart(current=>[...current,line]);
    setCartItemName('');setCartQuantity('1');setCartUnitPrice('');
  };
  const save=async(event)=>{
    event.preventDefault();
    if(savingSale)return;
    if(pendingOperationChanged){flash('La operación pendiente cambió. Recarga para restaurar sus datos originales antes de reintentar.');return;}
    if(!canSubmitSale)return;
    const quote=centralQuotes.find(q=>q.id===form.quoteId);
    const total=form.quoteId?Number(form.total):cartTotal;
    if(!total||total<=0||!user||!organizationId)return;
    if(fulfillment.installationRequired&&!fulfillment.installationAddress.trim()){flash('Agrega la dirección de instalación antes de confirmar.');return;}
    if(Boolean(fulfillment.latitude)!==Boolean(fulfillment.longitude)){flash('Completa ambas coordenadas del pin o deja los dos campos vacíos.');return;}
    if(fulfillment.latitude&&(!Number.isFinite(Number(fulfillment.latitude))||Math.abs(Number(fulfillment.latitude))>90)||fulfillment.longitude&&(!Number.isFinite(Number(fulfillment.longitude))||Math.abs(Number(fulfillment.longitude))>180)){flash('Revisa las coordenadas del pin; latitud y longitud están fuera de rango.');return;}
    if(mapLink){try{const url=new URL(mapLink);if(url.protocol!=='https:'||!(/(^|\.)google\.com$/.test(url.hostname)&&url.pathname.startsWith('/maps/')||url.hostname==='maps.app.goo.gl'||url.hostname==='goo.gl'&&url.pathname.startsWith('/maps/'))){flash('Pega un enlace seguro de Google Maps.');return;}}catch{flash('El enlace de Google Maps no tiene un formato válido.');return;}}
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
    const quoteLinesTotal=Math.round(quoteLines.reduce((sum,line)=>sum+line.quantity*line.unit_price,0)*100)/100;
    if(form.quoteId&&quoteLinesTotal!==Math.round(total*100)/100){flash(`Los conceptos de la cotización suman ${formatMoney(quoteLinesTotal)} y no coinciden con el total aprobado de ${formatMoney(total)}. No se registró la venta.`);return;}
    const lines=form.quoteId?sanitizePOSSaleLines(quoteLines).map(line=>({ ...line, sku:data.catalog.find(product=>product.id===line.catalog_product_id)?.sku||line.sku||line.catalog_product_id||'' })):cart.map(line=>({line_key:line.key,catalog_product_id:line.productId||null,sku:line.sku||line.productId||'',description:line.description||line.name,quantity:Number(line.billingQuantity)||line.quantity,unit_price:line.unitPrice}));
    const saleNote=pendingSaleRecoveryMode&&pendingSaleKey.current&&typeof pendingSaleSnapshotRef.current?.saleNote==='string'?pendingSaleSnapshotRef.current.saleNote:[form.description,quote?`Cotización ${quote.quote_code}`:cart.map(line=>`${line.name} × ${line.quantity}`).join(' · ')].filter(Boolean).join(' · ');
    const shortages=findPOSStockShortages(lines,catalogLinks,selectedBranchId,data.inventory);
    if(shortages.length&&!canManageBackorders&&!hasPendingBackorderAuthorization){flash('Hay productos sin conteo o con existencias insuficientes. Se requiere permiso de edición de compras para confirmar una compra urgente.');return;}
    if(shortages.length&&!window.confirm(`Hay ${shortages.length} artículo(s) con conteo pendiente o existencias insuficientes. ¿Confirmar la orden y marcar el faltante como compra urgente?`))return;
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
      const fulfillmentPayload={installation_required:fulfillment.installationRequired,installation_address:fulfillment.installationAddress,installation_maps_url:mapLink,installation_latitude:fulfillment.latitude,installation_longitude:fulfillment.longitude,installation_estimated_at:fulfillment.installationAt?new Date(fulfillment.installationAt).toISOString():null,delivery_due_at:fulfillment.deliveryAt?new Date(fulfillment.deliveryAt).toISOString():null};
      const currentSnapshot={form,cart,productionByLine,productionJobs,fulfillment,mapLink,payments,chargeNow,activeParkedOrderId,allowBackorder:typeof pendingSaleSnapshotRef.current?.allowBackorder==='boolean'?pendingSaleSnapshotRef.current.allowBackorder:canManageBackorders,saleLines:lines,saleNote,clientBriefHtml};
      sessionStorage.setItem(pendingSaleSnapshotStorageKey,JSON.stringify({version:1,savedAt:Date.now(),...currentSnapshot}));
      pendingSaleSnapshotRef.current=currentSnapshot;setPendingSaleRecoveryMode(true);
      saleRequestStarted=true;
      const {data:sale,error}=await supabase.rpc('confirm_pos_sale_with_workflows',{
        p_idempotency_key:pendingSaleKey.current,
        p_branch_code:form.branchCode,
        p_customer_id:form.customerId||null,
        p_customer_data:{full_name:form.customer.trim(),phone:form.customerPhone.trim(),email:form.customerEmail.trim(),document_reference:form.customerDocumentReference.trim()},
        p_discount:0,
        p_note:saleNote,
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
  return <AppFrame area="operations">
     <PageHeading eyebrow="PUNTO DE VENTA" title="Caja y ventas" description="Arma el pedido, confirma el cobro y deja lista la información de entrega." action={<span className="local-badge"><span className="status-dot"/> {catalogLinkStatus==='ready'?'Vínculos de inventario consultados':catalogLinkStatus==='error'?'No se pudieron consultar los vínculos':'Consultando vínculos de inventario'}</span>}/>
    {lastSaleConfirmation&&<section className="pos-sale-success" role="status" aria-live="polite"><span className="pos-sale-success-icon"><Check size={19}/></span><div className="pos-sale-success-copy"><small>VENTA REGISTRADA · {lastSaleConfirmation.branch}</small><h2>{lastSaleConfirmation.code}</h2><span>Total {formatMoney(lastSaleConfirmation.total)} · Aplicado {formatMoney(lastSaleConfirmation.paid)} · Saldo {formatMoney(lastSaleConfirmation.balance)}{lastSaleConfirmation.change>0?` · Vuelto ${formatMoney(lastSaleConfirmation.change)}`:''}</span></div><button className="icon-button" type="button" aria-label="Cerrar confirmación de venta" onClick={()=>setLastSaleConfirmation(null)}><X size={16}/></button></section>}
    <div className="stat-grid compact-stats"><StatCard label="Venta confirmada hoy" value={posSalesStatus==='ready'?formatMoney(salesToday.reduce((sum,sale)=>sum+sale.total,0)):'—'} icon={Wallet} note={posSalesStatus==='ready'?branchName:posSalesStatus==='loading'?'Consultando esta sucursal':posSalesStatus==='restricted'?'Sin permiso para ver ventas':'No se pudo consultar'} tone="blue"/><StatCard label="Transacciones" value={posSalesStatus==='ready'?salesToday.length:'—'} icon={ShoppingCart} note={posSalesStatus==='ready'?'Hoy · sucursal seleccionada':'Conteo no disponible'} tone="violet"/><StatCard label="Método más común" value={posSalesStatus==='ready'&&salesToday.length?mostFrequent(salesToday.map((sale)=>sale.method)):'—'} icon={ArrowDownRight} note={posSalesStatus==='ready'?'En ventas confirmadas de hoy':'Sin datos de caja'} tone="amber"/></div>
    <section className="pos-cashier-card"><span className="pos-cashier-icon"><Users size={18}/></span><span className="pos-cashier-copy"><small>CAJERO REGISTRADO</small><b>{user?.email||'Sesión autenticada'}</b><span>{cashierSession.branch?.name||branchName} · la venta y los pagos quedan atribuidos a esta cuenta</span></span>{cashierSession.loading?<span className="inventory-status pending">Consultando turno</span>:cashierSession.session?<><span className="inventory-status available">Caja abierta · {new Date(cashierSession.session.opened_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</span><Link to="/operaciones/flujos?tab=cash" className="button button-outline">Cerrar turno <ArrowUpRight size={14}/></Link></>:cashierSession.error?<span className="inventory-status pending" title={cashierSession.error}>No se pudo verificar el turno</span>:<Link to="/operaciones/flujos?tab=cash" className="button button-outline">Abrir caja <ArrowUpRight size={14}/></Link>}</section>
    <div className="pos-grid">
      <form className="panel form-panel pos-checkout-form" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">NUEVA ORDEN</span><h2>Agrega los productos</h2><p className="pos-step-caption">Elige del catálogo o carga una cotización aprobada. Revisa el total y el cobro antes de confirmar.</p></div><ShoppingCart size={19}/></div>
        {pendingSaleRecoveryMode&&<div className={`pos-pending-sale-notice${pendingOperationChanged?' is-changed':''}`} role="status"><div><b>Operación protegida</b><p>{pendingOperationChanged?'Detecté cambios en los datos guardados o en los conceptos de la cotización. No enviaré una venta con la misma clave y contenido distinto. Recarga para recuperar la versión original.':'Si la respuesta anterior se interrumpió, puedes reintentar con esta misma clave y estos datos para evitar una venta duplicada.'}</p></div>{pendingOperationChanged&&<button className="button button-outline" type="button" onClick={()=>window.location.reload()}>Restaurar datos originales</button>}</div>}
        <div className="pos-checkout-main">
        <label>Origen de la venta<select value={form.quoteId} onChange={(event)=>{if(event.target.value&&(cart.length||form.quoteId)&&!window.confirm("Cargar esta cotización reemplazará los artículos o cotización actuales. ¿Deseas continuar?"))return;const quote=centralQuotes.find((item)=>item.id===event.target.value);const knownCustomer=(data.customers||[]).find((customer)=>quote?.customer_id&&customer.id===quote.customer_id)|| (data.customers||[]).find((customer)=>quote?.customer_phone&&customer.phone===quote.customer_phone)|| (data.customers||[]).find((customer)=>quote?.customer_name&&customer.name.trim().toLocaleLowerCase('es')===quote.customer_name.trim().toLocaleLowerCase('es'));setSelectedCustomerSnapshot(knownCustomer||null);setForm({...form,quoteId:event.target.value,total:quote?.selected_total??'',amountPaid:quote?.selected_total??'',customerId:quote?.customer_id||knownCustomer?.id||'',customer:knownCustomer?.name||quote?.customer_name||'',customerPhone:knownCustomer?.phone||quote?.customer_phone||'',customerEmail:knownCustomer?.email||'',customerDocumentReference:knownCustomer?.documentReference||'',description:Array.isArray(quote?.items)?quote.items.map(item=>item.name||item.product_name).join(', '):''});setCustomerQuery(knownCustomer?.name||quote?.customer_name||'');setClientBriefHtml(quote?.client_brief_html||'<p></p>');if(event.target.value)setCart([]);}}><option value="">Venta manual: catálogo y carrito</option>{centralQuotes.filter((quote)=>quote.status==='accepted'&&quote.price_confirmed&&quote.selected_total!==null).map((quote)=><option key={quote.id} value={quote.id}>{quote.quote_code} · {quote.customer_name||'Cliente'} · {formatMoney(quote.selected_total)}</option>)}</select><small className="pos-field-help">Puedes armar una venta nueva o cargar una cotización aprobada con su precio confirmado.</small></label>
        <POSCustomerPicker customers={data.customers||[]} remoteMatches={customerLookupActive&&canSearchCustomers&&!form.customerId&&customerSearch.results!==null&&!customerSearch.error?customerSearch.results:null} searchingCustomers={customerSearch.loading} searchError={customerSearch.error} onRetrySearch={()=>setCustomerSearchRequest((request)=>request+1)} canShowMore={Boolean(customerSearch.hasMore&&customerSearchLimit<20)} onShowMore={()=>setCustomerSearchLimit(20)} selectedCustomer={selectedCustomer} duplicateCustomer={duplicateCustomer} customerName={form.customer} onNewNameChange={(value)=>setForm((current)=>({...current,customer:value}))} query={customerQuery} onQueryChange={updateCustomerQuery} onSelect={choosePOSCustomer} phone={form.customerPhone} email={form.customerEmail} documentReference={form.customerDocumentReference} onContactChange={(field,value)=>setForm((current)=>({...current,[field==='phone'?'customerPhone':field==='email'?'customerEmail':'customerDocumentReference']:value}))} canViewSales={canViewCustomerHistory} historyLoading={customerHistory.loading} historyCount={customerHistory.count} historySummary={customerHistory.summary} recentPurchases={customerHistory.rows} onOpenPurchase={(purchase)=>setDetailTarget({kind:'sale',id:purchase.id,code:purchase.code})}/>
        {form.quoteId?<div className="pos-quote-total"><span>Total aprobado en cotización</span><strong>{formatMoney(form.total)}</strong><small>El total se conserva igual al aprobado.</small></div>:<>
          <section className="pos-cart-builder" aria-label="Agregar artículos">
            <div className="pos-cart-builder-heading"><span className="eyebrow">CATÁLOGO Y CONCEPTOS</span><span>Precios en USD</span></div>
            <div className="pos-mode-switch" role="group" aria-label="Forma de calcular el producto">
              <button type="button" className={cartMode==='quantity'?'active':''} aria-pressed={cartMode==='quantity'} onClick={()=>{setCartMode('quantity');setCartProductId('');setCartFamily('Todas');setCartPriceTier('pvp');}}>Por cantidad</button>
              <button type="button" className={cartMode==='area'?'active':''} aria-pressed={cartMode==='area'} onClick={()=>{setCartMode('area');setCartProductId('');setCartFamily('Todas');setCartPriceTier('pvp');}}>Por medidas (m²)</button>
            </div>
            <div className="pos-product-browser">
              <label>Buscar o escanear SKU<div className="search-input"><Search size={15}/><input value={cartSearch} onChange={(event)=>setCartSearch(event.target.value)} onFocus={(event)=>event.currentTarget.select()} onKeyDown={handleCartScan} disabled={!selectedBranchId} placeholder={selectedBranchId?"Nombre o código PI001 · Enter":"Cargando sucursal…"}/></div></label>
              <label>Familia<select value={cartFamily} onChange={(event)=>setCartFamily(event.target.value)}><option>Todas</option>{cartFamilies.map(family=><option key={family}>{family}</option>)}</select></label>
              <small className="pos-scan-hint">{cartMode==='area'?'Elige materiales o servicios vendidos por superficie.':'Elige productos con precio por unidad y escalas por cantidad.'} Escribe el código o usa un lector configurado para enviar Enter.</small>
              <div className="pos-catalog-count" aria-live="polite">{matchingCartProducts.length} {matchingCartProducts.length===1?'producto':'productos'} encontrados</div>
              {visibleCartProducts.length>0?<div className="pos-product-grid">{visibleCartProducts.map(product=><button type="button" key={product.id} className={`pos-product-tile${cartProductId===product.id?' selected':''}`} aria-pressed={cartProductId===product.id} onClick={()=>chooseCartProduct(product)}><POSProductVisual src={product.image} className="pos-product-image"/><span className="pos-product-tile-copy"><b>{product.name}</b><small>{product.sku||product.id}{product.family?` · ${product.family}`:''}{skuCodesByProduct[product.id]?.length?` · Existencia ${skuCodesByProduct[product.id].slice(0,2).join(', ')}`:''}</small><strong>{product.confirmed||product.published?formatMoney(product.price):'Precio a confirmar'}</strong></span></button>)}</div>:<div className="pos-catalog-empty"><Search size={19}/><b>{modeCatalog.length?'No encontramos productos':'No hay artículos en esta modalidad'}</b><span>{modeCatalog.length?'Prueba otra palabra o cambia la familia seleccionada.':'Pide a administración que complete el catálogo para esta forma de cálculo.'}</span></div>}
            </div>
            {!cartProductId&&cartMode==='quantity'&&<label>Concepto libre<input value={cartItemName} onChange={(event)=>setCartItemName(event.target.value)} placeholder="Producto o servicio acordado"/></label>}
            {selectedCartProduct&&<div className="pos-selected-product"><POSProductVisual src={selectedCartProduct.image} alt={selectedCartProduct.name} className="pos-selected-image" iconSize={18}/><span><b>{selectedCartProduct.name}</b><small>{selectedCartProduct.sku||selectedCartProduct.id} · {selectedCartProduct.family} · {selectedCartProduct.unit||'unidad'}{cartPriceAvailable?' · tarifa lista para venta':' · tarifa pendiente de configurar'}</small><small>{!selectedCatalogLink?'Sin vínculo: esta venta no descontará inventario.':!selectedLinkedStock||selectedLinkedStock.sourceStatus?'Vínculo activo; falta conteo físico para confirmar disponibilidad.':`Disponible en ${branchName}: ${selectedAvailableStock} ${selectedLinkedStock.unit}.`}</small></span><button className="icon-button" type="button" aria-label="Quitar artículo seleccionado" onClick={()=>{setCartProductId('');setCartUnitPrice('');}}><X size={14}/></button></div>}
            {cartMode==='area'&&<div className="pos-cart-inputs pos-measure-inputs"><label>Ancho (cm)<input type="number" min="0.01" step="0.01" value={cartWidthCm} onChange={(event)=>setCartWidthCm(event.target.value)}/></label><label>Alto (cm)<input type="number" min="0.01" step="0.01" value={cartHeightCm} onChange={(event)=>setCartHeightCm(event.target.value)}/></label><label>Cantidad de piezas<input type="number" min="1" step="1" value={cartQuantity} onChange={(event)=>setCartQuantity(event.target.value)}/></label></div>}
            {cartMode==='quantity'&&<div className="pos-cart-inputs"><label>Cantidad<input type="number" min="1" step="1" value={cartQuantity} onChange={(event)=>setCartQuantity(event.target.value)}/></label>{!selectedCartProduct&&<label>Precio acordado por unidad<div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={cartUnitPrice} onChange={(event)=>setCartUnitPrice(event.target.value)} placeholder="0,00"/></div></label>}</div>}
            {selectedCartProduct&&<>{selectedCartProduct.optionPrices?.length>0&&<label>Material / acabado<select value={cartOptionChoice} onChange={(event)=>setCartOptionChoice(event.target.value)}><option value="">Tarifa base</option>{selectedCartProduct.optionPrices.map(option=><option key={option.label} value={option.label}>{option.label}</option>)}</select></label>}<QuotePriceComparison product={selectedCartProduct} basis={cartPricingBasis} selectedTier={cartPriceTier} onSelect={setCartPriceTier} optionChoice={cartOptionChoice}/>{cartMode==='area'&&invalidMeasurementStockLink&&<p className="pos-calculation-warning">Este artículo descuenta inventario medido en “{measurementStockUnit}”. Asigna una existencia en m² antes de venderlo para evitar un descuento incorrecto.</p>}</>}
            {selectedCartProduct&&cartCalculation&&<div className="pos-calculation-total"><span>{cartMode==='area'?`${cartAreaPerPiece.toFixed(4)} m² por pieza × ${cartQuantityNumber} · ${cartCalculation.billedQuantity.toFixed(4)} m² en total`:`${cartQuantityNumber} ${selectedCartProduct.unit||'unidades'} · tarifa por ${selectedCartProduct.unit||'unidad'}`}</span><strong>{formatMoney(cartCalculation.total)}</strong></div>}
            <button className="button button-outline pos-add-item" type="button" onClick={addCartLine} disabled={Boolean(selectedCartProduct&&!cartPriceAvailable)||Boolean(invalidMeasurementStockLink)}><Plus size={15}/> Agregar al carrito</button>
           </section>
        </>}
        </div>
        <aside className={`pos-order-summary${mobileSummaryOpen?' is-open':''}`}>
          <div className="pos-mobile-summary-bar"><span><small>ORDEN ACTUAL</small><b>{formatMoney(activeTotal)}</b></span><button className="button button-dark" type="button" aria-expanded={mobileSummaryOpen} onClick={()=>setMobileSummaryOpen((open)=>!open)}>{mobileSummaryOpen?'Cerrar pedido':'Ver pedido y cobrar'}</button></div>
          {form.quoteId?<section className="pos-cart pos-quote-cart" aria-label="Resumen de cotización"><div className="pos-cart-heading"><div><span className="eyebrow">COTIZACIÓN APROBADA</span><h3>{centralQuotes.find((quote)=>quote.id===form.quoteId)?.quote_code||'Pedido aprobado'}</h3></div><strong>{formatMoney(activeTotal)}</strong></div><p className="pos-cart-empty">{form.description||'Los conceptos y el total se conservarán como fueron aprobados.'}</p></section>: (
          <section className="pos-cart" aria-label="Carrito de venta"><div className="pos-cart-heading"><div><span className="eyebrow">ORDEN ACTUAL</span><h3>{cart.length} {cart.length===1?'artículo':'artículos'}</h3></div><strong>{formatMoney(cartTotal)}</strong></div>{cart.length===0?<p className="pos-cart-empty">Agrega productos del catálogo o registra un concepto libre con precio acordado.</p>:<div className="pos-cart-lines">{cart.map((line)=><POSCartLineEditor key={line.key} line={line} product={data.catalog.find((product)=>product.id===line.productId)} inventoryStatus={cartInventoryStatus(line)} onRemove={()=>setCart(current=>current.filter(item=>item.key!==line.key))} onSave={(nextLine)=>setCart(current=>current.map(item=>item.key===line.key?nextLine:item))}/>)}</div>}</section>)}
        <POSProductionDetails lines={productionLines} values={productionByLine} routeByProduct={productWorkflowRoutes} templates={workflowTemplates} routeStatus={workflowRouteStatus} onChange={(lineKey,value)=>setProductionByLine((current)=>({...current,[lineKey]:value}))}/>
        <section className="pos-payment-section">
          <div className="pos-payment-title"><div><span className="eyebrow">COBRO</span><h3>Forma de pago</h3></div><label className="pos-charge-toggle"><input type="checkbox" checked={chargeNow} onChange={(event)=>setChargeNow(event.target.checked)}/> Cobrar ahora</label></div>
          {chargeNow?<>
            <div className="pos-payment-rows">{payments.map((payment)=><div className="pos-payment-row" key={payment.id}>
              <label>Método<select value={payment.method} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,method:event.target.value}:row))}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select></label>
              <label>{payment.method==='Efectivo'?'Entregado en efectivo':payments.length===1&&payment.amount===''?'Monto (vacío = total)':'Monto aplicado'}<div className="money-input"><span>$</span><input type="number" min={0.01} max={payment.method==='Efectivo'?undefined:activeTotal||undefined} step={0.01} value={payment.amount} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,amount:event.target.value}:row))} placeholder={payments.length===1?'Total de la venta':'0,00'}/></div></label>
              {(payment.method==='Transferencia'||payment.method==='Tarjeta')&&<label className="pos-payment-reference">Referencia (opcional)<input value={payment.reference||''} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,reference:event.target.value}:row))} placeholder="Código o últimos dígitos"/></label>}
              <label className="pos-payment-reference">Nota del pago (opcional)<input value={payment.note||''} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,note:event.target.value}:row))} placeholder="Detalle para identificar este pago"/></label>
              <button className="icon-button danger" type="button" aria-label="Quitar forma de pago" title={payments.length===1?'Debe quedar al menos un método de pago':'Quitar forma de pago'} disabled={payments.length===1} onClick={()=>setPayments(current=>current.length>1?current.filter(row=>row.id!==payment.id):current)}><X size={14}/></button>
            </div>)}</div>
            <button type="button" className="button button-outline pos-add-payment" onClick={()=>setPayments(current=>[...current,{id:globalThis.crypto?.randomUUID?.()||`payment-${Date.now()}-${current.length}`,method:'Transferencia',amount:'',reference:'',note:''}])}><Plus size={14}/> Agregar otro método</button>
            <div className="pos-payment-balance"><span>Recibido: <b>{formatMoney(paymentBreakdown.received)}</b></span><span>Aplicado: <b>{formatMoney(paymentBreakdown.applied)}</b></span>{paymentBreakdown.change>0&&<span className="pos-change-due">Vuelto: <b>{formatMoney(paymentBreakdown.change)}</b></span>}<span>Saldo pendiente: <b>{formatMoney(paymentBreakdown.balance)}</b></span></div>
            {paymentBreakdown.nonCashOverpayment>0&&<p className="pos-checkout-guidance" role="alert">Los pagos con tarjeta o transferencia superan el total. Ajusta esos importes; el vuelto se calcula para efectivo.</p>}{paymentBreakdown.cashWithoutBalance&&<p className="pos-checkout-guidance" role="alert">Tarjeta o transferencia ya cubren el total. Quita el efectivo adicional.</p>}
            {cashShiftUnavailable&&<p className="pos-checkout-guidance" role="status"><CircleHelp size={15}/><span>{cashierSession.error?'No se pudo verificar tu turno. Vuelve a cargar la página o revisa la sucursal.':'Para recibir efectivo, primero abre tu turno en Caja y producción.'}</span>{!cashierSession.error&&<Link to="/operaciones/flujos?tab=cash">Abrir turno</Link>}</p>}
          </>:<p className="pos-credit-note">La orden se registrará con saldo pendiente y sin pagos recibidos.</p>}
        </section>
        <label className="pos-payment-fields pos-branch-selector">Sucursal<select value={form.branchCode} disabled={!data.branches.length} onChange={(event)=>setForm((current)=>({...current,branchCode:event.target.value}))}>{data.branches.length?data.branches.map((branch)=><option key={branch.id} value={branch.code}>{branch.name||branch.code}</option>):<option value={form.branchCode}>{branchName}</option>}</select></label>
        <section className="pos-fulfillment-fields" aria-labelledby="pos-fulfillment-title"><div><span className="eyebrow">ENTREGA Y PRODUCCIÓN</span><h3 id="pos-fulfillment-title">Fechas y ubicación del pedido</h3><p>Se guardan con la venta para que Finanzas y Producción consulten la misma información.</p></div><label className="pos-install-toggle"><input type="checkbox" checked={fulfillment.installationRequired} onChange={(event)=>setFulfillment({...fulfillment,installationRequired:event.target.checked})}/> Requiere instalación</label>{fulfillment.installationRequired&&<><label>Ubicación de instalación<input required value={fulfillment.installationAddress} onChange={(event)=>setFulfillment({...fulfillment,installationAddress:event.target.value})} placeholder="Dirección o referencia"/></label><div className="pos-location-tools"><button type="button" className="button button-outline" onClick={()=>setShowLocationPicker(true)}>Ubicar en Google Maps</button>{fulfillment.latitude&&fulfillment.longitude&&<span>Pin guardado · {fulfillment.latitude}, {fulfillment.longitude}</span>}</div><GoogleMapsPreview url={mapLink} address={fulfillment.installationAddress} coordinates={fulfillment.latitude&&fulfillment.longitude?`${fulfillment.latitude},${fulfillment.longitude}`:""}/><div className="pos-cart-inputs"><label>Latitud (opcional)<input inputMode="decimal" value={fulfillment.latitude} onChange={(event)=>setFulfillment({...fulfillment,latitude:event.target.value})} placeholder="-2.1234567"/></label><label>Longitud (opcional)<input inputMode="decimal" value={fulfillment.longitude} onChange={(event)=>setFulfillment({...fulfillment,longitude:event.target.value})} placeholder="-79.1234567"/></label></div><label>Instalación estimada<input type="datetime-local" value={fulfillment.installationAt} onChange={(event)=>setFulfillment({...fulfillment,installationAt:event.target.value})}/></label></>}<label>Fecha de entrega<input type="datetime-local" value={fulfillment.deliveryAt} onChange={(event)=>setFulfillment({...fulfillment,deliveryAt:event.target.value})}/></label></section>{showLocationPicker&&<div className="pos-map-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setShowLocationPicker(false);}}><section className="pos-map-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-map-title"><div className="panel-heading"><div><span className="eyebrow">UBICACIÓN DEL PEDIDO</span><h2 id="pos-map-title">Selecciona el lugar</h2></div><button className="icon-button" type="button" aria-label="Cerrar mapa" onClick={()=>setShowLocationPicker(false)}><X size={17}/></button></div><p>Abre Google Maps para buscar el sitio o colocar un pin. Copia la dirección y, si necesitas guardar el pin, pega aquí el enlace compartido para extraer sus coordenadas.</p><label>Dirección o referencia<input value={fulfillment.installationAddress} onChange={(event)=>setFulfillment({...fulfillment,installationAddress:event.target.value})} placeholder="Busca la dirección o el sitio"/></label><label>Enlace compartido de Google Maps<input value={mapLink} onChange={(event)=>{setMapLink(event.target.value);const point=coordinatesFromMapLink(event.target.value);if(point)setFulfillment(current=>({...current,...point}));}} placeholder="Pega aquí el enlace del pin"/></label><GoogleMapsPreview url={mapLink} address={fulfillment.installationAddress} coordinates={fulfillment.latitude&&fulfillment.longitude?`${fulfillment.latitude},${fulfillment.longitude}`:""}/><div className="pos-map-coordinates"><label>Latitud<input inputMode="decimal" value={fulfillment.latitude} onChange={(event)=>setFulfillment({...fulfillment,latitude:event.target.value})}/></label><label>Longitud<input inputMode="decimal" value={fulfillment.longitude} onChange={(event)=>setFulfillment({...fulfillment,longitude:event.target.value})}/></label></div><div className="pos-submit-actions"><a className="button button-outline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fulfillment.latitude&&fulfillment.longitude?`${fulfillment.latitude},${fulfillment.longitude}`:fulfillment.installationAddress||'Milagro, Ecuador')}`} target="_blank" rel="noreferrer">Abrir Google Maps</a><button className="button button-dark" type="button" onClick={()=>setShowLocationPicker(false)}>Guardar ubicación</button></div></section></div>}
        <label>Notas internas<textarea rows={2} value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} placeholder="Detalles acordados para esta orden"/></label><section className="panel"><div className="panel-heading"><div><span className="eyebrow">BRIEF DEL TRABAJO</span><h3>Descripción e indicaciones</h3></div></div><RichTextEditor label="Descripción enriquecida" value={clientBriefHtml} onChange={setClientBriefHtml} minHeight={150} placeholder="Describe el diseño, materiales, ubicación, acabados o solicitudes del cliente…"/></section>{form.quoteId&&<CommercialAssetsGallery kind="quote" documentId={form.quoteId}/>}<CommercialAssetsEditor value={saleAssets} onChange={setSaleAssets} label="Fotos del sitio, referencias y diseños"/>{activeParkedOrderId&&<div className="pos-parked-active"><span>ORDEN RECUPERADA</span><b>Se conserva en espera hasta confirmar la venta.</b></div>}<div className="pos-submit-actions"><button className="button button-outline" type="button" disabled={parking||pendingSaleRecoveryMode||Boolean(activeParkedOrderId)||(!form.quoteId&&!cart.length)} onClick={parkCurrentOrder}>{activeParkedOrderId?'Ya está en espera':parking?'Guardando…':'Guardar en espera'} <ClipboardList size={15}/></button><button className="button button-dark form-submit" type="submit" disabled={!canSubmitSale}>{savingSale?'Guardando venta…':'Confirmar orden'} <Check size={16}/></button></div>{submitBlockReason&&<p className="pos-submit-guidance" role="status">{submitBlockReason}</p>}
        </aside>
      </form>
      <section className="panel pos-parked-panel"><div className="panel-heading"><div><span className="eyebrow">ÓRDENES RECUPERABLES</span><h2>En espera</h2></div><span className="muted-count">{parkedOrders.length} órdenes</span></div>{parkedOrders.length===0?<EmptyState icon={ClipboardList} title="No hay órdenes en espera" text="Guarda aquí un carrito o cotización para continuarla desde esta sucursal. No reserva stock."/>:<div className="activity-list">{parkedOrders.map(order=>{const payload=order.payload||{};const customerName=payload.form?.customer||payload.form?.quoteId&&centralQuotes.find(quote=>quote.id===payload.form.quoteId)?.customer_name||'Sin cliente';return <article className="sale-activity pos-parked-card" key={order.id}><div className="sale-row"><span className="sale-icon"><ClipboardList size={17}/></span><span><b>{customerName}</b><small>{branchNames[order.branch_id]||'Sucursal'} · {new Date(order.created_at).toLocaleString('es-EC',{dateStyle:'short',timeStyle:'short'})}</small></span><strong>{formatMoney(order.total)}</strong></div><div className="sale-payment-summary"><span>{payload.cart?.length|| (payload.form?.quoteId?'Cotización aprobada':'')} artículo(s)</span><span>Guardada por <b>{order.created_by===user?.id?'ti':'el equipo'}</b></span></div><button className="button button-outline" type="button" onClick={()=>resumeParkedOrder(order)}>Recuperar orden</button></article>;})}</div>}</section>
      <section className="panel pos-recent-panel"><div className="panel-heading"><div><span className="eyebrow">CAJA DEL DÍA · {branchName}</span><h2>Ventas confirmadas</h2></div><span className="muted-count">{posSalesStatus==='ready'?`${salesToday.length} registros`:posSalesStatus==='loading'?'Consultando…':posSalesStatus==='restricted'?'Acceso limitado':'Error de consulta'}</span></div>
        {posSalesStatus==='loading'?<div className="pos-sales-state" role="status">Consultando las ventas de hoy para {branchName}…</div>:posSalesStatus==='restricted'?<div className="pos-sales-state">Tu perfil no tiene permiso para consultar ventas.</div>:posSalesStatus==='error'?<div className="pos-sales-state" role="alert"><span>No se pudieron cargar las ventas de esta sucursal.</span><button className="button button-outline" type="button" onClick={()=>void refreshPOSDaySales()}>Reintentar</button></div>:salesToday.length===0?<EmptyState icon={Wallet} title="Todavía no hay ventas" text={`Las ventas confirmadas de hoy en ${branchName} aparecerán aquí.`}/>:<div className="activity-list">{salesToday.map((sale)=><article className="sale-activity" key={sale.id}><div className="sale-row"><span className="sale-icon"><ShoppingCart size={17}/></span><span><b>{sale.customer||sale.description||'Venta'}</b><small>{sale.method} · {new Date(sale.date).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})} · {sale.code}</small></span><strong>{formatMoney(sale.total)}</strong></div><div className="sale-payment-summary"><span>Abonado: <b>{formatMoney(sale.paid||0)}</b></span><span>Saldo: <b>{formatMoney(sale.balance||0)}</b></span>{sale.urgent&&<span className="inventory-status pending">Compra urgente pendiente</span>}</div><button className="button button-outline pos-sale-detail-trigger" type="button" onClick={()=>setDetailTarget({kind:'sale',id:sale.id,code:sale.code})}>Ver ficha completa</button>{Number(sale.balance)>0&&<><button className="button button-outline" type="button" onClick={()=>{setPaymentTarget(paymentTarget===sale.id?null:sale.id);setPaymentForm({amount:String(sale.balance),method:'Efectivo',reference:'',note:''});}}>Registrar abono</button>{paymentTarget===sale.id&&<form className="payment-form" onSubmit={(event)=>registerBalancePayment(event,sale)}>
          <label>{paymentForm.method==='Efectivo'?'Monto recibido':'Monto aplicado'}<input type="number" min={0.01} max={paymentForm.method==='Efectivo'?undefined:sale.balance} step={0.01} required value={paymentForm.amount} onChange={(event)=>setPaymentForm({...paymentForm,amount:event.target.value})}/></label>
          {paymentForm.method==='Efectivo'&&<small className="pos-balance-change-preview">Se aplicará {formatMoney(Math.min(Number(paymentForm.amount)||0,Number(sale.balance)))} · Vuelto {formatMoney(Math.max(0,(Number(paymentForm.amount)||0)-Number(sale.balance)))}</small>}
          <label>Forma de pago<select value={paymentForm.method} onChange={(event)=>setPaymentForm({...paymentForm,method:event.target.value})}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select></label>
          {(paymentForm.method==='Transferencia'||paymentForm.method==='Tarjeta')&&<label>Referencia (opcional)<input value={paymentForm.reference} onChange={(event)=>setPaymentForm({...paymentForm,reference:event.target.value})} placeholder="Código o últimos dígitos"/></label>}
          <label>Nota (opcional)<input value={paymentForm.note} onChange={(event)=>setPaymentForm({...paymentForm,note:event.target.value})} placeholder="Detalle del abono"/></label>
          <button className="button button-dark" type="submit" disabled={savingBalancePayment===sale.id}>{savingBalancePayment===sale.id?'Guardando…':'Guardar abono'}</button>
        </form>}</>}</article>)}</div>}
      </section>
    </div><div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Antes de confirmar</b><p>Los vínculos conectan productos con variantes de inventario; la disponibilidad depende de un conteo físico registrado por sucursal. Si falta el conteo o la existencia no alcanza, el POS lo muestra como pendiente y permite marcar la compra urgente al confirmar. Las órdenes en espera no reservan existencias y esta pantalla no emite comprobantes tributarios.</p></div></div>
    <Sheet open={Boolean(detailTarget)} onOpenChange={(open)=>{if(!open)setDetailTarget(null);}} title={detailTarget ? `Ficha completa · ${detailTarget.code}` : 'Ficha completa'} description="Productos, imágenes, valores y pagos registrados en esta compra.">{detailTarget&&<CommercialDocumentDetails kind="sale" documentId={detailTarget.id}/>}</Sheet>
  </AppFrame>;
}


