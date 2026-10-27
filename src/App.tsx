import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Boxes, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, ClipboardList, Database, FileText, Globe2, History, Image, LayoutDashboard, LogOut, Megaphone, Menu, Package, Plus, Search, Settings2, ShoppingBag, ShoppingCart, Truck, Users, Wallet, X } from 'lucide-react';
import { WorkspaceProvider, formatDate, localDateKey, useWorkspace } from './app/workspace';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ProtectedPage } from './auth/ProtectedPage';
import { supabase } from './lib/supabaseClient';
import { AppFrame, Brand, PageHeading, StatCard } from './app/layout';
import { EmptyState, StageBadge } from './components/feedback';
import { OperationsQuotePage as QuotePage } from './pages/operations/OperationsQuotePage';
import './app.css';
import './public-site/deployment.css';
import './design-system.css';

const UnifiedHome = lazy(() => import('./pages/admin/DashboardPages').then((module) => ({ default: module.UnifiedHome })));
const WebsiteAdmin = lazy(() => import('./pages/admin/WebsiteAdminPage').then((module) => ({ default: module.WebsiteAdmin })));
const SiteArticleManager = lazy(() => import('./pages/admin/SiteArticleManager').then((module) => ({ default: module.SiteArticleManager })));
const BlogAdmin = lazy(() => import('./pages/admin/SiteArticleManager').then((module) => ({ default: module.BlogAdmin })));
const PublicationsAdmin = lazy(() => import('./pages/admin/SiteArticleManager').then((module) => ({ default: module.PublicationsAdmin })));
const PortfolioAdmin = lazy(() => import('./pages/admin/SiteArticleManager').then((module) => ({ default: module.PortfolioAdmin })));
const ServicesAdmin = lazy(() => import('./pages/admin/SiteSectionEditors').then((module) => ({ default: module.ServicesAdminPage })));
const ContactAdmin = lazy(() => import('./pages/admin/SiteSectionEditors').then((module) => ({ default: module.ContactAdminPage })));
const StorefrontAdmin = lazy(() => import('./pages/admin/StorefrontAdminPage').then((module) => ({ default: module.StorefrontAdminPage })));
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
const InventoryWorkspace = lazy(() => import('./components/InventoryWorkspace').then((module) => ({ default: module.InventoryWorkspace })));
const EquipmentInventory = lazy(() => import('./pages/operations/EquipmentInventory').then((module) => ({ default: module.EquipmentInventory })));
const PurchasingWorkspace = lazy(() => import('./components/PurchasingWorkspace').then((module) => ({ default: module.PurchasingWorkspace })));
const CustomerBook = lazy(() => import('./components/CustomerBook').then((module) => ({ default: module.CustomerBook })));
const TeamAccess = lazy(() => import('./components/TeamAccess').then((module) => ({ default: module.TeamAccess })));
const PersonnelPage = lazy(() => import('./components/PersonnelPage').then((module) => ({ default: module.PersonnelPage })));
const BackupWorkspace = lazy(() => import('./components/BackupWorkspace').then((module) => ({ default: module.BackupWorkspace })));
const ChangeLogPanel = lazy(() => import('./components/ChangeLog').then((module) => ({ default: module.ChangeLogPanel })));
const OperationsLifecycle = lazy(() => import('./pages/operations/OperationsLifecycle').then((module) => ({ default: module.OperationsLifecycle })));
const OperationsFinance = lazy(() => import('./pages/operations/OperationsFinance').then((module) => ({ default: module.OperationsFinance })));

const wordmark = '/brand/visualcorp-wordmark.png';
const symbol = '/brand/visualcorp-symbol.png';




function mostFrequent(values) { return values.sort((a,b)=>values.filter((item)=>item===b).length-values.filter((item)=>item===a).length)[0]; }

function InventoryPageLegacy() {
  const { data, add, update, remove }=useWorkspace();
  const [form,setForm]=useState({name:'',quantity:'',unit:'unidad',minimum:'0'});
  const [showForm,setShowForm]=useState(false);
  const save=(event)=>{event.preventDefault();if(!form.name.trim())return;add('inventory',{...form,quantity:Number(form.quantity)||0,minimum:Number(form.minimum)||0,unit:form.unit||'unidad'});setForm({name:'',quantity:'',unit:'unidad',minimum:'0'});setShowForm(false);};
  return <AppFrame area="operations"><PageHeading eyebrow="INVENTARIO" title="Materiales y existencias" description="Registra materiales manualmente y define un nivel mínimo de alerta." action={<button className="button button-dark" onClick={()=>setShowForm(!showForm)}><Plus size={16}/> Añadir material</button>}/><div className="stat-grid compact-stats"><StatCard label="Materiales" value={data.inventory.length} icon={Boxes} note="Registros locales" tone="violet"/><StatCard label="Stock bajo" value={data.inventory.filter((item)=>item.quantity<=item.minimum).length} icon={ArrowDownRight} note="En o bajo mínimo" tone="amber"/><StatCard label="Unidades registradas" value={data.inventory.reduce((sum,item)=>sum+Number(item.quantity),0)} icon={Package} note="Suma de cantidades" tone="blue"/></div>{showForm&&<form className="panel campaign-form" onSubmit={save}><div className="panel-heading"><h2>Nuevo material</h2><button type="button" className="icon-button" onClick={()=>setShowForm(false)}><X size={17}/></button></div><div className="field-grid"><label>Nombre<input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Ej. Material"/></label><label>Cantidad inicial<input type="number" min="0" step="any" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/></label><label>Unidad<input value={form.unit} onChange={(e)=>setForm({...form,unit:e.target.value})} placeholder="unidad, m, pliego…"/></label><label>Nivel mínimo<input type="number" min="0" step="any" value={form.minimum} onChange={(e)=>setForm({...form,minimum:e.target.value})}/></label></div><button className="button button-dark" type="submit">Guardar material <Check size={15}/></button></form>}<section className="panel"><div className="panel-heading"><div><span className="eyebrow">CONTROL DE EXISTENCIAS</span><h2>Inventario</h2></div><span className="muted-count">{data.inventory.length} materiales</span></div>{data.inventory.length===0?<EmptyState icon={Boxes} title="Inventario vacío" text="Añade el primer material; no se importaron existencias de otros sistemas." action={<button className="button button-outline" onClick={()=>setShowForm(true)}>Añadir material <Plus size={15}/></button>}/>:<div className="table-wrap"><table><thead><tr><th>Material</th><th>Existencia</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.inventory.map((item)=><tr key={item.id}><td><b>{item.name}</b><small>Actualizado {formatDate(item.updatedAt||item.createdAt)}</small></td><td><div className="quantity-edit"><button onClick={()=>update('inventory',item.id,{quantity:Math.max(0,Number(item.quantity)-1)})}>−</button><strong>{item.quantity}</strong><span>{item.unit}</span><button onClick={()=>update('inventory',item.id,{quantity:Number(item.quantity)+1})}>+</button></div></td><td>{item.minimum} {item.unit}</td><td><StageBadge stage={Number(item.quantity)<=Number(item.minimum)?'Stock bajo':'Disponible'}/></td><td><button className="icon-button danger" onClick={()=>remove('inventory',item.id)} title="Eliminar material"><X size={16}/></button></td></tr>)}</tbody></table></div>}</section><div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Existencias locales de prueba</b><p>Esta etapa no sincroniza con máquinas, compras, bodegas ni otros dispositivos. No se traspasaron materiales de GigaPrint.</p></div></div></AppFrame>;
}

function InventoryPage() { return <AppFrame area="operations"><PageHeading eyebrow="INVENTARIO" title="Existencias y movimientos" description="Consulta stock por sucursal y área; registra entradas, consumos, mermas y traspasos con responsable."/><InventoryWorkspace/></AppFrame>; }
function EquipmentPage() { return <AppFrame area="operations"><PageHeading eyebrow="INVENTARIO · ACTIVOS" title="Equipos y maquinaria" description="Organiza impresoras, computadoras, prensas, mobiliario y herramientas por área, sucursal, estado y condición."/><EquipmentInventory/></AppFrame>; }
function PurchasingPage() { return <AppFrame area="operations"><PageHeading eyebrow="ABASTECIMIENTO" title="Compras" description="Encuentra proveedores, prepara órdenes y registra cada recepción. El stock se actualiza solo con lo que llegó."/><PurchasingWorkspace/></AppFrame>; }

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
    <Route path="/panel" element={<ProtectedPage area="operations"><UnifiedHome/></ProtectedPage>}/><Route path="/admin" element={<Navigate to="/panel" replace/>}/><Route path="/operaciones" element={<Navigate to="/panel" replace/>}/><Route path="/admin/sitio" element={<ProtectedPage area="website"><WebsiteAdmin/></ProtectedPage>}/><Route path="/admin/servicios" element={<ProtectedPage area="website"><ServicesAdmin/></ProtectedPage>}/><Route path="/admin/tienda" element={<ProtectedPage area="website"><StorefrontAdmin/></ProtectedPage>}/><Route path="/admin/contacto" element={<ProtectedPage area="website"><ContactAdmin/></ProtectedPage>}/><Route path="/admin/contenido" element={<ProtectedPage area="website"><SiteArticleManager/></ProtectedPage>}/><Route path="/admin/blog" element={<ProtectedPage area="website"><BlogAdmin/></ProtectedPage>}/><Route path="/admin/publicaciones" element={<ProtectedPage area="website"><PublicationsAdmin/></ProtectedPage>}/><Route path="/admin/portafolio" element={<ProtectedPage area="website"><PortfolioAdmin/></ProtectedPage>}/><Route path="/admin/cambios" element={<Navigate to="/operaciones/cambios" replace/>}/><Route path="/admin/solicitudes" element={<Navigate to="/operaciones/crm" replace/>}/><Route path="/operaciones/catalogo" element={<ProtectedPage area="catalog"><CatalogPage/></ProtectedPage>}/><Route path="/admin/catalogo" element={<Navigate to="/operaciones/catalogo" replace/>}/><Route path="/admin/marketing" element={<Navigate to="/operaciones/marketing" replace/>}/><Route path="/admin/respaldo" element={<ProtectedPage area="website"><AppFrame area="admin"><PageHeading eyebrow="DATOS" title="Respaldo y migración" description="Consulta el respaldo y la procedencia de datos."/><BackupWorkspace/></AppFrame></ProtectedPage>}/>
    <Route path="/operaciones/cambios" element={<ProtectedPage area="operations"><AppFrame area="operations"><PageHeading eyebrow="EQUIPO" title="Novedades" description="Consulta los cambios compartidos por todo el equipo."/><ChangeLogPanel area="operations"/></AppFrame></ProtectedPage>}/> <Route path="/operaciones/pos" element={<ProtectedPage area="operations"><PosPage/></ProtectedPage>}/><Route path="/operaciones/finanzas" element={<ProtectedPage area="operations"><AppFrame area="operations"><PageHeading eyebrow="OPERACIONES · VENTAS" title="Finanzas" description="Consulta ventas confirmadas, pagos registrados y saldos por fecha, sucursal y asesora responsable."/><OperationsFinance/></AppFrame></ProtectedPage>}/><Route path="/operaciones/flujos" element={<ProtectedPage area="operations"><AppFrame area="operations"><PageHeading eyebrow="OPERACIONES" title="Flujos conectados" description="Revisa caja, devoluciones, compras, traslados, producción y cotizaciones desde sus registros compartidos."/><OperationsLifecycle/></AppFrame></ProtectedPage>}/><Route path="/operaciones/cotizador" element={<ProtectedPage area="operations"><QuotePage/></ProtectedPage>}/><Route path="/operaciones/inventario" element={<ProtectedPage area="operations"><InventoryPage/></ProtectedPage>}/><Route path="/operaciones/equipos" element={<ProtectedPage area="operations"><EquipmentPage/></ProtectedPage>}/><Route path="/operaciones/compras" element={<ProtectedPage area="operations"><PurchasingPage/></ProtectedPage>}/><Route path="/operaciones/clientes" element={<ProtectedPage area="operations"><AppFrame area="operations"><CustomerBook/></AppFrame></ProtectedPage>}/><Route path="/operaciones/crm" element={<ProtectedPage area="operations"><LeadsPage area="operations"/></ProtectedPage>}/><Route path="/operaciones/marketing" element={<ProtectedPage area="operations"><CampaignPage area="operations"/></ProtectedPage>}/><Route path="/operaciones/personal" element={<ProtectedPage area="operations"><AppFrame area="operations"><PersonnelPage/></AppFrame></ProtectedPage>}/><Route path="/operaciones/equipo" element={<ProtectedPage area="team"><AppFrame area="operations"><TeamAccess/></AppFrame></ProtectedPage>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><WorkspaceProvider><AppRouter/></WorkspaceProvider></AuthProvider></BrowserRouter>;
}
