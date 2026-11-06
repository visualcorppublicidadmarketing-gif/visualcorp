import React, { useId, useState } from 'react';
import {
  Boxes,
  Check,
  Droplet,
  Droplets,
  Layers,
  LoaderCircle,
  Package,
  Plus,
  Printer,
  Sparkles,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Dialog } from './ui/OperationalKit';
import { CMYK_COLOR_CONFIG } from './InventoryLiveInkMonitor';

export type CmykBatchItemResult = {
  id: string;
  name: string;
  variantId: string;
  colorCode: string;
  quantity: number;
};

type InventoryCmykBatchModalProps = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  branches: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string; code?: string }>;
  areas?: Array<{ id: string; name: string; code?: string }>;
  printers?: string[];
  defaultPrinter?: string;
  onSuccess?: (created: CmykBatchItemResult[]) => Promise<void> | void;
  onNotice?: (msg: string) => void;
};

type ColorRow = {
  code: string;
  name: string;
  quantity: number;
};

const INK_PRESETS = [
  { label: 'Tinta Galaxy Eco-Solvente', type: 'ecosolvente', presentation: 'Botella 1000ml' },
  { label: 'Tinta Sublimación Fusion', type: 'sublimacion', presentation: 'Botella 1000ml' },
  { label: 'Tinta UV Curable Flexible', type: 'uv', presentation: 'Botella 1000ml' },
  { label: 'Tinta DTF Textil Premium', type: 'dtf', presentation: 'Botella 1000ml' },
  { label: 'Tinta Roland TrueVIS Eco-Solvent', type: 'ecosolvente', presentation: 'Botella 500ml' },
  { label: 'Tinta Epson Acuosa Original', type: 'acuosa', presentation: 'Botella 100ml' },
];

export function InventoryCmykBatchModal({
  open,
  onClose,
  organizationId,
  branches,
  categories = [],
  areas = [],
  printers = [],
  defaultPrinter = '',
  onSuccess,
  onNotice,
}: InventoryCmykBatchModalProps) {
  const [inkType, setInkType] = useState<'ecosolvente' | 'sublimacion' | 'uv' | 'dtf' | 'acuosa' | 'solvente'>('ecosolvente');
  const [brandName, setBrandName] = useState('Tinta Galaxy Eco-Solvente');
  const [presentation, setPresentation] = useState('Botella 1000ml');
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [areaId, setAreaId] = useState('');
  const [targetPrinter, setTargetPrinter] = useState(defaultPrinter || '');
  const [includeWandV, setIncludeWandV] = useState(false);
  const [minimumQuantity, setMinimumQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState('25.00');
  const [saving, setSaving] = useState(false);

  // Cantidades iniciales en bodega por color
  const [colorQuantities, setColorQuantities] = useState<Record<string, number>>({
    C: 2,
    M: 2,
    Y: 4,
    K: 2,
    W: 2,
    V: 1,
  });

  const activeColors: ColorRow[] = [
    { code: 'C', name: 'Cian', quantity: colorQuantities.C ?? 2 },
    { code: 'M', name: 'Magenta', quantity: colorQuantities.M ?? 2 },
    { code: 'Y', name: 'Amarillo', quantity: colorQuantities.Y ?? 4 },
    { code: 'K', name: 'Negro', quantity: colorQuantities.K ?? 2 },
    ...(includeWandV
      ? [
          { code: 'W', name: 'Blanco', quantity: colorQuantities.W ?? 2 },
          { code: 'V', name: 'Barniz / Gloss', quantity: colorQuantities.V ?? 1 },
        ]
      : []),
  ];

  const handleApplyPreset = (preset: typeof INK_PRESETS[0]) => {
    setBrandName(preset.label);
    setInkType(preset.type as any);
    setPresentation(preset.presentation);
    if (preset.type === 'uv') setIncludeWandV(true);
    else setIncludeWandV(false);
  };

  const updateQuantity = (code: string, qty: number) => {
    setColorQuantities((prev) => ({
      ...prev,
      [code]: Math.max(0, Math.round(qty)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBrand = brandName.trim();
    if (!cleanBrand) {
      onNotice?.('Por favor ingresa un nombre para la tinta (ej. Tinta Galaxy Eco-Solvente).');
      return;
    }

    setSaving(true);
    const createdResults: CmykBatchItemResult[] = [];

    try {
      const selectedBranch = branches.find((b) => b.id === branchId) || branches[0];
      const selectedBranchId = selectedBranch?.id || branchId;

      // Buscar o asignar categoría adecuada (Tintas o Insumos)
      let resolvedCategoryId: string | null = null;
      const inkCat = categories.find((c) => {
        const n = String(c.name || '').toLowerCase();
        return n.includes('tinta') || n.includes('insumo') || n.includes('consumible');
      });
      if (inkCat) resolvedCategoryId = inkCat.id;

      // Buscar o asignar área adecuada (Impresión o Taller)
      let resolvedAreaId: string | null = areaId || null;
      if (!resolvedAreaId) {
        const printArea = areas.find((a) => {
          const n = String(a.name || '').toLowerCase();
          return n.includes('impresi') || n.includes('sublimaci') || n.includes('taller');
        });
        if (printArea) resolvedAreaId = printArea.id;
      }

      // Generar y guardar cada color
      for (const col of activeColors) {
        const colorCfg = CMYK_COLOR_CONFIG[col.code] || { name: col.name, hex: '#888' };
        const fullName = `${cleanBrand} ${colorCfg.name} (${col.code})`;
        const itemType = `Tinta ${inkType.charAt(0).toUpperCase() + inkType.slice(1)}`;
        const baseUnit = 'botella';
        const notes = `Tinta ${inkType} color ${colorCfg.name} para plotters de taller. Presentación: ${presentation}.`;
        const tags = ['tinta', 'cmyk', inkType, col.code.toLowerCase(), colorCfg.name.toLowerCase()];

        // Generar SKU limpio
        const cleanPrefix = cleanBrand
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 6);
        const sku = `VC-TIN-${cleanPrefix}-${col.code}-${Date.now().toString(36).slice(-3).toUpperCase()}`;

        let itemId: string = globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let variantId: string = globalThis.crypto?.randomUUID?.() || `var-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        if (supabase) {
          // 1. Insertar en inventory_items
          const { data: itemData, error: itemError } = await supabase
            .from('inventory_items')
            .insert({
              organization_id: organizationId,
              area_id: resolvedAreaId,
              category_id: resolvedCategoryId,
              sku,
              name: fullName,
              description: notes,
              item_type: itemType,
              tags,
              base_unit: baseUnit,
              minimum_quantity: minimumQuantity,
              custom_fields: {
                color_code: col.code,
                color_name: colorCfg.name,
                color_hex: colorCfg.hex,
                ink_type: inkType,
                presentation,
              },
            })
            .select('id')
            .maybeSingle();

          if (!itemError && itemData?.id) {
            itemId = itemData.id;
          }

          // 2. Insertar variante en inventory_variants
          const { data: variantData, error: variantError } = await supabase
            .from('inventory_variants')
            .insert({
              organization_id: organizationId,
              item_id: itemId,
              sku: `${sku}-01`,
              label: `${colorCfg.name} · ${presentation}`,
              attributes: {
                color_code: col.code,
                color_name: colorCfg.name,
                ink_type: inkType,
                presentation,
              },
            })
            .select('id')
            .maybeSingle();

          if (!variantError && variantData?.id) {
            variantId = variantData.id;
          }

          // 3. Registrar conteo inicial en bodega (si hay cantidad especificada)
          if (col.quantity > 0 && selectedBranchId) {
            try {
              await supabase.rpc('set_inventory_count', {
                p_variant_id: variantId,
                p_branch_id: selectedBranchId,
                p_counted_quantity: col.quantity,
                p_location_code: 'MAIN',
                p_note: `Alta inicial de lote CMYK: ${col.quantity} botellas en bodega`,
              });
            } catch {
              // Ignore RPC failure if mock
            }
          }

          // 4. Registrar costo si se especificó
          if (unitCost && Number(unitCost) > 0) {
            try {
              await supabase.rpc('update_inventory_cost', {
                p_variant_id: variantId,
                p_unit_cost: Number(unitCost),
                p_supplier_name: cleanBrand,
              });
            } catch {
              // Ignore cost rpc failure
            }
          }

          // 5. Vincular automáticamente a la impresora destino si fue elegida
          if (targetPrinter) {
            try {
              await supabase
                .from('inventory_active_inks')
                .update({
                  variant_id: variantId,
                  updated_at: new Date().toISOString(),
                })
                .eq('organization_id', organizationId)
                .eq('machine_name', targetPrinter)
                .eq('color_code', col.code);
            } catch {
              // Ignore link error
            }
          }
        }

        createdResults.push({
          id: itemId,
          name: fullName,
          variantId,
          colorCode: col.code,
          quantity: col.quantity,
        });
      }

      onNotice?.(
        `¡Lote de ${createdResults.length} tintas creado con éxito en bodega!${
          targetPrinter ? ` Conectado directamente a “${targetPrinter}”.` : ''
        }`
      );

      if (onSuccess) {
        await onSuccess(createdResults);
      }
      onClose();
    } catch (err: any) {
      onNotice?.(`Error creando lote de tintas: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
      eyebrow="ALTA RÁPIDA DE TINTAS DE IMPRESIÓN"
      title="Crear Lote de Tintas CMYK en Inventario Real"
      description="Crea de 1 solo toque los 4 artículos de bodega (Cian, Magenta, Amarillo, Negro) con su saldo auditado en botellas y vincúlalos automáticamente a los tanques de tu máquina."
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
          <button type="button" className="button button-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="submit"
            form="cmyk-batch-create-form"
            className="button button-primary"
            disabled={saving}
            style={{
              background: 'linear-gradient(135deg, #793fa0, #b3148c)',
              color: '#fff',
              border: 'none',
              paddingInline: '16px',
            }}
          >
            {saving ? (
              <>
                <LoaderCircle size={15} className="vc-spin" /> Creando artículos en bodega…
              </>
            ) : (
              <>
                <Check size={15} /> Crear {activeColors.length} Tintas y Vincular
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="cmyk-batch-create-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
        {/* Presets rápidos */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#71697d', display: 'block', marginBottom: '6px' }}>
            Series y Marcas Rápidas:
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {INK_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.label}
                onClick={() => handleApplyPreset(preset)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: '1px solid #e3dbe9',
                  background: brandName === preset.label ? '#793fa0' : '#fbf9fd',
                  color: brandName === preset.label ? '#ffffff' : '#574d64',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all .15s ease',
                }}
              >
                <Sparkles size={11} /> {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Datos Principales */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            Nombre Comercial / Serie de la Tinta *
            <input
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Ej. Tinta Galaxy Eco-Solvente"
              style={{
                minHeight: '36px',
                padding: '6px 10px',
                border: '1px solid #e2dce8',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            Tecnología de Impresión
            <select
              value={inkType}
              onChange={(e) => {
                const val = e.target.value as any;
                setInkType(val);
                if (val === 'uv') setIncludeWandV(true);
              }}
              style={{
                minHeight: '36px',
                padding: '6px 10px',
                border: '1px solid #e2dce8',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            >
              <option value="ecosolvente">Eco-Solvente (Gran formato, Roland, Galaxy)</option>
              <option value="sublimacion">Sublimación (Calandras y plotter textil)</option>
              <option value="uv">UV Curable (Cama plana o rollo UV)</option>
              <option value="dtf">DTF Textil</option>
              <option value="solvente">Solvente Industrial</option>
              <option value="acuosa">Acuosa / Base Agua (Epson)</option>
            </select>
          </label>
        </div>

        {/* Presentación, Sucursal e Impresora Destino */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            Presentación de Botella
            <select
              value={presentation}
              onChange={(e) => setPresentation(e.target.value)}
              style={{
                minHeight: '36px',
                padding: '6px 10px',
                border: '1px solid #e2dce8',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            >
              <option value="Botella 1000ml">Botella 1000ml (1 Litro)</option>
              <option value="Botella 500ml">Botella 500ml</option>
              <option value="Botella 100ml">Botella 100ml</option>
              <option value="Galón 3.8L">Galón 3.8 Litros</option>
              <option value="Cartucho 440ml">Cartucho 440ml</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            Sucursal de Bodega
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              style={{
                minHeight: '36px',
                padding: '6px 10px',
                border: '1px solid #e2dce8',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            Vincular Automáticamente a Máquina
            <select
              value={targetPrinter}
              onChange={(e) => setTargetPrinter(e.target.value)}
              style={{
                minHeight: '36px',
                padding: '6px 10px',
                border: '1px solid #e2dce8',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            >
              <option value="">(Ninguna · Solo crear en bodega)</option>
              {printers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Cuadrícula de Colores y Stock Inicial en Bodega */}
        <div style={{ border: '1px solid #e5dfec', borderRadius: '12px', padding: '14px', background: '#faf9fc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#382f44', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Droplets size={15} color="#793fa0" /> Colores CMYK y Existencias Iniciales en Bodega:
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#685d75', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeWandV}
                onChange={(e) => setIncludeWandV(e.target.checked)}
                style={{ accentColor: '#793fa0' }}
              />
              Incluir Blanco (W) y Barniz (V)
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            {activeColors.map((col) => {
              const cfg = CMYK_COLOR_CONFIG[col.code] || { name: col.name, hex: '#888', badgeBg: '#eee' };
              return (
                <div
                  key={col.code}
                  style={{
                    display: 'grid',
                    gap: '6px',
                    padding: '10px',
                    borderRadius: '9px',
                    background: '#ffffff',
                    border: '1px solid #e4dfe9',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        background: cfg.hex,
                        border: col.code === 'W' ? '1px solid #ccc' : 'none',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '9px',
                        fontWeight: 800,
                        color: (cfg as any)?.textDark ? '#222' : '#fff',
                      }}
                    >
                      {col.code}
                    </span>
                    <b style={{ fontSize: '11px', color: '#2b2336' }}>{cfg.name}</b>
                  </div>

                  <label style={{ fontSize: '10px', color: '#776f82', display: 'grid', gap: '3px' }}>
                    Botellas en bodega:
                    <input
                      type="number"
                      min="0"
                      value={col.quantity}
                      onChange={(e) => updateQuantity(col.code, Number(e.target.value))}
                      style={{
                        width: '100%',
                        minHeight: '30px',
                        padding: '4px 8px',
                        border: '1px solid #d9d2e2',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#2b2336',
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alertas y Costos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            Alerta de Stock Mínimo (botellas)
            <input
              type="number"
              min="0"
              value={minimumQuantity}
              onChange={(e) => setMinimumQuantity(Number(e.target.value) || 0)}
              style={{
                minHeight: '36px',
                padding: '6px 10px',
                border: '1px solid #e2dce8',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
            Costo Estimado por Botella USD (opcional)
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="Ej. 25.00"
              style={{
                minHeight: '36px',
                padding: '6px 10px',
                border: '1px solid #e2dce8',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            />
          </label>
        </div>
      </form>
    </Dialog>
  );
}
