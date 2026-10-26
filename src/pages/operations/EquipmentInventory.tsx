import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, Camera, CircleAlert, Computer, Pencil, Plus, Printer, Search, Wrench, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../components/ui/OperationalKit';
import './equipment-inventory.css';

type Area = { id: string; name: string; code: string };
type Asset = { id: string; asset_code: string; name: string; equipment_type: string; manufacturer: string; model: string; serial_number: string; status: string; condition: string; location: string; notes: string; reference_image_url: string | null; area_id: string | null; branch_id: string | null; custom_fields: Record<string, unknown> };
const kinds = ['Impresora gran formato', 'Impresora láser / multifunción', 'Impresora de tinta', 'Impresora de sublimación', 'Computadora', 'Prensa de sublimación', 'Equipo para tazas', 'Equipo para gorras', 'Equipo para pines', 'Equipo para llaveros', 'Equipo láser', 'Mobiliario', 'Herramienta de taller', 'Otro'];
const statuses = ['Por verificar', 'Operativo', 'En mantenimiento', 'Fuera de servicio', 'Retirado'];
const fresh = { name: '', equipment_type: kinds[0], manufacturer: '', model: '', serial_number: '', status: 'Por verificar', condition: 'Sin revisar', area_id: '', area_name: '', branch_id: '', location: '', notes: '', reference_image_url: '' };

export function EquipmentInventory() {
  const { organizationId, user, hasPermission } = useAuth();
  const canManage = hasPermission('inventory', 'edit');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [branches, setBranches] = useState<{id:string;name:string}[]>([]);
  const [draft, setDraft] = useState(fresh);
  const [editing, setEditing] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inkBusy, setInkBusy] = useState(false);
  const [inkMessage, setInkMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase || !organizationId) return;
    const [assetResult, areaResult, branchResult] = await Promise.all([
      supabase.from('equipment_assets').select('*').eq('organization_id', organizationId).neq('status', 'Retirado').order('name'),
      supabase.from('equipment_areas').select('id,name,code').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.from('branches').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
    ]);
    if (assetResult.error) { setError(assetResult.error.message); return; }
    setAssets((assetResult.data || []) as Asset[]);
    setAreas((areaResult.data || []) as Area[]);
    setBranches((branchResult.data || []) as {id:string;name:string}[]);
    if (areaResult.error) setError(`No se pudieron cargar las áreas: ${areaResult.error.message}`);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => assets.filter(asset => {
    const query = term.toLocaleLowerCase();
    const matches = [asset.asset_code, asset.name, asset.manufacturer, asset.model, asset.serial_number, asset.equipment_type].join(' ').toLocaleLowerCase().includes(query);
    return matches && (!areaFilter || asset.area_id === areaFilter);
  }), [assets, term, areaFilter]);
  const areaName = (id: string | null) => areas.find(area => area.id === id)?.name || 'Área pendiente';

  const openNew = () => { setEditing(null); setDraft(fresh); setShowForm(true); setError(''); };
  const openEdit = (asset: Asset) => {
    setEditing(asset.id);
    setDraft({ name: asset.name, equipment_type: asset.equipment_type, manufacturer: asset.manufacturer, model: asset.model, serial_number: asset.serial_number, status: asset.status, condition: asset.condition, area_id: asset.area_id || '', area_name: areaName(asset.area_id), branch_id: asset.branch_id || '', location: asset.location || '', notes: asset.notes || '', reference_image_url: asset.reference_image_url || '' });
    setShowForm(true); setError('');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user || !canManage || !draft.name.trim()) return;
    setBusy(true); setError('');
    try {
      let areaId = draft.area_id || null;
      if (draft.area_name.trim()) {
          const name = draft.area_name.trim();
          const code = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
          const { data: savedArea, error: areaError } = await supabase.from('equipment_areas').upsert({ organization_id: organizationId, code, name, active: true }, { onConflict: 'organization_id,code' }).select('id').single();
          if (areaError) throw areaError;
          areaId = savedArea.id;
      }
      const { area_name: _areaName, ...fields } = draft;
      const payload = { ...fields, area_id: areaId, branch_id: draft.branch_id || null, name: draft.name.trim(), manufacturer: draft.manufacturer.trim(), model: draft.model.trim(), serial_number: draft.serial_number.trim(), location: draft.location.trim(), notes: draft.notes.trim(), reference_image_url: draft.reference_image_url.trim() || null, updated_at: new Date().toISOString() };
      if (editing) {
        const { error: updateError } = await supabase.from('equipment_assets').update(payload).eq('id', editing).eq('organization_id', organizationId);
        if (updateError) throw updateError;
      } else {
        const assetCode = `EQ-${Date.now().toString(36).toUpperCase()}`;
        const { error: insertError } = await supabase.from('equipment_assets').insert({ ...payload, organization_id: organizationId, asset_code: assetCode, created_by: user.id });
        if (insertError) throw insertError;
      }
      setShowForm(false); setDraft(fresh); setEditing(null); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el equipo.'); }
    finally { setBusy(false); }
  };

  const stats = useMemo(() => ({ total: assets.length, pending: assets.filter(row => row.status === 'Por verificar').length, maintenance: assets.filter(row => row.status === 'En mantenimiento' || row.status === 'Fuera de servicio').length }), [assets]);
  const prepareInkCatalog = async () => {
    if (!supabase || !canManage || inkBusy) return;
    setInkBusy(true); setInkMessage('');
    const { data, error: seedError } = await supabase.rpc('seed_visualcorp_ink_inventory');
    if (seedError) { setInkBusy(false); setInkMessage(`No se pudo guardar el catálogo: ${seedError.message}`); return; }
    const { data: extras, error: extrasError } = await supabase.rpc('seed_visualcorp_ink_catalog_extensions');
    setInkBusy(false);
    if (extrasError) { setInkMessage(`Se guardó la primera parte del catálogo; falta T664 y tóner Ricoh: ${extrasError.message}`); return; }
    setInkMessage(`Catálogo preparado: ${(data?.items ?? 4) + (extras?.items ?? 2)} familias y ${(data?.variants ?? 13) + (extras?.variants ?? 8)} colores/tipos. No se creó saldo disponible; conteos y ubicación quedan pendientes.`);
  };

  return <main className="equipment-workspace">
    <nav className="equipment-subnav" aria-label="Secciones del inventario"><a href="/operaciones/inventario">Materiales y existencias</a><a className="active" href="/operaciones/equipos">Equipos y activos</a></nav>
    <header className="equipment-intro"><div><span className="eyebrow">ACTIVOS DURADEROS · POR ÁREA</span><h2>Equipos de Visual Corp</h2><p>Registra máquinas, computadoras, mobiliario y herramientas por área, sucursal y estado. Las fichas nuevas quedan pendientes de verificación hasta completar placa, ubicación y condición.</p></div>{canManage&&<button className="button button-dark" onClick={openNew}><Plus size={16}/> Añadir equipo</button>}</header>
    {error&&<div className="equipment-error" role="alert"><CircleAlert size={16}/>{error}</div>}
    <section className="equipment-ink-callout"><div><span className="eyebrow">CONSUMIBLES · TINTAS Y TÓNER</span><h3>Separar por tecnología, familia y color</h3><p>Prepara fichas para Galaxy TEE y DX-Eco, FUSION sublimación, Epson T544/T664 y tóner Ricoh MP C3503. El conteo escrito en la foto queda como referencia y no se convierte en saldo hasta confirmar sucursal y ubicación.</p>{inkMessage&&<small role="status">{inkMessage}</small>}</div><div className="equipment-ink-actions">{canManage&&<button className="button button-outline" onClick={prepareInkCatalog} disabled={inkBusy}>{inkBusy?'Preparando…':'Preparar catálogo de consumibles'}</button>}<a className="button button-dark" href="/operaciones/inventario">Abrir materiales y conteo</a></div></section>
    <section className="equipment-stats" aria-label="Resumen de equipos"><article><BriefcaseBusiness/><span>Activos registrados</span><b>{stats.total}</b></article><article><CircleAlert/><span>Por verificar</span><b>{stats.pending}</b></article><article><Wrench/><span>Requieren atención</span><b>{stats.maintenance}</b></article></section>
    <section className="equipment-list panel"><div className="equipment-toolbar"><label className="equipment-search"><Search size={16}/><input value={term} onChange={event=>setTerm(event.target.value)} placeholder="Buscar nombre, marca, modelo o serie" aria-label="Buscar equipos"/></label><select value={areaFilter} onChange={event=>setAreaFilter(event.target.value)} aria-label="Filtrar por área"><option value="">Todas las áreas</option>{areas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></div>
      {filtered.length===0?<div className="equipment-empty"><Computer size={28}/><h3>{assets.length?'Sin coincidencias':'Empieza el inventario de equipos'}</h3><p>{assets.length?'Prueba otro término o área.':'Añade las impresoras y máquinas identificadas, luego continúa con computadoras, mobiliario y herramientas.'}</p>{canManage&&<button className="button button-outline" onClick={openNew}><Plus size={15}/> Registrar primer equipo</button>}</div>:<div className="equipment-grid">{filtered.map(asset=><article className="equipment-card" key={asset.id}>
        {asset.reference_image_url?<img className="equipment-photo" src={asset.reference_image_url} alt={`Referencia visual: ${asset.name}`} loading="lazy"/>:<div className="equipment-photo equipment-photo-empty"><Printer size={26}/><span>Foto pendiente</span></div>}
        <div className="equipment-card-body"><div className="equipment-card-top"><span className="equipment-code">{asset.asset_code}</span><Badge className={`equipment-state ${asset.status==='Operativo'?'ready':''}`} tone={asset.status==='Operativo'?'success':asset.status==='Fuera de servicio'?'danger':'warning'}>{asset.status}</Badge></div><h3>{asset.name}</h3><p>{[asset.manufacturer,asset.model].filter(Boolean).join(' · ')||'Marca y modelo por identificar'}</p><div className="equipment-facts"><span>{areaName(asset.area_id)}</span><span>{branches.find(branch=>branch.id===asset.branch_id)?.name||'Sucursal pendiente'}</span></div><small>Condición: {asset.condition}{asset.location?` · ${asset.location}`:''}</small>{asset.serial_number&&<small>Serie: {asset.serial_number}</small>}{asset.notes&&<p className="equipment-notes">{asset.notes}</p>}</div>
        {canManage&&<button className="equipment-edit" onClick={()=>openEdit(asset)} aria-label={`Editar ${asset.name}`}><Pencil size={15}/> Editar ficha</button>}
      </article>)}</div>}
    </section>
    <aside className="equipment-area-key"><strong>Áreas listas para organizar</strong><span>Impresión gran formato</span><span>Impresión digital</span><span>Sublimación</span><span>Cómputo</span><span>Láser</span><span>Equipos de taller</span><span>Acabados</span><small>Las áreas de equipos se administran por separado y pueden ampliarse con nombres propios.</small></aside>
    {showForm&&<div className="equipment-modal-backdrop" role="presentation"><form className="equipment-modal" onSubmit={save} aria-labelledby="equipment-form-title"><header><div><span className="eyebrow">FICHA DE ACTIVO</span><h2 id="equipment-form-title">{editing?'Editar equipo':'Registrar equipo'}</h2></div><button className="icon-button" type="button" onClick={()=>setShowForm(false)} aria-label="Cerrar"><X size={18}/></button></header><div className="equipment-fields">
      <label>Nombre del equipo<input required maxLength={160} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})} placeholder="Ej. Impresora de gran formato 01"/></label>
      <label>Tipo<select value={draft.equipment_type} onChange={event=>setDraft({...draft,equipment_type:event.target.value})}>{kinds.map(kind=><option key={kind}>{kind}</option>)}</select></label>
      <label>Área<select value={draft.area_id} onChange={event=>{const selected=areas.find(area=>area.id===event.target.value);setDraft({...draft,area_id:event.target.value,area_name:selected?.name||''})}}><option value="">Nueva área o pendiente…</option>{areas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select>{!draft.area_id&&<input aria-label="Nombre de nueva área" maxLength={100} value={draft.area_name} onChange={event=>setDraft({...draft,area_name:event.target.value})} placeholder="Escribe el área o déjala pendiente"/>}</label>
      <label>Sucursal<select value={draft.branch_id} onChange={event=>setDraft({...draft,branch_id:event.target.value})}><option value="">Pendiente de asignar</option>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label>Marca<input maxLength={100} value={draft.manufacturer} onChange={event=>setDraft({...draft,manufacturer:event.target.value})} placeholder="Pendiente si no se lee la placa"/></label><label>Modelo<input maxLength={120} value={draft.model} onChange={event=>setDraft({...draft,model:event.target.value})} placeholder="Ej. MP C3503"/></label>
      <label>Número de serie<input maxLength={160} value={draft.serial_number} onChange={event=>setDraft({...draft,serial_number:event.target.value})} placeholder="Pendiente de revisar placa"/></label><label>Estado<select value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value})}>{statuses.map(status=><option key={status}>{status}</option>)}</select></label>
      <label>Condición<input maxLength={100} value={draft.condition} onChange={event=>setDraft({...draft,condition:event.target.value})} placeholder="Sin revisar"/></label><label>Ubicación<input maxLength={160} value={draft.location} onChange={event=>setDraft({...draft,location:event.target.value})} placeholder="Área, puesto o referencia interna"/></label>
      <label className="equipment-wide">Imagen de referencia<input value={draft.reference_image_url} onChange={event=>setDraft({...draft,reference_image_url:event.target.value})} placeholder="URL de imagen o ruta /inventory/..."/><small><Camera size={13}/> Usa fotos reales del equipo cuando estén guardadas en la biblioteca. Las imágenes de fabricante sirven solo como referencia, no prueban que sean el mismo equipo.</small></label>
      <label className="equipment-wide">Notas y especificaciones<textarea rows={3} maxLength={2000} value={draft.notes} onChange={event=>setDraft({...draft,notes:event.target.value})} placeholder="Capacidades, consumibles compatibles verificados, accesorios, mantenimiento…"/></label>
    </div>{error&&<div className="equipment-error" role="alert">{error}</div>}<footer><button type="button" className="button button-outline" onClick={()=>setShowForm(false)}>Cancelar</button><button className="button button-dark" disabled={busy}>{busy?'Guardando…':'Guardar ficha'}</button></footer></form></div>}
  </main>;
}
