import React, { useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, CircleAlert, ClipboardList, ClipboardCheck, DollarSign, Plus, Search, Trash2, LayoutGrid, List, ChartNoAxesCombined, Image as ImageIcon, SlidersHorizontal, Ruler } from 'lucide-react';
import { useWorkspace, formatDate, formatMoney } from '../app/workspace';
import { PageHeading } from '../app/layout';
import { useAuth } from '../auth/AuthProvider';
import inventoryReferenceLibrary from '../data/inventory-reference-index.json';
import { supabase } from '../lib/supabaseClient';
import './InventoryWorkspace.css';
import { InventoryInsights } from './InventoryInsights';
import { Dialog } from './ui/OperationalKit';
import { InventoryLocations } from './InventoryLocations';
import { InventorySpecificationFields, type InventorySpecificationDraft } from './InventorySpecificationFields';
import { InventoryLonaCutPanel } from './InventoryLonaCutPanel';
import { InventoryMaterialCatalogSetup } from './InventoryMaterialCatalogSetup';
import { InventoryOptionPicker } from './InventoryOptionPicker';
import { StandardCustomProducts } from '../pages/admin/StandardCustomProducts';
import { InventoryProductImageGallery } from './InventoryProductImageGallery';
import { INVENTORY_REFERENCE_BUCKET, INVENTORY_REFERENCE_PREFIX, inventoryReferenceObjectPath, prepareInventoryReferenceImage, type InventoryGalleryImage } from './inventoryImageUtils';
import { isInventoryItemSkuConflict, isRecoverableInventoryItem, isValidInventoryReference, nextInventorySku } from '../lib/inventorySku.mjs';

const areas = ['Impresión', 'Sublimación', 'Troquelado', 'Láser', 'Taller', 'Neones', 'Bodega general'];
const blankItem = { name:'', category:'', itemType:'', tags:'', referenceImageUrl:'', variant:'', area:'Taller', branch:'Visual Corp', location:'MAIN', unit:'unidad', quantity:'', minimum:'0', sku:'', notes:'' };
const inventoryReferenceOptions = inventoryReferenceLibrary.products.flatMap((product) => product.images.map((image) => ({ path: image.path, label: `${product.name} · ${image.label}` })));
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const areaCodes = { 'Impresión':'IMP', 'Sublimación':'SUB', 'Troquelado':'TRO', 'Láser':'LAS', 'Taller':'TAL', 'Neones':'NEO', 'Bodega general':'BOD' };
export function InventoryWorkspace() {
  const { data, setData, flash, refreshRemote } = useWorkspace();
  const { organizationId, user, hasPermission } = useAuth();
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importBatches, setImportBatches] = useState<Record<string, any>>({});
  const [pendingImportCount, setPendingImportCount] = useState(null);
  const [importSheets, setImportSheets] = useState<string[]>([]);
  const [importPage, setImportPage] = useState(0);
  const [importSheet, setImportSheet] = useState('Todas');
  const [importSearch, setImportSearch] = useState('');
  const [reviewEditor, setReviewEditor] = useState<any>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [catalogLinks, setCatalogLinks] = useState([]);
  const [materialRecipes, setMaterialRecipes] = useState<any[]>([]);
  const [recipeSchemaStatus,setRecipeSchemaStatus]=useState<'checking'|'ready'|'pending'|'error'>('checking');
  const [linkDraft, setLinkDraft] = useState({ catalogProductId:'', variantId:'', branch:'Visual Corp', location:'MAIN' });
  const [recipeDraft, setRecipeDraft] = useState({ catalogProductId:'', variantId:'', branch:'Visual Corp', location:'MAIN', mode:'per_billed_unit', stage:'sale', rate:'1', waste:'0' });
  const [rollWidthDraft,setRollWidthDraft]=useState({itemId:'',widths:[] as number[]});
  const [inventorySetupBusy,setInventorySetupBusy]=useState(false);
  const [activeSection,setActiveSection]=useState('catalog');
  const [inventoryBrandScope,setInventoryBrandScope]=useState<'general'|'visual'|'giga'>('general');
  const [term,setTerm]=useState(''); const [area,setArea]=useState('Todas'); const [branch,setBranch]=useState('Todas'); const [category,setCategory]=useState('Todas');
  const [showForm,setShowForm]=useState(false); const [savingItem,setSavingItem]=useState(false); const savingItemLock=useRef(false); const [metadataSaveBusy,setMetadataSaveBusy]=useState(false); const metadataSaveLock=useRef(false); const [movement,setMovement]=useState(null); const [transferBusy,setTransferBusy]=useState(false); const [draft,setDraft]=useState(blankItem); const [newProductImages,setNewProductImages]=useState<InventoryGalleryImage[]>([]); const [costEdit,setCostEdit]=useState(null); const [countSession,setCountSession]=useState(null); const [countBusy,setCountBusy]=useState(false); const [movementPageBusy,setMovementPageBusy]=useState(false); const [movementHistoryExhausted,setMovementHistoryExhausted]=useState(false); const [movementVisibleCount,setMovementVisibleCount]=useState(30);
  const [specificationDraft,setSpecificationDraft]=useState<InventorySpecificationDraft>({});
  const [typeFilter,setTypeFilter]=useState('Todos'); const [statusFilter,setStatusFilter]=useState('Todos'); const [tagFilter,setTagFilter]=useState('Todos'); const [viewMode,setViewMode]=useState('table'); const [metadataEdit,setMetadataEdit]=useState<any>(null); const [reservationEdit,setReservationEdit]=useState<any>(null);
  const canSeeCosts=hasPermission('inventory_costs','view')&&hasPermission('inventory_costs','view_costs');
  const canEditCosts=hasPermission('inventory_costs','edit')&&hasPermission('inventory_costs','edit_costs');
  const canManageInventory=hasPermission('inventory','edit');
  const canManageLinks=hasPermission('inventory','edit');
  const canViewStandardProducts=hasPermission('catalog_admin','view')||hasPermission('catalog_admin','edit');
  const canEditStandardProducts=hasPermission('catalog_admin','edit');
  const canEditStandardPrices=hasPermission('catalog_admin','edit_prices');
  const canReviewImports=hasPermission('inventory','edit');
  const items=data.inventory||[]; const events=data.inventoryMovements||[];
  const branches:string[]=[...new Set<string>((data.branches||[]).map((branch:any)=>String(branch.name||'')).filter(Boolean))];
  React.useEffect(()=>{if(!branches.length)return;const available=new Set(branches);const fallback=branches[0];setDraft(current=>available.has(current.branch)?current:{...current,branch:fallback});setLinkDraft(current=>available.has(current.branch)?current:{...current,branch:fallback});setRecipeDraft(current=>available.has(current.branch)?current:{...current,branch:fallback});},[branches.join('|')]);
  React.useEffect(()=>{setMovementHistoryExhausted(false);},[events[0]?.id]);
  const locationsForBranch=(branchName)=>{const branchId=(data.branches||[]).find(row=>row.name===branchName)?.id;return (data.inventoryLocations||[]).filter(location=>location.active&&location.branchId===branchId);};
  const openTransferRequest=(item,targetBranch)=>{
    const fromLocations=locationsForBranch(item.branch);
    const toLocations=locationsForBranch(targetBranch);
    const fromLocation=fromLocations.find(location=>location.code===item.location)?.code||fromLocations.find(location=>location.code==='MAIN')?.code||fromLocations[0]?.code||'';
    const toLocation=toLocations.find(location=>location.code==='MAIN')?.code||toLocations[0]?.code||'';
    setMovement({itemId:item.id,type:'transferencia',quantity:'',toBranch:targetBranch||'',fromLocation,toLocation,actor:'',reason:'',reference:''});
  };
  const transferItem=movement?.type==='transferencia'?items.find(item=>item.id===movement.itemId):null;
  const transferAvailable=Number(transferItem?.availableQuantity??(Number(transferItem?.quantity||0)-Number(transferItem?.reservedQuantity||0)));
  const transferFromLocations=transferItem?locationsForBranch(transferItem.branch):[];
  const transferToLocations=movement?.toBranch?locationsForBranch(movement.toBranch):[];
  const transferReady=Boolean(canManageInventory&&transferItem?.branchId&&transferAvailable>0&&movement?.toBranch&&movement.fromLocation&&movement.toLocation&&Number(movement.quantity)>0&&Number(movement.quantity)<=transferAvailable&&movement.actor?.trim()&&movement.reason?.trim());
  React.useEffect(() => {
    if (!supabase || !organizationId) return;
    let active = true;
    let importQuery=supabase.from('inventory_import_rows').select('id,batch_id,source_sheet,source_row,source_reference,candidate,raw_row,review_note', { count: 'exact' }).eq('organization_id', organizationId).eq('mapping_status', 'pending_review');
    if(importSheet!=='Todas')importQuery=importQuery.eq('source_sheet',importSheet);
    Promise.all([
      importQuery.order('source_sheet').order('source_row').range(importPage * 50, importPage * 50 + 49),
      supabase.from('inventory_import_rows').select('source_sheet').eq('organization_id',organizationId).eq('mapping_status','pending_review').limit(1000),
      supabase.from('inventory_import_batches').select('id,source_file,branch_id,row_count,import_status,source_uri').eq('organization_id', organizationId),
    ]).then(([rowsResult,sheetsResult,batchesResult]) => {
      if (!active) return;
      if (rowsResult.error || sheetsResult.error || batchesResult.error) { flash(`No se pudo leer la cola de importación: ${(rowsResult.error || sheetsResult.error || batchesResult.error).message}`); return; }
      setImportRows(rowsResult.data || []);
      setPendingImportCount(rowsResult.count || 0);
      setImportSheets([...new Set((sheetsResult.data||[]).map(row=>row.source_sheet).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')));
      setImportBatches(Object.fromEntries((batchesResult.data || []).map((batch) => [batch.id, batch])));
    });
    return () => { active = false; };
  }, [organizationId, importPage, importSheet]);
  React.useEffect(() => {
    if (!supabase || !organizationId) return;
    let active = true;
    setRecipeSchemaStatus('checking');
    Promise.all([
      supabase.from('catalog_inventory_links').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id',organizationId).order('created_at'),
      supabase.from('catalog_material_recipes').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,calculation_mode,fulfillment_stage,quantity_per_basis,waste_percent,active').eq('organization_id',organizationId).order('created_at'),
    ]).then(([linksResult,recipesResult]) => {
        if (!active) return;
        if(linksResult.error)flash(`No se pudieron cargar los vínculos POS-inventario: ${linksResult.error.message}`);
        else setCatalogLinks(linksResult.data || []);
        if(recipesResult.error){
          const missingSchema=recipesResult.error.code==='PGRST205'||recipesResult.error.code==='42P01'||/could not find the table|relation .* does not exist/i.test(recipesResult.error.message||'');
          setRecipeSchemaStatus(missingSchema?'pending':'error');
          setMaterialRecipes([]);
          if(!missingSchema)flash(`No se pudieron cargar las recetas de materiales: ${recipesResult.error.message}`);
          return;
        }
        setMaterialRecipes(recipesResult.data || []);
        setRecipeSchemaStatus('ready');
      });
    return () => { active = false; };
  }, [organizationId]);
  const brandOf=(item:any)=>String(item.customFields?.brand_scope||'visual').toLowerCase()==='giga'?'giga':'visual';
  const scopedItems=useMemo(()=>items.filter(item=>inventoryBrandScope==='general'||brandOf(item)===inventoryBrandScope),[items,inventoryBrandScope]);
  const scopedEvents=useMemo(()=>{const variants=new Set(scopedItems.map(item=>item.variantId).filter(Boolean));return events.filter(event=>variants.has(event.itemId));},[scopedItems,events]);
  const visible=useMemo(()=>scopedItems.filter(i=>{const state=i.sourceStatus?'Sin conteo':Number(i.quantity)<=0?'Agotado':Number(i.quantity)<=Number(i.minimum)?'Reponer':'En stock';return (area==='Todas'||i.area===area)&&(branch==='Todas'||i.branch===branch)&&(category==='Todas'||i.category===category)&&(typeFilter==='Todos'||i.itemType===typeFilter)&&(statusFilter==='Todos'||state===statusFilter)&&(tagFilter==='Todos'||(i.tags||[]).includes(tagFilter))&&`${i.name} ${i.category} ${i.itemType} ${(i.tags||[]).join(' ')} ${i.variant} ${i.sku}`.toLowerCase().includes(term.toLowerCase());}),[scopedItems,area,branch,category,term,typeFilter,statusFilter,tagFilter]);
  const groupedInventory=useMemo(()=>{
    const groups=new Map<string,any[]>();
    for(const item of visible.filter(row=>!row.archived)){
      const key=String(item.name||'Artículo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
      groups.set(key,[...(groups.get(key)||[]),item]);
    }
    return [...groups.entries()].map(([key,rows])=>({key,name:rows[0]?.name||'Artículo',rows})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  },[visible]);
  const low=scopedItems.filter(i=>!i.archived&&!i.sourceStatus&&Number(i.quantity)<=Number(i.minimum));
  const pendingPhysicalCount=scopedItems.filter(item=>!item.archived&&item.sourceStatus).length;
  const countQueue=scopedItems.filter(item=>!item.archived&&item.branchId&&item.sourceStatus&&(area==='Todas'||item.area===area)&&(branch==='Todas'||item.branch===branch)).sort((a,b)=>`${a.area} ${a.name} ${a.variant}`.localeCompare(`${b.area} ${b.name} ${b.variant}`,'es'));
  const countItem=countSession?items.find(item=>item.id===countSession.ids[countSession.index]):null;
  const countCompleted=countSession?.statuses?.filter(status=>status==='counted'||status==='skipped').length||0;
  const countProgress=countSession?.ids?.length?Math.round((countCompleted/countSession.ids.length)*100):0;
  const itemTypes=[...new Set<string>(scopedItems.map(i=>String(i.itemType||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')); const allTags=[...new Set<string>(scopedItems.flatMap(i=>(i.tags||[]).map(tag=>String(tag))).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')); const categories=[...new Set<string>(scopedItems.map(i=>String(i.category||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const importRowsOnPage=importRows.filter(row=>`${row.candidate?.name||''} ${row.candidate?.legacyCode||''} ${row.raw_row?.Id||''} ${row.source_sheet} ${row.source_row}`.toLowerCase().includes(importSearch.trim().toLowerCase()));
  const importPages=Math.max(1,Math.ceil(Number(pendingImportCount||0)/50));
  const reviewVariantOptions=[...new Map<string, any>(items.filter(item=>!item.archived).map(item=>[item.variantId,item])).values()];
  const daysSince=(value)=>value?Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86400000)):null;
  const assignInventoryBranch=async(item,branchName)=>{if(!branchName||!canManageInventory||!supabase||!organizationId||!item.variantId)return;try{const {data:branchRow,error:branchError}=await supabase.from('branches').select('id').eq('organization_id',organizationId).eq('name',branchName).single();if(branchError)throw branchError;const nextAttributes={...(item.variantAttributes||{}),initial_branch_id:branchRow.id};const {data:updatedVariant,error}=await supabase.from('inventory_variants').update({attributes:nextAttributes}).eq('id',item.variantId).eq('organization_id',organizationId).select('id').single();if(error)throw error;if(!updatedVariant)throw new Error('La variante no existe o tu perfil no tiene acceso para actualizarla.');setMetadataEdit(current=>current?.variantId===item.variantId?{...current,variantAttributes:nextAttributes,sourceItem:{...current.sourceItem,branch:branchName,branchId:branchRow.id,variantAttributes:nextAttributes}}:current);await refreshRemote();flash(`${item.name} · ${item.variant||'variante'} asignado a ${branchName}. Ya puedes iniciar el conteo físico.`);}catch(error){flash(`No se pudo asignar la sucursal: ${error.message}`);}};
  const assignInventoryBranchMany=async(selectedItems,branchName)=>{
    if(!branchName||!canManageInventory||!supabase||!organizationId)return false;
    const itemIds=[...new Set(selectedItems.map((item)=>item.remoteItemId).filter(Boolean))];
    if(!itemIds.length)return false;
    const {data:branchRow,error:branchError}=await supabase.from('branches').select('id').eq('organization_id',organizationId).eq('name',branchName).single();
    if(branchError)throw new Error(`No se pudo validar la sucursal: ${branchError.message}`);
    const {data:variants,error:variantError}=await supabase.from('inventory_variants').select('id,item_id,attributes').eq('organization_id',organizationId).eq('active',true).in('item_id',itemIds);
    if(variantError)throw new Error(`No se pudieron leer las variantes seleccionadas: ${variantError.message}`);
    const variantIds=(variants||[]).map((variant)=>variant.id);
    const {data:stockRows,error:stockError}=variantIds.length?await supabase.from('inventory_stock').select('variant_id').eq('organization_id',organizationId).in('variant_id',variantIds):{data:[],error:null};
    if(stockError)throw new Error(`No se pudo comprobar el saldo físico antes de asignar: ${stockError.message}`);
    const stockVariantIds=new Set((stockRows||[]).map((row)=>row.variant_id));
    const eligible=(variants||[]).filter((variant)=>!variant.attributes?.initial_branch_id&&!stockVariantIds.has(variant.id));
    const alreadyAssigned=(variants||[]).length-eligible.length;
    if(!eligible.length){flash(`No hay variantes pendientes para asignar: las ${alreadyAssigned} variantes seleccionadas ya tienen sucursal o saldo físico.`);return true;}
    const succeeded=[];const failed=[];
    for(let offset=0;offset<eligible.length;offset+=8){
      const batch=eligible.slice(offset,offset+8);
      await Promise.all(batch.map(async(variant)=>{
        const attributes=variant.attributes&&typeof variant.attributes==='object'&&!Array.isArray(variant.attributes)?variant.attributes:{};
        const {data,error}=await supabase.from('inventory_variants').update({attributes:{...attributes,initial_branch_id:branchRow.id}}).eq('id',variant.id).eq('organization_id',organizationId).select('id').single();
        if(error||!data){failed.push(variant.id);return;}
        succeeded.push(variant.id);
      }));
    }
    if(succeeded.length)await refreshRemote();
    if(failed.length){flash(`Asignadas ${succeeded.length} variantes a ${branchName}; ${failed.length} no se pudieron guardar y siguen seleccionadas para reintentar. Las variantes con saldo físico se dejaron sin cambios.`);return false;}
    flash(`Asignadas ${succeeded.length} variantes a ${branchName}. ${alreadyAssigned} ya tenían sucursal o saldo físico y se conservaron sin cambios; no se modificaron conteos ni historial.`);
    return true;
  };
  const renderInventoryRow=(i)=>{const widthCm=Number(i.variantAttributes?.width_cm);const details=[i.category,i.variant,widthCm&&!String(i.variant||'').includes(String(widthCm))?`Ancho ${widthCm} cm`:'',i.variantSku?`Variante ${i.variantSku}`:'',i.sku?`Ficha ${i.sku}`:`Ficha ${i.id}`].filter(Boolean).join(' · ');return <tr key={i.id}><td><div className="inventory-insights-identity">{i.referenceImageUrl?<img src={i.referenceImageUrl} alt={`Referencia de ${i.name}`} loading="lazy"/>:<ImageIcon size={16}/>}<span><b>{i.name}</b><small>{details||'Sin variante registrada'}</small></span></div></td><td>{i.branch}<small>{i.area}</small></td><td>{i.location||'Sin ubicación'}</td><td><strong>{i.quantity} {i.unit}</strong></td><td>{i.minimum} {i.unit}</td>{canSeeCosts&&<td>{i.unitCost===null?'Sin registrar':formatMoney(i.unitCost)}<button className="text-link" onClick={()=>setCostEdit({variantId:i.variantId,unitCost:i.unitCost??'',supplierName:i.supplierName||'',name:i.name})}>Editar</button></td>}<td><span className={`inventory-status ${i.sourceStatus?'pending':Number(i.quantity)<=Number(i.minimum)?'low':'ok'}`}>{i.sourceStatus?(i.branchId?'Sin conteo físico':'Sucursal por asignar · sin conteo físico'):(Number(i.quantity)<=Number(i.minimum)?'Bajo mínimo':'Disponible')}</span></td><td><div className="inventory-actions">{!i.branchId&&canManageInventory&&<select aria-label={`Asignar sucursal a ${i.name}`} defaultValue="" onChange={event=>assignInventoryBranch(i,event.target.value)}><option value="">Asignar sucursal…</option>{branches.map(name=><option key={name}>{name}</option>)}</select>}{canSeeCosts&&<button title="Editar costo privado" onClick={()=>setCostEdit({variantId:i.variantId,unitCost:i.unitCost??'',supplierName:i.supplierName||'',name:i.name})}><DollarSign size={15}/></button>}<button title={i.branchId?'Registrar entrada':'Asigna una sucursal antes de registrar stock'} disabled={!i.branchId||!canManageInventory} onClick={()=>setMovement({itemId:i.id,type:'entrada',quantity:'',actor:'',reason:'',reference:''})}><ArrowDownToLine size={15}/></button><button title={i.branchId?'Consumo / salida / merma':'Asigna una sucursal antes de registrar movimientos'} disabled={!i.branchId||!canManageInventory} onClick={()=>setMovement({itemId:i.id,type:'consumo',quantity:'',actor:'',reason:'',reference:''})}><ArrowUpFromLine size={15}/></button><button className="inventory-transfer-action" aria-label={`Mover ${i.name} a otra sucursal`} title={!i.branchId?'Asigna una sucursal antes de registrar movimientos':canManageInventory?'Mover a otra sucursal':'Tu perfil no tiene permiso para editar inventario'} disabled={!i.branchId||!canManageInventory} onClick={()=>openTransferRequest(i,branches.find(b=>b!==i.branch))}><ArrowLeftRight size={15}/><span>Mover</span></button><button className="inventory-delete-small" title="Eliminar del catálogo activo; conservar historial" onClick={()=>removeItem(i)}><Trash2 size={13}/>Eliminar</button></div></td></tr>;};
  const renderInventoryGroup=(group)=>{const itemCount=new Set(group.rows.map(row=>row.remoteItemId)).size;const variantCount=new Set(group.rows.map(row=>row.variantId)).size;const branchCount=new Set(group.rows.map(row=>row.branchId).filter(Boolean)).size;const hasUnassigned=group.rows.some(row=>!row.branchId);return <tr className="inventory-group-row" key={`group:${group.key}`}><td colSpan={canSeeCosts?8:7}><details className="inventory-product-group"><summary><span><b>{group.name}</b><small>{itemCount>1?`${itemCount} fichas · `:''}{variantCount} variantes · {branchCount} sucursales{hasUnassigned?' · sucursal por asignar':''}</small></span><em>{group.rows.length} registros</em></summary><div className="inventory-product-group-content"><div className="inventory-table-wrap"><table><thead><tr><th>Artículo / variante</th><th>Sucursal · área</th><th>Ubicación</th><th>Existencia</th><th>Mínimo</th>{canSeeCosts&&<th>Costo unitario</th>}<th>Estado</th><th>Acciones</th></tr></thead><tbody>{group.rows.map(renderInventoryRow)}</tbody></table></div></div></details></td></tr>;};
  const saveMetadata=async(e)=>{
    e.preventDefault();
    if(!metadataEdit||!supabase||!user||!canManageInventory||metadataSaveLock.current)return;
    const {remoteItemId,variantId,tags,sourceItem,...fields}=metadataEdit;
    if(fields.referenceImageUrl&&!/^(https?:\/\/|\/storage\/|\/inventory\/)/i.test(String(fields.referenceImageUrl).trim())&&!String(fields.referenceImageUrl).startsWith(INVENTORY_REFERENCE_PREFIX)){flash('La imagen debe ser una URL pública o una ruta válida de la biblioteca.');return;}
    const normalizedTags=[...new Set(String(tags||'').split(',').map(tag=>tag.trim().slice(0,48)).filter(Boolean))].slice(0,40);
    const suppliedCustomFields=fields.customFields&&typeof fields.customFields==='object'&&!Array.isArray(fields.customFields)?fields.customFields:{};
    const customFields={...suppliedCustomFields,brand_scope:metadataEdit.brandScope||brandOf(metadataEdit)};
    const variantAttributes=fields.variantAttributes&&typeof fields.variantAttributes==='object'&&!Array.isArray(fields.variantAttributes)?fields.variantAttributes:{};
    const gallery: InventoryGalleryImage[] = Array.isArray(fields.productImages) ? fields.productImages : [];
    let referenceImageUrl=String(fields.referenceImageUrl||'').trim();
    const selectedPrivateImagePath=inventoryReferenceObjectPath(referenceImageUrl);
    if(selectedPrivateImagePath)referenceImageUrl=INVENTORY_REFERENCE_PREFIX+selectedPrivateImagePath;
    metadataSaveLock.current=true;setMetadataSaveBusy(true);
    const uploadedPaths:string[]=[];
    try{
      if(!organizationId)throw new Error('No se encontró la organización para guardar las imágenes.');
      const savedImages:InventoryGalleryImage[]=[];
      for(const entry of gallery){
        if(entry.file instanceof File){
          const image=await prepareInventoryReferenceImage(entry.file);
          const path=`${organizationId}/${remoteItemId}/${uid()}.webp`;
          const {error:uploadError}=await supabase.storage.from(INVENTORY_REFERENCE_BUCKET).upload(path,image,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
          if(uploadError)throw new Error(`No se pudo subir ${entry.file.name}: ${uploadError.message}`);
          uploadedPaths.push(path);
          const {data:signedImage,error:signedImageError}=await supabase.storage.from(INVENTORY_REFERENCE_BUCKET).createSignedUrl(path,86400);
          if(signedImageError||!signedImage?.signedUrl)throw new Error(`La imagen se subió, pero no se pudo preparar su vista previa: ${signedImageError?.message||'no se recibió un enlace temporal'}.`);
          savedImages.push({...entry,file:undefined,path,src:signedImage.signedUrl});
        }else{
          const path=entry.path||inventoryReferenceObjectPath(entry.src)||entry.src;
          savedImages.push({...entry,path});
        }
      }
      const imagePaths=savedImages.map((image)=>image.path||image.src).filter(Boolean);
      referenceImageUrl=imagePaths[0]||'';
      if(referenceImageUrl&&!inventoryReferenceObjectPath(referenceImageUrl)&&! /^(https?:\/\/|\/storage\/|\/inventory\/)/i.test(referenceImageUrl))throw new Error('La imagen de portada no tiene una ruta válida.');
      customFields.product_image_paths=imagePaths;
      const {error}=await supabase.from('inventory_items').update({item_type:String(fields.itemType||'').trim(),tags:normalizedTags,description:String(fields.description||'').trim(),reference_image_url:referenceImageUrl||null,custom_fields:customFields,updated_at:new Date().toISOString()}).eq('id',remoteItemId).eq('organization_id',organizationId);
      if(error)throw new Error(`No se pudo actualizar la ficha: ${error.message}`);
      if(variantId){
        const {error:variantError}=await supabase.from('inventory_variants').update({attributes:variantAttributes}).eq('id',variantId).eq('organization_id',organizationId);
        if(variantError){await refreshRemote();flash(`La ficha general y su imagen se guardaron, pero no se pudieron guardar los atributos de la variante: ${variantError.message}`);return;}
      }
      const retained=new Set(imagePaths.map((path)=>inventoryReferenceObjectPath(path)).filter(Boolean));
      const oldPaths=[...(Array.isArray(sourceItem?.productImages)?sourceItem.productImages.map((image:any)=>image.storagePath||inventoryReferenceObjectPath(image.path)):[]),...(Array.isArray(sourceItem?.customFields?.product_image_paths)?sourceItem.customFields.product_image_paths.map((path:any)=>inventoryReferenceObjectPath(String(path))):[]),sourceItem?.referenceImageStoragePath||inventoryReferenceObjectPath(sourceItem?.referenceImageUrl)].filter((path):path is string=>Boolean(path));
      const removedPaths=[...new Set(oldPaths)].filter((path)=>path.startsWith(`${organizationId}/${remoteItemId}/`)&&!retained.has(path));
      if(removedPaths.length){const {error:removeError}=await supabase.storage.from(INVENTORY_REFERENCE_BUCKET).remove(removedPaths);if(removeError)flash(`Ficha guardada, pero no se pudieron limpiar todas las imágenes eliminadas: ${removeError.message}`);}
      await refreshRemote();setMetadataEdit(null);flash('Ficha, imagen y especificaciones actualizadas.');
    }catch(saveError:any){if(uploadedPaths.length)await supabase.storage.from(INVENTORY_REFERENCE_BUCKET).remove(uploadedPaths);flash(saveError?.message||'No se pudieron guardar las imágenes del producto.');}
    finally{metadataSaveLock.current=false;setMetadataSaveBusy(false);}
  };
  const saveReservation=async(e)=>{e.preventDefault();if(!reservationEdit||!supabase||!canManageLinks)return;const item=items.find(row=>row.id===reservationEdit.itemId);const amount=Number(reservationEdit.quantity);if(!item||!item.branchId||!Number.isFinite(amount)||amount<0){flash('Asigna una sucursal antes de reservar existencias.');return;}const {error}=await supabase.rpc('set_inventory_reservation',{p_variant_id:item.variantId,p_branch_id:item.branchId,p_reserved_quantity:amount,p_location_code:item.location||'MAIN',p_note:reservationEdit.note||''});if(error){flash(`No se pudo guardar la reserva: ${error.message}`);return;}await refreshRemote();setReservationEdit(null);flash('Reserva registrada y el POS ya descontará esas unidades de la disponibilidad.');};
  const saveItem=async(e)=>{
    e.preventDefault();
    if(savingItemLock.current)return;
    if(!canManageInventory){flash('Tu perfil no tiene permiso para crear artículos.');return;}
    if(!draft.name.trim()){flash('Escribe el nombre del artículo antes de guardarlo.');return;}
    if(!supabase||!organizationId||!user){flash('La sesión no está lista para guardar. Recarga la página e inténtalo de nuevo.');return;}
    if(draft.referenceImageUrl&&!isValidInventoryReference(draft.referenceImageUrl)){flash('La imagen debe ser una URL pública o una ruta válida de la biblioteca.');return;}
    const prefix=`VC-INV-${areaCodes[draft.area]||'GEN'}-`;
    const requestedSku=draft.sku.trim();
    const specificationEntries=Object.entries(specificationDraft).map(([key,value])=>[key,typeof value==='string'?value.trim():value]).filter(([,value])=>value!==''&&value!==undefined);
    const technicalSpecs={...Object.fromEntries(specificationEntries),brand_scope:inventoryBrandScope==='giga'?'giga':'visual'};
    const variantAttributes={...Object.fromEntries(specificationEntries),source_status:'count_pending',stock_count_required:true};
    savingItemLock.current=true;
    setSavingItem(true);
    try{
      const [{data:areaRows,error:areaError},{data:branch,error:branchError}]=await Promise.all([
        supabase.from('areas').select('id,name').eq('organization_id',organizationId).eq('name',draft.area).limit(1),
        supabase.from('branches').select('id,name').eq('organization_id',organizationId).eq('name',draft.branch).single(),
      ]);
      if(areaError)throw areaError;
      if(branchError)throw branchError;
      if(!branch)throw new Error(`No se encontró la sucursal “${draft.branch}”.`);
      variantAttributes.initial_branch_id=branch.id;
      let categoryId=null;
      if(draft.category.trim()){
        const code=`CAT-${draft.category.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)}`;
        const {data:category,error:categoryError}=await supabase.from('inventory_categories').upsert({organization_id:organizationId,code,name:draft.category.trim()},{onConflict:'organization_id,code'}).select('id').single();
        if(categoryError)throw categoryError;
        categoryId=category.id;
      }
      const targetAreaId=areaRows?.[0]?.id||null;
      const scopedItemSkus=async()=>{
        const rows:string[]=[];
        for(let from=0;;from+=500){
          const {data:page,error}=await supabase.from('inventory_items').select('sku').eq('organization_id',organizationId).like('sku',`${prefix}%`).order('sku').range(from,from+499);
          if(error)throw error;
          rows.push(...(page||[]).map((row:any)=>String(row.sku||'')));
          if((page||[]).length<500)return rows;
        }
      };
      const scopedVariantSkus=async()=>{
        const rows:string[]=[];
        for(let from=0;;from+=500){
          const {data:page,error}=await supabase.from('inventory_variants').select('sku').eq('organization_id',organizationId).like('sku',`${prefix}%`).order('sku').range(from,from+499);
          if(error)throw error;
          rows.push(...(page||[]).map((row:any)=>String(row.sku||'')));
          if((page||[]).length<500)return rows;
        }
      };
      const recoverIncompleteItem=async()=>{
        const query=supabase.from('inventory_items').select('id,sku,area_id,custom_fields,created_by,created_at').eq('organization_id',organizationId).eq('name',draft.name.trim()).like('sku',`${prefix}%`);
        const {data:matches,error}=targetAreaId?await query.eq('area_id',targetAreaId):await query.is('area_id',null);
        if(error)throw error;
        const sameScope=(matches||[]).filter((row:any)=>isRecoverableInventoryItem(row,{userId:user.id,areaId:targetAreaId,brandScope:inventoryBrandScope==='giga'?'giga':'visual',requestedSku}));
        if(!sameScope.length)return null;
        const ids=sameScope.map((row:any)=>row.id);
        const {data:existingVariants,error:variantsError}=await supabase.from('inventory_variants').select('item_id').eq('organization_id',organizationId).in('item_id',ids);
        if(variantsError)throw variantsError;
        const variantOwners=new Set((existingVariants||[]).map((row:any)=>row.item_id));
        const recoverable=sameScope.filter((row:any)=>!variantOwners.has(row.id));
        if(recoverable.length>1)throw new Error('Hay más de una ficha incompleta reciente con ese nombre. Abre el catálogo para revisar los registros antes de volver a crearla.');
        return recoverable[0]||null;
      };
      let sku=requestedSku;
      let item:any=null;
      let recoveredItem:any=null;
      for(let attempt=0;attempt<5&&!item;attempt++){
        recoveredItem=await recoverIncompleteItem();
        if(recoveredItem){
          sku=recoveredItem.sku;
          const {data:updated,error:updateError}=await supabase.from('inventory_items').update({area_id:targetAreaId,category_id:categoryId,description:draft.notes.trim(),item_type:draft.itemType.trim(),tags:[...new Set(draft.tags.split(',').map(tag=>tag.trim().slice(0,48)).filter(Boolean))].slice(0,40),custom_fields:{...(recoveredItem.custom_fields||{}),...technicalSpecs},base_unit:draft.unit.trim()||'unidad',minimum_quantity:Number(draft.minimum)||0,updated_at:new Date().toISOString()}).eq('id',recoveredItem.id).eq('organization_id',organizationId).select('id').single();
          if(updateError)throw updateError;
          item=updated;
          break;
        }
        if(!sku){
          const [itemSkus,variantSkus]=await Promise.all([scopedItemSkus(),scopedVariantSkus()]);
          sku=nextInventorySku(prefix,itemSkus,variantSkus);
        }else{
          const [{data:existingItem,error:itemCheckError},{data:existingVariant,error:variantCheckError}]=await Promise.all([
            supabase.from('inventory_items').select('id').eq('organization_id',organizationId).eq('sku',sku).maybeSingle(),
            supabase.from('inventory_variants').select('id').eq('organization_id',organizationId).eq('sku',`${sku}-01`).maybeSingle(),
          ]);
          if(itemCheckError)throw itemCheckError;
          if(variantCheckError)throw variantCheckError;
          if(existingItem||existingVariant)throw new Error(`El código “${sku}” o su variante “${sku}-01” ya está en uso. Cambia el código o déjalo vacío para asignar uno disponible automáticamente.`);
        }
        const {data:created,error:createError}=await supabase.from('inventory_items').insert({organization_id:organizationId,area_id:targetAreaId,category_id:categoryId,sku,name:draft.name.trim(),description:draft.notes.trim(),item_type:draft.itemType.trim(),tags:[...new Set(draft.tags.split(',').map(tag=>tag.trim().slice(0,48)).filter(Boolean))].slice(0,40),reference_image_url:null,custom_fields:technicalSpecs,base_unit:draft.unit.trim()||'unidad',minimum_quantity:Number(draft.minimum)||0,created_by:user.id}).select('id').single();
        if(!createError){item=created;break;}
        if(requestedSku||!isInventoryItemSkuConflict(createError))throw createError;
        sku='';
      }
      if(!item||!sku)throw new Error('No se pudo asignar un código libre después de varios intentos. Intenta guardar nuevamente.');
      const productImagePaths:string[]=[];const imageFailures:string[]=[];
      for(const entry of newProductImages){
        if(entry.file instanceof File){
          try{
            const image=await prepareInventoryReferenceImage(entry.file);const path=`${organizationId}/${item.id}/${uid()}.webp`;
            const {error:uploadError}=await supabase.storage.from(INVENTORY_REFERENCE_BUCKET).upload(path,image,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
            if(uploadError)throw uploadError;
            productImagePaths.push(INVENTORY_REFERENCE_PREFIX+path);
          }catch(uploadFailure:any){imageFailures.push(`${entry.file.name}: ${uploadFailure?.message||'no se pudo cargar'}`);}
        }else productImagePaths.push(entry.path||entry.src);
      }
      const previousImagePaths=Array.isArray(recoveredItem?.custom_fields?.product_image_paths)?recoveredItem.custom_fields.product_image_paths.filter((path:any)=>typeof path==='string'):[];
      const coverPath=productImagePaths[0]||draft.referenceImageUrl.trim()||recoveredItem?.reference_image_url||previousImagePaths[0]||'';
      const finalImagePaths=productImagePaths.length?productImagePaths:draft.referenceImageUrl.trim()?[draft.referenceImageUrl.trim()]:previousImagePaths;
      if(finalImagePaths.length||coverPath){
        const {error:imageSaveError}=await supabase.from('inventory_items').update({reference_image_url:coverPath||null,custom_fields:{...(recoveredItem?.custom_fields||{}),...technicalSpecs,product_image_paths:finalImagePaths.length?finalImagePaths:[coverPath]}}).eq('id',item.id).eq('organization_id',organizationId);
        if(imageSaveError)throw imageSaveError;
      }
      const {data:variant,error:variantError}=await supabase.from('inventory_variants').insert({organization_id:organizationId,item_id:item.id,sku:`${sku}-01`,label:draft.variant.trim(),attributes:variantAttributes}).select('id').single();
      if(variantError)throw variantError;
      if(draft.quantity!==''){
        const {error:countError}=await supabase.rpc('set_inventory_count',{p_variant_id:variant.id,p_branch_id:branch.id,p_counted_quantity:Number(draft.quantity),p_location_code:draft.location.trim()||'MAIN',p_note:'Alta de artículo; conteo físico confirmado por el usuario'});
        if(countError)throw countError;
      }
      await refreshRemote();
      setDraft(blankItem);
      newProductImages.forEach((image)=>{if(image.file)URL.revokeObjectURL(image.src);});
      setNewProductImages([]);
      setSpecificationDraft({});
      setShowForm(false);
      flash(`${recoveredItem?'Se recuperó la ficha incompleta. ':''}${draft.quantity===''?`Artículo ${sku} guardado sin saldo físico confirmado.`:`Artículo ${sku} guardado con conteo físico auditado.`}${imageFailures.length?` Algunas imágenes no se guardaron; abre la ficha para reintentarlo: ${imageFailures.join(' · ')}`:''}`);
    }catch(error){
      const details=error&&typeof error==='object'?error as {message?:unknown;hint?:unknown;code?:unknown}:undefined;
      const message=typeof details?.message==='string'?details.message:'Error inesperado al guardar.';
      const hint=typeof details?.hint==='string'?details.hint:'';
      const code=typeof details?.code==='string'?` (${details.code})`:'';
      flash(`No se pudo guardar el artículo: ${message}${hint?` · ${hint}`:''}${code}`);
    }finally{savingItemLock.current=false;setSavingItem(false);}
  };
  const closeNewItemForm=()=>{
    if(savingItem)return;
    newProductImages.forEach((image)=>{if(image.file)URL.revokeObjectURL(image.src);});
    setNewProductImages([]);setDraft(blankItem);setSpecificationDraft({});setShowForm(false);
  };
  const reviewImportRow=async(event)=>{event.preventDefault();if(!reviewEditor||!supabase||!canReviewImports)return;const mapped=reviewEditor.decision==='mapped';if(mapped&&!reviewEditor.variantId){flash('Selecciona la variante correcta antes de vincular.');return;}if(!mapped&&!reviewEditor.note.trim()){flash('Indica por qué se excluye esta fila.');return;}setReviewBusy(true);try{const {error}=await supabase.rpc('review_inventory_import_row',{p_row_id:reviewEditor.id,p_decision:reviewEditor.decision,p_variant_id:mapped?reviewEditor.variantId:null,p_note:reviewEditor.note.trim()});if(error)throw error;setImportRows(rows=>rows.filter(row=>row.id!==reviewEditor.id));setPendingImportCount(count=>Math.max(0,Number(count||0)-1));setReviewEditor(null);flash(mapped?'Fila vinculada al artículo. El inventario sigue pendiente de conteo físico.':'Fila excluida con motivo e historial auditado.');}catch(error){flash(`No se pudo guardar la revisión: ${error.message}`);}finally{setReviewBusy(false);}};
  const applyMovement=async(e)=>{
    e.preventDefault();if(!canManageInventory)return;if(movement.type==='transferencia'&&transferBusy)return;const qty=Number(movement.quantity);if(!Number.isFinite(qty)||qty<0||(movement.type!=='ajuste'&&qty===0)){flash('Ingresa una cantidad válida antes de continuar.');return;}
    const item=items.find(x=>x.id===movement.itemId);if(!item||!supabase)return;
    const availableQuantity=Number(item.availableQuantity??(Number(item.quantity||0)-Number(item.reservedQuantity||0)));
    const shortage=['consumo','merma','venta','transferencia'].includes(movement.type)?Math.max(0,qty-availableQuantity):0;
    if(shortage){flash(movement.type==='venta'?'Registra la venta desde el POS para que el faltante quede como compra urgente.':'Stock insuficiente; registra primero una compra recibida o corrige el conteo físico.');return;}
    const note=`${movement.reason.trim()}; responsable: ${movement.actor}${movement.reference?`; ref: ${movement.reference}`:''}`;
    if(movement.type==='transferencia')setTransferBusy(true);
    try{
      let result;
      if(movement.type==='ajuste') result=await supabase.rpc('set_inventory_count',{p_variant_id:item.variantId,p_branch_id:item.branchId,p_counted_quantity:qty,p_location_code:item.location||'MAIN',p_note:note});
      else if(movement.type==='transferencia'){
        const fromLocations=locationsForBranch(item.branch);
        const toLocations=locationsForBranch(movement.toBranch);
        if(!fromLocations.some(location=>location.code===movement.fromLocation)||!toLocations.some(location=>location.code===movement.toLocation))throw new Error('Selecciona ubicaciones activas para ambas sucursales.');
        const {data:target,error:targetError}=await supabase.from('branches').select('id').eq('organization_id',organizationId).eq('name',movement.toBranch).single();if(targetError)throw targetError;
        result=await supabase.rpc('create_stock_transfer_request',{p_from_branch:item.branchId,p_to_branch:target.id,p_variant:item.variantId,p_quantity:qty,p_note:note,p_from_location:movement.fromLocation,p_to_location:movement.toLocation});
      }else{
        const kind={entrada:'receipt',consumo:'consumption',merma:'waste',venta:'consumption'}[movement.type]||'consumption';
        result=await supabase.rpc('record_inventory_movement',{p_variant_id:item.variantId,p_branch_id:item.branchId,p_movement_type:kind,p_quantity:qty,p_reason:note,p_location_code:item.location||'MAIN',p_reference_type:movement.reference?'document':null});
      }
      if(result?.error)throw result.error;await refreshRemote();flash(movement.type==='transferencia'?`Solicitud ${result.data?.transfer_code||'de traspaso'} enviada a ${movement.toBranch}. El saldo cambiará al despachar y recibir en Flujos → Transferencias.`:movement.type==='ajuste'?'Conteo físico guardado en la bitácora.':'Movimiento guardado en el inventario compartido.');setMovement(null);
    }catch(error){flash(`No se pudo guardar el movimiento: ${error.message}`);}finally{if(movement.type==='transferencia')setTransferBusy(false);}
  };
  const closeGuidedCount=async(sessionId,statusNote='Conteo guiado cerrado')=>{
    if(!supabase)return;
    const {data:result,error}=await supabase.rpc('complete_inventory_count_session',{p_session_id:sessionId});
    if(error)throw error;
    await refreshRemote();setCountSession(null);
    flash(`${statusNote}. ${Number(result?.pending||0)} artículo(s) siguen pendientes; ${Number(result?.skipped||0)} fueron omitidos.`);
  };
  const startGuidedCount=async()=>{
    if(!canManageInventory){flash('Tu perfil no puede confirmar conteos físicos.');return;}
    if(branch==='Todas'){flash('Selecciona una sucursal para abrir una sesión de conteo.');return;}
    if(!countQueue.length){flash('No hay artículos pendientes de conteo con los filtros actuales.');return;}
    setCountBusy(true);
    try{
      const selected=countQueue.filter(item=>item.branch===branch&&item.branchId);
      if(!selected.length)throw new Error('No hay artículos asignados a esa sucursal dentro de los filtros actuales.');
      const {data:result,error}=await supabase.rpc('begin_inventory_count_session',{p_branch_id:selected[0]?.branchId,p_lines:selected.map(item=>({variant_id:item.variantId,location_code:item.location||'MAIN'})),p_idempotency_key:uid(),p_note:`Conteo guiado · área: ${area}`});
      if(error)throw error;
      const lines=result?.lines||[];
      const sessionItems=lines.map(line=>items.find(item=>item.variantId===line.variant_id&&item.branchId===line.branch_id&&item.location===(line.location_code||'MAIN')));
      if(!lines.length||sessionItems.some(item=>!item))throw new Error('No se pudieron relacionar todos los artículos de la sesión con el inventario cargado.');
      const pendingIndex=lines.findIndex(line=>line.status==='pending');
      if(pendingIndex<0){await closeGuidedCount(result.session_id,'Sesión reanudada y cerrada');return;}
      setCountSession({sessionId:result.session_id,ids:sessionItems.map(item=>item.id),lineIds:lines.map(line=>line.id),statuses:lines.map(line=>line.status),expected:lines.map(line=>line.expected_quantity===null?null:Number(line.expected_quantity)),index:pendingIndex,skipped:lines.filter(line=>line.status==='skipped').length,actor:user?.email||'',quantity:'',reason:'Conteo físico inicial'});
      flash(result.reused?'Se reanudó tu sesión de conteo abierta.':'Sesión de conteo iniciada. Cada conteo se guarda con auditoría.');
    }catch(error){flash(`No se pudo iniciar el conteo: ${error.message}`);}finally{setCountBusy(false);}
  };
  const cancelGuidedCount=async()=>{
    if(!countSession||!supabase)return;
    setCountBusy(true);
    try{const {error}=await supabase.rpc('cancel_inventory_count_session',{p_session_id:countSession.sessionId,p_note:'Recorrido cerrado por el responsable'});if(error)throw error;setCountSession(null);await refreshRemote();flash('Recorrido cerrado. Los conteos ya guardados permanecen en la bitácora.');}
    catch(error){flash(`No se pudo cerrar el recorrido: ${error.message}`);}finally{setCountBusy(false);}
  };
  const advanceGuidedCount=async()=>{
    if(!countSession||!supabase)return;
    setCountBusy(true);
    try{
      const {error}=await supabase.rpc('skip_inventory_count_session_line',{p_session_id:countSession.sessionId,p_line_id:countSession.lineIds[countSession.index],p_note:countSession.reason||'Omitido durante el recorrido'});
      if(error)throw error;
      const statuses=[...countSession.statuses];statuses[countSession.index]='skipped';
      const nextIndex=statuses.findIndex((status,index)=>index>countSession.index&&status==='pending');
      if(nextIndex<0)await closeGuidedCount(countSession.sessionId,'Recorrido terminado');
      else setCountSession({...countSession,statuses,index:nextIndex,skipped:countSession.skipped+1,quantity:''});
    }catch(error){flash(`No se pudo omitir el artículo: ${error.message}`);}finally{setCountBusy(false);}
  };
  const saveGuidedCount=async(event)=>{
    event.preventDefault();if(!countSession||!countItem||!supabase||!canManageInventory)return;
    const quantity=Number(countSession.quantity);if(!Number.isFinite(quantity)||quantity<0){flash('Ingresa una cantidad válida.');return;}
    setCountBusy(true);
    try{
      const note=`Responsable declarado: ${countSession.actor.trim()||user?.email||'usuario autenticado'} · ${countSession.reason.trim()||'Conteo físico inicial'}`;
      const {error}=await supabase.rpc('record_inventory_count_session_line',{p_session_id:countSession.sessionId,p_line_id:countSession.lineIds[countSession.index],p_counted_quantity:quantity,p_note:note});
      if(error)throw error;
      const statuses=[...countSession.statuses];statuses[countSession.index]='counted';
      const nextIndex=statuses.findIndex((status,index)=>index>countSession.index&&status==='pending');
      if(nextIndex<0){await refreshRemote();setCountSession(null);flash(`Conteo de ${countItem.name} guardado con auditoría. Sesión completada.`);}
      else{setCountSession({...countSession,statuses,index:nextIndex,quantity:''});flash(`Conteo de ${countItem.name} guardado con auditoría.`);}
    }catch(error){flash(`No se pudo guardar el conteo: ${error.message}`);}finally{setCountBusy(false);}
  };
  const duplicateItem=async(item)=>{if(!canManageInventory||!supabase||!item.remoteItemId)return;if(!window.confirm(`¿Crear una copia de ${item.name}? La copia quedará sin existencias ni movimientos y requerirá conteo físico.`))return;const {data,error}=await supabase.rpc('duplicate_visualcorp_inventory_item',{p_item_id:item.remoteItemId});if(error){flash(`No se pudo duplicar el artículo: ${error.message}`);return;}await refreshRemote();flash(`Copia creada como ${data?.sku||'nuevo artículo'}; sus existencias quedan pendientes de conteo.`);};
  const removeItem=async(item,confirmed=false)=>{if(!canManageInventory||(!confirmed&&!window.confirm(`¿Eliminar ${item.name} del catálogo activo? Se conserva el historial de stock, conteos y movimientos.`)))return;const {error}=await supabase.from('inventory_items').update({active:false}).eq('id',item.remoteItemId).eq('organization_id',organizationId);if(error){flash(`No se pudo eliminar el artículo: ${error.message}`);return;}if(metadataEdit?.remoteItemId===item.remoteItemId)setMetadataEdit(null);await refreshRemote();flash('Artículo eliminado del catálogo activo; se conservó el historial.');};
  const removeItems=async(selected)=>{if(!canManageInventory||!supabase||!organizationId||!selected.length)return;const ids=[...new Set(selected.map((item)=>item.remoteItemId).filter(Boolean))];const {data:archived,error}=await supabase.from('inventory_items').update({active:false}).eq('organization_id',organizationId).in('id',ids).select('id');if(error){flash(`No se pudieron eliminar los artículos: ${error.message}`);return;}await refreshRemote();flash(`${archived?.length||0} artículo(s) eliminados del catálogo activo; se conservó su historial.`);};
  const saveCost=async(e)=>{e.preventDefault();if(!canEditCosts||!costEdit||!user)return;const cost=Number(costEdit?.unitCost);if(!costEdit||!Number.isFinite(cost)||cost<0)return;const {error}=await supabase.from('inventory_item_costs').upsert({organization_id:organizationId,variant_id:costEdit.variantId,unit_cost:cost,supplier_name:costEdit.supplierName.trim()||null,updated_by:user.id},{onConflict:'organization_id,variant_id'});if(error){flash(`No se pudo guardar el costo: ${error.message}`);return;}await refreshRemote();setCostEdit(null);flash('Costo guardado. Solo los perfiles autorizados pueden verlo.');};
  const saveCatalogLink=async(e)=>{e.preventDefault();if(!canManageLinks||!linkDraft.catalogProductId||!linkDraft.variantId||!supabase||!organizationId||!user)return;const inventoryRow=items.find((item)=>item.variantId===linkDraft.variantId&&item.branch===linkDraft.branch);if(!inventoryRow){flash('Selecciona una variante física activa para esa sucursal.');return;}const {error}=await supabase.from('catalog_inventory_links').upsert({organization_id:organizationId,catalog_product_id:linkDraft.catalogProductId,inventory_variant_id:linkDraft.variantId,branch_id:inventoryRow.branchId,location_code:linkDraft.location.trim()||'MAIN',active:true,created_by:user.id},{onConflict:'organization_id,catalog_product_id,branch_id'});if(error){flash(`No se pudo vincular el producto: ${error.message}`);return;}const {data:rows,error:readError}=await supabase.from('catalog_inventory_links').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id',organizationId).order('created_at');if(readError){flash(`El vínculo se guardó, pero no se pudo refrescar la lista: ${readError.message}`);return;}setCatalogLinks(rows||[]);setLinkDraft({...linkDraft,catalogProductId:'',variantId:''});flash('Vínculo guardado. Solo esta asignación explícita hará que una venta afecte el inventario.');};
  const saveMaterialRecipe=async(e)=>{e.preventDefault();if(!canManageLinks||recipeSchemaStatus!=='ready'||!recipeDraft.catalogProductId||!recipeDraft.variantId||!supabase||!organizationId||!user)return;const stock=items.find(item=>item.variantId===recipeDraft.variantId&&item.branch===recipeDraft.branch);const product=(data.catalog||[]).find(item=>item.id===recipeDraft.catalogProductId);const rate=Number(recipeDraft.rate),waste=Number(recipeDraft.waste);if(!stock||!stock.branchId||!Number.isFinite(rate)||rate<=0||!Number.isFinite(waste)||waste<0){flash('Revisa el material, la sucursal, la cantidad base y el desperdicio.');return;}if(recipeDraft.mode==='area_to_linear'&&product?.mode!=='area'){flash('El producto de la receta debe venderse por medidas (m²).');return;}if(recipeDraft.mode==='area_to_linear'&&!/^(metro|metros|m|m lineal|metro lineal)$/i.test(stock.unit||'')){flash('El consumo por área requiere que el material esté contado en metros lineales.');return;}if(recipeDraft.mode==='area_to_linear'&&!/107|127|310/.test(stock.variant||'')){flash('Elige una variante de rollo con ancho confirmado (107, 127 o 310 cm).');return;}if(catalogLinks.some(link=>link.active&&link.catalog_product_id===recipeDraft.catalogProductId&&link.branch_id===stock.branchId&&link.inventory_variant_id===stock.variantId)){flash('Este producto ya descuenta la misma variante por un vínculo directo. Desactiva ese vínculo antes de agregarla también como material.');return;}const {error}=await supabase.from('catalog_material_recipes').upsert({organization_id:organizationId,catalog_product_id:recipeDraft.catalogProductId,inventory_variant_id:recipeDraft.variantId,branch_id:stock.branchId,location_code:recipeDraft.location||'MAIN',calculation_mode:recipeDraft.mode,fulfillment_stage:recipeDraft.stage,quantity_per_basis:rate,waste_percent:waste,active:true,created_by:user.id},{onConflict:'organization_id,catalog_product_id,inventory_variant_id,branch_id'});if(error){flash(`No se pudo guardar la receta: ${error.message}`);return;}const {data:rows,error:readError}=await supabase.from('catalog_material_recipes').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,calculation_mode,fulfillment_stage,quantity_per_basis,waste_percent,active').eq('organization_id',organizationId).order('created_at');if(readError){flash(`La receta se guardó, pero no se pudo actualizar la lista: ${readError.message}`);return;}setMaterialRecipes(rows||[]);setRecipeDraft({...recipeDraft,catalogProductId:'',variantId:'',rate:'1',waste:'0'});flash(recipeDraft.stage==='production'?'Receta guardada; el stock se reservará al confirmar y se consumirá al iniciar producción.':'Receta guardada. El consumo se registrará al confirmar la venta.');};
  const archiveMaterialRecipe=async(recipe)=>{if(!canManageLinks)return;const {error}=await supabase.from('catalog_material_recipes').update({active:false,updated_at:new Date().toISOString()}).eq('id',recipe.id).eq('organization_id',organizationId);if(error){flash(`No se pudo desactivar la receta: ${error.message}`);return;}setMaterialRecipes(rows=>rows.map(row=>row.id===recipe.id?{...row,active:false}:row));flash('Receta desactivada; se conserva el historial de consumos.');};
  const archiveCatalogLink=async(link)=>{if(!canManageLinks)return;const {error}=await supabase.from('catalog_inventory_links').update({active:false,updated_at:new Date().toISOString()}).eq('id',link.id).eq('organization_id',organizationId);if(error){flash(`No se pudo desactivar el vínculo: ${error.message}`);return;}setCatalogLinks((rows)=>rows.map((row)=>row.id===link.id?{...row,active:false}:row));flash('Vínculo desactivado; el historial de ventas se conserva.');};
  const configureRollWidths=async(event)=>{event.preventDefault();if(!canManageInventory||!supabase||!organizationId||!rollWidthDraft.itemId||!rollWidthDraft.widths.length)return;const roll=items.find(item=>item.remoteItemId===rollWidthDraft.itemId);if(!roll)return;setInventorySetupBusy(true);try{const existingSkus=new Set(items.map(item=>item.variantSku));const rows=rollWidthDraft.widths.filter(width=>!existingSkus.has(`${roll.sku}-${width}CM`)).map(width=>({organization_id:organizationId,item_id:roll.remoteItemId,sku:`${roll.sku}-${width}CM`,label:`Ancho ${width} cm · Existencia física por contar`,attributes:{...(roll.variantAttributes||{}),source_status:'count_pending',stock_count_required:true,width_cm:width,width_unit:'cm'},active:true}));if(rows.length){const {error}=await supabase.from('inventory_variants').upsert(rows,{onConflict:'organization_id,sku',ignoreDuplicates:true});if(error)throw error;}await refreshRemote();setRollWidthDraft({itemId:'',widths:[]});flash(rows.length?`Se agregaron ${rows.length} variante(s) de ancho. Registra el conteo físico antes de venderlas.`:'Esas medidas ya estaban configuradas.');}catch(error){flash(`No se pudieron configurar los anchos: ${error.message}`);}finally{setInventorySetupBusy(false);}};
  const prepareGrommetTracking=async()=>{if(!canManageInventory||!supabase||!organizationId||!user)return;setInventorySetupBusy(true);try{const [{data:category,error:categoryError},{data:areaRow,error:areaError},{data:branchRow,error:branchError}]=await Promise.all([supabase.from('inventory_categories').select('id').eq('organization_id',organizationId).eq('code','CAT-TRO-ACABADOS').maybeSingle(),supabase.from('areas').select('id').eq('organization_id',organizationId).eq('code','TRO').maybeSingle(),supabase.from('branches').select('id').eq('organization_id',organizationId).eq('code','VIS').eq('active',true).maybeSingle()]);if(categoryError)throw categoryError;if(areaError)throw areaError;if(branchError)throw branchError;if(!category||!areaRow||!branchRow)throw new Error('Falta el área Troquelado, la categoría de acabados o la sucursal Visual Corp.');const specs=[{sku:'VC-INV-ACC-OJAL-PEQ',name:'Ojal pequeño',catalogId:'prod-extras-ojal-peque-o-c-u'},{sku:'VC-INV-ACC-OJAL-GDE',name:'Ojal grande',catalogId:'prod-extras-ojales-grande-c-u'}];for(const spec of specs){let {data:item,error}=await supabase.from('inventory_items').select('id').eq('organization_id',organizationId).eq('sku',spec.sku).maybeSingle();if(error)throw error;if(!item){const result=await supabase.from('inventory_items').insert({organization_id:organizationId,category_id:category.id,area_id:areaRow.id,sku:spec.sku,name:spec.name,description:'Accesorio de confección; conteo físico inicial pendiente.',item_type:'consumible',tags:['ojales','acabados'],reference_image_url:'/inventory/grommets-reference.webp',custom_fields:{source_status:'count_pending',stock_count_required:true,initial_branch_id:branchRow.id,default_location_code:'MAIN'},base_unit:'unidad',minimum_quantity:0,active:true,created_by:user.id}).select('id').single();if(result.error)throw result.error;item=result.data;}let {data:variant,error:variantError}=await supabase.from('inventory_variants').select('id').eq('organization_id',organizationId).eq('sku',`${spec.sku}-01`).maybeSingle();if(variantError)throw variantError;if(!variant){const result=await supabase.from('inventory_variants').insert({organization_id:organizationId,item_id:item.id,sku:`${spec.sku}-01`,label:'Conteo físico pendiente',attributes:{source_status:'count_pending',stock_count_required:true},active:true}).select('id').single();if(result.error)throw result.error;variant=result.data;}const {data:product,error:productError}=await supabase.from('catalog_products').select('id').eq('organization_id',organizationId).eq('id',spec.catalogId).eq('is_published',true).maybeSingle();if(productError)throw productError;if(!product)throw new Error(`El producto ${spec.name} no está publicado en el catálogo.`);const {error:linkError}=await supabase.from('catalog_inventory_links').upsert({organization_id:organizationId,catalog_product_id:spec.catalogId,inventory_variant_id:variant.id,branch_id:branchRow.id,location_code:'MAIN',active:true,created_by:user.id},{onConflict:'organization_id,catalog_product_id,branch_id'});if(linkError)throw linkError;}await refreshRemote();const {data:links,error:linksError}=await supabase.from('catalog_inventory_links').select('id,catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id',organizationId).order('created_at');if(linksError)throw linksError;setCatalogLinks(links||[]);flash('Ojales conectados al POS. Antes de descontar ventas, asigna la sucursal y confirma el conteo físico de cada tamaño.');}catch(error){flash(`No se pudieron preparar los ojales: ${error.message}`);}finally{setInventorySetupBusy(false);}};
  const loadMoreMovements=async()=>{
    if(!supabase||!organizationId||movementPageBusy)return;
    setMovementPageBusy(true);
    try{
      const start=events.length;
      const {data:rows,error}=await supabase.from('inventory_movements').select('id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+99);
      if(error)throw error;
      if((rows||[]).length<100)setMovementHistoryExhausted(true);
      const labels={receipt:'entrada',consumption:'consumo',return:'devolución',waste:'merma',sale:'venta',adjustment:'ajuste',transfer_out:'transferencia_salida',transfer_in:'recepcion_transferencia'};
      const branchById=new Map((data.branches||[]).map(branch=>[branch.id,branch.name]));
      const loaded=(rows||[]).map(row=>{const item=items.find(candidate=>candidate.variantId===row.variant_id);return {id:row.id,itemId:row.variant_id,itemName:item?.name||item?.variantSku||'Artículo',unit:item?.unit||'',quantity:Math.abs(Number(row.quantity_delta)),quantityDelta:Number(row.quantity_delta),type:labels[row.movement_type]||row.movement_type,actor:row.created_by===user?.id?user.email:`Usuario ${row.created_by}`,reason:row.reason,referenceType:row.reference_type||'',reference:row.reference_id||'',branch:branchById.get(row.branch_id)||'',location:row.location_code||'MAIN',createdAt:row.created_at,shortage:0};});
      const known=new Set(events.map(event=>event.id));
      setData(current=>({...current,inventoryMovements:[...(current.inventoryMovements||[]),...loaded.filter(event=>!known.has(event.id))]}));setMovementVisibleCount(count=>count+100);
    }catch(error){flash(`No se pudo cargar el historial anterior: ${error.message}`);}finally{setMovementPageBusy(false);}
  };
  const syncInventoryReferenceImages=async()=>{if(!canManageInventory||!supabase||!organizationId)return;const unique=[...new Map<string,any>(items.filter(item=>item.remoteItemId&&item.sku&&!item.referenceImageUrl).map(item=>[item.remoteItemId,item])).values()];if(!unique.length){flash('Todos los artículos cargados ya tienen una imagen de referencia.');return;}setInventorySetupBusy(true);try{let updated=0;for(const item of unique){const path=`/inventory/${item.sku}.webp`;const response=await fetch(path,{method:'HEAD'});if(!response.ok)continue;const {error}=await supabase.from('inventory_items').update({reference_image_url:path,updated_at:new Date().toISOString()}).eq('id',item.remoteItemId).eq('organization_id',organizationId);if(error)throw error;updated++;}await refreshRemote();flash(`Se asignaron ${updated} imágenes de referencia disponibles. Los archivos faltantes quedan sin cambios.`);}catch(error){flash(`No se pudieron sincronizar las imágenes: ${error.message}`);}finally{setInventorySetupBusy(false);}};
  return <div className="inventory-workspace">
    <PageHeading eyebrow="INVENTARIO · VISUAL CORP + GIGAPRINT" title="Inventarios por marca, sucursal y área" description={`${pendingImportCount===null?'Cargando las fuentes de inventario…':`${pendingImportCount} filas de origen pendientes de cotejo; no son stock activo.`} Las fichas actuales pertenecen a Visual Corp; el inventario de Giga se habilita al cargar sus artículos.`} action={canManageInventory&&<button type="button" className="button button-dark" onClick={()=>{setActiveSection('catalog');setShowForm(true);}}><Plus size={16}/> Añadir artículo</button>}/>
    <nav className="inventory-brand-nav" aria-label="Inventarios por marca">
      <button type="button" aria-pressed={inventoryBrandScope==='general'} onClick={()=>{setInventoryBrandScope('general');setBranch('Todas');setCategory('Todas');}}>General <span>{new Set(items.filter(item=>!item.archived).map(item=>item.remoteItemId||item.sku)).size}</span></button>
      <button type="button" aria-pressed={inventoryBrandScope==='visual'} onClick={()=>{setInventoryBrandScope('visual');setBranch('Todas');setCategory('Todas');}}>Visual <span>{new Set(items.filter(item=>!item.archived&&brandOf(item)==='visual').map(item=>item.remoteItemId||item.sku)).size}</span></button>
      <button type="button" aria-pressed={inventoryBrandScope==='giga'} onClick={()=>{setInventoryBrandScope('giga');setBranch('Todas');setCategory('Todas');}}>Giga <span>{new Set(items.filter(item=>!item.archived&&brandOf(item)==='giga').map(item=>item.remoteItemId||item.sku)).size}</span></button>
      <small>Los traspasos entre sucursales conservan responsable, motivo y registro de movimiento.</small>
    </nav>
    <nav className="inventory-section-nav" aria-label="Secciones del inventario"><button type="button" aria-pressed={activeSection==='catalog'} onClick={()=>setActiveSection('catalog')}>Artículos físicos</button><button type="button" aria-pressed={activeSection==='stock'} onClick={()=>setActiveSection('stock')}>Existencias</button><button type="button" aria-pressed={activeSection==='counts'} onClick={()=>setActiveSection('counts')}>Conteos</button><button type="button" aria-pressed={activeSection==='locations'} onClick={()=>setActiveSection('locations')}>Ubicaciones</button>{canViewStandardProducts&&<button type="button" aria-pressed={activeSection==='standard-products'} onClick={()=>setActiveSection('standard-products')}>Productos estándar</button>}<button type="button" aria-pressed={activeSection==='integrations'} onClick={()=>setActiveSection('integrations')}>POS y producción</button><button type="button" aria-pressed={activeSection==='imports'} onClick={()=>setActiveSection('imports')}>Importaciones</button><button type="button" aria-pressed={activeSection==='movements'} onClick={()=>setActiveSection('movements')}>Movimientos</button><a href="/operaciones/compras">Compras</a></nav>
    <div className="inventory-stats"><article><Boxes/><span>Artículos</span><b>{new Set(scopedItems.filter(i=>!i.archived).map(i=>i.remoteItemId||i.sku)).size}</b></article><article className={low.length?'inventory-stat-alert':''}><CircleAlert/><span>En mínimo / agotados</span><b>{low.length}</b></article><article className={pendingPhysicalCount?'inventory-stat-alert':''}><ClipboardCheck/><span>Conteos pendientes</span><b>{pendingPhysicalCount}</b></article><article><ArrowLeftRight/><span>Movimientos</span><b>{scopedEvents.length}</b></article><article><ClipboardList/><span>Áreas</span><b>{new Set(scopedItems.filter(i=>!i.archived).map(i=>i.area).filter(Boolean)).size}</b></article></div>
    {activeSection==='catalog'&&<div className="inventory-branch-switcher"><span className="inventory-branch-switcher-label"><Boxes size={16}/>Sucursal</span><div className="inventory-branch-switcher-track" role="group" aria-label="Seleccionar sucursal o inventario"><button type="button" aria-pressed={inventoryBrandScope==='visual'} onClick={()=>{setInventoryBrandScope('visual');setBranch('Todas');setCategory('Todas');}}>Visual</button><button type="button" aria-pressed={inventoryBrandScope==='giga'} onClick={()=>{setInventoryBrandScope('giga');setBranch('Todas');setCategory('Todas');}}>Giga</button></div><small>{inventoryBrandScope==='general'?'Vista general: selecciona Visual o Giga':inventoryBrandScope==='giga'?'Viendo artículos de Giga':'Viendo artículos de Visual'}</small></div>}
      <InventoryInsights id="inventory-catalog" hidden={activeSection!=='catalog'} items={scopedItems} canSeeCosts={canSeeCosts} canEditCosts={canEditCosts} canEdit={canManageInventory} canReserve={canManageLinks} canMove={canManageInventory} canRequestTransfer={false} onTransfer={(item,branchName)=>item.branchId?openTransferRequest(item,branchName||branches.find(value=>value!==item.branch)):flash('Asigna una sucursal antes de solicitar un traspaso.')} onEdit={(item)=>{const productImages=Array.isArray(item.productImages)&&item.productImages.length?item.productImages.map((image,index)=>({key:`stored-${item.remoteItemId}-${index}`,src:image.url,path:image.path,label:image.label})):item.referenceImageUrl?[{key:`legacy-${item.remoteItemId}`,src:item.referenceImageUrl,path:item.referenceImageStoragePath||item.referenceImageUrl,label:'Imagen de referencia'}]:[];setMetadataEdit({remoteItemId:item.remoteItemId,variantId:item.variantId,itemType:item.itemType||'',tags:(item.tags||[]).join(', '),referenceImageUrl:item.referenceImageUrl||'',productImages,customFields:item.customFields||{},brandScope:brandOf(item),variantAttributes:item.variantAttributes||{},description:item.description||'',sourceItem:item});}} onReserve={(item)=>item.branchId?setReservationEdit({itemId:item.id,quantity:String(item.reservedQuantity||0),note:''}):flash('Asigna una sucursal antes de reservar existencias.')} onMovement={(item,type)=>item.branchId?(type==='transferencia'?openTransferRequest(item,branches.find(value=>value!==item.branch)):setMovement({itemId:item.id,type,quantity:'',actor:'',reason:'',reference:''})):flash('Asigna una sucursal antes de registrar movimientos.')} onCost={(item)=>setCostEdit({variantId:item.variantId,unitCost:item.unitCost??'',supplierName:item.supplierName||'',name:item.name})} onArchive={removeItem} onArchiveMany={removeItems} branchOptions={branches} onAssignBranch={assignInventoryBranch} onAssignBranchMany={assignInventoryBranchMany} onDuplicate={duplicateItem} formatDate={formatDate} formatMoney={formatMoney} metadataEdit={metadataEdit} setMetadataEdit={setMetadataEdit} reservationEdit={reservationEdit} setReservationEdit={setReservationEdit} onSaveMetadata={saveMetadata} onSaveReservation={saveReservation} metadataSaveBusy={metadataSaveBusy}/>
    {activeSection==='standard-products'&&canViewStandardProducts&&<div className="inventory-standard-products"><div className="inventory-standard-products-note"><Boxes size={16}/><span><b>Plantillas para vender, separadas del stock físico</b><small>Define modelos, precios, materiales, colores, medidas y datos que cambiarán en cada pedido. Crear una plantilla no suma existencias.</small></span></div><StandardCustomProducts editable={canEditStandardProducts} editablePrices={canEditStandardPrices}/></div>}
    <InventoryLocations id="inventory-locations" hidden={activeSection!=='locations'} canManage={canManageLinks} catalogLinks={catalogLinks}/>
    <section id="inventory-integrations" hidden={activeSection!=='integrations'} className="panel inventory-list-panel">
      <div className="panel-heading"><div><span className="eyebrow">CONEXIÓN POS · INVENTARIO</span><h3>Productos de venta vinculados a stock</h3><p>Los productos sin vínculo explícito se registran como conceptos sin control de stock. No se deduce la variante por coincidencia de nombres.</p></div></div>
      {canManageLinks&&<form className="inventory-form-grid" onSubmit={saveCatalogLink}>
        <label>Producto del catálogo<select required value={linkDraft.catalogProductId} onChange={e=>setLinkDraft({...linkDraft,catalogProductId:e.target.value})}><option value="">Seleccionar producto</option>{(data.catalog||[]).map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Sucursal<select value={linkDraft.branch} onChange={e=>setLinkDraft({...linkDraft,branch:e.target.value,location:'MAIN',variantId:''})}>{branches.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Variante de inventario<select required value={linkDraft.variantId} onChange={e=>setLinkDraft({...linkDraft,variantId:e.target.value})}><option value="">Seleccionar artículo físico</option>{items.filter(item=>item.variantId&&item.branchId&&item.branch===linkDraft.branch&&!item.archived).map(item=><option key={`${item.variantId}:${item.branchId}`} value={item.variantId}>{item.name}{item.variant?` · ${item.variant}`:''} · {item.sku} · {item.sourceStatus||`${item.quantity} ${item.unit}`}</option>)}</select></label>
        <label>Ubicación de salida<select required value={linkDraft.location} onChange={e=>setLinkDraft({...linkDraft,location:e.target.value})}>{locationsForBranch(linkDraft.branch).map(location=><option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></label>
        <button className="button button-dark" type="submit">Guardar vínculo</button>
      </form>}
      <div className="inventory-events">{catalogLinks.filter(link=>link.active).map(link=>{const product=(data.catalog||[]).find(row=>row.id===link.catalog_product_id);const stock=items.find(row=>row.variantId===link.inventory_variant_id&&row.branchId===link.branch_id);return <article className="inventory-event-row" key={link.id}><span className="inventory-event-icon"><Boxes size={15}/></span><div><b>{product?.name||link.catalog_product_id}</b><small>{stock?`${stock.name}${stock.variant?` · ${stock.variant}`:''} · ${stock.branch} · ${link.location_code}`:`Variante ${link.inventory_variant_id} · Ubicación ${link.location_code}`}</small></div>{canManageLinks&&<button className="button button-outline" type="button" onClick={()=>archiveCatalogLink(link)}>Desactivar</button>}</article>})}{!catalogLinks.some(link=>link.active)&&<div className="inventory-empty">Aún no hay vínculos. Las ventas no reducirán saldo hasta que se asigne cada producto aquí.</div>}</div>
    </section>
    {canManageInventory&&<section hidden={activeSection!=='integrations'} className="panel inventory-list-panel"><InventoryMaterialCatalogSetup canEdit={canManageInventory} onDone={refreshRemote} onMessage={flash}/><InventoryLonaCutPanel items={items} branches={data.branches||[]} canEdit={canManageInventory} onDone={refreshRemote} onMessage={flash}/><div className="panel-heading"><div><span className="eyebrow">PREPARACIÓN DE MATERIALES</span><h3>Ojales, anchos de rollo e imágenes</h3><p>Configura variantes verificadas sin crear saldos. Cada artículo queda pendiente hasta registrar su conteo físico.</p></div></div><div className="inventory-form-grid"><form onSubmit={configureRollWidths}><label>Rollo específico<select required value={rollWidthDraft.itemId} onChange={event=>setRollWidthDraft({...rollWidthDraft,itemId:event.target.value})}><option value="">Seleccionar SKU de lona o vinil</option>{[...new Map<string,any>(items.filter(item=>!item.archived&&/^(vinil|lona)\b/i.test(item.name||'')&&/^(metro|metros|m|m lineal|metro lineal)$/i.test(item.unit||'')).map(item=>[item.remoteItemId,item])).values()].map(item=><option key={item.remoteItemId} value={item.remoteItemId}>{item.name} · {item.sku}</option>)}</select></label><fieldset className="inventory-width-options"><legend>Anchos confirmados disponibles</legend>{[107,127,310].map(width=><label key={width}><input type="checkbox" checked={rollWidthDraft.widths.includes(width)} onChange={event=>setRollWidthDraft(current=>({...current,widths:event.target.checked?[...current.widths,width]:current.widths.filter(value=>value!==width)}))}/>{width} cm</label>)}</fieldset><button className="button button-dark" type="submit" disabled={inventorySetupBusy||!rollWidthDraft.widths.length}><Ruler size={15}/> Configurar variante(s)</button></form><div className="inventory-setup-actions"><b>Accesorios y ficha visual</b><p>Ojales pequeños y grandes se conectan al catálogo como unidades. El conteo queda pendiente y la imagen es solo una referencia.</p><button className="button button-outline" type="button" onClick={prepareGrommetTracking} disabled={inventorySetupBusy}><Boxes size={15}/> Preparar ojales para el POS</button><button className="button button-outline" type="button" onClick={syncInventoryReferenceImages} disabled={inventorySetupBusy}><ImageIcon size={15}/> Asignar imágenes disponibles</button></div></div></section>}
    <section hidden={activeSection!=='integrations'} className="panel inventory-list-panel">
      <div className="panel-heading"><div><span className="eyebrow">CONSUMO DE PRODUCCIÓN · RECETAS</span><h3>Materiales que descuenta cada venta</h3><p>Configura solo consumos confirmados. Los ojales vendidos como producto se descuentan por su vínculo directo; para rollos, el sistema convierte m² facturados a metros lineales según el ancho de la variante.</p></div></div>
      {recipeSchemaStatus==='pending'&&<div className="inventory-empty">La conexión automática está preparada, pero falta aplicar la migración de inventario en Supabase. No se intentará guardar recetas hasta que el esquema esté listo.</div>}
      {recipeSchemaStatus==='error'&&<div className="inventory-alert"><CircleAlert size={17}/><div><b>No se pudo comprobar el esquema de recetas</b><small>Actualiza la pantalla o revisa los permisos de inventario.</small></div></div>}
      {recipeSchemaStatus==='checking'&&<div className="inventory-empty">Comprobando la conexión de recetas…</div>}
      {canManageLinks&&recipeSchemaStatus==='ready'&&<form className="inventory-form-grid" onSubmit={saveMaterialRecipe}>
        <label>Producto del catálogo<select required value={recipeDraft.catalogProductId} onChange={e=>setRecipeDraft({...recipeDraft,catalogProductId:e.target.value})}><option value="">Seleccionar producto fabricado</option>{(data.catalog||[]).map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Sucursal<select value={recipeDraft.branch} onChange={e=>setRecipeDraft({...recipeDraft,branch:e.target.value,location:'MAIN',variantId:''})}>{branches.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Material / variante<select required value={recipeDraft.variantId} onChange={e=>setRecipeDraft({...recipeDraft,variantId:e.target.value})}><option value="">Seleccionar material contado</option>{items.filter(item=>item.variantId&&item.branchId&&item.branch===recipeDraft.branch&&!item.archived).map(item=><option key={`${item.variantId}:${item.branchId}`} value={item.variantId}>{item.name}{item.variant?` · ${item.variant}`:''} · {item.unit} · {item.sku}</option>)}</select></label>
        <label>Forma de cálculo<select value={recipeDraft.mode} onChange={e=>setRecipeDraft({...recipeDraft,mode:e.target.value})}><option value="per_billed_unit">Por unidad facturada</option><option value="area_to_linear">Área a metros lineales del rollo</option></select></label>
        <label>Momento de movimiento<select value={recipeDraft.stage} onChange={e=>setRecipeDraft({...recipeDraft,stage:e.target.value})}><option value="sale">Descontar al confirmar la venta</option><option value="production">Reservar ahora y consumir al iniciar producción</option></select><small>Para recetas de producción, asocia la venta a una orden de producción.</small></label>
        <label>{recipeDraft.mode==='area_to_linear'?'Factor de material':'Material por unidad facturada'}<input required type="number" min="0.000001" step="0.000001" value={recipeDraft.rate} onChange={e=>setRecipeDraft({...recipeDraft,rate:e.target.value})}/><small>{recipeDraft.mode==='area_to_linear'?'Normalmente 1. El ancho (107, 127 o 310 cm) determina los metros lineales por m².':'Ejemplo: unidades de ojales consumidas por cada unidad vendida.'}</small></label>
        <label>Desperdicio (%)<input type="number" min="0"  step="0.1" value={recipeDraft.waste} onChange={e=>setRecipeDraft({...recipeDraft,waste:e.target.value})}/><small>Usa 0 hasta confirmar un porcentaje real.</small></label>
        <label>Ubicación<select required value={recipeDraft.location} onChange={e=>setRecipeDraft({...recipeDraft,location:e.target.value})}>{locationsForBranch(recipeDraft.branch).map(location=><option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></label>
        <button className="button button-dark" type="submit">Guardar receta de materiales</button>
      </form>}
      <div className="inventory-events">{materialRecipes.filter(recipe=>recipe.active).map(recipe=>{const product=(data.catalog||[]).find(row=>row.id===recipe.catalog_product_id);const stock=items.find(row=>row.variantId===recipe.inventory_variant_id&&row.branchId===recipe.branch_id);const mode=recipe.calculation_mode==='area_to_linear'?'m² ÷ ancho del rollo → metros':'unidad facturada × factor';const stage=recipe.fulfillment_stage==='production'?'Reserva hasta iniciar producción':'Descuento al confirmar venta';return <article className="inventory-event-row" key={recipe.id}><span className="inventory-event-icon"><Boxes size={15}/></span><div><b>{product?.name||recipe.catalog_product_id} → {stock?.name||recipe.inventory_variant_id}{stock?.variant?` · ${stock.variant}`:''}</b><small>{mode} · {stage} · factor {recipe.quantity_per_basis} · desperdicio {recipe.waste_percent}% · {stock?.branch||''} · {recipe.location_code}{stock?.sourceStatus?' · CONTEO FÍSICO PENDIENTE':''}</small></div>{canManageLinks&&<button className="button button-outline" type="button" onClick={()=>archiveMaterialRecipe(recipe)}>Desactivar</button>}</article>})}{!materialRecipes.some(recipe=>recipe.active)&&<div className="inventory-empty">No hay recetas configuradas. No se descontarán materiales de producción hasta configurar la receta y confirmar sus existencias.</div>}</div>
    </section>
    {pendingImportCount>0&&<section hidden={activeSection!=='imports'} id="inventory-imports" className="panel inventory-import-review"><div className="panel-heading"><div><span className="eyebrow">IMPORTACIÓN CON PROCEDENCIA</span><h3>Conciliar inventario fuente</h3><p>Revisa los artículos importados, enlázalos con una variante real o exclúyelos con motivo. Esta revisión nunca convierte una cantidad fuente en saldo.</p></div><span className="muted-count">{pendingImportCount} pendientes</span></div><div className="inventory-import-toolbar"><label>Hoja de origen<select value={importSheet} onChange={event=>{setImportSheet(event.target.value);setImportPage(0);}}><option>Todas</option>{importSheets.map(sheet=><option key={sheet}>{sheet}</option>)}</select></label><label className="search-box"><Search size={16}/><input value={importSearch} onChange={event=>setImportSearch(event.target.value)} placeholder="Buscar en esta página por nombre o código"/></label><span>Página {Math.min(importPage+1,importPages)} de {importPages}</span></div><div className="table-wrap"><table><thead><tr><th>Archivo fuente</th><th>Hoja / fila</th><th>ID anterior</th><th>Artículo fuente</th><th>Dato de stock</th><th>Revisión</th></tr></thead><tbody>{importRowsOnPage.map(row=>{const candidate=row.candidate||{};const raw=row.raw_row||{};return <tr key={row.id}><td>{importBatches[row.batch_id]?.source_file||'Inventario importado'}</td><td>{row.source_sheet}<small>Fila {row.source_row}</small></td><td>{candidate.legacyCode||raw.Id||'—'}</td><td><b>{candidate.name||raw['Nombre del elemento']||row.source_reference||'Por identificar'}</b><small>{candidate.category||candidate.areaCandidate||raw.Tipo||''}</small></td><td>{String(candidate.quantityRaw??candidate.quantity??raw.CANTIDAD??raw.Cantidad??raw.Cantidad?.value??raw.Stock??'Sin cantidad numérica confirmada')}</td><td><button className="button button-outline" type="button" disabled={!canReviewImports} onClick={()=>setReviewEditor({id:row.id,sourceSheet:row.source_sheet,sourceRow:row.source_row,sourceReference:row.source_reference,sourceFile:importBatches[row.batch_id]?.source_file||'Inventario importado',candidate,raw,decision:'mapped',variantId:'',note:row.review_note||''})}>Revisar fila</button></td></tr>;})}{!importRowsOnPage.length&&<tr><td colSpan={6}>No hay coincidencias en esta página; cambia de hoja o avanza a otra página.</td></tr>}</tbody></table><div className="inventory-import-pagination"><button className="button button-outline" type="button" disabled={importPage===0} onClick={()=>setImportPage(page=>Math.max(0,page-1))}>Anterior</button><span>Mostrando {importRows.length} de {pendingImportCount} filas pendientes{importSheet!=='Todas'?` en ${importSheet}`:''}.</span><button className="button button-outline" type="button" disabled={importPage+1>=importPages} onClick={()=>setImportPage(page=>Math.min(importPages-1,page+1))}>Siguiente</button></div></div></section>}
    {pendingPhysicalCount>0&&<section hidden={activeSection!=='counts'} id="inventory-counts" className="panel inventory-guided-count"><div className="panel-heading"><div><span className="eyebrow">CONCILIACIÓN FÍSICA</span><h3>Confirma las existencias reales</h3><p>{pendingPhysicalCount} artículos todavía no tienen un conteo físico confirmado. El recorrido guarda cada valor con auditoría y responsable.</p></div>{!countSession&&<button type="button" className="button button-dark" onClick={startGuidedCount} disabled={!countQueue.length||branch==='Todas'||countBusy}><ClipboardCheck size={16}/> Iniciar conteo guiado ({countQueue.length})</button>}</div>{countSession&&countItem&&<form className="guided-count-card" onSubmit={saveGuidedCount}><div className="guided-count-progress"><div className="guided-count-progress-meta"><b>Avance del conteo</b><small>{countCompleted} de {countSession.ids.length} revisados · {Math.max(0,countSession.ids.length-countCompleted)} pendientes</small></div><div className="guided-count-progress-bar" role="progressbar" aria-label="Avance del conteo físico" aria-valuemin={0} aria-valuemax={countSession.ids.length} aria-valuenow={countCompleted} aria-valuetext={`${countCompleted} de ${countSession.ids.length} revisados`}><i style={{width:`${countProgress}%`}}/></div><button type="button" className="text-link" onClick={cancelGuidedCount} disabled={countBusy}>Cerrar recorrido</button></div><div className="guided-count-product">{countItem.referenceImageUrl?<img src={countItem.referenceImageUrl} alt={`Referencia de ${countItem.name}`}/>:<span className="guided-count-placeholder"><Boxes size={22}/></span>}<div><h4>{countItem.name}{countItem.variant?` · ${countItem.variant}`:''}</h4><p>{countItem.sku||countItem.variantSku||countItem.id} · {countItem.area} · {countItem.branch}</p><small>{countItem.location||'Ubicación sin registrar'} · {countItem.unit}</small><small>{countSession.expected[countSession.index]===null?'Sin saldo registrado al abrir; este es el primer conteo para la ubicación.':`Saldo registrado al abrir: ${countSession.expected[countSession.index]} ${countItem.unit}`}</small></div><span className="inventory-status pending">Sin conteo</span></div><div className="guided-count-fields"><label>Cantidad observada<input autoFocus required type="number" min="0" step="any" value={countSession.quantity} onChange={event=>setCountSession({...countSession,quantity:event.target.value})} placeholder="Incluye 0 si está agotado"/></label><label>Responsable del conteo<input required value={countSession.actor} onChange={event=>setCountSession({...countSession,actor:event.target.value})} placeholder="Nombre de quien contó"/></label><label>Nota de conteo<input value={countSession.reason} onChange={event=>setCountSession({...countSession,reason:event.target.value})} placeholder="Conteo físico inicial"/></label><button type="submit" className="button button-dark" disabled={countBusy}>{countBusy?'Guardando…':countSession.index+1===countSession.ids.length?'Guardar y terminar':'Guardar y siguiente'}</button><button type="button" className="button button-outline" onClick={advanceGuidedCount} disabled={countBusy}>Omitir por ahora</button></div></form>}</section>}
    {low.length>0&&<div hidden={activeSection!=='stock'} className="inventory-alert"><CircleAlert size={17}/><div><b>{low.length} artículos requieren atención</b><small>{low.slice(0,4).map(i=>`${i.name}${i.variant?` · ${i.variant}`:''}`).join(' · ')}{low.length>4?' · y más':''}</small></div></div>}
    {activeSection==='catalog'&&<Dialog open={showForm} onOpenChange={(open)=>open?setShowForm(true):closeNewItemForm()} title="Nuevo artículo" description="Se asigna el siguiente ID del área. El saldo queda pendiente hasta registrar el conteo físico." footer={<><button type="button" className="button button-outline" onClick={closeNewItemForm}>Cancelar</button><button className="button button-dark" type="submit" form="inventory-create-form" disabled={savingItem}>{savingItem?'Guardando…':'Guardar artículo'}</button></>}><form id="inventory-create-form" className="inventory-form inventory-create-form" onSubmit={saveItem}><div className="inventory-form-grid"><label>Artículo<input required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Ej. Taza metalizada"/></label><label>Variante<input value={draft.variant} onChange={e=>setDraft({...draft,variant:e.target.value})} placeholder="Color, medida, calibre…"/></label><label>Categoría<input list="inventory-category-options" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})} placeholder="Elige una sugerida o escribe otra…"/><datalist id="inventory-category-options">{categories.map(value=><option key={value} value={value}/>)}</datalist></label><InventoryOptionPicker label="Tipo" mode="single" value={draft.itemType} options={itemTypes} placeholder="Selecciona un tipo" helpText="Elige una sugerencia o escribe una opción nueva." onChange={next=>setDraft({...draft,itemType:String(next)})}/><InventoryOptionPicker label="Etiquetas" mode="multiple" value={draft.tags.split(',').map(tag=>tag.trim()).filter(Boolean)} options={allTags} placeholder="Busca y selecciona etiquetas" helpText="Puedes agregar hasta 40 etiquetas." onChange={next=>setDraft({...draft,tags:(Array.isArray(next)?next:[next]).join(', ')})}/><label>Área<select value={draft.area} onChange={e=>setDraft({...draft,area:e.target.value})}>{areas.map(x=><option key={x}>{x}</option>)}</select></label><label>Sucursal<select value={draft.branch} onChange={e=>setDraft({...draft,branch:e.target.value,location:'MAIN'})}>{branches.map(x=><option key={x}>{x}</option>)}</select></label><label>Ubicación<select required value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})}>{locationsForBranch(draft.branch).map(location=><option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></label><label>Unidad base<input required value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})} placeholder="unidad, metro, litro…"/></label><label>Conteo físico confirmado<input type="number" min="0" step="any" value={draft.quantity} onChange={e=>setDraft({...draft,quantity:e.target.value})} placeholder="Dejar vacío si no se contó"/><small>Un cero explícito es un conteo de cero; vacío significa pendiente.</small></label><label>Mínimo de reposición<input type="number" min="0" step="any" value={draft.minimum} onChange={e=>setDraft({...draft,minimum: e.target.value})}/></label><label>ID / código<input value={draft.sku} onChange={e=>setDraft({...draft,sku:e.target.value})} placeholder="Automático según área"/></label><label className="inventory-notes">Notas<textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} rows={2}/></label></div><InventoryProductImageGallery images={newProductImages} disabled={savingItem} title="Fotos del producto" onChange={setNewProductImages}/><label>Imagen de la biblioteca (opcional)<select value={draft.referenceImageUrl} onChange={e=>{const path=e.target.value;setDraft({...draft,referenceImageUrl:path});if(path&&!newProductImages.some(image=>image.path===path||image.src===path))setNewProductImages([{key:`library-${uid()}`,src:path,path,label:inventoryReferenceOptions.find(image=>image.path===path)?.label||'Imagen de biblioteca'},...newProductImages]);}}><option value="">Sin imagen de biblioteca</option>{inventoryReferenceOptions.map((image,index)=><option key={`${image.path}-${index}`} value={image.path}>{image.label}</option>)}</select></label><InventorySpecificationFields idPrefix="new-inventory" value={specificationDraft} onChange={setSpecificationDraft}/></form></Dialog>}
    <section id="inventory-items" hidden={activeSection!=='stock'} className="panel inventory-list-panel"><div className="inventory-toolbar"><label className="search-box"><Search size={16}/><input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Buscar producto, variante o código"/></label><select aria-label="Filtrar por sucursal" value={branch} onChange={e=>setBranch(e.target.value)}><option value="Todas">Todas las sucursales</option>{branches.map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filtrar por categoría" value={category} onChange={e=>setCategory(e.target.value)}><option value="Todas">Todas las categorías</option>{categories.map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filtrar por área" value={area} onChange={e=>setArea(e.target.value)}><option value="Todas">Todas las áreas</option>{areas.map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filtrar por tipo" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="Todos">Todos los tipos</option>{itemTypes.map(value=><option key={value}>{value}</option>)}</select><select aria-label="Filtrar por etiqueta" value={tagFilter} onChange={e=>setTagFilter(e.target.value)}><option value="Todos">Todas las etiquetas</option>{allTags.map(value=><option key={value}>{value}</option>)}</select><select aria-label="Filtrar por estado" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="Todos">Todos los estados</option><option value="Sin conteo">Sin conteo físico</option><option value="Agotado">Agotado</option><option value="Reponer">Bajo mínimo</option><option value="En stock">Disponible</option></select><span>{groupedInventory.length} artículos agrupados</span></div><div className="inventory-table-wrap"><table><thead><tr><th>Artículo / ID</th><th>Sucursal · área</th><th>Ubicación</th><th>Existencia</th><th>Mínimo</th>{canSeeCosts&&<th>Costo unitario</th>}<th>Estado</th><th>Acciones</th></tr></thead><tbody>{groupedInventory.map(group=>group.rows.length>1?renderInventoryGroup(group):renderInventoryRow(group.rows[0]))}</tbody></table>{!visible.length&&<div className="inventory-empty">{inventoryBrandScope==='giga'?'El inventario de Giga aún está vacío. Cuando ingreses sus artículos, aparecerán aquí separados de Visual.':'No hay artículos con estos filtros. Agrega uno o importa una fuente revisada.'}</div>}</div></section>
    <section id="inventory-movements" hidden={activeSection!=='movements'} className="panel inventory-events"><div className="panel-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h3>Últimos movimientos</h3></div><span className="muted-count">{scopedEvents.length}</span></div>{scopedEvents.length?scopedEvents.slice(0,movementVisibleCount).map(ev=><article className="inventory-event-row" key={ev.id}><span className="inventory-event-icon"><ArrowLeftRight size={15}/></span><div><b>{ev.itemName}</b><small>{ev.type.replaceAll('_',' ')} · {ev.actor} · {formatDate(ev.createdAt)}{ev.reason?` · ${ev.reason}`:''}{ev.from&&ev.to?` · ${ev.from} → ${ev.to}`:''}{ev.shortage?` · faltante ${ev.shortage}`:''}</small></div><strong>{ev.type.includes('entrada')||ev.type.includes('recepcion')?'+':ev.type==='ajuste'?'↕':'−'}{ev.quantity} {items.find(i=>i.variantId===ev.itemId)?.unit||''}</strong></article>):<div className="inventory-empty">El historial empezará cuando se registre el primer movimiento.</div>}{events.length>=500&&!movementHistoryExhausted&&<div className="inventory-movement-more"><button type="button" className="button button-outline" onClick={loadMoreMovements} disabled={movementPageBusy}>{movementPageBusy?'Cargando…':'Cargar 100 movimientos anteriores'}</button></div>}</section>
    {activeSection==='counts'&&pendingPhysicalCount===0&&<div className="panel inventory-empty">No hay artículos pendientes de conteo físico.</div>}
    {activeSection==='imports'&&pendingImportCount===0&&<div className="panel inventory-empty">No hay filas de importación pendientes de revisar.</div>}
    {reviewEditor&&<div className="inventory-modal-backdrop" role="presentation"><form className="inventory-modal inventory-review-modal" onSubmit={reviewImportRow}><header><div><span className="eyebrow">REVISIÓN DE PROCEDENCIA</span><h3>{reviewEditor.candidate?.name||reviewEditor.raw?.['Nombre del elemento']||'Artículo por identificar'}</h3><p>{reviewEditor.sourceFile} · {reviewEditor.sourceSheet}, fila {reviewEditor.sourceRow} · ID fuente {reviewEditor.candidate?.legacyCode||reviewEditor.raw?.Id||'sin ID'}</p></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={()=>setReviewEditor(null)}><Plus size={18}/></button></header><details><summary>Ver registro fuente original</summary><pre>{JSON.stringify(reviewEditor.raw,null,2)}</pre></details><label>Decisión<select value={reviewEditor.decision} onChange={event=>setReviewEditor({...reviewEditor,decision:event.target.value,variantId:event.target.value==='mapped'?reviewEditor.variantId:''})}><option value="mapped">Vincular a una variante existente</option><option value="ignored">Excluir de inventario activo</option></select></label>{reviewEditor.decision==='mapped'&&<label>Variante real<select required value={reviewEditor.variantId} onChange={event=>setReviewEditor({...reviewEditor,variantId:event.target.value})}><option value="">Seleccionar artículo y variante</option>{reviewVariantOptions.map(item=><option key={item.variantId} value={item.variantId}>{item.name}{item.variant?` · ${item.variant}`:''} · {item.sku||item.variantSku} · {item.area}</option>)}</select><small>Vincular la fuente no agrega unidades ni confirma existencias.</small></label>}<label>Nota de revisión<textarea maxLength={1000} required={reviewEditor.decision==='ignored'} value={reviewEditor.note} onChange={event=>setReviewEditor({...reviewEditor,note:event.target.value})} placeholder={reviewEditor.decision==='ignored'?'Motivo obligatorio para excluir esta fila':'Nota opcional sobre el match o los datos pendientes'} rows={3}/></label><div className="inventory-review-notice"><CircleAlert size={17}/><span>El saldo de inventario cambia solo después de registrar un conteo físico confirmado o un movimiento de recepción.</span></div><footer><button type="button" className="button button-outline" onClick={()=>setReviewEditor(null)}>Cancelar</button><button className="button button-dark" type="submit" disabled={reviewBusy||!canReviewImports}>{reviewBusy?'Guardando…':'Guardar revisión auditada'}</button></footer></form></div>}
    {costEdit&&<div className="inventory-modal-backdrop"><form className="inventory-modal" onSubmit={saveCost}><h3>Costo privado · {costEdit.name}</h3><p>Solo propietario, administración POS y gerencia pueden consultar este dato.</p><label>Costo unitario (USD)<input autoFocus type="number" min="0" step="0.0001" required value={costEdit.unitCost} onChange={e=>setCostEdit({...costEdit,unitCost:e.target.value})}/></label><label>Proveedor<input value={costEdit.supplierName} onChange={e=>setCostEdit({...costEdit,supplierName:e.target.value})} placeholder="Opcional"/></label><footer><button type="button" className="button button-outline" onClick={()=>setCostEdit(null)}>Cancelar</button><button className="button button-dark" type="submit">Guardar costo</button></footer></form></div>}    {movement&&movement.type!=='transferencia'&&<div className="inventory-modal-backdrop"><form className="inventory-modal" onSubmit={applyMovement}><h3>{movement.type==='transferencia'?'Traspaso entre sucursales':movement.type==='entrada'?'Registrar entrada':movement.type==='ajuste'?'Confirmar conteo físico':'Registrar salida o consumo'}</h3><p>{items.find(i=>i.id===movement.itemId)?.name} · actual: {items.find(i=>i.id===movement.itemId)?.quantity} {items.find(i=>i.id===movement.itemId)?.unit}</p><label>Movimiento<select value={movement.type} onChange={e=>setMovement({...movement,type:e.target.value})}><option value="entrada">Entrada / compra recibida</option><option value="consumo">Consumo interno</option><option value="merma">Merma / desperdicio</option><option value="ajuste">Ajuste de conteo</option></select></label><label>{movement.type==='ajuste'?'Cantidad física contada':movement.type==='entrada'&&Number(items.find(i=>i.id===movement.itemId)?.variantAttributes?.width_cm)>0?'Metros lineales reales recibidos':'Cantidad'}<input autoFocus type="number" min="0" step="any" required value={movement.quantity} onChange={e=>setMovement({...movement,quantity:e.target.value})} placeholder={movement.type==='entrada'&&Number(items.find(i=>i.id===movement.itemId)?.variantAttributes?.width_cm)>0?'Medir largo de este rollo':undefined}/>{movement.type==='entrada'&&Number(items.find(i=>i.id===movement.itemId)?.variantAttributes?.width_cm)>0&&<small>El largo habitual de 25 m es referencial. Registra aquí el largo real recibido y usa referencia para proveedor, etiqueta o lote.</small>}</label><label>Responsable<input required value={movement.actor} onChange={e=>setMovement({...movement,actor:e.target.value})} placeholder="Nombre de quien entrega o utiliza"/></label><label>Motivo<input required value={movement.reason} onChange={e=>setMovement({...movement,reason:e.target.value})} placeholder={movement.type==='ajuste'?'Conteo físico, responsable o área':'OT, cliente, reposición…'}/></label><label>Referencia / documento<input value={movement.reference} onChange={e=>setMovement({...movement,reference:e.target.value})} placeholder="Número de OT o solicitud…"/></label><footer><button type="button" className="button button-outline" onClick={()=>setMovement(null)}>Cancelar</button><button className="button button-dark" type="submit">Registrar movimiento</button></footer></form></div>}
    {movement?.type==='transferencia'&&<Dialog open onOpenChange={open=>{if(!open)setMovement(null);}} title="Solicitar traslado" description="La solicitud no cambia las existencias. El saldo se actualiza al despachar en origen y confirmar la recepción en destino.">
      <form className="inventory-transfer-form" onSubmit={applyMovement}>
        {transferItem&&<div className="inventory-transfer-brief"><b>{transferItem.name}</b><span>Existencia registrada: {transferItem.quantity} {transferItem.unit} · Disponible ahora: {transferAvailable} {transferItem.unit}</span></div>}
        <div className="inventory-transfer-route">
          <label>Sucursal origen<input readOnly value={transferItem?.branch||''}/></label>
          <label>Ubicación de origen<select required disabled={!transferFromLocations.length} value={movement.fromLocation||''} onChange={event=>setMovement({...movement,fromLocation:event.target.value})}><option value="">{transferFromLocations.length?'Selecciona ubicación':'No hay ubicaciones activas'}</option>{transferFromLocations.map(location=><option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></label>
          <label>Sucursal destino<select required value={movement.toBranch||''} onChange={event=>{const name=event.target.value;const nextLocations=locationsForBranch(name);setMovement({...movement,toBranch:name,toLocation:nextLocations.find(location=>location.code==='MAIN')?.code||nextLocations[0]?.code||''});}}><option value="">{branches.some(name=>name!==transferItem?.branch)?'Selecciona sucursal':'No hay otra sucursal disponible'}</option>{branches.filter(name=>name!==transferItem?.branch).map(name=><option key={name} value={name}>{name}</option>)}</select></label>
          <label>Ubicación destino<select required disabled={!transferToLocations.length} value={movement.toLocation||''} onChange={event=>setMovement({...movement,toLocation:event.target.value})}><option value="">{transferToLocations.length?'Selecciona ubicación':'Selecciona primero una sucursal'}</option>{transferToLocations.map(location=><option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></label>
        </div>
        <label>Cantidad solicitada<input autoFocus type="number" min="0.001" max={transferAvailable} step="0.001" required value={movement.quantity} onChange={event=>setMovement({...movement,quantity:event.target.value})}/><small>Máximo disponible: {transferAvailable} {transferItem?.unit||''}. Se volverá a validar al despachar.</small></label>
        <label>Responsable solicitante<input required value={movement.actor} onChange={event=>setMovement({...movement,actor:event.target.value})} placeholder="Nombre de quien solicita"/></label>
        <label>Motivo del traslado<input required value={movement.reason} onChange={event=>setMovement({...movement,reason:event.target.value})} placeholder="Reposición, producción u orden de trabajo"/></label>
        <label>Referencia o documento<input value={movement.reference} onChange={event=>setMovement({...movement,reference:event.target.value})} placeholder="Número de orden o documento (opcional)"/></label>
        <footer><button type="button" className="button button-outline" onClick={()=>setMovement(null)}>Cancelar</button><button className="button button-dark" type="submit" disabled={!transferReady||transferBusy}>{transferBusy?'Enviando…':'Enviar solicitud'}</button></footer>
      </form>
    </Dialog>}
    <div className="notice-box"><span><CircleAlert size={17}/></span><div><b>Stock registrado entre sucursales</b><p>Los artículos nuevos quedan con ID único y conteo físico auditado. Los costos solo aparecen para propietario, administración POS y gerencia. Las filas importadas pendientes aún deben revisarse antes de tomarlas como existencia real.</p></div></div>
  </div>;
}
