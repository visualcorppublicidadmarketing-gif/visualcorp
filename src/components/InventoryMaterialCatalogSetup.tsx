import React, { useState } from 'react';
import { Layers3 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export function InventoryMaterialCatalogSetup({ canEdit, onDone, onMessage }: { canEdit: boolean; onDone: () => Promise<void>; onMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const prepare = async () => {
    if (!canEdit || !supabase || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('seed_visualcorp_material_variant_catalog');
    setBusy(false);
    if (error) { onMessage(`No se pudo cargar el catálogo de materiales: ${error.message}`); return; }
    await onDone();
    onMessage(`Catálogo listo: ${data?.items ?? 8} artículos maestros y ${data?.variants ?? 36} variantes. No se crearon existencias físicas.`);
  };

  return <div className="inventory-material-catalog panel">
    <span className="inventory-event-icon"><Layers3 size={16}/></span>
    <div><b>Preparar catálogo de papel, vinil y lona</b><small>Agrega los formatos A5–A2, variantes de color/acabado a 107/127 cm y los anchos de lona 310, 107, 207 y 203 cm. Es idempotente y no registra cantidades ni compras.</small></div>
    <button type="button" className="button button-dark" onClick={prepare} disabled={!canEdit || busy}>{busy ? 'Preparando catálogo…' : 'Agregar / actualizar artículos'}</button>
  </div>;
}
