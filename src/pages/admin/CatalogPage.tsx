import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, CircleHelp, Grid2X2, Layers3, Search, SlidersHorizontal } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { formatMoney, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import './catalog-page.css';

export function CatalogPriceControl({ item, editable = true, onSave }: { item: any; editable?: boolean; onSave: (price: number) => void }) {
  const [value, setValue] = useState(item.price ? String(item.price) : '');
  const dirty = Number(value || 0) !== Number(item.price || 0);
  useEffect(() => setValue(item.price ? String(item.price) : ''), [item.price]);
  return <div className="rate-edit"><div className="rate-input"><span>$</span><input aria-label={`Tarifa normal de ${item.name}`} type="number" min="0" step="0.01" value={value} onChange={(event)=>setValue(event.target.value)} placeholder="Sin tarifa" disabled={!editable}/></div>{editable&&<button className="rate-save" type="button" disabled={!dirty || Number(value)<0} onClick={()=>onSave(Number(value)||0)} title="Guardar tarifa editada"><Check size={14}/></button>}{editable&&dirty&&<small>Guarda para actualizar</small>}</div>;
}

export function CatalogPage() {
  const { data, update }=useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const [search,setSearch]=useState('');
  const [familyFilter,setFamilyFilter]=useState('Todas');
  const canEditPrices=hasPermission('catalog_admin','edit_prices');
  const families=useMemo(()=>[...new Set<string>(data.catalog.map((item)=>item.family?.trim()||'General'))].sort((a,b)=>a.localeCompare(b,'es')),[data.catalog]);
  const filtered=useMemo(()=>data.catalog.filter((item)=>`${item.name} ${item.family} ${item.description||''} ${item.unit||''}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))&&(familyFilter==='Todas'||(item.family?.trim()||'General')===familyFilter)),[data.catalog,search,familyFilter]);
  const grouped=useMemo<Array<[string,any[]]>>(()=>{const groups=new Map<string,any[]>();for(const item of filtered){const family=item.family?.trim()||'General';groups.set(family,[...(groups.get(family)||[]),item]);}return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,'es'));},[filtered]);
  const savePrice=async(item,price)=>{if(!canEditPrices)return;const {error}=await supabase.from('catalog_products').update({price,updated_at:new Date().toISOString()}).eq('id',item.id).eq('organization_id',organizationId);if(error){window.alert(`No se guardó la tarifa: ${error.message}`);return;}update('catalog',item.id,{price,confirmed:true});};
  return <AppFrame area="operations">
    <div className="catalog-page">
      <PageHeading eyebrow="CATÁLOGO DE VISUAL CORP" title="Productos y tarifas" description="Explora por familia, compara modalidades y busca por nombre o descripción." action={<span className="rate-pending"><BadgeCheck size={15}/> {data.catalog.length} productos</span>}/>
      <section className="catalog-overview" aria-label="Resumen del catálogo">
        <article className="panel"><span><Layers3 size={17}/></span><div><small>FAMILIAS</small><b>{families.length}</b></div></article>
        <article className="panel"><span><Grid2X2 size={17}/></span><div><small>PRODUCTOS MOSTRADOS</small><b>{filtered.length}</b></div></article>
        <article className="panel"><span><BadgeCheck size={17}/></span><div><small>PRECIOS DE REFERENCIA</small><b>USD</b></div></article>
      </section>
      <section className="catalog-browser panel" aria-label="Buscar y filtrar catálogo">
        <div className="catalog-toolbar"><label className="search-box"><Search size={17}/><input aria-label="Buscar en el catálogo" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Busca productos, familias o características"/>{search&&<button type="button" onClick={()=>setSearch('')} aria-label="Limpiar búsqueda">×</button>}</label><span><SlidersHorizontal size={15}/>{filtered.length} resultados</span></div>
        <div className="catalog-family-filters" role="group" aria-label="Filtrar por familia"><button type="button" className={familyFilter==='Todas'?'active':''} aria-pressed={familyFilter==='Todas'} onClick={()=>setFamilyFilter('Todas')}>Todas <i>{data.catalog.length}</i></button>{families.map((family)=><button type="button" key={family} className={familyFilter===family?'active':''} aria-pressed={familyFilter===family} onClick={()=>setFamilyFilter(family)}>{family}<i>{data.catalog.filter((item)=>(item.family?.trim()||'General')===family).length}</i></button>)}</div>
      </section>
      {grouped.length?grouped.map(([family,items])=><section className="panel catalog-family" key={family}>
        <header><div><span className="catalog-family-icon"><Layers3 size={17}/></span><span><h2>{family}</h2><small>{items.length} {items.length===1?'producto':'productos'}</small></span></div><span className="catalog-rate-headings"><b>Normal</b><b>Instalación</b><b>Corporativo</b></span></header>
        <div className="catalog-products">{items.map((item)=><article className="catalog-product-card" key={item.id}>
          <div className="catalog-product-identity"><img src={item.image} alt="" loading="lazy"/><span><b>{item.name}</b><small>{item.unit||'Unidad'}{item.description?` · ${item.description}`:''}</small></span></div>
          <div className="catalog-product-prices"><div><span>Normal</span><CatalogPriceControl item={item} editable={canEditPrices} onSave={(price)=>savePrice(item,price)}/></div><div><span>Instalación</span><b>{item.installPrice==null?'No disponible':formatMoney(item.installPrice)}</b></div><div><span>Corporativo</span><b>{item.corporatePrice==null?'No disponible':formatMoney(item.corporatePrice)}</b></div></div>
        </article>)}</div>
      </section>):<section className="panel catalog-no-results"><Search size={23}/><b>{data.catalog.length?'No hay productos que coincidan':'El catálogo está vacío'}</b><span>{data.catalog.length?'Prueba otra búsqueda o selecciona otra familia.':'Los productos disponibles aparecerán aquí cuando cargue el catálogo.'}</span>{(search||familyFilter!=='Todas')&&<button className="button button-outline" type="button" onClick={()=>{setSearch('');setFamilyFilter('Todas')}}>Quitar filtros</button>}</section>}
      <div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Precios y referencias</b><p>Los precios provienen del catálogo compartido. Si una modalidad no tiene tarifa registrada, se indica como no disponible. Los cambios de tarifa requieren permiso de administración y se reflejan en el cotizador.</p></div></div>
    </div>
  </AppFrame>;
}
