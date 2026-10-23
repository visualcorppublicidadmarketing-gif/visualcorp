import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Layers,
  Sparkles,
  Maximize2,
  Plus,
  Check,
  Tag,
  Scissors,
  Wrench,
  Eye,
  FileText
} from 'lucide-react';
import { calculatePrintItemPrice } from '../../../lib/posStore';
import { playAddSound } from '../../../lib/posAudio';
import { assetPath } from '../../../data/media';

export function POSProductQuickMatrix({
  products = [],
  selectedProduct,
  onSelectProduct,
  onAddToCart,
  customerVipTier = null
}) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dimension, Finishing & Commercial Override State
  const [widthCm, setWidthCm] = useState(300);
  const [heightCm, setHeightCm] = useState(200);
  const [quantity, setQuantity] = useState(1);
  const [finishingType, setFinishingType] = useState('none');
  const [eyeletCount, setEyeletCount] = useState(4);
  const [designService, setDesignService] = useState('none'); // 'none' | 'adaptation' | 'scratch'
  const [installationService, setInstallationService] = useState('none'); // 'none' | 'standard' | 'height' | 'custom'
  const [customInstallationCost, setCustomInstallationCost] = useState('');
  const [customPriceOverride, setCustomPriceOverride] = useState('');
  const [itemNotes, setItemNotes] = useState('');

  const currentProduct = selectedProduct || products[0] || null;

  // Reset finishings & overrides whenever product changes
  useEffect(() => {
    setFinishingType('none');
    setEyeletCount(4);
    setDesignService('none');
    setInstallationService('none');
    setCustomInstallationCost('');
    setCustomPriceOverride('');
  }, [currentProduct?.id]);

  // Context-aware available finishings for the active product
  const availableFinishings = useMemo(() => {
    if (!currentProduct) return [{ id: 'none', label: 'Sin acabados extra', cost: 0 }];
    
    const cat = (currentProduct.category || '').toLowerCase();
    const name = (currentProduct.name || '').toLowerCase();

    // 1. Textil / DTF / Sublimación / Promocionales (Almohadas, Camisetas, Tazas, Gorras, etc.)
    if (
      cat.includes('textil') ||
      cat.includes('dtf') ||
      cat.includes('sublimaci') ||
      name.includes('almohada') ||
      name.includes('camiseta') ||
      name.includes('taza') ||
      name.includes('gorra') ||
      name.includes('coj') ||
      name.includes('bolso')
    ) {
      return [
        { id: 'none', label: 'Sin acabados extra', cost: 0 },
        { id: 'estampado_doble', label: 'Estampado Frente + Dorso (+$3.00)', cost: 3.00 },
        { id: 'empaque_individual', label: 'Empaque individual en celofán (+$0.50)', cost: 0.50 },
        { id: 'relleno_extra', label: 'Relleno plumón siliconado extra (+$2.50)', cost: 2.50 }
      ];
    }

    // 2. Gran Formato / Lonas / Banners
    if (
      cat.includes('gran formato') ||
      cat.includes('lona') ||
      name.includes('lona') ||
      name.includes('banner') ||
      name.includes('mesh') ||
      name.includes('backlit') ||
      name.includes('blackout')
    ) {
      return [
        { id: 'none', label: 'Estándar / Con margen blanco (demasía para bastidor)', cost: 0 },
        { id: 'corte_al_ras', label: 'Corte al ras / Refilado exacto a medida (+$1.00)', cost: 1.00 },
        { id: 'ojales_pequenos', label: 'Ojales estándar niquelados (+$0.30 c/u)', cost: 0.30 },
        { id: 'ojales_reforzados', label: 'Ojales reforzados 4 esquinas (+$0.50 c/u)', cost: 0.50 },
        { id: 'dobladillo_perimetral', label: 'Dobladillo termosellado perimetral (+$0.75/m)', cost: 0.75 },
        { id: 'bolsillo_tubo', label: 'Bolsillo para tubo arriba y abajo (+$4.00)', cost: 4.00 }
      ];
    }

    // 3. Viniles & Adhesivos / Stickers
    if (
      cat.includes('vinil') ||
      cat.includes('adhesiv') ||
      cat.includes('sticker') ||
      name.includes('vinil') ||
      name.includes('sticker') ||
      name.includes('etiqueta')
    ) {
      return [
        { id: 'none', label: 'Sin laminado / Corte recto', cost: 0 },
        { id: 'laminado_brillante', label: 'Laminado UV brillante protector (+$3.50/m²)', cost: 3.50 },
        { id: 'laminado_mate', label: 'Laminado UV mate antirreflejo (+$3.50/m²)', cost: 3.50 },
        { id: 'troquelado_silueta', label: 'Troquelado / semicorte digital a silueta (+$2.00/m²)', cost: 2.00 },
        { id: 'papel_transfer', label: 'Con papel posicionador transfer (+$1.50/m²)', cost: 1.50 }
      ];
    }

    // 4. Rígidos & Estructuras (Sintra, Acrílico, PVC, Coroplast, Madera)
    if (
      cat.includes('r') ||
      cat.includes('sintra') ||
      cat.includes('acril') ||
      cat.includes('pvc') ||
      cat.includes('estruct')
    ) {
      return [
        { id: 'none', label: 'Sin acabados extra', cost: 0 },
        { id: 'corte_cnc', label: 'Ruteado CNC a silueta (+$4.00/m²)', cost: 4.00 },
        { id: 'separadores_pared', label: 'Separadores de acero inoxidable x4 (+$6.00)', cost: 6.00 },
        { id: 'cinta_doble_faz', label: 'Cinta doble faz 3M VHB aplicada (+$2.50/m)', cost: 2.50 }
      ];
    }

    // 5. Imprenta & Papelería
    if (
      cat.includes('imprenta') ||
      cat.includes('papel') ||
      name.includes('tarjeta') ||
      name.includes('volante') ||
      name.includes('folleto') ||
      name.includes('carpeta')
    ) {
      return [
        { id: 'none', label: 'Sin acabado adicional', cost: 0 },
        { id: 'plastificado_mate', label: 'Plastificado mate suave (+$0.05 c/u)', cost: 0.05 },
        { id: 'plastificado_brillo', label: 'Plastificado brillo UV (+$0.04 c/u)', cost: 0.04 },
        { id: 'puntas_redondas', label: 'Despunte de esquinas redondeadas (+$2.00/lote)', cost: 2.00 },
        { id: 'doblado', label: 'Doblado / Plegado mecánico (+$2.50/lote)', cost: 2.50 }
      ];
    }

    return [
      { id: 'none', label: 'Sin acabados extra', cost: 0 }
    ];
  }, [currentProduct]);

  const categories = [
    { id: 'all', label: '✦ Todo el Catálogo', icon: '✨' },
    { id: 'Gran Formato', label: 'Lonas & Gran Formato', icon: '🖼️' },
    { id: 'Viniles y Adhesivos', label: 'Viniles & Stickers', icon: '🏷️' },
    { id: 'Rótulos y Cajas de Luz', label: 'Rótulos & Cajas', icon: '💡' },
    { id: 'Rígidos y Estructuras', label: 'Sintra, PVC & Acrílico', icon: '📐' },
    { id: 'Textil y DTF', label: 'Textil & DTF', icon: '👕' },
    { id: 'Imprenta Digital', label: 'Imprenta & Papelería', icon: '📄' }
  ];

  const standardPresets = [
    { label: '1.00 × 1.00 m (Cuadrado)', w: 100, h: 100 },
    { label: '2.00 × 1.00 m (Estándar)', w: 200, h: 100 },
    { label: '3.00 × 2.00 m (Valla)', w: 300, h: 200 },
    { label: '0.85 × 2.00 m (Roll-Up)', w: 85, h: 200 },
    { label: '0.60 × 1.60 m (Banner X)', w: 60, h: 160 }
  ];

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = activeCategory === 'all' || p.category === activeCategory;
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  const calculated = useMemo(() => {
    if (!currentProduct) {
      return {
        totalItemPrice: 0,
        areaM2: 0,
        perimeterM: 0,
        unitRate: 0,
        baseItemSubtotal: 0,
        finishingSubtotal: 0,
        designCost: 0,
        installationCost: 0,
        systemCalculatedTotal: 0,
        finalItemPrice: 0,
        isOverridden: false,
        priceAdjustment: 0
      };
    }
    return calculatePrintItemPrice({
      product: currentProduct,
      widthCm,
      heightCm,
      quantity,
      finishingType,
      eyeletCount,
      designService,
      installationService,
      customInstallationCost: customInstallationCost ? Number(customInstallationCost) : 0,
      customPriceOverride: customPriceOverride !== '' ? customPriceOverride : null,
      customerVipTier
    });
  }, [
    currentProduct,
    widthCm,
    heightCm,
    quantity,
    finishingType,
    eyeletCount,
    designService,
    installationService,
    customInstallationCost,
    customPriceOverride,
    customerVipTier
  ]);

  const money = (val) => `$${(Number(val) || 0).toFixed(2)}`;

  const handleAdd = () => {
    if (!currentProduct) return;
    playAddSound();
    const selectedFinishingObj = availableFinishings.find((f) => f.id === finishingType);
    const finishingLabel = finishingType !== 'none' && selectedFinishingObj
      ? selectedFinishingObj.label.split(' (')[0]
      : '';

    let designLabel = '';
    if (designService === 'adaptation') designLabel = 'Adaptación de arte ($5)';
    else if (designService === 'scratch') designLabel = 'Diseño desde cero ($15)';

    let installationLabel = '';
    if (installationService === 'standard') installationLabel = 'Montaje estándar ($15)';
    else if (installationService === 'height') installationLabel = 'Montaje en altura ($30)';
    else if (installationService === 'custom') installationLabel = `Montaje personalizado ($${Number(customInstallationCost || 0).toFixed(2)})`;

    onAddToCart({
      productId: currentProduct.id,
      productName: currentProduct.name,
      category: currentProduct.category,
      calcType: currentProduct.calcType,
      unitPrice: calculated.effectiveUnitPrice,
      widthCm: currentProduct.calcType === 'area' ? Number(widthCm) : null,
      heightCm: currentProduct.calcType === 'area' ? Number(heightCm) : null,
      areaM2: currentProduct.calcType === 'area' ? Number(calculated.areaM2) : null,
      quantity: Number(quantity),
      finishing: finishingLabel,
      eyeletCount: finishingType.includes('ojales') ? Number(eyeletCount) : 0,
      designService,
      designLabel,
      designCost: calculated.designCost,
      installationService,
      installationLabel,
      installationCost: calculated.installationCost,
      systemPrice: calculated.systemCalculatedTotal,
      totalPrice: Number(calculated.totalItemPrice),
      isOverridden: calculated.isOverridden,
      priceAdjustment: calculated.priceAdjustment,
      notes: itemNotes.trim()
    });

    // Reset override and item notes after adding
    setCustomPriceOverride('');
    setItemNotes('');
  };

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {/* Search & Category Pills Bar */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Buscar material o sustrato..."
          className="pos-input"
          style={{ maxWidth: '240px', padding: '6px 12px', fontSize: '12px' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px', flex: 1 }}>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategory(c.id)}
              className="pos-cat-pill"
              style={{
                background: activeCategory === c.id ? 'var(--orange)' : '#fff',
                color: activeCategory === c.id ? '#fff' : 'var(--ink)',
                borderColor: activeCategory === c.id ? 'var(--orange)' : 'var(--line)',
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                fontWeight: activeCategory === c.id ? 800 : 600,
                cursor: 'pointer'
              }}
            >
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visual Substrate Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: '8px',
        maxHeight: '175px',
        overflowY: 'auto',
        paddingRight: '4px'
      }}>
        {filteredProducts.map((p) => {
          const isSelected = currentProduct?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => onSelectProduct && onSelectProduct(p)}
              style={{
                background: isSelected ? 'var(--orange-soft)' : '#fff',
                border: isSelected ? '2px solid var(--orange)' : '1px solid var(--line)',
                borderRadius: '10px',
                padding: '8px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isSelected ? '0 2px 8px rgba(234, 88, 12, 0.15)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    {p.category}
                  </span>
                  {isSelected && <Check size={14} color="var(--orange)" />}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {p.image && (
                    <img
                      src={assetPath(p.image)}
                      alt=""
                      style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(0,0,0,0.06)' }}
                    />
                  )}
                  <div style={{ fontWeight: 800, fontSize: '11.5px', color: 'var(--ink)', lineHeight: '1.2' }}>
                    {p.name}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '4px', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  {p.calcType === 'area' ? 'Tarifa m²' : 'Unidad'}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--orange-dark)', fontFamily: 'Space Grotesk' }}>
                  {money(p.basePrice)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Product Configurator & Area Calculator */}
      {currentProduct && (
        <div style={{
          background: 'var(--bg)',
          borderRadius: '14px',
          border: '1.5px solid var(--line)',
          padding: '12px 16px',
          display: 'grid',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {currentProduct.image && (
                <img
                  src={assetPath(currentProduct.image)}
                  alt=""
                  style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover', border: '1.5px solid var(--line)' }}
                />
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: 'var(--orange)', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 900 }}>
                    CONFIGURANDO
                  </span>
                  <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{currentProduct.name}</strong>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  (Base: {money(currentProduct.basePrice)} / {currentProduct.calcType === 'area' ? 'm²' : 'u'})
                </span>
              </div>
            </div>
          </div>

          {/* Quick Presets for Signage & Banners */}
          {currentProduct.calcType === 'area' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)' }}>Medidas Rápidas:</span>
              {standardPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setWidthCm(preset.w);
                    setHeightCm(preset.h);
                  }}
                  style={{
                    background: widthCm === preset.w && heightCm === preset.h ? 'var(--orange-soft)' : '#fff',
                    border: widthCm === preset.w && heightCm === preset.h ? '1.5px solid var(--orange)' : '1px solid var(--line)',
                    color: widthCm === preset.w && heightCm === preset.h ? 'var(--orange-dark)' : 'var(--ink)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* Dimensions, Quantity and Finishings */}
          <div style={{ display: 'grid', gridTemplateColumns: currentProduct.calcType === 'area' ? '1fr 1fr 0.8fr 1.4fr' : '1fr 1.5fr', gap: '10px' }}>
            {currentProduct.calcType === 'area' ? (
              <>
                <div>
                  <label className="pos-label" style={{ fontSize: '11px' }}>Ancho (cm)</label>
                  <input
                    type="number"
                    min="10"
                    step="1"
                    className="pos-input"
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value)}
                    style={{ fontSize: '13px', padding: '6px 8px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label className="pos-label" style={{ fontSize: '11px' }}>Alto (cm)</label>
                  <input
                    type="number"
                    min="10"
                    step="1"
                    className="pos-input"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    style={{ fontSize: '13px', padding: '6px 8px', fontWeight: 700 }}
                  />
                </div>
              </>
            ) : null}

            <div>
              <label className="pos-label" style={{ fontSize: '11px' }}>Cantidad</label>
              <input
                type="number"
                min="1"
                step="1"
                className="pos-input"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ fontSize: '13px', padding: '6px 8px', fontWeight: 700, textAlign: 'center' }}
              />
            </div>

            <div>
              <label className="pos-label" style={{ fontSize: '11px' }}>
                Acabados ({currentProduct.category || 'General'})
              </label>
              <select
                className="pos-select"
                value={finishingType}
                onChange={(e) => setFinishingType(e.target.value)}
                style={{ fontSize: '12px', padding: '6px 8px' }}
              >
                {availableFinishings.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {finishingType.includes('ojales') && (
              <div>
                <label className="pos-label" style={{ fontSize: '11px' }}>Núm. Ojales</label>
                <input
                  type="number"
                  min="2"
                  max="100"
                  step="1"
                  className="pos-input"
                  value={eyeletCount}
                  onChange={(e) => setEyeletCount(Math.max(2, parseInt(e.target.value, 10) || 4))}
                  style={{ fontSize: '13px', padding: '6px 8px', fontWeight: 700, textAlign: 'center' }}
                />
              </div>
            )}
          </div>

          {/* Row 2: Design Services & Installation Services */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', background: '#fff', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <div>
              <label className="pos-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🎨 Servicio de Diseño Gráfico
              </label>
              <select
                className="pos-select"
                value={designService}
                onChange={(e) => setDesignService(e.target.value)}
                style={{ fontSize: '12px', padding: '6px 8px' }}
              >
                <option value="none">✓ Arte listo por el cliente ($0.00)</option>
                <option value="adaptation">📐 Adaptación / Ajuste de medidas (+$5.00)</option>
                <option value="scratch">✨ Diseño profesional desde cero (+$15.00)</option>
              </select>
            </div>

            <div>
              <label className="pos-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🔨 Instalación / Montaje en Sitio
              </label>
              <select
                className="pos-select"
                value={installationService}
                onChange={(e) => setInstallationService(e.target.value)}
                style={{ fontSize: '12px', padding: '6px 8px' }}
              >
                <option value="none">✓ Sin instalación / Retiro en matriz ($0.00)</option>
                <option value="standard">🚚 Instalación estándar en sitio (+$15.00)</option>
                <option value="height">🪜 Instalación en altura / Andamio (+$30.00)</option>
                <option value="custom">⚙️ Montaje especial personalizado ($)</option>
              </select>
            </div>

            {installationService === 'custom' && (
              <div>
                <label className="pos-label" style={{ fontSize: '11px' }}>Costo Montaje ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pos-input"
                  value={customInstallationCost}
                  onChange={(e) => setCustomInstallationCost(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 8px', fontWeight: 800 }}
                />
              </div>
            )}
          </div>

          {/* Row 3: Technical Line-Item Notes */}
          <div>
            <input
              type="text"
              className="pos-input"
              placeholder="✏️ Nota técnica para el taller (ej. Dejar 5cm blanco para bastidor, ojales cada 50cm, etc.)"
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              style={{ fontSize: '11.5px', padding: '7px 10px', background: '#fff' }}
            />
          </div>

          {/* Row 4: Commercial Price Override Engine (Asesora Custom Price) */}
          <div style={{
            background: calculated.isOverridden ? '#fffbeb' : '#f8fafc',
            border: calculated.isOverridden ? '1.5px solid #f59e0b' : '1px solid var(--line)',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            transition: 'all 0.2s ease'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Tarifa Calculada por Sistema:
                </span>
                <strong style={{ fontSize: '13px', color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
                  ${calculated.systemCalculatedTotal.toFixed(2)}
                </strong>
              </div>
              {calculated.isOverridden ? (
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: calculated.priceAdjustment >= 0 ? '#b45309' : '#dc2626', marginTop: '3px' }}>
                  ✏️ Precio Asignado para esta venta: <strong>${calculated.finalItemPrice.toFixed(2)}</strong> ({calculated.priceAdjustment >= 0 ? `+$${calculated.priceAdjustment.toFixed(2)} ajuste comercial` : `-$${Math.abs(calculated.priceAdjustment).toFixed(2)} descuento especial`})
                </div>
              ) : (
                <span style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                  ¿El trabajo requiere revisiones extra o acuerdo especial? Personaliza el precio aquí abajo sin alterar la base de datos.
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', margin: 0 }}>
                ✏️ Precio Personalizado ($):
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={`$${calculated.systemCalculatedTotal.toFixed(2)}`}
                className="pos-input"
                value={customPriceOverride}
                onChange={(e) => setCustomPriceOverride(e.target.value)}
                style={{
                  width: '110px',
                  padding: '6px 8px',
                  fontSize: '13px',
                  fontWeight: 900,
                  color: calculated.isOverridden ? '#b45309' : 'var(--ink)',
                  borderColor: calculated.isOverridden ? '#f59e0b' : 'var(--line)',
                  background: '#ffffff'
                }}
              />
              {calculated.isOverridden && (
                <button
                  type="button"
                  onClick={() => setCustomPriceOverride('')}
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    color: '#b45309',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                  title="Restablecer al cálculo automático del sistema"
                >
                  ↺ Sistema
                </button>
              )}
            </div>
          </div>

          {/* Result Bar & Add Button */}
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '12px 14px',
            border: '1.5px solid var(--line)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'grid',
            gap: '10px'
          }}>
            {/* Detailed breakdown chips */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11.5px', color: 'var(--muted)', flexWrap: 'wrap' }}>
              {currentProduct.calcType === 'area' && (
                <span style={{ background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                  <strong>Área:</strong> {calculated.areaM2} m²
                </span>
              )}
              <span style={{ background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                <strong>Base:</strong> {money(calculated.baseItemSubtotal)}
              </span>
              {calculated.finishingSubtotal > 0 && (
                <span style={{ background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                  <strong>Acabados:</strong> +{money(calculated.finishingSubtotal)}
                </span>
              )}
              {calculated.designCost > 0 && (
                <span style={{ background: '#eff6ff', color: '#1e40af', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                  <strong>Diseño:</strong> +{money(calculated.designCost)}
                </span>
              )}
              {calculated.installationCost > 0 && (
                <span style={{ background: '#ecfeff', color: '#0891b2', padding: '3px 8px', borderRadius: '6px', border: '1px solid #a5f3fc' }}>
                  <strong>Montaje:</strong> +{money(calculated.installationCost)}
                </span>
              )}
            </div>

            {/* Primary Total & Action Button Row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              borderTop: '1px solid var(--line)',
              paddingTop: '8px'
            }}>
              <div>
                <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>
                  Total a Cobrar
                </span>
                <span style={{ fontSize: '19px', fontWeight: 900, color: 'var(--orange-dark)', fontFamily: 'Space Grotesk' }}>
                  {money(calculated.totalItemPrice)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                style={{
                  background: 'var(--orange)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '9px 20px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow: '0 3px 10px rgba(234, 88, 12, 0.3)'
                }}
              >
                <Plus size={16} /> Agregar al Carrito (↵)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
