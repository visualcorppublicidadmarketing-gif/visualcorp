import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Boxes, CircleAlert, ClipboardList, Plus, Search } from 'lucide-react';
import { useWorkspace, formatDate, formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import './InventoryWorkspace.css';
import { InventoryInsights } from './InventoryInsights';

const areas = ['Impresión', 'Sublimación', 'Troquelado', 'Láser', 'Taller', 'Neones', 'Bodega general'];
const branches = ['Visual Corp', 'Gigaprint'];
const blankItem = { name:'', category:'', itemType:'', tags:'', referenceImageUrl:'', variant:'', area:'Taller', branch:'Visual Corp', location:'MAIN', unit:'unidad', quantity:'', minimum:'0', sku:'', notes:'' };
const areaCodes = { 'Impresión':'IMP', 'Sublimación':'SUB', 'Troquelado':'TRO', 'Láser':'LAS', 'Taller':'TAL', 'Neones':'NEO', 'Bodega general':'BOD' };
const formatEventDate = (value) => value ? new Intl.DateTimeFormat('es-EC',{dateStyle:'short',timeStyle:'short',timeZone:'America/Guayaquil'}).format(new Date(value)) : 'Sin fecha';

export function InventoryWorkspace() {
  const navigate = useNavigate();
  const { data, flash, refreshRemote } = useWorkspace();
  const { organizationId, user, roles } = useAuth();
  const [importRows, setImportRows] = useState([]);
  const [importBatches, setImportBatches] = useState({});
  const [pendingImportCount, setPendingImportCount] = useState(null);
  const [catalogLinks, setCatalogLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState({ catalogProductId:'', variantId:'', branch:'Visual Corp', location:'MAIN' });
  const [showForm,setShowForm]=useState(false); const [movement,setMovement]=useState(null); const [draft,setDraft]=useState(blankItem); const [costEdit,setCostEdit]=useState(null);
  const [savingMovement,setSavingMovement]=useState(false);
  const [savingItem,setSavingItem]=useState(false);
  const [metadataEdit,setMetadataEdit]=useState(null); const [reservationEdit,setReservationEdit]=useState(null);
  const [eventTerm,setEventTerm]=useState(''); const [eventType,setEventType]=useState('Todos');
  const canSeeCosts=roles.some((role)=>['owner','admin','manager'].includes(role));
  const canManageInventory=roles.some((role)=>['owner','admin','manager','warehouse','production'].includes(role));
  const canManageLinks=roles.some((role)=>['owner','admin','manager','warehouse'].includes(role));
  const canRequestTransfer=roles.some((role)=>['owner','admin','manager','warehouse','advisor'].includes(role));
  const items=data.inventory||[]; const events=data.inventoryMovements||[];
  React.useEffect(() => {
    if (!supabase || !organizationId) return;
    let active = true;
    Promise.all([
      supabase.from('inventory_import_rows').select('id,batch_id,source_sheet,source_row,source_reference,candidate,raw_row,review_note', { count: 'exact' }).eq('organization_id', organizationId).eq('mapping_status', 'pending_review').order('source_sheet').order('source_row').limit(100),
      supabase.from('inventory_import_batches').select('id,source_file,branch_id,row_count,import_status,source_uri').eq('organization_id', organizationId),
    ]).then(([rowsResult, batchesResult]) => {
      if (!active) return;
      if (rowsResult.error || batchesResult.error) { flash(`No se pudo leer la cola de importación: ${(rowsResult.error || batchesResult.error).message}`); return; }
      setImportRows(rowsResult.data || []);
      setPendingImportCount(rowsResult.count || 0);
      setImportBatches(Object.fromEntries((batchesResult.data || []).map((batch) => [batch.id, batch])));
    });
    return () => { active = false; };
  }, [organizationId]);
  React.useEffect(() => {
    if (!supabase || !organizationId) return;
    let active = true;
    supabase.from('catalog_inventory_links').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id',organizationId).order('created_at')
      .then(({data: rows,error}) => {
        if (!active) return;
        if (error) { flash(`No se pudieron cargar los vínculos catálogo-inventario: ${error.message}`); return; }
        setCatalogLinks(rows || []);
      });
    return () => { active = false; };
  }, [organizationId]);
  const low=items.filter(i=>!i.archived&&!i.sourceStatus&&Number(i.quantity)<=Number(i.minimum));
  const uncounted=items.filter(i=>!i.archived&&i.sourceStatus);
  const activeItems=items.filter(i=>!i.archived);
  const availableItems=activeItems.filter(i=>!i.sourceStatus&&Number(i.availableQuantity||0)>0);
  const filteredEvents=useMemo(()=>events.filter(ev=>{
    const matchesType=eventType==='Todos'||ev.type===eventType;
    const searchable=`${ev.itemName} ${ev.branch} ${ev.location} ${ev.type} ${ev.actor} ${ev.reason} ${ev.referenceType} ${ev.reference}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const query=eventTerm.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    return matchesType&&searchable.includes(query);
  }),[events,eventTerm,eventType]);
  const startTransfer=(item)=>navigate(`/operaciones/flujos?tab=transfers&variant=${encodeURIComponent(item.variantId)}&from=${encodeURIComponent(item.branchId)}&location=${encodeURIComponent(item.location||'MAIN')}`);
  const saveMetadata=async(e)=>{e.preventDefault();if(!metadataEdit||!supabase||!user||!canManageInventory)return;const {id,remoteItemId,tags,...fields}=metadataEdit;const normalizedTags=[...new Set(String(tags||'').split(',').map(tag=>tag.trim().slice(0,48)).filter(Boolean))].slice(0,40);let customFields={};try{customFields=JSON.parse(fields.customFields||'{}');if(!customFields||typeof customFields!=='object'||Array.isArray(customFields))throw new Error('Debe ser un objeto JSON.');}catch(error){flash(`Revisa los datos extra: ${error.message}`);return;}const {error}=await supabase.from('inventory_items').update({item_type:String(fields.itemType||'').trim(),tags:normalizedTags,reference_image_url:String(fields.referenceImageUrl||'').trim()||null,custom_fields:customFields,updated_at:new Date().toISOString()}).eq('id',remoteItemId).eq('organization_id',organizationId);if(error){flash(`No se pudo actualizar la ficha: ${error.message}`);return;}await refreshRemote();setMetadataEdit(null);flash('Ficha del artículo actualizada.');};
  const saveReservation=async(e)=>{e.preventDefault();if(!reservationEdit||!supabase||!canManageLinks)return;const item=items.find(row=>row.id===reservationEdit.itemId);const amount=Number(reservationEdit.quantity);if(!item||!Number.isFinite(amount)||amount<0)return;const {error}=await supabase.rpc('set_inventory_reservation',{p_variant_id:item.variantId,p_branch_id:item.branchId,p_reserved_quantity:amount,p_location_code:item.location||'MAIN',p_note:reservationEdit.note||''});if(error){flash(`No se pudo guardar la reserva: ${error.message}`);return;}await refreshRemote();setReservationEdit(null);flash('Reserva registrada y el POS ya descontará esas unidades de la disponibilidad.');};
  const saveItem=async(e)=>{
    e.preventDefault();
    if(!draft.name.trim()||!supabase||!organizationId||!user||!canManageInventory||savingItem)return;
    const hasCount=draft.quantity.trim()!=='';
    if(hasCount&&(!Number.isFinite(Number(draft.quantity))||Number(draft.quantity)<0)){flash('El conteo debe ser cero o mayor. Déjalo vacío si aún no se ha contado.');return;}
    const prefix=`VC-INV-${areaCodes[draft.area]||'GEN'}-`;
    const existing=(data.inventory||[]).reduce((max,item)=>{const match=String(item.sku||'').match(new RegExp(`^${prefix}(\\d+)$`));return match?Math.max(max,Number(match[1])):max;},0);
    const sku=draft.sku.trim()||`${prefix}${String(existing+1).padStart(3,'0')}`;
    setSavingItem(true);
    try{
      const [{data:areaRows,error:areaError},{data:branch,error:branchError}]=await Promise.all([
        supabase.from('areas').select('id,name').eq('organization_id',organizationId).eq('name',draft.area).limit(1),
        supabase.from('branches').select('id,name').eq('organization_id',organizationId).eq('name',draft.branch).single(),
      ]);
      if(areaError)throw areaError;if(branchError)throw branchError;
      let categoryId=null;
      if(draft.category.trim()){
        const code=`CAT-${draft.category.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)}`;
        const {data:category,error:categoryError}=await supabase.from('inventory_categories').upsert({organization_id:organizationId,code,name:draft.category.trim()},{onConflict:'organization_id,code'}).select('id').single();
        if(categoryError)throw categoryError;categoryId=category.id;
      }
      const {data:item,error:itemError}=await supabase.from('inventory_items').insert({organization_id:organizationId,area_id:areaRows?.[0]?.id||null,category_id:categoryId,sku,name:draft.name.trim(),description:draft.notes.trim(),item_type:draft.itemType.trim(),tags:[...new Set(draft.tags.split(',').map(tag=>tag.trim().slice(0,48)).filter(Boolean))].slice(0,40),reference_image_url:draft.referenceImageUrl.trim()||null,custom_fields:{initial_branch_id:branch.id,default_location_code:draft.location.trim()||'MAIN'},base_unit:draft.unit.trim()||'unidad',minimum_quantity:Number(draft.minimum)||0,created_by:user.id}).select('id').single();
      if(itemError)throw itemError;
      const {data:variant,error:variantError}=await supabase.from('inventory_variants').insert({organization_id:organizationId,item_id:item.id,sku:`${sku}-01`,label:draft.variant.trim()}).select('id').single();
      if(variantError)throw variantError;
      if(hasCount){
        const {error:countError}=await supabase.rpc('set_inventory_count',{p_variant_id:variant.id,p_branch_id:branch.id,p_counted_quantity:Number(draft.quantity),p_location_code:draft.location.trim()||'MAIN',p_note:'Alta de artículo; conteo físico inicial registrado'});
        if(countError)throw countError;
      }
      await refreshRemote();setDraft(blankItem);setShowForm(false);
      flash(hasCount?`Artículo ${sku} guardado con conteo físico.`:`Artículo ${sku} guardado; existencia pendiente de conteo.`);
    }catch(error){flash(`No se pudo completar el alta: ${error.message}. Revisa el catálogo antes de reintentar para evitar duplicados.`);}finally{setSavingItem(false);}
  };
  const applyMovement=async(e)=>{
    e.preventDefault();if(!canManageInventory||savingMovement||!movement)return;const qty=Number(movement.quantity);if(!Number.isFinite(qty)||qty<0||(movement.type!=='ajuste'&&qty===0))return;
    if(!movement.actor.trim()||!movement.reason.trim()){flash('Escribe el responsable y el motivo del movimiento.');return;}
    const item=items.find(x=>x.id===movement.itemId);if(!item||!supabase)return;
    if(item.sourceStatus&&movement.type!=='ajuste'){flash('Registra primero un conteo físico de esta variante y ubicación.');return;}
    const shortage=['consumo','merma'].includes(movement.type)?Math.max(0,qty-Number(item.availableQuantity??item.quantity)):0;
    if(shortage){flash('Disponibilidad insuficiente después de reservas. Revisa el conteo o libera una reserva antes de registrar la salida.');return;}
    const note=`${movement.reason.trim()}; responsable: ${movement.actor}${movement.reference?`; ref: ${movement.reference}`:''}`;
    setSavingMovement(true);
    try{
      let result;
      if(movement.type==='ajuste') result=await supabase.rpc('set_inventory_count',{p_variant_id:item.variantId,p_branch_id:item.branchId,p_counted_quantity:qty,p_location_code:item.location||'MAIN',p_note:note});
      else{
        const kind={entrada:'receipt',consumo:'consumption',merma:'waste'}[movement.type];
        result=await supabase.rpc('record_inventory_movement',{p_variant_id:item.variantId,p_branch_id:item.branchId,p_movement_type:kind,p_quantity:qty,p_reason:note,p_location_code:item.location||'MAIN',p_reference_type:movement.reference?'document':null});
      }
      if(result?.error)throw result.error;await refreshRemote();flash(movement.type==='ajuste'?'Conteo físico guardado en la bitácora.':'Movimiento guardado en el inventario compartido.');setMovement(null);
    }catch(error){flash(`No se pudo guardar el movimiento: ${error.message}`);}finally{setSavingMovement(false);}
  };
  const changeMovementQuantity=(delta)=>setMovement((current)=>{
    if(!current)return current;
    const minimum=current.type==='ajuste'?0:1;
    const present=Number(current.quantity);
    const next=Math.max(minimum,(Number.isFinite(present)?present:minimum-delta)+delta);
    return {...current,quantity:String(next)};
  });
  const removeItem=async(item)=>{if(!window.confirm(`¿Archivar ${item.name}? Se conserva el historial y no se borra el artículo.`))return;const {error}=await supabase.from('inventory_items').update({active:false}).eq('id',item.remoteItemId).eq('organization_id',organizationId);if(error){flash(`No se pudo archivar el artículo: ${error.message}`);return;}await refreshRemote();flash('Artículo archivado; se conservó su historial.');};
  const saveCost=async(e)=>{e.preventDefault();const cost=Number(costEdit?.unitCost);if(!costEdit||!Number.isFinite(cost)||cost<0)return;const {error}=await supabase.from('inventory_item_costs').upsert({organization_id:organizationId,variant_id:costEdit.variantId,unit_cost:cost,supplier_name:costEdit.supplierName.trim()||null,updated_by:user.id},{onConflict:'organization_id,variant_id'});if(error){flash(`No se pudo guardar el costo: ${error.message}`);return;}await refreshRemote();setCostEdit(null);flash('Costo guardado. Solo los perfiles autorizados pueden verlo.');};
  const saveCatalogLink=async(e)=>{e.preventDefault();if(!canManageLinks||!linkDraft.catalogProductId||!linkDraft.variantId||!supabase||!organizationId||!user)return;const location=linkDraft.location.trim()||'MAIN';const inventoryRow=items.find((item)=>item.variantId===linkDraft.variantId&&item.branch===linkDraft.branch&&item.location===location&&!item.archived);if(!inventoryRow){flash('Selecciona una variante y ubicación activas para esa sucursal.');return;}if(inventoryRow.sourceStatus){flash('Confirma primero el conteo físico de esa variante y ubicación antes de vincularla a ventas.');return;}const {error}=await supabase.from('catalog_inventory_links').upsert({organization_id:organizationId,catalog_product_id:linkDraft.catalogProductId,inventory_variant_id:linkDraft.variantId,branch_id:inventoryRow.branchId,location_code:location,active:true,created_by:user.id},{onConflict:'organization_id,catalog_product_id,branch_id'});if(error){flash(`No se pudo vincular el producto: ${error.message}`);return;}const {data:rows,error:readError}=await supabase.from('catalog_inventory_links').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id',organizationId).order('created_at');if(readError){flash(`El vínculo se guardó, pero no se pudo refrescar la lista: ${readError.message}`);return;}setCatalogLinks(rows||[]);setLinkDraft({...linkDraft,catalogProductId:'',variantId:''});flash('Vínculo guardado. Solo esta asignación explícita hará que una venta afecte el inventario.');};
  const archiveCatalogLink=async(link)=>{if(!canManageLinks)return;const {error}=await supabase.from('catalog_inventory_links').update({active:false,updated_at:new Date().toISOString()}).eq('id',link.id).eq('organization_id',organizationId);if(error){flash(`No se pudo desactivar el vínculo: ${error.message}`);return;}setCatalogLinks((rows)=>rows.map((row)=>row.id===link.id?{...row,active:false}:row));flash('Vínculo desactivado; el historial de ventas se conserva.');};
  return <div className="inventory-workspace">
    <div className="inventory-heading-row"><div><span className="eyebrow">INVENTARIO · VISUAL CORP + GIGAPRINT</span><h2>Existencias por área y sucursal</h2><p>{pendingImportCount===null?'Cargando las fuentes de inventario…':`${pendingImportCount} filas de libros pendientes de cotejo; no son existencias operativas.`} {uncounted.length} registros del catálogo sin conteo físico. Un cero confirmado sí aparece como agotado.</p></div>{canManageInventory&&<button className="button button-dark" onClick={()=>setShowForm(v=>!v)}><Plus size={16}/> Añadir artículo</button>}</div>
    <div className="inventory-stats"><article><Boxes/><span>Artículos activos</span><b>{activeItems.length}</b><small>en todas las sucursales</small></article><article><ClipboardList/><span>Con disponibilidad</span><b>{availableItems.length}</b><small>con saldo contado</small></article><article className={low.length?'inventory-stat-alert':''}><CircleAlert/><span>Reponer</span><b>{low.length}</b><small>en mínimo o agotados</small></article><article className="inventory-stat-pending"><ClipboardList/><span>Pendientes de conteo</span><b>{uncounted.length}</b><small>no se asumen como agotados</small></article></div>
    {low.length>0&&<div className="inventory-alert"><CircleAlert size={17}/><div><b>{low.length} artículos requieren atención</b><small>{low.slice(0,4).map(i=>`${i.name}${i.variant?` · ${i.variant}`:''}`).join(' · ')}{low.length>4?' · y más':''}</small></div></div>}
    <InventoryInsights items={items} canSeeCosts={canSeeCosts} canEdit={canManageInventory} canReserve={canManageLinks} canMove={canManageInventory} canRequestTransfer={canRequestTransfer} onTransfer={startTransfer} onEdit={(item)=>setMetadataEdit({remoteItemId:item.remoteItemId,itemType:item.itemType||'',tags:(item.tags||[]).join(', '),referenceImageUrl:item.referenceImageUrl||'',customFields:JSON.stringify(item.customFields||{},null,2)})} onReserve={(item)=>setReservationEdit({itemId:item.id,quantity:String(item.reservedQuantity||0),note:''})} onMovement={(item,type)=>setMovement({itemId:item.id,type,quantity:type==='ajuste'?(item.sourceStatus?'':String(item.quantity)):'1',actor:'',reason:'',reference:''})} onCost={(item)=>setCostEdit({variantId:item.variantId,unitCost:item.unitCost??'',supplierName:item.supplierName||'',name:item.name})} onArchive={removeItem} formatDate={formatDate} formatMoney={formatMoney} metadataEdit={metadataEdit} setMetadataEdit={setMetadataEdit} reservationEdit={reservationEdit} setReservationEdit={setReservationEdit} onSaveMetadata={saveMetadata} onSaveReservation={saveReservation}/>
    <section className="panel inventory-list-panel">
      <div className="panel-heading"><div><span className="eyebrow">CONEXIÓN POS · INVENTARIO</span><h3>Productos de venta vinculados a stock</h3><p>Los productos sin vínculo explícito se registran como conceptos sin control de stock. No se deduce la variante por coincidencia de nombres.</p></div></div>
      {canManageLinks&&<form className="inventory-form-grid" onSubmit={saveCatalogLink}>
        <label>Producto del catálogo<select required value={linkDraft.catalogProductId} onChange={e=>setLinkDraft({...linkDraft,catalogProductId:e.target.value})}><option value="">Seleccionar producto</option>{(data.catalog||[]).map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Sucursal<select value={linkDraft.branch} onChange={e=>setLinkDraft({...linkDraft,branch:e.target.value})}>{branches.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Variante de inventario<select required value={linkDraft.variantId} onChange={e=>setLinkDraft({...linkDraft,variantId:e.target.value})}><option value="">Seleccionar variante en la ubicación indicada</option>{items.filter(item=>item.branch===linkDraft.branch&&item.location===(linkDraft.location.trim()||'MAIN')&&!item.archived).map(item=><option key={item.id} value={item.variantId}>{item.name}{item.variant?` · ${item.variant}`:''} · {item.sku} · {item.sourceStatus||`${item.quantity} ${item.unit}`}</option>)}</select></label>
        <label>Ubicación de salida<input value={linkDraft.location} onChange={e=>setLinkDraft({...linkDraft,location:e.target.value})} placeholder="MAIN"/></label>
        <button className="button button-dark" type="submit">Guardar vínculo</button>
      </form>}
      <div className="inventory-events">{catalogLinks.filter(link=>link.active).map(link=>{const product=(data.catalog||[]).find(row=>row.id===link.catalog_product_id);const stock=items.find(row=>row.variantId===link.inventory_variant_id&&row.branchId===link.branch_id);return <article className="inventory-event-row" key={link.id}><span className="inventory-event-icon"><Boxes size={15}/></span><div><b>{product?.name||link.catalog_product_id}</b><small>{stock?`${stock.name}${stock.variant?` · ${stock.variant}`:''} · ${stock.branch} · ${link.location_code}`:`Variante ${link.inventory_variant_id} · Ubicación ${link.location_code}`}</small></div>{canManageLinks&&<button className="button button-outline" type="button" onClick={()=>archiveCatalogLink(link)}>Desactivar</button>}</article>})}{!catalogLinks.some(link=>link.active)&&<div className="inventory-empty">Aún no hay vínculos. Las ventas no reducirán saldo hasta que se asigne cada producto aquí.</div>}</div>
    </section>
    {pendingImportCount>0&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">IMPORTACIÓN CON PROCEDENCIA</span><h3>Inventario recibido · revisión necesaria</h3></div><span className="muted-count">{pendingImportCount} filas</span></div><p className="panel-intro">Los libros de Visual Corp y Gigaprint se guardaron sin modificar su contenido. Las cantidades textuales, vacías o ambiguas necesitan validación antes de afectar el stock del POS.</p><div className="table-wrap"><table><thead><tr><th>Archivo fuente</th><th>Hoja</th><th>Fila</th><th>Artículo candidato</th><th>Dato de cantidad recibido</th></tr></thead><tbody>{importRows.slice(0,40).map((row)=><tr key={row.id}><td>{importBatches[row.batch_id]?.source_file||'Inventario importado'}</td><td>{row.source_sheet}</td><td>{row.source_row}</td><td><b>{row.candidate?.name||row.source_reference||row.raw_row?.name||'Por identificar'}</b><small>{row.candidate?.area||''}</small></td><td>{String(row.candidate?.quantity ?? row.raw_row?.quantity ?? row.raw_row?.stock ?? 'Por revisar')}</td></tr>)}</tbody></table>{pendingImportCount>40&&<div className="table-more">Mostrando 40 de {pendingImportCount} filas pendientes.</div>}</div></section>}
    {showForm&&<form className="panel inventory-form" onSubmit={saveItem}><header><h3>Nuevo artículo</h3><span>Se asigna un ID por área. Deja el conteo vacío si la existencia todavía no se ha verificado.</span></header><div className="inventory-form-grid"><label>Artículo<input required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Ej. Taza metalizada"/></label><label>Variante<input value={draft.variant} onChange={e=>setDraft({...draft,variant:e.target.value})} placeholder="Color, medida, calibre…"/></label><label>Categoría<input value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})} placeholder="Tazas, lonas, tinta…"/></label><label>Tipo<input value={draft.itemType} onChange={e=>setDraft({...draft,itemType:e.target.value})} placeholder="Insumo, lona, herramienta…"/></label><label>Tags (separados por coma)<input value={draft.tags} onChange={e=>setDraft({...draft,tags:e.target.value})} placeholder="urgente, sublimación, proveedor"/></label><label>Imagen de referencia (URL pública)<input type="url" value={draft.referenceImageUrl} onChange={e=>setDraft({...draft,referenceImageUrl:e.target.value})} placeholder="https://…"/></label><label>Área<select value={draft.area} onChange={e=>setDraft({...draft,area:e.target.value})}>{areas.map(x=><option key={x}>{x}</option>)}</select></label><label>Sucursal<select value={draft.branch} onChange={e=>setDraft({...draft,branch:e.target.value})}>{branches.map(x=><option key={x}>{x}</option>)}</select></label><label>Ubicación<input value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})} placeholder="Bodega, estante…"/></label><label>Unidad base<input required value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})} placeholder="unidad, metro, litro…"/></label><label>Conteo físico confirmado (opcional)<input type="number" min="0" step="0.001" placeholder="Pendiente de conteo" value={draft.quantity} onChange={e=>setDraft({...draft,quantity:e.target.value})}/></label><label>Mínimo de reposición<input type="number" min="0" step="any" value={draft.minimum} onChange={e=>setDraft({...draft,minimum: e.target.value})}/></label><label>ID / código<input value={draft.sku} onChange={e=>setDraft({...draft,sku:e.target.value})} placeholder="Automático según área"/></label><label className="inventory-notes">Notas<textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} rows="2"/></label></div><button className="button button-dark" type="submit">Guardar artículo</button></form>}
    <section className="panel inventory-events"><div className="panel-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h3>Movimientos registrados</h3><p>Consulta los últimos 500 movimientos cargados. Cada fila muestra el usuario registrado, la fecha, sucursal, ubicación y referencia cuando existe.</p></div><span className="muted-count">{filteredEvents.length} de {events.length}</span></div>
      <div className="inventory-event-filters"><label className="search-box"><Search size={15}/><input value={eventTerm} onChange={e=>setEventTerm(e.target.value)} placeholder="Buscar artículo, actor, motivo o referencia"/></label><select aria-label="Tipo de movimiento" value={eventType} onChange={e=>setEventType(e.target.value)}><option>Todos</option>{[...new Set(events.map(ev=>ev.type))].sort().map(type=><option key={type} value={type}>{type.replaceAll('_',' ')}</option>)}</select></div>
      {filteredEvents.length?filteredEvents.slice(0,50).map(ev=><article className="inventory-event-row" key={ev.id}><span className="inventory-event-icon"><ArrowLeftRight size={15}/></span><div><b>{ev.itemName} · {ev.type.replaceAll('_',' ')}</b><small>{ev.branch} · {ev.location} · {formatEventDate(ev.createdAt)} · {ev.actor}{ev.reason?` · ${ev.reason}`:''}{ev.reference?` · ${ev.referenceType || 'Documento'} ${ev.reference}`:''}</small></div><strong>{ev.quantityDelta>0?'+':ev.quantityDelta<0?'−':'↕'}{ev.quantity} {ev.unit}</strong></article>):<div className="inventory-empty">{events.length?'No hay movimientos con estos filtros.':'El historial empezará cuando se registre el primer movimiento.'}</div>}
      {filteredEvents.length>50&&<small className="inventory-event-limit">Mostrando 50 movimientos de {filteredEvents.length} coincidencias.</small>}
    </section>
    {costEdit&&<div className="inventory-modal-backdrop"><form className="inventory-modal" onSubmit={saveCost}><h3>Costo privado · {costEdit.name}</h3><p>Solo propietario, administración POS y gerencia pueden consultar este dato.</p><label>Costo unitario (USD)<input autoFocus type="number" min="0" step="0.0001" required value={costEdit.unitCost} onChange={e=>setCostEdit({...costEdit,unitCost:e.target.value})}/></label><label>Proveedor<input value={costEdit.supplierName} onChange={e=>setCostEdit({...costEdit,supplierName:e.target.value})} placeholder="Opcional"/></label><footer><button type="button" className="button button-outline" onClick={()=>setCostEdit(null)}>Cancelar</button><button className="button button-dark" type="submit">Guardar costo</button></footer></form></div>}    {movement&&<div className="inventory-modal-backdrop"><form className="inventory-modal" onSubmit={applyMovement}><h3>{movement.type==='entrada'?'Registrar entrada':movement.type==='ajuste'?'Confirmar conteo físico':'Registrar salida o consumo'}</h3><p>{items.find(i=>i.id===movement.itemId)?.name} · {items.find(i=>i.id===movement.itemId)?.sourceStatus ? 'sin conteo físico' : `contado: ${items.find(i=>i.id===movement.itemId)?.quantity} ${items.find(i=>i.id===movement.itemId)?.unit} · disponible: ${items.find(i=>i.id===movement.itemId)?.availableQuantity ?? '—'}`}</p><label>Movimiento<select value={movement.type} onChange={e=>setMovement({...movement,type:e.target.value,quantity:e.target.value==='ajuste'?(items.find(i=>i.id===movement.itemId)?.sourceStatus?'':String(items.find(i=>i.id===movement.itemId)?.quantity??'')):'1'})}><option value="entrada">Entrada / compra recibida</option><option value="consumo">Consumo interno</option><option value="merma">Merma / desperdicio</option><option value="ajuste">Ajuste de conteo</option></select></label><label>{movement.type==='ajuste'?'Cantidad física exacta':'Cantidad a mover'}<span className="inventory-quantity-control"><button type="button" aria-label="Quitar una unidad" onClick={()=>changeMovementQuantity(-1)} disabled={Number(movement.quantity)<=(movement.type==='ajuste'?0:1)}>−</button><input autoFocus type="number" min={movement.type==='ajuste'?"0":"0.001"} step="any" required value={movement.quantity} onChange={e=>setMovement({...movement,quantity:e.target.value})}/><button type="button" aria-label="Añadir una unidad" onClick={()=>changeMovementQuantity(1)}>+</button></span><small>{movement.type==='ajuste'?'Escribe el total que contaste o ajústalo con + y −.':'Escribe cuánto entra o sale, o ajusta de uno en uno.'}</small></label><label>Responsable<input required value={movement.actor} onChange={e=>setMovement({...movement,actor:e.target.value})} placeholder="Nombre de quien entrega o utiliza"/></label><label>Motivo<input required value={movement.reason} onChange={e=>setMovement({...movement,reason:e.target.value})} placeholder={movement.type==='ajuste'?'Conteo físico, responsable o área':'OT, cliente, reposición…'}/></label><label>Referencia / documento<input value={movement.reference} onChange={e=>setMovement({...movement,reference:e.target.value})} placeholder="Número de OT o solicitud…"/></label><footer><button type="button" className="button button-outline" onClick={()=>setMovement(null)}>Cancelar</button><button className="button button-dark" type="submit">Registrar movimiento</button></footer></form></div>}
    <div className="notice-box"><span><CircleAlert size={17}/></span><div><b>Saldos verificados y fuentes pendientes</b><p>Los artículos nuevos pueden quedar pendientes de conteo; solo un conteo registrado activa su saldo operativo. Los costos solo aparecen para propietario, administración POS y gerencia. Las filas importadas pendientes aún deben revisarse antes de tomarlas como existencia real.</p></div></div>
  </div>;
}
