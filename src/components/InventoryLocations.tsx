import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ArrowUpFromLine, Boxes, Flame, Layers3, LockKeyhole, MapPin, Plus, RotateCcw, Search, Truck } from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { useConfirm } from './ui/OperationalKit';

const locationTypes = [
  ['storage', 'Almacenamiento'],
  ['receiving', 'Recepción'],
  ['production', 'Producción'],
  ['dispatch', 'Despacho'],
  ['quarantine', 'Cuarentena / revisión'],
  ['other', 'Otra'],
];

const blankDraft = { branchId: '', parentId: '', code: '', name: '', type: 'storage' };

export function InventoryLocations({ id, hidden, canManage, catalogLinks = [] }) {
  const { data, refreshRemote, flash } = useWorkspace();
  const { organizationId, user } = useAuth();
  const confirm = useConfirm();
  const locations = data.inventoryLocations || [];
  const branches = data.branches || [];
  const [draft, setDraft] = useState<any>(blankDraft);
  const [busy, setBusy] = useState(false);
  const [branchFilter, setBranchFilter] = useState('Todas');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!draft.branchId && branches[0]?.id) setDraft((current) => ({ ...current, branchId: branches[0].id }));
  }, [branches, draft.branchId]);

  const itemCountByLocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of ((data as any).inventory || [])) {
      if (!item.archived && item.branchId && item.location) {
        const key = `${item.branchId}|${item.location}`;
        map.set(key, (map.get(key) || 0) + (Number(item.quantity) > 0 ? 1 : 0));
      }
    }
    return map;
  }, [(data as any).inventory]);

  const iconForType = (type: string) => {
    switch (type) {
      case 'storage': return <Boxes size={17} />;
      case 'production': return <Flame size={17} />;
      case 'receiving': return <Truck size={17} />;
      case 'dispatch': return <ArrowUpFromLine size={17} />;
      case 'quarantine': return <AlertTriangle size={17} />;
      default: return <Layers3 size={17} />;
    }
  };

  const visible = useMemo(() => locations
    .filter((location) => {
      if (branchFilter !== 'Todas' && location.branchId !== branchFilter) return false;
      if (typeFilter !== 'all' && location.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (location.code + ' ' + location.name + ' ' + (location.branch || '')).toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => `${a.branch} ${a.name}`.localeCompare(`${b.branch} ${b.name}`, 'es')),
  [locations, branchFilter, typeFilter, searchQuery]);

  const saveLocation = async (event) => {
    event.preventDefault();
    if (!canManage || !supabase || !organizationId || !user) return;
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(code)) {
      flash('Usa un código breve sin espacios; puedes separar palabras con guion.');
      return;
    }
    if (!draft.name.trim() || !draft.branchId) return;
    setBusy(true);
    const { error } = await supabase.from('inventory_locations').insert({
      organization_id: organizationId,
      branch_id: draft.branchId,
      parent_id: draft.parentId || null,
      code,
      name: draft.name.trim(),
      location_type: draft.type,
      created_by: user.id,
    });
    setBusy(false);
    if (error) {
      flash(error.code === '23505' ? `El código ${code} ya existe en esta sucursal.` : `No se pudo guardar la ubicación: ${error.message}`);
      return;
    }
    await refreshRemote();
    setDraft((current) => ({ ...blankDraft, branchId: current.branchId }));
    flash(`Ubicación ${code} registrada. No se añadió ni modificó stock.`);
  };

  const setLocationActive = async (location, active) => {
    if (!canManage || location.isSystem || !supabase) return;
    if (!active) {
      const hasStock = (data.inventory || []).some((item) => item.branchId === location.branchId && item.location === location.code && !item.archived && Number(item.quantity) > 0);
      const hasCatalogLink = catalogLinks.some((link) => link.active && link.branch_id === location.branchId && link.location_code === location.code);
      if (hasStock || hasCatalogLink) {
        flash(hasStock ? 'No se puede archivar: aún hay stock contado en esa ubicación.' : 'No se puede archivar: un producto de venta todavía usa esta ubicación.');
        return;
      }
      const accepted = await confirm({
        eyebrow: 'BODEGA Y UBICACIONES',
        title: `¿Archivar la ubicación ${location.code} · ${location.name}?`,
        description: 'La ubicación dejará de aparecer como opción en nuevos conteos, compras y movimientos.',
        tone: 'warning',
        confirmLabel: 'Archivar ubicación',
        cancelLabel: 'Cancelar',
        summaryItems: [
          { label: 'Código', value: location.code },
          { label: 'Nombre', value: location.name },
          { label: 'Sucursal', value: location.branch || 'Sucursal asignada' },
        ],
        consequences: [
          'Se conserva íntegro el historial de conteos, compras y movimientos registrados.',
          'Puedes reactivar esta ubicación cuando vuelva a utilizarse.',
        ],
      });
      if (!accepted) return;
    }
    const { error } = await supabase.from('inventory_locations').update({ active, updated_at: new Date().toISOString() }).eq('id', location.id).eq('organization_id', organizationId);
    if (error) { flash(`No se pudo actualizar la ubicación: ${error.message}`); return; }
    await refreshRemote();
    flash(active ? 'Ubicación reactivada.' : 'Ubicación archivada; el historial se conserva.');
  };

  const parentOptions = locations.filter((location) => location.active && location.branchId === draft.branchId);

  return <section id={id} hidden={hidden} className="panel inventory-location-panel">
    <div className="panel-heading">
      <div><span className="eyebrow">FASE 4 · BODEGA Y UBICACIONES</span><h3>Mapa de ubicaciones</h3><p>Registra zonas y sububicaciones por sucursal para usar códigos consistentes en conteos, compras y movimientos.</p></div>
      <MapPin size={19}/>
    </div>
    <div className="inventory-location-note"><LockKeyhole size={15}/><span>“MAIN · Ubicación principal” es una ubicación lógica del sistema. Crear ubicaciones no agrega existencias ni confirma un conteo físico.</span></div>
    {canManage && <form className="inventory-location-form" onSubmit={saveLocation}>
      <label>Sucursal<select required value={draft.branchId} onChange={(event) => setDraft({ ...draft, branchId: event.target.value, parentId: '' })}><option value="">Selecciona sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label>Ubicación superior<select value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">Sin ubicación superior</option>{parentOptions.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label>
      <label>Código<input required maxLength={40} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase().replace(/\s+/g, '-') })} placeholder="BOD-01, EST-A1"/></label>
      <label>Nombre<input required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Estante de viniles"/></label>
      <label>Uso<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{locationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="button button-dark" disabled={busy || !draft.branchId}><Plus size={15}/>{busy ? 'Guardando…' : 'Añadir ubicación'}</button>
    </form>}
    <div className="inventory-location-toolbar">
      <div className="inventory-location-filters">
        <label>
          Sucursal
          <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
            <option value="Todas">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo de uso
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Todos los usos</option>
            {locationTypes.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </label>
        <label className="inventory-location-search">
          Buscar
          <div className="inventory-location-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Código o nombre…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </label>
      </div>
      <span className="inventory-location-count">{visible.length} ubicaciones encontradas</span>
    </div>
    <div className="inventory-location-grid">
      {visible.map((location) => {
        const key = `${location.branchId}|${location.code}`;
        const storedItems = itemCountByLocation.get(key) || 0;
        const parentLocation = location.parentId ? locations.find((row) => row.id === location.parentId) : null;
        return (
          <article className={`inventory-location-card${!location.active ? ' is-inactive' : ''}`} key={location.id}>
            <span className={`inventory-location-icon type-${location.type}`}>
              {iconForType(location.type)}
            </span>
            <div className="inventory-location-copy">
              <div className="inventory-location-header-row">
                <b>{location.code} · {location.name}</b>
                <span className={`location-status-badge ${location.active ? 'is-active' : 'is-archived'}`}>
                  {location.active ? 'Activa' : 'Archivada'}
                </span>
                {location.isSystem && <span className="location-system-badge">Sistema</span>}
              </div>
              <small>
                {location.branch} · {locationTypes.find(([value]) => value === location.type)?.[1] || 'Otra'}
                {parentLocation ? ` · dentro de ${parentLocation.name} (${parentLocation.code})` : ''}
              </small>
              <div className="inventory-location-meta-row">
                <span className={`location-stock-pill ${storedItems > 0 ? 'has-stock' : 'no-stock'}`}>
                  {storedItems > 0 ? `${storedItems} artículos con saldo` : 'Sin saldo activo'}
                </span>
              </div>
            </div>
            {canManage && !location.isSystem && (
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setLocationActive(location, !location.active)}
                aria-label={location.active ? `Archivar ${location.code}` : `Reactivar ${location.code}`}
              >
                {location.active ? <><Archive size={14}/> Archivar</> : <><RotateCcw size={14}/> Reactivar</>}
              </button>
            )}
          </article>
        );
      })}
      {!visible.length && <div className="inventory-empty">No hay ubicaciones configuradas para este filtro.</div>}
    </div>
  </section>;
}
