import { useMemo, useState, type FormEvent } from 'react';
import { Archive, Box, Check, Eye, EyeOff, FolderHeart, Package, Paintbrush, Pencil, Plus, Shield, Sparkles, TreePine, X } from 'lucide-react';
import './InventoryGroupsPanel.css';

export type InventoryGroup = {
  id: string;
  name: string;
  description: string;
  iconKey: string;
  colorKey: string;
  showInMain: boolean;
  displayOrder: number;
};

const symbols = { package: Package, sparkles: Sparkles, tree: TreePine, pumpkin: FolderHeart, paintbrush: Paintbrush, shield: Shield, box: Box };
const palettes = ['violet', 'emerald', 'amber', 'rose', 'sky', 'slate'];
const icons = Object.keys(symbols);

export function InventoryGroupsPanel({ groups, items, canEdit, saving, onCreate, onUpdate, onArchive, onOpen }: {
  groups: InventoryGroup[];
  items: any[];
  canEdit: boolean;
  saving: string | null;
  onCreate: (draft: Omit<InventoryGroup, 'id' | 'displayOrder'>) => Promise<boolean | void>;
  onUpdate: (id: string, patch: Partial<InventoryGroup>) => Promise<boolean | void>;
  onArchive: (group: InventoryGroup) => Promise<void>;
  onOpen: (id: string | null) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', iconKey: 'package', colorKey: 'violet', showInMain: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', description: '', iconKey: 'package', colorKey: 'violet' });
  const articleCounts = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    for (const item of items) if (item.inventoryGroupId) {
      const ids = counts.get(item.inventoryGroupId) || new Set<string>();
      ids.add(item.remoteItemId || item.id);
      counts.set(item.inventoryGroupId, ids);
    }
    return new Map([...counts].map(([id, ids]) => [id, ids.size]));
  }, [items]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    const created = await onCreate({ ...draft, name: draft.name.trim(), description: draft.description.trim() });
    if (created === false) return;
    setDraft({ name: '', description: '', iconKey: 'package', colorKey: 'violet', showInMain: false });
    setShowCreate(false);
  };

  return <section className="inventory-groups" aria-labelledby="inventory-groups-title">
    <header className="inventory-groups-hero">
      <div className="inventory-groups-orbit" aria-hidden="true"><Package size={54}/></div>
      <div className="inventory-groups-hero-copy">
        <span className="eyebrow">ORGANIZACIÓN DEL CATÁLOGO</span>
        <h2 id="inventory-groups-title">Colecciones de inventario</h2>
        <p>Separa lo esencial del trabajo diario de materiales especiales, decoración y temporadas. Todo conserva su stock, ubicación e historial originales.</p>
      </div>
      {canEdit && <button className="button button-dark inventory-groups-create-trigger" type="button" onClick={() => setShowCreate(value => !value)}><Plus size={16}/> Crear colección</button>}
    </header>

    {showCreate && <form className="inventory-group-create" onSubmit={submit}>
      <div className="inventory-group-create-heading"><div><b>Nueva colección</b><small>Úsala para separar artículos que no deben distraer en el inventario principal.</small></div><button type="button" aria-label="Cerrar" onClick={() => setShowCreate(false)}><X size={16}/></button></div>
      <div className="inventory-group-create-fields">
        <label>Nombre<input autoFocus maxLength={80} required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Navidad"/></label>
        <label>Descripción<input maxLength={500} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Decoración y materiales de temporada"/></label>
        <label>Identidad<select value={draft.iconKey} onChange={event => setDraft({ ...draft, iconKey: event.target.value })}>{icons.map(icon => <option key={icon} value={icon}>{icon === 'tree' ? 'Árbol · temporadas' : icon === 'pumpkin' ? 'Celebración · fechas' : icon === 'paintbrush' ? 'Diseño · ambientación' : icon === 'shield' ? 'Seguridad' : icon === 'sparkles' ? 'Especiales' : 'Paquete · general'}</option>)}</select></label>
        <label>Color<select value={draft.colorKey} onChange={event => setDraft({ ...draft, colorKey: event.target.value })}>{palettes.map(color => <option key={color} value={color}>{({ violet: 'Violeta', emerald: 'Esmeralda', amber: 'Ámbar', rose: 'Rosa', sky: 'Celeste', slate: 'Grafito' })[color]}</option>)}</select></label>
      </div>
      <label className="inventory-group-show-toggle"><input type="checkbox" checked={draft.showInMain} onChange={event => setDraft({ ...draft, showInMain: event.target.checked })}/> Mostrar también en el inventario principal <small>Desactivado: aparece solo dentro de esta colección.</small></label>
      <footer><button type="button" className="button button-outline" onClick={() => setShowCreate(false)}>Cancelar</button><button className="button button-dark" type="submit" disabled={saving === 'create'}>{saving === 'create' ? 'Guardando…' : 'Crear colección'}</button></footer>
    </form>}

    <div className="inventory-groups-grid">
      <article className="inventory-collection-card is-primary">
        <div className="inventory-collection-symbol"><Package size={22}/></div>
        <div className="inventory-collection-card-copy"><span className="inventory-collection-kicker">SIEMPRE VISIBLE</span><h3>Inventario principal</h3><p>Materiales que sostienen el trabajo de cada día.</p><small>{new Set(items.filter(item => !item.inventoryGroupId).map(item => item.remoteItemId || item.id)).size} artículos · colección permanente</small></div>
        <button type="button" className="inventory-collection-open" onClick={() => onOpen(null)}>Abrir inventario <span>→</span></button>
      </article>
      {groups.map(group => {
        const Icon = symbols[group.iconKey] || Package;
        const count = articleCounts.get(group.id) || 0;
        return <article key={group.id} className={`inventory-collection-card tone-${group.colorKey}`}>
          <div className="inventory-collection-symbol"><Icon size={22}/></div>
          <div className="inventory-collection-card-copy"><span className="inventory-collection-kicker">COLECCIÓN</span><h3>{group.name}</h3><p>{group.description || 'Artículos agrupados para encontrarlos sin mezclar el catálogo principal.'}</p><small>{count} {count === 1 ? 'artículo' : 'artículos'} · {group.showInMain ? 'visible en el principal' : 'oculta del principal'}</small></div>
          <div className="inventory-collection-actions"><button type="button" className="inventory-collection-open" onClick={() => onOpen(group.id)}>Ver artículos <span>→</span></button>{canEdit && <div className="inventory-collection-tools"><button type="button" disabled={saving === group.id} aria-label={group.showInMain ? `Ocultar ${group.name} del inventario principal` : `Mostrar ${group.name} en el inventario principal`} title={group.showInMain ? 'Ocultar del inventario principal' : 'Mostrar en el inventario principal'} onClick={() => void onUpdate(group.id, { showInMain: !group.showInMain })}>{group.showInMain ? <Eye size={15}/> : <EyeOff size={15}/>}<span>{group.showInMain ? 'Visible en principal' : 'Oculta del principal'}</span></button><button type="button" disabled={saving === group.id} aria-label={`Editar ${group.name}`} title="Editar nombre, descripción e identidad" onClick={() => { setEditingId(editingId === group.id ? null : group.id); setEditDraft({ name: group.name, description: group.description, iconKey: group.iconKey, colorKey: group.colorKey }); }}><Pencil size={14}/></button><button type="button" disabled={saving === group.id} aria-label={`Archivar ${group.name}`} title={count ? `Reasigna los ${count} artículos antes de archivar` : 'Archivar colección vacía'} onClick={() => void onArchive(group)}><Archive size={15}/></button></div>}</div>
          {editingId === group.id && <form className="inventory-collection-edit" onSubmit={async event => { event.preventDefault(); if (!editDraft.name.trim()) return; const saved = await onUpdate(group.id, editDraft); if (saved !== false) setEditingId(null); }}><label>Nombre<input required maxLength={80} value={editDraft.name} onChange={event => setEditDraft({ ...editDraft, name: event.target.value })}/></label><label>Descripción<input maxLength={500} value={editDraft.description} onChange={event => setEditDraft({ ...editDraft, description: event.target.value })}/></label><div className="inventory-collection-edit-row"><label>Icono<select value={editDraft.iconKey} onChange={event => setEditDraft({ ...editDraft, iconKey: event.target.value })}>{icons.map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></label><label>Color<select value={editDraft.colorKey} onChange={event => setEditDraft({ ...editDraft, colorKey: event.target.value })}>{palettes.map(color => <option key={color} value={color}>{color}</option>)}</select></label></div><button className="button button-outline" type="submit" disabled={saving === group.id}>Guardar cambios</button></form>}
        </article>;
      })}
      {!groups.length && <div className="inventory-groups-empty"><div><Sparkles size={20}/></div><b>Tu inventario empieza aquí</b><p>Crea una colección para decoración, campañas o temporadas. Los artículos seguirán ligados al mismo inventario físico.</p>{canEdit && <button type="button" className="button button-outline" onClick={() => setShowCreate(true)}><Plus size={15}/> Crear primera colección</button>}</div>}
    </div>
    <aside className="inventory-groups-principle"><Check size={16}/><span><b>Una sola existencia, mejor organizada.</b> Las colecciones no duplican cantidades ni cambian ventas, conteos, sucursales o movimientos.</span></aside>
  </section>;
}
