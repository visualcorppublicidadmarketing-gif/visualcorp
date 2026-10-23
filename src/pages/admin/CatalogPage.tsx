import React, { useMemo, useState, useEffect } from 'react';
import { BadgeCheck, Check, CircleHelp, Search } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { formatMoney, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';

export function CatalogPriceControl({ item, editable = true, onSave }: { item: any; editable?: boolean; onSave: (price: number) => void }) {
  const [value, setValue] = useState(item.price ? String(item.price) : '');
  const dirty = Number(value || 0) !== Number(item.price || 0);
  useEffect(() => setValue(item.price ? String(item.price) : ''), [item.price]);
  return <div className="rate-edit"><div className="rate-input"><span>$</span><input aria-label={`Tarifa de ${item.name}`} type="number" min="0" step="0.01" value={value} onChange={(event)=>setValue(event.target.value)} placeholder="Sin tarifa" disabled={!editable}/></div>{editable&&<button className="rate-save" type="button" disabled={!dirty || Number(value)<0} onClick={()=>onSave(Number(value)||0)} title="Guardar tarifa editada"><Check size={14}/></button>}{editable&&dirty&&<small>Guarda antes de validar</small>}</div>;
}

export function CatalogPage() {
  const { data, update }=useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const [search,setSearch]=useState('');
  const canEditPrices=hasPermission('catalog_admin','edit_prices');
  const savePrice=async(item,price)=>{if(!canEditPrices)return;const {error}=await supabase.from('catalog_products').update({price,updated_at:new Date().toISOString()}).eq('id',item.id).eq('organization_id',organizationId);if(error){window.alert(`No se guardó la tarifa: ${error.message}`);return;}update('catalog',item.id,{price,confirmed:true});};
  const filtered=useMemo(()=>data.catalog.filter((item)=>`${item.name} ${item.family}`.toLowerCase().includes(search.toLowerCase())),[data.catalog,search]);
  return <AppFrame area="operations"><PageHeading eyebrow="CATÁLOGO DE VISUAL CORP" title="Productos y tarifas" description="Catálogo de cotizaciones cargado desde Supabase. Los cambios de tarifa autorizados se guardan en la base compartida." action={<span className="rate-pending"><BadgeCheck size={15}/> {data.catalog.length} productos</span>}/><div className="catalog-toolbar panel"><label className="search-box"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar producto o familia"/></label><span>{filtered.length} productos · precios de origen</span></div><section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Familia</th><th>Normal · USD</th><th>Instalación</th><th>Corporativo</th></tr></thead><tbody>{filtered.slice(0,100).map((item)=><tr key={item.id}><td><div className="catalog-product"><img src={item.image} alt="" loading="lazy"/><span><b>{item.name}</b><small>{item.unit}{item.description?` · ${item.description}`:''}</small></span></div></td><td>{item.family}</td><td><CatalogPriceControl item={item} editable={canEditPrices} onSave={(price)=>savePrice(item,price)}/></td><td>{item.installPrice==null?'No disponible':formatMoney(item.installPrice)}</td><td>{item.corporatePrice==null?'No disponible':formatMoney(item.corporatePrice)}</td></tr>)}</tbody></table>{filtered.length>100&&<div className="table-more">Mostrando 100 de {filtered.length}. Filtra por nombre o familia para encontrar otros.</div>}</div></section><div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Catálogo compartido de Visual Corp</b><p>Los precios e imágenes provienen del catálogo de cotizaciones de estebanico.com. Cuando una modalidad no tiene precio registrado, se muestra como no disponible. Las tarifas se guardan con permisos de administración y alimentan el cotizador público.</p></div></div></AppFrame>;
}
