import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Boxes, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, ClipboardList, Database, FileText, Globe2, History, Image, LayoutDashboard, LogOut, Megaphone, Menu, Package, Plus, Search, Settings2, ShoppingBag, ShoppingCart, Truck, Users, Wallet, X } from 'lucide-react';
import { AppFrame, PageHeading, StatCard } from '../../app/layout';
import { EmptyState, StageBadge } from '../../components/feedback';
import { formatDate, formatMoney, localDateKey, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { QuotePriceComparison } from '../../components/QuotePriceComparison';
import { calculateQuotePrice, getQuoteBasis } from '../../lib/quotePricing';
import { calculatePOSLine, formatPOSLineDescription } from '../../lib/posPricing';
import { POSCustomerPicker } from './components/POSCustomerPicker';

const trackedAccessoryProductIds = new Set(['prod-extras-ojal-peque-o-c-u','prod-extras-ojales-grande-c-u']);
const normalizeCustomerPhone = (value) => { const digits=String(value||'').replace(/\D/g,'');return digits.startsWith('593')&&digits.length===12?`0${digits.slice(3)}`:digits; };

function mostFrequent(values: string[]) { return values.sort((a,b)=>values.filter((item)=>item===b).length-values.filter((item)=>item===a).length)[0]; }

function POSProductVisual({ src, alt = '', className = '', iconSize = 17 }: { src?: string | null; alt?: string; className?: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span className={`pos-line-placeholder ${className}`.trim()} aria-hidden="true"><Boxes size={iconSize}/></span>;
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}/>;
}

export function PosPage() {
  const { data, add, update, flash, refreshRemote }=useWorkspace();
  const { organizationId, user, hasPermission }=useAuth();
  const [form,setForm]=useState({total:'',amountPaid:'',method:'Efectivo',customer:'',customerId:'',customerPhone:'',customerEmail:'',customerDocumentReference:'',description:'',productId:'',branchCode:'VIS',quantity:'1',quoteId:''});
  const [customerQuery,setCustomerQuery]=useState('');
  const [customerSearch,setCustomerSearch]=useState({loading:false,results:null,error:'',hasMore:false});
  const [customerSearchLimit,setCustomerSearchLimit]=useState(8);
  const [customerSearchRequest,setCustomerSearchRequest]=useState(0);
  const [selectedCustomerSnapshot,setSelectedCustomerSnapshot]=useState(null);
  const [customerHistory,setCustomerHistory]=useState({loading:false,count:0,rows:[],summary:null});
  const [cart,setCart]=useState([]);
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
  const [paymentForm,setPaymentForm]=useState({amount:'',method:'Efectivo'});
  const [parkedOrders,setParkedOrders]=useState([]);
  const [branchNames,setBranchNames]=useState({});
  const [activeParkedOrderId,setActiveParkedOrderId]=useState('');
  const [parking,setParking]=useState(false);
  const [cashierSession,setCashierSession]=useState({loading:true,session:null,branch:null,error:''});
  const [chargeNow,setChargeNow]=useState(true);
  const [payments,setPayments]=useState([{id:'payment-1',method:'Efectivo',amount:''}]);
  const [savingSale,setSavingSale]=useState(false);
  const pendingSaleKey=useRef(typeof window!=='undefined'?sessionStorage.getItem('visualcorp-pos-pending-sale-key')||'':'');
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
  const today=localDateKey();
  const salesToday=data.sales.filter((sale)=>localDateKey(sale.date)===today);
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
  const selectedCustomer=(data.customers||[]).find((customer)=>customer.id===form.customerId)||(selectedCustomerSnapshot?.id===form.customerId?selectedCustomerSnapshot:undefined);
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
  const branchName=form.branchCode==='GIGA'?'Gigaprint':'Visual Corp';
  const cartTotal=Math.round(cart.reduce((sum,line)=>sum+(Number(line.total)||Number(line.quantity)*Number(line.unitPrice)),0)*100)/100;
  const activeTotal=form.quoteId?Number(form.total)||0:cartTotal;
  const paymentPreview=Math.round((payments.length===1&&payments[0].amount===''?activeTotal:payments.reduce((sum,payment)=>sum+(Number(payment.amount)||0),0))*100)/100;
  const selectedCartProduct=data.catalog.find((product)=>product.id===cartProductId);
  const modeCatalog=data.catalog.filter(product=>(product.mode==='area'?'area':'quantity')===cartMode);
  const cartFamilies=[...new Set<string>(modeCatalog.map(product=>String(product.family||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const selectedBranchId=cashierSession.branch?.code===form.branchCode?cashierSession.branch.id:data.branches.find((branch)=>branch.code===form.branchCode)?.id||'';
  const skuCodesByProduct=catalogLinks.filter(link=>link.active&&link.branch_id===selectedBranchId).reduce((codes,link)=>{const linkedStock=data.inventory.find(row=>row.variantId===link.inventory_variant_id&&row.branchId===link.branch_id);const values=[linkedStock?.sku,linkedStock?.variantSku].filter(Boolean);if(values.length)codes[link.catalog_product_id]=[...new Set([...(codes[link.catalog_product_id]||[]),...values])];return codes;},{});
  const matchingCartProducts=modeCatalog.filter(product=>(cartFamily==='Todas'||product.family===cartFamily)&&`${product.name} ${product.family} ${(skuCodesByProduct[product.id]||[]).join(' ')}`.toLowerCase().includes(cartSearch.trim().toLowerCase()));
  const visibleCartProducts=matchingCartProducts.slice(0,12);
  const needsCashShift=chargeNow&&payments.some(payment=>payment.method==='Efectivo');
  const cashShiftPending=needsCashShift&&cashierSession.loading;
  const cashShiftUnavailable=needsCashShift&&!cashierSession.loading&&!cashierSession.session;
  const missingCartAccessoryLink=cart.some(line=>trackedAccessoryProductIds.has(line.productId)&&!catalogLinks.some(link=>link.active&&link.branch_id===selectedBranchId&&link.catalog_product_id===line.productId));
  const canSubmitSale=Boolean(supabase&&user&&organizationId&&selectedBranchId&&catalogLinkStatus==='ready'&&!missingCartAccessoryLink&&!duplicateCustomer&&!customerLookupPending&&!customerLookupFailed&&!customerNameMissing&&activeTotal>0&&(form.quoteId||cart.length>0)&&!savingSale&&!cashShiftPending&&!cashShiftUnavailable);
  const submitBlockReason=savingSale?'Guardando la venta…':!selectedBranchId?'Cargando la sucursal seleccionada…':catalogLinkStatus==='checking'?'Comprobando el control de inventario…':catalogLinkStatus==='error'?'No se pudo comprobar el control de inventario. Recarga antes de confirmar.':missingCartAccessoryLink?'Vincula los ojales con su variante de inventario antes de confirmar esta venta.':duplicateCustomer?`Ya existe ${duplicateCustomer.name} con ese teléfono, correo o identificación. Selecciónalo para evitar crear un duplicado.`:customerLookupFailed?'No se pudo verificar si el cliente ya existe. Reintenta la búsqueda antes de confirmar.':customerLookupPending?'Buscando coincidencias del cliente…':customerNameMissing?'Completa el nombre del cliente o limpia la búsqueda si será una venta de mostrador.':cashShiftPending?'Verificando el turno de caja…':cashShiftUnavailable?'Abre un turno de caja para registrar pagos en efectivo.':!form.quoteId&&!cart.length?'Agrega al menos un artículo al carrito para habilitar la venta.':activeTotal<=0?'La orden necesita un total mayor que cero.':!supabase||!user||!organizationId?'No se pudo validar la sesión para guardar la venta.':'';
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
  const handleCartScan=(event)=>{
    if(event.key!=='Enter')return;
    event.preventDefault();
    const scannedCode=cartSearch.trim().toLocaleUpperCase('es');
    if(!scannedCode)return;
    const stock=data.inventory.find(row=>row.branchId===selectedBranchId&&!row.archived&&[row.sku,row.variantSku].some(code=>String(code||'').trim().toLocaleUpperCase('es')===scannedCode));
    if(!stock){flash(`No hay un SKU ${scannedCode} en el inventario de ${branchName}.`);return;}
    const link=catalogLinks.find(item=>item.active&&item.branch_id===stock.branchId&&item.inventory_variant_id===stock.variantId);
    const product=link&&data.catalog.find(item=>item.id===link.catalog_product_id);
    if(!product){flash(`El SKU ${scannedCode} existe, pero todavía no está vinculado a un producto vendible.`);return;}
    setCartMode(product.mode==='area'?'area':'quantity');setCartFamily(product.family||'Todas');setCartProductId(product.id);setCartItemName('');setCartUnitPrice('');setCartPriceTier('pvp');setCartOptionChoice('');
    flash(`Artículo reconocido: ${product.name}. Revisa la cantidad o medida y la tarifa del catálogo.`);
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
      const payload={form:{...form},cart:cart.map(({key:_key,...line})=>line)};
      const {data:branch,error:branchError}=await supabase.from('branches').select('id').eq('organization_id',organizationId).eq('code',form.branchCode).maybeSingle();
      if(branchError)throw branchError;
      if(!branch?.id)throw new Error('No encontramos la sucursal seleccionada.');
      const {data:parkedId,error}=await supabase.rpc('park_pos_order',{p_organization_id:organizationId,p_branch_code:form.branchCode,p_idempotency_key:key,p_payload:payload,p_total:activeTotal});
      if(error)throw error;
      await refreshParkedOrders();
      setForm({total:'',amountPaid:'',method:'Efectivo',customer:'',customerId:'',customerPhone:'',customerEmail:'',customerDocumentReference:'',description:'',productId:'',branchCode:'VIS',quantity:'1',quoteId:''});
      setCustomerQuery('');
      setCart([]);setActiveParkedOrderId('');setChargeNow(true);setPayments([{id:'payment-1',method:'Efectivo',amount:''}]);
      flash(`Orden guardada en espera · ${String(parkedId).slice(0,8).toUpperCase()}. No se reservó ni descontó inventario.`);
    }catch(error){flash(`No se pudo guardar la orden en espera: ${error.message}`);}
    finally{setParking(false);}
  };
  const resumeParkedOrder=(order)=>{
    const payload=order.payload||{};
    if(!payload.form){flash('Esta orden guardada tiene un formato que no se puede recuperar desde esta pantalla.');return;}
    const savedForm={...payload.form};
    setForm(savedForm);setCart((payload.cart||[]).map((line,index)=>({...line,key:line.key||`${line.productId||`custom-${line.name?.toLowerCase?.()||'articulo'}`}::${line.widthCm||''}x${line.heightCm||''}::${index}`})));
    setCartProductId('');setCartItemName('');setCartUnitPrice('');setCartQuantity('1');setActiveParkedOrderId(order.id);
    pendingSaleKey.current=order.idempotency_key;sessionStorage.setItem('visualcorp-pos-pending-sale-key',order.idempotency_key);
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
        productId:selectedCartProduct.id,name:selectedCartProduct.name,family:selectedCartProduct.family||'General',image:selectedCartProduct.image||'',
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
    if(!canSubmitSale)return;
    const quote=centralQuotes.find(q=>q.id===form.quoteId);
    const total=form.quoteId?Number(form.total):cartTotal;
    if(!total||total<=0||!user||!organizationId)return;
    if(!form.quoteId&&!cart.length){flash('Agrega al menos un artículo antes de confirmar la orden.');return;}
    const methodMap={Efectivo:'cash',Transferencia:'transfer',Tarjeta:'card',Otro:'other'};
    if(chargeNow&&payments.some(payment=>payment.amount!==''&&(!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0))){flash('Cada monto ingresado debe ser un valor mayor que cero.');return;}
    const salePayments=chargeNow?(payments.length===1&&payments[0].amount===''?[{method:methodMap[payments[0].method]||'other',amount:total}]:payments.filter(payment=>Number(payment.amount)>0).map(payment=>({method:methodMap[payment.method]||'other',amount:Math.round(Number(payment.amount)*100)/100}))):[];
    if(chargeNow&&!salePayments.length){flash('Ingresa al menos un pago o marca que la orden queda pendiente de cobro.');return;}
    const received=chargeNow?Math.round(salePayments.reduce((sum,payment)=>sum+payment.amount,0)*100)/100:0;
    if(!Number.isFinite(received)||received<0||received>total){flash('El valor recibido debe estar entre cero y el total de la orden.');return;}
    const quoteLines=(Array.isArray(quote?.items)?quote.items:[]).filter(item=>item.product_id&&Number(item.quantity)>0&&Number(item.total)>0).map(item=>({catalog_product_id:item.product_id,sku:item.product_id,description:item.name||item.product_name||'Artículo cotizado',quantity:Number(item.quantity),unit_price:Number(item.total)/Number(item.quantity)}));
    if(quoteLines.some(line=>trackedAccessoryProductIds.has(line.catalog_product_id)&&!catalogLinks.some(link=>link.active&&link.branch_id===selectedBranchId&&link.catalog_product_id===line.catalog_product_id))){flash('La cotización incluye ojales sin vínculo de inventario en esta sucursal. Corrige el vínculo antes de confirmar para no registrar una venta sin descuento de stock.');return;}
    const quoteLinesTotal=Math.round(quoteLines.reduce((sum,line)=>sum+line.quantity*line.unit_price,0)*100)/100;
    const lines=form.quoteId?(quoteLines.length&&quoteLinesTotal===Math.round(total*100)/100?quoteLines:[{catalog_product_id:null,sku:'',description:form.description||'Cotización aprobada',quantity:1,unit_price:total}]):cart.map(line=>({catalog_product_id:line.productId||null,sku:line.productId||'',description:line.description||line.name,quantity:Number(line.billingQuantity)||line.quantity,unit_price:line.unitPrice}));
    const shortages=form.quoteId?[]:cart.flatMap(line=>{if(!line.productId)return [];const linked=catalogLinks.find(link=>link.active&&link.catalog_product_id===line.productId&&link.branch_id===selectedBranchId);if(!linked)return [];const stock=data.inventory.find(row=>row.variantId===linked.inventory_variant_id&&row.branchId===linked.branch_id);const debitQuantity=Number(line.billingQuantity)||line.quantity;const available=stock?Number(stock.availableQuantity??(Number(stock.quantity||0)-Number(stock.reservedQuantity||0))):0;return !stock||stock.sourceStatus||available<debitQuantity?[{line,stock:stock||{name:line.name,sourceStatus:'Sin conteo físico',quantity:0,availableQuantity:0}}]:[];});
    if(shortages.length&&!window.confirm(`Hay ${shortages.length} artículo(s) con conteo pendiente o existencias insuficientes. ¿Confirmar la orden y marcar el faltante como compra urgente?`))return;
    setSavingSale(true);
    try{
      if(form.quoteId&&(!quote||quote.status!=='accepted'||!quote.price_confirmed||Math.round(Number(quote.selected_total)*100)!==Math.round(total*100))){flash('La cotización debe seguir aceptada y el total debe coincidir exactamente antes de confirmar.');return;}
      let quoteLinkError='';
      if(salePayments.some(payment=>payment.method==='cash')){const {data:branch}=await supabase.from('branches').select('id').eq('organization_id',organizationId).eq('code',form.branchCode).maybeSingle();const {data:shift,error:shiftError}=await supabase.from('cash_sessions').select('id').eq('organization_id',organizationId).eq('branch_id',branch?.id||'').eq('opened_by',user.id).eq('status','open').maybeSingle();if(shiftError)throw shiftError;if(!shift){flash('Abre primero tu turno de caja en Caja y producción para registrar cualquier parte en efectivo.');return;}}
      if(!pendingSaleKey.current){pendingSaleKey.current=globalThis.crypto?.randomUUID?.()||`sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem('visualcorp-pos-pending-sale-key',pendingSaleKey.current);}
      const {data:sale,error}=await supabase.rpc('create_pos_sale_idempotent',{
        p_idempotency_key:pendingSaleKey.current,
        p_branch_code:form.branchCode,
        p_customer_id:form.customerId||null,
        p_customer_data:{full_name:form.customer.trim(),phone:form.customerPhone.trim(),email:form.customerEmail.trim(),document_reference:form.customerDocumentReference.trim()},
        p_discount:0,
        p_note:[form.description,quote?`Cotización ${quote.quote_code}`:cart.map(line=>`${line.name} × ${line.quantity}`).join(' · ')].filter(Boolean).join(' · '),
        p_allow_backorder:true,
        p_lines:lines,
        p_payments:salePayments,
      });
      if(error)throw error;
      let materialBackorder=false;
      try{const {data:materialRows}=await supabase.from('sale_material_consumptions').select('backordered_quantity').eq('sale_id',sale.sale_id).gt('backordered_quantity',0);materialBackorder=Boolean(materialRows?.length);}catch{}
      const completingParkedOrder=activeParkedOrderId;
      let parkedCompletionError='';
      if(completingParkedOrder){const {error:parkedError}=await supabase.rpc('complete_parked_pos_order',{p_parked_order:completingParkedOrder,p_sale:sale.sale_id});if(parkedError)parkedCompletionError=parkedError.message;setActiveParkedOrderId('');}
      if(form.quoteId){const {error:quoteError}=await supabase.rpc('link_pos_sale_to_central_quote',{p_sale:sale.sale_id,p_quote:form.quoteId});if(quoteError)quoteLinkError=quoteError.message;else setCentralQuotes(rows=>rows.map(q=>q.id===form.quoteId?{...q,status:'converted'}:q));}
      await refreshRemote();
      if(completingParkedOrder)await refreshParkedOrders().catch(()=>{});
      setForm({total:'',amountPaid:'',method:'Efectivo',customer:'',customerId:'',customerPhone:'',customerEmail:'',customerDocumentReference:'',description:'',productId:'',branchCode:'VIS',quantity:'1',quoteId:''});
      setCustomerQuery('');
      setCart([]);
      setChargeNow(true);setPayments([{id:'payment-1',method:'Efectivo',amount:''}]);
      sessionStorage.removeItem('visualcorp-pos-pending-sale-key');pendingSaleKey.current='';
      flash(parkedCompletionError?`Venta ${sale.sale_code||''} registrada. La orden sigue en espera por un problema de sincronización; al recuperarla, la clave evita duplicar la venta.`:quoteLinkError?`Venta ${sale.sale_code||''} registrada, pero la cotización no quedó vinculada: ${quoteLinkError}`:shortages.length||sale.backordered_quantity||materialBackorder?'Orden confirmada; el faltante de producto o material quedó como compra urgente.':'Orden confirmada y guardada en Supabase.');
    }catch(error){flash(`No se confirmó la orden; el formulario se conserva para reintentar: ${error.message}`);}
    finally{setSavingSale(false);}
  };
  const registerBalancePayment=async(event,sale)=>{
    event.preventDefault();const amount=Number(paymentForm.amount);if(!amount||amount<=0)return;
    try{const keyName=`visualcorp-pos-payment-${sale.id}`;let key=sessionStorage.getItem(keyName);if(!key){key=globalThis.crypto?.randomUUID?.()||`payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(keyName,key);}const methodMap={Efectivo:'cash',Transferencia:'transfer',Tarjeta:'card',Otro:'other'};const {error}=await supabase.rpc('record_sale_payment',{p_idempotency_key:key,p_sale_id:sale.id,p_method:methodMap[paymentForm.method]||'other',p_amount:amount,p_reference:'',p_note:''});if(error)throw error;sessionStorage.removeItem(keyName);await refreshRemote();setPaymentTarget(null);setPaymentForm({amount:'',method:'Efectivo'});flash('Abono guardado y saldo actualizado.');}catch(error){flash(`No se guardó el abono; puedes reintentar sin duplicarlo: ${error.message}`);}
  };
  return <AppFrame area="operations">
    <PageHeading eyebrow="PUNTO DE VENTA" title="Caja y ventas" description="Registra órdenes compartidas con inventario, clientes y pagos." action={<span className="local-badge"><span className="status-dot"/> Supabase conectado</span>}/>
    <div className="stat-grid compact-stats"><StatCard label="Total registrado hoy" value={formatMoney(salesToday.reduce((sum,sale)=>sum+sale.total,0))} icon={Wallet} note={`${salesToday.length} órdenes confirmadas`} tone="blue"/><StatCard label="Transacciones" value={salesToday.length} icon={ShoppingCart} note="Todas las sucursales" tone="violet"/><StatCard label="Método principal" value={salesToday.length?mostFrequent(salesToday.map((sale)=>sale.method)):'—'} icon={ArrowDownRight} note="Pagos registrados" tone="amber"/></div>
    <section className="pos-cashier-card"><span className="pos-cashier-icon"><Users size={18}/></span><span className="pos-cashier-copy"><small>CAJERO REGISTRADO</small><b>{user?.email||'Sesión autenticada'}</b><span>{cashierSession.branch?.name||branchName} · la venta y los pagos quedan atribuidos a esta cuenta</span></span>{cashierSession.loading?<span className="inventory-status pending">Consultando turno</span>:cashierSession.session?<span className="inventory-status available">Caja abierta · {new Date(cashierSession.session.opened_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</span>:cashierSession.error?<span className="inventory-status pending" title={cashierSession.error}>No se pudo verificar el turno</span>:<Link to="/operaciones/flujos" className="button button-outline">Abrir turno de caja <ArrowUpRight size={14}/></Link>}</section>
    <div className="pos-grid">
      <form className="panel form-panel" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">NUEVA ORDEN · PASO 1 DE 3</span><h2>Agrega los productos</h2><p className="pos-step-caption">Elige del catálogo o carga una cotización aprobada. Revisa el total antes de cobrar.</p></div><ShoppingCart size={19}/></div>
        <label>Origen de la venta<select value={form.quoteId} onChange={(event)=>{const quote=centralQuotes.find((item)=>item.id===event.target.value);const knownCustomer=(data.customers||[]).find((customer)=>quote?.customer_id&&customer.id===quote.customer_id)|| (data.customers||[]).find((customer)=>quote?.customer_phone&&customer.phone===quote.customer_phone)|| (data.customers||[]).find((customer)=>quote?.customer_name&&customer.name.trim().toLocaleLowerCase('es')===quote.customer_name.trim().toLocaleLowerCase('es'));setSelectedCustomerSnapshot(knownCustomer||null);setForm({...form,quoteId:event.target.value,total:quote?.selected_total??'',amountPaid:quote?.selected_total??'',customerId:knownCustomer?.id||'',customer:knownCustomer?.name||quote?.customer_name||'',customerPhone:knownCustomer?.phone||quote?.customer_phone||'',customerEmail:knownCustomer?.email||'',customerDocumentReference:knownCustomer?.documentReference||'',description:Array.isArray(quote?.items)?quote.items.map(item=>item.name||item.product_name).join(', '):''});setCustomerQuery(knownCustomer?.name||quote?.customer_name||'');if(event.target.value)setCart([]);}}><option value="">Venta manual: catálogo y carrito</option>{centralQuotes.filter((quote)=>quote.status==='accepted'&&quote.price_confirmed&&quote.selected_total!==null).map((quote)=><option key={quote.id} value={quote.id}>{quote.quote_code} · {quote.customer_name||'Cliente'} · {formatMoney(quote.selected_total)}</option>)}</select><small className="pos-field-help">Puedes armar una venta nueva o cargar una cotización aprobada con su precio confirmado.</small></label>
        {form.quoteId?<div className="pos-quote-total"><span>Total aprobado en cotización</span><strong>{formatMoney(form.total)}</strong><small>El total se conserva igual al aprobado.</small></div>:<>
          <section className="pos-cart-builder" aria-label="Agregar artículos">
            <div className="pos-cart-builder-heading"><span className="eyebrow">CATÁLOGO Y CONCEPTOS</span><span>Precios en USD</span></div>
            <div className="pos-mode-switch" role="group" aria-label="Forma de calcular el producto">
              <button type="button" className={cartMode==='quantity'?'active':''} aria-pressed={cartMode==='quantity'} onClick={()=>{setCartMode('quantity');setCartProductId('');setCartFamily('Todas');setCartPriceTier('pvp');}}>Por cantidad</button>
              <button type="button" className={cartMode==='area'?'active':''} aria-pressed={cartMode==='area'} onClick={()=>{setCartMode('area');setCartProductId('');setCartFamily('Todas');setCartPriceTier('pvp');}}>Por medidas (m²)</button>
            </div>
            <div className="pos-product-browser">
              <label>Buscar o escanear SKU<div className="search-input"><Search size={15}/><input value={cartSearch} onChange={(event)=>setCartSearch(event.target.value)} onKeyDown={handleCartScan} disabled={!selectedBranchId} placeholder={selectedBranchId?"Nombre, familia o SKU · Enter":"Cargando sucursal…"}/></div></label>
              <label>Familia<select value={cartFamily} onChange={(event)=>setCartFamily(event.target.value)}><option>Todas</option>{cartFamilies.map(family=><option key={family}>{family}</option>)}</select></label>
              <small className="pos-scan-hint">{cartMode==='area'?'Elige materiales o servicios vendidos por superficie.':'Elige productos con precio por unidad y escalas por cantidad.'} El lector SKU busca existencias de la sucursal.</small>
              <div className="pos-catalog-count" aria-live="polite">{matchingCartProducts.length} {matchingCartProducts.length===1?'producto':'productos'} encontrados</div>
              {visibleCartProducts.length>0?<div className="pos-product-grid">{visibleCartProducts.map(product=><button type="button" key={product.id} className={`pos-product-tile${cartProductId===product.id?' selected':''}`} aria-pressed={cartProductId===product.id} onClick={()=>{setCartProductId(product.id);setCartItemName('');setCartUnitPrice('');setCartPriceTier('pvp');setCartOptionChoice('');}}><POSProductVisual src={product.image} className="pos-product-image"/><span className="pos-product-tile-copy"><b>{product.name}</b><small>{product.family}{skuCodesByProduct[product.id]?.length?` · ${skuCodesByProduct[product.id].slice(0,2).join(', ')}`:''}</small><strong>{product.confirmed||product.published?formatMoney(product.price):'Precio a confirmar'}</strong></span></button>)}</div>:<div className="pos-catalog-empty"><Search size={19}/><b>{modeCatalog.length?'No encontramos productos':'No hay artículos en esta modalidad'}</b><span>{modeCatalog.length?'Prueba otra palabra o cambia la familia seleccionada.':'Pide a administración que complete el catálogo para esta forma de cálculo.'}</span></div>}
              {matchingCartProducts.length>12&&<small className="pos-search-hint">Mostrando los primeros 12 resultados. Escribe un nombre, familia o SKU para precisar.</small>}
            </div>
            {!cartProductId&&cartMode==='quantity'&&<label>Concepto libre<input value={cartItemName} onChange={(event)=>setCartItemName(event.target.value)} placeholder="Producto o servicio acordado"/></label>}
            {selectedCartProduct&&<div className="pos-selected-product"><POSProductVisual src={selectedCartProduct.image} alt={selectedCartProduct.name} className="pos-selected-image" iconSize={18}/><span><b>{selectedCartProduct.name}</b><small>{selectedCartProduct.family} · {selectedCartProduct.unit||'unidad'}{cartPriceAvailable?' · tarifa lista para venta':' · tarifa pendiente de configurar'}</small><small>{!selectedCatalogLink?'Sin vínculo: esta venta no descontará inventario.':!selectedLinkedStock||selectedLinkedStock.sourceStatus?'Vínculo activo; falta conteo físico para confirmar disponibilidad.':`Disponible en ${branchName}: ${selectedAvailableStock} ${selectedLinkedStock.unit}.`}</small></span><button className="icon-button" type="button" aria-label="Quitar artículo seleccionado" onClick={()=>{setCartProductId('');setCartUnitPrice('');}}><X size={14}/></button></div>}
            {cartMode==='area'&&<div className="pos-cart-inputs pos-measure-inputs"><label>Ancho (cm)<input type="number" min="0.01" step="0.01" value={cartWidthCm} onChange={(event)=>setCartWidthCm(event.target.value)}/></label><label>Alto (cm)<input type="number" min="0.01" step="0.01" value={cartHeightCm} onChange={(event)=>setCartHeightCm(event.target.value)}/></label><label>Cantidad de piezas<input type="number" min="1" step="1" value={cartQuantity} onChange={(event)=>setCartQuantity(event.target.value)}/></label></div>}
            {cartMode==='quantity'&&<div className="pos-cart-inputs"><label>Cantidad<input type="number" min="1" step="1" value={cartQuantity} onChange={(event)=>setCartQuantity(event.target.value)}/></label>{!selectedCartProduct&&<label>Precio acordado por unidad<div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={cartUnitPrice} onChange={(event)=>setCartUnitPrice(event.target.value)} placeholder="0,00"/></div></label>}</div>}
            {selectedCartProduct&&<>{selectedCartProduct.optionPrices?.length>0&&<label>Material / acabado<select value={cartOptionChoice} onChange={(event)=>setCartOptionChoice(event.target.value)}><option value="">Tarifa base</option>{selectedCartProduct.optionPrices.map(option=><option key={option.label} value={option.label}>{option.label}</option>)}</select></label>}<QuotePriceComparison product={selectedCartProduct} basis={cartPricingBasis} selectedTier={cartPriceTier} onSelect={setCartPriceTier} optionChoice={cartOptionChoice}/>{cartMode==='area'&&invalidMeasurementStockLink&&<p className="pos-calculation-warning">Este artículo descuenta inventario medido en “{measurementStockUnit}”. Asigna una existencia en m² antes de venderlo para evitar un descuento incorrecto.</p>}</>}
            {selectedCartProduct&&cartCalculation&&<div className="pos-calculation-total"><span>{cartMode==='area'?`${cartAreaPerPiece.toFixed(4)} m² por pieza × ${cartQuantityNumber} · ${cartCalculation.billedQuantity.toFixed(4)} m² en total`:`${cartQuantityNumber} ${selectedCartProduct.unit||'unidades'} · tarifa por ${selectedCartProduct.unit||'unidad'}`}</span><strong>{formatMoney(cartCalculation.total)}</strong></div>}
            <button className="button button-outline pos-add-item" type="button" onClick={addCartLine} disabled={Boolean(selectedCartProduct&&!cartPriceAvailable)||Boolean(invalidMeasurementStockLink)}><Plus size={15}/> Agregar al carrito</button>
          </section>
          <section className="pos-cart" aria-label="Carrito de venta"><div className="pos-cart-heading"><div><span className="eyebrow">ORDEN ACTUAL</span><h3>{cart.length} {cart.length===1?'artículo':'artículos'}</h3></div><strong>{formatMoney(cartTotal)}</strong></div>{cart.length===0?<p className="pos-cart-empty">Agrega productos del catálogo o registra un concepto libre con precio acordado.</p>:<div className="pos-cart-lines">{cart.map((line)=><article className="pos-cart-line" key={line.key}><POSProductVisual src={line.image} className="pos-cart-image" iconSize={16}/><span className="pos-line-main"><b>{line.name}</b><small>{line.description||`${line.quantity} × ${formatMoney(line.unitPrice)}`}</small><small>{cartInventoryStatus(line)}</small></span><strong>{formatMoney(line.total||line.quantity*line.unitPrice)}</strong><button className="icon-button danger" type="button" aria-label={`Quitar ${line.name}`} onClick={()=>setCart(current=>current.filter(item=>item.key!==line.key))}><X size={15}/></button></article>)}</div>}</section></>}
        <section className="pos-payment-section"><div className="pos-payment-title"><div><span className="eyebrow">COBRO</span><h3>Forma de pago</h3></div><label className="pos-charge-toggle"><input type="checkbox" checked={chargeNow} onChange={(event)=>setChargeNow(event.target.checked)}/> Cobrar ahora</label></div>{chargeNow?<><div className="pos-payment-rows">{payments.map((payment)=><div className="pos-payment-row" key={payment.id}><label>Método<select value={payment.method} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,method:event.target.value}:row))}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select></label><label>{payments.length===1&&payment.amount===''?'Monto (vacío = total)':'Monto'}<div className="money-input"><span>$</span><input type="number" min={0.01} max={activeTotal||undefined} step={0.01} value={payment.amount} onChange={(event)=>setPayments(current=>current.map(row=>row.id===payment.id?{...row,amount:event.target.value}:row))} placeholder={payments.length===1?'Total de la venta':'0,00'}/></div></label><button className="icon-button danger" type="button" aria-label="Quitar forma de pago" title={payments.length===1?'Debe quedar al menos un método de pago':'Quitar forma de pago'} disabled={payments.length===1} onClick={()=>setPayments(current=>current.length>1?current.filter(row=>row.id!==payment.id):current)}><X size={14}/></button></div>)}</div><button type="button" className="button button-outline pos-add-payment" onClick={()=>setPayments(current=>[...current,{id:globalThis.crypto?.randomUUID?.()||`payment-${Date.now()}-${current.length}`,method:'Transferencia',amount:''}])}><Plus size={14}/> Agregar otro método</button><div className="pos-payment-balance"><span>Recibido al guardar</span><strong>{formatMoney(paymentPreview)}</strong><span>Saldo pendiente: <b>{formatMoney(Math.max(0,activeTotal-paymentPreview))}</b></span></div>{cashShiftUnavailable&&<p className="pos-checkout-guidance" role="status"><CircleHelp size={15}/><span>{cashierSession.error?'No se pudo verificar tu turno. Vuelve a cargar la página o revisa la sucursal.':'Para recibir efectivo, primero abre tu turno en Caja y producción.'}</span>{!cashierSession.error&&<Link to="/operaciones/flujos">Abrir turno</Link>}</p>}</>:<p className="pos-credit-note">La orden se registrará con saldo pendiente y sin pagos recibidos.</p>}</section>
<div className="field-grid pos-payment-fields"><label>Sucursal<select value={form.branchCode} onChange={(event)=>setForm({...form,branchCode:event.target.value})}><option value="VIS">Visual Corp</option><option value="GIGA">Gigaprint</option></select></label><POSCustomerPicker customers={data.customers||[]} remoteMatches={customerLookupActive&&canSearchCustomers&&!form.customerId&&customerSearch.results!==null&&!customerSearch.error?customerSearch.results:null} searchingCustomers={customerSearch.loading} searchError={customerSearch.error} onRetrySearch={()=>setCustomerSearchRequest((request)=>request+1)} canShowMore={Boolean(customerSearch.hasMore&&customerSearchLimit<20)} onShowMore={()=>setCustomerSearchLimit(20)} selectedCustomer={selectedCustomer} duplicateCustomer={duplicateCustomer} customerName={form.customer} onNewNameChange={(value)=>setForm((current)=>({...current,customer:value}))} query={customerQuery} onQueryChange={updateCustomerQuery} onSelect={choosePOSCustomer} phone={form.customerPhone} email={form.customerEmail} documentReference={form.customerDocumentReference} onContactChange={(field,value)=>setForm((current)=>({...current,[field==='phone'?'customerPhone':field==='email'?'customerEmail':'customerDocumentReference']:value}))} canViewSales={canViewCustomerHistory} historyLoading={customerHistory.loading} historyCount={customerHistory.count} historySummary={customerHistory.summary} recentPurchases={customerHistory.rows}/></div>
        <label>Notas internas<textarea rows={2} value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} placeholder="Detalles acordados para esta orden"/></label>{activeParkedOrderId&&<div className="pos-parked-active"><span>ORDEN RECUPERADA</span><b>Se conserva en espera hasta confirmar la venta.</b></div>}<div className="pos-submit-actions"><button className="button button-outline" type="button" disabled={parking||Boolean(activeParkedOrderId)||(!form.quoteId&&!cart.length)} onClick={parkCurrentOrder}>{activeParkedOrderId?'Ya está en espera':parking?'Guardando…':'Guardar en espera'} <ClipboardList size={15}/></button><button className="button button-dark form-submit" type="submit" disabled={!canSubmitSale}>{savingSale?'Guardando venta…':'Confirmar orden'} <Check size={16}/></button></div>{submitBlockReason&&<p className="pos-submit-guidance" role="status">{submitBlockReason}</p>}
      </form>
      <section className="panel pos-parked-panel"><div className="panel-heading"><div><span className="eyebrow">ÓRDENES RECUPERABLES</span><h2>En espera</h2></div><span className="muted-count">{parkedOrders.length} órdenes</span></div>{parkedOrders.length===0?<EmptyState icon={ClipboardList} title="No hay órdenes en espera" text="Guarda aquí un carrito o cotización para continuarla desde esta sucursal. No reserva stock."/>:<div className="activity-list">{parkedOrders.map(order=>{const payload=order.payload||{};const customerName=payload.form?.customer||payload.form?.quoteId&&centralQuotes.find(quote=>quote.id===payload.form.quoteId)?.customer_name||'Sin cliente';return <article className="sale-activity pos-parked-card" key={order.id}><div className="sale-row"><span className="sale-icon"><ClipboardList size={17}/></span><span><b>{customerName}</b><small>{branchNames[order.branch_id]||'Sucursal'} · {new Date(order.created_at).toLocaleString('es-EC',{dateStyle:'short',timeStyle:'short'})}</small></span><strong>{formatMoney(order.total)}</strong></div><div className="sale-payment-summary"><span>{payload.cart?.length|| (payload.form?.quoteId?'Cotización aprobada':'')} artículo(s)</span><span>Guardada por <b>{order.created_by===user?.id?'ti':'el equipo'}</b></span></div><button className="button button-outline" type="button" onClick={()=>resumeParkedOrder(order)}>Recuperar orden</button></article>;})}</div>}</section>
      <section className="panel pos-recent-panel"><div className="panel-heading"><div><span className="eyebrow">CAJA DEL DÍA</span><h2>Órdenes recientes</h2></div><span className="muted-count">{salesToday.length} registros</span></div>{salesToday.length===0?<EmptyState icon={Wallet} title="Todavía no hay ventas" text="Al confirmar una orden, aparecerá con sus pagos y movimientos."/>:<div className="activity-list">{salesToday.map((sale)=><article className="sale-activity" key={sale.id}><div className="sale-row"><span className="sale-icon"><ShoppingCart size={17}/></span><span><b>{sale.customer||sale.description||'Venta'}</b><small>{sale.method} · {new Date(sale.date).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})} · {sale.code}</small></span><strong>{formatMoney(sale.total)}</strong></div><div className="sale-payment-summary"><span>Abonado: <b>{formatMoney(sale.paid||0)}</b></span><span>Saldo: <b>{formatMoney(sale.balance||0)}</b></span>{sale.urgent&&<span className="inventory-status pending">Compra urgente pendiente</span>}</div>{Number(sale.balance)>0&&<><button className="button button-outline" type="button" onClick={()=>{setPaymentTarget(paymentTarget===sale.id?null:sale.id);setPaymentForm({amount:String(sale.balance),method:'Efectivo'});}}>Registrar abono</button>{paymentTarget===sale.id&&<form className="payment-form" onSubmit={(event)=>registerBalancePayment(event,sale)}><label>Monto recibido<input type="number" min={0.01} max={sale.balance} step={0.01} required value={paymentForm.amount} onChange={(event)=>setPaymentForm({...paymentForm,amount:event.target.value})}/></label><label>Forma de pago<select value={paymentForm.method} onChange={(event)=>setPaymentForm({...paymentForm,method:event.target.value})}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select></label><button className="button button-dark" type="submit">Guardar abono</button></form>}</>}</article>)}</div>}</section>
    </div><div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Control conectado</b><p>El carrito confirma todos sus artículos en una sola orden, conserva la cotización aprobada sin cambiar su total y permite abonos. Los faltantes de inventario se marcan como compra urgente; el POS no emite comprobantes tributarios.</p></div></div>
  </AppFrame>;
}

