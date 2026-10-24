import React, { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Sparkles, Check, ChevronDown, ChevronUp, Search, X, Plus, Minus,
  ArrowRight, MessageCircle, Clock, FileCheck, FileText, Download,
  Truck, AlertCircle, HelpCircle, ShieldCheck
} from 'lucide-react';
import { useSite } from '../../store';
import { assetPath, money } from '../../data';
import {
  calculateCatalogQuote,
  getProductCalcType,
  getPriceTiers,
  getVariantOptions,
  getParentCategory
} from '../../catalog';
import { QuoteRequestDialog } from '../../components/QuoteRequestDialog';
import { QuoteCanvas2D } from './components/QuoteCanvas2D';
import { ArtworkUploader } from './components/ArtworkUploader';
import { QuoteFinishingModal, FinishingHelpButton } from './components/QuoteFinishingTooltips';
import { DeliverySpeedSelector, DELIVERY_SPEEDS } from './components/DeliverySpeedSelector';
import { generateQuotePDF } from '../../lib/quotePDF';

export const SHIPPING_OPTIONS = [
  { id: 'pickup', name: 'Retiro en Matriz Milagro', price: 0, desc: 'Listo en nuestro local principal sin costo.' },
  { id: 'milagro', name: 'Envío local Milagro', price: 2.50, desc: 'Motorizado directo a tu domicilio o negocio.' },
  { id: 'guayas', name: 'Envío Guayas (Guayaquil, Durán, Samborondón)', price: 5.00, desc: 'Transporte intercantonal seguro.' },
  { id: 'nacional', name: 'Envío Nacional (Servientrega)', price: 8.00, desc: 'A cualquier provincia del Ecuador.' },
];

export function SmartQuotePage() {
  const { data, addToCart } = useSite();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') || 'medidas';
  const initialCategory = searchParams.get('categoria') || 'Todos';

  const [mode, setMode] = useState(initialMode);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Unit of measure toggle: 'cm' vs 'm'
  const [unitMode, setUnitMode] = useState('cm');
  const [widthCm, setWidthCm] = useState(100);
  const [heightCm, setHeightCm] = useState(100);
  const [quantity, setQuantity] = useState(1);

  const [designLevel, setDesignLevel] = useState('none');
  const [artwork, setArtwork] = useState(null);
  const [finishing, setFinishing] = useState('none'); // 'none' | 'corte_al_ras' | 'small' | 'large' | 'bolsillo'
  const [eyeletPreset, setEyeletPreset] = useState('corners'); // 'corners' | 'every50' | 'every30' | 'custom'
  const [customEyelets, setCustomEyelets] = useState(4);
  const [installation, setInstallation] = useState(false);
  const [deliverySpeed, setDeliverySpeed] = useState('standard');
  const [shippingOption, setShippingOption] = useState('pickup');
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [finishingModalOpen, setFinishingModalOpen] = useState(false);

  const calcSettings = data.calculatorSettings || {
    taxRate: 15,
    designAdaptationPrice: 5,
    designFromScratchPrice: 15,
    eyeletSmallPrice: 0.30,
    eyeletLargePrice: 0.50,
    disclaimer: 'Los valores son referenciales y se confirman con especificaciones y arte final.'
  };

  const areaProducts = useMemo(() => data.products.filter((p) => getProductCalcType(p) === 'm2'), [data.products]);
  const lotProducts = useMemo(() => data.products.filter((p) => p.pricingMode === 'tier-total'), [data.products]);
  const unitProducts = useMemo(() => data.products.filter((p) => getProductCalcType(p) !== 'm2' && p.pricingMode !== 'tier-total'), [data.products]);

  const sourceProducts = mode === 'medidas' ? areaProducts : mode === 'lotes' ? lotProducts : unitProducts;

  const filteredProducts = sourceProducts.filter((product) => {
    const parent = getParentCategory(product.category);
    const matchCategory = categoryFilter === 'Todos' || product.category === categoryFilter || parent === categoryFilter ||
      (categoryFilter === 'Gran formato' && /lona|vinil|microperforado|banner/i.test(`${product.category} ${product.name}`)) ||
      (categoryFilter === 'Textil' && /camiseta|polo|body|sublimacion|dtf/i.test(`${product.category} ${product.name}`)) ||
      (categoryFilter === 'Imprenta' && /imprenta|tarjeta|volante|factura|carpeta|credencial/i.test(`${product.category} ${product.name}`)) ||
      (categoryFilter === 'Promocionales' && /taza|souvenir|gorra|almohada|bolso|mochila/i.test(`${product.category} ${product.name}`)) ||
      (categoryFilter === 'Rótulos' && /rotulo|letrero|neon|luminoso|acrilico|laser|placa/i.test(`${product.category} ${product.name}`));
    const matchSearch = `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const selectedProduct = sourceProducts.find((p) => p.id === selectedId) || filteredProducts[0] || sourceProducts[0] || data.products[0];
  const variantOptions = getVariantOptions(selectedProduct);
  const safeSelection = variantOptions.reduce((result, option) => {
    const selected = selection[option.key];
    result[option.key] = option.values?.some((value) => value.value === selected) ? selected : option.values?.[0]?.value;
    return result;
  }, {});

  const isArea = getProductCalcType(selectedProduct) === 'm2';
  const minQuantity = Math.max(1, Number(selectedProduct?.minQuantity || 1));
  const effectiveQuantity = Math.max(minQuantity, quantity);
  const tiers = getPriceTiers(selectedProduct, safeSelection);

  // Dynamic eyelet perimeter calculations
  const calculatedPerimeter50 = useMemo(() => {
    const w = Math.max(1, Math.ceil(widthCm / 50));
    const h = Math.max(1, Math.ceil(heightCm / 50));
    return Math.max(4, 2 * (w + h));
  }, [widthCm, heightCm]);

  const calculatedPerimeter30 = useMemo(() => {
    const w = Math.max(1, Math.ceil(widthCm / 30));
    const h = Math.max(1, Math.ceil(heightCm / 30));
    return Math.max(4, 2 * (w + h));
  }, [widthCm, heightCm]);

  const effectiveEyeletCount = useMemo(() => {
    if (finishing === 'none' || finishing === 'corte_al_ras' || finishing === 'bolsillo') return 0;
    if (eyeletPreset === 'corners') return 4;
    if (eyeletPreset === 'every50') return calculatedPerimeter50;
    if (eyeletPreset === 'every30') return calculatedPerimeter30;
    return Math.max(1, Number(customEyelets) || 1);
  }, [finishing, eyeletPreset, calculatedPerimeter50, calculatedPerimeter30, customEyelets]);

  const eyeletUnitPrice = finishing === 'small' ? Number(calcSettings.eyeletSmallPrice || 0.30) : finishing === 'large' ? Number(calcSettings.eyeletLargePrice || 0.50) : 0;
  const finishingCostPerPiece = finishing === 'bolsillo' ? 4.0 : finishing === 'corte_al_ras' ? 1.0 : (effectiveEyeletCount * eyeletUnitPrice);
  const finishingCost = isArea ? finishingCostPerPiece * effectiveQuantity : 0;
  const totalEyeletsAllPieces = effectiveEyeletCount * effectiveQuantity;

  // 2D Canvas dynamic grommets positioning
  const canvasGrommets = useMemo(() => {
    if (finishing !== 'small' && finishing !== 'large') return [];
    if (effectiveEyeletCount === 4) {
      return [
        { key: 'tl', className: 'top-left' },
        { key: 'tr', className: 'top-right' },
        { key: 'bl', className: 'bottom-left' },
        { key: 'br', className: 'bottom-right' }
      ];
    }
    const list: Array<{ key: string; className: string; style?: React.CSSProperties }> = [
      { key: 'tl', className: 'top-left' },
      { key: 'tr', className: 'top-right' },
      { key: 'bl', className: 'bottom-left' },
      { key: 'br', className: 'bottom-right' }
    ];
    const remaining = Math.max(0, effectiveEyeletCount - 4);
    const horizEach = Math.max(0, Math.round((remaining * (widthCm / Math.max(1, widthCm + heightCm))) / 2));
    const vertEach = Math.max(0, Math.round((remaining - (horizEach * 2)) / 2));

    for (let i = 1; i <= horizEach; i++) {
      const pct = (i / (horizEach + 1)) * 100;
      list.push({ key: `t-${i}`, className: '', style: { top: '7px', left: `${pct}%`, transform: 'translateX(-50%)' } });
      list.push({ key: `b-${i}`, className: '', style: { bottom: '7px', left: `${pct}%`, transform: 'translateX(-50%)' } });
    }
    for (let j = 1; j <= vertEach; j++) {
      const pct = (j / (vertEach + 1)) * 100;
      list.push({ key: `l-${j}`, className: '', style: { top: `${pct}%`, left: '7px', transform: 'translateY(-50%)' } });
      list.push({ key: `r-${j}`, className: '', style: { top: `${pct}%`, right: '7px', transform: 'translateY(-50%)' } });
    }
    return list;
  }, [finishing, effectiveEyeletCount, widthCm, heightCm]);

  const designCost = designLevel === 'adaptation'
    ? Number(calcSettings.designAdaptationPrice || 5)
    : designLevel === 'full'
      ? Number(calcSettings.designFromScratchPrice || 15)
      : 0;

  const installationCost = installation && isArea && selectedProduct?.price_inst
    ? Math.max(0, (Number(selectedProduct.price_inst) - Number(selectedProduct.price || 0)) * ((widthCm / 100) * (heightCm / 100)) * effectiveQuantity)
    : 0;

  // Selected Shipping Cost
  const activeShipping = SHIPPING_OPTIONS.find((s) => s.id === shippingOption) || SHIPPING_OPTIONS[0];
  const shippingCost = activeShipping.price;

  const extrasList = [];
  if (finishingCost > 0) extrasList.push({ price: finishingCost, name: 'Acabados' });
  if (installationCost > 0) extrasList.push({ price: installationCost, name: 'Instalación' });
  if (shippingCost > 0) extrasList.push({ price: shippingCost, name: `Envío (${activeShipping.name})` });

  // Urgency Surcharge calculation
  const selectedSpeedObj = DELIVERY_SPEEDS.find((s) => s.id === deliverySpeed) || DELIVERY_SPEEDS[0];

  const baseQuote = calculateCatalogQuote(selectedProduct, {
    width: widthCm / 100,
    height: heightCm / 100,
    quantity: effectiveQuantity,
    options: safeSelection,
    taxRate: Number(calcSettings.taxRate) || 15,
    designCost,
    extras: extrasList
  });

  // Calculate urgency surcharge on production subtotal
  const urgencySurcharge = (baseQuote.material * selectedSpeedObj.surchargePercent) / 100;
  if (urgencySurcharge > 0) {
    extrasList.push({ price: urgencySurcharge, name: `Recargo por urgencia (${selectedSpeedObj.label})` });
  }

  // Recalculate full quote with all extras and taxes
  const quote = calculateCatalogQuote(selectedProduct, {
    width: widthCm / 100,
    height: heightCm / 100,
    quantity: effectiveQuantity,
    options: safeSelection,
    taxRate: Number(calcSettings.taxRate) || 15,
    designCost,
    extras: extrasList
  });

  const activeTier = quote.tier;
  const allSelectionLabels = [
    selection.sustrato ? `Sustrato: ${selection.sustrato}` : '',
    ...Object.values(safeSelection).filter(Boolean)
  ].filter(Boolean);
  const selectionText = allSelectionLabels.join(' · ');

  // Next Volume Discount Tier Calculation (for progress bar)
  const nextTierInfo = useMemo(() => {
    if (!isArea || tiers.length <= 1) return null;
    const totalArea = (widthCm / 100) * (heightCm / 100) * effectiveQuantity;
    const higherTiers = tiers.filter((t) => Number(t.qty) > totalArea).sort((a, b) => Number(a.qty) - Number(b.qty));
    if (higherTiers.length === 0) return null;
    const next = higherTiers[0];
    const needed = (Number(next.qty) - totalArea).toFixed(2);
    const pct = Math.min(100, Math.round((totalArea / Number(next.qty)) * 100));
    return {
      targetQty: next.qty,
      targetPrice: next.price,
      neededArea: needed,
      progressPercent: pct
    };
  }, [isArea, tiers, widthCm, heightCm, effectiveQuantity]);

  // Roll size limit detection
  const rollLimitWarning = useMemo(() => {
    if (!isArea) return null;
    const isVinyl = /vinil|adhesivo/i.test(`${selectedProduct?.category} ${selectedProduct?.name}`);
    const isLona = /lona|banner|mesh/i.test(`${selectedProduct?.category} ${selectedProduct?.name}`);
    const minDim = Math.min(widthCm, heightCm);

    if (isLona && minDim > 320) {
      return 'Esta medida supera el ancho máximo de bobina (3.20m). Se fabricará con unión termosellada industrial de alta resistencia.';
    }
    if (isVinyl && minDim > 150) {
      return 'Esta medida supera el ancho de bobina de vinil (1.50m). Se entregará con paneles traslapados de 1.5 cm para instalación continua.';
    }
    return null;
  }, [isArea, widthCm, heightCm, selectedProduct]);

  const chooseMode = (nextMode) => {
    setMode(nextMode);
    setSearch('');
    setSelectedId('');
    setCategoryFilter('Todos');
    setSelection({});
    setFinishing('none');
    setEyeletPreset('corners');
    setCustomEyelets(4);
    setInstallation(false);
    setDesignLevel('none');
    setArtwork(null);
    setIsDropdownOpen(false);
    setQuantity(nextMode === 'medidas' ? 1 : nextMode === 'lotes' ? 1000 : 12);
  };

  const chooseProduct = (product) => {
    setSelectedId(product.id);
    setSelection({});
    setQuantity(Math.max(1, Number(product.minQuantity || 1), mode === 'lotes' ? 1000 : mode === 'unidades' ? 12 : 1));
    setDesignLevel('none');
    setArtwork(null);
    setFinishing('none');
    setEyeletPreset('corners');
    setCustomEyelets(4);
    setInstallation(false);
    setIsDropdownOpen(false);
  };

  const setDimensionPreset = (w, h) => {
    setWidthCm(w);
    setHeightCm(h);
  };

  const readableDimensions = isArea
    ? `${widthCm} × ${heightCm} cm (${quote.area.toFixed(2)} m²)`
    : `${effectiveQuantity} ${selectedProduct?.pricingMode === 'tier-total' ? 'unidades (lote)' : selectedProduct?.unit || 'unidades'}`;

  const readableDesign = designLevel === 'adaptation'
    ? 'Adaptación / Ajuste de medidas'
    : designLevel === 'full'
      ? 'Diseño profesional desde cero'
      : artwork
        ? `Arte listo adjunto: ${artwork.name}`
        : 'Arte listo del cliente';

  const readableFinishing = finishing === 'bolsillo'
    ? 'Bolsillo para tubo'
    : finishing === 'corte_al_ras'
      ? 'Corte al ras / Refilado'
      : finishing === 'small'
        ? `${effectiveEyeletCount} ojales pequeños ($${eyeletUnitPrice.toFixed(2)} c/u)`
        : finishing === 'large'
          ? `${effectiveEyeletCount} ojales grandes ($${eyeletUnitPrice.toFixed(2)} c/u)`
          : 'Estándar con margen blanco';

  const add = () => {
    if (!selectedProduct) return;
    const readableVariant = [
      selectionText,
      readableDimensions,
      designLevel !== 'none' ? readableDesign : (artwork ? `Arte: ${artwork.name}` : ''),
      isArea && finishing !== 'none' ? `Acabado: ${readableFinishing}` : '',
      installation ? 'Instalación incluida' : '',
      deliverySpeed !== 'standard' ? `Tiempo: ${selectedSpeedObj.label}` : '',
      shippingOption !== 'pickup' ? `Envío: ${activeShipping.name}` : ''
    ].filter(Boolean).join(' · ');

    const fingerprint = `${selectedProduct.id}:${JSON.stringify({
      safeSelection,
      sustrato: selection.sustrato || null,
      widthCm: isArea ? widthCm : null,
      heightCm: isArea ? heightCm : null,
      quantity: effectiveQuantity,
      designLevel,
      finishing,
      installation,
      deliverySpeed,
      shippingOption,
      artworkName: artwork?.name || null
    })}`;

    addToCart({
      ...selectedProduct,
      price: quote.total,
      cartId: `quote-${Date.now()}`,
      quantity: 1,
      variant: readableVariant,
      configFingerprint: fingerprint,
      quoteBreakdown: quote,
      artworkUrl: artwork?.remoteUrl || null,
      artworkName: artwork?.name || null
    });
  };

  const quoteRequestItems = selectedProduct ? [{
    productId: selectedProduct.id,
    name: selectedProduct.name,
    category: selectedProduct.category,
    quantity: effectiveQuantity,
    price: quote.rate,
    total: quote.total,
    variant: [
      selectionText,
      readableDimensions,
      readableDesign,
      isArea ? readableFinishing : '',
      installation ? 'Instalación incluida' : '',
      deliverySpeed !== 'standard' ? `Tiempo: ${selectedSpeedObj.label}` : '',
      shippingOption !== 'pickup' ? `Envío: ${activeShipping.name}` : ''
    ].filter(Boolean).join(' · '),
    quoteBreakdown: quote,
    artworkUrl: artwork?.remoteUrl || null,
    artworkName: artwork?.name || null
  }] : [];

  const handleDownloadPDF = () => {
    generateQuotePDF({
      client: {
        name: 'Cliente Cotizador Web',
        city: 'Milagro / Guayas',
        company: 'Cotización B2B'
      },
      items: quoteRequestItems,
      totals: {
        subtotal: quote.subtotal,
        taxAmount: quote.tax,
        total: quote.total
      },
      deliverySpeed,
      shippingOption: activeShipping
    });
  };

  return (
    <div className="smart-quote-page-container">
      <section className="inner-hero quote-hero">
        <div className="container quote-hero-grid">
          <div>
            <span className="eyebrow orange">Cotizador Inteligente Multivariable</span>
            <h1>Calcula tu proyecto<br /><em>en segundos y con precisión.</em></h1>
            <p>Elige tu producto, define medidas exactas, previsualiza acabados en 2D y descarga tu proforma oficial en PDF.</p>
          </div>
          <div className="quote-badge">
            <span>TARIFA SRI<br /><b>IVA 15%</b></span>
          </div>
        </div>
      </section>

      <section className="section quote-section">
        <div className="container quote-layout">
          <div className="quote-form-card">
            {/* Mode Switcher */}
            <div className="mode-toggle three-cols">
              <button
                type="button"
                className={mode === 'medidas' ? 'active' : ''}
                onClick={() => chooseMode('medidas')}
              >
                📐 Por medidas (m²)
              </button>
              <button
                type="button"
                className={mode === 'unidades' ? 'active' : ''}
                onClick={() => chooseMode('unidades')}
              >
                👕 Por volumen / unidades
              </button>
              <button
                type="button"
                className={mode === 'lotes' ? 'active' : ''}
                onClick={() => chooseMode('lotes')}
              >
                📦 Por lotes / imprenta
              </button>
            </div>

            {/* Step 1: Product Selection */}
            <div className="quote-step">
              <span>01</span>
              <div className="step-content">
                <div className="step-heading">
                  <div>
                    <h3>Producto base del cotizador</h3>
                    <p>
                      {mode === 'medidas'
                        ? 'Lonas, viniles, rótulos y displays calculados por metro cuadrado.'
                        : mode === 'lotes'
                          ? 'Papelería, tarjetas, volantes, carpetas y fundas por millar.'
                          : 'Textiles, gorras, tazas, souvenirs y productos con escala por volumen.'}
                    </p>
                  </div>
                </div>

                <div className="smart-product-selector">
                  {/* Selected Product Showcase Card */}
                  {selectedProduct && (
                    <div className="selected-product-showcase">
                      <div className="showcase-media">
                        <img src={assetPath(selectedProduct.image)} alt={selectedProduct.name} />
                        <span className="showcase-badge">
                          {isArea ? 'Por m²' : selectedProduct.pricingMode === 'tier-total' ? 'Por lote' : 'Por volumen'}
                        </span>
                      </div>
                      <div className="showcase-info">
                        <div className="showcase-header">
                          <span className="showcase-category">{selectedProduct.category}</span>
                        </div>
                        <h4 className="showcase-title">{selectedProduct.name}</h4>
                        <p className="showcase-desc">{selectedProduct.description}</p>
                        <div className="showcase-meta">
                          <span className="showcase-price-tag">
                            Desde {money(selectedProduct.price)} <small>/ {selectedProduct.unit}</small>
                          </span>
                          {selectedProduct.specs?.slice(0, 2).map((spec, i) => (
                            <span key={i} className="showcase-spec-pill">{spec}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="showcase-change-btn"
                        onClick={() => setIsDropdownOpen((prev) => !prev)}
                        aria-expanded={isDropdownOpen}
                      >
                        {isDropdownOpen ? (
                          <>Cerrar lista <ChevronUp size={15} /></>
                        ) : (
                          <>Cambiar producto <ChevronDown size={15} /></>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Smart Dropdown Panel / Search Combobox */}
                  {isDropdownOpen && (
                    <div className="smart-dropdown-panel">
                      <div className="dropdown-header-bar">
                        <h4>Selecciona un producto del catálogo ({filteredProducts.length})</h4>
                        <button
                          type="button"
                          className="dropdown-close-btn"
                          onClick={() => setIsDropdownOpen(false)}
                          aria-label="Cerrar lista"
                        >
                          <X size={17} />
                        </button>
                      </div>

                      {/* Category Pills Filter */}
                      <div className="quote-category-pills">
                        {['Todos', 'Gran formato', 'Textil', 'Imprenta', 'Promocionales', 'Rótulos'].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={categoryFilter === cat ? 'active' : ''}
                            onClick={() => setCategoryFilter(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Live Search Input */}
                      <div className="dropdown-search-wrap">
                        <Search size={16} />
                        <input
                          autoFocus
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Buscar producto por nombre o material..."
                          className="dropdown-search-input"
                        />
                        {search && (
                          <button
                            type="button"
                            className="dropdown-search-clear"
                            onClick={() => setSearch('')}
                            aria-label="Limpiar búsqueda"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Compact Scrollable List */}
                      <div className="dropdown-items-scroll">
                        {filteredProducts.map((product) => {
                          const isSelected = selectedProduct?.id === product.id;
                          return (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => chooseProduct(product)}
                              className={`dropdown-item-row ${isSelected ? 'active' : ''}`}
                            >
                              <img className="dropdown-item-thumb" src={assetPath(product.image)} alt="" />
                              <div className="dropdown-item-info">
                                <span className="dropdown-item-title">{product.name}</span>
                                <span className="dropdown-item-cat">{product.category}</span>
                              </div>
                              <div className="dropdown-item-right">
                                <span className="dropdown-item-price">Desde {money(product.price)}</span>
                                {isSelected && <Check size={16} className="dropdown-item-check" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2: Variant Selection */}
            {selectedProduct && variantOptions.length > 0 && (
              <div className="quote-step">
                <span>02</span>
                <div className="step-content">
                  <h3>Especificaciones y sustrato</h3>
                  {variantOptions.map((option) => (
                    <label className="quote-option" key={option.key}>
                      <span>{option.label}</span>
                      <select
                        value={safeSelection[option.key] || ''}
                        onChange={(event) => setSelection((current) => ({ ...current, [option.key]: event.target.value }))}
                      >
                        {option.values?.map((value) => (
                          <option key={value.id} value={value.value}>{value.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Dimensions / Quantity / Tiers */}
            {isArea ? (
              <div className="quote-step">
                <span>{variantOptions.length ? '03' : '02'}</span>
                <div className="step-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Define las medidas exactas</h3>
                    {/* Unit Switcher cm <-> metros */}
                    <div className="unit-toggle-pill">
                      <button
                        type="button"
                        className={unitMode === 'cm' ? 'active' : ''}
                        onClick={() => setUnitMode('cm')}
                      >
                        Centímetros (cm)
                      </button>
                      <button
                        type="button"
                        className={unitMode === 'm' ? 'active' : ''}
                        onClick={() => setUnitMode('m')}
                      >
                        Metros (m)
                      </button>
                    </div>
                  </div>

                  <div className="dimension-presets">
                    <span>Tamaños sugeridos:</span>
                    <button type="button" className="preset-chip" onClick={() => setDimensionPreset(100, 100)}>1.0 × 1.0 m</button>
                    <button type="button" className="preset-chip" onClick={() => setDimensionPreset(200, 100)}>2.0 × 1.0 m</button>
                    <button type="button" className="preset-chip" onClick={() => setDimensionPreset(300, 100)}>3.0 × 1.0 m</button>
                    <button type="button" className="preset-chip" onClick={() => setDimensionPreset(200, 200)}>2.0 × 2.0 m</button>
                    <button type="button" className="preset-chip" onClick={() => setDimensionPreset(400, 150)}>4.0 × 1.5 m</button>
                  </div>

                  <div className="fields two">
                    <label>
                      Ancho ({unitMode})
                      <input
                        type="number"
                        step={unitMode === 'm' ? '0.05' : '1'}
                        min={unitMode === 'm' ? '0.1' : '10'}
                        value={unitMode === 'm' ? (widthCm / 100).toFixed(2) : widthCm}
                        onChange={(event) => {
                          const val = parseFloat(event.target.value) || 0;
                          setWidthCm(Math.max(1, unitMode === 'm' ? Math.round(val * 100) : Math.round(val)));
                        }}
                      />
                    </label>
                    <label>
                      Alto ({unitMode})
                      <input
                        type="number"
                        step={unitMode === 'm' ? '0.05' : '1'}
                        min={unitMode === 'm' ? '0.1' : '10'}
                        value={unitMode === 'm' ? (heightCm / 100).toFixed(2) : heightCm}
                        onChange={(event) => {
                          const val = parseFloat(event.target.value) || 0;
                          setHeightCm(Math.max(1, unitMode === 'm' ? Math.round(val * 100) : Math.round(val)));
                        }}
                      />
                    </label>
                  </div>

                  {/* Roll limit warning banner */}
                  {rollLimitWarning && (
                    <div className="roll-limit-alert">
                      <AlertCircle size={15} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                      <span>{rollLimitWarning}</span>
                    </div>
                  )}

                  <div className="quote-insight">
                    <span>Área calculada</span>
                    <strong>{quote.area.toFixed(2)} m² <small>por pieza</small></strong>
                    <small>Área total del pedido: {(quote.area * effectiveQuantity).toFixed(2)} m² · Tarifa activa: {money(activeTier.price)} / m²</small>
                  </div>

                  {/* Volume Discount Progress Bar */}
                  {nextTierInfo && (
                    <div className="volume-discount-progress-card">
                      <div className="progress-head">
                        <span>
                          <Sparkles size={13} style={{ color: 'var(--orange)' }} />
                          Siguiente escala: <strong>{money(nextTierInfo.targetPrice)} / m²</strong>
                        </span>
                        <small>Te faltan {nextTierInfo.neededArea} m² para alcanzarla</small>
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${nextTierInfo.progressPercent}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="smart-quantity-controller">
                    <div className="quantity-controller-head">
                      <label>Cantidad de piezas</label>
                      <span>Área total: {(quote.area * effectiveQuantity).toFixed(2)} m²</span>
                    </div>

                    <div className="quantity-stepper-row">
                      <div className="quantity-stepper-box">
                        <button
                          type="button"
                          className="quantity-stepper-btn"
                          onClick={() => setQuantity(Math.max(minQuantity, effectiveQuantity - 1))}
                          disabled={effectiveQuantity <= minQuantity}
                          aria-label="Disminuir una pieza"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          min={minQuantity}
                          value={effectiveQuantity}
                          onChange={(event) => setQuantity(Math.max(minQuantity, parseInt(event.target.value, 10) || minQuantity))}
                          className="quantity-stepper-input"
                          aria-label="Cantidad exacta de piezas"
                        />
                        <button
                          type="button"
                          className="quantity-stepper-btn"
                          onClick={() => setQuantity(effectiveQuantity + 1)}
                          aria-label="Aumentar una pieza"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <div className="quantity-quick-increments">
                        <button type="button" className="quick-inc-btn" onClick={() => setQuantity(effectiveQuantity + 1)}>+1</button>
                        <button type="button" className="quick-inc-btn" onClick={() => setQuantity(effectiveQuantity + 5)}>+5</button>
                        <button type="button" className="quick-inc-btn" onClick={() => setQuantity(effectiveQuantity + 10)}>+10</button>
                      </div>
                    </div>
                  </div>

                  {/* 2D Proportional Canvas Live Preview Component */}
                  <QuoteCanvas2D
                    widthCm={widthCm}
                    heightCm={heightCm}
                    finishing={finishing}
                    eyeletCount={effectiveEyeletCount}
                    grommets={canvasGrommets}
                    productName={selectedProduct?.name || 'Lona Banner'}
                  />

                  {/* Finishing & Custom Eyelets Options */}
                  {isArea && (/lona|banner|mesh|valla|gran formato/i.test(selectedProduct?.category || '') || /lona|banner|mesh|valla/i.test(selectedProduct?.name || '')) && (
                    <div className="finishing-select-group" style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ margin: 0 }}>Acabados y confección perimetral</label>
                        <FinishingHelpButton onClick={() => setFinishingModalOpen(true)} />
                      </div>

                      <div className="design-options-grid">
                        <label className={`design-option-card ${finishing === 'none' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="finishing"
                            checked={finishing === 'none'}
                            onChange={() => setFinishing('none')}
                          />
                          <div className="design-option-copy">
                            <b>Estándar / Con margen blanco</b>
                            <small>Demasía para tensar o montar en bastidor.</small>
                          </div>
                          <span className="design-option-price">$0</span>
                        </label>

                        <label className={`design-option-card ${finishing === 'corte_al_ras' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="finishing"
                            checked={finishing === 'corte_al_ras'}
                            onChange={() => setFinishing('corte_al_ras')}
                          />
                          <div className="design-option-copy">
                            <b>Corte al ras (Refilado)</b>
                            <small>Corte recto de precisión al milímetro.</small>
                          </div>
                          <span className="design-option-price">+$1.00</span>
                        </label>

                        <label className={`design-option-card ${finishing === 'small' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="finishing"
                            checked={finishing === 'small'}
                            onChange={() => {
                              setFinishing('small');
                              if (eyeletPreset === 'custom' && customEyelets < 4) setCustomEyelets(4);
                            }}
                          />
                          <div className="design-option-copy">
                            <b>Ojales Pequeños (10 mm)</b>
                            <small>Ojales metálicos estándar para piolas o abrazaderas.</small>
                          </div>
                          <span className="design-option-price">$0.30 c/u</span>
                        </label>

                        <label className={`design-option-card ${finishing === 'large' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="finishing"
                            checked={finishing === 'large'}
                            onChange={() => {
                              setFinishing('large');
                              if (eyeletPreset === 'custom' && customEyelets < 4) setCustomEyelets(4);
                            }}
                          />
                          <div className="design-option-copy">
                            <b>Ojales Grandes Reforzados (15 mm)</b>
                            <small>Para exteriores, tensores y vientos fuertes.</small>
                          </div>
                          <span className="design-option-price">$0.50 c/u</span>
                        </label>

                        <label className={`design-option-card ${finishing === 'bolsillo' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="finishing"
                            checked={finishing === 'bolsillo'}
                            onChange={() => setFinishing('bolsillo')}
                          />
                          <div className="design-option-copy">
                            <b>Bolsillo para tubo</b>
                            <small>Confección superior/inferior para colgar.</small>
                          </div>
                          <span className="design-option-price">+$4.00</span>
                        </label>
                      </div>

                      {/* Interactive Eyelet Presets */}
                      {(finishing === 'small' || finishing === 'large') && (
                        <div className="eyelet-customizer-panel">
                          <div className="eyelet-panel-head">
                            <label>Distribución de Ojales {finishing === 'small' ? '(10 mm)' : '(15 mm)'}</label>
                            <span>{effectiveEyeletCount} ojales por pieza</span>
                          </div>

                          <div className="eyelet-presets-row">
                            <button
                              type="button"
                              className={`eyelet-preset-btn ${eyeletPreset === 'corners' ? 'active' : ''}`}
                              onClick={() => setEyeletPreset('corners')}
                            >
                              4 Esquinas (4 ojales)
                            </button>
                            <button
                              type="button"
                              className={`eyelet-preset-btn ${eyeletPreset === 'every50' ? 'active' : ''}`}
                              onClick={() => setEyeletPreset('every50')}
                            >
                              Perimetral c/50 cm ({calculatedPerimeter50} ojales)
                            </button>
                            <button
                              type="button"
                              className={`eyelet-preset-btn ${eyeletPreset === 'every30' ? 'active' : ''}`}
                              onClick={() => setEyeletPreset('every30')}
                            >
                              Perimetral c/30 cm ({calculatedPerimeter30} ojales)
                            </button>
                            <button
                              type="button"
                              className={`eyelet-preset-btn ${eyeletPreset === 'custom' ? 'active' : ''}`}
                              onClick={() => {
                                setEyeletPreset('custom');
                                setCustomEyelets(effectiveEyeletCount);
                              }}
                            >
                              Personalizado
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Installation Option */}
                  {selectedProduct?.price_inst && (
                    <label className="check-option" style={{ marginTop: '16px' }}>
                      <input
                        type="checkbox"
                        checked={installation}
                        onChange={(event) => setInstallation(event.target.checked)}
                      />
                      <span>
                        <b>Incluir instalación en sitio (Milagro, Guayas y alrededores)</b>
                        <small>Personal técnico calificado realiza el montaje en tu local o estructura.</small>
                      </span>
                    </label>
                  )}
                </div>
              </div>
            ) : mode === 'lotes' ? (
              <div className="quote-step">
                <span>{variantOptions.length ? '03' : '02'}</span>
                <div className="step-content">
                  <h3>Selecciona el tamaño del lote</h3>
                  <p>Precios por paquete cerrado de imprenta. A mayor tiraje, menor costo por unidad.</p>

                  <div className="quote-tiers-grid">
                    {tiers.map((tier) => {
                      const isActive = activeTier.qty === tier.qty;
                      const unitCost = Number(tier.price) / Math.max(1, Number(tier.qty));
                      return (
                        <button
                          key={tier.qty}
                          type="button"
                          className={`tier-card ${isActive ? 'active' : ''}`}
                          onClick={() => setQuantity(Number(tier.qty))}
                        >
                          <div className="tier-card-qty">
                            <strong>{tier.qty}</strong>
                            <span>unidades</span>
                          </div>
                          <div className="tier-card-pricing">
                            <b>{money(tier.price)}</b>
                            <small>{money(unitCost)} c/u</small>
                          </div>
                          {isActive && <span className="tier-badge">Seleccionado</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="quote-step">
                <span>{variantOptions.length ? '03' : '02'}</span>
                <div className="step-content">
                  <h3>Cantidad y escalas de descuento</h3>
                  <p>Escoge o escribe la cantidad deseada. Los descuentos por volumen aplican automáticamente.</p>

                  <div className="smart-quantity-controller">
                    <div className="quantity-controller-head">
                      <label>Cantidad ({selectedProduct?.unit || 'unidades'})</label>
                      <span>Tarifa actual: {money(quote.rate)} / {selectedProduct?.unit || 'u'}</span>
                    </div>

                    <div className="quantity-stepper-row">
                      <div className="quantity-stepper-box">
                        <button
                          type="button"
                          className="quantity-stepper-btn"
                          onClick={() => setQuantity(Math.max(minQuantity, effectiveQuantity - 1))}
                          disabled={effectiveQuantity <= minQuantity}
                          aria-label="Disminuir una unidad"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          min={minQuantity}
                          value={effectiveQuantity}
                          onChange={(event) => setQuantity(Math.max(minQuantity, parseInt(event.target.value, 10) || minQuantity))}
                          className="quantity-stepper-input"
                          aria-label="Cantidad exacta"
                        />
                        <button
                          type="button"
                          className="quantity-stepper-btn"
                          onClick={() => setQuantity(effectiveQuantity + 1)}
                          aria-label="Aumentar una unidad"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <div className="quantity-quick-increments">
                        <button type="button" className="quick-inc-btn" onClick={() => setQuantity(effectiveQuantity + 6)}>+6</button>
                        <button type="button" className="quick-inc-btn" onClick={() => setQuantity(effectiveQuantity + 12)}>+12</button>
                        <button type="button" className="quick-inc-btn" onClick={() => setQuantity(effectiveQuantity + 24)}>+24</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Design & Artwork Ingestion */}
            <div className="quote-step">
              <span>{variantOptions.length ? '04' : '03'}</span>
              <div className="step-content">
                <h3>Servicio de diseño y preparación de archivos</h3>
                <p>Adjunta tu archivo listo o solicita nuestro servicio de diseño profesional.</p>

                <div className="design-options-grid">
                  <label className={`design-option-card ${designLevel === 'none' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="designLevel"
                      checked={designLevel === 'none'}
                      onChange={() => setDesignLevel('none')}
                    />
                    <div className="design-option-copy">
                      <b>Tengo mi arte listo para imprimir</b>
                      <small>Carga tu archivo con verificación automática de resolución (DPI).</small>
                    </div>
                    <span className="design-option-price">$0</span>
                  </label>

                  <label className={`design-option-card ${designLevel === 'adaptation' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="designLevel"
                      checked={designLevel === 'adaptation'}
                      onChange={() => setDesignLevel('adaptation')}
                    />
                    <div className="design-option-copy">
                      <b>Adaptación / Ajuste de medidas</b>
                      <small>Tienes logo e imágenes; nosotros armamos proporciones y sangrías.</small>
                    </div>
                    <span className="design-option-price">+{money(Number(calcSettings.designAdaptationPrice || 5))}</span>
                  </label>

                  <label className={`design-option-card ${designLevel === 'full' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="designLevel"
                      checked={designLevel === 'full'}
                      onChange={() => setDesignLevel('full')}
                    />
                    <div className="design-option-copy">
                      <b>Diseño profesional desde cero</b>
                      <small>Propuesta creativa completa con cambios y bocetos incluidos.</small>
                    </div>
                    <span className="design-option-price">+{money(Number(calcSettings.designFromScratchPrice || 15))}</span>
                  </label>
                </div>

                {/* Upload Component with DPI Preflight Check */}
                {designLevel === 'none' && (
                  <ArtworkUploader
                    widthCm={widthCm}
                    heightCm={heightCm}
                    artwork={artwork}
                    onArtworkChange={setArtwork}
                  />
                )}
              </div>
            </div>

            {/* Step 5: Delivery Speed & Shipping */}
            <div className="quote-step">
              <span>{variantOptions.length ? '05' : '04'}</span>
              <div className="step-content">
                <DeliverySpeedSelector
                  value={deliverySpeed}
                  onChange={setDeliverySpeed}
                  subtotalBase={baseQuote.material}
                />

                <div className="shipping-selector-group" style={{ marginTop: '18px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Truck size={15} style={{ color: 'var(--orange)' }} />
                    <span>Opción de Entrega y Despacho</span>
                  </label>
                  <div className="shipping-options-grid">
                    {SHIPPING_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        className={`shipping-option-card ${shippingOption === opt.id ? 'active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="shippingOption"
                          checked={shippingOption === opt.id}
                          onChange={() => setShippingOption(opt.id)}
                        />
                        <div className="shipping-option-copy">
                          <strong>{opt.name}</strong>
                          <small>{opt.desc}</small>
                        </div>
                        <span className="shipping-option-price">
                          {opt.price === 0 ? 'Gratis' : `+$${opt.price.toFixed(2)}`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Summary Sidebar */}
          <aside className="quote-summary-card">
            <span className="eyebrow orange">Resumen de cotización</span>
            <h2>{money(quote.total)}</h2>
            <p className="summary-tax-note">Precio final con IVA ({quote.taxRate}%) incluido</p>

            <div className="lead-time-badge" style={{ marginBottom: '14px' }}>
              <Clock size={15} /> Producción: <b>{selectedSpeedObj.label}</b>
            </div>

            {quote.savingsPercent > 0 && (
              <div className="savings-banner">
                <Sparkles size={16} /> ¡Ahorras un <b>{quote.savingsPercent}%</b> por escala de volumen!
              </div>
            )}

            <div className="summary-breakdown">
              <div className="summary-row">
                <span>Producto</span>
                <b>{selectedProduct?.name}</b>
              </div>

              {selectionText && (
                <div className="summary-row">
                  <span>Variante</span>
                  <b>{selectionText}</b>
                </div>
              )}

              <div className="summary-row">
                <span>{isArea ? 'Medidas' : 'Cantidad'}</span>
                <b>{readableDimensions}</b>
              </div>

              {isArea && (
                <div className="summary-row">
                  <span>Área total</span>
                  <b>{(quote.area * effectiveQuantity).toFixed(2)} m²</b>
                </div>
              )}

              <div className="summary-row">
                <span>Tarifa unitaria</span>
                <b>{money(quote.rate)} {isArea ? '/ m²' : mode === 'lotes' ? '/ lote' : ` / ${selectedProduct?.unit || 'u'}`}</b>
              </div>
            </div>

            <div className="summary-line">
              <span>Material y producción</span>
              <b>{money(quote.material)}</b>
            </div>

            {designCost > 0 && (
              <div className="summary-line">
                <span>Diseño gráfico</span>
                <b>+{money(designCost)}</b>
              </div>
            )}

            {finishingCost > 0 && (
              <div className="summary-line">
                <span>Acabados</span>
                <b>+{money(finishingCost)}</b>
              </div>
            )}

            {installationCost > 0 && (
              <div className="summary-line">
                <span>Instalación en sitio</span>
                <b>+{money(installationCost)}</b>
              </div>
            )}

            {urgencySurcharge > 0 && (
              <div className="summary-line" style={{ color: 'var(--orange)' }}>
                <span>Urgencia ({selectedSpeedObj.label})</span>
                <b>+{money(urgencySurcharge)}</b>
              </div>
            )}

            {shippingCost > 0 && (
              <div className="summary-line">
                <span>{activeShipping.name}</span>
                <b>+{money(shippingCost)}</b>
              </div>
            )}

            <div className="summary-line" style={{ borderTop: '2px solid rgba(255,255,255,0.2)', marginTop: '8px' }}>
              <span>Subtotal (sin IVA)</span>
              <b>{money(quote.subtotal)}</b>
            </div>

            <div className="summary-line">
              <span>IVA ({quote.taxRate}%)</span>
              <b>{money(quote.tax)}</b>
            </div>

            <div className="summary-note">
              <Check size={15} /> Factura electrónica oficial SRI con desglose completo.
            </div>

            <button
              type="button"
              className="button button-primary full-button"
              onClick={add}
            >
              Agregar al carrito de cotizaciones <ArrowRight size={16} />
            </button>

            <button type="button" className="whatsapp-action-btn" onClick={() => setQuoteDialogOpen(true)}>
              <MessageCircle size={17} /> Cotizar directo por WhatsApp
            </button>

            {/* B2B Proforma PDF Download Button */}
            <button
              type="button"
              className="pdf-download-action-btn"
              onClick={handleDownloadPDF}
              title="Descargar proforma formal en PDF con membrete y validez de 15 días"
            >
              <Download size={16} /> Descargar Proforma en PDF (B2B)
            </button>

            <Link to="/contacto" className="summary-contact">
              ¿Requieres medidas o acabados especiales? <u>Contáctanos</u>
            </Link>
          </aside>
        </div>
      </section>

      {/* Mobile Sticky Bottom Bar */}
      <div className="mobile-quote-sticky-bar">
        <div className="mobile-sticky-info">
          <small>Total con IVA</small>
          <strong>{money(quote.total)}</strong>
          {quote.savingsPercent > 0 && <span className="mobile-savings-tag">-{quote.savingsPercent}%</span>}
        </div>
        <div className="mobile-sticky-actions">
          <button type="button" className="button button-primary compact-btn" onClick={add} title="Agregar al carrito">
            <Plus size={16} /> Carrito
          </button>
          <button type="button" className="whatsapp-sticky-btn" onClick={() => setQuoteDialogOpen(true)} aria-label="Cotizar por WhatsApp">
            <MessageCircle size={18} /> WhatsApp
          </button>
        </div>
      </div>

      {/* Finishing Visual Guide Modal */}
      <QuoteFinishingModal
        open={finishingModalOpen}
        onClose={() => setFinishingModalOpen(false)}
      />

      {/* Quote Request Dialog */}
      <QuoteRequestDialog
        open={quoteDialogOpen}
        onClose={() => setQuoteDialogOpen(false)}
        items={quoteRequestItems}
        totals={{ subtotal: quote.subtotal, taxRate: quote.taxRate, taxAmount: quote.tax, total: quote.total }}
        source="cotizador"
      />
    </div>
  );
}
