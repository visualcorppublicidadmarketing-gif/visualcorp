import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Boxes, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, ClipboardList, Database, FileText, Globe2, History, Image, LayoutDashboard, LogOut, Megaphone, Menu, Package, Plus, Search, Settings2, ShoppingBag, ShoppingCart, Truck, Users, Wallet, X } from 'lucide-react';
import { WorkspaceProvider, formatDate, formatMoney, localDateKey, useWorkspace } from './app/workspace';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ProtectedPage } from './auth/ProtectedPage';
import { supabase } from './lib/supabaseClient';
import { AppFrame, Brand, PageHeading, StatCard } from './app/layout';
import { EmptyState, StageBadge } from './components/feedback';
import { QuotePriceComparison } from './components/QuotePriceComparison';
import { calculateQuotePrice, getQuoteBasis } from './lib/quotePricing';
import { InventoryWorkspace } from './components/InventoryWorkspace';
import { PurchasingWorkspace } from './components/PurchasingWorkspace';
import { CustomerBook } from './components/CustomerBook';
import { TeamAccess } from './components/TeamAccess';
import { BackupWorkspace } from './components/BackupWorkspace';
import { ChangeLogPanel } from './components/ChangeLog';
import { OperationsLifecycle } from './pages/operations/OperationsLifecycle';
import './app.css';
import './public-site/deployment.css';
import './design-system.css';

const AdminHome = lazy(() => import('./pages/admin/DashboardPages').then((module) => ({ default: module.AdminHome })));
const OperationsHome = lazy(() => import('./pages/admin/DashboardPages').then((module) => ({ default: module.OperationsHome })));
const WebsiteAdmin = lazy(() => import('./pages/admin/WebsiteAdminPage').then((module) => ({ default: module.WebsiteAdmin })));
const SiteArticleManager = lazy(() => import('./pages/admin/SiteArticleManager').then((module) => ({ default: module.SiteArticleManager })));
const LeadsPage = lazy(() => import('./pages/admin/CRMPage').then((module) => ({ default: module.LeadsPage })));
const CampaignPage = lazy(() => import('./pages/admin/CampaignPage').then((module) => ({ default: module.CampaignPage })));
const CatalogPage = lazy(() => import('./pages/admin/CatalogPage').then((module) => ({ default: module.CatalogPage })));
const PosPage = lazy(() => import('./pages/pos/CheckoutWorkspace').then((module) => ({ default: module.PosPage })));
const PublicSiteLayout = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.PublicSiteLayout })));
const PublicHomePage = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.PublicHomePage })));
const ServicesIndexPage = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.ServicesIndexPage })));
const ServiceDetailPage = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.ServiceDetailPage })));
const AboutPage = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.AboutPage })));
const ProcessPage = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.ProcessPage })));
const ContactPage = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.ContactPage })));
const MultiPageQuotePage = lazy(() => import('./public-site/PublicSite').then((module) => ({ default: module.PublicQuotePage })));
const BlogIndexPage = lazy(() => import('./public-site/ShowcasePages').then((module) => ({ default: module.BlogIndexPage })));
const PublicationIndexPage = lazy(() => import('./public-site/ShowcasePages').then((module) => ({ default: module.PublicationIndexPage })));
const PortfolioIndexPage = lazy(() => import('./public-site/ShowcasePages').then((module) => ({ default: module.PortfolioIndexPage })));
const ArticleDetailPage = lazy(() => import('./public-site/ShowcasePages').then((module) => ({ default: module.ArticleDetailPage })));
const PublicationDetailPage = lazy(() => import('./public-site/ShowcasePages').then((module) => ({ default: module.PublicationArticleDetailPage })));
const PortfolioDetailPage = lazy(() => import('./public-site/ShowcasePages').then((module) => ({ default: module.PortfolioArticleDetailPage })));
const StorefrontPage = lazy(() => import('./public-site/ShowcasePages').then((module) => ({ default: module.StorefrontPage })));

const wordmark = '/brand/visualcorp-wordmark.png';
const symbol = '/brand/visualcorp-symbol.png';




function mostFrequent(values) { return values.sort((a,b)=>values.filter((item)=>item===b).length-values.filter((item)=>item===a).length)[0]; }

function QuotePage() {
  const { data, flash }=useWorkspace();
  const { organizationId }=useAuth();
  const [term,setTerm]=useState('');
  const [productId,setProductId]=useState('');
  const [qty,setQty]=useState(1);
  const [widthCm,setWidthCm]=useState(100);
  const [heightCm,setHeightCm]=useState(100);
  const [priceTier,setPriceTier]=useState('pvp');
  const [optionPrice,setOptionPrice]=useState('');
  const [customer,setCustomer]=useState('');
  const [phone,setPhone]=useState('');
  const [itemLabel,setItemLabel]=useState('');
  const [centralQuotes,setCentralQuotes]=useState([]);
  const [saving,setSaving]=useState(false);
  const [quoteError,setQuoteError]=useState('');
  useEffect(()=>{if(!supabase||!organizationId)return;let active=true;supabase.from('central_quotes').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(100).then(({data:rows,error})=>{if(!active)return;if(error)setQuoteError(error.message);else setCentralQuotes(rows||[]);});return()=>{active=false;};},[organizationId]);
  const matched=useMemo(()=>data.catalog.filter((item)=>`${item.name} ${item.family}`.toLowerCase().includes(term.toLowerCase())).slice(0,80),[data.catalog,term]);
  const selected=data.catalog.find((item)=>item.id===productId);
  const area=selected?.mode==='area'?(Math.max(0,Number(widthCm)||0)*Math.max(0,Number(heightCm)||0))/10000:0;
  const basis=getQuoteBasis(selected,{quantity:qty,area});
  const total=calculateQuotePrice(selected,priceTier,basis);
  const confirmedTotal=selected?.confirmed?total:null;
  const selectedTierLabel=priceTier==='instalacion'?'Con instalación':priceTier==='corporativo'?'Corporativo':'Normal';
  const save=async(event)=>{event.preventDefault();if(!selected||!supabase||!organizationId)return;setSaving(true);setQuoteError('');try{const totals={normal:calculateQuotePrice(selected,'pvp',basis,optionPrice),installation:calculateQuotePrice(selected,'instalacion',basis,optionPrice),corporate:calculateQuotePrice(selected,'corporativo',basis,optionPrice)};const chosen={pvp:'normal',instalacion:'installation',corporativo:'corporate'}[priceTier]||'normal';const {data:result,error}=await supabase.rpc('create_central_quote',{p_customer_id:null,p_customer_name:customer.trim(),p_customer_phone:phone.trim(),p_items:[{product_id:selected.id,name:itemLabel.trim()||selected.name,category:selected.family,quantity:basis,unit:selected.mode==='area'?'m²':selected.unit,total:confirmedTotal,price_tier:priceTier,option:optionPrice||null,width_cm:selected.mode==='area'?Number(widthCm):null,height_cm:selected.mode==='area'?Number(heightCm):null,image:selected.image||null}],p_normal:totals.normal,p_installation:totals.installation,p_corporate:totals.corporate,p_chosen:chosen,p_selected:confirmedTotal,p_confirmed:Boolean(selected.confirmed),p_notes:''});if(error)throw error;const {data:rows,error:readError}=await supabase.from('central_quotes').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(100);if(readError)throw readError;setCentralQuotes(rows||[]);setProductId('');setItemLabel('');setCustomer('');setPhone('');setQty(1);setWidthCm(100);setHeightCm(100);setPriceTier('pvp');setOptionPrice('');setTerm('');flash(`Cotización ${result.quote_code} guardada y sincronizada.`);}catch(error){setQuoteError(error.message||'No se pudo sincronizar la cotización.');}finally{setSaving(false);}};
  return <AppFrame area="operations"><PageHeading eyebrow="COTIZADOR" title="Tres tarifas, en tiempo real." description="Compara las tarifas normal, con instalación y corporativa desde el catálogo compartido."/><div className="quote-grid"><form className="panel form-panel" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">NUEVA PROPUESTA</span><h2>Detalle de cotización</h2></div><FileText size={19}/></div><label>Buscar en el catálogo<div className="search-input"><Search size={16}/><input value={term} onChange={(e)=>setTerm(e.target.value)} placeholder="Producto o familia"/></div></label><label>Selecciona un producto<select required value={productId} onChange={(e)=>{setProductId(e.target.value);setPriceTier('pvp');setOptionPrice('');}}><option value="">Elige del catálogo ({data.catalog.length})</option>{matched.map((item)=><option key={item.id} value={item.id}>{item.family} · {item.name}{!item.confirmed?' · tarifa pendiente':''}</option>)}</select></label>
    {selected?.mode==='area'&&<div className="field-grid"><label>Ancho (cm)<input type="number" min="1" step="any" value={widthCm} onChange={(e)=>setWidthCm(e.target.value)}/></label><label>Alto (cm)<input type="number" min="1" step="any" value={heightCm} onChange={(e)=>setHeightCm(e.target.value)}/></label><div className="quote-area-readout">Área por pieza <b>{area.toFixed(2)} m²</b></div></div>}
    <div className="form-row"><label>{selected?.mode==='area'?'Cantidad de piezas':'Cantidad'}<input min="1" step="1" type="number" value={qty} onChange={(e)=>setQty(e.target.value)}/></label><label>Concepto (opcional)<input value={itemLabel} onChange={(e)=>setItemLabel(e.target.value)} placeholder="Descripción para el cliente"/></label></div>
    {selected&&<><div className="quote-product-preview"><img src={selected.image} alt=""/><div><b>{selected.name}</b><small>{selected.description||selected.family}</small></div></div>{selected.optionPrices?.length>0&&<label>Opción<select value={optionPrice} onChange={(e)=>setOptionPrice(e.target.value)}><option value="">Selecciona una opción</option>{selected.optionPrices.map((option,index)=><option key={`${option.label}-${index}`} value={option.label}>{option.label} · {formatMoney(option.price)}</option>)}</select></label>}<QuotePriceComparison product={selected} basis={basis} selectedTier={priceTier} optionChoice={optionPrice} onSelect={setPriceTier}/></>}
    <div className="divider-label">DATOS DEL CLIENTE · OPCIONAL</div><div className="form-row"><label>Nombre<input value={customer} onChange={(e)=>setCustomer(e.target.value)} placeholder="Cliente o empresa"/></label><label>Teléfono<input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="09…"/></label></div><div className="quote-total"><span>Total de la propuesta · {selectedTierLabel}</span><b>{!selected?'Selecciona un producto':!selected.confirmed?'Pendiente de validar':confirmedTotal===null?'Sin tarifa para esta opción':formatMoney(confirmedTotal)}</b></div>{quoteError&&<div className="op-flow-alert error">{quoteError}</div>}<button className="button button-dark form-submit" disabled={!selected||total===null||saving} type="submit">{saving?'Guardando…':'Guardar cotización central'} <Check size={16}/></button></form><section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIAL COMPARTIDO</span><h2>Propuestas recientes</h2></div><span className="muted-count">{centralQuotes.length} en total</span></div><div className="activity-list">{centralQuotes.slice(0,30).map(q=><article className="sale-activity" key={q.id}><div className="sale-row"><span className="sale-icon"><FileText size={17}/></span><span><b>{q.quote_code} · {q.customer_name||'Sin cliente'}</b><small>{Array.isArray(q.items)?q.items.map(i=>i.name).join(', '):''} · {new Date(q.created_at).toLocaleDateString('es-EC')}</small></span><strong>{q.selected_total===null?'Por validar':formatMoney(q.selected_total)}</strong></div><div className="sale-payment-summary"><span>Estado: <b>{q.status}</b></span><span>Tarifa: <b>{q.price_confirmed?'Confirmada':'Por confirmar'}</b></span></div></article>)}{!centralQuotes.length&&<EmptyState icon={FileText} title="Aún no hay cotizaciones" text="Las propuestas guardadas aquí se sincronizan con el equipo."/>}</div></section></div><div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Cotizaciones sincronizadas</b><p>Las nuevas propuestas guardan sus artículos, imágenes, tarifa seleccionada, las tres opciones disponibles y el estado en Supabase para que el POS y el equipo consulten el mismo historial.</p></div></div></AppFrame>;
}

function InventoryPageLegacy() {
  const { data, add, update, remove }=useWorkspace();
  const [form,setForm]=useState({name:'',quantity:'',unit:'unidad',minimum:'0'});
  const [showForm,setShowForm]=useState(false);
  const save=(event)=>{event.preventDefault();if(!form.name.trim())return;add('inventory',{...form,quantity:Number(form.quantity)||0,minimum:Number(form.minimum)||0,unit:form.unit||'unidad'});setForm({name:'',quantity:'',unit:'unidad',minimum:'0'});setShowForm(false);};
  return <AppFrame area="operations"><PageHeading eyebrow="INVENTARIO" title="Materiales y existencias" description="Registra materiales manualmente y define un nivel mínimo de alerta." action={<button className="button button-dark" onClick={()=>setShowForm(!showForm)}><Plus size={16}/> Añadir material</button>}/><div className="stat-grid compact-stats"><StatCard label="Materiales" value={data.inventory.length} icon={Boxes} note="Registros locales" tone="violet"/><StatCard label="Stock bajo" value={data.inventory.filter((item)=>item.quantity<=item.minimum).length} icon={ArrowDownRight} note="En o bajo mínimo" tone="amber"/><StatCard label="Unidades registradas" value={data.inventory.reduce((sum,item)=>sum+Number(item.quantity),0)} icon={Package} note="Suma de cantidades" tone="blue"/></div>{showForm&&<form className="panel campaign-form" onSubmit={save}><div className="panel-heading"><h2>Nuevo material</h2><button type="button" className="icon-button" onClick={()=>setShowForm(false)}><X size={17}/></button></div><div className="field-grid"><label>Nombre<input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Ej. Material"/></label><label>Cantidad inicial<input type="number" min="0" step="any" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/></label><label>Unidad<input value={form.unit} onChange={(e)=>setForm({...form,unit:e.target.value})} placeholder="unidad, m, pliego…"/></label><label>Nivel mínimo<input type="number" min="0" step="any" value={form.minimum} onChange={(e)=>setForm({...form,minimum:e.target.value})}/></label></div><button className="button button-dark" type="submit">Guardar material <Check size={15}/></button></form>}<section className="panel"><div className="panel-heading"><div><span className="eyebrow">CONTROL DE EXISTENCIAS</span><h2>Inventario</h2></div><span className="muted-count">{data.inventory.length} materiales</span></div>{data.inventory.length===0?<EmptyState icon={Boxes} title="Inventario vacío" text="Añade el primer material; no se importaron existencias de otros sistemas." action={<button className="button button-outline" onClick={()=>setShowForm(true)}>Añadir material <Plus size={15}/></button>}/>:<div className="table-wrap"><table><thead><tr><th>Material</th><th>Existencia</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.inventory.map((item)=><tr key={item.id}><td><b>{item.name}</b><small>Actualizado {formatDate(item.updatedAt||item.createdAt)}</small></td><td><div className="quantity-edit"><button onClick={()=>update('inventory',item.id,{quantity:Math.max(0,Number(item.quantity)-1)})}>−</button><strong>{item.quantity}</strong><span>{item.unit}</span><button onClick={()=>update('inventory',item.id,{quantity:Number(item.quantity)+1})}>+</button></div></td><td>{item.minimum} {item.unit}</td><td><StageBadge stage={Number(item.quantity)<=Number(item.minimum)?'Stock bajo':'Disponible'}/></td><td><button className="icon-button danger" onClick={()=>remove('inventory',item.id)} title="Eliminar material"><X size={16}/></button></td></tr>)}</tbody></table></div>}</section><div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Existencias locales de prueba</b><p>Esta etapa no sincroniza con máquinas, compras, bodegas ni otros dispositivos. No se traspasaron materiales de GigaPrint.</p></div></div></AppFrame>;
}

function InventoryPage() { return <AppFrame area="operations"><PageHeading eyebrow="INVENTARIO" title="Existencias y movimientos" description="Consulta stock por sucursal y área; registra entradas, consumos, mermas y traspasos con responsable."/><InventoryWorkspace/></AppFrame>; }
function PurchasingPage() { return <AppFrame area="operations"><PageHeading eyebrow="ABASTECIMIENTO" title="Compras y proveedores" description="Consolida necesidades, sigue órdenes y registra recepciones parciales con trazabilidad hasta el inventario."/><PurchasingWorkspace/></AppFrame>; }

function AppRouter() {
  const location=useLocation();
  if(location.pathname==='/publico') return <Navigate to="/" replace/>;
  return <Suspense fallback={<main className="access-screen"><p>Cargando el espacio solicitado.</p></main>}><Routes>
    <Route element={<PublicSiteLayout/>}>
      <Route path="/" element={<PublicHomePage/>}/>
      <Route path="/servicios" element={<ServicesIndexPage/>}/>
      <Route path="/servicios/:slug" element={<ServiceDetailPage/>}/>
      <Route path="/nosotros" element={<AboutPage/>}/>
      <Route path="/como-trabajamos" element={<ProcessPage/>}/>
      <Route path="/contacto" element={<ContactPage/>}/>
      <Route path="/cotizador" element={<MultiPageQuotePage/>}/>
      <Route path="/tienda" element={<StorefrontPage/>}/>
      <Route path="/portafolio" element={<PortfolioIndexPage/>}/>
      <Route path="/portafolio/:slug" element={<PortfolioDetailPage/>}/>
      <Route path="/blog" element={<BlogIndexPage/>}/>
      <Route path="/blog/:slug" element={<ArticleDetailPage/>}/>
      <Route path="/publicaciones" element={<PublicationIndexPage/>}/>
      <Route path="/publicaciones/:slug" element={<PublicationDetailPage/>}/>
    </Route>
    <Route path="/admin" element={<ProtectedPage area="website"><AdminHome/></ProtectedPage>}/><Route path="/admin/sitio" element={<ProtectedPage area="website"><WebsiteAdmin/></ProtectedPage>}/><Route path="/admin/contenido" element={<ProtectedPage area="website"><SiteArticleManager/></ProtectedPage>}/><Route path="/admin/cambios" element={<ProtectedPage area="website"><AppFrame area="admin"><PageHeading eyebrow="REGISTRO INTERNO" title="Novedades" description="Redacta y publica cambios para administración y operaciones."/><ChangeLogPanel area="admin"/></AppFrame></ProtectedPage>}/> <Route path="/admin/solicitudes" element={<ProtectedPage area="website"><LeadsPage/></ProtectedPage>}/><Route path="/operaciones/catalogo" element={<ProtectedPage area="catalog"><CatalogPage/></ProtectedPage>}/><Route path="/admin/catalogo" element={<Navigate to="/operaciones/catalogo" replace/>}/><Route path="/admin/marketing" element={<ProtectedPage area="website"><CampaignPage/></ProtectedPage>}/><Route path="/admin/respaldo" element={<ProtectedPage area="website"><AppFrame area="admin"><PageHeading eyebrow="DATOS" title="Respaldo y migración" description="Consulta el respaldo y la procedencia de datos."/><BackupWorkspace/></AppFrame></ProtectedPage>}/>
    <Route path="/operaciones" element={<ProtectedPage area="operations"><OperationsHome/></ProtectedPage>}/><Route path="/operaciones/cambios" element={<ProtectedPage area="operations"><AppFrame area="operations"><PageHeading eyebrow="EQUIPO" title="Novedades" description="Consulta los cambios compartidos por administración."/><ChangeLogPanel area="operations"/></AppFrame></ProtectedPage>}/> <Route path="/operaciones/pos" element={<ProtectedPage area="operations"><PosPage/></ProtectedPage>}/><Route path="/operaciones/flujos" element={<ProtectedPage area="operations"><AppFrame area="operations"><PageHeading eyebrow="OPERACIONES" title="Flujos conectados" description="Gestiona caja, devoluciones, traslados, producción y cotizaciones desde el mismo registro compartido."/><OperationsLifecycle/></AppFrame></ProtectedPage>}/><Route path="/operaciones/cotizador" element={<ProtectedPage area="operations"><QuotePage/></ProtectedPage>}/><Route path="/operaciones/inventario" element={<ProtectedPage area="operations"><InventoryPage/></ProtectedPage>}/><Route path="/operaciones/compras" element={<ProtectedPage area="operations"><PurchasingPage/></ProtectedPage>}/><Route path="/operaciones/clientes" element={<ProtectedPage area="operations"><AppFrame area="operations"><CustomerBook/></AppFrame></ProtectedPage>}/><Route path="/operaciones/crm" element={<ProtectedPage area="operations"><LeadsPage area="operations"/></ProtectedPage>}/><Route path="/operaciones/marketing" element={<ProtectedPage area="operations"><CampaignPage area="operations"/></ProtectedPage>}/><Route path="/operaciones/equipo" element={<ProtectedPage area="team"><AppFrame area="operations"><TeamAccess/></AppFrame></ProtectedPage>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><WorkspaceProvider><AppRouter/></WorkspaceProvider></AuthProvider></BrowserRouter>;
}
